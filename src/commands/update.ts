import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { getSource, updateSource as updateSourceConfig } from '../config.js';
import { ensureChromaRunning } from '../chroma/manager.js';

interface UpdateOptions {
  depth?: string;
  pages?: string;
}

export async function updateCommand(id: string, options: UpdateOptions = {}) {
  // Vérifier que ChromaDB est accessible
  await ensureChromaRunning();

  console.log(chalk.bold('\n🔄 Updating documentation source\n'));

  const source = await getSource(id);
  if (!source) {
    console.error(chalk.red(`Error: Source "${id}" not found`));
    console.log(chalk.dim('\nUse "feedd list" to see available sources.'));
    process.exit(1);
  }

  console.log(chalk.dim(`Source: ${source.url}`));
  console.log(chalk.dim(`ID: ${source.id}\n`));

  // Détecter si mode interactif nécessaire (aucune option fournie)
  const isInteractive = !options.depth && !options.pages;

  let finalOptions = options;

  if (isInteractive) {
    console.log(chalk.dim('Press Enter to keep current values\n'));

    // Mode interactif avec inquirer, valeurs actuelles comme defaults
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'maxDepth',
        message: 'Max crawl depth:',
        default: String(source.maxDepth ?? 2),
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        },
      },
      {
        type: 'input',
        name: 'maxPages',
        message: 'Max pages to crawl:',
        default: String(source.maxPages ?? 100),
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        },
      },
    ]);

    // Construire les options finales depuis les réponses
    finalOptions = {
      depth: answers.maxDepth,
      pages: answers.maxPages,
    };
  }

  // Mettre à jour les paramètres avant le crawl
  await updateSourceConfig(id, {
    maxDepth: finalOptions.depth ? parseInt(finalOptions.depth) : undefined,
    maxPages: finalOptions.pages ? parseInt(finalOptions.pages) : undefined,
  });

  // Récupérer la source mise à jour
  const updatedSource = await getSource(id);
  if (!updatedSource) {
    console.error(chalk.red('Error: Failed to retrieve updated source'));
    process.exit(1);
  }

  let spinner = ora('Re-crawling documentation...').start();

  try {
    // Supprimer les anciens fichiers
    const rawPath = path.join(process.cwd(), 'data', 'raw', id);
    await fs.rm(rawPath, { recursive: true, force: true });

    // Phase 1: Re-crawl
    await updateSourceConfig(id, { status: 'crawling' });

    const { crawl } = await import('../crawler/index.js');
    const docCount = await crawl(updatedSource);

    spinner.succeed(chalk.green(`Crawled ${docCount} pages`));

    // Phase 2: Re-index
    spinner = ora('Re-indexing documentation...').start();
    await updateSourceConfig(id, { status: 'indexing' });

    const { indexSource } = await import('../indexer/index.js');
    const chunkCount = await indexSource(updatedSource);

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
    console.error(chalk.dim('\nStack trace:'));
    console.error(chalk.dim(error.stack));
    await updateSourceConfig(id, { status: 'error' });
    process.exit(1);
  }
}
