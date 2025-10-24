import { ChromaClient, Collection } from 'chromadb';
import { DefaultEmbeddingFunction } from '@chroma-core/default-embed';
import type { Chunk } from './chunker.js';
import { getChromaURL } from '../chroma/manager.js';

let client: ChromaClient | null = null;
let embeddingFunction: DefaultEmbeddingFunction | null = null;

export async function getChromaClient(): Promise<ChromaClient> {
  if (!client) {
    // Se connecter au serveur ChromaDB local
    const chromaUrl = new URL(getChromaURL());
    client = new ChromaClient({
      host: chromaUrl.hostname,
      port: parseInt(chromaUrl.port, 10),
      ssl: chromaUrl.protocol === 'https:',
    });
  }
  return client;
}

export async function getEmbeddingFunction(): Promise<DefaultEmbeddingFunction> {
  if (!embeddingFunction) {
    // Initialiser avec le modèle par défaut (Xenova/all-MiniLM-L6-v2)
    embeddingFunction = new DefaultEmbeddingFunction({
      modelName: 'Xenova/all-MiniLM-L6-v2',
    });

    // Précharger le modèle en générant un embedding test
    await embeddingFunction.generate(['test']);
  }
  return embeddingFunction;
}

export async function getOrCreateCollection(sourceId: string): Promise<Collection> {
  const client = await getChromaClient();
  const embeddingFunction = await getEmbeddingFunction();

  try {
    // Créer la collection avec l'embedding function par défaut
    return await client.getOrCreateCollection({
      name: sourceId,
      metadata: { 'hnsw:space': 'cosine' },
      embeddingFunction,
    });
  } catch (error: any) {
    throw new Error(`Failed to get or create collection: ${error.message}`);
  }
}

export async function addChunksToCollection(
  collection: Collection,
  chunks: Chunk[]
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  // Ajouter les chunks par petits lots pour éviter les timeouts
  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    // ChromaDB nécessite des IDs uniques
    const timestamp = Date.now();
    const ids = batchChunks.map((_, idx) => `chunk_${timestamp}_${i + idx}`);
    const documents = batchChunks.map((chunk) => chunk.content);
    const metadatas = batchChunks.map((chunk) => ({
      source_id: chunk.metadata.source_id,
      url: chunk.metadata.url,
      title: chunk.metadata.title,
      h1: chunk.metadata.h1 || '',
      h2: chunk.metadata.h2 || '',
      h3: chunk.metadata.h3 || '',
      file_path: chunk.metadata.file_path,
    }));

    try {
      // ChromaDB génère les embeddings automatiquement avec le modèle par défaut
      await collection.add({
        ids,
        documents,
        metadatas,
      });
      console.log(`  Indexed batch ${batchNumber}/${totalBatches} (${batchChunks.length} chunks)`);
    } catch (error: any) {
      throw new Error(`Failed to add chunks to collection (batch ${batchNumber}): ${error.message}`);
    }
  }
}

export async function deleteCollection(sourceId: string): Promise<void> {
  const client = await getChromaClient();

  try {
    await client.deleteCollection({ name: sourceId });
  } catch (error: any) {
    // Ignorer l'erreur si la collection n'existe pas
    const errorMessage = error.message?.toLowerCase() || '';
    if (!errorMessage.includes('does not exist') &&
        !errorMessage.includes('not found') &&
        !errorMessage.includes('could not be found')) {
      throw new Error(`Failed to delete collection: ${error.message}`);
    }
    // Sinon, on ignore silencieusement (la collection n'existait pas)
  }
}

/**
 * Recherche par texte - ChromaDB génère l'embedding automatiquement avec le modèle par défaut
 */
export async function searchInCollectionByText(
  sourceId: string,
  queryText: string,
  limit: number = 5
): Promise<any[]> {
  const client = await getChromaClient();
  const embeddingFunction = await getEmbeddingFunction();

  try {
    // Récupérer la collection avec l'embedding function
    const collection = await client.getCollection({
      name: sourceId,
      embeddingFunction,
    });

    // ChromaDB génère l'embedding de la query automatiquement
    const results = await collection.query({
      queryTexts: [queryText],
      nResults: limit,
    });

    // Formater les résultats
    const formatted = [];
    if (results.documents && results.documents[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        formatted.push({
          content: results.documents[0][i],
          metadata: results.metadatas?.[0]?.[i] || {},
          distance: results.distances?.[0]?.[i] || 0,
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
