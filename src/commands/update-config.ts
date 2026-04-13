import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { A1RcFile, CliTool } from '../config/types.js';
import { resolveProject, writeRc, readRcAt } from '../config/manager.js';
import { A1_RC_FILENAME, defaultSessionsBase } from '../config/resolver.js';
import { expandPath } from '../utils/validation.js';

export async function updateConfigCommand(): Promise<void> {
  const resolved = await resolveProject();
  if (!resolved || !resolved.rcPath || !resolved.rc) {
    console.log(
      chalk.yellow('\nNo ') +
        chalk.cyan(A1_RC_FILENAME) +
        chalk.yellow(' found walking up from ') +
        chalk.white(process.cwd()) +
        chalk.yellow('. Run ') +
        chalk.cyan('a1 init') +
        chalk.yellow(' first.')
    );
    return;
  }

  const { projectRoot, rcPath } = resolved;
  const currentRc = (await readRcAt(projectRoot)) ?? resolved.rc;
  const defaultBase = defaultSessionsBase(projectRoot);
  const currentSessionsBase = currentRc.sessionsBase
    ? resolveSessionsBaseForDisplay(projectRoot, currentRc.sessionsBase)
    : defaultBase;

  console.log(chalk.cyan(chalk.bold('\nUpdate Configuration\n')));
  console.log(chalk.dim(`Editing: ${rcPath}`));
  console.log(chalk.dim('Current values are shown as defaults. Press Enter to keep them.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'defaultCli',
      message: 'Default AI CLI tool:',
      choices: [
        { name: 'claude', value: 'claude' },
        { name: 'cursor-agent', value: 'cursor-agent' },
        { name: 'codex', value: 'codex' },
        { name: 'gemini', value: 'gemini' },
      ],
      default: currentRc.defaultCli,
    },
    {
      type: 'input',
      name: 'sessionsBase',
      message:
        'Sessions base directory:\n  (Isolated workspaces — kept outside the repo to avoid conflicts)',
      default: currentSessionsBase,
      filter: (input: string) => expandPath(input),
    },
  ]);

  const nextRc: A1RcFile = {
    defaultCli: answers.defaultCli as CliTool,
  };
  if (path.resolve(answers.sessionsBase) !== path.resolve(defaultBase)) {
    nextRc.sessionsBase = answers.sessionsBase;
  }

  await fs.ensureDir(answers.sessionsBase);
  await writeRc(projectRoot, nextRc);

  console.log(chalk.green(`\n✓ Updated ${rcPath}`));
  console.log(chalk.dim('\nView config with: ') + chalk.cyan('a1 config'));
}

function resolveSessionsBaseForDisplay(projectRoot: string, p: string): string {
  if (p.startsWith('~/')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || '', p.slice(2));
  }
  if (path.isAbsolute(p)) return p;
  return path.resolve(projectRoot, p);
}
