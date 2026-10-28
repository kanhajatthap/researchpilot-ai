/**
 * User account + session store.
 *
 * Two drivers, mirroring the document and conversation stores:
 *  - `fs`    — `data/users/users.json` (local dev, tests, writable hosts).
 *  - `pg`    — one JSONB row (`users`) in the `app_state` table. Used whenever a
 *              Postgres connection string is configured (or `STORAGE_DRIVER=vercel`).
 *
 * Serverless platforms (Vercel) ship the app in a read-only bundle, so writing
 * accounts to `process.cwd()` fails with ENOENT/EROFS and every account (and
 * session) is lost between invocations. Persisting accounts in Postgres makes
 * sign-up, login, and sessions survive cold starts and be shared by every
 * instance.
 */

import { randomUUID, randomBytes, scryptSync } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getStorageConfig } from '@/lib/storage/config';
import { readStateRow, withStateRow } from '@/lib/storage/postgres';
import type { User, StoredUser } from '@/types/auth';

const POSTGRES_KEY = 'users';

/**
 * Raised when accounts/sessions cannot be persisted because the configured
 * storage is missing or unwritable. Routes surface this as a 503 so operators
 * see the real cause instead of a generic failure.
 */
export class AuthStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthStorageError';
  }
}

interface UserStoreData {
  users: Record<string, StoredUser>;
  sessions: Record<string, { userId: string; expiresAt: string }>;
}

let inMemoryUsers: UserStoreData | null = null;
let mutationChain: Promise<unknown> = Promise.resolve();

/**
 * Accounts only need Postgres, not Blob storage, so a database URL alone is
 * enough to persist them. An explicit `STORAGE_DRIVER=fs` still wins (local
 * development, tests).
 */
function isPostgresDriver(): boolean {
  const config = getStorageConfig();
  if (config.driver === 'vercel') return true;
  const explicit = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit) return false;
  const databaseUrl = process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.VERCEL_POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim();
  return Boolean(databaseUrl);
}

function dataDir(): string {
  // Prefer explicit override from env so tests can point at a temp dir.
  return process.env.USER_STORE_PATH || path.join(process.cwd(), 'data', 'users');
}

function usersFile(): string {
  return path.join(dataDir(), 'users.json');
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return hash === storedHash;
}

function toPublicUser(user: StoredUser): User {
  const publicUser: User = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
  if (user.avatarUrl) publicUser.avatarUrl = user.avatarUrl;
  return publicUser;
}

function normalizeStore(value: unknown): UserStoreData {
  const parsed = (value ?? {}) as Partial<UserStoreData>;
  return {
    users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
    sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
  };
}

/** Demo accounts shown on the login page (seeded on first use). */
function createInitialStore(): UserStoreData {
  const adminSalt = randomBytes(16).toString('hex');
  const pilotSalt = randomBytes(16).toString('hex');

  const demoUser: StoredUser = {
    id: 'usr_demo_001',
    name: 'Admin Lead',
    email: 'admin@researchpilot.ai',
    role: 'admin',
    createdAt: new Date().toISOString(),
    salt: adminSalt,
    passwordHash: hashPassword('Password123!', adminSalt),
  };

  const pilotUser: StoredUser = {
    id: 'usr_demo_002',
    name: 'Research Pilot',
    email: 'demo@researchpilot.ai',
    role: 'researcher',
    createdAt: new Date().toISOString(),
    salt: pilotSalt,
    passwordHash: hashPassword('Password123!', pilotSalt),
  };

  return {
    users: {
      [demoUser.id]: demoUser,
      [pilotUser.id]: pilotUser,
    },
    sessions: {},
  };
}

function storeWriteError(error: unknown): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && ['EROFS', 'ENOENT', 'EACCES', 'EPERM'].includes(code)) {
    return new AuthStorageError(
      `User accounts cannot be saved to ${usersFile()} (${code}). This host has a ` +
        'read-only or ephemeral filesystem. Add a Postgres database and set ' +
        'DATABASE_URL (or POSTGRES_URL) in the deployment environment, or point ' +
        'USER_STORE_PATH at a writable persistent disk.',
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function readStoreFile(): Promise<UserStoreData | null> {
  try {
    const content = await fs.readFile(usersFile(), 'utf-8');
    return normalizeStore(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // Never silently reseed over an unreadable store — that would erase accounts.
    throw error;
  }
}

async function readStore(): Promise<UserStoreData> {
  if (isPostgresDriver()) {
    const stored = await readStateRow<UserStoreData>(POSTGRES_KEY);
    return stored ? normalizeStore(stored) : createInitialStore();
  }

  if (inMemoryUsers) return inMemoryUsers;
  const stored = await readStoreFile();
  inMemoryUsers = stored ?? createInitialStore();
  return inMemoryUsers;
}

async function writeStoreFile(state: UserStoreData): Promise<void> {
  const target = usersFile();
  try {
    await fs.mkdir(dataDir(), { recursive: true });
    const tempFile = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tempFile, target);
  } catch (error) {
    throw storeWriteError(error);
  }
  inMemoryUsers = state;
}

/** Serialize in-process mutations (filesystem driver only). */
function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(fn);
  mutationChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Atomic read-modify-write for one account/session mutation. Postgres uses a
 * row lock so concurrent serverless invocations cannot clobber each other (and
 * cannot register the same email twice).
 */
async function mutateStore<T>(fn: (state: UserStoreData) => Promise<T> | T): Promise<T> {
  if (isPostgresDriver()) {
    return withStateRow<UserStoreData, T>(POSTGRES_KEY, async (current) => {
      const state = current ? normalizeStore(current) : createInitialStore();
      const result = await fn(state);
      return { value: state, result };
    });
  }

  return withStoreLock(async () => {
    const state = await readStore();
    const result = await fn(state);
    await writeStoreFile(state);
    return result;
  });
}

/**
 * Fail fast with an actionable message when accounts have nowhere durable to
 * live (e.g. Vercel without a Postgres database).
 */
export function assertAuthStorageReady(): void {
  if (isPostgresDriver()) return;
  if (process.env.VERCEL) {
    throw new AuthStorageError(
      'User accounts require a persistent database on Vercel. Add a Postgres ' +
        'database and set DATABASE_URL (or POSTGRES_URL) in the project environment, ' +
        'then redeploy.',
    );
  }
}

export const userStore = {
  async findByEmail(email: string): Promise<StoredUser | null> {
    const data = await readStore();
    const normalized = email.toLowerCase().trim();
    for (const user of Object.values(data.users)) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  },

  async findById(id: string): Promise<User | null> {
    const data = await readStore();
    const user = data.users[id];
    return user ? toPublicUser(user) : null;
  },

  async create(name: string, email: string, password: string): Promise<User> {
    const normalizedEmail = email.toLowerCase().trim();
    return mutateStore((data) => {
      const duplicate = Object.values(data.users).find(
        (user) => user.email.toLowerCase() === normalizedEmail,
      );
      if (duplicate) {
        throw new Error('An account with this email already exists.');
      }

      const salt = randomBytes(16).toString('hex');
      const newUser: StoredUser = {
        id: `usr_${randomUUID()}`,
        name: name.trim(),
        email: normalizedEmail,
        role: 'user',
        createdAt: new Date().toISOString(),
        salt,
        passwordHash: hashPassword(password, salt),
      };

      data.users[newUser.id] = newUser;
      return toPublicUser(newUser);
    });
  },

  async authenticate(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) return null;

    return toPublicUser(user);
  },

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    await mutateStore((data) => {
      data.sessions[token] = { userId, expiresAt };
    });
    return token;
  },

  async getSessionUser(token: string): Promise<User | null> {
    if (!token) return null;
    const data = await readStore();
    const session = data.sessions[token];
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await mutateStore((current) => {
        delete current.sessions[token];
      });
      return null;
    }

    const user = data.users[session.userId];
    return user ? toPublicUser(user) : null;
  },

  async deleteSession(token: string): Promise<void> {
    const data = await readStore();
    if (!data.sessions[token]) return;
    await mutateStore((current) => {
      delete current.sessions[token];
    });
  },

  async createPasswordResetToken(email: string): Promise<string | null> {
    const normalized = email.toLowerCase().trim();
    return mutateStore((data) => {
      const user = Object.values(data.users).find(
        (candidate) => candidate.email.toLowerCase() === normalized,
      );
      if (!user) return null;

      const token = randomBytes(24).toString('hex');
      user.resetToken = token;
      user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      return token;
    });
  },

  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    return mutateStore((data) => {
      for (const [, user] of Object.entries(data.users)) {
        if (user.resetToken !== token) continue;

        if (user.resetTokenExpiry && new Date(user.resetTokenExpiry).getTime() < Date.now()) {
          return false; // Expired
        }

        const newSalt = randomBytes(16).toString('hex');
        user.salt = newSalt;
        user.passwordHash = hashPassword(newPassword, newSalt);
        delete user.resetToken;
        delete user.resetTokenExpiry;
        return true;
      }
      return false;
    });
  },
};
