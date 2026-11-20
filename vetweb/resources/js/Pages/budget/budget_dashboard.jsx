import { Link, usePage } from '@inertiajs/react';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
} from 'recharts';
import BudgetSidebar from '@/Components/Budget/BudgetSidebar';
import BudgetNotificationBell from '@/Components/Budget/BudgetNotificationBell';
import BudgetHeaderUser from '@/Components/Budget/BudgetHeaderUser';
import { getRestockHref } from '@/utils/inventoryStock';

const STATUS_CHART = [
    { key: 'out_of_stock', label: 'Out of stock', color: '#D64545' },
    { key: 'expired', label: 'Expired', color: '#C13B3B' },
    { key: 'low_stock', label: 'Low stock', color: '#D99A00' },
    { key: 'expiring', label: 'Expiring', color: '#C08A00' },
    { key: 'good', label: 'Good', color: '#2E8B57' },
];

const SHORTCUTS = [
    { href: '/budget/inventory', label: 'Inventory' },
    { href: '/budget/inventory/add', label: 'Add inventory' },
    { href: '/budget/reports', label: 'Inventory reports' },
    { href: '/budget/booked-services', label: 'Booked services' },
];

const STATUS_BADGE = {
    'Out of stock': 'bg-red-50 text-red-800 ring-red-200/80',
    Expired: 'bg-red-50 text-red-800 ring-red-200/80',
    'Low stock': 'bg-amber-50 text-amber-800 ring-amber-200/80',
    Expiring: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    Good: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
};

// Diri ang panel nga naay title ug badge.
function Panel({ title, subtitle, children, action = null, tone = 'default', badge = null }) {
    const isAlert = tone === 'alert';

    return (
        <section
                    className={`rounded-xl border shadow-sm ${
                isAlert
                    ? 'border-red-200 bg-white'
                    : 'border-line bg-white'
            }`}
        >
            <div
                className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${
                    isAlert ? 'border-red-100 bg-gradient-to-r from-red-50 to-white' : 'border-slate-100'
                }`}
            >
                <div className="flex min-w-0 items-start gap-3">
                    {isAlert ? (
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm shadow-red-200">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </span>
                    ) : null}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className={`text-sm font-semibold ${isAlert ? 'text-red-900' : 'text-slate-900'}`}>
                                {title}
                            </h2>
                            {badge != null ? (
                                <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                        isAlert
                                            ? 'bg-red-600 text-white'
                                            : 'bg-slate-900 text-white'
                                    }`}
                                >
                                    {badge}
                                </span>
                            ) : null}
                        </div>
                        {subtitle ? (
                            <p className={`mt-0.5 text-xs ${isAlert ? 'text-red-700/80' : 'text-slate-500'}`}>
                                {subtitle}
                            </p>
                        ) : null}
                    </div>
                </div>
                {action}
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

// Diri kuhaon ang ngalan para sa pagbati.
function getGreetingName(user) {
    if (user?.firstname) return user.firstname;
    if (user?.name) return user.name.split(' ')[0];
    return 'there';
}

// Diri i-format ang petsa.
function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

// Diri ang icon sa restock.
function RestockIcon({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
        </svg>
    );
}

// Diri ang icon sa view.
function ViewIcon({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
        </svg>
    );
}

// Diri ang main page sa budget dashboard.
export default function Dashboard({
    inventoryOverview = null,
    stockMovement = [],
    attentionItems = [],
}) {
    const { auth } = usePage().props;
    const todayLabel = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    const statusCounts = inventoryOverview?.status_counts || {};
    const statusChartData = STATUS_CHART.map((item) => ({
        name: item.label,
        value: Number(statusCounts[item.key] || 0),
        color: item.color,
    })).filter((item) => item.value > 0);

    const statusTotal = STATUS_CHART.reduce(
        (sum, item) => sum + Number(statusCounts[item.key] || 0),
        0
    );

    const movementData = Array.isArray(stockMovement) ? stockMovement : [];
    const hasMovement = movementData.some((d) => Number(d.in) > 0 || Number(d.out) > 0);

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <BudgetSidebar />

            <main className="staff-main flex min-h-0 flex-1 flex-col">
                <header className="shrink-0 border-b border-line bg-white px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="app-kicker">Inventory overview</p>
                            <h1 className="text-xl font-bold text-navy">Dashboard</h1>
                            <p className="text-sm text-muted">{todayLabel}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <BudgetNotificationBell />
                            <BudgetHeaderUser />
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-auto px-6 py-5 [&::-webkit-scrollbar]:hidden">
                    <div className="mb-5 rounded-xl border border-line bg-white px-5 py-4 shadow-sm">
                        <p className="text-sm font-semibold text-navy">
                            Welcome back, {getGreetingName(auth?.user)}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                            Monitor stock health, movement, and items that need attention.
                        </p>
                    </div>

                    {(inventoryOverview?.medicines != null || inventoryOverview?.usable_on_hand != null) && (
                        <div className="mb-5 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1 font-medium ring-1 ring-inset ring-slate-200">
                                {Number(inventoryOverview.medicines || 0).toLocaleString()} medicines
                            </span>
                            <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1 font-medium ring-1 ring-inset ring-slate-200">
                                {Number(inventoryOverview.usable_on_hand || 0).toLocaleString()} usable units
                            </span>
                        </div>
                    )}

                    <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <Panel
                            title="Stock status"
                            subtitle="Current inventory health by medicine"
                            action={
                                <Link
                                    href="/budget/inventory"
                                    className="text-xs font-semibold text-teal hover:text-navy"
                                >
                                    Open inventory
                                </Link>
                            }
                        >
                            {statusChartData.length === 0 ? (
                                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                                    No inventory data yet.
                                </div>
                            ) : (
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={statusChartData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={58}
                                                outerRadius={88}
                                                paddingAngle={2}
                                            >
                                                {statusChartData.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value, name) => [
                                                    `${value} (${statusTotal ? Math.round((Number(value) / statusTotal) * 100) : 0}%)`,
                                                    name,
                                                ]}
                                            />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Panel>

                        <Panel
                            title="Stock movement"
                            subtitle="Last 30 days · stock in vs stock out"
                            action={
                                <Link
                                    href="/budget/reports"
                                    className="text-xs font-semibold text-teal hover:text-navy"
                                >
                                    View reports
                                </Link>
                            }
                        >
                            {!hasMovement ? (
                                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                                    No stock movement in the last 30 days.
                                </div>
                            ) : (
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={movementData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                            <XAxis
                                                dataKey="label"
                                                tick={{ fontSize: 10, fill: '#64748b' }}
                                                interval="preserveStartEnd"
                                                minTickGap={18}
                                            />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={36} />
                                            <Tooltip
                                                labelFormatter={(_, payload) =>
                                                    payload?.[0]?.payload?.date || ''
                                                }
                                            />
                                            <Legend />
                                            <Bar dataKey="in" name="Stock in" fill="#059669" radius={[3, 3, 0, 0]} />
                                            <Bar dataKey="out" name="Stock out" fill="#dc2626" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Panel>
                    </div>

                    <Panel
                        title="Needs attention"
                        subtitle={
                            attentionItems.length > 0
                                ? 'Medicines that are out of stock, expired, low, or expiring — act on these first'
                                : 'Medicines that are out of stock, expired, low, or expiring'
                        }
                        tone={attentionItems.length > 0 ? 'alert' : 'default'}
                        badge={attentionItems.length > 0 ? attentionItems.length : null}
                        action={
                            <Link
                                href="/budget/inventory"
                                className={`text-xs font-semibold ${
                                    attentionItems.length > 0
                                        ? 'text-red-700 hover:text-red-900'
                                        : 'text-teal hover:text-navy'
                                }`}
                            >
                                View inventory
                            </Link>
                        }
                    >
                        {attentionItems.length === 0 ? (
                            <p className="py-8 text-center text-sm text-slate-500">
                                All medicines look healthy right now.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[640px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-red-100 text-[11px] font-semibold uppercase tracking-[0.06em] text-red-700/70">
                                            <th className="pb-2 pr-3 font-semibold">Medicine</th>
                                            <th className="pb-2 pr-3 font-semibold">On hand</th>
                                            <th className="pb-2 pr-3 font-semibold">Expiry</th>
                                            <th className="pb-2 pr-3 font-semibold">Status</th>
                                            <th className="pb-2 text-right font-semibold">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-red-50">
                                        {attentionItems.map((item) => {
                                            const isCritical =
                                                item.status === 'Out of stock' || item.status === 'Expired';

                                            return (
                                            <tr
                                                key={item.medicine_id}
                                                className={isCritical ? 'bg-red-50/40' : 'bg-amber-50/20'}
                                            >
                                                <td className="py-3 pr-3">
                                                    <p className="font-medium text-slate-900">{item.medicine_name}</p>
                                                    <p className="text-xs text-slate-400">{item.category}</p>
                                                </td>
                                                <td
                                                    className={`py-3 pr-3 tabular-nums font-semibold ${
                                                        Number(item.on_hand) <= 0
                                                            ? 'text-red-700'
                                                            : 'text-slate-700'
                                                    }`}
                                                >
                                                    {Number(item.on_hand) <= 0
                                                        ? 'No stock'
                                                        : `${Number(item.on_hand).toLocaleString()} ${item.unit}`}
                                                </td>
                                                <td className="py-3 pr-3 text-slate-600">
                                                    {formatDate(item.nearest_expiry)}
                                                </td>
                                                <td className="py-3 pr-3">
                                                    <span
                                                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                                            STATUS_BADGE[item.status] ||
                                                            'bg-slate-50 text-slate-700 ring-slate-200'
                                                        }`}
                                                    >
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-right">
                                                    <div className="inline-flex items-center justify-end gap-1.5">
                                                        <Link
                                                            href={getRestockHref(
                                                                item.medicine_id,
                                                                item.medicine_name
                                                            )}
                                                            title="Restock"
                                                            aria-label={`Restock ${item.medicine_name}`}
                                                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                                                isCritical
                                                                    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                                                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                            }`}
                                                        >
                                                            <RestockIcon />
                                                        </Link>
                                                        {item.inventory_id ? (
                                                            <Link
                                                                href={`/budget/inventory/${item.inventory_id}`}
                                                                title="View batch"
                                                                aria-label={`View ${item.medicine_name}`}
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                                            >
                                                                <ViewIcon />
                                                            </Link>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/80 pt-4 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Shortcuts
                        </span>
                        {SHORTCUTS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="font-medium text-teal transition hover:text-navy"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
