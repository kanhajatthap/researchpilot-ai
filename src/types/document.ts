export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export type DocumentStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'error';

export interface StatusTransition {
  status: DocumentStatus;
  timestamp: string; // ISO string for JSON serialization
  attemptId?: string;
  error?: string;
}

export interface Document {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: Date;
  pageCount?: number;
  chunkCount?: number;
  metadata?: Record<string, unknown>;
  error?: string; // Error message if status is 'error'
  /** Unique identifier for the current processing attempt. Used to reject stale writes. */
  attemptId?: string;
  /** Timestamped history of status transitions for audit and recovery. */
  statusHistory?: StatusTransition[];
  /** SHA-256 hash of file content for duplicate detection. */
  contentHash?: string;
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
