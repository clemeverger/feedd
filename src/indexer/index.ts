import chalk from 'chalk';
import { cloneOrPull, findMarkdownFiles, generateRepoId } from '../git/index.js';
import { parseMarkdownFiles } from '../markdown/parser.js';
import { chunkParsedMarkdown, configureChunker } from './chunker.js';
import { OllamaEmbedder } from '../embeddings/ollama.js';
import { addDocuments, deleteTable } from '../storage/lancedb.js';
import type { DocChunk } from '../storage/lancedb.js';

/**
 * Index a GitHub repository
 * @param owner Repository owner
 * @param repo Repository name
 * @param branch Branch to index
 * @returns Number of chunks indexed
 */
export async function indexRepo(
  owner: string,
  repo: string,
  branch: string = 'main'
): Promise<number> {
  const repoId = generateRepoId(owner, repo, branch);

  console.log(chalk.bold(`\n📚 Indexing ${owner}/${repo}@${branch}`));

  // 1. Git clone/pull
  console.log(chalk.dim('\n📦 Step 1/6: Cloning repository...'));
  const repoPath = await cloneOrPull(owner, repo, branch);

  // 2. Find markdown files
  console.log(chalk.dim('\n🔍 Step 2/6: Finding markdown files...'));
  const mdFiles = await findMarkdownFiles(repoPath);

  if (mdFiles.length === 0) {
    throw new Error(`No markdown files found in ${owner}/${repo}@${branch}`);
  }

  console.log(chalk.green(`  ✓ Found ${mdFiles.length} markdown files`));

  // 3. Parse markdown
  console.log(chalk.dim('\n📄 Step 3/6: Parsing markdown...'));
  const parsedDocs = await parseMarkdownFiles(mdFiles, repoPath);
  console.log(chalk.green(`  ✓ Parsed ${parsedDocs.length} documents`));

  // 4. Chunk documents
  console.log(chalk.dim('\n✂️  Step 4/6: Chunking documents...'));

  // Configure chunker (800 tokens per chunk, 100 tokens overlap)
  const CHUNK_SIZE = 800;
  const CHUNK_OVERLAP = 100;
  configureChunker(CHUNK_SIZE, CHUNK_OVERLAP);

  const chunks = await chunkParsedMarkdown(parsedDocs, repoId);

  if (chunks.length === 0) {
    throw new Error('No content to index after chunking');
  }

  console.log(chalk.green(`  ✓ Created ${chunks.length} chunks`));

  // 5. Generate embeddings
  console.log(chalk.dim('\n🧠 Step 5/6: Generating embeddings with Ollama...'));
  const embedder = new OllamaEmbedder();

  // Ensure Ollama is available
  await embedder.ensureAvailable();

  const vectors = await embedder.embed(chunks.map(c => c.content));

  // 6. Store in LanceDB
  console.log(chalk.dim('\n💾 Step 6/6: Storing in LanceDB...'));

  // Delete old table if exists
  await deleteTable(repoId);

  // Prepare documents
  const documents: DocChunk[] = chunks.map((chunk, i) => ({
    id: `${repoId}-${i}`,
    repo: `${owner}/${repo}`,
    branch,
    path: chunk.metadata.file_path || '',
    content: chunk.content,
    vector: vectors[i],
    metadata: {
      source_id: chunk.metadata.source_id,
      title: chunk.metadata.title,
      h1: chunk.metadata.h1,
      h2: chunk.metadata.h2,
      h3: chunk.metadata.h3,
      file_path: chunk.metadata.file_path,
      tokens: chunk.content.split(/\s+/).length
    },
    indexed_at: new Date().toISOString()
  }));

  await addDocuments(repoId, documents);

  console.log(chalk.bold.green(`\n✅ Successfully indexed ${chunks.length} chunks!\n`));

  return chunks.length;
}

/**
 * Delete a repository index
 */
export async function removeRepo(owner: string, repo: string, branch: string): Promise<void> {
  const repoId = generateRepoId(owner, repo, branch);
  await deleteTable(repoId);
}
