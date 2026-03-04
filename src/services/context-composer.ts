import { Config } from '../config/types.js';
import { loadRoleContext } from './role.js';
import { loadRoleSkillRefs, resolveSkill } from './skill/service.js';
import { resolveMCPServersByName } from './mcp/manager.js';
import { ComposedRoleContext } from './skill/types.js';
import { MCPServer } from './mcp/types.js';

export async function composeRoleContext(
  config: Config,
  roleName: string
): Promise<ComposedRoleContext> {
  // 1. Load role.md
  const roleMarkdown = await loadRoleContext(config, roleName);

  // 2. Read role's skills.json (empty if no file)
  const skillNames = await loadRoleSkillRefs(config, roleName);

  // 3. For each skill: resolve markdown + MCP refs
  const skillMarkdowns: string[] = [];
  const allMCPServerNames: string[] = [];

  for (const skillName of skillNames) {
    const resolved = await resolveSkill(config, skillName);
    skillMarkdowns.push(resolved.markdown);
    allMCPServerNames.push(...resolved.mcpServerNames);
  }

  // 4. Collect all MCP server names, resolve via resolveMCPServersByName
  const uniqueMCPNames = [...new Set(allMCPServerNames)];
  let mcpServers: Record<string, MCPServer> = {};
  if (uniqueMCPNames.length > 0) {
    mcpServers = await resolveMCPServersByName(config, uniqueMCPNames);
  }

  // 5. Compose prompt: role markdown + skills section
  let composedPrompt = roleMarkdown;

  if (skillMarkdowns.length > 0) {
    composedPrompt += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    composedPrompt += '## SKILLS\n';
    composedPrompt += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    composedPrompt += skillMarkdowns.join('\n\n---\n\n');
    composedPrompt += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  }

  return {
    roleMarkdown,
    skillMarkdowns,
    mcpServers,
    composedPrompt,
  };
}
