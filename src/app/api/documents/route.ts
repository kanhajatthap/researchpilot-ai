import { NextRequest, NextResponse } from 'next/server';
import { extractPdfText } from '@/lib/rag/extractor';
import { chunkText } from '@/lib/rag/chunker';
import { Embedder } from '@/lib/rag/embedder';
import { vectorStore, VectorChunk } from '@/lib/rag/vectorstore';
import { documentStore } from '@/lib/rag/document-store';
import type { Document } from '@/types/document';

export const runtime = 'nodejs';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const EMBEDDING_BATCH_SIZE = 5; // Conservative batch size for rate limits

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` }, { status: 400 });

  try {
    // Create document record with processing status
    const doc: Document = await documentStore.create({
      name: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      fileType: 'pdf',
      size: file.size,
      status: 'processing',
      uploadedAt: new Date(),
    });

    // Extract PDF text
    const arrayBuf = await file.arrayBuffer();
    const pageTexts = await extractPdfText(arrayBuf);
    const hasText = pageTexts.some((p) => p.text.length > 0);
    if (!hasText) {
      await documentStore.update(doc.id, { status: 'error' });
      return NextResponse.json({ error: 'No extractable text found. OCR not supported in this phase.' }, { status: 400 });
    }

    // Chunk text
    const chunks = chunkText(pageTexts, 800, 200);
    if (chunks.length === 0) {
      await documentStore.update(doc.id, { status: 'error' });
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
    await documentStore.update(doc.id, {
      status: 'ready',
      chunkCount: chunks.length,
      pageCount: pageTexts.length,
    });

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      chunks: chunks.length,
      pages: pageTexts.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Document processing error:', error);
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
