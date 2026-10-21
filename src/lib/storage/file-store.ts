/**
 * Uploaded-file storage.
 *
 * `fs`     — files live next to the document store (local dev, writable hosts).
 * `vercel` — files live in a private Vercel Blob store. The stored reference is
 *            the blob URL; reads are authenticated with the read/write token.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getStorageConfig } from './config';

export interface FileStore {
  /** Persist a PDF and return an opaque reference to store on the document. */
  save(documentId: string, buffer: Buffer, originalName: string): Promise<string>;
  /** Read a previously saved PDF. Throws when the reference does not exist. */
  read(reference: string): Promise<Buffer>;
  exists(reference: string): Promise<boolean>;
  /** Best-effort delete; never throws for an already-missing file. */
  remove(reference: string): Promise<void>;
  /** Absolute local path, or `null` when the file lives in remote storage. */
  localPath(reference: string): string | null;
}

function safeFileName(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createFsFileStore(dir: string): FileStore {
  return {
    async save(documentId, buffer, originalName) {
      await fs.mkdir(dir, { recursive: true });
      const fileName = `${documentId}_${safeFileName(originalName)}`;
      await fs.writeFile(path.join(dir, fileName), buffer);
      return fileName;
    },
    async read(reference) {
      return fs.readFile(path.join(dir, reference));
    },
    async exists(reference) {
      try {
        await fs.access(path.join(dir, reference));
        return true;
      } catch {
        return false;
      }
    },
    async remove(reference) {
      try {
        await fs.unlink(path.join(dir, reference));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
    localPath(reference) {
      return path.join(dir, reference);
    },
  };
}

function createVercelBlobFileStore(token: string): FileStore {
  const pathnameFor = (documentId: string, originalName: string) =>
    `documents/${documentId}/${safeFileName(originalName)}`;

  return {
    async save(documentId, buffer, originalName) {
      const { put } = await import('@vercel/blob');
      const result = await put(pathnameFor(documentId, originalName), buffer, {
        access: 'private',
        token,
        contentType: 'application/pdf',
        // Deterministic path so re-uploads overwrite instead of leaking blobs.
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return result.url;
    },
    async read(reference) {
      const { get } = await import('@vercel/blob');
      const result = await get(reference, { access: 'private', token });
      if (!result || result.statusCode !== 200 || !result.stream) {
        throw new Error(`Stored file not found: ${reference}`);
      }
      const arrayBuffer = await new Response(result.stream).arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    async exists(reference) {
      const { head } = await import('@vercel/blob');
      try {
        await head(reference, { token });
        return true;
      } catch {
        return false;
      }
    },
    async remove(reference) {
      const { del } = await import('@vercel/blob');
      await del(reference, { token });
    },
    localPath() {
      return null;
    },
  };
}

/**
 * Build the file store for the configured driver. `fallbackDir` is only used by
 * the filesystem driver.
 */
export function createFileStore(fallbackDir: string): FileStore {
  const config = getStorageConfig();
  if (config.driver === 'vercel') {
    if (!config.blobToken) {
      throw new Error(
        'STORAGE_DRIVER=vercel requires BLOB_READ_WRITE_TOKEN. Set it in the deployment environment.',
      );
    }
    return createVercelBlobFileStore(config.blobToken);
  }
  return createFsFileStore(fallbackDir);
}
