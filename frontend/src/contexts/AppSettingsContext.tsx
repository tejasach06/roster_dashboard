import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

export interface LoginLogo {
  dataUrl: string;
  fileName: string;
  mimeType: 'image/png' | 'image/svg+xml';
}

const DEFAULT_ACCENT_COLOR = '#4f46e5';

interface AppSettingsContextType {
  loginLogo: LoginLogo | null;
  accentColor: string;
  saveLoginLogo: (logo: LoginLogo) => Promise<void>;
  clearLoginLogo: () => Promise<void>;
  saveAccentColor: (color: string) => Promise<void>;
}

const STORAGE_KEY = 'app-settings';

const AppSettingsContext = createContext<AppSettingsContextType>({
  loginLogo: null,
  accentColor: DEFAULT_ACCENT_COLOR,
  saveLoginLogo: async () => {},
  clearLoginLogo: async () => {},
  saveAccentColor: async () => {},
});

function isValidAccentColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function readStoredSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { loginLogo: null, accentColor: DEFAULT_ACCENT_COLOR };
    const parsed = JSON.parse(stored);
    const logo = parsed?.loginLogo;
    return {
      loginLogo:
      logo?.dataUrl &&
      logo?.fileName &&
      (logo?.mimeType === 'image/png' || logo?.mimeType === 'image/svg+xml')
        ? logo
        : null,
      accentColor: isValidAccentColor(parsed?.accentColor) ? parsed.accentColor : DEFAULT_ACCENT_COLOR,
    };
  } catch {
    return { loginLogo: null, accentColor: DEFAULT_ACCENT_COLOR };
  }
}

function writeAccentVariables(color: string) {
  document.documentElement.style.setProperty('--accent-color', color);
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [loginLogo, setLoginLogo] = useState<LoginLogo | null>(() => readStoredSettings().loginLogo);
  const [accentColor, setAccentColor] = useState(() => readStoredSettings().accentColor);

  const persistSettings = (next: { loginLogo: LoginLogo | null; accentColor: string }) => {
    setLoginLogo(next.loginLogo);
    setAccentColor(next.accentColor);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    writeAccentVariables(next.accentColor);
  };

  const persistLogo = (logo: LoginLogo | null) => {
    const stored = readStoredSettings();
    setLoginLogo(logo);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ loginLogo: logo, accentColor: stored.accentColor }));
  };

  const persistAccentColor = (color: string) => {
    const stored = readStoredSettings();
    setAccentColor(color);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ loginLogo: stored.loginLogo, accentColor: color }));
    writeAccentVariables(color);
  };

  useEffect(() => {
    writeAccentVariables(accentColor);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<{ loginLogo: LoginLogo | null; accentColor: string }>('/settings/public')
      .then(({ data }) => {
        if (!cancelled) persistSettings({
          loginLogo: data.loginLogo,
          accentColor: isValidAccentColor(data.accentColor) ? data.accentColor : DEFAULT_ACCENT_COLOR,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const saveLoginLogo = async (logo: LoginLogo) => {
    await api.put('/settings/login-logo', { loginLogo: logo });
    persistLogo(logo);
  };

  const clearLoginLogo = async () => {
    await api.put('/settings/login-logo', { loginLogo: null });
    persistLogo(null);
  };

  const saveAccentColor = async (color: string) => {
    await api.put('/settings/accent-color', { accentColor: color });
    persistAccentColor(color);
  };

  return (
    <AppSettingsContext.Provider
      value={{
        loginLogo,
        accentColor,
        saveLoginLogo,
        clearLoginLogo,
        saveAccentColor,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export const useAppSettings = () => useContext(AppSettingsContext);
