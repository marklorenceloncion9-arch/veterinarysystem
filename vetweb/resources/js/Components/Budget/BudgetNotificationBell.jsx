import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';
import { goToAdminLogin } from '@/utils/adminLogout';
import {
    BUDGET_INVENTORY_ALERTS_CHANGED,
    notifyBudgetInventoryAlertsChanged,
} from '@/utils/budgetInventoryAlerts';

// Diri kuhaon ang CSRF token gikan sa meta tag.
function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

// Diri pilion ang kolor sa notification card sumala sa type.
function getNotificationTone(type) {
    if (type === 'inventory_out_of_stock' || type === 'inventory_expired') {
        return 'border-red-200 bg-red-50';
    }
    if (type === 'inventory_low_stock' || type === 'inventory_expiring_soon') {
        return 'border-amber-200 bg-amber-50';
    }
    return 'border-gray-200 bg-gray-50';
}

// Diri himuon ang link nga adtoan sa alert.
function getAlertHref(notification) {
    const data = notification.data || {};

    if (notification.type === 'inventory_out_of_stock' || notification.type === 'inventory_low_stock') {
        if (data.medicine_id) {
            const nameParam = data.medicine_name
                ? `&medicine_name=${encodeURIComponent(data.medicine_name)}`
                : '';
            return `/budget/inventory/add?mode=restock&medicine_id=${data.medicine_id}${nameParam}`;
        }
        return '/budget/inventory/add?mode=restock';
    }

    if (
        (notification.type === 'inventory_expired' || notification.type === 'inventory_expiring_soon') &&
        data.inventory_id
    ) {
        return `/budget/inventory/${data.inventory_id}`;
    }

    return data.inventory_url || '/budget/inventory';
}

// Diri pilion ang text sa action button sa alert.
function getAlertActionLabel(type) {
    if (type === 'inventory_out_of_stock' || type === 'inventory_low_stock') {
        return 'Restock now';
    }
    if (type === 'inventory_expired') {
        return 'View expired batch';
    }
    if (type === 'inventory_expiring_soon') {
        return 'View batch';
    }
    return 'Open';
}

// Diri i-convert ang API alerts ngadto sa notification items.
function mapAlerts(alerts = []) {
    return alerts.map((alert, index) => ({
        id: alert.data?.alert_key || `${alert.type}-${index}`,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        data: alert.data,
        created_at_human: 'Active now',
    }));
}

// Diri ang notification bell sa budget inventory alerts.
export default function BudgetNotificationBell() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [markingRead, setMarkingRead] = useState(false);
    const [error, setError] = useState('');
    const [sessionEnded, setSessionEnded] = useState(false);
    const [floatingWord, setFloatingWord] = useState('');
    const panelRef = useRef(null);
    const previousUnreadRef = useRef(null);
    const hasLoadedRef = useRef(false);

    // Diri i-apply ang alert data gikan sa server sa state.
    const applyAlertPayload = useCallback((data) => {
        const alerts = mapAlerts(data.active_alerts || []);
        const nextUnread = data.unread_count ?? alerts.length;

        if (hasLoadedRef.current && nextUnread > (previousUnreadRef.current ?? 0)) {
            const latest = alerts[0];
            setFloatingWord(latest?.title || 'New inventory alert');
        }

        previousUnreadRef.current = nextUnread;
        hasLoadedRef.current = true;

        setNotifications(alerts);
        setUnreadCount(nextUnread);
    }, []);

    useEffect(() => {
        if (!floatingWord) return undefined;

        const timer = setTimeout(() => setFloatingWord(''), 5000);
        return () => clearTimeout(timer);
    }, [floatingWord]);

    // Diri kuhaon ang inventory alerts gikan sa API.
    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/budget/inventory/alerts', {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
            });

            if (response.status === 401) {
                setSessionEnded(true);
                goToAdminLogin();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                setError(data.message || 'Could not load alerts');
                return;
            }

            applyAlertPayload(data);
        } catch (fetchError) {
            console.warn('Failed to fetch budget notifications:', fetchError);
            setError('Could not load alerts');
        } finally {
            setLoading(false);
        }
    }, [applyAlertPayload]);

    // Diri markahan nga nabasa na ang usa ka alert.
    const markAlertRead = async (alertKey) => {
        if (!alertKey || markingRead) return;

        setMarkingRead(true);
        setError('');

        try {
            const response = await fetch('/api/budget/inventory/alerts/read', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ alert_key: alertKey }),
            });

            if (response.status === 401) {
                setSessionEnded(true);
                goToAdminLogin();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                setError(data.message || 'Could not mark alert as read');
                return;
            }

            applyAlertPayload(data);
            notifyBudgetInventoryAlertsChanged();
        } catch (markError) {
            console.warn('Failed to mark alert as read:', markError);
            setError('Could not mark alert as read');
        } finally {
            setMarkingRead(false);
        }
    };

    // Diri markahan nga nabasa na ang tanang alerts.
    const markAllAlertsRead = async () => {
        if (markingRead || unreadCount === 0) return;

        setMarkingRead(true);
        setError('');

        try {
            const response = await fetch('/api/budget/inventory/alerts/read-all', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                credentials: 'same-origin',
            });

            if (response.status === 401) {
                setSessionEnded(true);
                goToAdminLogin();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                setError(data.message || 'Could not mark alerts as read');
                return;
            }

            applyAlertPayload(data);
            notifyBudgetInventoryAlertsChanged();
        } catch (markError) {
            console.warn('Failed to mark all alerts as read:', markError);
            setError('Could not mark alerts as read');
        } finally {
            setMarkingRead(false);
        }
    };

    // Polling a signed-out session only repeats the same 401, so stop asking.
    useEffect(() => {
        if (sessionEnded) return undefined;

        fetchNotifications();
        // Diri i-refresh ang notifications kung nausab ang alerts.
        const onAlertsChanged = () => fetchNotifications();
        window.addEventListener(BUDGET_INVENTORY_ALERTS_CHANGED, onAlertsChanged);
        const interval = setInterval(fetchNotifications, 60000);
        return () => {
            window.removeEventListener(BUDGET_INVENTORY_ALERTS_CHANGED, onAlertsChanged);
            clearInterval(interval);
        };
    }, [fetchNotifications, sessionEnded]);

    useEffect(() => {
        if (!open) return;

        // Diri isira ang panel kung mo-click sa gawas.
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const floatingLabel = unreadCount > 0 && !open
        ? `${unreadCount} alert${unreadCount === 1 ? '' : 's'}`
        : '';

    return (
        <>
            <style>{`
                @keyframes budget-notification-float-in-side {
                    from { opacity: 0; transform: translateX(8px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes budget-notification-float-side {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-4px); }
                }
                .budget-notification-float-in-side { animation: budget-notification-float-in-side 0.35s ease-out; }
                .budget-notification-float-side { animation: budget-notification-float-side 2.4s ease-in-out infinite; }
            `}</style>

            <div className="relative shrink-0 pointer-events-auto" ref={panelRef}>
            <button
                type="button"
                onClick={() => {
                    const nextOpen = !open;
                    setOpen(nextOpen);
                    if (nextOpen) {
                        setFloatingWord('');
                        fetchNotifications();
                    }
                }}
                className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-600 shadow-md transition hover:border-violet-300 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
                aria-label="Inventory notifications"
                aria-expanded={open}
            >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {!open && (floatingWord || floatingLabel) && (
                <div
                    className={`pointer-events-none absolute right-0 top-full z-10 mt-2 w-max max-w-[16rem] budget-notification-float-in-side ${floatingWord ? '' : 'budget-notification-float-side'}`}
                    aria-hidden={!floatingWord}
                >
                    <div className="relative rounded-xl bg-slate-900 px-3 py-2 text-[13px] font-semibold leading-5 text-white shadow-lg ring-1 ring-white/20">
                        {floatingWord ? (
                            <span className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold">!</span>
                                <span className="min-w-0">{floatingWord}</span>
                            </span>
                        ) : (
                            <span className="whitespace-nowrap">{floatingLabel}</span>
                        )}
                        <span className="absolute -top-1 right-3 h-2.5 w-2.5 rotate-45 bg-slate-900" />
                    </div>
                </div>
            )}

            {open && (
                <div className="absolute right-0 top-12 z-[120] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">Inventory Alerts</p>
                            <p className="text-xs text-gray-500">Expired, expiring soon, low stock, out of stock</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                            {unreadCount > 0 && (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                    {unreadCount} unread
                                </span>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllAlertsRead}
                                    disabled={markingRead || unreadCount === 0}
                                    className="text-[11px] font-semibold text-violet-700 transition hover:text-violet-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading && notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-500">Loading alerts...</div>
                        ) : error ? (
                            <div className="px-4 py-8 text-center text-sm text-red-600">
                                {error}
                                {sessionEnded && (
                                    <a
                                        href="/admin/login"
                                        className="mt-2 block font-semibold text-red-700 underline"
                                    >
                                        Sign in again
                                    </a>
                                )}
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-500">
                                No inventory alerts right now.
                            </div>
                        ) : (
                            notifications.map((notification) => {
                                const href = getAlertHref(notification);
                                const actionLabel = getAlertActionLabel(notification.type);
                                const alertKey = notification.data?.alert_key || notification.id;

                                return (
                                    <div
                                        key={notification.id}
                                        className="border-b border-gray-100 px-4 py-3 transition hover:bg-gray-50"
                                    >
                                        <div className="flex items-start gap-2">
                                            <Link
                                                href={href}
                                                onClick={() => setOpen(false)}
                                                className="min-w-0 flex-1"
                                            >
                                                <div
                                                    className={`rounded-xl border px-3 py-2.5 ${getNotificationTone(notification.type)}`}
                                                >
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        {notification.title}
                                                    </p>
                                                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                                                        {notification.message}
                                                    </p>
                                                    <p className="mt-2 text-[11px] font-semibold text-violet-700">
                                                        {actionLabel}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-gray-400">
                                                        {notification.created_at_human}
                                                    </p>
                                                </div>
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => markAlertRead(alertKey)}
                                                disabled={markingRead}
                                                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Mark as read"
                                            >
                                                Mark read
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
        </>
    );
}
