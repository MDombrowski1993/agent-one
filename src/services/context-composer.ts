import { Config } from '../config/types.js';
import { loadRoleContext } from './role.js';
import {
  loadRoleSkillRefs,
  resolveEffectiveSkills,
  resolveSkill,
} from './skill/service.js';
import { resolveMCPServersByName } from './mcp/manager.js';
import { ComposedRoleContext, EffectiveSkills } from './skill/types.js';
import { MCPServer } from './mcp/types.js';

export async function composeRoleContext(
  config: Config,
  roleName: string
): Promise<ComposedRoleContext> {
  // 1. Load role.md
  const roleMarkdown = await loadRoleContext(config, roleName);

  // 2. Read role's skills.json (empty if no file), then merge in always-on skills
  const roleSkillNames = await loadRoleSkillRefs(config, roleName);
  const skills = await resolveEffectiveSkills(config, roleSkillNames);

  return compose(config, roleMarkdown, skills);
}

/**
 * Compose a context with no role — only the always-on skills. Used by launches
 * that run without `--role` so always-on skills still reach the agent.
 */
export async function composeAlwaysOnContext(
  config: Config
): Promise<ComposedRoleContext> {
  const skills = await resolveEffectiveSkills(config, []);
  return compose(config, '', skills);
}

async function compose(
  config: Config,
  roleMarkdown: string,
  skills: EffectiveSkills
): Promise<ComposedRoleContext> {
  // 1. For each skill: resolve markdown + MCP refs
  const skillMarkdowns: string[] = [];
  const allMCPServerNames: string[] = [];

  for (const skillName of skills.names) {
    const resolved = await resolveSkill(config, skillName);
    skillMarkdowns.push(resolved.markdown);
    allMCPServerNames.push(...resolved.mcpServerNames);
  }

  // 2. Collect all MCP server names, resolve via resolveMCPServersByName
  const uniqueMCPNames = [...new Set(allMCPServerNames)];
  let mcpServers: Record<string, MCPServer> = {};
  if (uniqueMCPNames.length > 0) {
    mcpServers = await resolveMCPServersByName(config, uniqueMCPNames);
  }

  // 3. Compose prompt: role markdown + skills section
  let composedPrompt = roleMarkdown;

  if (skillMarkdowns.length > 0) {
    if (composedPrompt) {
      composedPrompt += '\n\n';
    }
    composedPrompt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    composedPrompt += '## SKILLS\n';
    composedPrompt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    composedPrompt += skillMarkdowns.join('\n\n---\n\n');
    composedPrompt += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  }

  return {
    roleMarkdown,
    skillMarkdowns,
    skills,
    mcpServers,
    composedPrompt,
  };
}
