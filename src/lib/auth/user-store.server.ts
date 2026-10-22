import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { User, StoredUser } from '@/types/auth';

const DATA_DIR = path.join(process.cwd(), 'data', 'users');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return hash === storedHash;
}

interface UserStoreData {
  users: Record<string, StoredUser>;
  sessions: Record<string, { userId: string; expiresAt: string }>;
}

let inMemoryUsers: UserStoreData | null = null;
let fileLock: Promise<void> = Promise.resolve();

async function ensureStore(): Promise<UserStoreData> {
  if (inMemoryUsers) return inMemoryUsers;

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const content = await fs.readFile(USERS_FILE, 'utf-8');
    inMemoryUsers = JSON.parse(content);
    return inMemoryUsers!;
  } catch {
    // Initialize with default demo users
    const salt1 = randomBytes(16).toString('hex');
    const salt2 = randomBytes(16).toString('hex');

    const demoUser: StoredUser = {
      id: 'usr_demo_001',
      name: 'Admin Lead',
      email: 'admin@researchpilot.ai',
      role: 'admin',
      createdAt: new Date().toISOString(),
      salt: salt1,
      passwordHash: hashPassword('Password123!', salt1),
    };

    const pilotUser: StoredUser = {
      id: 'usr_demo_002',
      name: 'Research Pilot',
      email: 'demo@researchpilot.ai',
      role: 'researcher',
      createdAt: new Date().toISOString(),
      salt: salt2,
      passwordHash: hashPassword('Password123!', salt2),
    };

    const initialData: UserStoreData = {
      users: {
        [demoUser.id]: demoUser,
        [pilotUser.id]: pilotUser,
      },
      sessions: {},
    };

    await fs.writeFile(USERS_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    inMemoryUsers = initialData;
    return inMemoryUsers;
  }
}

async function saveStore(data: UserStoreData): Promise<void> {
  inMemoryUsers = data;
  const nextLock = fileLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${USERS_FILE}.${randomUUID()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempFile, USERS_FILE);
  });
  fileLock = nextLock.catch(() => {});
  await nextLock;
}

export const userStore = {
  async findByEmail(email: string): Promise<StoredUser | null> {
    const data = await ensureStore();
    const normalized = email.toLowerCase().trim();
    for (const user of Object.values(data.users)) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  },

  async findById(id: string): Promise<User | null> {
    const data = await ensureStore();
    const user = data.users[id];
    if (!user) return null;
    const { passwordHash, salt, resetToken, resetTokenExpiry, ...cleanUser } = user;
    return cleanUser;
  },

  async create(name: string, email: string, password: string): Promise<User> {
    const data = await ensureStore();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const salt = randomBytes(16).toString('hex');
    const newUser: StoredUser = {
      id: `usr_${randomUUID()}`,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: 'user',
      createdAt: new Date().toISOString(),
      salt,
      passwordHash: hashPassword(password, salt),
    };

    data.users[newUser.id] = newUser;
    await saveStore(data);

    const { passwordHash: _, salt: __, ...cleanUser } = newUser;
    return cleanUser;
  },

  async authenticate(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) return null;

    const { passwordHash, salt, resetToken, resetTokenExpiry, ...cleanUser } = user;
    return cleanUser;
  },

  async createSession(userId: string): Promise<string> {
    const data = await ensureStore();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    data.sessions[token] = { userId, expiresAt };
    await saveStore(data);
    return token;
  },

  async getSessionUser(token: string): Promise<User | null> {
    if (!token) return null;
    const data = await ensureStore();
    const session = data.sessions[token];
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      delete data.sessions[token];
      await saveStore(data);
      return null;
    }

    return this.findById(session.userId);
  },

  async deleteSession(token: string): Promise<void> {
    const data = await ensureStore();
    if (data.sessions[token]) {
      delete data.sessions[token];
      await saveStore(data);
    }
  },

  async createPasswordResetToken(email: string): Promise<string | null> {
    const data = await ensureStore();
    const user = await this.findByEmail(email);
    if (!user) return null;

    const token = randomBytes(24).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    data.users[user.id].resetToken = token;
    data.users[user.id].resetTokenExpiry = expiry;
    await saveStore(data);

    return token;
  },

  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    const data = await ensureStore();
    for (const [id, user] of Object.entries(data.users)) {
      if (user.resetToken === token) {
        if (user.resetTokenExpiry && new Date(user.resetTokenExpiry).getTime() < Date.now()) {
          return false; // Expired
        }

        const newSalt = randomBytes(16).toString('hex');
        data.users[id].salt = newSalt;
        data.users[id].passwordHash = hashPassword(newPassword, newSalt);
        delete data.users[id].resetToken;
        delete data.users[id].resetTokenExpiry;

        await saveStore(data);
        return true;
      }
    }
    return false;
  },
};
