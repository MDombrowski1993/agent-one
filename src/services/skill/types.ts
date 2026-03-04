import { MCPServer } from '../mcp/types.js';

export type SkillMCPRefs = string[];      // skill's mcp.json content
export type RoleSkillRefs = string[];     // role's skills.json content

export interface DiscoveredSkill {
  name: string;
  description: string;
  scope: 'global' | 'project';
  path: string;
  mcpRefs: string[];
}

export interface ResolvedSkill {
  name: string;
  markdown: string;
  mcpServerNames: string[];
}

export interface ComposedRoleContext {
  roleMarkdown: string;
  skillMarkdowns: string[];
  mcpServers: Record<string, MCPServer>;
  composedPrompt: string;
}
