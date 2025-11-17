import chalk from 'chalk';
import { listRepos } from '../config.js';

export async function listCommand() {
  console.log(chalk.bold('\n📚 Indexed Repositories\n'));

  const repos = await listRepos();

  if (repos.length === 0) {
    console.log(chalk.yellow('No repositories indexed yet.'));
    console.log(chalk.dim('\nAdd one with:'));
    console.log(chalk.cyan('  feedd add owner/repo'));
    return;
  }

  // Display repos grouped by owner/repo
  for (const repo of repos) {
    console.log(chalk.bold.cyan(`${repo.owner}/${repo.repo}`));

    // Show branches
    for (const branch of repo.branches) {
      const docCount = branch.docCount || 0;
      const lastUpdated = branch.lastUpdated
        ? new Date(branch.lastUpdated).toLocaleDateString()
        : 'Never';

      console.log(chalk.dim(`  ├─ ${branch.branch}`));
      console.log(chalk.dim(`  │  ${docCount} chunks  •  Updated: ${lastUpdated}`));
    }

    console.log(''); // Empty line between repos
  }

  const totalBranches = repos.reduce((sum, repo) => sum + repo.branches.length, 0);
  const totalChunks = repos.reduce(
    (sum, repo) => sum + repo.branches.reduce((s, b) => s + b.docCount, 0),
    0
  );

  console.log(chalk.dim(`Total: ${repos.length} repositories, ${totalBranches} branches, ${totalChunks} chunks\n`));
}
