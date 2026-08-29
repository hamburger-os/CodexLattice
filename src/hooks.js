import fs from 'node:fs';
import path from 'node:path';

export const HOOK_EVENT = 'UserPromptSubmit';
export const HOOK_MARKER = '--codex-lattice-hook-v1';
export const HOOK_TIMEOUT_SECONDS = 10;
export const HOOK_CONTEXT_LIMIT = 8192;

const RUNTIME_SOURCE_FILES = ['policy.js', 'roles.js', 'coordinator.js', 'hook.js'];

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
    path.join(dir, 'hook'),
    path.join(dir, 'hook.cmd')
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

export function hookCommands(home, version) {
  const dir = hookRuntimeDir(home, version);
  const unixLauncher = path.join(dir, 'hook');
  const windowsLauncher = path.join(dir, 'hook.cmd');
  return {
    command: `${shellQuote(unixLauncher)} ${HOOK_MARKER}`,
    commandWindows: `call ${windowsCommandQuote(windowsLauncher)} ${HOOK_MARKER}`
  };
}

export function managedHookHandler(home, version) {
  return {
    type: 'command',
    ...hookCommands(home, version),
    timeout: HOOK_TIMEOUT_SECONDS,
    statusMessage: 'CodexLattice routing',
    additionalContextLimit: HOOK_CONTEXT_LIMIT
  };
}

export function withManagedHook(document, home, version) {
  const next = withoutManagedHook(document);
  if (!Array.isArray(next.hooks[HOOK_EVENT])) next.hooks[HOOK_EVENT] = [];
  next.hooks[HOOK_EVENT].push({ hooks: [managedHookHandler(home, version)] });
  return next;
}

export function renderHooksDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function hooksDocumentHasUserContent(document) {
  if (Object.values(document?.hooks || {}).some((groups) => Array.isArray(groups) && groups.length)) return true;
  return Object.keys(document || {}).some((key) => key !== 'hooks');
}

function sourceText(name) {
  return fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

function shellLauncher(nodePath, runnerPath) {
  return `#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(runnerPath)} "$@"\n`;
}

function windowsLauncher(nodePath) {
  const escapedNode = String(nodePath).replace(/"/g, '""');
  return `@echo off\r\n"${escapedNode}" "%~dp0hook-runner.js" %*\r\n`;
}

export function hookRuntimeAssets(home, version, { nodePath = process.execPath } = {}) {
  const dir = hookRuntimeDir(home, version);
  const assets = RUNTIME_SOURCE_FILES.map((name) => ({
    filename: name,
    file: path.join(dir, name),
    content: sourceText(name),
    mode: 0o644
  }));
  assets.push(
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
    },
    {
      filename: 'hook',
      file: path.join(dir, 'hook'),
      content: shellLauncher(nodePath, path.join(dir, 'hook-runner.js')),
      mode: 0o755
    },
    {
      filename: 'hook.cmd',
      file: path.join(dir, 'hook.cmd'),
      content: windowsLauncher(nodePath),
      mode: 0o644
    }
  );
  return assets;
}
