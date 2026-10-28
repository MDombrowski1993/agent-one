export type CliTool = 'cursor-agent' | 'claude' | 'codex' | 'gemini';

export interface WorktreeSetupConfig {
  /** Gitignored files to copy from projectRoot into new worktrees (relative paths, e.g. "apps/frontend/.env.local") */
  copyFiles?: string[];
  /** Command to run at the worktree root after files are copied (e.g. "pnpm run refresh") */
  command?: string;
}

export interface ForumConfig {
  /** Claude Code MCP server name holding the Valhalla key (default: first user-scope server on /api/v1/mcp) */
  mcpServer?: string;
  /** Seconds between forum polls in `a1 panel` (default 60) */
  pollSeconds?: number;
  /** Minutes between AI triage checks while new activity is waiting (default 15, 0 disables) */
  checkMinutes?: number;
  /** Model for the headless AI check (default "haiku"; "sonnet" drafts better replies at several times the cost) */
  checkModel?: string;
  /** Room-name regexes hidden from the activity feed */
  ignoreRooms?: string[];
}

export interface Config {
  projectRoot: string;
  defaultCli: CliTool;
  sessionsBase: string;
  aiDirectory: string;
  worktreeSetup?: WorktreeSetupConfig;
  forum?: ForumConfig;
}
