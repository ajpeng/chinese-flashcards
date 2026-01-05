import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export default function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem(STORAGE_KEY) as Theme | null;
      return t ?? 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // ensure initial application on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  return [theme, setTheme];
}
