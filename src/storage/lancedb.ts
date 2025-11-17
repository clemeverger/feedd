import * as lancedb from '@lancedb/lancedb';
import * as arrow from 'apache-arrow';
import path from 'path';

export interface DocChunk {
  id: string;
  repo: string;
  branch: string;
  path: string;
  content: string;
  vector: number[];
  metadata: {
    source_id: string;
    title: string;
    h1?: string;
    h2?: string;
    h3?: string;
    tokens?: number;
    file_path: string;
  };
  indexed_at: string;
}

/**
 * Explicit Arrow schema for DocChunk
 * This prevents schema inference issues with nullable fields
 */
const DOC_CHUNK_SCHEMA = new arrow.Schema([
  new arrow.Field('id', new arrow.Utf8(), false),           // required
  new arrow.Field('repo', new arrow.Utf8(), false),         // required
  new arrow.Field('branch', new arrow.Utf8(), false),       // required
  new arrow.Field('path', new arrow.Utf8(), false),         // required
  new arrow.Field('content', new arrow.Utf8(), false),      // required
  new arrow.Field(
    'vector',
    new arrow.FixedSizeList(
      1024,  // mxbai-embed-large dimension
      new arrow.Field('item', new arrow.Float32(), true)
    ),
    false  // vector itself is required
  ),
  new arrow.Field(
    'metadata',
    new arrow.Struct([
      new arrow.Field('source_id', new arrow.Utf8(), false), // required
      new arrow.Field('title', new arrow.Utf8(), false),     // required
      new arrow.Field('h1', new arrow.Utf8(), true),         // nullable
      new arrow.Field('h2', new arrow.Utf8(), true),         // nullable
      new arrow.Field('h3', new arrow.Utf8(), true),         // nullable
      new arrow.Field('tokens', new arrow.Int32(), true),    // nullable
      new arrow.Field('file_path', new arrow.Utf8(), false), // required
    ]),
    false  // metadata struct itself is required
  ),
  new arrow.Field('indexed_at', new arrow.Utf8(), false),   // required
]);

export interface SearchResult {
  id: string;
  repo: string;
  branch: string;
  path: string;
  content: string;
  metadata: any;
  _distance: number;
}

let db: lancedb.Connection | null = null;

/**
 * Connect to LanceDB
 */
export async function connect(): Promise<lancedb.Connection> {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'data', 'lancedb');
    db = await lancedb.connect(dbPath);
  }
  return db;
}

/**
 * Add documents to a collection (create if doesn't exist)
 * @param repoId Unique identifier for the repo (e.g., "facebook-react-main")
 * @param documents Array of document chunks to add
 */
export async function addDocuments(
  repoId: string,
  documents: DocChunk[]
): Promise<void> {
  const connection = await connect();

  try {
    // Try to open existing table
    const table = await connection.openTable(repoId);
    await table.add(documents as any);
  } catch (error: any) {
    // Table doesn't exist, create it with explicit schema
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      await connection.createTable(repoId, documents as any, {
        schema: DOC_CHUNK_SCHEMA
      });
    } else {
      throw error;
    }
  }
}

/**
 * Search documents by vector similarity
 * @param repoId Repository identifier
 * @param queryVector Query embedding vector
 * @param limit Number of results to return
 * @returns Array of search results sorted by distance
 */
export async function search(
  repoId: string,
  queryVector: number[],
  limit: number = 10
): Promise<SearchResult[]> {
  const connection = await connect();

  try {
    const table = await connection.openTable(repoId);

    const results = await table
      .search(queryVector)
      .limit(limit)
      .toArray();

    return results.map((r: any) => ({
      id: r.id,
      repo: r.repo,
      branch: r.branch,
      path: r.path,
      content: r.content,
      metadata: r.metadata,
      _distance: r._distance
    }));
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      return [];
    }
    throw error;
  }
}

/**
 * Delete a table/collection
 * @param repoId Repository identifier
 */
export async function deleteTable(repoId: string): Promise<void> {
  const connection = await connect();

  try {
    await connection.dropTable(repoId);
  } catch (error: any) {
    // Ignore if table doesn't exist
    if (!error.message?.includes('not found') && !error.message?.includes('does not exist')) {
      throw error;
    }
  }
}

/**
 * List all tables in the database
 * @returns Array of table names
 */
export async function listTables(): Promise<string[]> {
  const connection = await connect();
  return await connection.tableNames();
}

/**
 * Get statistics for a specific table
 */
export async function getTableStats(repoId: string): Promise<{ count: number }> {
  const connection = await connect();

  try {
    const table = await connection.openTable(repoId);
    const count = await table.countRows();
    return { count };
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      return { count: 0 };
    }
    throw error;
  }
}
