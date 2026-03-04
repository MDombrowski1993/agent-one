import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import { discoverAllRoles } from '../services/role.js';
import {
  discoverAllSkills,
  loadRoleSkillRefs,
  getRoleSkillsPath,
} from '../services/skill/service.js';
import fs from 'fs-extra';
import path from 'path';

export async function assignSkillCommand(): Promise<void> {
  const config = await loadConfig();

  // Discover roles
  const allRoles = await discoverAllRoles(config);

  if (allRoles.length === 0) {
    console.log(chalk.yellow('No roles found.'));
    console.log(chalk.dim('\nCreate one with: a1 create-role'));
    return;
  }

  // Discover skills
  const allSkills = await discoverAllSkills(config);

  if (allSkills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    console.log(chalk.dim('\nCreate one with: a1 create-skill'));
    return;
  }

  // Select role
  const { selectedRole } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedRole',
      message: 'Select a role to assign skills to:',
      choices: allRoles.map((r) => ({
        name: `${r.name} (${r.scope}) - ${r.description}`,
        value: { name: r.name, scope: r.scope },
      })),
    },
  ]);

  const isGlobalRole = selectedRole.scope === 'global';
  const roleName = selectedRole.name;

  // Load current skills for this role
  const currentSkills = await loadRoleSkillRefs(config, roleName);

  console.log(chalk.cyan(`\nCurrent skills for "${roleName}": ${currentSkills.length > 0 ? currentSkills.join(', ') : '(none)'}\n`));

  // Select skills (checkbox with current ones pre-checked)
  const { selectedSkills } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSkills',
      message: 'Select skills to assign:',
      choices: allSkills.map((s) => ({
        name: `${s.name} (${s.scope}) - ${s.description}`,
        value: s.name,
        checked: currentSkills.includes(s.name),
      })),
    },
  ]);

  // Write updated skills.json
  const skillsPath = getRoleSkillsPath(config, roleName, isGlobalRole);
  await fs.ensureDir(path.dirname(skillsPath));
  await fs.writeFile(skillsPath, JSON.stringify(selectedSkills, null, 2), 'utf-8');

  console.log(chalk.green(`\n✓ Updated skills for role "${roleName}": ${selectedSkills.length > 0 ? selectedSkills.join(', ') : '(none)'}`));

  // Show MCP summary
  const skillsWithMCP = allSkills.filter(
    (s) => selectedSkills.includes(s.name) && s.mcpRefs.length > 0
  );

  if (skillsWithMCP.length > 0) {
    console.log(chalk.cyan('\nMCP servers that will be available via skills:'));
    for (const skill of skillsWithMCP) {
      console.log(chalk.dim(`  ${skill.name} → ${skill.mcpRefs.join(', ')}`));
    }
  }
}
