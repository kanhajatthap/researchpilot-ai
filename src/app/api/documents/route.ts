import { NextRequest, NextResponse } from 'next/server';
import { extractPdfText } from '@/lib/rag/extractor';
import { chunkText } from '@/lib/rag/chunker';
import { Embedder } from '@/lib/rag/embedder';
import { vectorStore, VectorChunk } from '@/lib/rag/vectorstore';
import { documentStore } from '@/lib/rag/document-store';
import type { Document } from '@/types/document';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const EMBEDDING_BATCH_SIZE = 5; // Conservative batch size for rate limits
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes total processing timeout

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  
  // Validate file type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }
  
  // Validate file size
  if (file.size > MAX_SIZE) return NextResponse.json({ error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` }, { status: 400 });

  try {
    // Check for existing document with same filename and size (idempotency)
    const existingDoc = await documentStore.findByFileNameAndSize(file.name, file.size);
    if (existingDoc) {
      // Return existing document if it's already ready
      if (existingDoc.status === 'ready') {
        return NextResponse.json({
          success: true,
          documentId: existingDoc.id,
          message: 'Document already processed',
        });
      }
      // Return existing document if it's already errored (allow retry)
      if (existingDoc.status === 'error') {
        return NextResponse.json({
          success: false,
          documentId: existingDoc.id,
          error: existingDoc.error || 'Document processing failed previously',
        }, { status: 400 });
      }
      // If document is still processing, return its ID with a message
      if (existingDoc.status === 'processing' || existingDoc.status === 'queued') {
        return NextResponse.json({
          success: false,
          documentId: existingDoc.id,
          error: 'Document is already being processed',
          status: existingDoc.status,
        }, { status: 409 }); // Conflict - already processing
      }
    }

    // Create document record with queued status initially
    const doc: Document = await documentStore.create({
      name: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      fileType: 'pdf',
      size: file.size,
      status: 'queued',
      uploadedAt: new Date(),
    });

    // Mark as processing immediately to avoid duplicate queue entries
    await documentStore.markProcessing(doc.id);

    // Set up timeout to mark as failed if processing takes too long
    const timeoutId = setTimeout(async () => {
      try {
        await documentStore.markFailed(doc.id, `Processing timeout after ${PROCESSING_TIMEOUT_MS / 1000}s`);
        console.log(`Document ${doc.id} timed out and marked as failed`);
      } catch (e) {
        console.error(`Failed to timeout document ${doc.id}:`, e);
      }
    }, PROCESSING_TIMEOUT_MS);

    let processedSuccessfully = false;
    
    try {
      // Extract PDF text
      const arrayBuf = await file.arrayBuffer();
      const pageTexts = await extractPdfText(arrayBuf);
      const hasText = pageTexts.some((p) => p.text.length > 0);
      if (!hasText) {
        clearTimeout(timeoutId);
        await documentStore.markFailed(doc.id, 'No extractable text found. OCR not supported in this phase.');
        return NextResponse.json({ error: 'No extractable text found. OCR not supported in this phase.' }, { status: 400 });
      }

      // Chunk text
      const chunks = chunkText(pageTexts, 800, 200);
      if (chunks.length === 0) {
        clearTimeout(timeoutId);
        await documentStore.markFailed(doc.id, 'No text chunks generated from document.');
        return NextResponse.json({ error: 'No text chunks generated from document.' }, { status: 400 });
      }

      // Generate embeddings in batches to respect rate limits
      const embedder = new Embedder();
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const batchTexts = batch.map((c) => c.text);
        const batchEmbeddings = await embedder.embedBatch(batchTexts);
        embeddings.push(...batchEmbeddings);
        // Small delay between batches to avoid rate limits
        if (i + EMBEDDING_BATCH_SIZE < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Create vector chunks and store in ChromaDB
      const vchunks: VectorChunk[] = chunks.map((c, i) => ({
        id: doc.id + '_c' + i,
        documentId: doc.id,
        documentName: file.name.replace(/\.pdf$/i, ''),
        pageNumber: c.pageNumber,
        chunkIndex: c.chunkIndex,
        text: c.text,
        embedding: embeddings[i],
      }));
      await vectorStore.addChunks(vchunks);

      // Update document as ready with chunk count
      await documentStore.markReady(doc.id, chunks.length, pageTexts.length);
      processedSuccessfully = true;
      
      return NextResponse.json({
        success: true,
        documentId: doc.id,
        chunks: chunks.length,
        pages: pageTexts.length,
      });
      
    } catch (error: unknown) {
      // Clear timeout on normal error handling
      clearTimeout(timeoutId);
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Document processing error:', error);
      
      // Update document status to error with details
      await documentStore.markFailed(doc.id, message);
      
      return NextResponse.json({ error: `Failed to process document: ${message}` }, { status: 500 });
    } finally {
      if (!processedSuccessfully) {
        clearTimeout(timeoutId);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Document upload error:', error);
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
