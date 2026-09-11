import chalk from 'chalk';
import { DiscoveredSkill, EffectiveSkills } from '../services/skill/types.js';

export const ALWAYS_ON_MARKER = '⚡';

/** Dim "[always on]" tag for lists and prompts */
export function alwaysOnTag(): string {
  return chalk.yellow(`[${ALWAYS_ON_MARKER} always on]`);
}

/** Suffix a skill choice/list label with the always-on tag when it applies */
export function withAlwaysOnTag(label: string, skill: DiscoveredSkill): string {
  return skill.alwaysOn ? `${label} ${alwaysOnTag()}` : label;
}

/**
 * Print what a launch actually loaded, marking always-on skills so it is clear
 * where skills the role never asked for came from.
 */
export function printLoadedSkills(skills: EffectiveSkills): void {
  if (skills.names.length === 0) {
    return;
  }

  const labelled = skills.names.map((name) =>
    skills.alwaysOnNames.includes(name) ? `${name} ${ALWAYS_ON_MARKER}` : name
  );

  console.log(
    chalk.green(`✓ ${skills.names.length} skill(s) loaded: `) +
      chalk.dim(labelled.join(', '))
  );

  if (skills.alwaysOnNames.length > 0) {
    console.log(chalk.dim(`  ${ALWAYS_ON_MARKER} = always-on skill`));
  }

  if (skills.dedupedNames.length > 0) {
    console.log(
      chalk.dim(
        `  deduped (already always-on): ${skills.dedupedNames.join(', ')}`
      )
    );
  }
}
