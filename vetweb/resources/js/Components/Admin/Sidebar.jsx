import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';
import ResponsiveSidebarFrame from '@/Components/Ui/ResponsiveSidebarFrame';
import { postAdminLogout } from '@/utils/adminLogout';
import { getSidebarMemory, useSidebarNavScroll } from '@/utils/sidebarMemory';

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

// Diri ang nav link o button sa admin sidebar.
function NavItem({ href, active, icon, iconNode, children, onClick, onNavigate, as = 'link', badge, showAlert = false }) {
    const { url } = usePage();
    const baseClass = `group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150 ${
        active
            ? 'bg-teal text-white'
            : 'text-white/75 hover:bg-white/10 hover:text-white'
    }`;

    const content = (
        <>
            <div className="relative shrink-0">
                <NavIcon active={active}>
                    {iconNode ?? (
                        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                        </svg>
                    )}
                </NavIcon>
                {showAlert && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-navy" />
                )}
            </div>
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {badge > 0 && (
                <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                    {badge}
                </span>
            )}
        </>
    );

    if (as === 'button') {
        return (
            <button type="button" onClick={onClick} className={baseClass}>
                {content}
            </button>
        );
    }

    return (
        <Link
            href={href}
            preserveState
            preserveScroll={samePath(url, href)}
            onClick={() => onNavigate?.()}
            data-nav-active={active ? 'true' : undefined}
            className={baseClass}
        >
            {content}
        </Link>
    );
}

// Diri ang sub-link sulod sa dropdown menu.
function SubNavItem({ href, active, children, onNavigate }) {
    return (
        <Link
            href={href}
            preserveScroll
            onClick={() => onNavigate?.()}
            className={`flex items-center rounded-lg py-2 pl-3 pr-3 text-sm font-medium transition-colors duration-150 ${
                active
                    ? 'bg-white/10 text-white'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`}
        >
            <span className="min-w-0 flex-1">{children}</span>
        </Link>
    );
}

// Diri ang dropdown menu sa sidebar.
function DropdownNav({ active, icon, label, open, onToggle, children, showAlert = false }) {
    return (
        <div>
            <button
                type="button"
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggle();
                }}
                data-nav-active={active ? 'true' : undefined}
                aria-expanded={open}
                className={`group relative flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150 ${
                    active
                        ? 'bg-teal text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
            >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative shrink-0">
                        <NavIcon active={active}>
                            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                            </svg>
                        </NavIcon>
                        {showAlert && (
                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-navy" />
                        )}
                    </div>
                    <span className="whitespace-nowrap">{label}</span>
                </div>
                <svg
                    className={`h-4 w-4 shrink-0 text-white/50 transition-transform duration-200 ${open ? 'rotate-180 text-white' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open ? (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-white/15 pl-3">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

// Diri ang main sidebar sa admin panel.
export default function Sidebar() {
    const page = usePage();
    const url = page.url ?? '';
    const { clientRegistrationCounts, adminNavCounts } = page.props;
    const pendingClientCount = clientRegistrationCounts?.pending ?? 0;
    const pendingPetCount = clientRegistrationCounts?.pending_pets ?? 0;
    const clientAlertCount = pendingClientCount + pendingPetCount;
    const pendingAppointmentCount = adminNavCounts?.pending_appointments ?? 0;
    const pendingHomeServiceCount = adminNavCounts?.pending_home_services ?? 0;
    const revenueActive = url.startsWith('/admin/revenue');
    const inventoryReportsActive = url.startsWith('/admin/inventory-reports');
    const reportsActive = url.startsWith('/admin/reports') || inventoryReportsActive;
    const reportsAnimalsTab = url.includes('tab=total-animals');
    const servicesReportsActive = url.startsWith('/admin/reports') && !reportsAnimalsTab;

    const adminMemory = getSidebarMemory('admin');
    const navRef = useSidebarNavScroll('admin', url);
    const [revenueDropdownOpen, setRevenueDropdownOpen] = useState(
        () => (adminMemory.seen ? adminMemory.revenueOpen : revenueActive),
    );
    const [reportsDropdownOpen, setReportsDropdownOpen] = useState(
        () => (adminMemory.seen ? adminMemory.reportsOpen : reportsActive),
    );
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    // Diri hinumdoman kung abli o sirado ang dropdown menus.
    const rememberMenus = (next) => {
        adminMemory.seen = true;
        if (next.revenueOpen !== undefined) adminMemory.revenueOpen = next.revenueOpen;
        if (next.reportsOpen !== undefined) adminMemory.reportsOpen = next.reportsOpen;
    };

    // Diri isira ang Revenue ug Reports menus.
    const closeBothMenus = () => {
        setRevenueDropdownOpen(false);
        setReportsDropdownOpen(false);
        rememberMenus({ revenueOpen: false, reportsOpen: false });
    };

    // Diri ablihan ang Revenue menu ug isira ang Reports.
    const openRevenueMenu = () => {
        setRevenueDropdownOpen(true);
        setReportsDropdownOpen(false);
        rememberMenus({ revenueOpen: true, reportsOpen: false });
    };

    // Diri ablihan ang Reports menu ug isira ang Revenue.
    const openReportsMenu = () => {
        setReportsDropdownOpen(true);
        setRevenueDropdownOpen(false);
        rememberMenus({ reportsOpen: true, revenueOpen: false });
    };

    // Diri susihon kung active ang nav path.
    const isActive = (path) => url.startsWith(path);

    // Diri i-logout ang admin.
    const handleLogout = () => {
        if (loggingOut) return;
        setLoggingOut(true);
        postAdminLogout();
    };

    return (
        <>
        <ResponsiveSidebarFrame brandTitle="ES CityVet" brandSubtitle="Admin Panel">
            <nav
                ref={navRef}
                className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <SectionLabel>Overview</SectionLabel>

                <NavItem
                    href="/admin/dashboard"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/dashboard')}
                    icon="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                >
                    Dashboard
                </NavItem>

                <SectionLabel>Operations</SectionLabel>

                <NavItem
                    href="/admin/barangay-animals"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/barangay-animals') || isActive('/admin/clients/')}
                    iconNode={(
                        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="4" r="2" />
                            <circle cx="18" cy="8" r="2" />
                            <circle cx="20" cy="16" r="2" />
                            <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
                        </svg>
                    )}
                    showAlert={clientAlertCount > 0}
                    badge={clientAlertCount}
                >
                    Animals
                </NavItem>

                <NavItem
                    href="/admin/appointments"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/appointments')}
                    icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    showAlert={pendingAppointmentCount > 0}
                    badge={pendingAppointmentCount}
                >
                    Clinical Appointments
                </NavItem>

                <NavItem
                    href="/admin/services"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/services')}
                    icon="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                >
                    Services
                </NavItem>

                <NavItem
                    href="/admin/vhc"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/vhc')}
                    icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                >
                    VHC Records
                </NavItem>

                <NavItem
                    href="/admin/elsalvador-city-map"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/elsalvador-city-map')}
                    icon="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.553-.832L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m-6 3l6-3"
                    showAlert={pendingHomeServiceCount > 0}
                    badge={pendingHomeServiceCount}
                >
                    Elsalvador City Map
                </NavItem>

                <SectionLabel>Finance & Reports</SectionLabel>

                <DropdownNav
                    active={revenueActive}
                    icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    label="Total Revenue"
                    open={revenueDropdownOpen}
                    onToggle={() =>
                        setRevenueDropdownOpen((open) => {
                            const next = !open;
                            rememberMenus({ revenueOpen: next });
                            return next;
                        })
                    }
                >
                    <SubNavItem
                        href="/admin/revenue/pet-registration"
                        active={isActive('/admin/revenue/pet-registration')}
                        onNavigate={openRevenueMenu}
                    >
                        Pet Registration
                    </SubNavItem>
                    <SubNavItem href="/admin/revenue/vhc" active={isActive('/admin/revenue/vhc')} onNavigate={openRevenueMenu}>
                        VHC
                    </SubNavItem>
                </DropdownNav>

                <DropdownNav
                    active={reportsActive}
                    icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    label="Reports"
                    open={reportsDropdownOpen}
                    onToggle={() =>
                        setReportsDropdownOpen((open) => {
                            const next = !open;
                            rememberMenus({ reportsOpen: next });
                            return next;
                        })
                    }
                >
                    <SubNavItem href="/admin/reports" active={servicesReportsActive} onNavigate={openReportsMenu}>
                        Services Reports
                    </SubNavItem>
                    <SubNavItem href="/admin/reports?tab=total-animals" active={reportsActive && reportsAnimalsTab} onNavigate={openReportsMenu}>
                        Total Animals
                    </SubNavItem>
                    <SubNavItem href="/admin/inventory-reports" active={inventoryReportsActive} onNavigate={openReportsMenu}>
                        Inventory Reports
                    </SubNavItem>
                </DropdownNav>

                <SectionLabel>System</SectionLabel>

                <NavItem
                    href="/admin/settings"
                    onNavigate={closeBothMenus}
                    active={isActive('/admin/settings')}
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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
