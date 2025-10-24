import chalk from 'chalk';
import { ensureChromaRunning } from '../chroma/manager.js';

interface ServeOptions {
  port?: string;
}

export async function serveCommand(options: ServeOptions) {
  // Vérifier que ChromaDB est accessible
  await ensureChromaRunning();

  console.log(chalk.bold('\n🚀 Starting MCP Server\n'));

  try {
    const { startMCPServer } = await import('../mcp/server.js');
    await startMCPServer(options);

  } catch (error: any) {
    console.error(chalk.red('Error starting MCP server:'), error.message);
    process.exit(1);
  }
}
