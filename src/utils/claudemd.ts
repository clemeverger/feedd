import fs from 'fs/promises';
import path from 'path';
import { listSources, type Source } from '../config.js';

const FEEDD_SECTION_START = '## FEEDD Documentation';
const FEEDD_SECTION_END_MARKER = '\n## '; // Next section starts with ##

interface ClaudeMdOptions {
  projectPath?: string;
}

/**
 * Updates the FEEDD section in CLAUDE.md with current sources
 * If CLAUDE.md doesn't exist, creates it
 * If FEEDD section exists, updates it
 * Otherwise, appends it to the end
 */
export async function updateClaudeMd(options: ClaudeMdOptions = {}): Promise<void> {
  const projectPath = options.projectPath || process.cwd();
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');

  // Get current sources
  const sources = await listSources();

  // Generate FEEDD section content
  const feeddSection = generateFeeddSection(sources);

  try {
    // Try to read existing CLAUDE.md
    const existingContent = await fs.readFile(claudeMdPath, 'utf-8');

    // Check if FEEDD section already exists
    const sectionStartIndex = existingContent.indexOf(FEEDD_SECTION_START);

    if (sectionStartIndex !== -1) {
      // FEEDD section exists - replace it
      const beforeSection = existingContent.substring(0, sectionStartIndex);

      // Find the end of the FEEDD section (next ## heading or end of file)
      const afterSectionStart = existingContent.substring(sectionStartIndex + FEEDD_SECTION_START.length);
      const nextSectionIndex = afterSectionStart.indexOf(FEEDD_SECTION_END_MARKER);

      let afterSection = '';
      if (nextSectionIndex !== -1) {
        afterSection = afterSectionStart.substring(nextSectionIndex);
      }

      const newContent = beforeSection + feeddSection + afterSection;
      await fs.writeFile(claudeMdPath, newContent, 'utf-8');
    } else {
      // FEEDD section doesn't exist - append it
      const newContent = existingContent + '\n\n' + feeddSection;
      await fs.writeFile(claudeMdPath, newContent, 'utf-8');
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // CLAUDE.md doesn't exist - create it with just the FEEDD section
      await fs.writeFile(claudeMdPath, feeddSection, 'utf-8');
    } else {
      throw error;
    }
  }
}

/**
 * Generates the FEEDD section content with the list of sources
 */
function generateFeeddSection(sources: Source[]): string {
  let content = FEEDD_SECTION_START + '\n\n';
  content += '**Automatically use feedd for code generation and library documentation.**\n\n';

  if (sources.length === 0) {
    content += '*No documentation sources indexed yet. Add sources with `feedd add owner/repo@branch`.*\n';
    return content;
  }

  content += '### Available Sources\n\n';
  content += 'Use these sources with the MCP `search_docs` tool by specifying the source ID:\n\n';

  sources.forEach(source => {
    const status = getStatusEmoji(source.status);
    const chunks = source.docCount || 0;

    content += `- **${source.owner}/${source.repo}@${source.branch}** (source ID: \`${source.id}\`)\n`;
    content += `  - ${chunks} chunks indexed\n`;
    content += `  - Status: ${status} ${source.status}\n\n`;
  });

  return content;
}

/**
 * Returns an emoji representing the source status
 */
function getStatusEmoji(status: Source['status']): string {
  switch (status) {
    case 'ready':
      return '✓';
    case 'indexing':
      return '⏳';
    case 'error':
      return '✖';
    case 'pending':
      return '○';
    default:
      return '○';
  }
}

/**
 * Configures Claude Code settings to auto-approve feedd MCP tools
 */
export async function configureClaudeSettings(options: ClaudeMdOptions = {}): Promise<void> {
  const projectPath = options.projectPath || process.cwd();
  const claudeDir = path.join(projectPath, '.claude');
  const settingsLocalPath = path.join(claudeDir, 'settings.local.json');

  // Ensure .claude directory exists
  await fs.mkdir(claudeDir, { recursive: true });

  // Read existing settings.local.json or create new
  let settings: any = {};
  try {
    const existingSettings = await fs.readFile(settingsLocalPath, 'utf-8');
    settings = JSON.parse(existingSettings);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Configure permissions to auto-approve feedd MCP tools
  if (!settings.permissions) {
    settings.permissions = {
      allow: [],
      deny: [],
      ask: []
    };
  }

  // Add feedd tools to allow list if not already present
  const feeddTools = [
    'mcp__feedd__search_docs',
    'mcp__feedd__list_sources',
    'mcp__feedd__get_doc'
  ];

  if (!Array.isArray(settings.permissions.allow)) {
    settings.permissions.allow = [];
  }

  feeddTools.forEach(tool => {
    if (!settings.permissions.allow.includes(tool)) {
      settings.permissions.allow.push(tool);
    }
  });

  // Write settings.local.json back
  await fs.writeFile(settingsLocalPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}
