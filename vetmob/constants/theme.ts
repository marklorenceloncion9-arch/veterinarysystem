import { Platform } from 'react-native';

/** Matches vetweb `THEME` / `app.css` brand tokens. */
export const Brand = {
  navy: '#16324F',
  navyDark: '#10263C',
  teal: '#1F7A8C',
  tealDark: '#186272',
  accent: '#3C91E6',
  canvas: '#F5F7FA',
  surface: '#FFFFFF',
  ink: '#1F2937',
  muted: '#6B7280',
  success: '#2E8B57',
  warning: '#D99A00',
  danger: '#D64545',
  line: '#E5E7EB',
};

export const Colors = {
  light: {
    text: Brand.ink,
    background: Brand.canvas,
    tint: Brand.teal,
    icon: Brand.muted,
    tabIconDefault: Brand.muted,
    tabIconSelected: Brand.teal,
  },
  dark: {
    text: '#F8FAFC',
    background: Brand.navyDark,
    tint: Brand.teal,
    icon: '#9CA3AF',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: Brand.teal,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
