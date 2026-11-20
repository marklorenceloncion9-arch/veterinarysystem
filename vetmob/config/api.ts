import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Allow manual override from .env when needed.
const ENV_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

// Fallbacks when Expo host info is unavailable.
const DEFAULT_MOBILE_IP = '10.112.135.230';
const DEFAULT_WEB_HOST = 'localhost';

// Laravel app path (Laragon/XAMPP virtual host path).
const PROJECT_PATH = '/Project/vetweb/public';
const PORT = '';

// Diri kuhaon ang IP sa Expo host.
function extractExpoHostIp(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  // hostUri format is usually "192.168.1.10:8081".
  const [host] = hostUri.split(':');
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

// Diri buhaton ang base URL sa API.
function buildBaseUrl() {
  if (ENV_API_BASE_URL) {
    return ENV_API_BASE_URL.replace(/\/$/, '');
  }

  const mobileHost = extractExpoHostIp() || DEFAULT_MOBILE_IP;
  const baseHost = Platform.OS === 'web' ? DEFAULT_WEB_HOST : mobileHost;
  return `http://${baseHost}${PORT ? `:${PORT}` : ''}${PROJECT_PATH}`;
}

export const API_BASE_URL = buildBaseUrl();

// Android keeps GET responses in an OkHttp cache. A Hostinger 404 for these
// routes was stored there and kept showing after the live API started working.
axios.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') return config;

  config.headers = config.headers ?? {};
  if (typeof (config.headers as { set?: (key: string, value: string) => void }).set === 'function') {
    (config.headers as { set: (key: string, value: string) => void }).set('Cache-Control', 'no-cache');
    (config.headers as { set: (key: string, value: string) => void }).set('Pragma', 'no-cache');
  } else {
    (config.headers as Record<string, string>)['Cache-Control'] = 'no-cache';
    (config.headers as Record<string, string>)['Pragma'] = 'no-cache';
  }

  const url = config.url || '';
  if (url.includes('/api/mobile/barangays') || url.includes('/api/mobile/zones')) {
    config.params = { ...(config.params || {}), _: Date.now() };
  }

  return config;
});

// Example: http://192.168.0.102/api/mobile/register
export const API_URLS = {
  barangays: `${API_BASE_URL}/api/mobile/barangays`,
  login: `${API_BASE_URL}/api/mobile/login`,
  register: `${API_BASE_URL}/api/mobile/register`,
  logout: `${API_BASE_URL}/api/mobile/logout`,
  user: `${API_BASE_URL}/api/mobile/user`,
};
