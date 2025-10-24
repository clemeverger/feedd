import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { listSources, loadConfig } from '../config.js';
import { searchInCollectionByText, listCollections } from '../indexer/vectordb.js';
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
      version: '0.1.0',
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
    description: 'List all indexed documentation sources available in Feedd. Use this automatically when the user asks about available documentation, what sources are indexed, which libraries/frameworks/tools are available for search, or wants to know what documentation has been added to the system.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  };

  // Tool 2: search_docs
  const searchDocsTool: Tool = {
    name: 'search_docs',
    description: 'Search documentation using vector similarity to find relevant information from indexed docs. Use this automatically whenever the user asks questions about programming concepts, API usage, library/framework features, syntax, best practices, code examples, error messages, or any technical question that could be answered by consulting documentation. This is your primary tool for retrieving accurate, up-to-date information from the indexed documentation sources.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query - can be a question, concept name, function name, or topic you want to search for in the documentation',
        },
        source: {
          type: 'string',
          description: 'Optional: filter by source ID (e.g., "react-dev-reference"). Use this when the user specifically mentions a framework, library, or tool name to search only within that documentation. Leave empty to search across all indexed sources.',
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
    description: 'Retrieve the full Markdown content of a specific documentation page by its URL. Use this when the user needs complete documentation page content (not just snippets), when they reference a specific URL from search results and want more details, or when search_docs results indicate that a full page view would be helpful. The full page often contains additional context, examples, and related information not present in search chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The exact URL of the documentation page to retrieve (e.g., "https://react.dev/reference/react/useEffect"). This should typically come from the metadata of search_docs results.',
        },
      },
      required: ['url'],
    },
  };

  // Handler pour list_tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [listSourcesTool, searchDocsTool, getDocTool],
  }));

  // Handler pour call_tool
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
                    url: s.url,
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

          let results: any[] = [];

          if (source) {
            // Rechercher dans une source spécifique
            // ChromaDB génère l'embedding automatiquement avec son modèle par défaut
            results = await searchInCollectionByText(source, query, limit);
          } else {
            // Rechercher dans toutes les sources
            const collections = await listCollections();

            for (const collectionName of collections) {
              const collectionResults = await searchInCollectionByText(
                collectionName,
                query,
                limit
              );
              results.push(...collectionResults);
            }

            // Trier par distance et limiter
            results.sort((a, b) => a.distance - b.distance);
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
          const { url } = args as any;

          if (!url) {
            throw new Error('URL parameter is required');
          }

          // Trouver le fichier correspondant à l'URL
          const sources = await listSources();
          let foundContent: string | null = null;

          for (const source of sources) {
            const rawDir = path.join(process.cwd(), 'data', 'raw', source.id);

            try {
              const files = await getAllMarkdownFiles(rawDir);

              for (const file of files) {
                const content = await fs.readFile(file, 'utf-8');

                // Vérifier si ce fichier contient l'URL
                if (content.includes(`url: ${url}`)) {
                  foundContent = content;
                  break;
                }
              }

              if (foundContent) break;
            } catch {
              // Continuer si le dossier n'existe pas
            }
          }

          if (!foundContent) {
            throw new Error(`Document with URL "${url}" not found`);
          }

          return {
            content: [
              {
                type: 'text',
                text: foundContent,
              },
            ],
          };
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

  // Démarrer le serveur avec stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(chalk.green('✓ MCP Server started'));
  console.error(chalk.dim('Listening on stdio...'));
  console.error(chalk.dim('\nAvailable tools:'));
  console.error(chalk.dim('  - list_sources()'));
  console.error(chalk.dim('  - search_docs(query, source?, limit?)'));
  console.error(chalk.dim('  - get_doc(url)'));

  // Instructions pour Claude Code
  console.error(chalk.bold('\n📋 Add to Claude Code:'));
  console.error(chalk.dim('\nRun this command to install the MCP server:\n'));
  console.error(chalk.cyan('  claude mcp add --transport stdio feedd -- feedd serve'));
  console.error(chalk.dim('\nOr for user-level (all projects):'));
  console.error(chalk.cyan('  claude mcp add --transport stdio --scope user feedd -- feedd serve'));
  console.error(chalk.dim('\nThen restart Claude Code and run /mcp to verify\n'));
}

async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignorer les erreurs
    }
  }

  await walk(dir);
  return files;
}
