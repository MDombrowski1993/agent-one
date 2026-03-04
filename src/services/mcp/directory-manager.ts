import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';
import { Config } from '../../config/types.js';
import { MCPServer, MCPServers, MCPServerEntry } from './types.js';

export function getGlobalMCPDir(): string {
  return path.join(homedir(), '.config', 'a1', 'global-mcp');
}

export function getProjectMCPDir(config: Config): string {
  return path.join(config.aiDirectory, 'mcp');
}

export function getMCPServerPath(
  config: Config | null,
  name: string,
  isGlobal: boolean
): string {
  if (isGlobal) {
    return path.join(getGlobalMCPDir(), name, 'mcp.json');
  }

  if (!config) {
    throw new Error('Config is required for project-level MCP servers');
  }

  return path.join(getProjectMCPDir(config), name, 'mcp.json');
}

export async function loadMCPServer(
  config: Config | null,
  name: string,
  isGlobal: boolean
): Promise<MCPServer | null> {
  const serverPath = getMCPServerPath(config, name, isGlobal);

  if (!(await fs.pathExists(serverPath))) {
    return null;
  }

  try {
    const data = await fs.readFile(serverPath, 'utf-8');
    return JSON.parse(data) as MCPServer;
  } catch (error) {
    throw new Error(`Failed to load MCP server "${name}": ${error}`);
  }
}

async function loadAllMCPServers(
  baseDir: string,
  scope: 'global' | 'project'
): Promise<MCPServerEntry[]> {
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }

  const entries: MCPServerEntry[] = [];
  const dirs = await fs.readdir(baseDir, { withFileTypes: true });

  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const serverPath = path.join(baseDir, dir.name, 'mcp.json');
      if (await fs.pathExists(serverPath)) {
        try {
          const data = await fs.readFile(serverPath, 'utf-8');
          const server = JSON.parse(data) as MCPServer;
          entries.push({
            name: dir.name,
            server,
            scope,
            path: serverPath,
          });
        } catch (error) {
          console.warn(`Warning: Could not read MCP server ${dir.name}: ${error}`);
        }
      }
    }
  }

  return entries;
}

export async function saveMCPServer(
  config: Config | null,
  name: string,
  server: MCPServer,
  isGlobal: boolean
): Promise<void> {
  const serverPath = getMCPServerPath(config, name, isGlobal);
  await fs.ensureDir(path.dirname(serverPath));

  try {
    await fs.writeFile(serverPath, JSON.stringify(server, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save MCP server "${name}": ${error}`);
  }
}

export async function removeMCPServer(
  config: Config | null,
  name: string,
  isGlobal: boolean
): Promise<void> {
  const serverPath = getMCPServerPath(config, name, isGlobal);
  const serverDir = path.dirname(serverPath);

  if (!(await fs.pathExists(serverPath))) {
    throw new Error(`Server "${name}" not found`);
  }

  try {
    await fs.remove(serverDir);
  } catch (error) {
    throw new Error(`Failed to remove MCP server "${name}": ${error}`);
  }
}

export async function discoverAllMCPServers(
  config: Config | null
): Promise<MCPServerEntry[]> {
  const globalEntries = await loadAllMCPServers(getGlobalMCPDir(), 'global');

  let projectEntries: MCPServerEntry[] = [];
  if (config) {
    projectEntries = await loadAllMCPServers(getProjectMCPDir(config), 'project');
  }

  return [...projectEntries, ...globalEntries];
}

export async function resolveMCPServersByName(
  config: Config | null,
  names: string[]
): Promise<Record<string, MCPServer>> {
  const result: Record<string, MCPServer> = {};

  for (const name of names) {
    // Project-first resolution
    if (config) {
      const projectServer = await loadMCPServer(config, name, false);
      if (projectServer) {
        result[name] = projectServer;
        continue;
      }
    }

    const globalServer = await loadMCPServer(null, name, true);
    if (globalServer) {
      result[name] = globalServer;
    } else {
      console.warn(`Warning: MCP server "${name}" not found in project or global scope`);
    }
  }

  return result;
}

export async function getAllServers(
  config: Config
): Promise<{ user: MCPServers | null; project: MCPServers | null }> {
  const globalEntries = await loadAllMCPServers(getGlobalMCPDir(), 'global');
  const projectEntries = await loadAllMCPServers(getProjectMCPDir(config), 'project');

  const user: MCPServers | null =
    globalEntries.length > 0
      ? {
          servers: Object.fromEntries(
            globalEntries.map((e) => [e.name, e.server])
          ),
        }
      : null;

  const project: MCPServers | null =
    projectEntries.length > 0
      ? {
          servers: Object.fromEntries(
            projectEntries.map((e) => [e.name, e.server])
          ),
        }
      : null;

  return { user, project };
}
