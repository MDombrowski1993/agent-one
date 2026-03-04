import { spawn } from 'child_process';
import { CliTool } from '../../config/types.js';
import { MCPServerType, MCPServer } from './types.js';

export type MCPScope = 'local' | 'project' | 'user';

interface MCPAddOptions {
  name: string;
  server: MCPServer;
  scope: MCPScope;
}

function buildClaudeAddArgs(options: MCPAddOptions): string[] {
  const { name, server, scope } = options;
  const args: string[] = ['mcp', 'add', '--transport', server.type, '-s', scope];

  if (server.type === 'stdio') {
    // Add env flags before name
    if (server.env) {
      for (const [key, value] of Object.entries(server.env)) {
        args.push('--env', `${key}=${value}`);
      }
    }
    // Name, then -- separator, then command + args
    args.push(name, '--', server.command);
    if (server.args) {
      args.push(...server.args);
    }
  } else {
    // http or sse — add headers before name
    if (server.headers) {
      for (const [key, value] of Object.entries(server.headers)) {
        args.push('--header', `${key}: ${value}`);
      }
    }
    args.push(name, server.url);
  }

  return args;
}

function buildClaudeRemoveArgs(name: string, scope: MCPScope): string[] {
  return ['mcp', 'remove', name, '-s', scope];
}

export function buildCLIAddCommand(
  cli: CliTool,
  options: MCPAddOptions
): { command: string; args: string[] } | null {
  switch (cli) {
    case 'claude':
      return { command: 'claude', args: buildClaudeAddArgs(options) };
    default:
      return null;
  }
}

export function buildCLIRemoveCommand(
  cli: CliTool,
  name: string,
  scope: MCPScope
): { command: string; args: string[] } | null {
  switch (cli) {
    case 'claude':
      return { command: 'claude', args: buildClaudeRemoveArgs(name, scope) };
    default:
      return null;
  }
}

export function buildCLIListCommand(
  cli: CliTool
): { command: string; args: string[] } | null {
  switch (cli) {
    case 'claude':
      return { command: 'claude', args: ['mcp', 'list'] };
    default:
      return null;
  }
}

export function runCLICommand(
  command: string,
  args: string[],
  cwd: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to run ${command}: ${error.message}`));
    });

    child.on('exit', (code) => {
      resolve(code ?? 0);
    });
  });
}

export function runCLICommandCapture(
  command: string,
  args: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('error', (error) => {
      reject(new Error(`Failed to run ${command}: ${error.message}`));
    });

    child.on('exit', (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}
