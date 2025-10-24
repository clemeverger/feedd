import fs from 'fs/promises';
import path from 'path';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';

// Initialiser l'encodeur tiktoken pour compter les tokens
const encoder = encoding_for_model('gpt-4');

/**
 * Compte le nombre de tokens dans un texte
 */
function countTokens(text: string): number {
  const tokens = encoder.encode(text);
  return tokens.length;
}

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

// Configuration du splitter (sera mise à jour dynamiquement)
let textSplitter: RecursiveCharacterTextSplitter;

/**
 * Configure le chunker avec la taille max et l'overlap
 */
export function configureChunker(chunkSize: number, chunkOverlap: number): void {
  textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    lengthFunction: countTokens,
    separators: ['\n\n', '\n', '. ', ' ', ''], // Paragraphes > lignes > phrases > mots
  });
}

// Initialisation par défaut
configureChunker(1800, 270);

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

  // Construire les headers pour le contexte
  const headers = [frontmatter.h1, frontmatter.h2, frontmatter.h3].filter(Boolean).join(' > ');

  // Préparer le texte avec headers (pour que LangChain en tienne compte)
  const textToChunk = headers ? `${headers}\n\n${markdown}` : markdown;

  // Utiliser LangChain pour chunker intelligemment
  const textChunks = await textSplitter.createDocuments([textToChunk]);

  // Convertir en notre format de Chunk avec metadata
  const chunks: Chunk[] = textChunks.map((doc) => ({
    content: doc.pageContent,
    metadata: {
      source_id: sourceId,
      url: frontmatter.url || '',
      title: frontmatter.title || '',
      h1: frontmatter.h1,
      h2: frontmatter.h2,
      h3: frontmatter.h3,
      file_path: filePath,
    },
  }));

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
