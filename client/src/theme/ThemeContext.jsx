import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { defaultThemeName, themeList, themes } from './themes';

const STORAGE_KEY = 'hei-theme';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [themeName, setThemeNameState] = useState(() => {
        if (typeof window === 'undefined') return defaultThemeName;
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved && themes[saved]) return saved;
        } catch {}
        return defaultThemeName;
    });

    const theme = themes[themeName] || themes[defaultThemeName];

    const setThemeName = useCallback((name) => {
        if (!themes[name]) return;
        setThemeNameState(name);
        try { window.localStorage.setItem(STORAGE_KEY, name); } catch {}
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        root.style.setProperty('--app-bg', theme.appBackground);
        root.style.setProperty('--app-text', theme.textPrimary);
        root.dataset.theme = theme.name;
    }, [theme]);

    const value = useMemo(
        () => ({ theme, themeName, setThemeName, themes: themeList }),
        [theme, themeName, setThemeName]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
