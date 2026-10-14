import { GoogleGenAI, type Content } from '@google/genai';
import { getServerEnv } from '@/lib/config';

export type GeminiMessage = Content;

export function createGeminiClient() {
  const { geminiApiKey } = getServerEnv();
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey: geminiApiKey });
}

export function toGeminiContents(messages: Array<{ role: string; content: string }>): GeminiMessage[] {
  return messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : 'user',
      parts: [{ text: m.content.trim() }],
    }));
}
