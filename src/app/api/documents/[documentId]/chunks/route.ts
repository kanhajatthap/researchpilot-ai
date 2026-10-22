import { NextRequest, NextResponse } from 'next/server';
import { documentStore } from '@/lib/rag/document-store';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  const doc = await documentStore.getRecord(documentId);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const pageParam = searchParams.get('page');
  const chunkIdParam = searchParams.get('chunkId');

  const chunks = doc.chunks || [];

  if (chunkIdParam) {
    const chunk = chunks.find((c) => c.id === chunkIdParam);
    if (!chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
    }
    return NextResponse.json({
      documentId: doc.id,
      documentName: doc.name,
      fileName: doc.fileName,
      chunk,
    });
  }

  if (pageParam) {
    const pageNum = parseInt(pageParam, 10);
    const pageChunks = chunks.filter((c) => c.pageNumber === pageNum);
    return NextResponse.json({
      documentId: doc.id,
      documentName: doc.name,
      fileName: doc.fileName,
      pageNumber: pageNum,
      chunks: pageChunks,
      combinedText: pageChunks.map((c) => c.content || (c as any).text || '').join('\n\n'),
    });
  }

  return NextResponse.json({
    documentId: doc.id,
    documentName: doc.name,
    fileName: doc.fileName,
    chunkCount: chunks.length,
    pageCount: doc.pageCount,
    chunks: chunks.slice(0, 50), // Return initial 50 chunks
  });
}
