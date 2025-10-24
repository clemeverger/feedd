import chalk from 'chalk';
import inquirer from 'inquirer';
import { ensureChromaRunning } from '../chroma/manager.js';
import { getSource } from '../config.js';
import {
  getCollectionStats,
  getCollectionDocuments,
  searchInCollectionByText,
} from '../indexer/vectordb.js';

interface BrowseOptions {
  limit?: string;
}

const DEFAULT_PAGE_SIZE = 20;

export async function browseCommand(sourceId: string, options: BrowseOptions) {
  // Vérifier que ChromaDB est accessible
  await ensureChromaRunning();

  console.log(chalk.bold('\n🔍 Browsing ChromaDB Collection\n'));

  try {
    // Vérifier que la source existe
    const source = await getSource(sourceId);
    if (!source) {
      console.error(chalk.red(`Error: Source "${sourceId}" not found`));
      console.error(chalk.dim('\nUse "feedd list" to see all sources.'));
      process.exit(1);
    }

    // Récupérer les statistiques de la collection
    const stats = await getCollectionStats(sourceId);
    console.log(chalk.bold(`Collection: ${chalk.cyan(sourceId)}`));
    console.log(chalk.dim(`Total documents: ${stats.count}\n`));

    if (stats.count === 0) {
      console.log(chalk.yellow('This collection is empty.'));
      return;
    }

    // Configuration de la pagination
    const pageSize = options.limit ? parseInt(options.limit) : DEFAULT_PAGE_SIZE;
    let currentPage = 0;
    let searchMode = false;
    let searchResults: any[] = [];
    let searchQuery = '';

    // Boucle interactive
    let shouldContinue = true;
    while (shouldContinue) {
      if (searchMode) {
        // Mode recherche
        await displaySearchResults(searchResults, searchQuery);
      } else {
        // Mode normal : afficher la page courante
        const offset = currentPage * pageSize;
        const documents = await getCollectionDocuments(sourceId, pageSize, offset);

        if (documents.length === 0 && currentPage > 0) {
          console.log(chalk.yellow('\nNo more documents to display.'));
          currentPage = Math.max(0, currentPage - 1);
          continue;
        }

        displayDocuments(documents, currentPage, pageSize, stats.count);
      }

      // Menu de navigation
      const totalPages = Math.ceil(stats.count / pageSize);
      const choices = [];

      if (!searchMode) {
        if (currentPage > 0) {
          choices.push({ name: '← Previous page', value: 'prev' });
        }
        if ((currentPage + 1) * pageSize < stats.count) {
          choices.push({ name: 'Next page →', value: 'next' });
        }
      }

      choices.push({ name: '🔎 Search', value: 'search' });

      if (searchMode) {
        choices.push({ name: '← Back to browse', value: 'back' });
      }

      choices.push({ name: '✖ Exit', value: 'exit' });

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices,
        },
      ]);

      switch (action) {
        case 'next':
          currentPage++;
          break;
        case 'prev':
          currentPage = Math.max(0, currentPage - 1);
          break;
        case 'search':
          const { query } = await inquirer.prompt([
            {
              type: 'input',
              name: 'query',
              message: 'Enter search query:',
              validate: (input) => (input.trim().length > 0 ? true : 'Query cannot be empty'),
            },
          ]);
          searchQuery = query;
          searchResults = await searchInCollectionByText(sourceId, query, 20);
          searchMode = true;
          break;
        case 'back':
          searchMode = false;
          searchResults = [];
          searchQuery = '';
          break;
        case 'exit':
          shouldContinue = false;
          break;
      }

      console.log(''); // Ligne vide pour la lisibilité
    }

    console.log(chalk.green('✓ Exiting browse mode.\n'));
  } catch (error: any) {
    console.error(chalk.red('Error browsing collection:'), error.message);
    process.exit(1);
  }
}

function displayDocuments(
  documents: any[],
  currentPage: number,
  pageSize: number,
  totalCount: number
) {
  const startIdx = currentPage * pageSize + 1;
  const endIdx = Math.min((currentPage + 1) * pageSize, totalCount);

  console.log(chalk.bold(`\n📄 Documents ${startIdx}-${endIdx} of ${totalCount}\n`));

  documents.forEach((doc, idx) => {
    const docNumber = startIdx + idx;
    console.log(chalk.bold.cyan(`[${docNumber}] ${doc.id}`));

    // Métadonnées
    if (doc.metadata.url) {
      console.log(`  ${chalk.dim('URL:')}   ${chalk.blue(doc.metadata.url)}`);
    }
    if (doc.metadata.title) {
      console.log(`  ${chalk.dim('Title:')} ${doc.metadata.title}`);
    }
    if (doc.metadata.h1) {
      console.log(`  ${chalk.dim('H1:')}    ${doc.metadata.h1}`);
    }
    if (doc.metadata.h2) {
      console.log(`  ${chalk.dim('H2:')}    ${doc.metadata.h2}`);
    }
    if (doc.metadata.h3) {
      console.log(`  ${chalk.dim('H3:')}    ${doc.metadata.h3}`);
    }

    // Extrait du contenu (100 premiers caractères)
    const contentPreview = doc.content.substring(0, 150).replace(/\n/g, ' ');
    console.log(`  ${chalk.dim('Content:')} ${contentPreview}${doc.content.length > 150 ? '...' : ''}`);
    console.log('');
  });
}

function displaySearchResults(results: any[], query: string) {
  console.log(chalk.bold(`\n🔎 Search results for: "${chalk.cyan(query)}"\n`));

  if (results.length === 0) {
    console.log(chalk.yellow('No results found.\n'));
    return;
  }

  console.log(chalk.dim(`Found ${results.length} result(s)\n`));

  results.forEach((result, idx) => {
    console.log(chalk.bold.cyan(`[${idx + 1}] Distance: ${result.distance.toFixed(4)}`));

    // Métadonnées
    if (result.metadata.url) {
      console.log(`  ${chalk.dim('URL:')}   ${chalk.blue(result.metadata.url)}`);
    }
    if (result.metadata.title) {
      console.log(`  ${chalk.dim('Title:')} ${result.metadata.title}`);
    }
    if (result.metadata.h1) {
      console.log(`  ${chalk.dim('H1:')}    ${result.metadata.h1}`);
    }

    // Extrait du contenu
    const contentPreview = result.content.substring(0, 150).replace(/\n/g, ' ');
    console.log(`  ${chalk.dim('Content:')} ${contentPreview}${result.content.length > 150 ? '...' : ''}`);
    console.log('');
  });
}
