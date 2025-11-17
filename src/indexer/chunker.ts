import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';
import type { ParsedMarkdown } from '../markdown/parser.js';

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
configureChunker(800, 100);

/**
 * Chunk parsed markdown documents
 * @param parsedDocs Array of parsed markdown documents
 * @param sourceId Source identifier (repo ID)
 * @returns Array of chunks with metadata
 */
export async function chunkParsedMarkdown(
  parsedDocs: ParsedMarkdown[],
  sourceId: string
): Promise<Chunk[]> {
  const allChunks: Chunk[] = [];

  for (const doc of parsedDocs) {
    const docChunks = await chunkSingleDocument(doc, sourceId);
    allChunks.push(...docChunks);
  }

  return allChunks;
}

/**
 * Chunk a single parsed markdown document
 */
async function chunkSingleDocument(
  doc: ParsedMarkdown,
  sourceId: string
): Promise<Chunk[]> {
  // Build header context
  const headers = [doc.metadata.h1, doc.metadata.h2, doc.metadata.h3]
    .filter(Boolean)
    .join(' > ');

  // Prepare text with headers (for better context in chunks)
  const textToChunk = headers ? `${headers}\n\n${doc.content}` : doc.content;

  // Use LangChain to chunk intelligently
  const textChunks = await textSplitter.createDocuments([textToChunk]);

  // Convert to our Chunk format with metadata
  const chunks: Chunk[] = textChunks.map((chunk) => ({
    content: chunk.pageContent,
    metadata: {
      source_id: sourceId,
      title: doc.metadata.title,
      h1: doc.metadata.h1,
      h2: doc.metadata.h2,
      h3: doc.metadata.h3,
      file_path: doc.relativePath
    }
  }));

  return chunks;
}
