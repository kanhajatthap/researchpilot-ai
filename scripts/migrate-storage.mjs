#!/usr/bin/env node
/**
 * One-off migration: local filesystem storage -> Postgres + Vercel Blob.
 *
 * Usage (with DATABASE_URL and BLOB_READ_WRITE_TOKEN exported):
 *
 *   npm run migrate:storage
 *
 * - Reads data/documents/documents.json, data/conversations/conversations.json,
 *   and data/users/users.json (or DOCUMENT_STORE_PATH / CONVERSATION_STORE_PATH /
 *   USER_STORE_PATH overrides).
 * - Uploads each stored PDF to the private Blob store and rewrites `filePath`
 *   to the resulting blob URL.
 * - Upserts all JSON documents into the `app_state` table used at runtime.
 *
 * Safe to re-run: blobs overwrite deterministically and state rows are upserted.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { put } from '@vercel/blob';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

if (!databaseUrl || !blobToken) {
  console.error(
    'Missing configuration. Set DATABASE_URL (or POSTGRES_URL) and BLOB_READ_WRITE_TOKEN.',
  );
  process.exit(1);
}

const docsDir =
  process.env.DOCUMENT_STORE_PATH || path.join(process.cwd(), 'data', 'documents');
const convDir =
  process.env.CONVERSATION_STORE_PATH || path.join(process.cwd(), 'data', 'conversations');
const usersDir =
  process.env.USER_STORE_PATH || path.join(process.cwd(), 'data', 'users');

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function upsert(pool, key, value) {
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

async function migrateDocuments(pool) {
  const state = await readJson(path.join(docsDir, 'documents.json'), { documents: {} });
  const records = Object.values(state.documents || {});
  let uploaded = 0;

  for (const doc of records) {
    if (!doc.filePath || /^https?:\/\//i.test(doc.filePath)) continue;

    const storedName = path.basename(doc.filePath);
    const prefix = `${doc.id}_`;
    const originalSafe = storedName.startsWith(prefix)
      ? storedName.slice(prefix.length)
      : safeName(doc.fileName || storedName);

    const buffer = await fs.readFile(path.join(docsDir, 'files', storedName));
    const result = await put(`documents/${doc.id}/${originalSafe}`, buffer, {
      access: 'private',
      token: blobToken,
      contentType: 'application/pdf',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    doc.filePath = result.url;
    uploaded += 1;
  }

  await upsert(pool, 'documents', state);
  return { records: records.length, uploaded };
}

async function migrateConversations(pool) {
  const state = await readJson(path.join(convDir, 'conversations.json'), {
    conversations: {},
  });
  const count = Object.keys(state.conversations || {}).length;
  await upsert(pool, 'conversations', state);
  return { records: count };
}

async function migrateUsers(pool) {
  const state = await readJson(path.join(usersDir, 'users.json'), {
    users: {},
    sessions: {},
  });
  const count = Object.keys(state.users || {}).length;
  await upsert(pool, 'users', state);
  return { records: count };
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
  ...(/localhost|127\.0\.0\.1/.test(databaseUrl)
    ? {}
    : { ssl: { rejectUnauthorized: false } }),
});

try {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_state (
       key text PRIMARY KEY,
       value jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const documents = await migrateDocuments(pool);
  const conversations = await migrateConversations(pool);
  const users = await migrateUsers(pool);

  console.log(
    `Migrated ${documents.records} document(s) (${documents.uploaded} PDF(s) uploaded to Blob), ` +
      `${conversations.records} conversation(s), and ${users.records} user account(s) to Postgres.`,
  );
} finally {
  await pool.end();
}
