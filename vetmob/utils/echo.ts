import Echo from 'laravel-echo';
// Metro picks dist/react-native via the package "react-native" field
import PusherModule from 'pusher-js';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';

// Metro/ESM interop: default import is often a module namespace, not the class
const PusherCtor =
  (PusherModule as any)?.Pusher ??
  (PusherModule as any)?.default?.Pusher ??
  (PusherModule as any)?.default ??
  PusherModule;

if (typeof PusherCtor !== 'function') {
  throw new Error('Pusher constructor is unavailable — check pusher-js import');
}

(global as any).Pusher = PusherCtor;

const PUSHER_APP_KEY = process.env.EXPO_PUBLIC_PUSHER_APP_KEY || '';
const PUSHER_APP_CLUSTER = process.env.EXPO_PUBLIC_PUSHER_APP_CLUSTER || 'ap1';

/**
 * Create an Echo instance connected to Pusher, authorizing private channels
 * with the user's bearer token.
 */
// Diri buhaton ang Echo para sa realtime.
export function createEcho(authToken: string): Echo<any> {
  if (!PUSHER_APP_KEY) {
    throw new Error('EXPO_PUBLIC_PUSHER_APP_KEY is not set');
  }

  const EchoCtor = (Echo as any)?.default ?? Echo;

  return new EchoCtor({
    broadcaster: 'pusher',
    key: PUSHER_APP_KEY,
    cluster: PUSHER_APP_CLUSTER,
    forceTLS: true,
    Pusher: PusherCtor,
    // Use a custom authorizer so the auth request carries the same bearer
    // token used by the rest of the mobile API.
    authorizer: (channel: any) => ({
      authorize: (socketId: string, callback: (error: boolean, data: any) => void) => {
        axios
          .post(
            `${API_BASE_URL}/broadcasting/auth`,
            { socket_id: socketId, channel_name: channel.name },
            { headers: { Authorization: `Bearer ${authToken}` } }
          )
          .then((response) => callback(false, response.data))
          .catch((error) => callback(true, error));
      },
    }),
  } as any);
}
