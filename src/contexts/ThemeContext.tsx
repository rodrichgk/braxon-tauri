import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {} });

// Bench Report finding: this persisted under the app's old name ("PIC
// ABS Tester") — a naming fossil a future grep could easily trip over.
// Renamed rather than left as-is, but not a blind rename: an existing
// install's saved preference is read from the old key as a one-time
// fallback (and migrated onto the new key immediately) so nobody's
// theme choice silently resets back to the default just because the key
// changed underneath them.
const THEME_STORAGE_KEY = 'braxon-theme';
const LEGACY_THEME_STORAGE_KEY = 'pic-abs-theme';

function readStoredTheme(): Theme {
  try {
    const current = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (current) return current;
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme | null;
    if (legacy) {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return legacy;
    }
  } catch { /* ignore */ }
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
