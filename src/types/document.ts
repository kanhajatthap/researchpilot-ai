export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface Document {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  size: number;
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'error';
  uploadedAt: Date;
  pageCount?: number;
  chunkCount?: number;
  metadata?: Record<string, unknown>;
  error?: string; // Error message if status is 'error'
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
