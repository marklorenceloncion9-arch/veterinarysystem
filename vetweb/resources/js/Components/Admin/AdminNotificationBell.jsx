import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import axios from 'axios';
import { goToAdminLogin } from '@/utils/adminLogout';

// Diri kuhaon ang CSRF token gikan sa meta tag.
function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

// Diri himuon nga Title Case ang text.
function titleCase(value) {
    if (!value) return '';
    return String(value)
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Diri pilion ang CSS classes sumala sa tone nga kolor.
function getToneClasses(tone) {
    switch (tone) {
        case 'red':
            return {
                chip: 'bg-rose-50 text-rose-700 ring-rose-200',
                dot: 'bg-rose-500',
                bar: 'bg-rose-500',
            };
        case 'amber':
            return {
                chip: 'bg-amber-50 text-amber-800 ring-amber-200',
                dot: 'bg-amber-500',
                bar: 'bg-amber-500',
            };
        case 'emerald':
            return {
                chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
                dot: 'bg-emerald-500',
                bar: 'bg-emerald-500',
            };
        case 'violet':
        default:
            return {
                chip: 'bg-violet-50 text-violet-800 ring-violet-200',
                dot: 'bg-violet-500',
                bar: 'bg-violet-500',
            };
    }
}

// Diri ilhon ang klase sa notification, label ug tone.
function getKind(item = {}) {
    const type = item.type || '';

    if (type.includes('client')) {
        return { label: 'Registration', tone: 'red' };
    }
    if (type.includes('birthday')) {
        return { label: 'Birthday', tone: 'emerald' };
    }
    if (type.includes('home_service')) {
        return { label: type.includes('today') ? 'Home service today' : 'Home service', tone: 'amber' };
    }
    if (type.includes('appointment_today')) {
        return { label: 'Today', tone: 'violet' };
    }
    if (type.includes('appointment')) {
        return { label: 'Appointment', tone: 'amber' };
    }

    return { label: item.title || 'Notice', tone: item.tone || 'violet' };
}

// Diri himuon ang mga parte sa summary gikan sa counts.
function buildSummaryParts(counts = {}) {
    const parts = [];

    if (counts.pending_clients > 0) {
        parts.push(`${counts.pending_clients} registration${counts.pending_clients === 1 ? '' : 's'}`);
    }
    if (counts.pending_appointments > 0) {
        parts.push(`${counts.pending_appointments} appointment${counts.pending_appointments === 1 ? '' : 's'}`);
    }
    if (counts.pending_home_services > 0) {
        parts.push(`${counts.pending_home_services} home service${counts.pending_home_services === 1 ? '' : 's'}`);
    }
    if (counts.today_clinic_appointments > 0 || counts.today_appointments > 0) {
        const clinicToday = counts.today_clinic_appointments ?? counts.today_appointments;
        parts.push(`${clinicToday} today`);
    }
    if (counts.today_home_services > 0) {
        parts.push(`${counts.today_home_services} on the city map`);
    }
    if (counts.pet_birthdays_today > 0) {
        parts.push(`${counts.pet_birthdays_today} birthday${counts.pet_birthdays_today === 1 ? '' : 's'}`);
    }

    return parts;
}

// Diri idugtong ang summary text o "All caught up".
function buildSummaryText(counts = {}) {
    const parts = buildSummaryParts(counts);
    return parts.length > 0 ? parts.join(' · ') : 'All caught up';
}

// Diri ang usa ka detail row sa notification card.
function DetailRow({ label, value }) {
    if (!value) return null;

    return (
        <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-start gap-2 text-[13px] leading-5">
            <span className="pt-px text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
            <span className="break-words text-slate-700">{value}</span>
        </div>
    );
}

// Diri ang card sa usa ka admin notification.
function NotificationCard({ item, onOpen, onMarkRead, markingRead }) {
    const kind = getKind(item);
    const tone = getToneClasses(kind.tone || item.tone);
    const clientName = titleCase(item.client_name || item.data?.client_name);
    const petName = titleCase(item.pet_name);
    const headline = clientName || titleCase(item.title) || 'Notification';
    const actionLabel = item.action_label || 'View';
    const isRead = Boolean(item.is_read);

    return (
        <article className={`relative border-b border-slate-100 last:border-b-0 ${isRead ? 'bg-white' : 'bg-slate-50/70'}`}>
            <span className={`absolute bottom-3 left-1.5 top-3 w-1.5 rounded-full ${tone.bar}`} />
            <div className="flex items-start gap-3 py-3.5 pl-4 pr-3">
                <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between gap-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${tone.chip}`}>
                            {kind.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">{item.created_at_human}</span>
                    </div>

                    <p className="mt-1.5 text-[15px] font-semibold leading-snug text-slate-900">{headline}</p>

                    {(petName || item.service || item.schedule) ? (
                        <div className="mt-2 space-y-1">
                            <DetailRow label="Pet" value={petName} />
                            <DetailRow label="Service" value={item.service} />
                            <DetailRow label="When" value={item.schedule} />
                        </div>
                    ) : item.message ? (
                        <p className="mt-2 text-[13px] leading-5 text-slate-600">{item.message}</p>
                    ) : null}

                    <span className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-violet-700">
                        {actionLabel}
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </span>
                </button>

                {onMarkRead && !isRead && (
                    <button
                        type="button"
                        onClick={onMarkRead}
                        disabled={markingRead}
                        className="mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-violet-700 disabled:opacity-50"
                        title="Done, hide this"
                        aria-label="Done, hide this"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </button>
                )}
            </div>
        </article>
    );
}

// Diri ang notification bell sa admin panel.
export default function AdminNotificationBell({ onPendingCountChange }) {
    const [open, setOpen] = useState(false);
    const [alerts, setAlerts] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [counts, setCounts] = useState({});
    const [totalCount, setTotalCount] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [markingRead, setMarkingRead] = useState(false);
    const [error, setError] = useState('');
    const [sessionEnded, setSessionEnded] = useState(false);
    const [floatingWord, setFloatingWord] = useState('');
    const panelRef = useRef(null);
    const previousTotalRef = useRef(null);
    const hasLoadedRef = useRef(false);

    // Diri i-apply ang notification data gikan sa server sa state.
    const applyPayload = useCallback((data) => {
        const nextCounts = data.counts || {};
        const nextAlerts = data.alerts || [];
        const nextNotifications = data.notifications || [];
        const nextTotal = data.total_count ?? 0;
        const nextUnread = data.unread_count ?? nextNotifications.filter((item) => !item.is_read).length;

        if (hasLoadedRef.current && nextTotal > (previousTotalRef.current ?? 0)) {
            const summary = buildSummaryText(nextCounts);
            setFloatingWord(summary !== 'All caught up' ? summary : 'New notification');
        }

        previousTotalRef.current = nextTotal;
        hasLoadedRef.current = true;

        setCounts(nextCounts);
        setAlerts(nextAlerts);
        setNotifications(nextNotifications);
        setTotalCount(nextTotal);
        setUnreadCount(nextUnread);
        onPendingCountChange?.(nextCounts.pending_clients ?? data.pending_count ?? 0);
    }, [onPendingCountChange]);

    useEffect(() => {
        if (!floatingWord) return undefined;

        const timer = setTimeout(() => setFloatingWord(''), 5000);
        return () => clearTimeout(timer);
    }, [floatingWord]);

    // Diri kuhaon ang admin notifications gikan sa API.
    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const response = await axios.get('/api/admin/notifications', {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
            });

            const data = response.data;

            if (!data.success) {
                setError(data.message || 'Could not load notifications');
                return;
            }

            applyPayload(data);
        } catch (fetchError) {
            if (fetchError?.response?.status === 401) {
                setSessionEnded(true);
                goToAdminLogin();
                return;
            }

            console.warn('Failed to fetch admin notifications:', fetchError);
            setError(fetchError?.response?.data?.message || 'Could not load notifications');
        } finally {
            setLoading(false);
        }
    }, [applyPayload]);

    // Diri markahan nga nabasa na ang usa ka notification.
    const markNotificationRead = async (id) => {
        if (!id || markingRead) return;

        setMarkingRead(true);
        setError('');

        try {
            const response = await axios.post(
                `/api/admin/notifications/${id}/read`,
                {},
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': getCsrfToken(),
                    },
                }
            );

            const data = response.data;

            if (!data.success) {
                setError(data.message || 'Could not mark notification as done');
                return;
            }

            applyPayload(data);
        } catch (markError) {
            console.warn('Failed to mark notification as done:', markError);
            setError(markError?.response?.data?.message || 'Could not mark notification as done');
        } finally {
            setMarkingRead(false);
        }
    };

    // Diri i-dismiss ang usa ka system alert.
    const dismissAlert = async (alertKey) => {
        if (!alertKey || markingRead) return;

        setMarkingRead(true);
        setError('');

        try {
            const response = await axios.post(
                '/api/admin/notifications/dismiss',
                { alert_key: alertKey },
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': getCsrfToken(),
                    },
                }
            );

            const data = response.data;

            if (!data.success) {
                setError(data.message || 'Could not hide notification');
                return;
            }

            applyPayload(data);
        } catch (markError) {
            console.warn('Failed to hide notification:', markError);
            setError(markError?.response?.data?.message || 'Could not hide notification');
        } finally {
            setMarkingRead(false);
        }
    };

    // Diri pilion kung notification o alert ang markahan nga done.
    const markItemDone = (item) => {
        if (!item) return;
        if (typeof item.id === 'number' || /^\d+$/.test(String(item.id))) {
            markNotificationRead(item.id);
            return;
        }
        dismissAlert(item.id);
    };

    // Diri markahan nga nabasa na ang tanang notifications.
    const markAllRead = async () => {
        if (markingRead || unreadCount === 0) return;

        setMarkingRead(true);
        setError('');

        try {
            const response = await axios.post(
                '/api/admin/notifications/read-all',
                {},
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': getCsrfToken(),
                    },
                }
            );

            const data = response.data;

            if (!data.success) {
                setError(data.message || 'Could not mark notifications as read');
                return;
            }

            applyPayload(data);
        } catch (markError) {
            console.warn('Failed to mark all notifications as read:', markError);
            setError(markError?.response?.data?.message || 'Could not mark notifications as read');
        } finally {
            setMarkingRead(false);
        }
    };

    // Polling a signed-out session only repeats the same 401, so stop asking.
    useEffect(() => {
        if (sessionEnded) return undefined;

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
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

    const summaryAlerts = alerts.filter((alert) => alert.is_summary);
    const detailAlerts = alerts.filter((alert) => !alert.is_summary);
    const hasContent = totalCount > 0 || alerts.length > 0 || notifications.length > 0;

    // Diri isira ang panel ug adto sa link sa notification.
    const navigateTo = (href) => {
        if (!href) return;
        setOpen(false);
        router.visit(href);
    };

    const summaryText = buildSummaryText(counts);
    const summaryParts = buildSummaryParts(counts);
    const floatingLabel = totalCount > 0 && !open
        ? (summaryText !== 'All caught up' ? summaryText : `${totalCount} new`)
        : '';

    return (
        <>
            <style>{`
                @keyframes notification-float-in-side {
                    from { opacity: 0; transform: translateX(8px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes notification-float-side {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-4px); }
                }
                .notification-float-in-side { animation: notification-float-in-side 0.35s ease-out; }
                .notification-float-side { animation: notification-float-side 2.4s ease-in-out infinite; }
            `}</style>

            <div className="relative shrink-0" ref={panelRef}>
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
                className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-600 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
                aria-label="All notifications"
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
                {totalCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
                        {totalCount > 99 ? '99+' : totalCount}
                    </span>
                )}
            </button>

            {!open && (floatingWord || floatingLabel) && (
                <div
                    className={`pointer-events-none absolute right-0 top-full z-10 mt-2 w-max max-w-[16rem] notification-float-in-side ${floatingWord ? '' : 'notification-float-side'}`}
                    aria-hidden={!floatingWord}
                >
                    <div className="relative rounded-xl bg-slate-900 px-3 py-2 text-[13px] font-semibold leading-5 text-white shadow-lg ring-1 ring-white/20">
                        {floatingWord ? (
                            <span className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold">!</span>
                                <span className="min-w-0">{floatingWord}</span>
                            </span>
                        ) : summaryParts.length > 0 ? (
                            <ul className="space-y-0.5">
                                {summaryParts.map((part) => (
                                    <li key={part} className="whitespace-nowrap">{part}</li>
                                ))}
                            </ul>
                        ) : (
                            <span className="whitespace-nowrap">{floatingLabel}</span>
                        )}
                        <span className="absolute -top-1 right-3 h-2.5 w-2.5 rotate-45 bg-slate-900" />
                    </div>
                </div>
            )}

            {open && (
                <div className="absolute right-0 top-12 z-[120] w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
                        <div className="min-w-0">
                            <p className="text-[15px] font-semibold text-slate-900">All notifications</p>
                            <p className="mt-0.5 text-[12px] leading-5 text-slate-500">{buildSummaryText(counts)}</p>
                        </div>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllRead}
                                disabled={markingRead}
                                className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Mark all done
                            </button>
                        )}
                    </div>

                    <div
                        className="max-h-[22rem] overflow-y-auto [&::-webkit-scrollbar]:hidden"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {loading && !hasContent ? (
                            <div className="px-4 py-10 text-center text-sm text-slate-500">Loading notifications...</div>
                        ) : error ? (
                            <div className="px-4 py-10 text-center text-sm text-red-600">
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
                        ) : !hasContent ? (
                            <div className="px-4 py-10 text-center text-sm text-slate-500">
                                No notifications right now.
                            </div>
                        ) : (
                            <>
                                {summaryAlerts.length > 0 && (
                                    <div className="grid grid-cols-1 gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                                        {summaryAlerts.map((alert) => {
                                            const tone = getToneClasses(alert.tone);
                                            return (
                                                <button
                                                    key={alert.id}
                                                    type="button"
                                                    onClick={() => navigateTo(alert.href)}
                                                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left ring-1 transition hover:brightness-95 ${tone.chip}`}
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-[12px] font-semibold">{alert.title}</span>
                                                        <span className="mt-0.5 block text-[11px] opacity-80">{alert.message}</span>
                                                    </span>
                                                    {alert.count > 0 && (
                                                        <span className="flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-white/80 px-1.5 text-[11px] font-bold tabular-nums">
                                                            {alert.count}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {detailAlerts.length > 0 && (
                                    <div>
                                        <p className="bg-white px-4 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                            Bookings
                                        </p>
                                        {detailAlerts.map((alert) => (
                                            <NotificationCard
                                                key={alert.id}
                                                item={alert}
                                                onOpen={() => navigateTo(alert.href)}
                                                onMarkRead={() => markItemDone(alert)}
                                                markingRead={markingRead}
                                            />
                                        ))}
                                    </div>
                                )}

                                {notifications.length > 0 && (
                                    <div>
                                        <p className="bg-white px-4 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                            Registrations
                                        </p>
                                        {notifications.map((notification) => (
                                            <NotificationCard
                                                key={`db-${notification.id}`}
                                                item={notification}
                                                onOpen={() => navigateTo(notification.data?.href || '/admin/barangay-animals/pending')}
                                                onMarkRead={() => markItemDone(notification)}
                                                markingRead={markingRead}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
        </>
    );
}
