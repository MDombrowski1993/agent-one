import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { CliTool, Config } from '../config/types.js';

export interface LaunchOptions {
  /** Continue an earlier conversation: its id, or true for the most recent one in this directory (Claude only) */
  resume?: string | true;
}

/** Hooks that report the session's activity to `a1 panel`; only for a1 sessions (A1_SESSION set). */
function sessionHookSettings(): string[] {
  if (!process.env.A1_SESSION) return [];
  const script = fileURLToPath(new URL('../hooks/session-hook.js', import.meta.url));
  const hook = (event: string) => [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(script)} ${event}` }] }];
  const events = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
  return ['--settings', JSON.stringify({ hooks: Object.fromEntries(events.map((e) => [e, hook(e)])) })];
}

export async function launchCLI(
  cli: CliTool,
  workingDir: string,
  roleContext?: string,
  config?: Config,
  options: LaunchOptions = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];

    switch (cli) {
      case 'cursor-agent':
        command = 'cursor-agent';
        args = roleContext ? [roleContext] : [];
        break;

      case 'claude':
        command = 'claude';
        args = [
          ...sessionHookSettings(),
          ...(options.resume === true ? ['--continue'] : options.resume ? ['--resume', options.resume] : []),
          ...(roleContext ? [roleContext] : []),
        ];
        break;

      case 'codex':
        command = 'codex';
        args = roleContext ? [roleContext] : [];
        break;

      case 'gemini':
        command = 'gemini';
        args = roleContext ? ['-i', roleContext] : [];
        break;

      default:
        return reject(new Error(`Unknown CLI tool: ${cli}`));
    }

    const child = spawn(command, args, {
      cwd: workingDir,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to launch ${cli}: ${error.message}`));
    });

    child.on('exit', (code) => {
      resolve(code ?? 0);
    });
  });
}
