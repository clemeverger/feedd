import chalk from 'chalk';
import { listSources } from '../config.js';

export async function listCommand() {
  try {
    const sources = await listSources();

    if (sources.length === 0) {
      console.log(chalk.yellow('No sources added yet.'));
      console.log(chalk.dim('\nUse "feedd add <url>" to add a documentation source.'));
      return;
    }

    console.log(chalk.bold('\nDocumentation Sources:\n'));

    for (const source of sources) {
      const statusColor = getStatusColor(source.status);
      const statusText = source.status.toUpperCase().padEnd(10);

      console.log(chalk.bold(source.name));
      console.log(`  ${chalk.dim('ID:')}       ${source.id}`);
      console.log(`  ${chalk.dim('URL:')}      ${source.url}`);
      console.log(`  ${chalk.dim('Status:')}   ${statusColor(statusText)}`);

      if (source.docCount) {
        console.log(`  ${chalk.dim('Docs:')}     ${source.docCount} documents`);
      }

      if (source.lastUpdated) {
        const date = new Date(source.lastUpdated).toLocaleDateString();
        console.log(`  ${chalk.dim('Updated:')}  ${date}`);
      }

      console.log('');
    }

    console.log(chalk.dim(`Total: ${sources.length} source(s)\n`));

  } catch (error: any) {
    console.error(chalk.red('Error listing sources:'), error.message);
    process.exit(1);
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ready':
      return chalk.green;
    case 'crawling':
    case 'indexing':
      return chalk.blue;
    case 'pending':
      return chalk.yellow;
    case 'error':
      return chalk.red;
    default:
      return chalk.white;
  }
}
