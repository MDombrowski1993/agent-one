import path from 'path';
import fs from 'fs-extra';
import { homedir } from 'os';
import { Config } from '../config/types.js';

export function getGlobalRolesPath(): string {
  return path.join(homedir(), '.config', 'a1', 'global-roles');
}

export function getRolePath(
  config: Config | null,
  roleName: string,
  isGlobal: boolean = false
): string {
  if (isGlobal) {
    return path.join(getGlobalRolesPath(), roleName, 'role.md');
  }

  if (!config) {
    throw new Error('Config is required for app-specific roles');
  }

  return path.join(config.aiDirectory, 'roles', roleName, 'role.md');
}

export async function roleExists(
  config: Config | null,
  roleName: string,
  isGlobal?: boolean
): Promise<boolean> {
  // If isGlobal is explicitly specified, check only that location
  if (isGlobal !== undefined) {
    const rolePath = getRolePath(config, roleName, isGlobal);
    return fs.pathExists(rolePath);
  }

  // Otherwise, check app-specific first (if config exists), then global
  if (config) {
    const appSpecificPath = getRolePath(config, roleName, false);
    if (await fs.pathExists(appSpecificPath)) {
      return true;
    }
  }

  const globalPath = getRolePath(null, roleName, true);
  return fs.pathExists(globalPath);
}

export async function loadRoleContext(
  config: Config | null,
  roleName: string
): Promise<string> {
  // Check app-specific first (priority)
  if (config) {
    const appSpecificPath = getRolePath(config, roleName, false);
    if (await fs.pathExists(appSpecificPath)) {
      try {
        return await fs.readFile(appSpecificPath, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to load app-specific role context: ${error}`);
      }
    }
  }

  // Check global second
  const globalPath = getRolePath(null, roleName, true);
  if (await fs.pathExists(globalPath)) {
    try {
      return await fs.readFile(globalPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load global role context: ${error}`);
    }
  }

  throw new Error(`Role "${roleName}" does not exist (checked both app-specific and global locations)`);
}

export async function createRole(
  config: Config | null,
  roleName: string,
  description: string,
  isGlobal: boolean = false
): Promise<string> {
  const rolePath = getRolePath(config, roleName, isGlobal);

  // Check if role already exists in the target location
  if (await roleExists(config, roleName, isGlobal)) {
    const location = isGlobal ? 'global' : 'app-specific';
    throw new Error(`${location} role "${roleName}" already exists at: ${rolePath}`);
  }

  // Ensure directory exists
  await fs.ensureDir(path.dirname(rolePath));

  // Create role template
  const template = `# ${formatRoleName(roleName)} Role

## Description
${description}

## Responsibilities
[To be filled out]

## Context & Guidelines
[To be filled out]

## Key Focus Areas
[To be filled out]
`;

  await fs.writeFile(rolePath, template, 'utf-8');
  return rolePath;
}

function formatRoleName(roleName: string): string {
  // Convert "ux-designer" to "UX Designer"
  return roleName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface DiscoveredRole {
  name: string;
  description: string;
  scope: 'global' | 'project';
  path: string;
}

async function scanRolesDirectory(
  rolesDir: string,
  scope: 'global' | 'project'
): Promise<DiscoveredRole[]> {
  if (!(await fs.pathExists(rolesDir))) {
    return [];
  }

  const roles: DiscoveredRole[] = [];
  const entries = await fs.readdir(rolesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const rolePath = path.join(rolesDir, entry.name, 'role.md');
      if (await fs.pathExists(rolePath)) {
        try {
          const content = await fs.readFile(rolePath, 'utf-8');
          const description = extractDescription(content);
          roles.push({
            name: entry.name,
            description,
            scope,
            path: rolePath,
          });
        } catch (error) {
          // Skip roles that can't be read
          console.warn(`Warning: Could not read role ${entry.name}: ${error}`);
        }
      }
    }
  }

  return roles;
}

function extractDescription(roleContent: string): string {
  // Extract description from ## Description section
  const match = roleContent.match(/## Description\s+([^\n#]+)/);
  if (match) {
    return match[1].trim();
  }
  return 'No description available';
}

export async function discoverAllRoles(config: Config | null): Promise<DiscoveredRole[]> {
  const globalRolesDir = getGlobalRolesPath();
  const globalRoles = await scanRolesDirectory(globalRolesDir, 'global');

  let projectRoles: DiscoveredRole[] = [];
  if (config) {
    const projectRolesDir = path.join(config.aiDirectory, 'roles');
    projectRoles = await scanRolesDirectory(projectRolesDir, 'project');
  }

  return [...projectRoles, ...globalRoles];
}
