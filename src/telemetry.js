import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { codexHome } from './installer.js';
import { POLICY_VERSION } from './policy.js';

const SCHEMA_VERSION = 1;
const DEFAULT_SETTINGS = Object.freeze({ telemetryEnabled: false });

function stateDir() {
  return path.join(codexHome(), 'codex-lattice');
}

export function settingsPath() {
  return path.join(stateDir(), 'settings.json');
}

export function telemetryPath() {
  return process.env.CODEX_LATTICE_TELEMETRY_PATH || path.join(stateDir(), 'telemetry.jsonl');
}

export function readSettings() {
  const p = settingsPath();
  if (!fs.existsSync(p)) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setTelemetry(enabled) {
  fs.mkdirSync(stateDir(), { recursive: true });
  const settings = { ...readSettings(), telemetryEnabled: Boolean(enabled) };
  fs.writeFileSync(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`);
  return telemetryStatus();
}

export function telemetryStatus() {
  const settings = readSettings();
  return {
    enabled: settings.telemetryEnabled,
    path: telemetryPath(),
    privacy: 'local-only; raw task text is never written by CodexLattice telemetry'
  };
}

export function taskIdentity(task = '') {
  return {
    taskHash: crypto.createHash('sha256').update(task).digest('hex').slice(0, 20),
    taskLength: task.length
  };
}

export function appendTelemetry(type, payload = {}) {
  if (!readSettings().telemetryEnabled) return false;
  fs.mkdirSync(stateDir(), { recursive: true });
  const event = {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    timestamp: new Date().toISOString(),
    type,
    ...payload
  };
  fs.appendFileSync(telemetryPath(), `${JSON.stringify(event)}\n`);
  return true;
}

export function readTelemetry(file = telemetryPath()) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`invalid telemetry JSONL at line ${index + 1}: ${error.message}`); }
    });
}

export function summarizeTelemetry(file = telemetryPath()) {
  const events = readTelemetry(file);
  const started = events.filter((e) => e.type === 'run_started');
  const finished = events.filter((e) => e.type === 'run_finished');
  const feedback = events.filter((e) => e.type === 'feedback');
  const routeCounts = {};
  for (const event of started) {
    const route = event.executeRoute ? `${event.executeRoute.model}:${event.executeRoute.effort}` : 'unknown';
    routeCounts[route] = (routeCounts[route] || 0) + 1;
  }
  const elapsed = finished.map((e) => e.elapsedMs).filter((x) => Number.isFinite(x));
  const labels = feedback.reduce((acc, e) => {
    acc[e.label] = (acc[e.label] || 0) + 1;
    return acc;
  }, {});
  return {
    file,
    events: events.length,
    runsStarted: started.length,
    runsFinished: finished.length,
    commandFailures: finished.filter((e) => e.exitCode !== 0).length,
    averageElapsedMs: elapsed.length ? Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length) : null,
    feedbackLabels: labels,
    executeRouteCounts: routeCounts,
    warning: 'Exit code is an execution signal, not a quality label. Use feedback or paired evals for quality calibration.'
  };
}
