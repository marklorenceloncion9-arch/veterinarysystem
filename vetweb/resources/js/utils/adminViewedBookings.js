const STORAGE_KEY = 'admin_viewed_bookings_v1';

const HIDDEN_STATUSES = new Set(['completed', 'cancelled', 'rejected']);

// Diri basahon ang listahan sa nakita nga bookings sa localStorage.
function readState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ids: [] };
        }

        const parsed = JSON.parse(raw);
        return {
            ids: Array.isArray(parsed?.ids) ? parsed.ids.map(String) : [],
        };
    } catch {
        return { ids: [] };
    }
}

// Diri i-save ang listahan sa nakita nga bookings sa localStorage.
function writeState(state) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                ids: [...new Set((state.ids || []).map(String))],
            })
        );
    } catch {
        // Ignore quota / private-mode errors.
    }
}

// Diri susihon kung wala pa makita ang booking.
export function isBookingUnviewed(id) {
    if (id == null) return false;
    return !readState().ids.includes(String(id));
}

// Diri susihon kung ipakita ang "New" badge sa booking.
export function shouldShowNewBookingBadge(booking) {
    if (!booking?.id) return false;
    if (HIDDEN_STATUSES.has(booking.status)) return false;
    return isBookingUnviewed(booking.id);
}

// Diri markahan nga nakita na ang booking.
export function markBookingViewed(id) {
    if (id == null) return false;
    const state = readState();
    const key = String(id);
    if (state.ids.includes(key)) {
        return false;
    }

    writeState({ ids: [...state.ids, key] });
    return true;
}
