import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import rosterRoutes from './routes/roster';
import userRoutes from './routes/users';
import employeeRoutes from './routes/employees';
import settingsRoutes from './routes/settings';

const app = express();
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

app.use(helmet());

const corsOrigin = process.env.CORS_ORIGIN;
const allowedOrigins = (corsOrigin || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !corsOrigin?.trim()) {
  throw new Error('CORS_ORIGIN must list allowed frontend origins in production');
}

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.use(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
);

app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false })
);

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/settings', settingsRoutes);

app.use(express.static(FRONTEND_DIST));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

export default app;
