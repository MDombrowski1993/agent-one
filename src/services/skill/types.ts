import { MCPServer } from '../mcp/types.js';

export type SkillMCPRefs = string[];      // skill's mcp.json content
export type RoleSkillRefs = string[];     // role's skills.json content

/** skill.json content — skill-level metadata */
export interface SkillMeta {
  /** Loaded into every composed context, regardless of role assignment */
  alwaysOn: boolean;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  scope: 'global' | 'project';
  path: string;
  mcpRefs: string[];
  alwaysOn: boolean;
}

export interface ResolvedSkill {
  name: string;
  markdown: string;
  mcpServerNames: string[];
}

/** Effective skill list for a context: always-on skills merged with role skills */
export interface EffectiveSkills {
  /** Load order: always-on skills first, then role skills, deduped */
  names: string[];
  /** Names that are always on (loaded whether or not the role asked for them) */
  alwaysOnNames: string[];
  /** Names as declared in the role's skills.json */
  roleNames: string[];
  /** Role-assigned names that were already covered by an always-on skill */
  dedupedNames: string[];
}

export interface ComposedRoleContext {
  /** Empty string when composed without a role */
  roleMarkdown: string;
  skillMarkdowns: string[];
  skills: EffectiveSkills;
  mcpServers: Record<string, MCPServer>;
  /** Empty string when there is no role and no always-on skills */
  composedPrompt: string;
}
