import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { discoverAllRoles } from '../services/role.js';
import { loadRoleSkillRefs } from '../services/skill/service.js';

export async function listRolesCommand(): Promise<void> {
  const config = await loadConfig();
  const allRoles = await discoverAllRoles(config);

  if (allRoles.length === 0) {
    console.log(chalk.yellow('No roles found.'));
    console.log(chalk.dim('\nCreate one with: a1 create-role'));
    return;
  }

  const projectRoles = allRoles.filter((r) => r.scope === 'project');
  const globalRoles = allRoles.filter((r) => r.scope === 'global');

  if (projectRoles.length > 0) {
    console.log(chalk.green.bold('\nProject roles:'));
    for (const role of projectRoles) {
      const skills = await loadRoleSkillRefs(config, role.name);
      const skillInfo = skills.length > 0 ? chalk.dim(` (skills: ${skills.join(', ')})`) : '';
      console.log(`  ${chalk.bold(role.name)} - ${chalk.dim(role.description)}${skillInfo}`);
    }
  }

  if (globalRoles.length > 0) {
    console.log(chalk.blue.bold('\nGlobal roles:'));
    for (const role of globalRoles) {
      const skills = await loadRoleSkillRefs(config, role.name);
      const skillInfo = skills.length > 0 ? chalk.dim(` (skills: ${skills.join(', ')})`) : '';
      console.log(`  ${chalk.bold(role.name)} - ${chalk.dim(role.description)}${skillInfo}`);
    }
  }

  console.log();
}
