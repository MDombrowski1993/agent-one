export type CliTool = 'cursor-agent' | 'claude' | 'codex' | 'gemini';

/**
 * On-disk shape of `.a1rc.json` at the project root.
 * Everything except `defaultCli` is optional; derived fields (projectRoot, aiDirectory)
 * are intentionally not stored here.
 */
export interface A1RcFile {
  defaultCli: CliTool;
  /** Optional. Absolute, `~/`-prefixed, or relative to project root. */
  sessionsBase?: string;
}

/**
 * Fully-resolved runtime configuration. Downstream code reads this shape.
 * projectRoot and aiDirectory are always derived from the .a1rc.json location.
 */
export interface Config {
  projectRoot: string;
  defaultCli: CliTool;
  sessionsBase: string;
  aiDirectory: string;
}
