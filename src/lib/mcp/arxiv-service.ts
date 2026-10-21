export interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  pdfUrl: string;
  url: string;
}

/**
 * Free open-access academic paper search via arXiv API.
 */
export async function searchArxiv(
  query: string,
  maxResults = 3
): Promise<ArxivPaper[]> {
  if (!query || query.trim().length === 0) return [];

  const cleanQuery = query.replace(/[^\w\s-]/g, ' ').trim();
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
    cleanQuery
  )}&start=0&max_results=${Math.min(maxResults, 5)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ResearchPilot-AI/1.0 (academic research assistant; mailto:contact@researchpilot.ai)',
      },
    });

    clearTimeout(timer);
    if (!res.ok) return [];

    const xml = await res.text();
    const entryBlocks = xml.split('<entry>').slice(1);

    const papers: ArxivPaper[] = entryBlocks.map((entry) => {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const title = titleMatch
        ? titleMatch[1].replace(/\s+/g, ' ').trim()
        : 'Untitled arXiv Paper';

      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const summary = summaryMatch
        ? summaryMatch[1].replace(/\s+/g, ' ').trim()
        : '';

      const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
      const rawId = idMatch ? idMatch[1].trim() : '';
      const arxivId = rawId.replace(/^https?:\/\/arxiv.org\/abs\//, '');

      const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
      const published = publishedMatch ? publishedMatch[1].trim() : '';

      const authorMatches = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)];
      const authors = authorMatches.map((m) => m[1].trim()).slice(0, 4);

      return {
        id: arxivId || rawId,
        title,
        summary: summary.length > 300 ? `${summary.slice(0, 297)}...` : summary,
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        published: published ? published.split('T')[0] : 'Unknown Date',
        pdfUrl: rawId.replace('/abs/', '/pdf/') + '.pdf',
        url: rawId || `https://arxiv.org/abs/${arxivId}`,
      };
    });

    return papers;
  } catch (error) {
    console.warn('[arxiv-service] search failed:', error);
    return [];
  }
}
