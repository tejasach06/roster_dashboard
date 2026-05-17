import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const rawSecret = process.env.JWT_SECRET;
const insecureDevSecret = 'roster-secret-key-change-in-prod';

if (!rawSecret || rawSecret === insecureDevSecret || rawSecret.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a unique value with at least 32 characters in production');
  }
  console.warn('[security] JWT_SECRET not set — using insecure default. Set JWT_SECRET in .env before deploying.');
}
export const JWT_SECRET = rawSecret || insecureDevSecret;

export interface AuthRequest extends Request {
  user?: { id: number; name: string; username: string; role: string; team_id: number | null };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthRequest['user'];
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function canAccessTeam(user: AuthRequest['user'], teamId: number): boolean {
  return user?.role === 'admin' || user?.team_id === teamId;
}
