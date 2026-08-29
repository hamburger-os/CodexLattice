import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const START = '# >>> CodexLattice managed block >>>';
const END = '# <<< CodexLattice managed block <<<' ;

const adaptiveBlock = `${START}\n# CodexLattice adaptive mode\n[agents]\nenabled = true\nmax_concurrent_threads_per_session = 3\ndefault_subagent_model = "gpt-5.6-terra"\ndefault_subagent_reasoning_effort = "medium"\n\n[agents.lattice_explorer]\ndescription = "Bounded repository exploration; return evidence, paths and uncertainty."\nconfig_file = "agents/codex-lattice-explorer.toml"\n\n[agents.lattice_planner]\ndescription = "Plan complex or ambiguous work before implementation."\nconfig_file = "agents/codex-lattice-planner.toml"\n\n[agents.lattice_implementer]\ndescription = "Implement one bounded workstream and validate it."\nconfig_file = "agents/codex-lattice-implementer.toml"\n\n[agents.lattice_reviewer]\ndescription = "Independent correctness, regression and security review."\nconfig_file = "agents/codex-lattice-reviewer.toml"\n${END}`;

function managedPattern() {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escape(START)}[\\s\\S]*?${escape(END)}\\n?`, 'm');
}

function withoutManaged(text) {
  return text.replace(managedPattern(), '').trimEnd();
}

function hasAgentsTable(text) {
  return /^\\s*\\[agents(?:\\.|\\])/m.test(text);
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
