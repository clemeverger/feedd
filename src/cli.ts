#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';

const program = new Command();

program
  .name('feedd')
  .description('Local GitHub documentation indexer with RAG and MCP server for Claude Code')
  .version('0.1.3');

// Command: add
program
  .command('add')
  .description('Add and index a GitHub repository')
  .argument('<repo>', 'GitHub repository (owner/repo or owner/repo@branch)')
  .option('-b, --branch <branch>', 'Branch to index (default: main)')
  .action(async (repo, options) => {
    const { addCommand } = await import('./commands/add.js');
    await addCommand(repo, options);
  });

// Command: list
program
  .command('list')
  .description('List all indexed repositories')
  .action(async () => {
    const { listCommand } = await import('./commands/list.js');
    await listCommand();
  });

// Command: sync
program
  .command('sync')
  .description('Sync (re-pull and re-index) a repository')
  .argument('<repo>', 'Repository to sync (owner/repo or owner/repo@branch)')
  .option('-b, --branch <branch>', 'Branch to sync')
  .action(async (repo, options) => {
    const { syncCommand } = await import('./commands/sync.js');
    await syncCommand(repo, options);
  });

// Command: remove
program
  .command('remove')
  .description('Remove an indexed repository')
  .argument('<repo>', 'Repository to remove (owner/repo or owner/repo@branch)')
  .option('-b, --branch <branch>', 'Branch to remove')
  .action(async (repo, options) => {
    const { removeCommand } = await import('./commands/remove.js');
    await removeCommand(repo, options);
  });

// Command: search
program
  .command('search')
  .description('Search indexed documentation')
  .argument('<query>', 'Search query')
  .option('-r, --repo <repo>', 'Search in specific repository (owner/repo)')
  .option('-b, --branch <branch>', 'Search in specific branch')
  .option('-l, --limit <number>', 'Number of results (default: 10)')
  .action(async (query, options) => {
    const { searchCommand } = await import('./commands/search.js');
    await searchCommand(query, options);
  });

// Command: serve
program
  .command('serve')
  .description('Start MCP server for Claude Code')
  .option('-p, --port <number>', 'Port to listen on (not used for MCP)', '3000')
  .action(async (options) => {
    const { serveCommand } = await import('./commands/serve.js');
    await serveCommand(options);
  });

// Command: doctor
program
  .command('doctor')
  .description('Check system health (Ollama, LanceDB, indexed repos)')
  .action(async () => {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand();
  });

// Command: init
program
  .command('init')
  .description('Initialize CLAUDE.md and configure auto-approve for the current project')
  .action(async () => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand();
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
