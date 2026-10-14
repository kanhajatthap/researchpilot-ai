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

  // Delete from vector store first
  await vectorStore.deleteDocument(documentId);

  // Delete from document store
  await documentStore.delete(documentId);

  return NextResponse.json({ success: true });
}