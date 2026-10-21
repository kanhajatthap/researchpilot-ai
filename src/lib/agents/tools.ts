import { ToolDefinition, ToolResult, ToolName } from './types';
import { generateQueryEmbedding, retrieveChunks } from '@/lib/rag/retrieval';
import { documentStore } from '@/lib/rag/document-store';
import { safeEvaluate } from './safe-calculator';
import { executeMcpTool, getMcpGeminiDeclarations, MCP_TOOLS } from '@/lib/mcp';

export const AVAILABLE_TOOLS: Record<ToolName, ToolDefinition> = {
  search: {
    name: 'search',
    description: 'Search through uploaded documents for relevant information and exact page citations',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant documents',
        },
        documentId: {
          type: 'string',
          description: 'Optional document ID to limit search to a specific document',
        },
      },
      required: ['query'],
    },
  },
  search_documents: {
    name: 'search_documents',
    description: 'Search through uploaded documents for relevant information and exact page citations',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant documents',
        },
        documentId: {
          type: 'string',
          description: 'Optional document ID to limit search to a specific document',
        },
      },
      required: ['query'],
    },
  },
  calculator: {
    name: 'calculator',
    description: 'Perform mathematical or statistical calculations accurately',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2", "(10 * 5) / 2")',
        },
      },
      required: ['expression'],
    },
  },
  web_search: {
    name: 'web_search',
    description: 'Search Wikipedia and academic sources for scientific concepts, definitions, and external literature (100% free)',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The topic or scientific query to look up',
        },
      },
      required: ['query'],
    },
  },
  list_documents: {
    name: 'list_documents',
    description: 'List all uploaded research documents and papers currently in the knowledge base',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  search_arxiv: {
    name: 'search_arxiv',
    description: MCP_TOOLS.search_arxiv.description,
    parameters: MCP_TOOLS.search_arxiv.parameters as Record<string, unknown>,
  },
  git_save_notes: {
    name: 'git_save_notes',
    description: MCP_TOOLS.git_save_notes.description,
    parameters: MCP_TOOLS.git_save_notes.parameters as Record<string, unknown>,
  },
  git_status: {
    name: 'git_status',
    description: MCP_TOOLS.git_status.description,
    parameters: MCP_TOOLS.git_status.parameters as Record<string, unknown>,
  },
  git_notes_history: {
    name: 'git_notes_history',
    description: MCP_TOOLS.git_notes_history.description,
    parameters: MCP_TOOLS.git_notes_history.parameters as Record<string, unknown>,
  },
};

/**
 * Free knowledge base search using Wikipedia API (No API keys or fees required).
 */
async function freeWebSearch(query: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
  if (!query || query.trim().length === 0) return [];
  try {
    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query.trim()
    )}&format=json&utf8=&origin=*`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ResearchPilot-AI/1.0 (academic research assistant)',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };
    const items = data.query?.search || [];
    return items.slice(0, 4).map((item) => ({
      title: item.title || 'Untitled',
      snippet: (item.snippet || '').replace(/<[^>]+>/g, '').trim(),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent((item.title || '').replace(/ /g, '_'))}`,
    }));
  } catch {
    return [];
  }
}

export async function executeTool(
  toolName: ToolName,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    switch (toolName) {
      case 'search':
      case 'search_documents': {
        const query = args.query as string;
        const documentId = args.documentId as string | undefined;
        if (!query) {
          return { success: false, error: 'Query is required for search tool' };
        }

        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query);

        // Retrieve relevant chunks
        const retrieved = await retrieveChunks(queryEmbedding, 5, documentId);

        // Format results with citations
        const results = retrieved.chunks.map((chunk) => ({
          chunkId: chunk.id,
          content: chunk.text,
          documentId: chunk.documentId,
          documentName: chunk.documentName,
          pageNumber: chunk.pageNumber,
          relevance: 1 - (chunk.embedding ? 0 : 0.5),
        }));

        return {
          success: true,
          data: {
            query,
            results,
            totalResults: results.length,
          },
          executionTimeMs: Date.now() - startTime,
        };
      }

      case 'calculator': {
        const expression = args.expression as string;
        if (!expression) {
          return { success: false, error: 'Expression is required for calculator tool' };
        }

        try {
          const result = safeEvaluate(expression);
          return {
            success: true,
            data: {
              expression,
              result,
            },
            executionTimeMs: Date.now() - startTime,
          };
        } catch (calcError) {
          return {
            success: false,
            error: `Calculation error: ${calcError instanceof Error ? calcError.message : 'Invalid expression'}`,
            executionTimeMs: Date.now() - startTime,
          };
        }
      }

      case 'web_search': {
        const query = (args.query as string) || '';
        if (!query.trim()) {
          return { success: false, error: 'Query is required for web_search' };
        }

        const results = await freeWebSearch(query);
        return {
          success: true,
          data: {
            query,
            results:
              results.length > 0
                ? results
                : [
                    {
                      title: query,
                      snippet: 'No Wikipedia articles found for this specific query.',
                      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
                    },
                  ],
            totalResults: results.length,
            source: 'Wikipedia (Free Open Access)',
          },
          executionTimeMs: Date.now() - startTime,
        };
      }

      case 'list_documents': {
        const docs = await documentStore.list();
        const simplified = docs.map((d) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          pageCount: d.pageCount,
          chunkCount: d.chunkCount,
        }));
        return {
          success: true,
          data: {
            documents: simplified,
            totalDocuments: simplified.length,
          },
          executionTimeMs: Date.now() - startTime,
        };
      }

      default: {
        if (toolName in MCP_TOOLS) {
          const mcpRes = await executeMcpTool(toolName, args);
          let parsedData: unknown = mcpRes.metadata || mcpRes.content;
          if (mcpRes.content[0]?.text) {
            try {
              parsedData = JSON.parse(mcpRes.content[0].text);
            } catch {
              parsedData = mcpRes.content[0].text;
            }
          }
          return {
            success: !mcpRes.isError,
            data: parsedData,
            error: mcpRes.isError ? (typeof parsedData === 'string' ? parsedData : 'MCP execution error') : undefined,
            executionTimeMs: Date.now() - startTime,
          };
        }
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during tool execution',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Tool declarations formatted for the Gemini API (`@google/genai`).
 */
export const GEMINI_AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_documents',
        description:
          'Search through uploaded research papers and documents for relevant excerpts, context, and exact page citations. Call this when answering questions about documents.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'The semantic search query to look up in the uploaded documents.',
            },
            documentId: {
              type: 'STRING',
              description: 'Optional document ID to restrict search to a specific document.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'calculator',
        description:
          'Perform mathematical or statistical calculations accurately (addition, subtraction, multiplication, division).',
        parameters: {
          type: 'OBJECT',
          properties: {
            expression: {
              type: 'STRING',
              description: 'The math expression to evaluate, e.g. "250 * 1.15" or "(40 + 60) / 2".',
            },
          },
          required: ['expression'],
        },
      },
      {
        name: 'web_search',
        description:
          'Search Wikipedia and open academic sources for scientific concepts, background research, definitions, and external literature.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'The topic or scientific query to look up.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_documents',
        description:
          'List all research documents currently uploaded in the user knowledge base.',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      ...getMcpGeminiDeclarations(),
    ],
  },
];