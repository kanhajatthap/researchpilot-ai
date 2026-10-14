import { NextRequest, NextResponse } from 'next/server';
import { generateQueryEmbedding, retrieveChunks, constructRagPrompt, validateCitations } from '@/lib/rag/retrieval';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { question, documentId, topK = 5 } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(question);

    // Retrieve relevant chunks
    const retrieved = await retrieveChunks(queryEmbedding, topK, documentId);

    // Construct RAG prompt and citations
    const { prompt, citations: unvalidatedCitations } = constructRagPrompt(question, retrieved);

    // Validate citations against retrieved chunks
    const citations = validateCitations(unvalidatedCitations, retrieved.chunks);

    return NextResponse.json({
      success: true,
      ...retrieved,
      prompt,
      citations,
      metadata: {
        question: question,
        ...retrieved.metadata,
      },
    });
  } catch (error: unknown) {
    console.error('Query error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to process query: ${message}` }, { status: 500 });
  }
}
