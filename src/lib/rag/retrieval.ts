import { vectorStore, VectorChunk } from '@/lib/rag/vectorstore';

/**
 * Retrieval pipeline.
 * Given a query embedding, returns the most relevant chunks
 * optionally filtered by document ID.
 */
export async function retrieveChunks(
  queryEmbedding: number[],
  topK = 5,
  documentId?: string,
): Promise<{
  chunks: VectorChunk[];
  metadata: {
    totalChunks: number;
    filteredByDocument: boolean;
    sourceDocuments: string[];
  };
}> {
  const result = await vectorStore.query(queryEmbedding, topK, documentId);
  const sourceDocs = new Set<string>();
  for (const chunk of result.chunks) {
    sourceDocs.add(chunk.documentId);
  }

  return {
    chunks: result.chunks,
    metadata: {
      totalChunks: result.chunks.length,
      filteredByDocument: !!documentId,
      sourceDocuments: Array.from(sourceDocs),
    },
  };
}

/**
 * Generate an embedding for a user question.
 * Returns the raw embedding vector.
 */
export async function generateQueryEmbedding(question: string): Promise<number[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await client.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [{ role: 'user', parts: [{ text: question }] }],
    config: { outputDimensionality: 768 },
  });
  return response.embeddings?.[0]?.values || [];
}

/**
 * Construct a grounded RAG prompt using retrieved context.
 * @param question The user's question.
 * @param retrieved Chunks with source metadata.
 * @returns Prompt string ready for Gemini + citation info.
 */
export function constructRagPrompt(
  question: string,
  retrieved: Awaited<ReturnType<typeof retrieveChunks>>,
): {
  prompt: string;
  citations: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId: string;
    excerpt?: string;
  }>;
} {
  // Build a simple concatenated context block with source attribution.
  let context = '';
  const citations: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId: string;
    excerpt?: string;
  }> = [];

  // Deduplicate by chunkId to prevent duplicate citations.
  const seenChunkIds = new Set<string>();
  for (const chunk of retrieved.chunks) {
    if (seenChunkIds.has(chunk.id)) continue;
    seenChunkIds.add(chunk.id);

    const excerpt =
      chunk.text.length > 200
        ? chunk.text.substring(0, 200) + '…'
        : chunk.text;
    context += `[Source: ${chunk.documentName}, Page ${chunk.pageNumber || '?'}]
${excerpt}\n\n`;
    citations.push({
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      pageNumber: chunk.pageNumber,
      chunkId: chunk.id,
      excerpt,
    });
  }

  const systemInstruction =
    'Answer the user\'s question based ONLY on the provided context from the uploaded documents. '
    + 'Do not use any external knowledge. If the context does not contain enough information '
    + 'to answer the question, state that clearly. Do not fabricate citations, page numbers, '
    + 'or document content. '
    + 'You may only reference document names, page numbers, and facts that appear in the '
    + 'context above. When you cite a page, that page must be included in the sources list '
    + 'above. Do not mention page numbers (e.g., "Page 5", "p. 5", "page 5", "(p. 5)") '
    + 'or document names that are not in the sources list. If a page number is not in the '
    + 'sources, do not state it in your answer. '
    + 'You may only reference document names, page numbers, and facts that appear in the '
    + 'context above. When you cite a page, that page must be verifiable from the sources '
    + 'list above. Do not claim to know information that is not present in the context. '
    + 'If the model attempts to mention pages or documents outside the provided context, '
    + 'it should state that it does not have enough information rather than making up details.';

  const prompt = `${systemInstruction}

Context:
${context}

User question: ${question}

Provide a concise, grounded answer. Cite your sources using the document name and page number format.
`;

  return {
    prompt,
    citations,
  };
}

/**
 * Validate citations against the retrieved chunk set.
 * Rejects any citation that does not reference a chunk actually retrieved
 * for the current request. Also validates page numbers and document IDs.
 *
 * @param citations - Candidate citations to validate.
 * @param retrievedChunks - The actual chunks retrieved for this request.
 * @returns Validated citations, with invalid ones omitted.
 */
export function validateCitations(
  citations: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId: string;
  }>,
  retrievedChunks: Array<{ id: string; documentId: string; documentName: string; pageNumber?: number }>,
): Array<{
  documentId: string;
  documentName: string;
  pageNumber?: number;
  chunkId: string;
}> {
  if (!Array.isArray(citations) || citations.length === 0) return [];
  if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) return [];

  // Build a lookup of valid chunk IDs from the retrieved set.
  const validChunkIds = new Set(retrievedChunks.map((c) => c.id));
  // Build a lookup of valid document IDs from the retrieved set.
  const validDocumentIds = new Set(retrievedChunks.map((c) => c.documentId));
  // Build a map of chunkId -> documentId to verify chunk-document consistency
  const chunkIdToDocumentId = new Map<string, string>();
  for (const chunk of retrievedChunks) {
    chunkIdToDocumentId.set(chunk.id, chunk.documentId);
  }

  const validated: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId: string;
  }> = [];

  for (const citation of citations) {
    // Reject if chunkId is not in the retrieved set.
    if (!citation.chunkId || !validChunkIds.has(citation.chunkId)) {
      continue;
    }

    // Reject if documentId is not in the retrieved set.
    if (!citation.documentId || !validDocumentIds.has(citation.documentId)) {
      continue;
    }

    // Verify that the chunkId actually belongs to the specified documentId
    const actualDocumentId = chunkIdToDocumentId.get(citation.chunkId);
    if (actualDocumentId !== citation.documentId) {
      continue;
    }

    // Validate page number: must be a positive integer or undefined.
    // Reject citations with invalid page numbers rather than omitting them.
    let validatedPageNumber: number | undefined;
    if (citation.pageNumber !== undefined && citation.pageNumber !== null) {
      const pn = Number(citation.pageNumber);
      if (Number.isInteger(pn) && pn > 0) {
        validatedPageNumber = pn;
      } else {
        // Invalid page number - reject the entire citation
        continue;
      }
    }

    validated.push({
      documentId: citation.documentId,
      documentName: citation.documentName,
      pageNumber: validatedPageNumber,
      chunkId: citation.chunkId,
    });
  }

  return validated;
}

/**
 * Extract page-number references from model prose and validate them against
 * the available citations. This catches cases where the model mentions a
 * page number in its answer that was not in the retrieved context.
 *
 * @param text - The model's response text.
 * @param availableCitations - The validated citations for this response.
 * @returns An object containing the extracted claims and any that are invalid.
 */
export function validateProseClaims(
  text: string,
  availableCitations: Array<{ documentName: string; pageNumber?: number }>,
): {
  validClaims: Array<{ documentName: string; pageNumber: number }>;
  invalidClaims: Array<{ documentName: string; pageNumber: number }>;
  hasUnverifiedClaims: boolean;
} {
  // Build a set of valid (documentName, pageNumber) pairs from citations
  const validPairs = new Set<string>();
  for (const c of availableCitations) {
    if (c.pageNumber !== undefined && c.pageNumber !== null) {
      validPairs.add(`${c.documentName}::${c.pageNumber}`);
    }
  }

  // Extract page references from prose using regex patterns
  // Matches: "Page 5", "page 5", "p. 5", "(p. 5)", "Page 5.", "Page 5,"
  const pageRefPattern = /(?:page|p\.)\s*(\d+)/gi;
  const matches = text.matchAll(pageRefPattern);

  const extractedClaims: Array<{ documentName: string; pageNumber: number }> = [];
  for (const match of matches) {
    const pageNumber = parseInt(match[1], 10);
    if (!isNaN(pageNumber) && pageNumber > 0) {
      extractedClaims.push({ documentName: '', pageNumber });
    }
  }

  // If no page references in prose, no validation needed
  if (extractedClaims.length === 0) {
    return { validClaims: [], invalidClaims: [], hasUnverifiedClaims: false };
  }

  // If no valid citation pairs exist, any page reference is unverified
  if (validPairs.size === 0) {
    return {
      validClaims: [],
      invalidClaims: extractedClaims,
      hasUnverifiedClaims: true,
    };
  }

  // Check each extracted claim against available citations
  // Note: We cannot reliably associate prose page references with specific
  // document names from prose alone, so we flag any page number that doesn't
  // appear in any available citation as potentially invalid.
  const validPageNumbers = new Set<number>();
  for (const c of availableCitations) {
    if (c.pageNumber !== undefined && c.pageNumber !== null) {
      validPageNumbers.add(c.pageNumber);
    }
  }

  const validClaims: Array<{ documentName: string; pageNumber: number }> = [];
  const invalidClaims: Array<{ documentName: string; pageNumber: number }> = [];

  for (const claim of extractedClaims) {
    if (validPageNumbers.has(claim.pageNumber)) {
      validClaims.push(claim);
    } else {
      invalidClaims.push(claim);
    }
  }

  return {
    validClaims,
    invalidClaims,
    hasUnverifiedClaims: invalidClaims.length > 0,
  };
}