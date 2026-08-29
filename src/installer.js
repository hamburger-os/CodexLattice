import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const START = '# >>> CodexLattice managed block >>>';
const END = '# <<< CodexLattice managed block <<<' ;

const adaptiveBlock = `${START}
# CodexLattice adaptive mode
[agents]
enabled = true
max_concurrent_threads_per_session = 3
default_subagent_model = "gpt-5.6-terra"
default_subagent_reasoning_effort = "medium"

[agents.lattice_explorer]
description = "Bounded repository exploration; return evidence, paths and uncertainty."
config_file = "agents/codex-lattice-explorer.toml"

[agents.lattice_planner]
description = "Plan complex or ambiguous work before implementation."
config_file = "agents/codex-lattice-planner.toml"

[agents.lattice_implementer]
description = "Implement one bounded workstream and validate it."
config_file = "agents/codex-lattice-implementer.toml"

[agents.lattice_reviewer]
description = "Independent correctness, regression and security review."
config_file = "agents/codex-lattice-reviewer.toml"
${END}`;

function withoutManaged(text) {
  const start = text.indexOf(START);
  if (start === -1) return text.trimEnd();
  const end = text.indexOf(END, start);
  if (end === -1) throw new Error('malformed CodexLattice managed block: missing end marker');
  const after = end + END.length;
  const suffix = text.slice(after).replace(/^\r?\n/, '');
  return `${text.slice(0, start)}${suffix}`.trimEnd();
}

function hasAgentsTable(text) {
  return /^\s*\[agents(?:\.|\])/m.test(text);
}

function adaptiveConfig(text) {
  const baseline = withoutManaged(text);
  if (hasAgentsTable(baseline)) {
    throw new Error(
      'existing unmanaged [agents] configuration detected; CodexLattice will not risk creating duplicate TOML tables. ' +
      'Move or merge that configuration manually, then run install adaptive again.'
    );
  }
  return (baseline ? `${baseline}\n\n` : '') + adaptiveBlock + '\n';
}

function passthroughConfig(text) {
  const baseline = withoutManaged(text);
  return baseline ? `${baseline}\n` : '';
}

export function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function writeAgents(home) {
  const agents = path.join(home, 'agents');
  fs.mkdirSync(agents, { recursive: true });
  const srcDir = new URL('../agents/', import.meta.url);
  for (const name of ['explorer', 'planner', 'implementer', 'reviewer']) {
    fs.copyFileSync(new URL(`${name}.toml`, srcDir), path.join(agents, `codex-lattice-${name}.toml`));
  }
}

export function install(mode = 'adaptive') {
  if (!['adaptive', 'single'].includes(mode)) throw new Error('mode must be adaptive or single');
  const home = codexHome();
  fs.mkdirSync(home, { recursive: true });
  const config = path.join(home, 'config.toml');
  const existing = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';
  const backup = path.join(home, `config.toml.codex-lattice-backup-${Date.now()}`);
  if (existing) fs.writeFileSync(backup, existing);
  fs.writeFileSync(config, mode === 'adaptive' ? adaptiveConfig(existing) : passthroughConfig(existing));
  writeAgents(home);
  return { home, config, backup: existing ? backup : null, mode };
}

export function setMode(mode) {
  if (!['adaptive', 'single'].includes(mode)) throw new Error('mode must be adaptive or single');
  const home = codexHome();
  fs.mkdirSync(home, { recursive: true });
  const config = path.join(home, 'config.toml');
  const existing = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';
  fs.writeFileSync(config, mode === 'adaptive' ? adaptiveConfig(existing) : passthroughConfig(existing));
  return { config, mode };
}

export function uninstall() {
  const home = codexHome();
  const config = path.join(home, 'config.toml');
  if (fs.existsSync(config)) fs.writeFileSync(config, passthroughConfig(fs.readFileSync(config, 'utf8')));
  for (const name of ['explorer', 'planner', 'implementer', 'reviewer']) {
    const p = path.join(home, 'agents', `codex-lattice-${name}.toml`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return { home };
}
