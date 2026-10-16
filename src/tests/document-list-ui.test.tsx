import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { StrictMode } from 'react';
import { DocumentList } from '@/components/Documents/DocumentList';
import type { Document } from '@/types/document';

/**
 * UI regression tests for the Knowledge Base list.
 *
 * The reported "duplicate entries" were duplicate document *records* in
 * storage (now prevented server-side). These tests additionally guarantee the
 * UI renders exactly one entry per record — including under React StrictMode —
 * and that a refresh shows the authoritative persisted status.
 */

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    name: 'Holiday Calendar 2026',
    fileName: 'Holiday Calendar 2026.pdf',
    fileType: 'pdf',
    size: 426925,
    status: 'ready',
    uploadedAt: new Date('2026-10-15T11:36:05.354Z'),
    ...overrides,
  };
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as unknown as Response;
}

function errorResponse(status: number, data: unknown) {
  return {
    ok: false,
    status,
    json: async () => data,
  } as unknown as Response;
}

let queue: Document[][];
let getCalls: number;
let retryResponse: Response | null;

beforeEach(() => {
  queue = [];
  getCalls = 0;
  retryResponse = null;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'POST') {
      return retryResponse ?? jsonResponse({ success: true });
    }
    if (method === 'DELETE') {
      return jsonResponse({ success: true });
    }
    void input;
    const docs = queue[Math.min(getCalls, Math.max(0, queue.length - 1))] || [];
    getCalls += 1;
    return jsonResponse(docs);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DocumentList', () => {
  it('renders one entry per stored record', async () => {
    queue = [[doc({ id: 'a', status: 'ready' }), doc({ id: 'b', status: 'error', error: 'boom' })]];

    render(
      <StrictMode>
        <DocumentList />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText(/^Delete /)).toHaveLength(2);
    });
    expect(screen.getAllByText('Holiday Calendar 2026').length).toBeGreaterThanOrEqual(2);
  });

  it('does not duplicate entries when effects/StrictMode re-run', async () => {
    queue = [[doc({ id: 'a' })], [doc({ id: 'a' })], [doc({ id: 'a' })]];

    render(
      <StrictMode>
        <DocumentList />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText(/^Delete /)).toHaveLength(1);
    });
    // Give any stray effects a chance; the list must never double-render.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getAllByLabelText(/^Delete /)).toHaveLength(1);
  });

  it('shows a single entry for a single record even if the API is fetched repeatedly', async () => {
    const one = doc({ id: 'solo' });
    queue = Array.from({ length: 5 }, () => [one]);

    render(
      <StrictMode>
        <DocumentList />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText(/^Delete /)).toHaveLength(1);
    });
  });

  it('reflects the authoritative status after a retry refresh', async () => {
    queue = [[doc({ id: 'r', status: 'error', error: 'previous failure' })], [doc({ id: 'r', status: 'ready' })]];

    render(
      <StrictMode>
        <DocumentList />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/^Retry processing/));

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('surfaces an actionable message when a retry cannot proceed', async () => {
    queue = [[doc({ id: 'r', status: 'error', error: 'previous failure' })]];
    retryResponse = errorResponse(409, {
      error: 'No stored PDF file is available for this document. Please upload the file again.',
    });

    render(
      <StrictMode>
        <DocumentList />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/^Retry processing/));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/No stored PDF file is available/i);
    });
  });
});
