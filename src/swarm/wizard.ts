import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import { Config } from '../config/types.js';
import { discoverAllRoles, DiscoveredRole } from '../services/role.js';
import { SwarmManifest } from '../types/swarm.js';
import { generateSessionId, tiersToManifest } from './manifest.js';

interface FileOwnership {
  role: string;
  paths: string[];
}

/**
 * Parse file_ownership from a role's markdown frontmatter (YAML between --- delimiters).
 */
function parseFileOwnership(roleContent: string, roleName: string): FileOwnership | null {
  const frontmatterMatch = roleContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];

  // Simple YAML parsing for file_ownership list
  const ownershipMatch = frontmatter.match(/file_ownership:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (!ownershipMatch) return null;

  const paths = ownershipMatch[1]
    .split('\n')
    .map((line) => line.replace(/^\s+-\s+/, '').trim())
    .filter(Boolean);

  if (paths.length === 0) return null;

  return { role: roleName, paths };
}

/**
 * Detect file_ownership overlaps between roles in the same tier.
 */
function detectConflicts(
  tierRoles: string[],
  ownerships: Map<string, FileOwnership>
): string[] {
  const warnings: string[] = [];

  for (let i = 0; i < tierRoles.length; i++) {
    for (let j = i + 1; j < tierRoles.length; j++) {
      const a = ownerships.get(tierRoles[i]);
      const b = ownerships.get(tierRoles[j]);
      if (!a || !b) continue;

      const overlapping = a.paths.filter((ap) =>
        b.paths.some((bp) => ap.startsWith(bp) || bp.startsWith(ap) || ap === bp)
      );

      if (overlapping.length > 0) {
        warnings.push(
          `${chalk.yellow(a.role)} and ${chalk.yellow(b.role)} may both write to: ${overlapping.join(', ')}`
        );
      }
    }
  }

  return warnings;
}

/**
 * Run the Inquirer wizard to gather task description and tier assignments.
 * Returns a fully-formed SwarmManifest.
 */
export async function runWizard(config: Config): Promise<SwarmManifest> {
  // Gather task description
  const { task } = await inquirer.prompt<{ task: string }>([
    {
      type: 'input',
      name: 'task',
      message: 'What is the task for this swarm?',
      validate: (input: string) => (input.trim() ? true : 'Task description is required'),
    },
  ]);

  // Discover available roles
  const availableRoles = await discoverAllRoles(config);

  if (availableRoles.length === 0) {
    throw new Error('No roles found. Create roles first with: a1 create-role');
  }

  console.log(chalk.dim(`\n  Found ${availableRoles.length} role(s)\n`));

  // Load file_ownership for conflict detection
  const ownerships = new Map<string, FileOwnership>();
  for (const role of availableRoles) {
    try {
      const content = await fs.readFile(role.path, 'utf-8');
      const ownership = parseFileOwnership(content, role.name);
      if (ownership) ownerships.set(role.name, ownership);
    } catch {
      // Skip roles we can't read
    }
  }

  // Collect tiers
  const tiers: string[][] = [];
  let remainingRoles = [...availableRoles];
  let tierNum = 1;

  while (remainingRoles.length > 0) {
    const message =
      tierNum === 1
        ? 'Select Tier 1 roles — these start immediately in parallel:'
        : `Select Tier ${tierNum} roles — these start after Tier ${tierNum - 1} completes:`;

    const { selectedRoles } = await inquirer.prompt<{ selectedRoles: string[] }>([
      {
        type: 'checkbox',
        name: 'selectedRoles',
        message,
        choices: remainingRoles.map((r) => ({
          name: `${r.name} [${r.scope}] — ${r.description}`,
          value: r.name,
          short: r.name,
        })),
        validate: (input: string[]) => {
          if (tierNum === 1 && input.length === 0) {
            return 'You must select at least one role for Tier 1';
          }
          return true;
        },
      },
    ]);

    // If no roles selected (tier 2+), they chose to stop
    if (selectedRoles.length === 0) break;

    tiers.push(selectedRoles);

    // Remove selected roles from remaining
    remainingRoles = remainingRoles.filter((r) => !selectedRoles.includes(r.name));

    // If roles remain, ask about another tier
    if (remainingRoles.length > 0) {
      const { addMore } = await inquirer.prompt<{ addMore: boolean }>([
        {
          type: 'confirm',
          name: 'addMore',
          message: `Add a Tier ${tierNum + 1}?`,
          default: false,
        },
      ]);

      if (!addMore) break;
    }

    tierNum++;
  }

  // Conflict detection across same-tier roles
  for (let i = 0; i < tiers.length; i++) {
    const warnings = detectConflicts(tiers[i], ownerships);
    if (warnings.length > 0) {
      console.log(chalk.yellow(`\n  Warning: potential file conflicts in Tier ${i + 1}:`));
      for (const w of warnings) {
        console.log(chalk.yellow(`    ${w}`));
      }
      console.log();

      const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Continue anyway?',
          default: false,
        },
      ]);

      if (!proceed) {
        throw new Error('Swarm creation cancelled by user due to file conflicts.');
      }
    }
  }

  // Generate manifest
  const sessionId = generateSessionId(task);
  const manifest = tiersToManifest(tiers, task.trim(), sessionId);

  // Print summary
  console.log(chalk.green('\n  Manifest generated:'));
  for (const tier of manifest.tiers) {
    console.log(chalk.dim(`    Tier ${tier.tier}: ${tier.agents.map((a) => a.role).join(', ')}`));
  }
  console.log();

  return manifest;
}
