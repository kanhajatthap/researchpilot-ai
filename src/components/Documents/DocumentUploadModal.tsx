'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, AlertCircle, FileText, Sparkles, X } from 'lucide-react';

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'embedding' | 'complete' | 'error';

export function DocumentUploadModal({ open, onOpenChange, onUploadSuccess }: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [stageMessage, setStageMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
    setSuccess(null);
    setPhase('idle');
    setProgress(0);
    setStageMessage('');
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

    setPhase('uploading');
    setError(null);
    setSuccess(null);
    setProgress(15);
    setStageMessage('Uploading PDF to server...');

    // Simulate realistic stages while the server processes the document
    let currentProg = 15;
    clearTimer();
    progressTimerRef.current = setInterval(() => {
      currentProg += 1;
      if (currentProg < 35) {
        setPhase('uploading');
        setStageMessage('Uploading PDF to server...');
        setProgress(currentProg);
      } else if (currentProg < 65) {
        setPhase('extracting');
        setStageMessage('Extracting text & chunking pages...');
        setProgress(currentProg);
      } else if (currentProg <= 94) {
        setPhase('embedding');
        setStageMessage('Generating AI embeddings & indexing chunks (Gemini Free Tier)...');
        setProgress(currentProg);
      }
    }, 600);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      clearTimer();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.documentId) {
          setPhase('complete');
          setProgress(100);
          setSuccess('Document is already queued/being processed in your Knowledge Base.');
          if (onUploadSuccess) onUploadSuccess();
          setTimeout(() => {
            setFile(null);
            setSuccess(null);
            setPhase('idle');
            setProgress(0);
            onOpenChange(false);
          }, 2000);
          return;
        }
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      setPhase('complete');
      setProgress(100);
      setStageMessage('Indexing complete!');
      setSuccess(`Document processed successfully! (${result.chunks || 0} chunks indexed)`);

      if (onUploadSuccess) {
        onUploadSuccess();
      }

      setTimeout(() => {
        setFile(null);
        setSuccess(null);
        setPhase('idle');
        setProgress(0);
        onOpenChange(false);
      }, 1800);
    } catch (err: unknown) {
      clearTimer();
      setPhase('error');
      const message = err instanceof Error ? err.message : 'An error occurred during upload';
      setError(message);
    }
  }, [file, onOpenChange, onUploadSuccess]);

  if (!open) return null;

  const isWorking = phase === 'uploading' || phase === 'extracting' || phase === 'embedding';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:mx-0 sm:h-full sm:items-center">
      <div 
        className="fixed inset-0 bg-background/70 backdrop-blur-sm transition-opacity" 
        onClick={() => {
          if (!isWorking) onOpenChange(false);
        }} 
      />
      <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-xl transform -translate-x-1/2 -translate-y-1/2 scale-100 rounded-xl border border-border/70 bg-card p-6 shadow-2xl duration-200 sm:max-w-lg">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </span>
                <h2 className="text-lg font-semibold text-foreground">Upload Document</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Upload PDF files to enable deep RAG search & research analysis
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="document-upload">
                Select PDF File
              </label>
              <Input
                id="document-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="h-10 w-full cursor-pointer rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                disabled={isWorking}
              />
              {file && (
                <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-medium text-foreground truncate max-w-[280px]">{file.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {(file.size / 1024 / 1024).toFixed(2)} MB ({Math.round(file.size / 1024)} KB)
                  </span>
                </div>
              )}
            </div>

            {/* Live Progress Display */}
            {isWorking && (
              <div className="space-y-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    {stageMessage}
                  </span>
                  <span className="font-bold tabular-nums text-primary">{progress}%</span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  ⚡ <strong>100% Free Processing:</strong> Large PDFs (e.g. 1MB+ with 50+ pages) generate hundreds of chunks. Embeddings are generated in rate-limit compliant batches. You can also close this dialog; processing will proceed in the background!
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start space-x-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive" role="alert">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span className="leading-tight">{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center space-x-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400" role="alert">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}
          </form>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {isWorking ? 'Close Window (Run in Background)' : 'Cancel'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleUpload}
              disabled={isWorking || !file}
              className="gap-1.5"
            >
              {isWorking ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Processing ({progress}%)
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Upload & Index
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}