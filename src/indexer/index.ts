import path from 'path';
import type { Source } from '../config.js';
import { chunkMarkdownFiles, configureChunker } from './chunker.js';
import { getOrCreateCollection, addChunksToCollection, deleteCollection } from './vectordb.js';

export async function indexSource(source: Source): Promise<number> {
  // Configurer le chunker avec des valeurs par défaut
  const DEFAULT_CHUNK_SIZE = 1800;
  const DEFAULT_CHUNK_OVERLAP = 270;
  configureChunker(DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);
  console.log(
    `Config: ${DEFAULT_CHUNK_SIZE} tokens (overlap: ${DEFAULT_CHUNK_OVERLAP}), using ChromaDB default embeddings`
  );

  // Chemin vers les fichiers crawlés
  const rawDir = path.join(process.cwd(), 'data', 'raw', source.id);

  // Découper les fichiers en chunks
  const chunks = await chunkMarkdownFiles(source.id, rawDir);

  if (chunks.length === 0) {
    throw new Error('No content to index. Make sure the source was crawled successfully.');
  }

  // Supprimer l'ancienne collection si elle existe
  await deleteCollection(source.id);

  // Créer une nouvelle collection et ajouter les chunks
  // ChromaDB génère les embeddings automatiquement avec son modèle par défaut
  const collection = await getOrCreateCollection(source.id);
  await addChunksToCollection(collection, chunks);

  return chunks.length;
}

// Export pour la commande remove
export { deleteCollection };
