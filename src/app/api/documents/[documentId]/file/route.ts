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

  const fileBuffer = await documentStore.readFile(documentId);
  if (!fileBuffer) {
    return NextResponse.json(
      { error: 'Stored PDF file not found on disk or storage.' },
      { status: 404 }
    );
  }

  const filename = doc.fileName || `${doc.name}.pdf`;

  // Return PDF stream directly with inline viewer headers
  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
