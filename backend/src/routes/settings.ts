import { Router } from 'express';
import db from '../db/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
const LOGIN_LOGO_KEY = 'loginLogo';
const ACCENT_COLOR_KEY = 'accentColor';
const DEFAULT_ACCENT_COLOR = '#4f46e5';
const MAX_LOGO_DATA_URL_LENGTH = 1_500_000;

type LoginLogo = {
  dataUrl: string;
  fileName: string;
  mimeType: 'image/png' | 'image/svg+xml';
};

type PublicSettings = {
  loginLogo: LoginLogo | null;
  accentColor: string;
};

function readSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
  return row?.value || null;
}

function writeSetting(key: string, value: string) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

function readLoginLogo(): LoginLogo | null {
  const value = readSetting(LOGIN_LOGO_KEY);
  if (!value) return null;
  try {
    const logo = JSON.parse(value);
    if (isValidLogo(logo)) return logo;
  } catch {
    return null;
  }
  return null;
}

function isValidLogo(logo: any): logo is LoginLogo {
  if (!logo || typeof logo !== 'object') return false;
  if (logo.mimeType !== 'image/png' && logo.mimeType !== 'image/svg+xml') return false;
  if (typeof logo.fileName !== 'string' || logo.fileName.trim().length === 0 || logo.fileName.length > 200) return false;
  if (typeof logo.dataUrl !== 'string' || logo.dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) return false;

  if (logo.mimeType === 'image/png') {
    return logo.dataUrl.startsWith('data:image/png;base64,');
  }

  return (
    logo.dataUrl.startsWith('data:image/svg+xml,') ||
    logo.dataUrl.startsWith('data:image/svg+xml;charset=utf-8,') ||
    logo.dataUrl.startsWith('data:image/svg+xml;base64,')
  );
}

function isValidAccentColor(color: any): color is string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function readAccentColor() {
  const color = readSetting(ACCENT_COLOR_KEY);
  return isValidAccentColor(color) ? color : DEFAULT_ACCENT_COLOR;
}

function readPublicSettings(): PublicSettings {
  return {
    loginLogo: readLoginLogo(),
    accentColor: readAccentColor(),
  };
}

router.get('/public', (_req, res) => {
  res.json(readPublicSettings());
});

router.put('/login-logo', authenticate, requireAdmin, (req, res) => {
  const { loginLogo } = req.body;

  if (loginLogo === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(LOGIN_LOGO_KEY);
    return res.json({ loginLogo: null });
  }

  if (!isValidLogo(loginLogo)) {
    return res.status(400).json({ error: 'Upload a valid PNG or SVG logo under 1 MB.' });
  }

  writeSetting(LOGIN_LOGO_KEY, JSON.stringify(loginLogo));

  res.json({ loginLogo });
});

router.put('/accent-color', authenticate, requireAdmin, (req, res) => {
  const { accentColor } = req.body;

  if (!isValidAccentColor(accentColor)) {
    return res.status(400).json({ error: 'Choose a valid accent color.' });
  }

  writeSetting(ACCENT_COLOR_KEY, accentColor.toLowerCase());
  res.json({ accentColor: accentColor.toLowerCase() });
});

export default router;
