import { ToolDefinition, ToolResult, ToolName } from './types';
import { generateQueryEmbedding, retrieveChunks } from '@/lib/rag/retrieval';
import { safeEvaluate } from './safe-calculator';

export const AVAILABLE_TOOLS: Record<ToolName, ToolDefinition> = {
  search: {
    name: 'search',
    description: 'Search through uploaded documents for relevant information',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant documents'
        },
        documentId: {
          type: 'string',
          description: 'Optional document ID to limit search to a specific document'
        }
      },
      required: ['query']
    }
  },
  calculator: {
    name: 'calculator',
    description: 'Perform mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2", "(10 * 5) / 2")'
        }
      },
      required: ['expression']
    }
  },
  web_search: {
    name: 'web_search',
    description: 'Search the web for current information (placeholder implementation)',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query for web search'
        }
      },
      required: ['query']
    }
  }
};

export async function executeTool(
  toolName: ToolName,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    switch (toolName) {
      case 'search': {
        const query = args.query as string;
        const documentId = args.documentId as string | undefined;
        if (!query) {
          return { success: false, error: 'Query is required for search tool' };
        }

        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query);

        // Retrieve relevant chunks
        const retrieved = await retrieveChunks(queryEmbedding, 5, documentId);

        // Format results
        const results = retrieved.chunks.map(chunk => ({
          content: chunk.text,
          documentId: chunk.documentId,
          documentName: chunk.documentName,
          pageNumber: chunk.pageNumber,
          relevance: 1 - (chunk.embedding ? 0 : 0.5) // Simplified relevance score
        }));

        return {
          success: true,
          data: {
            query,
            results,
            totalResults: results.length
          },
          executionTimeMs: Date.now() - startTime
        };
      }

      case 'calculator': {
        const expression = args.expression as string;
        if (!expression) {
          return { success: false, error: 'Expression is required for calculator tool' };
        }

        try {
          // Safe calculator implementation
          const result = safeEvaluate(expression);

          return {
            success: true,
            data: {
              expression,
              result
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (calcError) {
          return {
            success: false,
            error: `Calculation error: ${calcError instanceof Error ? calcError.message : 'Invalid expression'}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }

      case 'web_search': {
        // Placeholder implementation for web search
        // In a real implementation, this would call a search API like Google, Bing, or DuckDuckGo
        return {
          success: true,
          data: {
            query: args.query,
            results: [
              {
                title: 'Web search result placeholder',
                snippet: 'This is a placeholder for web search results. In a production implementation, this would connect to a search API.',
                url: 'https://example.com'
              }
            ],
            message: 'Web search is currently a placeholder implementation'
          },
          executionTimeMs: Date.now() - startTime
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          executionTimeMs: Date.now() - startTime
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during tool execution',
      executionTimeMs: Date.now() - startTime
    };
  }
}