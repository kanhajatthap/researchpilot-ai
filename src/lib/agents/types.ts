import { ToolCall } from '@/types/chat';

export type ToolName =
  | 'search'
  | 'search_documents'
  | 'calculator'
  | 'web_search'
  | 'list_documents'
  | 'search_arxiv'
  | 'git_save_notes'
  | 'git_status'
  | 'git_notes_history';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs?: number;
}

export interface AgentStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  timestamp: Date;
  message: string;
  toolCalls?: ToolCall[];
  toolResults?: unknown[];
}

export interface AgentTrace {
  id: string;
  steps: AgentStep[];
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs?: number;
}