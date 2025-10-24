import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { addSource as addSourceToConfig, updateSource } from '../config.js';
import { ensureChromaRunning } from '../chroma/manager.js';

interface AddOptions {
  depth?: string;
  pages?: string;
}

export async function addCommand(url: string, options: AddOptions) {
  // Vérifier que ChromaDB est accessible
  await ensureChromaRunning();

  console.log(chalk.bold('\n🕷️  Adding documentation source\n'));

  // Valider l'URL
  try {
    new URL(url);
  } catch {
    console.error(chalk.red('Error: Invalid URL provided'));
    process.exit(1);
  }

  // Détecter si mode interactif nécessaire (aucune option fournie)
  const isInteractive = !options.depth && !options.pages;

  let finalOptions = options;

  if (isInteractive) {
    // Mode interactif avec inquirer
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'maxDepth',
        message: 'Max crawl depth:',
        default: '2',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
        },
      },
      {
        type: 'input',
        name: 'maxPages',
        message: 'Max pages to crawl:',
        default: '100',
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

  let spinner = ora('Adding source to config...').start();

  try {
    // Ajouter à la config
    const source = await addSourceToConfig(url, {
      maxDepth: finalOptions.depth ? parseInt(finalOptions.depth) : undefined,
      maxPages: finalOptions.pages ? parseInt(finalOptions.pages) : undefined,
    });

    spinner.succeed(chalk.green(`Added source: ${source.url}`));
    console.log(chalk.dim(`  ID: ${source.id}`));
    console.log(chalk.dim(`  URL: ${source.url}\n`));

    // Phase 1: Crawling
    spinner = ora('Crawling documentation...').start();
    await updateSource(source.id, { status: 'crawling' });

    const { crawl } = await import('../crawler/index.js');
    const docCount = await crawl(source);

    spinner.succeed(chalk.green(`Crawled ${docCount} pages`));

    // Phase 2: Indexing
    spinner = ora('Indexing documentation...').start();
    await updateSource(source.id, { status: 'indexing' });

    const { indexSource } = await import('../indexer/index.js');
    const chunkCount = await indexSource(source);

    spinner.succeed(chalk.green(`Indexed ${chunkCount} chunks`));

    // Marquer comme prêt
    await updateSource(source.id, {
      status: 'ready',
      docCount,
      lastUpdated: new Date().toISOString()
    });

    console.log(chalk.bold.green('\n✓ Source successfully added and indexed!'));
    console.log(chalk.dim('\nUse "feedd serve" to start the MCP server.'));

  } catch (error: any) {
    spinner.fail(chalk.red('Error adding source'));
    console.error(chalk.red(error.message));

    // Mettre le statut en erreur si la source a été créée
    try {
      const { getSource } = await import('../config.js');
      const source = await getSource(generateIdFromUrl(url));
      if (source) {
        await updateSource(source.id, { status: 'error' });
      }
    } catch {}

    process.exit(1);
  }
}

function generateIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const pathPart = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return `${hostname.replace(/\./g, '-')}${pathPart ? '-' + pathPart : ''}`;
  } catch {
    return url.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  }
}
