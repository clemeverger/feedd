import { Ollama } from 'ollama';

const ollama = new Ollama();

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    await ollama.list();
    return true;
  } catch {
    return false;
  }
}

export async function ensureModelAvailable(modelName: string): Promise<void> {
  try {
    const models = await ollama.list();
    const modelExists = models.models.some((m: any) => m.name === modelName || m.name === `${modelName}:latest`);

    if (!modelExists) {
      console.log(`Downloading model ${modelName}... (this may take a few minutes)`);
      await ollama.pull({ model: modelName, stream: false });
      console.log(`Model ${modelName} downloaded successfully`);
    }
  } catch (error: any) {
    throw new Error(`Failed to ensure model ${modelName}: ${error.message}`);
  }
}

export async function generateEmbedding(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
  try {
    const response = await ollama.embeddings({
      model,
      prompt: text
    });

    return response.embedding;
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

export async function generateEmbeddings(texts: string[], model: string = 'nomic-embed-text'): Promise<number[][]> {
  const embeddings: number[][] = [];

  // Générer les embeddings un par un pour éviter de surcharger Ollama
  for (const text of texts) {
    const embedding = await generateEmbedding(text, model);
    embeddings.push(embedding);
  }

  return embeddings;
}
