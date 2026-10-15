import { NextRequest, NextResponse } from 'next/server';
import { createGeminiClient, toGeminiContents } from '@/lib/llm/gemini';
import { getServerEnv } from '@/lib/config';
import { generateQueryEmbedding, retrieveChunks, constructRagPrompt, validateCitations } from '@/lib/rag/retrieval';
import { agentManager } from '@/lib/agents';
import { getConversation, updateConversation, getConversationIdFromRequest } from '@/lib/rag/conversation-store.server';
import { generateTitleFromMessage } from '@/lib/rag/title-generator';
import { validateMessages, buildContextPrompt, type IncomingMessage } from '@/lib/rag/chat-utils';
import type { Message, Citation } from '@/types/chat';

export const runtime = 'nodejs';

interface ChatRequest {
  messages?: unknown;
  documentId?: string;
  conversationId?: string;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function sse(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { geminiModel } = getServerEnv();

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let messages: IncomingMessage[];
  try {
    messages = validateMessages(body?.messages);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Invalid messages payload') },
      { status: 400 }
    );
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    return NextResponse.json(
      { error: 'The last message must be from the user' },
      { status: 400 }
    );
  }

  let gemini;
  try {
    gemini = createGeminiClient();
  } catch {
    return NextResponse.json(
      { error: 'The server is not configured with a Gemini API key.' },
      { status: 500 }
    );
  }

  const documentId = body?.documentId || null;
  const encoder = new TextEncoder();

  // Get or create conversation
  const conversationId = await getConversationIdFromRequest(body as Record<string, unknown>);
  if (!conversationId) {
    return NextResponse.json(
      { error: 'Failed to create or retrieve conversation' },
      { status: 500 }
    );
  }
  const existingConversation = await getConversation(conversationId);

  // Create an agent for this chat session
  const chatAgent = agentManager.createAgent(
    `chat-${conversationId}`,
    'Chat Research Agent',
    { documentId, messages, conversationId }
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(payload)));
      };

      try {
        let citations: Array<{
          documentId: string;
          documentName: string;
          pageNumber?: number;
          chunkId: string;
        }> = [];

        // Build the content for the LLM with conversation context
        let geminiContents = toGeminiContents(messages);

        // If we have an existing conversation, add context to help resolve references
        if (existingConversation && existingConversation.messages.length > 0) {
          const contextPrompt = buildContextPrompt(existingConversation, lastMessage.content);
          // Replace the last user message with context-enhanced version
          const contextMessages = [...messages.slice(0, -1), {
            role: 'user' as const,
            content: contextPrompt,
          }];
          geminiContents = toGeminiContents(contextMessages);
        }

        if (documentId) {
          const userMessage = messages[messages.length - 1];
          if (userMessage.role === 'user') {
            // Generate query embedding
            const queryEmbedding = await generateQueryEmbedding(userMessage.content);

            // Retrieve relevant chunks
            const retrievalResult = await retrieveChunks(queryEmbedding, 5, documentId);

            // Validate document exists and is ready
            const chunks = retrievalResult.chunks;
            if (chunks.length > 0) {
              // Construct RAG prompt and citations
              const { prompt, citations: ragCitations } = constructRagPrompt(userMessage.content, retrievalResult);

              // Validate citations against retrieved chunks
              const validatedCitations = validateCitations(ragCitations, retrievalResult.chunks);

              // Update citations with validated ones
              citations = validatedCitations.map(c => ({
                documentId: c.documentId,
                documentName: c.documentName,
                pageNumber: c.pageNumber,
                chunkId: c.chunkId,
              }));

              // Replace the last user message with the RAG-enhanced prompt
              const ragMessages = [...messages.slice(0, messages.length - 1), {
                role: 'user' as const,
                content: prompt,
              }];
              geminiContents = toGeminiContents(ragMessages);
            }
          }
        }

        const response = await gemini.models.generateContentStream({
          model: geminiModel,
          contents: geminiContents,
        });

        let fullResponse = '';
        for await (const chunk of response) {
          const text = chunk.text;
          if (text && text.length > 0) {
            fullResponse += text;
            enqueue({ text });
          }
        }

        // Send final metadata with citations (no fake agent trace)
        if (citations.length > 0) {
          enqueue({ citations, done: true, conversationId });
        } else {
          enqueue({ done: true, conversationId });
        }

        // Persist the conversation
        const userMsg: Message = {
          id: `msg-${Date.now()}-user`,
          role: 'user',
          content: lastMessage.content,
          createdAt: new Date(),
        };
        const assistantCitations: Citation[] = citations.length > 0
          ? citations.map((c) => ({
              id: c.chunkId || `citation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              documentId: c.documentId,
              documentName: c.documentName,
              pageNumber: c.pageNumber,
              chunkId: c.chunkId,
            }))
          : [];

        const assistantMsg: Message = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: fullResponse,
          citations: assistantCitations.length > 0 ? assistantCitations : undefined,
          createdAt: new Date(),
        };

        // Add to existing conversation or create new
        const allMessages = existingConversation
          ? [...existingConversation.messages, userMsg, assistantMsg]
          : [userMsg, assistantMsg];

        await updateConversation(conversationId, allMessages);

      } catch (error) {
        console.error('[api/chat] stream error:', errorMessage(error, 'Unknown error'));
        enqueue({ error: 'The assistant could not complete the response. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}