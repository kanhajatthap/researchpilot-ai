// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { executeMcpTool, MCP_TOOLS } from '@/lib/mcp/mcp-bridge';
import { getGitStatus, saveResearchNote } from '@/lib/mcp/git-service';

describe('MCP Tools and Git Services', () => {
  it('registers all required MCP tools', () => {
    expect(MCP_TOOLS.search_arxiv).toBeDefined();
    expect(MCP_TOOLS.git_save_notes).toBeDefined();
    expect(MCP_TOOLS.git_status).toBeDefined();
    expect(MCP_TOOLS.git_notes_history).toBeDefined();
  });

  describe('Git Service', () => {
    it('returns repo status with branch', async () => {
      const status = await getGitStatus();
      expect(typeof status.branch).toBe('string');
      expect(Array.isArray(status.modifiedFiles)).toBe(true);
    });

    it('saves a research note file to disk', async () => {
      const title = 'Test Quantum Computing Note';
      const content = '# Summary\nQuantum computing uses qubits and superposition.';
      const res = await saveResearchNote(title, content, 'test: save note');

      expect(res.relativePath).toContain('data/research-notes/test-quantum-computing-note.md');
      expect(res.bytesWritten).toBeGreaterThan(0);
    }, 15000);
  });

  describe('executeMcpTool router', () => {
    it('executes git_status tool', async () => {
      const res = await executeMcpTool('git_status', {});
      expect(res.isError).toBeFalsy();
      expect(res.content[0].type).toBe('text');
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.branch).toBeDefined();
    });

    it('requires query for search_arxiv', async () => {
      const res = await executeMcpTool('search_arxiv', { query: '' });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/query parameter is required/i);
    });

    it('requires content for git_save_notes', async () => {
      const res = await executeMcpTool('git_save_notes', { title: 'T', content: '' });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/content is required/i);
    });

    it('handles unknown MCP tool name gracefully', async () => {
      const res = await executeMcpTool('invalid_mcp_tool', {});
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/unknown mcp tool/i);
    });
  });
});
