import type { AgentTrace } from '@/types/agent';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
  timestamp: Date;
  error?: string;
}

export interface Citation {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  chunkId: string;
  reason?: string;
  excerpt?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  createdAt: Date;
  /** Store agent execution trace for UI display */
  agentTrace?: AgentTrace;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatState {
  conversationId: string;
  messages: Message[];
  isLoading: boolean;
  error?: string;
}