import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';
import { Config } from '../../config/types.js';

interface ServerEntry {
  name: string;
  url: string;
  headers: Record<string, string>;
}

export class ForumToolError extends Error {
  constructor(
    message: string,
    readonly tool: string,
    readonly payload?: unknown
  ) {
    super(message);
  }
}

/**
 * Finds the Valhalla MCP server in Claude Code's own config, so the panel reuses the key the
 * forum assistant already uses and never stores one of its own.
 */
async function resolveServer(config: Config): Promise<ServerEntry> {
  const claudeJson = path.join(homedir(), '.claude.json');
  const data = (await fs.readJson(claudeJson).catch(() => ({}))) as {
    mcpServers?: Record<string, { url?: string; headers?: Record<string, string> }>;
    projects?: Record<string, { mcpServers?: Record<string, { url?: string; headers?: Record<string, string> }> }>;
  };
  const scopes = [data.mcpServers ?? {}, data.projects?.[config.projectRoot]?.mcpServers ?? {}];
  const wanted = config.forum?.mcpServer;

  for (const servers of scopes) {
    for (const [name, server] of Object.entries(servers)) {
      if (!server.url) continue;
      const matches = wanted ? name === wanted : /\/api\/v1\/mcp/.test(server.url);
      if (matches) return { name, url: server.url, headers: server.headers ?? {} };
    }
  }

  throw new Error(
    wanted
      ? `MCP server "${wanted}" not found in ~/.claude.json`
      : 'No Valhalla MCP server in ~/.claude.json. Add one with `claude mcp add --scope user ...` (see the forum-assistant README).'
  );
}

export class ForumClient {
  private constructor(private readonly server: ServerEntry) {}

  static async connect(config: Config): Promise<ForumClient> {
    return new ForumClient(await resolveServer(config));
  }

  get serverName(): string {
    return this.server.name;
  }

  /** Runs a Valhalla tool through `execute_tool` and returns its parsed JSON result. */
  async execute<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...this.server.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'execute_tool', arguments: { name: tool, arguments: args } },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new ForumToolError(`${tool}: HTTP ${response.status}`, tool);
    }

    const rpc = (await response.json()) as {
      error?: { message: string };
      result?: { isError?: boolean; content?: { type: string; text: string }[] };
    };
    if (rpc.error) throw new ForumToolError(`${tool}: ${rpc.error.message}`, tool);

    const text = rpc.result?.content?.find((c) => c.type === 'text')?.text ?? '';
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Error results are sometimes plain text
    }

    if (rpc.result?.isError) {
      const message =
        typeof parsed === 'object' && parsed && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : String(text).slice(0, 300);
      throw new ForumToolError(`${tool}: ${message}`, tool, parsed);
    }
    return parsed as T;
  }
}
