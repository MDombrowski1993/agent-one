import chalk from 'chalk';
import { loadConfig } from '../config/manager.js';
import {
  discoverAllSkills,
  discoverAlwaysOnSkills,
} from '../services/skill/service.js';
import { DiscoveredSkill } from '../services/skill/types.js';
import { alwaysOnTag } from '../utils/skill-display.js';

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
  const projectNames = new Set(projectSkills.map((s) => s.name));

  const formatSkill = (skill: DiscoveredSkill): string => {
    const mcp =
      skill.mcpRefs.length > 0 ? chalk.dim(` (mcp: ${skill.mcpRefs.join(', ')})`) : '';

    // A project skill of the same name wins, so a shadowed global skill's
    // always-on flag never takes effect
    const shadowed = skill.scope === 'global' && projectNames.has(skill.name);
    const tag = skill.alwaysOn && !shadowed ? ` ${alwaysOnTag()}` : '';
    const note = shadowed ? chalk.dim(' (shadowed by project skill)') : '';

    return `  ${chalk.bold(skill.name)} - ${chalk.dim(skill.description)}${mcp}${tag}${note}`;
  };

  if (projectSkills.length > 0) {
    console.log(chalk.green.bold('\nProject skills:'));
    for (const skill of projectSkills) {
      console.log(formatSkill(skill));
    }
  }

  if (globalSkills.length > 0) {
    console.log(chalk.blue.bold('\nGlobal skills:'));
    for (const skill of globalSkills) {
      console.log(formatSkill(skill));
    }
  }

  const alwaysOn = await discoverAlwaysOnSkills(config);
  if (alwaysOn.length > 0) {
    console.log(
      `\n${alwaysOnTag()} ${chalk.dim('loads on every launch, with or without a role')}`
    );
  }

  console.log();
}
