import fs from 'fs/promises';
import path from 'path';

export interface Chunk {
  content: string;
  metadata: {
    source_id: string;
    url: string;
    title: string;
    h1?: string;
    h2?: string;
    h3?: string;
    file_path: string;
  };
}

export async function chunkMarkdownFiles(sourceId: string, rawDir: string): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  // Lire tous les fichiers .md
  const files = await getAllMarkdownFiles(rawDir);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const fileChunks = await chunkMarkdownFile(content, file, sourceId);
    chunks.push(...fileChunks);
  }

  return chunks;
}

async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignorer les erreurs de lecture (permissions, etc.)
    }
  }

  await walk(dir);
  return files;
}

async function chunkMarkdownFile(content: string, filePath: string, sourceId: string): Promise<Chunk[]> {
  // Parser le frontmatter
  const { frontmatter, markdown } = parseFrontmatter(content);

  // Découper par sections (H2 et H3)
  const sections = splitBySections(markdown);

  const chunks: Chunk[] = [];

  for (const section of sections) {
    // Ne pas créer de chunk vide
    if (section.content.trim().length < 50) {
      continue;
    }

    chunks.push({
      content: section.content,
      metadata: {
        source_id: sourceId,
        url: frontmatter.url || '',
        title: frontmatter.title || '',
        h1: frontmatter.h1 || section.h1,
        h2: section.h2,
        h3: section.h3,
        file_path: filePath
      }
    });
  }

  return chunks;
}

function parseFrontmatter(content: string): { frontmatter: any; markdown: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, markdown: content };
  }

  const frontmatterText = match[1];
  const markdown = match[2];

  // Parser le YAML simple (key: value)
  const frontmatter: any = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, markdown };
}

interface Section {
  content: string;
  h1?: string;
  h2?: string;
  h3?: string;
}

function splitBySections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];

  let currentH1: string | undefined;
  let currentH2: string | undefined;
  let currentH3: string | undefined;
  let currentContent: string[] = [];

  function flushSection() {
    if (currentContent.length > 0) {
      sections.push({
        content: currentContent.join('\n').trim(),
        h1: currentH1,
        h2: currentH2,
        h3: currentH3
      });
      currentContent = [];
    }
  }

  for (const line of lines) {
    // Détecter les headers
    if (line.startsWith('# ')) {
      flushSection();
      currentH1 = line.replace(/^#\s+/, '').trim();
      currentH2 = undefined;
      currentH3 = undefined;
    } else if (line.startsWith('## ')) {
      flushSection();
      currentH2 = line.replace(/^##\s+/, '').trim();
      currentH3 = undefined;
    } else if (line.startsWith('### ')) {
      flushSection();
      currentH3 = line.replace(/^###\s+/, '').trim();
    } else {
      currentContent.push(line);
    }
  }

  // Flush dernier chunk
  flushSection();

  return sections;
}
