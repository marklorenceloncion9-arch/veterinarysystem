import { router } from '@inertiajs/react';
import { getCsrfToken } from '../bootstrap';

const LOGIN_URL = '/admin/login';

// Diri ibalik sa admin login page.
export function goToAdminLogin() {
    window.location.assign(LOGIN_URL);
}

// Diri i-logout ang admin gamit ang CSRF token.
export function postAdminLogout() {
    const token = getCsrfToken();

    router.post('/admin/logout', token ? { _token: token } : {}, {
        headers: token ? { 'X-CSRF-TOKEN': token } : {},
        preserveScroll: true,
        onFinish: goToAdminLogin,
        onError: goToAdminLogin,
    });
}
