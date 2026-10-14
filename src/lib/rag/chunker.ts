export interface TextChunk {
  text: string;
  pageNumber: number;
  chunkIndex: number;
  startChar?: number;
  endChar?: number;
}

export function chunkText(
  pageTexts: Array<{ pageNumber: number; text: string }>,
  chunkSize = 800,
  overlap = 200
): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (const page of pageTexts) {
    const text = page.text;
    if (!text || text.trim().length === 0) continue;
    let start = 0;
    let chunkIndex = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkText = text.substring(start, end);
      chunks.push({
        text: chunkText,
        pageNumber: page.pageNumber,
        chunkIndex: chunkIndex,
      });
      start = end - overlap > start ? end - overlap : start + chunkSize;
      chunkIndex++;
      if (chunkSize <= 0) break;
    }
  }
  return chunks;
}
