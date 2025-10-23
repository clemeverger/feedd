import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { getSource, updateSource as updateSourceConfig } from '../config.js';

export async function updateCommand(id: string) {
  console.log(chalk.bold('\n🔄 Updating documentation source\n'));

  const source = await getSource(id);
  if (!source) {
    console.error(chalk.red(`Error: Source "${id}" not found`));
    console.log(chalk.dim('\nUse "feedd list" to see available sources.'));
    process.exit(1);
  }

  console.log(chalk.dim(`Source: ${source.name}`));
  console.log(chalk.dim(`URL: ${source.url}\n`));

  let spinner = ora('Re-crawling documentation...').start();

  try {
    // Supprimer les anciens fichiers
    const rawPath = path.join(process.cwd(), 'data', 'raw', id);
    await fs.rm(rawPath, { recursive: true, force: true });

    // Phase 1: Re-crawl
    await updateSourceConfig(id, { status: 'crawling' });

    const { crawl } = await import('../crawler/index.js');
    const docCount = await crawl(source);

    spinner.succeed(chalk.green(`Crawled ${docCount} pages`));

    // Phase 2: Re-index
    spinner = ora('Re-indexing documentation...').start();
    await updateSourceConfig(id, { status: 'indexing' });

    const { indexSource } = await import('../indexer/index.js');
    const chunkCount = await indexSource(source);

    spinner.succeed(chalk.green(`Indexed ${chunkCount} chunks`));

    // Marquer comme prêt
    await updateSourceConfig(id, {
      status: 'ready',
      docCount,
      lastUpdated: new Date().toISOString()
    });

    console.log(chalk.bold.green('\n✓ Source successfully updated!'));

  } catch (error: any) {
    spinner.fail(chalk.red('Error updating source'));
    console.error(chalk.red(error.message));
    await updateSourceConfig(id, { status: 'error' });
    process.exit(1);
  }
}
