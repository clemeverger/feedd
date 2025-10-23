import path from 'path';
import type { Source } from '../config.js';
import { chunkMarkdownFiles } from './chunker.js';
import { checkOllamaAvailable, ensureModelAvailable, generateEmbeddings } from './embedder.js';
import { getOrCreateCollection, addChunksToCollection, deleteCollection } from './vectordb.js';
import { loadConfig } from '../config.js';

export async function indexSource(source: Source): Promise<number> {
  // Vérifier qu'Ollama est disponible
  const ollamaAvailable = await checkOllamaAvailable();
  if (!ollamaAvailable) {
    throw new Error(
      'Ollama is not available. Please make sure Ollama is installed and running.\n' +
      'Visit https://ollama.ai to download and install Ollama.'
    );
  }

  // Charger la config pour obtenir le modèle d'embedding
  const config = await loadConfig();
  const embeddingModel = config.embedding.model;

  // Vérifier que le modèle est disponible
  await ensureModelAvailable(embeddingModel);

  // Chemin vers les fichiers crawlés
  const rawDir = path.join(process.cwd(), 'data', 'raw', source.id);

  // Découper les fichiers en chunks
  const chunks = await chunkMarkdownFiles(source.id, rawDir);

  if (chunks.length === 0) {
    throw new Error('No content to index. Make sure the source was crawled successfully.');
  }

  // Générer les embeddings
  const texts = chunks.map(chunk => {
    // Inclure les headers dans le texte pour plus de contexte
    const headers = [
      chunk.metadata.h1,
      chunk.metadata.h2,
      chunk.metadata.h3
    ].filter(Boolean).join(' > ');

    return headers ? `${headers}\n\n${chunk.content}` : chunk.content;
  });

  const embeddings = await generateEmbeddings(texts, embeddingModel);

  // Supprimer l'ancienne collection si elle existe
  await deleteCollection(source.id);

  // Créer une nouvelle collection et ajouter les chunks
  const collection = await getOrCreateCollection(source.id);
  await addChunksToCollection(collection, chunks, embeddings);

  return chunks.length;
}

// Export pour la commande remove
export { deleteCollection };
