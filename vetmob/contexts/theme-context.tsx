import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colorScheme as nativeWindScheme } from 'nativewind';

export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'app_color_scheme';

type ThemeContextType = {
  theme: AppTheme;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Diri i-apply ang light theme.
function applyLightTheme() {
  Appearance.setColorScheme('light');
  nativeWindScheme.set('light');
}

// Diri i-save nga light theme ang gipili.
async function storeLightTheme() {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, 'light');
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, 'light');
  } catch {
    // The app still stays on the light theme if storage is unavailable.
  }
}

// Diri ang provider sa theme preference.
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyLightTheme();
    storeLightTheme();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light' }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Diri gamiton ang theme context.
export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within ThemePreferenceProvider');
  }
  return context;
}
