import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import rosterRoutes from './routes/roster';
import userRoutes from './routes/users';
import employeeRoutes from './routes/employees';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

// Security headers
app.use(helmet());

// CORS — only needed when frontend is on a different origin (separate dev server)
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: true }));

app.use(express.json());

// Strict rate limit on login to slow brute-force attempts (10 req / 15 min per IP)
app.use(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
);

// General API limit (200 req / min per IP) — blocks scripted bulk abuse
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false })
);

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);

// Serve built frontend — SPA fallback sends all non-API routes to index.html
app.use(express.static(FRONTEND_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Roster backend running on http://localhost:${PORT}`);
});
