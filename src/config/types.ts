export type CliTool = 'cursor-agent' | 'claude' | 'codex' | 'gemini';

export interface WorktreeSetupConfig {
  /** Gitignored files to copy from projectRoot into new worktrees (relative paths, e.g. "apps/frontend/.env.local") */
  copyFiles?: string[];
  /** Command to run at the worktree root after files are copied (e.g. "pnpm run refresh") */
  command?: string;
}

export interface Config {
  projectRoot: string;
  defaultCli: CliTool;
  sessionsBase: string;
  aiDirectory: string;
  worktreeSetup?: WorktreeSetupConfig;
}
