# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

**Use pnpm exclusively** - this project requires pnpm (specified in package.json: `"packageManager": "pnpm@10.4.1"`).

## Development Commands

```bash
# Build TypeScript to dist/
pnpm build

# Run CLI in development mode (without building)
pnpm dev

# Run the built CLI
pnpm start
```

## Testing Commands

This project uses the built CLI for testing. After making changes:

```bash
pnpm build
pnpm link --global     # Make 'feedd' available globally
feedd serve            # Test the MCP server
```

## Architecture Overview

Feedd is a GitHub documentation indexer with RAG (Retrieval-Augmented Generation) that provides indexed documentation to Claude Code via MCP (Model Context Protocol).

### Data Flow

1. **Git Operations** (`src/git/index.ts`): Clone or pull GitHub repository → find all Markdown files → extract file paths
2. **Parsing** (`src/markdown/parser.ts`): Parse .md files → extract frontmatter metadata → extract content with header hierarchy
3. **Chunking** (`src/indexer/chunker.ts`): Split parsed Markdown → RecursiveCharacterTextSplitter with tiktoken → 800 tokens per chunk, 100 token overlap
4. **Embedding** (`src/embeddings/ollama.ts`): Generate embeddings via Ollama API → mxbai-embed-large model (1024 dimensions)
5. **Storage** (`src/storage/lancedb.ts`): Store chunks with vectors in LanceDB → file-based database (no server required)
6. **Serving** (`src/mcp/server.ts`): MCP server exposes tools → Claude Code queries → generate query embedding → vector similarity search in LanceDB → return relevant chunks

### Core Components

**Config Management** (`src/config.ts`)

- Manages `feedd.config.json` in project root
- Stores source metadata (owner, repo, branch, status, docCount)
- Source IDs generated from repo spec (e.g., `facebook-react-main`)
- Functions: `addSource()`, `removeSource()`, `getSource()`, `listSources()`, `updateSource()`, `listRepos()`

**Git Operations** (`src/git/index.ts`)

- `cloneOrPull()`: Clone repository if not exists, otherwise pull latest changes
  - Uses `simple-git` library
  - Clones with `--depth 1` for efficiency
  - Supports branch-specific operations
- `findMarkdownFiles()`: Recursively find all .md files in repository
- `parseRepoSpec()`: Parse "owner/repo@branch" format
- `generateRepoId()`: Generate unique ID for repo/branch combination

**Markdown Parser** (`src/markdown/parser.ts`)

- Parses Markdown files with frontmatter extraction (using `gray-matter`)
- Extracts header hierarchy (h1, h2, h3) while parsing content
- Returns `ParsedMarkdown` with: content, metadata (from frontmatter), relativePath, headers
- Preserves context for chunking

**Embeddings** (`src/embeddings/ollama.ts`)

- `OllamaEmbedder` class interfaces with Ollama API
- Model: mxbai-embed-large (1024 dimensions, 8192 token context window)
- `embed(texts: string[])`: Generate embeddings for text array
- `checkHealth()`: Verify Ollama is running and model is available
- Batch processing for efficiency

**Storage** (`src/storage/lancedb.ts`)

- File-based vector database (no server required)
- `DocChunk` schema: id, repo, branch, path, content, vector, metadata, indexed_at
- `addDocuments()`: Batch insert chunks with vectors
- `search()`: Vector similarity search with distance scoring
- `deleteTable()`: Remove entire table for a source
- `listTables()`: List all indexed sources
- Uses cosine distance for similarity

**Indexer** (`src/indexer/`)

- `chunker.ts`: Uses RecursiveCharacterTextSplitter with tiktoken (GPT-4 encoder)
  - Default: 800 tokens per chunk, 100 token overlap
  - Preserves headers (h1, h2, h3) in chunk metadata
  - `chunkParsedMarkdown()`: Takes parsed markdown array, returns chunks with metadata
- `index.ts`: Main indexing orchestration
  - `indexRepo()`: Git clone → parse .md → chunk → embed → store in LanceDB
  - Batch processing for embeddings (10 at a time)
  - Progress tracking with ora spinner

**MCP Server** (`src/mcp/server.ts`)

- Implements MCP protocol via stdio transport
- Exposes 3 tools to Claude Code:
  1. `list_sources()`: Lists all indexed GitHub repositories
  2. `search_docs(query, source?, limit?)`: Vector similarity search
     - Generates query embedding via Ollama
     - Searches LanceDB tables
     - Returns chunks sorted by distance
  3. `get_doc(repo, branch, path)`: Retrieves full Markdown file content
     - Reads from `data/repos/{owner}/{repo}/{branch}/{path}`

**CLI Commands** (`src/commands/`)

- `add.ts`: Parse repo spec → git clone/pull → index → update config
- `sync.ts`: Re-pull → re-index existing repository
- `remove.ts`: Delete LanceDB table → remove from config → delete cloned files
- `list.ts`: Display all repositories grouped by owner/repo with branch details
- `search.ts`: CLI search interface (query → embed → search LanceDB → display results)
- `doctor.ts`: Health check for Ollama, embedding model, LanceDB, and indexed repos
- `serve.ts`: Start MCP server → handle shutdown

### Directory Structure

```
data/
├── repos/                  # Cloned GitHub repositories
│   └── {owner}/{repo}/{branch}/   # e.g., facebook/react/main/
└── lancedb/                # LanceDB vector database (file-based)
    └── {source_id}.lance/  # e.g., facebook-react-main.lance/
feedd.config.json           # User configuration (sources list)
```

## Important Implementation Details

**ESM Modules**: This project uses ES modules (`"type": "module"`). All imports must use `.js` extensions even for TypeScript files (TypeScript requirement for ESM).

**Ollama Dependency**: Ollama must be running locally with mxbai-embed-large model installed. Use `ollama serve` to start Ollama and `ollama pull mxbai-embed-large` to download the model. The `doctor` command verifies this.

**LanceDB Storage**: File-based vector database with no server process required. Tables are stored as `.lance` directories in `data/lancedb/`. Uses Apache Arrow format for efficient storage and retrieval.

**Token Counting**: Uses tiktoken with GPT-4 encoder (cl100k_base) to accurately count tokens for chunking. Chunk size is 800 tokens (optimized for mxbai-embed-large's 8192 token context window) with 100 token overlap.

**Metadata Preservation**: Markdown frontmatter and header hierarchy (h1, h2, h3) are preserved through the entire pipeline: Git clone → parse → chunk → index → search results. This provides rich context for retrieved chunks.

**Multi-Branch Support**: The same repository can be indexed at multiple branches (e.g., facebook/react@main, facebook/react@v18.2.0), allowing version-specific documentation queries.

**Error Handling**: Commands gracefully handle missing Ollama, missing models, Git errors, and file system errors with clear user messages and actionable suggestions.

## Common Development Workflows

**Adding a new CLI command**:

1. Create handler in `src/commands/{name}.ts`
2. Export async function (e.g., `export async function myCommand(args)`)
3. Register in `src/cli.ts` with Commander
4. Rebuild: `pnpm build`

**Modifying chunking strategy**:

- Edit `src/indexer/chunker.ts`
- Update `DEFAULT_CHUNK_SIZE` and `DEFAULT_CHUNK_OVERLAP` constants
- Re-index existing repositories: `feedd sync {owner/repo@branch}`

**Testing with a repository**:

```bash
pnpm build
feedd doctor                          # Verify Ollama is running
feedd add facebook/react@main         # Index React docs
feedd search "useEffect hooks"        # Test search
feedd serve                           # Start MCP server
```

**Debugging MCP server**:

- MCP logs to stderr (visible in Claude Code)
- Check `feedd doctor` output for Ollama/model status
- Use `feedd search` to test queries outside of MCP
- Test tools directly via MCP inspector (if available) or through Claude Code

**Changing embedding model**:

- Update `model` and `dimensions` in `src/embeddings/ollama.ts`
- Pull new model: `ollama pull {model_name}`
- Update chunk size if needed (different models have different context windows)
- Re-index all repositories: `feedd sync {repo}` for each source
- Note: Embeddings are model-specific and not portable

**Working with Git operations**:

- Repositories are cloned with `--depth 1` for efficiency
- Use `simple-git` for all Git operations (already wrapped in `src/git/index.ts`)
- Branch switching is handled by cloning to separate directories: `data/repos/{owner}/{repo}/{branch}/`

**FEEDD**
Automatically use feedd for code generation and library documentation.


## FEEDD Documentation

**Automatically use feedd for code generation and library documentation.**

### Available Sources

Use these sources with the MCP `search_docs` tool by specifying the source ID:

- **TanStack/query@main** (source ID: `tanstack-query-main`)
  - 513 chunks indexed
  - Status: ✓ ready

- **TanStack/Form@main** (source ID: `tanstack-form-main`)
  - 439 chunks indexed
  - Status: ✓ ready

- **TanStack/Router@main** (source ID: `tanstack-router-main`)
  - 702 chunks indexed
  - Status: ✓ ready

- **upstash/context7@master** (source ID: `upstash-context7-master`)
  - 185 chunks indexed
  - Status: ✓ ready

