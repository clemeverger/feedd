import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { removeSource, getSource } from '../config.js';
import { deleteTable } from '../storage/lancedb.js';
import { parseRepoSpec, generateRepoId } from '../git/index.js';
import { updateClaudeMd } from '../utils/claudemd.js';

interface RemoveOptions {
  branch?: string;
}

export async function removeCommand(repoSpec: string, options: RemoveOptions) {
  let owner: string;
  let repo: string;
  let branch: string | undefined;

  try {
    const parsed = parseRepoSpec(repoSpec);
    owner = parsed.owner;
    repo = parsed.repo;
    branch = options.branch || parsed.branch;
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }

  const repoId = generateRepoId(owner, repo, branch);
  const spinner = ora(`Removing ${owner}/${repo}@${branch}...`).start();

  try {
    // Check if source exists
    const source = await getSource(repoId);
    if (!source) {
      spinner.fail(chalk.red(`Repository ${owner}/${repo}@${branch} is not indexed`));
      console.log(chalk.dim('\nUse "feedd list" to see indexed repositories.'));
      process.exit(1);
    }

    // Delete cloned repository
    const repoPath = path.join(process.cwd(), 'data', 'repos', owner, repo, branch);
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      spinner.text = `Deleted repository files...`;
    } catch (error) {
      // Ignore if directory doesn't exist
    }

    // Remove from config
    await removeSource(repoId);

    // Delete from LanceDB
    try {
      await deleteTable(repoId);
    } catch (error) {
      // Ignore if table doesn't exist
    }

    spinner.succeed(chalk.green(`Successfully removed ${owner}/${repo}@${branch}`));

    // Update CLAUDE.md to remove the source
    await updateClaudeMd();

    console.log(chalk.dim('\nAll associated data has been deleted.'));

  } catch (error: any) {
    spinner.fail(chalk.red('Error removing repository'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}
