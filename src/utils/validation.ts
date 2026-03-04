import fs from 'fs-extra';
import path from 'path';
import simpleGit from 'simple-git';

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const git = simpleGit(dirPath);
    await git.status();
    return true;
  } catch (error) {
    return false;
  }
}

export async function validatePath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

export function validateBranchName(name: string): boolean {
  // Git branch name rules:
  // - Cannot start with a dot or slash
  // - Cannot contain "..", "~", "^", ":", "?", "*", "[", "\", or spaces
  // - Cannot end with a slash or ".lock"
  const invalidChars = /[~^:?*\[\\\s]/;
  const startsWithDotOrSlash = /^[.\/]/;
  const endsWithSlash = /\/$/;
  const hasDoubleDot = /\.\./;
  const endsWithLock = /\.lock$/;

  if (!name || name.trim() === '') {
    return false;
  }

  if (
    invalidChars.test(name) ||
    startsWithDotOrSlash.test(name) ||
    endsWithSlash.test(name) ||
    hasDoubleDot.test(name) ||
    endsWithLock.test(name)
  ) {
    return false;
  }

  return true;
}

export function expandPath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || '', filePath.slice(2));
  }
  return path.resolve(filePath);
}
