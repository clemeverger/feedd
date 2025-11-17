import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { listSources } from '../config.js';
import { OllamaEmbedder } from '../embeddings/ollama.js';
import { search, listTables } from '../storage/lancedb.js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

interface ServeOptions {
  port?: string;
}

export async function startMCPServer(options: ServeOptions) {
  const server = new Server(
    {
      name: 'feedd',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Tool 1: list_sources
  const listSourcesTool: Tool = {
    name: 'list_sources',
    description: 'List all indexed GitHub repositories available in Feedd. Use this automatically when the user asks about available documentation, what repositories are indexed, which libraries/frameworks/tools are available for search, or wants to know what documentation has been added to the system.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  };

  // Tool 2: search_docs
  const searchDocsTool: Tool = {
    name: 'search_docs',
    description: 'Search documentation using vector similarity to find relevant information from indexed GitHub repositories. Use this automatically whenever the user asks questions about programming concepts, API usage, library/framework features, syntax, best practices, code examples, error messages, or any technical question that could be answered by consulting documentation. This is your primary tool for retrieving accurate, up-to-date information from the indexed repositories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query - can be a question, concept name, function name, or topic you want to search for in the documentation',
        },
        source: {
          type: 'string',
          description: 'Optional: filter by source ID (e.g., "facebook-react-main"). Use this when the user specifically mentions a repository or branch to search only within that documentation. Leave empty to search across all indexed repositories.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5). Increase this when the user needs comprehensive information or multiple examples.',
        },
      },
      required: ['query'],
    },
  };

  // Tool 3: get_doc
  const getDocTool: Tool = {
    name: 'get_doc',
    description: 'Retrieve the full Markdown content of a specific documentation file by its path. Use this when the user needs complete documentation page content (not just snippets), when they reference a specific file path from search results and want more details, or when search_docs results indicate that a full page view would be helpful. The full page often contains additional context, examples, and related information not present in search chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'Repository name (e.g., "facebook/react")',
        },
        branch: {
          type: 'string',
          description: 'Branch name (e.g., "main", "v18.2.0")',
        },
        path: {
          type: 'string',
          description: 'Relative path to the markdown file (e.g., "docs/hooks-reference.md")',
        },
      },
      required: ['repo', 'branch', 'path'],
    },
  };

  // Handler for list_tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [listSourcesTool, searchDocsTool, getDocTool],
  }));

  // Handler for call_tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_sources': {
          const sources = await listSources();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  sources.map(s => ({
                    id: s.id,
                    repo: `${s.owner}/${s.repo}`,
                    branch: s.branch,
                    lastUpdated: s.lastUpdated,
                    docCount: s.docCount || 0,
                    status: s.status
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'search_docs': {
          const { query, source, limit = 5 } = args as any;

          if (!query) {
            throw new Error('Query parameter is required');
          }

          // Generate query embedding
          const embedder = new OllamaEmbedder();

          // Check if Ollama is available
          if (!await embedder.checkHealth()) {
            throw new Error('Ollama is not available. Please start Ollama and ensure mxbai-embed-large model is installed.');
          }

          const [queryVector] = await embedder.embed([query]);

          let results: any[] = [];

          if (source) {
            // Search in specific source
            results = await search(source, queryVector, limit);
          } else {
            // Search in all sources
            const tables = await listTables();

            for (const tableName of tables) {
              try {
                const tableResults = await search(tableName, queryVector, limit);
                results.push(...tableResults);
              } catch (error) {
                // Silently skip tables that don't exist or have errors
              }
            }

            // Sort by distance and limit
            results.sort((a, b) => a._distance - b._distance);
            results = results.slice(0, limit);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'get_doc': {
          const { repo, branch, path: filePath } = args as any;

          if (!repo || !branch || !filePath) {
            throw new Error('repo, branch, and path parameters are required');
          }

          // Parse repo (owner/repo)
          const [owner, repoName] = repo.split('/');

          if (!owner || !repoName) {
            throw new Error('Invalid repo format. Expected "owner/repo"');
          }

          // Build full path to markdown file
          const fullPath = path.join(
            process.cwd(),
            'data',
            'repos',
            owner,
            repoName,
            branch,
            filePath
          );

          try {
            const content = await fs.readFile(fullPath, 'utf-8');

            return {
              content: [
                {
                  type: 'text',
                  text: content,
                },
              ],
            };
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              throw new Error(`Document not found: ${repo}@${branch}:${filePath}`);
            }
            throw error;
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(chalk.green('✓ MCP Server started'));
  console.error(chalk.dim('Listening on stdio...'));
  console.error(chalk.dim('\nAvailable tools:'));
  console.error(chalk.dim('  - list_sources()'));
  console.error(chalk.dim('  - search_docs(query, source?, limit?)'));
  console.error(chalk.dim('  - get_doc(repo, branch, path)'));

  // Instructions for Claude Code
  console.error(chalk.bold('\n📋 Add to Claude Code:'));
  console.error(chalk.dim('\nRun this command to install the MCP server:\n'));
  console.error(chalk.cyan('  claude mcp add --transport stdio feedd -- feedd serve'));
  console.error(chalk.dim('\nOr for user-level (all projects):'));
  console.error(chalk.cyan('  claude mcp add --transport stdio --scope user feedd -- feedd serve'));
  console.error(chalk.dim('\nThen restart Claude Code and run /mcp to verify\n'));
}
