import chalk from 'chalk';
import ora from 'ora';
import { parseRepoSpec, generateRepoId } from '../git/index.js';
import { listSources } from '../config.js';
import { OllamaEmbedder } from '../embeddings/ollama.js';
import { search, listTables } from '../storage/lancedb.js';

interface SearchOptions {
  repo?: string;
  branch?: string;
  limit?: string;
}

export async function searchCommand(query: string, options: SearchOptions) {
  const limit = options.limit ? parseInt(options.limit) : 10;

  console.log(chalk.bold(`\n🔍 Searching: "${chalk.cyan(query)}"\n`));

  const spinner = ora('Generating query embedding...').start();

  try {
    // Check Ollama
    const embedder = new OllamaEmbedder();
    await embedder.ensureAvailable();

    // Generate query embedding
    const [queryVector] = await embedder.embed([query]);
    spinner.succeed(chalk.green('Query embedding generated'));

    // Determine which repos to search
    let repoIds: string[] = [];

    if (options.repo) {
      const parsed = parseRepoSpec(options.repo);
      const branch = options.branch || parsed.branch;
      const repoId = generateRepoId(parsed.owner, parsed.repo, branch);
      repoIds = [repoId];
    } else {
      // Search all indexed repos
      repoIds = await listTables();
    }

    if (repoIds.length === 0) {
      console.log(chalk.yellow('\n⚠ No repositories indexed yet'));
      console.log(chalk.dim('Add a repository with: feedd add owner/repo'));
      return;
    }

    // Search all repos
    const allResults: any[] = [];

    for (const repoId of repoIds) {
      try {
        const results = await search(repoId, queryVector, limit);
        allResults.push(...results);
      } catch (error) {
        // Silently skip repos that don't exist or have errors
      }
    }

    if (allResults.length === 0) {
      console.log(chalk.yellow('\n⚠ No results found'));
      return;
    }

    // Sort by distance
    allResults.sort((a, b) => a._distance - b._distance);
    const topResults = allResults.slice(0, limit);

    // Display results
    console.log(chalk.bold(`\n📄 Found ${topResults.length} result(s):\n`));

    topResults.forEach((result, index) => {
      console.log(chalk.bold.cyan(`[${index + 1}] ${result.repo}@${result.branch} › ${result.path}`));
      console.log(chalk.dim(`    Distance: ${result._distance.toFixed(4)}`));

      // Show content preview (first 150 chars)
      const preview = result.content.substring(0, 150).replace(/\n/g, ' ');
      console.log(`    ${preview}${result.content.length > 150 ? '...' : ''}`);
      console.log('');
    });
  } catch (error: any) {
    spinner.fail(chalk.red('Error'));
    console.error(chalk.red(`\n✖ ${error.message}`));

    if (error.message.includes('Ollama')) {
      console.log('');
    }

    process.exit(1);
  }
}
