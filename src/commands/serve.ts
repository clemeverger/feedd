import chalk from 'chalk';
import { startChromaIfNeeded, stopChromaDB } from '../chroma/manager.js';

interface ServeOptions {
  port?: string;
}

export async function serveCommand(options: ServeOptions) {
  // Lancer ChromaDB automatiquement si nécessaire
  await startChromaIfNeeded();

  // Gérer l'arrêt propre de ChromaDB
  const cleanup = () => {
    stopChromaDB();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log(chalk.bold('\n🚀 Starting MCP Server\n'));

  try {
    const { startMCPServer } = await import('../mcp/server.js');
    await startMCPServer(options);

  } catch (error: any) {
    console.error(chalk.red('Error starting MCP server:'), error.message);
    stopChromaDB();
    process.exit(1);
  }
}
