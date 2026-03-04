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

// --- Codex ---
// codex mcp add <server-name> --env VAR=VAL -- <command> [args...]
// Codex only supports stdio servers
function buildCodexAddArgs(options: MCPAddOptions): string[] | null {
  const { name, server } = options;

  if (server.type !== 'stdio') {
    return null; // Codex only supports stdio
  }

  const args: string[] = ['mcp', 'add'];

  if (server.env) {
    for (const [key, value] of Object.entries(server.env)) {
      args.push('--env', `${key}=${value}`);
    }
  }

  args.push(name, '--', server.command);
  if (server.args) {
    args.push(...server.args);
  }

  return args;
}

// --- Gemini ---
// gemini mcp add [-t transport] [-s scope] [-e KEY=VAL] [-H "Header: val"] <name> <commandOrUrl> [args...]
function buildGeminiAddArgs(options: MCPAddOptions): string[] {
  const { name, server, scope } = options;
  const geminiScope = scope === 'local' ? 'project' : scope; // Gemini only has project/user
  const args: string[] = ['mcp', 'add', '-t', server.type, '-s', geminiScope];

  if (server.type === 'stdio') {
    if (server.env) {
      for (const [key, value] of Object.entries(server.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }
    args.push(name, server.command);
    if (server.args) {
      args.push(...server.args);
    }
  } else {
    // http or sse
    if (server.headers) {
      for (const [key, value] of Object.entries(server.headers)) {
        args.push('-H', `${key}: ${value}`);
      }
    }
    args.push(name, server.url);
  }

  return args;
}

function buildGeminiRemoveArgs(name: string, scope: MCPScope): string[] {
  const geminiScope = scope === 'local' ? 'project' : scope;
  return ['mcp', 'remove', '-s', geminiScope, name];
}

export function buildCLIAddCommand(
  cli: CliTool,
  options: MCPAddOptions
): { command: string; args: string[] } | null {
  switch (cli) {
    case 'claude':
      return { command: 'claude', args: buildClaudeAddArgs(options) };
    case 'codex': {
      const args = buildCodexAddArgs(options);
      return args ? { command: 'codex', args } : null;
    }
    case 'gemini':
      return { command: 'gemini', args: buildGeminiAddArgs(options) };
    case 'cursor-agent':
      return null; // Cursor requires manual MCP setup
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
    case 'gemini':
      return { command: 'gemini', args: buildGeminiRemoveArgs(name, scope) };
    case 'codex':
    case 'cursor-agent':
      return null;
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
    case 'gemini':
      return { command: 'gemini', args: ['mcp', 'list'] };
    case 'codex':
    case 'cursor-agent':
      return null;
    default:
      return null;
  }
}

export function isCursorAgent(cli: CliTool): boolean {
  return cli === 'cursor-agent';
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
