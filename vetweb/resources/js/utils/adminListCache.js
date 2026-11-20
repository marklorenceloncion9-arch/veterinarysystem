const DEFAULT_TTL_MS = 3 * 60 * 1000;

// Diri basahon ang cache entry sa admin list kung wala pa ni-expire.
export function readAdminListCacheEntry(key, ttlMs = DEFAULT_TTL_MS) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.at !== 'number') {
            sessionStorage.removeItem(key);
            return null;
        }

        if (Date.now() - parsed.at > ttlMs) {
            sessionStorage.removeItem(key);
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

// Diri kuhaon lang ang data gikan sa admin list cache.
export function readAdminListCache(key, ttlMs = DEFAULT_TTL_MS) {
    return readAdminListCacheEntry(key, ttlMs)?.data ?? null;
}

// Diri i-save ang admin list data sa session cache.
export function writeAdminListCache(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ data, at: Date.now() }));
    } catch {
        // Ignore storage quota errors.
    }
}

// Diri papason ang admin list cache sa usa ka key.
export function clearAdminListCache(key) {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Ignore.
    }
}
