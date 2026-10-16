import { NextRequest, NextResponse } from 'next/server';
import { documentStore } from '@/lib/rag/document-store';
import { vectorStore } from '@/lib/rag/vectorstore';

export const runtime = 'nodejs';

/**
 * Document recovery for interrupted processing.
 *
 * A document can be left in `processing`/`queued` when the server was stopped or
 * crashed mid-attempt. This endpoint reports — and, only when explicitly asked,
 * repairs — such records.
 *
 * Safety:
 *   - Dry-run is the default (GET or POST without `apply: true`). It never
 *     mutates state.
 *   - Only records whose last heartbeat/status change is older than `minAgeMs`
 *     are considered abandoned. A live attempt heartbeats between batches, so it
 *     is never reset merely for being old.
 *   - Applying assigns a fresh attemptId, so a still-running old attempt can
 *     never later mark the document ready/failed.
 *   - Never triggered automatically on startup.
 *
 * GET  /api/documents/recovery                    → dry-run report
 * POST /api/documents/recovery  { apply, minAgeMs } → dry-run unless apply: true
 */
const DEFAULT_MIN_AGE_MS = 10 * 60 * 1000; // 10 minutes
const MAX_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseMinAge(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MIN_AGE_MS;
  return Math.min(n, MAX_MIN_AGE_MS);
}

export async function GET() {
  try {
    const report = await documentStore.recoverInterrupted({
      dryRun: true,
      minAgeMs: DEFAULT_MIN_AGE_MS,
    });
    return NextResponse.json(report);
  } catch (error) {
    console.error('[recovery] dry-run failed:', error);
    return NextResponse.json({ error: 'Failed to scan documents for recovery' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const input = (body ?? {}) as { apply?: unknown; minAgeMs?: unknown };
  const apply = input.apply === true;
  const minAgeMs = parseMinAge(input.minAgeMs);

  try {
    const report = await documentStore.recoverInterrupted({ dryRun: !apply, minAgeMs });

    if (apply && report.recovered.length > 0) {
      // Best-effort vector reconciliation for recovered documents: their partial
      // vectors belonged to the interrupted attempt. Failure is reported, never
      // fatal — a subsequent retry re-verifies cleanup before reprocessing.
      for (const candidate of report.recovered) {
        try {
          await vectorStore.deleteDocument(candidate.id);
          candidate.hasVectorsRemoved = 'ok';
        } catch (error) {
          candidate.hasVectorsRemoved = 'failed';
          console.error(`[recovery] vector cleanup failed document=${candidate.id}:`, error);
        }
      }
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('[recovery] failed:', error);
    return NextResponse.json({ error: 'Recovery failed' }, { status: 500 });
  }
}
