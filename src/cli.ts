#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('feedd')
  .description('Local documentation crawler with RAG and MCP server for Claude Code')
  .version('0.1.0');

// Commande add
program
  .command('add')
  .description('Add a documentation source')
  .argument('<url>', 'URL to crawl')
  .option('-n, --name <name>', 'Custom name for the source')
  .option('-d, --depth <number>', 'Maximum crawl depth', '2')
  .option('-p, --pages <number>', 'Maximum pages to crawl', '100')
  .action(async (url, options) => {
    const { addCommand } = await import('./commands/add.js');
    await addCommand(url, options);
  });

// Commande list
program
  .command('list')
  .description('List all documentation sources')
  .action(async () => {
    const { listCommand } = await import('./commands/list.js');
    await listCommand();
  });

// Commande remove
program
  .command('remove')
  .description('Remove a documentation source')
  .argument('<id>', 'Source ID to remove')
  .action(async (id) => {
    const { removeCommand } = await import('./commands/remove.js');
    await removeCommand(id);
  });

// Commande update
program
  .command('update')
  .description('Update (re-crawl and re-index) a documentation source')
  .argument('<id>', 'Source ID to update')
  .action(async (id) => {
    const { updateCommand } = await import('./commands/update.js');
    await updateCommand(id);
  });

// Commande serve
program
  .command('serve')
  .description('Start the MCP server')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .action(async (options) => {
    const { serveCommand } = await import('./commands/serve.js');
    await serveCommand(options);
  });

// Error handling
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error: any) {
  if (error.code !== 'commander.help' && error.code !== 'commander.version') {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
