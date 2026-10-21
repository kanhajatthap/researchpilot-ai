// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { executeTool, GEMINI_AGENT_TOOLS } from '@/lib/agents/tools';
import type { ToolName } from '@/lib/agents/types';

vi.mock('@/lib/rag/retrieval', () => ({
  generateQueryEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  retrieveChunks: vi.fn(async () => ({
    chunks: [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        documentName: 'Paper.pdf',
        pageNumber: 2,
        chunkIndex: 0,
        text: 'This is an excerpt from the research paper.',
        embedding: [0.1, 0.2, 0.3],
      },
    ],
    distances: [0.1],
  })),
}));

vi.mock('@/lib/rag/document-store', () => ({
  documentStore: {
    list: vi.fn(async () => [
      {
        id: 'doc-1',
        name: 'Attention.pdf',
        status: 'ready',
        pageCount: 15,
        chunkCount: 30,
        uploadedAt: new Date(),
      },
    ]),
  },
}));

describe('Agent Tools Execution', () => {
  it('defines valid Gemini function declarations', () => {
    expect(GEMINI_AGENT_TOOLS.length).toBeGreaterThan(0);
    const decls = GEMINI_AGENT_TOOLS[0].functionDeclarations;
    const names = decls.map((d) => d.name);
    expect(names).toContain('search_documents');
    expect(names).toContain('calculator');
    expect(names).toContain('web_search');
    expect(names).toContain('list_documents');
  });

  describe('calculator tool', () => {
    it('evaluates valid arithmetic expressions', async () => {
      const res = await executeTool('calculator', { expression: '10 + 20 * 2' });
      expect(res.success).toBe(true);
      expect((res.data as { result: number }).result).toBe(50);
    });

    it('returns error on division by zero', async () => {
      const res = await executeTool('calculator', { expression: '10 / 0' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/division by zero/i);
    });

    it('returns error when expression is missing', async () => {
      const res = await executeTool('calculator', {});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/expression is required/i);
    });
  });

  describe('search_documents tool', () => {
    it('retrieves chunks and formats citations', async () => {
      const res = await executeTool('search_documents', { query: 'transformer architecture' });
      expect(res.success).toBe(true);
      const data = res.data as {
        totalResults: number;
        results: Array<{ documentName: string; pageNumber: number; chunkId: string }>;
      };
      expect(data.totalResults).toBe(1);
      expect(data.results[0].documentName).toBe('Paper.pdf');
      expect(data.results[0].pageNumber).toBe(2);
      expect(data.results[0].chunkId).toBe('chunk-1');
    });

    it('requires a query argument', async () => {
      const res = await executeTool('search_documents', {});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/query is required/i);
    });
  });

  describe('list_documents tool', () => {
    it('lists all stored documents', async () => {
      const res = await executeTool('list_documents', {});
      expect(res.success).toBe(true);
      const data = res.data as {
        totalDocuments: number;
        documents: Array<{ name: string }>;
      };
      expect(data.totalDocuments).toBe(1);
      expect(data.documents[0].name).toBe('Attention.pdf');
    });
  });

  describe('web_search tool', () => {
    it('requires a query argument', async () => {
      const res = await executeTool('web_search', { query: '' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/query is required/i);
    });
  });

  describe('unknown tool handling', () => {
    it('returns an error for unknown tool names', async () => {
      const res = await executeTool('non_existent' as unknown as ToolName, {});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unknown tool/i);
    });
  });
});
