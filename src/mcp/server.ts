import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { listSources, loadConfig } from '../config.js';
import { generateEmbedding } from '../indexer/embedder.js';
import { searchInCollection, listCollections } from '../indexer/vectordb.js';
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
    description: 'List all indexed documentation sources available in Feedd',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  };

  // Tool 2: search_docs
  const searchDocsTool: Tool = {
    name: 'search_docs',
    description: 'Search documentation using vector similarity. Returns relevant chunks from the indexed docs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        source: {
          type: 'string',
          description: 'Optional: filter by source ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  };

  // Tool 3: get_doc
  const getDocTool: Tool = {
    name: 'get_doc',
    description: 'Retrieve the full Markdown content of a specific document by its URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the document to retrieve',
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
                    name: s.name,
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

          // Charger la config pour obtenir le modèle
          const config = await loadConfig();
          const embeddingModel = config.embedding.model;

          // Générer l'embedding de la query
          const queryEmbedding = await generateEmbedding(query, embeddingModel);

          let results: any[] = [];

          if (source) {
            // Rechercher dans une source spécifique
            results = await searchInCollection(source, queryEmbedding, limit);
          } else {
            // Rechercher dans toutes les sources
            const collections = await listCollections();

            for (const collectionName of collections) {
              const collectionResults = await searchInCollection(
                collectionName,
                queryEmbedding,
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
  console.error('');
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
