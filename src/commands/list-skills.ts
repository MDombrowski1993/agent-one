import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { discoverAllSkills } from '../services/skill/service.js';

export async function listSkillsCommand(): Promise<void> {
  const config = await loadConfig();
  const allSkills = await discoverAllSkills(config);

  if (allSkills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    console.log(chalk.dim('\nCreate one with: a1 create-skill'));
    return;
  }

  const projectSkills = allSkills.filter((s) => s.scope === 'project');
  const globalSkills = allSkills.filter((s) => s.scope === 'global');

  if (projectSkills.length > 0) {
    console.log(chalk.green.bold('\nProject skills:'));
    for (const skill of projectSkills) {
      const mcp = skill.mcpRefs.length > 0 ? chalk.dim(` (mcp: ${skill.mcpRefs.join(', ')})`) : '';
      console.log(`  ${chalk.bold(skill.name)} - ${chalk.dim(skill.description)}${mcp}`);
    }
  }

  if (globalSkills.length > 0) {
    console.log(chalk.blue.bold('\nGlobal skills:'));
    for (const skill of globalSkills) {
      const mcp = skill.mcpRefs.length > 0 ? chalk.dim(` (mcp: ${skill.mcpRefs.join(', ')})`) : '';
      console.log(`  ${chalk.bold(skill.name)} - ${chalk.dim(skill.description)}${mcp}`);
    }
  }

  console.log();
}
