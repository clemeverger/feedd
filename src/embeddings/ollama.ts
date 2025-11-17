import chalk from 'chalk';

export class OllamaEmbedder {
  model = 'mxbai-embed-large';
  dimensions = 1024;
  baseUrl = 'http://localhost:11434';

  /**
   * Generate embeddings for an array of texts
   * @param texts Array of text strings to embed
   * @returns Array of embedding vectors
   */
  async embed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches of 5 to avoid timeout
    const batchSize = 5;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const batchEmbeddings = await Promise.all(
        batch.map(text => this.embedSingle(text))
      );

      embeddings.push(...batchEmbeddings);

      // Show progress
      const progress = Math.min(i + batchSize, texts.length);
      console.log(chalk.dim(`  Embedded ${progress}/${texts.length} chunks`));
    }

    return embeddings;
  }

  /**
   * Generate embedding for a single text
   */
  private async embedSingle(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as { embedding: number[] };
      return data.embedding;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          'Cannot connect to Ollama. Make sure Ollama is running (ollama serve)'
        );
      }
      throw error;
    }
  }

  /**
   * Check if Ollama is available and the model is loaded
   * @returns True if Ollama is healthy and model is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { models?: Array<{ name: string }> };

      // Check if our model is available
      const models = data.models || [];
      const modelAvailable = models.some((m: any) =>
        m.name.includes(this.model) || m.name.includes('mxbai-embed')
      );

      return modelAvailable;
    } catch (error) {
      return false;
    }
  }

  /**
   * Display help message for setting up Ollama
   */
  static displaySetupHelp(): void {
    console.log(chalk.bold('\n📋 Ollama Setup Required\n'));
    console.log(chalk.yellow('Ollama is not running or the embedding model is not available.'));
    console.log(chalk.dim('\nTo set up Ollama:\n'));
    console.log(chalk.cyan('  1. Install Ollama:'));
    console.log(chalk.dim('     curl -fsSL https://ollama.com/install.sh | sh'));
    console.log(chalk.dim('     # Or on macOS: brew install ollama\n'));
    console.log(chalk.cyan('  2. Start Ollama:'));
    console.log(chalk.dim('     ollama serve\n'));
    console.log(chalk.cyan('  3. Pull the embedding model:'));
    console.log(chalk.dim('     ollama pull mxbai-embed-large\n'));
    console.log(chalk.dim('Once setup is complete, try running your command again.'));
  }

  /**
   * Ensure Ollama is running and the model is available
   * @throws Error if Ollama is not available
   */
  async ensureAvailable(): Promise<void> {
    if (!await this.checkHealth()) {
      OllamaEmbedder.displaySetupHelp();
      throw new Error('Ollama is not available');
    }
  }
}
