export const BUDGET_INVENTORY_ALERTS_CHANGED = 'budget-inventory-alerts-changed';

const SIDEBAR_SEEN_KEY = 'budget-inventory-sidebar-seen';

// Diri kuhaon ang unique key sa inventory alert.
function alertKey(alert) {
    return alert?.data?.alert_key || alert?.id || '';
}

// Diri basahon ang mga alert key nga nakita na sa sidebar.
export function getSidebarSeenAlertKeys() {
    try {
        const raw = JSON.parse(localStorage.getItem(SIDEBAR_SEEN_KEY) || '[]');
        return new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
    } catch {
        return new Set();
    }
}

// Diri salaon ang mga alert nga wala pa makita.
export function unseenAlerts(alerts = []) {
    const seen = getSidebarSeenAlertKeys();
    return alerts.filter((alert) => {
        const key = alertKey(alert);
        return key && !seen.has(key);
    });
}

// Diri markahan nga nakita na ang mga alert sa sidebar.
export function markSidebarAlertsSeen(alerts = []) {
    const seen = getSidebarSeenAlertKeys();
    let changed = false;

    alerts.forEach((alert) => {
        const key = alertKey(alert);
        if (key && !seen.has(key)) {
            seen.add(key);
            changed = true;
        }
    });

    if (!changed) return false;

    localStorage.setItem(SIDEBAR_SEEN_KEY, JSON.stringify([...seen]));
    notifyBudgetInventoryAlertsChanged();
    return true;
}

// Diri tangtangon ang seen keys sa mga alert nga wala na.
export function pruneSidebarSeenKeys(alerts = []) {
    const active = new Set(alerts.map(alertKey).filter(Boolean));
    const seen = getSidebarSeenAlertKeys();
    const next = [...seen].filter((key) => active.has(key));

    if (next.length === seen.size) return;

    localStorage.setItem(SIDEBAR_SEEN_KEY, JSON.stringify(next));
}

const FILTER_ALERT_TYPES = {
    expiring: 'inventory_expiring_soon',
    expired: 'inventory_expired',
    low_stock: 'inventory_low_stock',
    out_of_stock: 'inventory_out_of_stock',
};

// Diri i-convert ang filter ngadto sa alert type.
export function alertTypeForFilter(filter) {
    return FILTER_ALERT_TYPES[filter] || '';
}

// Diri ihapon ang mga alert matag filter type.
export function countAlertsByFilter(alerts = []) {
    const counts = {
        expiring: 0,
        expired: 0,
        low_stock: 0,
        out_of_stock: 0,
        total: 0,
    };

    alerts.forEach((alert) => {
        const match = Object.entries(FILTER_ALERT_TYPES).find(([, type]) => type === alert.type);
        if (!match) return;
        counts[match[0]] += 1;
        counts.total += 1;
    });

    return counts;
}

// Diri kuhaon ang CSRF token gikan sa meta tag.
function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

// Diri ipahibalo nga nausab ang inventory alerts.
export function notifyBudgetInventoryAlertsChanged() {
    window.dispatchEvent(new CustomEvent(BUDGET_INVENTORY_ALERTS_CHANGED));
}

// Diri kuhaon ang inventory alerts gikan sa API.
export async function fetchBudgetInventoryAlerts() {
    const response = await fetch('/api/budget/inventory/alerts', {
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.success ? data.active_alerts || [] : [];
}

// Diri i-dismiss ang inventory alerts sa server.
export async function dismissBudgetInventoryAlerts(payload) {
    const response = await fetch('/api/budget/inventory/alerts/read', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
        return null;
    }

    notifyBudgetInventoryAlertsChanged();
    return data.active_alerts || [];
}
