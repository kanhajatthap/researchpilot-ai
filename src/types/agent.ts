import { ToolCall } from './chat';

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped';

export interface AgentStep {
  id: string;
  label: string;
  status: AgentStepStatus;
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
