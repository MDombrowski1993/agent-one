import path from 'path';
import fs from 'fs-extra';
import { homedir } from 'os';
import { Config } from '../../config/types.js';
import {
  SkillMCPRefs,
  RoleSkillRefs,
  DiscoveredSkill,
  ResolvedSkill,
} from './types.js';

export function getGlobalSkillsPath(): string {
  return path.join(homedir(), '.config', 'a1', 'global-skills');
}

export function getSkillPath(
  config: Config | null,
  name: string,
  isGlobal: boolean
): string {
  if (isGlobal) {
    return path.join(getGlobalSkillsPath(), name, 'skill.md');
  }

  if (!config) {
    throw new Error('Config is required for project-level skills');
  }

  return path.join(config.aiDirectory, 'skills', name, 'skill.md');
}

export function getSkillMCPRefsPath(
  config: Config | null,
  name: string,
  isGlobal: boolean
): string {
  if (isGlobal) {
    return path.join(getGlobalSkillsPath(), name, 'mcp.json');
  }

  if (!config) {
    throw new Error('Config is required for project-level skills');
  }

  return path.join(config.aiDirectory, 'skills', name, 'mcp.json');
}

export function getRoleSkillsPath(
  config: Config | null,
  roleName: string,
  isGlobal: boolean
): string {
  if (isGlobal) {
    return path.join(homedir(), '.config', 'a1', 'global-roles', roleName, 'skills.json');
  }

  if (!config) {
    throw new Error('Config is required for project-level roles');
  }

  return path.join(config.aiDirectory, 'roles', roleName, 'skills.json');
}

export async function skillExists(
  config: Config | null,
  name: string,
  isGlobal?: boolean
): Promise<boolean> {
  if (isGlobal !== undefined) {
    const skillPath = getSkillPath(config, name, isGlobal);
    return fs.pathExists(skillPath);
  }

  // Check project first, then global
  if (config) {
    const projectPath = getSkillPath(config, name, false);
    if (await fs.pathExists(projectPath)) {
      return true;
    }
  }

  const globalPath = getSkillPath(null, name, true);
  return fs.pathExists(globalPath);
}

export async function loadSkillMarkdown(
  config: Config | null,
  name: string
): Promise<string> {
  // Project-first resolution
  if (config) {
    const projectPath = getSkillPath(config, name, false);
    if (await fs.pathExists(projectPath)) {
      return fs.readFile(projectPath, 'utf-8');
    }
  }

  const globalPath = getSkillPath(null, name, true);
  if (await fs.pathExists(globalPath)) {
    return fs.readFile(globalPath, 'utf-8');
  }

  throw new Error(`Skill "${name}" does not exist (checked both project and global locations)`);
}

export async function loadSkillMCPRefs(
  config: Config | null,
  name: string
): Promise<SkillMCPRefs> {
  // Project-first resolution
  if (config) {
    const projectPath = getSkillMCPRefsPath(config, name, false);
    if (await fs.pathExists(projectPath)) {
      try {
        const data = await fs.readFile(projectPath, 'utf-8');
        return JSON.parse(data) as SkillMCPRefs;
      } catch {
        return [];
      }
    }
  }

  const globalPath = getSkillMCPRefsPath(null, name, true);
  if (await fs.pathExists(globalPath)) {
    try {
      const data = await fs.readFile(globalPath, 'utf-8');
      return JSON.parse(data) as SkillMCPRefs;
    } catch {
      return [];
    }
  }

  return [];
}

export async function loadRoleSkillRefs(
  config: Config | null,
  roleName: string
): Promise<RoleSkillRefs> {
  // Project-first resolution
  if (config) {
    const projectPath = getRoleSkillsPath(config, roleName, false);
    if (await fs.pathExists(projectPath)) {
      try {
        const data = await fs.readFile(projectPath, 'utf-8');
        return JSON.parse(data) as RoleSkillRefs;
      } catch {
        return [];
      }
    }
  }

  const globalPath = getRoleSkillsPath(null, roleName, true);
  if (await fs.pathExists(globalPath)) {
    try {
      const data = await fs.readFile(globalPath, 'utf-8');
      return JSON.parse(data) as RoleSkillRefs;
    } catch {
      return [];
    }
  }

  return [];
}

export async function createSkill(
  config: Config | null,
  name: string,
  description: string,
  isGlobal: boolean
): Promise<string> {
  const skillPath = getSkillPath(config, name, isGlobal);

  if (await skillExists(config, name, isGlobal)) {
    const location = isGlobal ? 'global' : 'project';
    throw new Error(`${location} skill "${name}" already exists at: ${skillPath}`);
  }

  await fs.ensureDir(path.dirname(skillPath));

  const template = `# ${formatSkillName(name)} Skill

## Description
${description}

## Instructions
[To be filled out]

## When to Use
[To be filled out]

## Guidelines
[To be filled out]
`;

  await fs.writeFile(skillPath, template, 'utf-8');
  return skillPath;
}

export async function assignSkillToRole(
  config: Config | null,
  roleName: string,
  skillName: string,
  isGlobalRole: boolean
): Promise<void> {
  const skillsPath = getRoleSkillsPath(config, roleName, isGlobalRole);
  let skills: RoleSkillRefs = [];

  if (await fs.pathExists(skillsPath)) {
    try {
      const data = await fs.readFile(skillsPath, 'utf-8');
      skills = JSON.parse(data) as RoleSkillRefs;
    } catch {
      skills = [];
    }
  }

  if (!skills.includes(skillName)) {
    skills.push(skillName);
  }

  await fs.ensureDir(path.dirname(skillsPath));
  await fs.writeFile(skillsPath, JSON.stringify(skills, null, 2), 'utf-8');
}

export async function removeSkillFromRole(
  config: Config | null,
  roleName: string,
  skillName: string,
  isGlobalRole: boolean
): Promise<void> {
  const skillsPath = getRoleSkillsPath(config, roleName, isGlobalRole);

  if (!(await fs.pathExists(skillsPath))) {
    return;
  }

  let skills: RoleSkillRefs = [];
  try {
    const data = await fs.readFile(skillsPath, 'utf-8');
    skills = JSON.parse(data) as RoleSkillRefs;
  } catch {
    return;
  }

  skills = skills.filter((s) => s !== skillName);
  await fs.writeFile(skillsPath, JSON.stringify(skills, null, 2), 'utf-8');
}

export async function discoverAllSkills(
  config: Config | null
): Promise<DiscoveredSkill[]> {
  const globalSkillsDir = getGlobalSkillsPath();
  const globalSkills = await scanSkillsDirectory(globalSkillsDir, 'global');

  let projectSkills: DiscoveredSkill[] = [];
  if (config) {
    const projectSkillsDir = path.join(config.aiDirectory, 'skills');
    projectSkills = await scanSkillsDirectory(projectSkillsDir, 'project');
  }

  return [...projectSkills, ...globalSkills];
}

export async function resolveSkill(
  config: Config | null,
  name: string
): Promise<ResolvedSkill> {
  const markdown = await loadSkillMarkdown(config, name);
  const mcpRefs = await loadSkillMCPRefs(config, name);

  return {
    name,
    markdown,
    mcpServerNames: mcpRefs,
  };
}

// --- Internal helpers ---

function formatSkillName(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractDescription(content: string): string {
  const match = content.match(/## Description\s+([^\n#]+)/);
  if (match) {
    return match[1].trim();
  }
  return 'No description available';
}

async function scanSkillsDirectory(
  skillsDir: string,
  scope: 'global' | 'project'
): Promise<DiscoveredSkill[]> {
  if (!(await fs.pathExists(skillsDir))) {
    return [];
  }

  const skills: DiscoveredSkill[] = [];
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(skillsDir, entry.name, 'skill.md');
      if (await fs.pathExists(skillPath)) {
        try {
          const content = await fs.readFile(skillPath, 'utf-8');
          const description = extractDescription(content);

          // Load MCP refs if they exist
          let mcpRefs: string[] = [];
          const mcpRefsPath = path.join(skillsDir, entry.name, 'mcp.json');
          if (await fs.pathExists(mcpRefsPath)) {
            try {
              const mcpData = await fs.readFile(mcpRefsPath, 'utf-8');
              mcpRefs = JSON.parse(mcpData) as string[];
            } catch {
              // Skip if can't parse
            }
          }

          skills.push({
            name: entry.name,
            description,
            scope,
            path: skillPath,
            mcpRefs,
          });
        } catch (error) {
          console.warn(`Warning: Could not read skill ${entry.name}: ${error}`);
        }
      }
    }
  }

  return skills;
}
