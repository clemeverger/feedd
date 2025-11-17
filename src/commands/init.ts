import chalk from 'chalk';
import path from 'path';
import { listSources } from '../config.js';
import { updateClaudeMd, configureClaudeSettings } from '../utils/claudemd.js';

/**
 * Initialize CLAUDE.md and Claude Code settings for the current project
 */
export async function initCommand() {
  console.log(chalk.bold('\n📝 Initializing Feedd for this project\n'));

  try {
    const projectPath = process.cwd();

    // Get current sources
    const sources = await listSources();

    if (sources.length === 0) {
      console.log(chalk.yellow('⚠ No documentation sources indexed yet.'));
      console.log(chalk.dim('  Add sources first with: ') + chalk.cyan('feedd add owner/repo@branch'));
      console.log(chalk.dim('\n  Proceeding with initialization anyway...\n'));
    }

    // Update CLAUDE.md
    console.log(chalk.dim('Updating CLAUDE.md...'));
    await updateClaudeMd({ projectPath });
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    console.log(chalk.green('✓ CLAUDE.md updated'));
    console.log(chalk.dim(`  ${claudeMdPath}`));

    // Configure Claude Code settings
    console.log(chalk.dim('\nConfiguring Claude Code settings...'));
    await configureClaudeSettings({ projectPath });
    const settingsPath = path.join(projectPath, '.claude', 'settings.local.json');
    console.log(chalk.green('✓ Claude Code settings configured'));
    console.log(chalk.dim(`  ${settingsPath}`));

    // Summary
    console.log(chalk.bold('\n✨ Initialization complete!\n'));

    if (sources.length > 0) {
      console.log(chalk.dim('Available sources:'));
      sources.forEach(source => {
        const status = source.status === 'ready' ? chalk.green('✓') : chalk.yellow('⏳');
        console.log(`  ${status} ${source.owner}/${source.repo}@${source.branch} (${source.docCount || 0} chunks)`);
      });
      console.log('');
    }

    console.log(chalk.dim('The following has been configured:'));
    console.log(chalk.dim('  • FEEDD section added/updated in CLAUDE.md'));
    console.log(chalk.dim('  • Auto-approve enabled for feedd MCP tools'));
    console.log(chalk.dim('  • Sources list available to Claude Code\n'));

    console.log(chalk.dim('Next steps:'));
    if (sources.length === 0) {
      console.log(chalk.dim('  1. Add documentation sources: ') + chalk.cyan('feedd add owner/repo@branch'));
      console.log(chalk.dim('  2. Use feedd in Claude Code via MCP tools\n'));
    } else {
      console.log(chalk.dim('  • Use feedd in Claude Code via MCP tools'));
      console.log(chalk.dim('  • CLAUDE.md will auto-update when you add/remove sources\n'));
    }
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Error during initialization: ${error.message}`));
    process.exit(1);
  }
}
