import { GoogleGenAI } from '@google/genai';
import { getServerEnv } from '@/lib/config';

export class Embedder {
  private client: GoogleGenAI;

  constructor() {
    const { geminiApiKey } = getServerEnv();
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');
    this.client = new GoogleGenAI({ apiKey: geminiApiKey });
  }

  async embedText(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: 'gemini-embedding-001',
      contents: [{ role: 'user', parts: [{ text }] }],
      config: { outputDimensionality: 768 },
    });
    return response.embeddings?.[0]?.values || [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const t of texts) {
      results.push(await this.embedText(t));
      await new Promise((r) => setTimeout(r, 50));
    }
    return results;
  }
}
