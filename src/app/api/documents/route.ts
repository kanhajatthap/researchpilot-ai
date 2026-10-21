import { NextRequest, NextResponse } from 'next/server';
import { documentStore } from '@/lib/rag/document-store';
import {
  processDocument,
  DocumentValidationError,
  sanitizeFailureMessage,
} from '@/lib/rag/document-processor';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_CONCURRENCY,
  resolveEmbeddingContentsPerMinute,
  resolveProcessingTimeoutMs,
} from '@/lib/rag/embedding-config';
import { createHash } from 'crypto';
import { purgeDocumentVectors, vectorPurgeFailureMessages } from '@/lib/rag/vectorstore';

export const runtime = 'nodejs';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const PROCESSING_TIMEOUT_MS = resolveProcessingTimeoutMs();
const EMBEDDING_CONTENTS_PER_MINUTE = resolveEmbeddingContentsPerMinute();

/**
 * POST /api/documents
 *
 * Upload pipeline (single authoritative path, shared with retry):
 *   1. Validate the file (type + size).
 *   2. Atomically resolve duplicate policy against stored documents
 *      (documentStore.beginUpload) — content-hash identity, legacy adoption.
 *   3. Persist the PDF to disk so retries can reprocess it.
 *   4. Claim the processing attempt (attemptId-gated write).
 *   5. Run the shared processing pipeline.
 *   6. Return a clear response; every failure leaves a terminal status.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  // Validate file type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` },
      { status: 400 },
    );
  }

  try {
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    // Atomic duplicate resolution. Two concurrent uploads of the same bytes
    // cannot both create a record.
    const resolved = await documentStore.beginUpload({
      name: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      size: file.size,
      contentHash,
    });

    if (resolved.kind === 'existing') {
      const existing = resolved.doc;
      if (existing.status === 'ready') {
        return NextResponse.json({
          success: true,
          documentId: existing.id,
          message: 'Document already processed',
        });
      }
      if (existing.status === 'error') {
        return NextResponse.json({
          success: false,
          documentId: existing.id,
          error: existing.error || 'Document processing failed previously. You can retry it.',
        }, { status: 400 });
      }
      // queued / processing — an attempt is already in flight.
      return NextResponse.json({
        success: false,
        documentId: existing.id,
        error: 'Document is already being processed',
        status: existing.status,
      }, { status: 409 });
    }

    const doc = resolved.doc;
    const attemptId = doc.attemptId;
    if (!attemptId) {
      // Defensive: beginUpload always assigns an attempt.
      return NextResponse.json({ error: 'Failed to claim processing attempt' }, { status: 500 });
    }

    // Persist the uploaded PDF to disk so retries can reprocess without re-uploading.
    try {
      const storedName = await documentStore.saveFile(doc.id, buffer, file.name);
      await documentStore.setFilePath(doc.id, storedName);
    } catch (e) {
      console.error(`[upload] failed to persist PDF document=${doc.id} attempt=${attemptId}:`, e);
      await documentStore.markFailedIfAttempt(doc.id, 'Failed to persist uploaded file', attemptId);
      return NextResponse.json({ error: 'Failed to persist uploaded file' }, { status: 500 });
    }

    // Claim the attempt before processing starts (attempt-gated).
    const claimed = await documentStore.markProcessingIfAttempt(doc.id, attemptId);
    if (!claimed) {
      return NextResponse.json({
        success: false,
        documentId: doc.id,
        error: 'Document was superseded by another operation',
      }, { status: 409 });
    }

    // Reprocessing an adopted (previously failed) record: purge any vectors a
    // previous attempt may have left behind first — exactly like the retry
    // endpoint — so stale or partial vectors can never mix with, or block,
    // the new ones. A cleanup failure stops reprocessing (terminal + retriable).
    if (resolved.kind === 'adopt') {
      const purge = await purgeDocumentVectors(doc.id);
      if (!purge.ok) {
        const messages = vectorPurgeFailureMessages(purge);
        await documentStore.markFailedIfAttempt(doc.id, messages.record, attemptId);
        console.error(`[upload] vector purge failed document=${doc.id} attempt=${attemptId}: ${messages.record}`);
        return NextResponse.json(
          { error: messages.response, documentId: doc.id },
          { status: 500 },
        );
      }
    }

    // Delegate the full processing pipeline to the shared processor.
    try {
      const result = await processDocument(arrayBuf, claimed, {
        documentId: doc.id,
        attemptId,
        embeddingBatchSize: DEFAULT_EMBEDDING_BATCH_SIZE,
        embeddingConcurrency: DEFAULT_EMBEDDING_CONCURRENCY,
        embeddingContentsPerMinute: EMBEDDING_CONTENTS_PER_MINUTE,
        timeoutMs: PROCESSING_TIMEOUT_MS,
      });

      return NextResponse.json({
        success: true,
        documentId: doc.id,
        chunks: result.chunks,
        pages: result.pages,
        ...(resolved.kind === 'adopt' ? { adopted: true } : {}),
      });
    } catch (error: unknown) {
      if (error instanceof DocumentValidationError) {
        return NextResponse.json({ error: error.message, documentId: doc.id }, { status: 400 });
      }
      // processDocument already marked the document as failed (attempt-gated).
      const message = sanitizeFailureMessage(
        error instanceof Error ? error.message : 'Unknown error',
      );
      console.error(`[upload] processing failed document=${doc.id} attempt=${attemptId} error=${message}`);
      return NextResponse.json(
        { error: `Failed to process document: ${message}`, documentId: doc.id },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    // Any failure before/around record creation: no orphaned processing record
    // is left behind (the record is either absent or already terminal).
    const message = sanitizeFailureMessage(error instanceof Error ? error.message : 'Unknown error');
    console.error(`[upload] upload failed: ${message}`);
    return NextResponse.json({ error: `Failed to process document: ${message}` }, { status: 500 });
  }
}

export async function GET() {
  try {
    const documents = await documentStore.list();
    return NextResponse.json(documents);
  } catch (error) {
    console.error('Error listing documents:', error);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}
