export type CliTool = 'cursor-agent' | 'claude' | 'codex' | 'gemini';

export interface Config {
  projectRoot: string;
  defaultCli: CliTool;
  sessionsBase: string;
  aiDirectory: string;
}
