import { McpToolDeclaration, McpToolResult } from './types';
import { getGitStatus, saveResearchNote, getResearchNotesLog } from './git-service';
import { searchArxiv } from './arxiv-service';

/**
 * Registered MCP tools available for ResearchPilot agents.
 */
export const MCP_TOOLS: Record<string, McpToolDeclaration> = {
  search_arxiv: {
    name: 'search_arxiv',
    description:
      'Search arXiv.org for peer-reviewed and preprint scientific research papers (100% free open access). Returns title, authors, summary abstract, publication year, and PDF links.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Academic topic or query to search on arXiv (e.g. "transformer attention mechanisms")',
        },
      },
      required: ['query'],
    },
  },
  git_save_notes: {
    name: 'git_save_notes',
    description:
      'Save structured research synthesis notes or paper summaries into a Markdown file (data/research-notes/) and commit it to Git with version control.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Title of the research note (used as filename and document heading)',
        },
        content: {
          type: 'STRING',
          description: 'Comprehensive research findings, literature summary, or notes in Markdown format',
        },
        commitMessage: {
          type: 'STRING',
          description: 'Optional Git commit message (e.g. "docs(research): summarize attention mechanism")',
        },
      },
      required: ['title', 'content'],
    },
  },
  git_status: {
    name: 'git_status',
    description: 'Inspect the current Git repository status, active branch, and recent commit history.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  git_notes_history: {
    name: 'git_notes_history',
    description: 'Show recent commit log for saved research notes.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
};

/**
 * Executes an MCP tool by name with arguments.
 */
export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  try {
    switch (toolName) {
      case 'search_arxiv': {
        const query = (args.query as string) || '';
        if (!query.trim()) {
          return {
            content: [{ type: 'text', text: 'Query parameter is required for arXiv search.' }],
            isError: true,
          };
        }

        const papers = await searchArxiv(query, 3);
        if (papers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No papers found on arXiv for query "${query}".`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query,
                  totalFound: papers.length,
                  papers: papers.map((p) => ({
                    title: p.title,
                    authors: p.authors.join(', '),
                    published: p.published,
                    summary: p.summary,
                    url: p.url,
                    pdfUrl: p.pdfUrl,
                  })),
                },
                null,
                2
              ),
            },
          ],
          metadata: { papers },
        };
      }

      case 'git_save_notes': {
        const title = (args.title as string) || 'Research Note';
        const content = (args.content as string) || '';
        const commitMessage = args.commitMessage as string | undefined;

        if (!content.trim()) {
          return {
            content: [{ type: 'text', text: 'Content is required to save research notes.' }],
            isError: true,
          };
        }

        const noteRes = await saveResearchNote(title, content, commitMessage);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(noteRes, null, 2),
            },
          ],
          metadata: { note: noteRes },
        };
      }

      case 'git_status': {
        const status = await getGitStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
          metadata: { status },
        };
      }

      case 'git_notes_history': {
        const log = await getResearchNotesLog();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ commits: log }, null, 2),
            },
          ],
          metadata: { log },
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown MCP tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'MCP tool execution failed';
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}

/**
 * Returns function declarations array formatted for Gemini API.
 */
export function getMcpGeminiDeclarations() {
  return Object.values(MCP_TOOLS).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}
