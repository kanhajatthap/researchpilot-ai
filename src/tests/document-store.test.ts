// Simple test to verify the fixes work
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Reset modules and use test directories
let testDocStoreDir: string;
let testVectorStoreDir: string;

beforeEach(async () => {
  vi.resetModules();
  
  // Create temporary directories for both document store and vector store
  testDocStoreDir = mkdtempSync(join(tmpdir(), 'rp-doc-store-'));
  testVectorStoreDir = mkdtempSync(join(tmpdir(), 'rp-vector-store-'));
  
  // Set environment variables to use our test directories
  process.env.DOCUMENT_STORE_PATH = testDocStoreDir;
  process.env.CHROMA_DB_PATH = testVectorStoreDir;
});

afterEach(() => {
  if (testDocStoreDir) {
    rmSync(testDocStoreDir, { recursive: true, force: true });
  }
  if (testVectorStoreDir) {
    rmSync(testVectorStoreDir, { recursive: true, force: true });
  }
});

describe('Document Processing Flow', () => {
  it('should create document, process it, and mark as ready', async () => {
    // Import after setting env vars
    const { documentStore } = await import('@/lib/rag/document-store');
    const { vectorStore } = await import('@/lib/rag/vectorstore');
    
    // Create a mock document with initial status
    const mockDocument = {
      name: 'Test Document',
      fileName: 'test.pdf',
      fileType: 'pdf',
      size: 1000,
      status: 'queued' as const,
      uploadedAt: new Date(),
    };
    
    // Test document store operations
    const created = await documentStore.create(mockDocument);
    expect(created.id).toBeDefined();
    expect(created.status).toBe('queued'); // Should start as 'queued' with new flow
    
    // Test update operations
    await documentStore.markProcessing(created.id);
    const processing = await documentStore.get(created.id);
    expect(processing?.status).toBe('processing');
    
    // Test ready status
    await documentStore.markReady(created.id, 2, 10);
    const ready = await documentStore.get(created.id);
    expect(ready?.status).toBe('ready');
    expect(ready?.chunkCount).toBe(2);
    expect(ready?.pageCount).toBe(10);
    
    // Clean up
    await documentStore.delete(created.id);
    const afterDelete = await documentStore.get(created.id);
    expect(afterDelete).toBeNull();
  });
  
  it('should handle error status', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    
    const mockDocument = {
      name: 'Error Document',
      fileName: 'error.pdf',
      fileType: 'pdf',
      size: 1000,
      status: 'queued' as const,
      uploadedAt: new Date(),
    };
    
    const created = await documentStore.create(mockDocument);
    await documentStore.markFailed(created.id, 'Processing failed: Invalid PDF');
    
    const errorDoc = await documentStore.get(created.id);
    expect(errorDoc?.status).toBe('error');
    expect(errorDoc?.error).toBe('Processing failed: Invalid PDF');
  });
  
  it('should handle queued status for idempotency', async () => {
    const { documentStore } = await import('@/lib/rag/document-store');
    
    // First upload
    const mockDocument = {
      name: 'Queued Document',
      fileName: 'queued.pdf',
      fileType: 'pdf',
      size: 1000,
      status: 'queued' as const,
      uploadedAt: new Date(),
    };
    
    const created1 = await documentStore.create(mockDocument);
    await documentStore.markQueued(created1.id);
    
    const queuedDoc = await documentStore.get(created1.id);
    expect(queuedDoc?.status).toBe('queued');
  });
});