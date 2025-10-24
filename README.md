# 🧠 Feedd

A local documentation crawler with RAG (Retrieval-Augmented Generation) and MCP server for Claude Code.

**Zero hallucination. Zero latency. Zero cloud.**

## 🎯 What is Feedd?

Feedd is a CLI tool that:

1. **Crawls** documentation websites and converts them to Markdown
2. **Indexes** the content using local embeddings (ChromaDB)
3. **Stores** vectors in a local ChromaDB database
4. **Serves** an MCP server for Claude Code to query the docs

Your AI doesn't guess anymore — it consults the exact docs from your stack.

## 📦 Installation

### Prerequisites

1. **Node.js** 18+ and **pnpm**
2. **ChromaDB** - Install via pip: `pip install chromadb`

### Install Feedd

```bash
git clone https://github.com/yourusername/feedd.git
cd feedd
pnpm install
pnpm build
pnpm link --global
```

**Note:** ChromaDB will start automatically when you run `feedd serve` - no need to start it manually!

## 🚀 Quick Start

### 1. Add a documentation source

```bash
feedd add https://react.dev/reference
```

This will:
- Crawl the React documentation
- Generate embeddings using ChromaDB's default embedding model
- Store in local vector database

### 2. List your sources

```bash
feedd list
```

### 3. Start the MCP server (with automatic ChromaDB startup)

```bash
feedd serve
```

ChromaDB will start automatically if not already running. Use `Ctrl+C` to stop both the MCP server and ChromaDB.

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

### `feedd add <url>`

Add and index a documentation source.

```bash
feedd add https://nextjs.org/docs
feedd add https://tailwindcss.com/docs --name "Tailwind CSS" --depth 3
```

**Options:**

- `-n, --name <name>` - Custom name for the source
- `-d, --depth <number>` - Maximum crawl depth (default: 2)
- `-p, --pages <number>` - Maximum pages to crawl (default: 100)

### `feedd list`

List all indexed sources with their status.

```bash
feedd list
```

### `feedd update <id>`

Re-crawl and re-index a source to get the latest docs.

```bash
feedd update react-dev-reference
```

### `feedd remove <id>`

Remove a source and delete all associated data.

```bash
feedd remove react-dev-reference
```

### `feedd serve`

Start the MCP server for Claude Code.

```bash
feedd serve
```

## 🛠️ MCP Tools

Feedd exposes 3 tools to Claude Code:

### 1. `list_sources()`

Lists all indexed documentation sources.

**Returns:**

```json
[
  {
    "id": "react-dev-reference",
    "name": "React",
    "url": "https://react.dev/reference",
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
- `source` (string, optional) - Filter by source ID
- `limit` (number, optional) - Max results (default: 5)

**Returns:**

```json
[
  {
    "content": "The useEffect Hook lets you...",
    "metadata": {
      "source_id": "react-dev-reference",
      "url": "https://react.dev/reference/react/useEffect",
      "title": "useEffect",
      "h1": "useEffect",
      "h2": "Reference",
      "h3": "Parameters"
    },
    "distance": 0.23
  }
]
```

### 3. `get_doc(url)`

Retrieve the full Markdown content of a document.

**Parameters:**

- `url` (string, required) - The document URL

**Returns:** Full Markdown content with frontmatter metadata.

## 📁 Project Structure

```
feedd/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── config.ts           # Config management
│   ├── commands/           # CLI commands
│   │   ├── add.ts
│   │   ├── list.ts
│   │   ├── remove.ts
│   │   ├── update.ts
│   │   └── serve.ts
│   ├── chroma/             # ChromaDB manager
│   │   └── manager.ts      # Automatic startup/shutdown
│   ├── crawler/            # Web crawler
│   │   └── index.ts
│   ├── indexer/            # RAG indexer
│   │   ├── chunker.ts      # Markdown chunking
│   │   ├── vectordb.ts     # ChromaDB operations
│   │   └── index.ts
│   └── mcp/                # MCP server
│       └── server.ts
├── data/
│   ├── raw/                # Crawled Markdown files
│   └── vectordb/           # ChromaDB database
└── feedd.config.json       # User configuration
```

## ⚙️ Configuration

The `feedd.config.json` file is automatically created in your project directory:

```json
{
  "sources": [
    {
      "id": "react-dev-reference",
      "name": "React",
      "url": "https://react.dev/reference",
      "addedAt": "2025-01-15T10:30:00Z",
      "lastUpdated": "2025-01-15T12:00:00Z",
      "status": "ready",
      "docCount": 142,
      "maxDepth": 2,
      "maxPages": 100
    }
  ],
  "vectordb": {
    "type": "chromadb",
    "path": "./data/vectordb"
  }
}
```

## 🎯 Example Usage with Claude Code

Once Feedd is configured in Claude Code, you can ask:

**User:** "How do I use useEffect with cleanup in React?"

**Claude Code:**

1. Calls `search_docs("useEffect cleanup")`
2. Receives relevant chunks from the indexed React docs
3. Answers based on the exact documentation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT

## 🙏 Credits

- [Crawlee](https://crawlee.dev/) - Web scraping framework
- [ChromaDB](https://www.trychroma.com/) - Vector database with built-in embeddings
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol

---

Made with ❤️ for better AI-assisted development
