import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const HOOK_EVENT = 'UserPromptSubmit';
export const HOOK_MARKER = '--codex-lattice-hook-v1';
export const HOOK_TIMEOUT_SECONDS = 10;
export const HOOK_CONTEXT_LIMIT = 8192;

const RUNTIME_SOURCE_FILES = ['policy.js', 'roles.js', 'coordinator.js', 'hook.js'];
const RUNTIME_MANIFEST = 'runtime-manifest.json';
const BOOTSTRAP_SOURCE = `const fs=require('node:fs');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
(async()=>{
  const manifestPath=process.argv[2];
  const expectedManifestSha=process.argv[3];
  const manifestBytes=fs.readFileSync(manifestPath);
  const manifestSha=crypto.createHash('sha256').update(manifestBytes).digest('hex');
  if(manifestSha!==expectedManifestSha) throw new Error('runtime manifest digest mismatch');
  const manifest=JSON.parse(manifestBytes);
  for(const entry of manifest.files){
    const actual=crypto.createHash('sha256').update(fs.readFileSync(entry.file)).digest('hex');
    if(actual!==entry.sha256) throw new Error('runtime file digest mismatch: '+entry.filename);
  }
  await import(pathToFileURL(manifest.runner).href);
})().catch((error)=>{
  process.stderr.write('codex-lattice hook bootstrap: '+(error&&error.message?error.message:String(error))+'\\n');
  process.stdout.write(JSON.stringify({continue:true})+'\\n');
});`;
const BOOTSTRAP_EVAL = "eval(Buffer.from(process.argv[1],'base64').toString())";
const BOOTSTRAP_BASE64 = Buffer.from(BOOTSTRAP_SOURCE, 'utf8').toString('base64');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hooksPath(home) {
  return path.join(home, 'hooks.json');
}

export function hookRuntimeDir(home, version) {
  return path.join(home, 'codex-lattice', 'runtime', version);
}

export function hookRuntimePaths(home, version) {
  const dir = hookRuntimeDir(home, version);
  return [
    ...RUNTIME_SOURCE_FILES.map((name) => path.join(dir, name)),
    path.join(dir, 'package.json'),
    path.join(dir, 'hook-runner.js'),
    path.join(dir, RUNTIME_MANIFEST)
  ];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function parseHooksDocument(text = '') {
  if (!String(text).trim()) return { hooks: {} };
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot safely extend hooks.json because it is not valid JSON: ${error.message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('cannot safely extend hooks.json because its root must be a JSON object');
  }
  if (document.hooks === undefined) document.hooks = {};
  if (!document.hooks || typeof document.hooks !== 'object' || Array.isArray(document.hooks)) {
    throw new Error('cannot safely extend hooks.json because `hooks` must be a JSON object');
  }
  for (const [event, groups] of Object.entries(document.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`cannot safely extend hooks.json because hooks.${event} must be an array`);
    for (const [groupIndex, group] of groups.entries()) {
      if (!group || typeof group !== 'object' || Array.isArray(group) || !Array.isArray(group.hooks)) {
        throw new Error(`cannot safely extend hooks.json because hooks.${event}[${groupIndex}].hooks must be an array`);
      }
    }
  }
  return document;
}

function handlerHasMarker(handler) {
  if (!handler || typeof handler !== 'object' || handler.type !== 'command') return false;
  return [handler.command, handler.commandWindows, handler.command_windows]
    .filter((value) => typeof value === 'string')
    .some((value) => value.includes(HOOK_MARKER));
}

export function managedHookLocations(document) {
  const locations = [];
  for (const [event, groups] of Object.entries(document?.hooks || {})) {
    for (const [groupIndex, group] of groups.entries()) {
      for (const [handlerIndex, handler] of group.hooks.entries()) {
        if (handlerHasMarker(handler)) locations.push({ event, groupIndex, handlerIndex, handler });
      }
    }
  }
  return locations;
}

export function withoutManagedHook(document) {
  const next = clone(document);
  for (const [event, groups] of Object.entries(next.hooks || {})) {
    const keptGroups = [];
    for (const group of groups) {
      const keptHandlers = group.hooks.filter((handler) => !handlerHasMarker(handler));
      if (keptHandlers.length) keptGroups.push({ ...group, hooks: keptHandlers });
    }
    if (keptGroups.length) next.hooks[event] = keptGroups;
    else delete next.hooks[event];
  }
  return next;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function windowsCommandQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sourceText(name) {
  return fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

export function hookRuntimeBundle(home, version, { nodePath = process.execPath } = {}) {
  const dir = hookRuntimeDir(home, version);
  const executableAssets = RUNTIME_SOURCE_FILES.map((name) => ({
    filename: name,
    file: path.join(dir, name),
    content: sourceText(name),
    mode: 0o644
  }));
  executableAssets.push(
    {
      filename: 'package.json',
      file: path.join(dir, 'package.json'),
      content: `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
      mode: 0o644
    },
    {
      filename: 'hook-runner.js',
      file: path.join(dir, 'hook-runner.js'),
      content: "import { runHookFromStdin } from './hook.js';\nawait runHookFromStdin();\n",
      mode: 0o644
    }
  );

  const manifest = {
    schemaVersion: 1,
    nodeExecutable: nodePath,
    runner: path.join(dir, 'hook-runner.js'),
    files: executableAssets.map((asset) => ({
      filename: asset.filename,
      file: asset.file,
      sha256: digest(asset.content)
    }))
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = path.join(dir, RUNTIME_MANIFEST);
  const manifestSha256 = digest(manifestContent);
  const assets = [
    ...executableAssets,
    {
      filename: RUNTIME_MANIFEST,
      file: manifestPath,
      content: manifestContent,
      mode: 0o644
    }
  ];

  return {
    dir,
    nodeExecutable: nodePath,
    manifestPath,
    manifestSha256,
    assets
  };
}

export function hookRuntimeAssets(home, version, options = {}) {
  return hookRuntimeBundle(home, version, options).assets;
}

export function hookCommands(home, version, runtime = hookRuntimeBundle(home, version)) {
  const args = [
    '-e',
    BOOTSTRAP_EVAL,
    BOOTSTRAP_BASE64,
    runtime.manifestPath,
    runtime.manifestSha256,
    HOOK_MARKER
  ];
  return {
    command: [shellQuote(runtime.nodeExecutable), ...args.map(shellQuote)].join(' '),
    commandWindows: [windowsCommandQuote(runtime.nodeExecutable), ...args.map(windowsCommandQuote)].join(' ')
  };
}

export function managedHookHandler(home, version, runtime = hookRuntimeBundle(home, version)) {
  return {
    type: 'command',
    ...hookCommands(home, version, runtime),
    timeout: HOOK_TIMEOUT_SECONDS,
    statusMessage: 'CodexLattice routing',
    additionalContextLimit: HOOK_CONTEXT_LIMIT
  };
}

export function withManagedHook(document, home, version, runtime = hookRuntimeBundle(home, version)) {
  const next = withoutManagedHook(document);
  if (!Array.isArray(next.hooks[HOOK_EVENT])) next.hooks[HOOK_EVENT] = [];
  next.hooks[HOOK_EVENT].push({ hooks: [managedHookHandler(home, version, runtime)] });
  return next;
}

export function renderHooksDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function hooksDocumentHasUserContent(document) {
  if (Object.values(document?.hooks || {}).some((groups) => Array.isArray(groups) && groups.length)) return true;
  return Object.keys(document || {}).some((key) => key !== 'hooks');
}
