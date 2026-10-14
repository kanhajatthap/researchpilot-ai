import { ToolCall } from '@/types/chat';

export type ToolName = 'search' | 'calculator' | 'web_search';

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