import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export interface GitOptions {
  depth?: number;
  branch?: string;
}

/**
 * Clone or pull a GitHub repository
 * @param owner Repository owner (e.g., "facebook")
 * @param repo Repository name (e.g., "react")
 * @param branch Branch to clone (default: "main")
 * @returns Path to the cloned repository
 */
export async function cloneOrPull(
  owner: string,
  repo: string,
  branch: string = 'main'
): Promise<string> {
  const repoPath = path.join(process.cwd(), 'data', 'repos', owner, repo, branch);
  const git = simpleGit();

  try {
    // Check if repo already exists
    const exists = await pathExists(repoPath);

    if (exists) {
      // Repository exists, pull latest changes
      console.log(chalk.dim(`  Pulling latest changes from ${owner}/${repo}@${branch}...`));
      const repoGit = simpleGit(repoPath);

      try {
        await repoGit.pull('origin', branch);
        console.log(chalk.green(`  ✓ Updated ${owner}/${repo}@${branch}`));
      } catch (error: any) {
        console.log(chalk.yellow(`  ⚠ Could not pull: ${error.message}`));
        console.log(chalk.dim('  Using existing local copy'));
      }
    } else {
      // Repository doesn't exist, clone it
      console.log(chalk.dim(`  Cloning ${owner}/${repo}@${branch}...`));
      const parentDir = path.dirname(repoPath);
      await fs.mkdir(parentDir, { recursive: true });

      const repoUrl = `https://github.com/${owner}/${repo}.git`;

      await git.clone(repoUrl, repoPath, [
        '--branch',
        branch,
        '--depth',
        '1',
        '--single-branch'
      ]);

      console.log(chalk.green(`  ✓ Cloned ${owner}/${repo}@${branch}`));
    }

    return repoPath;
  } catch (error: any) {
    throw new Error(`Failed to clone/pull repository: ${error.message}`);
  }
}

/**
 * Find all markdown files in a directory recursively
 * @param repoPath Path to the repository
 * @returns Array of absolute paths to markdown files
 */
export async function findMarkdownFiles(repoPath: string): Promise<string[]> {
  const files: string[] = [];
  const ignoreDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'out',
    'coverage',
    '.cache',
    'vendor',
    '__pycache__'
  ]);

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip ignored directories
        if (ignoreDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch (error: any) {
      // Ignore permission errors, etc.
      console.warn(chalk.dim(`  Warning: Could not read directory ${dir}: ${error.message}`));
    }
  }

  await walk(repoPath);
  return files;
}

/**
 * Check if a path exists
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a repo specification string (e.g., "facebook/react" or "facebook/react@v18.2.0")
 * @param repoSpec Repo specification string
 * @returns Parsed owner, repo, and branch
 */
export function parseRepoSpec(repoSpec: string): { owner: string; repo: string; branch: string } {
  const [repoPath, branch = 'main'] = repoSpec.split('@');
  const [owner, repo] = repoPath.split('/');

  if (!owner || !repo) {
    throw new Error(`Invalid repo specification: ${repoSpec}. Expected format: owner/repo or owner/repo@branch`);
  }

  return { owner, repo, branch };
}

/**
 * Generate a unique ID for a repo + branch combination
 */
export function generateRepoId(owner: string, repo: string, branch: string): string {
  return `${owner}-${repo}-${branch}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
