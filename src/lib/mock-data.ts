import type { Document } from '@/types/document';
import type { Conversation } from '@/types/chat';
import type { Citation } from '@/types/document';
import type { AgentStep } from '@/types/agent';
export const mockDocuments: Document[] = [
  { id: 'doc-1', name: 'Tesla Annual Report 2025', fileName: 'tesla-annual-report-2025.pdf', fileType: 'pdf', size: 1024000, status: 'ready', uploadedAt: new Date('2026-09-01'), pageCount: 52, chunkCount: 34, metadata: { company: 'Tesla', year: 2025 } },
  { id: 'doc-2', name: 'Tesla Annual Report 2024', fileName: 'tesla-annual-report-2024.pdf', fileType: 'pdf', size: 948000, status: 'ready', uploadedAt: new Date('2026-09-05'), pageCount: 49, chunkCount: 28, metadata: { company: 'Tesla', year: 2024 } },
  { id: 'doc-3', name: 'Apple Annual Report 2025', fileName: 'apple-annual-report-2025.pdf', fileType: 'pdf', size: 1200000, status: 'ready', uploadedAt: new Date('2026-09-10'), pageCount: 62, chunkCount: 41, metadata: { company: 'Apple', year: 2025 } },
];
export const mockConversations: Conversation[] = [
  { id: 'conv-1', title: 'Compare Tesla revenue across years', messages: [], createdAt: new Date('2026-10-09T09:00:00Z'), updatedAt: new Date('2026-10-09T09:00:00Z') },
  { id: 'conv-2', title: 'Apple revenue analysis', messages: [], createdAt: new Date('2026-10-09T10:15:00Z'), updatedAt: new Date('2026-10-09T10:15:00Z') },
];
export const mockCitations: Citation[] = [
  { id: 'cit-1', documentId: 'doc-1', documentName: 'Tesla Annual Report 2025', pageNumber: 52, chunkId: 'chunk-1', reason: 'Revenue figures for 2025' },
  { id: 'cit-2', documentId: 'doc-2', documentName: 'Tesla Annual Report 2024', pageNumber: 49, chunkId: 'chunk-2', reason: 'Revenue figures for 2024' },
];
export const mockAgentSteps: AgentStep[] = [
  { id: 'step-1', label: 'Question analyzed', status: 'completed', timestamp: new Date(), message: 'Analyzed intent and scope' },
  { id: 'step-2', label: 'Document retrieval', status: 'completed', timestamp: new Date(), message: 'Searched across 3 documents' },
  { id: 'step-3', label: 'Relevant chunks retrieved', status: 'completed', timestamp: new Date(), message: 'Retrieved 5 relevant chunks' },
  { id: 'step-4', label: 'Tool execution', status: 'completed', timestamp: new Date(), message: 'RAG tool executed successfully' },
  { id: 'step-5', label: 'Sources prepared', status: 'completed', timestamp: new Date(), message: '2 sources prepared' },
  { id: 'step-6', label: 'Response generated', status: 'completed', timestamp: new Date(), message: 'Answer synthesized' },
];
export const suggestedQuestions = [
  'Compare Tesla revenue across two years',
  'Summarize the key findings in a report',
  'Find risks mentioned in the documents',
  'Calculate year-over-year growth',
  'What was Apple\u2019s revenue in 2025?',
];

