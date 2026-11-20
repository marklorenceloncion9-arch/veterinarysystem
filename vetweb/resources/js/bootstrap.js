import axios from 'axios';
import { router } from '@inertiajs/react';

window.axios = axios;
axios.defaults.withCredentials = true;
axios.defaults.xsrfCookieName = 'XSRF-TOKEN';
axios.defaults.xsrfHeaderName = 'X-XSRF-TOKEN';

// Diri kuhaon o himuon ang CSRF meta tag.
function csrfMeta() {
    let tag = document.head.querySelector('meta[name="csrf-token"]');

    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('name', 'csrf-token');
        document.head.appendChild(tag);
    }

    return tag;
}

// Diri kuhaon ang current CSRF token.
export function getCsrfToken() {
    return csrfMeta().getAttribute('content') || '';
}

// The root template renders the token once, but Inertia never reloads the
// document. Laravel rotates the session token on login and logout, so the tag
// has to be refreshed from the shared prop or every later request sends a token
// that no longer matches the session.
// Diri i-update ang CSRF token sa meta tag.
function setCsrfToken(token) {
    if (token && token !== getCsrfToken()) {
        csrfMeta().setAttribute('content', token);
    }
}

router.on('success', (event) => {
    setCsrfToken(event.detail.page?.props?.csrf_token);
});

// Diri susihon kung same origin ang URL.
function isSameOrigin(url) {
    try {
        return new URL(url ?? '', window.location.origin).origin === window.location.origin;
    } catch {
        return false;
    }
}

// Scoped to our own origin so the token is never leaked to third parties and
// cross-origin uploads keep their simple CORS requests.
axios.interceptors.request.use((config) => {
    if (!isSameOrigin(config.url)) {
        return config;
    }

    const token = getCsrfToken();

    if (typeof config.headers?.set === 'function') {
        config.headers.set('X-Requested-With', 'XMLHttpRequest');

        if (token) {
            config.headers.set('X-CSRF-TOKEN', token);
        }
    } else {
        config.headers = {
            ...config.headers,
            'X-Requested-With': 'XMLHttpRequest',
            ...(token ? { 'X-CSRF-TOKEN': token } : {}),
        };
    }

    return config;
});

axios.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const onAdminPage = window.location.pathname.startsWith('/admin')
            || window.location.pathname.startsWith('/budget');

        if (status === 419 && onAdminPage) {
            window.location.assign('/admin/login');
        }

        return Promise.reject(error);
    }
);
