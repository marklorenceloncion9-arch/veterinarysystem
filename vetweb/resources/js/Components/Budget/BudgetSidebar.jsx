import { Link, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import ResponsiveSidebarFrame from '@/Components/Ui/ResponsiveSidebarFrame';
import { postAdminLogout } from '@/utils/adminLogout';
import { useSidebarNavScroll } from '@/utils/sidebarMemory';
import {
    BUDGET_INVENTORY_ALERTS_CHANGED,
    fetchBudgetInventoryAlerts,
    pruneSidebarSeenKeys,
    unseenAlerts,
} from '@/utils/budgetInventoryAlerts';

// Diri susihon kung parehas ang path sa URL ug link.
function samePath(currentUrl, href) {
    return (currentUrl || '').split('?')[0] === String(href || '').split('?')[0];
}

// Diri ang gamay nga titulo sa section sa sidebar.
function SectionLabel({ children }) {
    return (
        <p className="px-3 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {children}
        </p>
    );
}

// Diri ang icon box sa nav link.
function NavIcon({ children, active }) {
    return (
        <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                active
                    ? 'bg-white/15 text-white'
                    : 'bg-white/10 text-white/65 group-hover:bg-white/15 group-hover:text-white'
            }`}
        >
            {children}
        </span>
    );
}

// Diri ang usa ka nav link nga naay badge count.
function NavItem({ href, active, icon, children, badgeCount = 0 }) {
    const { url } = usePage();

    return (
        <Link
            href={href}
            preserveState
            preserveScroll={samePath(url, href)}
            data-nav-active={active ? 'true' : undefined}
            className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                    ? 'bg-teal text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
        >
            <NavIcon active={active}>
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                </svg>
            </NavIcon>
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {badgeCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {badgeCount > 99 ? '99+' : badgeCount}
                </span>
            ) : null}
        </Link>
    );
}

// Diri ang sidebar sa budget officer.
export default function BudgetSidebar() {
    const { url } = usePage();
    const navRef = useSidebarNavScroll('budget', url);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [damageUnread, setDamageUnread] = useState(0);
    const [inventoryUnread, setInventoryUnread] = useState(0);

    // Diri susihon kung active ang nav path.
    const isActive = (path) => {
        if (path === '/budget/dashboard') {
            return url === path || url === `${path}/`;
        }
        return url.startsWith(path);
    };

    // Diri i-logout ang budget officer.
    const handleLogout = () => {
        if (loggingOut) return;
        setLoggingOut(true);
        postAdminLogout();
    };

    useEffect(() => {
        let cancelled = false;

        // Diri kuhaon ang unread count sa damage reports.
        const loadUnread = async () => {
            try {
                const response = await fetch('/api/budget/damage-reports/unread-count', {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled && data.success) {
                    setDamageUnread(Number(data.unread_count || 0));
                }
            } catch {
                // ignore badge fetch failures
            }
        };

        // Diri kuhaon ang unseen inventory alerts para sa badge.
        const loadInventoryUnread = async () => {
            const alerts = await fetchBudgetInventoryAlerts();
            pruneSidebarSeenKeys(alerts);
            if (!cancelled) setInventoryUnread(unseenAlerts(alerts).length);
        };

        loadUnread();
        loadInventoryUnread();
        // Diri i-reload ang inventory badge kung nausab ang alerts.
        const onAlertsChanged = () => loadInventoryUnread();
        window.addEventListener(BUDGET_INVENTORY_ALERTS_CHANGED, onAlertsChanged);
        const timer = window.setInterval(() => {
            loadUnread();
            loadInventoryUnread();
        }, 60000);
        return () => {
            cancelled = true;
            window.removeEventListener(BUDGET_INVENTORY_ALERTS_CHANGED, onAlertsChanged);
            window.clearInterval(timer);
        };
    }, [url]);

    return (
        <>
            <ResponsiveSidebarFrame brandTitle="ES CityVet" brandSubtitle="Budget Officer">
                <nav
                    ref={navRef}
                    className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    <SectionLabel>Overview</SectionLabel>

                    <NavItem
                        href="/budget/dashboard"
                        active={isActive('/budget/dashboard')}
                        icon="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    >
                        Dashboard
                    </NavItem>

                    <SectionLabel>Inventory & Records</SectionLabel>

                    <NavItem
                        href="/budget/inventory"
                        active={isActive('/budget/inventory') && !isActive('/budget/inventory/history') && !isActive('/budget/damage-reports')}
                        badgeCount={inventoryUnread}
                        icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    >
                        Inventory
                    </NavItem>

                    <NavItem
                        href="/budget/inventory/history"
                        active={isActive('/budget/inventory/history')}
                        icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6"
                    >
                        Stock history
                    </NavItem>

                    <NavItem
                        href="/budget/damage-reports"
                        active={isActive('/budget/damage-reports')}
                        badgeCount={damageUnread}
                        icon="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    >
                        Damage history
                    </NavItem>

                    <NavItem
                        href="/budget/booked-services"
                        active={isActive('/budget/booked-services') || isActive('/budget/service-history')}
                        icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    >
                        Booked Services
                    </NavItem>

                    <SectionLabel>Reports</SectionLabel>

                    <NavItem
                        href="/budget/reports"
                        active={isActive('/budget/reports')}
                        icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    >
                        Inventory Reports
                    </NavItem>

                    <SectionLabel>Account</SectionLabel>

                    <NavItem
                        href="/budget/profile"
                        active={isActive('/budget/profile')}
                        icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    >
                        Profile
                    </NavItem>
                </nav>

                <div className="shrink-0 border-t border-white/10 p-4">
                    <button
                        type="button"
                        onClick={() => setShowLogoutConfirm(true)}
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors duration-150 hover:bg-danger/15 hover:text-white"
                    >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors group-hover:bg-danger/20 group-hover:text-white">
                            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                            </svg>
                        </span>
                        Logout
                    </button>
                </div>
            </ResponsiveSidebarFrame>

            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/50 p-4">
                    <div className="w-full max-w-sm overflow-hidden rounded-xl border border-line bg-white shadow-lg">
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                    />
                                </svg>
                            </div>
                            <h2 className="text-lg font-bold text-navy">Logout</h2>
                            <p className="mt-2 text-sm text-muted">Are you sure you want to logout?</p>
                        </div>
                        <div className="flex gap-3 border-t border-line bg-canvas px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setShowLogoutConfirm(false)}
                                disabled={loggingOut}
                                className="flex-1 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                disabled={loggingOut}
                                className="flex-1 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {loggingOut ? 'Logging out…' : 'Logout'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
