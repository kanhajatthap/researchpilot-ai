export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'researcher';
  createdAt: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export interface StoredUser extends User {
  passwordHash: string;
  salt: string;
  resetToken?: string;
  resetTokenExpiry?: string;
}
