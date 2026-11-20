import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

let echoInstance = null;

// Diri kuhaon ang CSRF token para sa broadcasting auth.
function getCsrfToken() {
    return document.head.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

/**
 * Create (or return cached) Echo instance for the admin web panel.
 * Uses session cookies + CSRF for private channel authorization.
 */
// Diri himuon o kuhaon ang Echo connection sa Pusher.
export function getEcho() {
    if (echoInstance) {
        return echoInstance;
    }

    const key = import.meta.env.VITE_PUSHER_APP_KEY;
    if (!key) {
        console.warn('VITE_PUSHER_APP_KEY is not set — live updates disabled.');
        return null;
    }

    const cluster = import.meta.env.VITE_PUSHER_APP_CLUSTER ?? 'ap1';

    echoInstance = new Echo({
        broadcaster: 'pusher',
        key,
        cluster,
        forceTLS: true,
        authEndpoint: '/broadcasting/auth',
        auth: {
            headers: {
                'X-CSRF-TOKEN': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
            },
        },
    });

    return echoInstance;
}

// Diri putlon ang Echo connection.
export function disconnectEcho() {
    if (echoInstance) {
        echoInstance.disconnect();
        echoInstance = null;
    }
}

/**
 * Subscribe to live admin appointment changes.
 * Returns an unsubscribe function.
 */
// Diri magsugod ang live update sa appointments.
export function subscribeToAppointments(onChange) {
    const echo = getEcho();
    if (!echo) {
        return () => {};
    }

    const channel = echo.private('admin.appointments');

    channel.listen('.appointment.changed', (event) => {
        onChange(event);
    });

    return () => {
        channel.stopListening('.appointment.changed');
        echo.leave('admin.appointments');
    };
}
