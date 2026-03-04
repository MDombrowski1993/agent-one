import { spawn } from 'child_process';
import { CliTool, Config } from '../config/types.js';

export async function launchCLI(
  cli: CliTool,
  workingDir: string,
  roleContext?: string,
  config?: Config
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
        args = roleContext ? [roleContext] : [];
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
