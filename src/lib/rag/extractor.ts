import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PageText {
  pageNumber: number;
  text: string;
}

interface TextItem {
  str?: string;
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<PageText[]> {
  const loadingTask = getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pageTexts: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => {
        const textItem = item as TextItem;
        return textItem.str || '';
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push({ pageNumber: i, text });
  }
  return pageTexts;
}
