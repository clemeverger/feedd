import chalk from 'chalk';
import { OllamaEmbedder } from '../embeddings/ollama.js';
import { listTables, connect } from '../storage/lancedb.js';
import { listSources } from '../config.js';

export async function doctorCommand() {
  console.log(chalk.bold('\n🏥 Feedd Health Check\n'));

  let allGood = true;

  // Check 1: Ollama
  console.log(chalk.bold('Checking Ollama...'));
  const embedder = new OllamaEmbedder();

  if (await embedder.checkHealth()) {
    console.log(chalk.green('  ✓ Ollama is running'));
    console.log(chalk.dim(`    Model: ${embedder.model}`));
    console.log(chalk.dim(`    Dimensions: ${embedder.dimensions}`));
  } else {
    console.log(chalk.red('  ✖ Ollama is not available'));
    console.log(chalk.dim('    Start with: ollama serve'));
    console.log(chalk.dim('    Pull model: ollama pull mxbai-embed-large'));
    allGood = false;
  }

  console.log('');

  // Check 2: LanceDB
  console.log(chalk.bold('Checking LanceDB...'));
  try {
    await connect();
    const tables = await listTables();
    console.log(chalk.green('  ✓ LanceDB is connected'));
    console.log(chalk.dim(`    Database: ./data/lancedb`));
    console.log(chalk.dim(`    Tables: ${tables.length}`));
  } catch (error: any) {
    console.log(chalk.red('  ✖ LanceDB error'));
    console.log(chalk.dim(`    ${error.message}`));
    allGood = false;
  }

  console.log('');

  // Check 3: Indexed repositories
  console.log(chalk.bold('Checking indexed repositories...'));
  try {
    const sources = await listSources();
    const ready = sources.filter(s => s.status === 'ready').length;
    const total = sources.length;

    if (total === 0) {
      console.log(chalk.yellow('  ⚠ No repositories indexed yet'));
      console.log(chalk.dim('    Add one with: feedd add owner/repo'));
    } else {
      console.log(chalk.green(`  ✓ ${ready}/${total} repositories ready`));

      // Show repos
      sources.forEach(source => {
        const statusIcon = source.status === 'ready' ? '✓' : '⏳';
        const statusColor = source.status === 'ready' ? chalk.green : chalk.yellow;
        console.log(
          chalk.dim(`    ${statusIcon} ${source.owner}/${source.repo}@${source.branch} - ${source.docCount || 0} chunks`)
        );
      });
    }
  } catch (error: any) {
    console.log(chalk.red('  ✖ Error loading sources'));
    console.log(chalk.dim(`    ${error.message}`));
    allGood = false;
  }

  // Final verdict
  console.log('');
  if (allGood) {
    console.log(chalk.bold.green('✅ Everything looks good!\n'));
  } else {
    console.log(chalk.bold.red('❌ Some issues need attention\n'));
    process.exit(1);
  }
}
