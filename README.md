# 🧠 Feedd

A local GitHub documentation indexer with RAG (Retrieval-Augmented Generation) and MCP server for Claude Code.

**Zero hallucination. Zero latency. Zero cloud.**

## 🎯 What is Feedd?

Feedd is a CLI tool that:

1. **Clones** GitHub repositories and extracts Markdown documentation
2. **Indexes** the content using local embeddings (Ollama)
3. **Stores** vectors in a local file-based database (LanceDB)
4. **Serves** an MCP server for Claude Code to query the docs

Your AI doesn't guess anymore — it consults the exact docs from your stack, directly from source repositories.

## 📦 Installation

### Prerequisites

1. **Node.js** 18+ and **pnpm**
2. **Ollama** - Install from [ollama.com](https://ollama.com)
3. **Embedding Model** - Pull the model: `ollama pull mxbai-embed-large`

### Install Feedd

```bash
git clone https://github.com/yourusername/feedd.git
cd feedd
pnpm install
pnpm build
pnpm link --global
```

**Note:** Make sure Ollama is running before using Feedd. Run `ollama serve` if it's not already running.

## 🚀 Quick Start

### 1. Add a GitHub repository

```bash
feedd add facebook/react
```

This will:
- Clone the React repository
- Extract and parse all Markdown files
- Generate embeddings using Ollama (mxbai-embed-large)
- Store in local LanceDB database

You can also specify a branch:

```bash
feedd add facebook/react@v18.2.0
```

### 2. List your indexed repositories

```bash
feedd list
```

### 3. Start the MCP server

```bash
feedd serve
```

The MCP server will be ready to answer queries from Claude Code. Use `Ctrl+C` to stop.

### 4. Configure Claude Code

Add to your Claude Code MCP settings (`~/.config/claude/mcp.json` or via Claude Code UI):

```json
{
  "mcpServers": {
    "feedd": {
      "command": "feedd",
      "args": ["serve"]
    }
  }
}
```

Now Claude Code can search your indexed documentation!

## 📚 Commands

### `feedd add <repo>`

Add and index a GitHub repository.

```bash
feedd add facebook/react
feedd add vercel/next.js@canary
feedd add tailwindlabs/tailwindcss --branch v3
```

**Options:**

- `-b, --branch <branch>` - Branch to index (default: main)

### `feedd list`

List all indexed repositories with their branches.

```bash
feedd list
```

Shows repository names, branches, chunk counts, and last update times.

### `feedd sync <repo>`

Re-pull and re-index a repository to get the latest docs.

```bash
feedd sync facebook/react
feedd sync vercel/next.js@canary
```

**Options:**

- `-b, --branch <branch>` - Branch to sync

### `feedd remove <repo>`

Remove a repository and delete all associated data.

```bash
feedd remove facebook/react
feedd remove facebook/react@v18.2.0
```

**Options:**

- `-b, --branch <branch>` - Specific branch to remove

### `feedd search <query>`

Search indexed documentation from the CLI.

```bash
feedd search "useEffect cleanup"
feedd search "hooks" --repo facebook/react --limit 10
```

**Options:**

- `-r, --repo <repo>` - Search in specific repository (owner/repo)
- `-b, --branch <branch>` - Search in specific branch
- `-l, --limit <number>` - Number of results (default: 10)

### `feedd serve`

Start the MCP server for Claude Code.

```bash
feedd serve
```

### `feedd doctor`

Check system health (Ollama, LanceDB, indexed repositories).

```bash
feedd doctor
```

Verifies that Ollama is running, the embedding model is available, and all indexed repositories are accessible.

## 🛠️ MCP Tools

Feedd exposes 3 tools to Claude Code:

### 1. `list_sources()`

Lists all indexed GitHub repositories.

**Returns:**

```json
[
  {
    "id": "facebook-react-main",
    "repo": "facebook/react",
    "branch": "main",
    "lastUpdated": "2025-01-15T10:30:00Z",
    "docCount": 142,
    "status": "ready"
  }
]
```

### 2. `search_docs(query, source?, limit?)`

Search documentation using vector similarity.

**Parameters:**

- `query` (string, required) - The search query
- `source` (string, optional) - Filter by source ID (e.g., "facebook-react-main")
- `limit` (number, optional) - Max results (default: 5)

**Returns:**

```json
[
  {
    "id": "abc123",
    "repo": "facebook/react",
    "branch": "main",
    "path": "docs/hooks-reference.md",
    "content": "The useEffect Hook lets you...",
    "metadata": {
      "title": "useEffect",
      "h1": "Hooks Reference",
      "h2": "useEffect",
      "h3": "Basic usage"
    },
    "_distance": 0.23
  }
]
```

### 3. `get_doc(repo, branch, path)`

Retrieve the full Markdown content of a documentation file.

**Parameters:**

- `repo` (string, required) - Repository name (e.g., "facebook/react")
- `branch` (string, required) - Branch name (e.g., "main")
- `path` (string, required) - Relative path to the markdown file (e.g., "docs/hooks-reference.md")

**Returns:** Full Markdown content of the file.

## 📁 Project Structure

```
feedd/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── config.ts           # Config management
│   ├── commands/           # CLI commands
│   │   ├── add.ts          # Add and index repository
│   │   ├── list.ts         # List indexed repositories
│   │   ├── sync.ts         # Sync (re-index) repository
│   │   ├── remove.ts       # Remove repository
│   │   ├── search.ts       # Search from CLI
│   │   ├── serve.ts        # Start MCP server
│   │   └── doctor.ts       # Health check
│   ├── git/                # Git operations
│   │   └── index.ts        # Clone, pull, find .md files
│   ├── markdown/           # Markdown parser
│   │   └── parser.ts       # Parse .md with frontmatter
│   ├── embeddings/         # Ollama embeddings
│   │   └── ollama.ts       # Generate embeddings
│   ├── storage/            # LanceDB storage
│   │   └── lancedb.ts      # Vector database operations
│   ├── indexer/            # RAG indexer
│   │   ├── chunker.ts      # Markdown chunking
│   │   └── index.ts        # Main indexing flow
│   └── mcp/                # MCP server
│       └── server.ts       # MCP protocol implementation
├── data/
│   ├── repos/              # Cloned GitHub repositories
│   │   └── {owner}/{repo}/{branch}/
│   └── lancedb/            # LanceDB vector database
└── feedd.config.json       # User configuration
```

## ⚙️ Configuration

The `feedd.config.json` file is automatically created in your project directory:

```json
{
  "sources": [
    {
      "id": "facebook-react-main",
      "owner": "facebook",
      "repo": "react",
      "branch": "main",
      "addedAt": "2025-01-15T10:30:00Z",
      "lastUpdated": "2025-01-15T12:00:00Z",
      "status": "ready",
      "docCount": 142
    }
  ],
  "vectordb": {
    "type": "lancedb",
    "path": "./data/lancedb"
  }
}
```

## 🎯 Example Usage with Claude Code

Once Feedd is configured in Claude Code, you can ask:

**User:** "How do I use useEffect with cleanup in React?"

**Claude Code:**

1. Calls `search_docs("useEffect cleanup", "facebook-react-main")`
2. Receives relevant chunks from the indexed React repository
3. Answers based on the exact documentation from the source repository

You can index multiple versions of the same library:

```bash
feedd add facebook/react@main
feedd add facebook/react@v18.2.0
feedd add facebook/react@v17.0.2
```

Claude Code can then search across all versions or target specific ones.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT

## 🙏 Credits

- [LanceDB](https://lancedb.com/) - Fast, embedded vector database
- [Ollama](https://ollama.com/) - Local LLM and embeddings runtime
- [simple-git](https://github.com/steveukx/git-js) - Git operations in Node.js
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol

---

Made with ❤️ for better AI-assisted development
