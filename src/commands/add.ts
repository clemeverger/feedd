import chalk from 'chalk';
import ora from 'ora';
import { parseRepoSpec } from '../git/index.js';
import { addSource, updateSource } from '../config.js';
import { indexRepo } from '../indexer/index.js';
import { updateClaudeMd } from '../utils/claudemd.js';

interface AddOptions {
  branch?: string;
}

export async function addCommand(repoSpec: string, options: AddOptions) {
  console.log(chalk.bold('\n📚 Adding GitHub repository\n'));

  // Parse repo specification
  let owner: string;
  let repo: string;
  let branch: string;

  try {
    const parsed = parseRepoSpec(repoSpec);
    owner = parsed.owner;
    repo = parsed.repo;
    branch = options.branch || parsed.branch;
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    console.error(chalk.dim('\nExpected format: owner/repo or owner/repo@branch'));
    console.error(chalk.dim('Examples:'));
    console.error(chalk.cyan('  feedd add facebook/react'));
    console.error(chalk.cyan('  feedd add facebook/react@v18.2.0'));
    console.error(chalk.cyan('  feedd add vercel/next.js --branch canary'));
    process.exit(1);
  }

  let spinner = ora(`Adding ${owner}/${repo}@${branch} to config...`).start();

  try {
    // Add to config
    const source = await addSource(owner, repo, branch);
    spinner.succeed(chalk.green(`Added ${owner}/${repo}@${branch}`));

    // Index repository
    spinner = ora('Indexing repository...').start();
    spinner.stopAndPersist({ symbol: '' }); // Stop but keep visible

    await updateSource(source.id, { status: 'indexing' });

    // This will display its own progress
    const chunkCount = await indexRepo(owner, repo, branch);

    // Mark as ready
    await updateSource(source.id, {
      status: 'ready',
      docCount: chunkCount,
      lastUpdated: new Date().toISOString()
    });

    // Update CLAUDE.md with new source
    await updateClaudeMd();

    console.log(chalk.bold.green(`\n✅ Repository successfully indexed!`));
    console.log(chalk.dim(`   ${owner}/${repo}@${branch} - ${chunkCount} chunks`));
    console.log(chalk.dim('\n💡 Use "feedd serve" to start the MCP server for Claude Code'));
  } catch (error: any) {
    if (spinner.isSpinning) {
      spinner.fail(chalk.red('Error'));
    }

    console.error(chalk.red(`\n✖ ${error.message}`));

    if (error.message.includes('Ollama')) {
      console.log(''); // Empty line for readability
    }

    process.exit(1);
  }
}
