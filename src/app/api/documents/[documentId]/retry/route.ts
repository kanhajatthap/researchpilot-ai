import { NextRequest, NextResponse } from 'next/server';
import { documentStore } from '@/lib/rag/document-store';
import { purgeDocumentVectors, vectorPurgeFailureMessages } from '@/lib/rag/vectorstore';
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

export const runtime = 'nodejs';

const PROCESSING_TIMEOUT_MS = resolveProcessingTimeoutMs();
const EMBEDDING_CONTENTS_PER_MINUTE = resolveEmbeddingContentsPerMinute();

/**
 * POST /api/documents/[documentId]/retry
 *
 * Reliable retry:
 *   1. Validate the document exists and is eligible (only `error` documents).
 *   2. Confirm the original PDF exists and is readable (before mutating state).
 *   3. Atomically claim a new attempt (rejects concurrent retries).
 *   4. Clean up vectors from previous attempts and verify removal — a cleanup
 *      failure blocks reprocessing so old and new chunks can never mix.
 *   5. Reprocess through the shared pipeline with the new attemptId.
 *
 * Return codes:
 *   200 — retry succeeded (document is ready)
 *   400 — stored PDF content is invalid/empty
 *   404 — document not found
 *   409 — document not eligible (ready / queued / processing) or PDF missing
 *   500 — retry failed (cleanup or processing error); document marked failed
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  const doc = await documentStore.get(documentId);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (doc.status === 'ready') {
    return NextResponse.json({
      error: 'Cannot retry a ready document. Only errored documents can be retried.',
    }, { status: 409 });
  }
  if (doc.status === 'processing' || doc.status === 'queued') {
    return NextResponse.json({
      error: 'Document is already queued or being processed. Wait for it to finish, or use the recovery endpoint if it is stale.',
      status: doc.status,
    }, { status: 409 });
  }

  // Confirm the original PDF exists and is readable BEFORE claiming an attempt,
  // so a missing file cannot strand the record in a non-terminal state. This
  // works for both the filesystem and Vercel Blob drivers.
  let pdfBuffer: Buffer;
  try {
    const stored = await documentStore.readFile(documentId);
    if (!stored) {
      return NextResponse.json({
        error: 'No stored PDF file is available for this document. Please upload the file again.',
      }, { status: 409 });
    }
    pdfBuffer = stored;
  } catch (error) {
    console.error(`[retry] stored PDF unreadable document=${documentId}:`, error);
    return NextResponse.json({
      error: 'The stored PDF for this document is missing or unreadable. Please upload the file again.',
    }, { status: 409 });
  }
  const arrayBuffer = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength,
  ) as ArrayBuffer;

  // Atomically claim a new attempt. Concurrent retries lose here with a 409.
  const claim = await documentStore.prepareForRetry(documentId);
  if (!claim) {
    return NextResponse.json({
      error: 'Document is not eligible for retry at this time.',
    }, { status: 409 });
  }
  const attemptId = claim.attemptId;

  try {
    // Clean up any vectors from previous attempts and verify removal.
    // Shared with the re-upload (adopt) path — same invariant, same messages.
    const purge = await purgeDocumentVectors(documentId);
    if (!purge.ok) {
      const messages = vectorPurgeFailureMessages(purge);
      await documentStore.markFailedIfAttempt(documentId, messages.record, attemptId);
      return NextResponse.json({ error: messages.response }, { status: 500 });
    }

    // Run the shared processing pipeline (attempt-gated writes).
    const claimedDoc = await documentStore.get(documentId);
    const result = await processDocument(arrayBuffer, claimedDoc || doc, {
      documentId,
      attemptId,
      embeddingBatchSize: DEFAULT_EMBEDDING_BATCH_SIZE,
      embeddingConcurrency: DEFAULT_EMBEDDING_CONCURRENCY,
      embeddingContentsPerMinute: EMBEDDING_CONTENTS_PER_MINUTE,
      timeoutMs: PROCESSING_TIMEOUT_MS,
    });

    return NextResponse.json({
      success: true,
      documentId,
      chunks: result.chunks,
      pages: result.pages,
      message: 'Document reprocessed successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof DocumentValidationError) {
      // The processor already recorded the failure against this attempt.
      return NextResponse.json({ error: error.message, documentId }, { status: 400 });
    }
    const message = sanitizeFailureMessage(error instanceof Error ? error.message : 'Unknown error');
    console.error(`[retry] failed document=${documentId} attempt=${attemptId} error=${message}`);
    try {
      const failed = await documentStore.markFailedIfAttempt(
        documentId,
        `Retry failed: ${message}`,
        attemptId,
      );
      if (!failed) {
        console.error(`[retry] failure-write-rejected document=${documentId} attempt=${attemptId}`);
      }
    } catch (writeError) {
      console.error(
        `[retry] could not persist failure document=${documentId} error=${sanitizeFailureMessage(
          writeError instanceof Error ? writeError.message : String(writeError),
        )}`,
      );
    }
    return NextResponse.json({ error: `Retry failed: ${message}` }, { status: 500 });
  }
}
