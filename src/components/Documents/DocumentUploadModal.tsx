'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export function DocumentUploadModal({ open, onOpenChange, onUploadSuccess }: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
    setSuccess(null);
    setProgress(0);
  };

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      setError(`File too large (max ${maxSize / 1024 / 1024} MB)`);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 300);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      setProgress(100);
      setSuccess(`Document uploaded successfully! ID: ${result.documentId}`);

      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Reset form after a short delay
      setTimeout(() => {
        setFile(null);
        setSuccess(null);
        setProgress(0);
        onOpenChange(false);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during upload';
      setError(message);
    } finally {
      setUploading(false);
    }
  }, [file, onOpenChange, onUploadSuccess]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:mx-0 sm:h-full sm:items-center">
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-xl transform -translate-x-1/2 -translate-y-1/2 scale-95 border-none bg-card/95 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-top-[40%] data-[state=open]:slide-in-from-top-[40%] sm:max-w-lg">
        <div className="p-6 space-y-4">
          <div className="flex flex-col space-y-2">
            <h2 className="text-lg font-semibold">Upload Document</h2>
            <p className="text-sm text-muted-foreground">Upload PDF documents to enable RAG-powered questions</p>
          </div>
          <form className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="document-upload">
                PDF File
              </label>
              <Input
                id="document-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground"
                disabled={uploading}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </p>
              )}
            </div>
            {error && (
              <div className="flex items-center space-x-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-center space-x-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{success}</span>
              </div>
            )}
          </form>
          <div className="flex flex-col-reverse sm:flex-row sm:space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !file}
              className="w-full sm:w-auto"
            >
              {uploading ? (
                <>
                  Uploading... {progress}%
                </>
              ) : (
                'Upload Document'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}