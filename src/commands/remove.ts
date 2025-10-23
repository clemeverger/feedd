import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { removeSource, getSource } from '../config.js';

export async function removeCommand(id: string) {
  const spinner = ora(`Removing source "${id}"...`).start();

  try {
    // Vérifier que la source existe
    const source = await getSource(id);
    if (!source) {
      spinner.fail(chalk.red(`Source "${id}" not found`));
      console.log(chalk.dim('\nUse "feedd list" to see available sources.'));
      process.exit(1);
    }

    // Supprimer les fichiers crawlés
    const rawPath = path.join(process.cwd(), 'data', 'raw', id);
    try {
      await fs.rm(rawPath, { recursive: true, force: true });
      spinner.text = `Removed data files for "${id}"...`;
    } catch (error) {
      // Ignorer si le dossier n'existe pas
    }

    // Supprimer de la config
    await removeSource(id);

    // Supprimer de ChromaDB
    try {
      const { deleteCollection } = await import('../indexer/index.js');
      await deleteCollection(id);
    } catch (error) {
      // Ignorer si la collection n'existe pas
    }

    spinner.succeed(chalk.green(`Successfully removed "${source.name}"`));

    console.log(chalk.dim(`\nSource ID: ${id}`));
    console.log(chalk.dim('All associated data has been deleted.'));

  } catch (error: any) {
    spinner.fail(chalk.red('Error removing source'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}
