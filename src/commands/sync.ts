import chalk from 'chalk';
import ora from 'ora';
import { parseRepoSpec, generateRepoId } from '../git/index.js';
import { getSource, updateSource } from '../config.js';
import { indexRepo } from '../indexer/index.js';
import { updateClaudeMd } from '../utils/claudemd.js';

interface SyncOptions {
  branch?: string;
}

export async function syncCommand(repoSpec: string, options: SyncOptions) {
  console.log(chalk.bold('\n🔄 Syncing GitHub repository\n'));

  // Parse repo specification
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

  let spinner = ora(`Checking if ${owner}/${repo}@${branch} is indexed...`).start();

  try {
    // Check if source exists
    const source = await getSource(repoId);

    if (!source) {
      spinner.fail(chalk.red(`Repository ${owner}/${repo}@${branch} is not indexed`));
      console.error(chalk.dim('\nAdd it first with:'));
      console.error(chalk.cyan(`  feedd add ${owner}/${repo}@${branch}`));
      process.exit(1);
    }

    spinner.succeed(chalk.green(`Found ${owner}/${repo}@${branch}`));

    // Re-index repository
    spinner = ora('Re-indexing repository...').start();
    spinner.stopAndPersist({ symbol: '' });

    await updateSource(source.id, { status: 'indexing' });

    const chunkCount = await indexRepo(owner, repo, branch);

    // Mark as ready
    await updateSource(source.id, {
      status: 'ready',
      docCount: chunkCount,
      lastUpdated: new Date().toISOString()
    });

    // Update CLAUDE.md with updated source info
    await updateClaudeMd();

    console.log(chalk.bold.green(`\n✅ Repository successfully synced!`));
    console.log(chalk.dim(`   ${owner}/${repo}@${branch} - ${chunkCount} chunks`));
  } catch (error: any) {
    if (spinner.isSpinning) {
      spinner.fail(chalk.red('Error'));
    }

    console.error(chalk.red(`\n✖ ${error.message}`));

    if (error.message.includes('Ollama')) {
      console.log('');
    }

    process.exit(1);
  }
}
