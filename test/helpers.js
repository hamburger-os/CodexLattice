export function supportedCodexRunner(args) {
  const joined = args.join(' ');
  if (joined === '--version') return { status: 0, stdout: 'codex-cli 0.149.1\n', stderr: '' };
  if (joined === 'exec --help') return { status: 0, stdout: 'Usage: codex exec --model <MODEL> -c <key=value> --config <key=value>\n', stderr: '' };
  if (joined === 'features list') return { status: 0, stdout: 'multi_agent_v2 experimental true\n', stderr: '' };
  if (joined === 'debug models --bundled') {
    return { status: 0, stdout: 'gpt-5.6-luna\ngpt-5.6-terra\ngpt-5.6-sol\n', stderr: '' };
  }
  return { status: 1, stdout: '', stderr: `unexpected fake codex args: ${joined}` };
}

export function configRejectingRunner(args) {
  if (args.join(' ') === 'features list') return { status: 2, stdout: '', stderr: 'invalid config' };
  return supportedCodexRunner(args);
}

export function oldCodexRunner(args) {
  if (args.join(' ') === '--version') return { status: 0, stdout: 'codex-cli 0.148.0\n', stderr: '' };
  return supportedCodexRunner(args);
}
