import { NextRequest, NextResponse } from 'next/server';
import { createGeminiClient } from '@/lib/llm/gemini';
import { getServerEnv } from '@/lib/config';
import { agentManager } from '@/lib/agents';
import { runAgent } from '@/lib/agents/agent-runner';
import { getConversation, updateConversation, getConversationIdFromRequest } from '@/lib/rag/conversation-store.server';
import { validateMessages, type IncomingMessage } from '@/lib/rag/chat-utils';
import type { Message, Citation, Conversation } from '@/types/chat';

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

  // Get or create conversation. The store writes to the local filesystem, so
  // this throws on read-only filesystems (e.g. Vercel serverless). Wrap it so
  // the client gets a clear 5xx JSON error instead of an unhandled rejection.
  let conversationId: string | null = null;
  let existingConversation: Conversation | null = null;
  try {
    conversationId = await getConversationIdFromRequest(body as Record<string, unknown>);
    if (conversationId) {
      existingConversation = await getConversation(conversationId);
    }
  } catch (error) {
    console.error('[api/chat] conversation store error:', errorMessage(error, 'Unknown error'));
    return NextResponse.json(
      {
        error:
          'The conversation store is unavailable on this server. ' +
          'If this is a serverless/read-only filesystem, configure a persistent store (e.g. Vercel KV/Postgres) or deploy to a host with writable disk.',
      },
      { status: 503 }
    );
  }
  if (!conversationId) {
    return NextResponse.json(
      { error: 'Failed to create or retrieve conversation' },
      { status: 500 }
    );
  }

  // Create an agent record for this chat session
  agentManager.createAgent(
    `chat-${conversationId}`,
    'Chat Research Agent',
    { documentId, messages, conversationId }
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(sse(payload)));
        } catch {
          // Stream controller may be closed if client disconnected
        }
      };
      try {
        // Execute the autonomous agent loop
        const agentResult = await runAgent({
          gemini,
          model: geminiModel,
          messages,
          documentId,
          existingConversation,
          onTraceUpdate(steps) {
            enqueue({ trace: steps });
          },
          onTextChunk(text) {
            enqueue({ text });
          },
        });

        const fullResponse = agentResult.fullResponse;
        const citations = agentResult.citations;

        // Send final metadata with citations, complete trace, and finalText safety net
        enqueue({
          finalText: fullResponse,
          citations: citations.length > 0 ? citations : undefined,
          done: true,
          conversationId,
          trace: agentResult.trace.steps,
        });

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
          agentTrace: agentResult.trace,
          createdAt: new Date(),
        };

        // Add to existing conversation or create new
        const allMessages = existingConversation
          ? [...existingConversation.messages, userMsg, assistantMsg]
          : [userMsg, assistantMsg];

        await updateConversation(conversationId, allMessages);

      } catch (error) {
        const errorStr = errorMessage(error, 'Unknown error');
        console.error('[api/chat] stream error:', errorStr);
        const isQuota =
          errorStr.includes('429') ||
          errorStr.toLowerCase().includes('quota') ||
          errorStr.toLowerCase().includes('rate limit');
        const userFacing = isQuota
          ? 'Gemini free-tier rate limit reached (5 requests/minute). Please wait ~15-20 seconds and try again.'
          : 'The assistant could not complete the response. Please try again.';
        enqueue({ error: userFacing });
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