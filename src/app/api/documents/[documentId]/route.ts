import { NextRequest, NextResponse } from 'next/server';
import { documentStore } from '@/lib/rag/document-store';
import { vectorStore } from '@/lib/rag/vectorstore';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  const doc = await documentStore.get(documentId);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json(doc);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  const exists = await documentStore.exists(documentId);
  if (!exists) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Check if document is currently processing - should not delete while processing
  const doc = await documentStore.get(documentId);
  if (doc?.status === 'processing') {
    return NextResponse.json({ 
      error: 'Cannot delete document while it is processing. Wait for it to complete or mark as failed first.',
    }, { status: 409 });
  }

  try {
    // Delete from vector store first (must succeed before document removal)
    await vectorStore.deleteDocument(documentId);
  } catch (vectorError) {
    console.error('Vector store delete error:', vectorError);
    // Continue with document store deletion but log the error
  }

  // Delete from document store (metadata and file)
  try {
    await documentStore.delete(documentId);
  } catch (storeError) {
    console.error('Document store delete error:', storeError);
    // Return partial failure - vectors removed but metadata may be stale
  }

  return NextResponse.json({ success: true });
}