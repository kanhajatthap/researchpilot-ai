import { NextRequest, NextResponse } from 'next/server';
import {
  listConversations,
  getConversationMetadata,
  createConversation,
  renameConversation,
  deleteConversation
} from '@/lib/rag/conversation-store.server';
import { generateTitleFromMessage } from '@/lib/rag/title-generator';
import type { Message } from '@/types/chat';

export const runtime = 'nodejs';

interface ListConversationsResponse {
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }>;
}

interface GetConversationResponse {
  conversation: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  } | null;
}

interface CreateConversationRequest {
  title?: string;
  messages?: Message[];
}

interface CreateConversationResponse {
  conversationId: string;
}

interface RenameConversationRequest {
  title: string;
}

interface RenameConversationResponse {
  success: boolean;
}

interface DeleteConversationResponse {
  success: boolean;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    
    const conversations = await listConversations(limit);
    
    const response: ListConversationsResponse = {
      conversations
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[api/conversations] GET error:', errorMessage(error, 'Unknown error'));
    return NextResponse.json(
      { error: 'Failed to list conversations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate request body
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    
    const { title, messages = [] } = body as CreateConversationRequest;
    
    // Validate messages if provided
    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        if (!msg || typeof msg !== 'object' || 
            typeof msg.role !== 'string' || 
            !['user', 'assistant', 'system'].includes(msg.role) ||
            typeof msg.content !== 'string') {
          return NextResponse.json(
            { error: 'Invalid message format' },
            { status: 400 }
          );
        }
      }
    }
    
    let conversationTitle = title;
    if (!conversationTitle && messages.length > 0) {
      // Generate title from first user message if no title provided
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        conversationTitle = generateTitleFromMessage(firstUserMessage.content);
      }
    }
    
    if (!conversationTitle) {
      conversationTitle = 'Untitled Research Conversation';
    }
    
    const conversationId = await createConversation(conversationTitle, messages);
    
    const response: CreateConversationResponse = {
      conversationId
    };
    
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[api/conversations] POST error:', errorMessage(error, 'Unknown error'));
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }
    
    const body = await req.json();
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    
    const { title } = body as RenameConversationRequest;
    
    if (typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json(
        { error: 'Title is required and must be a non-empty string' },
        { status: 400 }
      );
    }
    
    const success = await renameConversation(id, title);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    const response: RenameConversationResponse = {
      success: true
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[api/conversations] PUT error:', errorMessage(error, 'Unknown error'));
    return NextResponse.json(
      { error: 'Failed to rename conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }
    
    const success = await deleteConversation(id);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    const response: DeleteConversationResponse = {
      success: true
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[api/conversations] DELETE error:', errorMessage(error, 'Unknown error'));
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}