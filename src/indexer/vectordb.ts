import { ChromaClient, Collection } from 'chromadb';
import path from 'path';
import type { Chunk } from './chunker.js';

let client: ChromaClient | null = null;

export async function getChromaClient(): Promise<ChromaClient> {
  if (!client) {
    const dbPath = path.join(process.cwd(), 'data', 'vectordb');
    client = new ChromaClient({ path: dbPath });
  }
  return client;
}

export async function getOrCreateCollection(sourceId: string): Promise<Collection> {
  const client = await getChromaClient();

  try {
    return await client.getOrCreateCollection({
      name: sourceId,
      metadata: { 'hnsw:space': 'cosine' }
    });
  } catch (error: any) {
    throw new Error(`Failed to get or create collection: ${error.message}`);
  }
}

export async function addChunksToCollection(
  collection: Collection,
  chunks: Chunk[],
  embeddings: number[][]
): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error('Chunks and embeddings arrays must have the same length');
  }

  if (chunks.length === 0) {
    return;
  }

  // ChromaDB nécessite des IDs uniques
  const ids = chunks.map((_, idx) => `chunk_${Date.now()}_${idx}`);
  const documents = chunks.map(chunk => chunk.content);
  const metadatas = chunks.map(chunk => ({
    source_id: chunk.metadata.source_id,
    url: chunk.metadata.url,
    title: chunk.metadata.title,
    h1: chunk.metadata.h1 || '',
    h2: chunk.metadata.h2 || '',
    h3: chunk.metadata.h3 || '',
    file_path: chunk.metadata.file_path
  }));

  try {
    await collection.add({
      ids,
      embeddings,
      documents,
      metadatas
    });
  } catch (error: any) {
    throw new Error(`Failed to add chunks to collection: ${error.message}`);
  }
}

export async function deleteCollection(sourceId: string): Promise<void> {
  const client = await getChromaClient();

  try {
    await client.deleteCollection({ name: sourceId });
  } catch (error: any) {
    // Ignorer l'erreur si la collection n'existe pas
    if (!error.message.includes('does not exist')) {
      throw new Error(`Failed to delete collection: ${error.message}`);
    }
  }
}

export async function searchInCollection(
  sourceId: string,
  queryEmbedding: number[],
  limit: number = 5
): Promise<any[]> {
  const client = await getChromaClient();

  try {
    const collection = await client.getCollection({ name: sourceId });

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit
    });

    // Formater les résultats
    const formatted = [];
    if (results.documents && results.documents[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        formatted.push({
          content: results.documents[0][i],
          metadata: results.metadatas?.[0]?.[i] || {},
          distance: results.distances?.[0]?.[i] || 0
        });
      }
    }

    return formatted;
  } catch (error: any) {
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw new Error(`Failed to search in collection: ${error.message}`);
  }
}

export async function listCollections(): Promise<string[]> {
  const client = await getChromaClient();

  try {
    const collections = await client.listCollections();
    return collections.map((c: any) => c.name);
  } catch (error: any) {
    throw new Error(`Failed to list collections: ${error.message}`);
  }
}
