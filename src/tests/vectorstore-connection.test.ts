// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveChromaConnection } from '@/lib/rag/vectorstore';

/**
 * Regression test for the production upload breakage:
 *
 * The vector store constructed `new ChromaClient({ path: './data/chroma' })`.
 * The chromadb JS client parses `path` with `new URL(path)`, which throws
 * `ChromaValueError: Invalid URL: ./data/chroma`. The throw happened inside
 * `getClient()`, so EVERY vector operation failed and no document could ever
 * finish processing.
 *
 * `resolveChromaConnection` must always return a usable host/port instead.
 */
describe('resolveChromaConnection', () => {
  it('defaults to the local Chroma server', () => {
    expect(resolveChromaConnection({} as NodeJS.ProcessEnv)).toEqual({
      host: 'localhost',
      port: 8000,
      ssl: false,
    });
  });

  it('does not crash on a legacy filesystem path (the production bug)', () => {
    const conn = resolveChromaConnection({ CHROMA_DB_PATH: './data/chroma' } as NodeJS.ProcessEnv);
    expect(conn).toEqual({ host: 'localhost', port: 8000, ssl: false });
    // The result must always be usable to build a real URL (no throw).
    expect(() => new URL(`http://${conn.host}:${conn.port}`)).not.toThrow();
  });

  it('parses a full http URL', () => {
    expect(
      resolveChromaConnection({ CHROMA_DB_PATH: 'http://chroma.example:9000' } as NodeJS.ProcessEnv),
    ).toEqual({ host: 'chroma.example', port: 9000, ssl: false });
  });

  it('parses an https URL with the default https port', () => {
    expect(
      resolveChromaConnection({ CHROMA_URL: 'https://chroma.example' } as NodeJS.ProcessEnv),
    ).toEqual({ host: 'chroma.example', port: 443, ssl: true });
  });

  it('prefers explicit CHROMA_HOST / CHROMA_PORT', () => {
    expect(
      resolveChromaConnection({
        CHROMA_HOST: 'chroma',
        CHROMA_PORT: '8080',
        CHROMA_SSL: 'true',
      } as NodeJS.ProcessEnv),
    ).toEqual({ host: 'chroma', port: 8080, ssl: true });
  });
});
