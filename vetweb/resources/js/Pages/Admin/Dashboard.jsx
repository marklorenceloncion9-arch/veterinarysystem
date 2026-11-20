import { Link, usePage } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '@/Components/Admin/Sidebar';
import AdminHeaderToolbar from '@/Components/Admin/AdminHeaderToolbar';
import ClinicCalendar from '@/Components/Admin/Dashboard/ClinicCalendar';
import {
    COLORS,
    SPECIES_PALETTE,
    STATUS_CHIPS,
    ChartEmpty,
    ChartTooltip,
    Panel,
    formatCurrency,
    formatNumber,
    formatPercent,
} from '@/Components/Admin/Dashboard/dashboardUi';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
} from 'recharts';

const STAT_ACCENTS = {
    navy: { icon: 'bg-navy', bar: 'bg-navy', wash: 'from-navy/[0.07]' },
    teal: { icon: 'bg-teal', bar: 'bg-teal', wash: 'from-teal/[0.08]' },
    blue: { icon: 'bg-accent', bar: 'bg-accent', wash: 'from-accent/10' },
    green: { icon: 'bg-success', bar: 'bg-success', wash: 'from-success/10' },
    rose: { icon: 'bg-danger', bar: 'bg-danger', wash: 'from-danger/[0.08]' },
};

// Diri ang card sa numero sa dashboard.
function StatCard({ label, value, icon, accent = 'navy', href, attention = false }) {
    const style = STAT_ACCENTS[accent] ?? STAT_ACCENTS.navy;

    return (
        <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition duration-200 hover:shadow-md">
            <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${style.bar}`} />
            <div className="relative flex items-start justify-between gap-3 p-5 pl-6">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        {label}
                        {attention && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" aria-label="Needs review" />}
                    </p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-navy">{value}</p>
                </div>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${style.icon}`}>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                    </svg>
                </div>
            </div>
            <Link
                href={href}
                className="relative mt-auto flex items-center justify-between border-t border-line px-5 py-2.5 pl-6 text-sm font-medium text-teal transition-colors hover:bg-canvas hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
                View
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
            </Link>
        </div>
    );
}

// Diri ang mga klase nga mapili sa Activity: ngalan, kulay ug unsa ang gi-ihap.
const ACTIVITY_TYPES = [
    { value: 'registered', label: 'Registered animals', unit: 'registered', topTitle: 'Latest registered', showCount: false, color: COLORS.green },
    { value: 'appointment', label: 'Clinic appointments', unit: 'bookings', topTitle: 'Top 5 animals', showCount: true, color: COLORS.navy },
    { value: 'home_service', label: 'Home service', unit: 'bookings', topTitle: 'Top 5 animals', showCount: true, color: COLORS.amber },
    { value: 'walk_in', label: 'Walk-in services', unit: 'bookings', topTitle: 'Top 5 animals', showCount: true, color: COLORS.teal },
];

// Diri himuon ang YYYY-MM-DD nga key sa local nga petsa.
function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Diri ang unang ug kataposang adlaw sa kasamtangang bulan.
function currentMonthRange() {
    const now = new Date();
    return {
        from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        till: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
}

// Diri ang iskedyul karong adlawa.
const TODAY_VISIBLE = 5;

function TodayPanel({ items }) {
    const groups = [
        { type: 'appointment', title: 'Clinic', href: '/admin/appointments?filter=today' },
        { type: 'home_service', title: 'Home service', href: '/admin/elsalvador-city-map' },
    ].map((group) => ({ ...group, rows: items.filter((item) => item.type === group.type) }));

    return (
        <Panel
            title="Today"
            subtitle={items.length === 0 ? undefined : `${items.length} ${items.length === 1 ? 'visit' : 'visits'}`}
            className="flex flex-col"
        >
            <div className="space-y-5">
                {groups.map((group) => (
                    <section key={group.type}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-navy">
                                {group.title}
                                <span className="ml-1.5 font-normal tabular-nums text-muted">{group.rows.length}</span>
                            </h3>
                            <Link href={group.href} className="text-sm font-medium text-teal transition hover:text-navy">
                                See all
                            </Link>
                        </div>

                        {group.rows.length === 0 ? (
                            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
                                None today.
                            </p>
                        ) : (
                            <ul className="-mx-2 divide-y divide-line">
                                {group.rows.slice(0, TODAY_VISIBLE).map((item) => (
                                    <li key={item.id}>
                                        <Link
                                            href={`/admin/appointments/${item.id}`}
                                            className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-canvas"
                                        >
                                            <span className="w-[4.25rem] shrink-0 text-sm font-semibold tabular-nums text-navy">{item.time}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-ink">{item.pet}</span>
                                                <span className="block truncate text-xs text-muted">{item.client}</span>
                                            </span>
                                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STATUS_CHIPS[item.status] || 'bg-gray-100 text-gray-700'}`}>
                                                {item.status}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                                {group.rows.length > TODAY_VISIBLE && (
                                    <li>
                                        <Link
                                            href={group.href}
                                            className="block rounded-md px-2 py-2 text-center text-sm font-medium text-teal transition-colors hover:bg-canvas hover:text-navy"
                                        >
                                            +{group.rows.length - TODAY_VISIBLE} more
                                        </Link>
                                    </li>
                                )}
                            </ul>
                        )}
                    </section>
                ))}
            </div>
        </Panel>
    );
}

// Diri ang graph sa kalihokan sa gipili nga petsa.
function ActivityPanel() {
    const monthRange = currentMonthRange();
    const [fromDate, setFromDate] = useState(monthRange.from);
    const [tillDate, setTillDate] = useState(monthRange.till);
    const [typeId, setTypeId] = useState('appointment');
    const [serviceId, setServiceId] = useState('');
    const [services, setServices] = useState([]);
    const [barangayId, setBarangayId] = useState('');
    const [barangays, setBarangays] = useState([]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const rangeStart = fromDate && tillDate && fromDate > tillDate ? tillDate : fromDate;
    const rangeEnd = fromDate && tillDate && fromDate > tillDate ? fromDate : tillDate;
    const isCurrentMonth = fromDate === monthRange.from && tillDate === monthRange.till;
    const hasDateFilter = fromDate !== '' || tillDate !== '';

    // Diri kuhaon ang numero sa gipili nga petsa.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);

        axios.get('/api/admin/dashboard-activity', {
            params: {
                from: rangeStart || undefined,
                till: rangeEnd || undefined,
                service_id: serviceId || undefined,
                barangay_id: barangayId || undefined,
            },
        })
            .then((response) => {
                if (cancelled || !response.data.success) return;
                setData(response.data.types);
                setServices(response.data.services || []);
                setBarangays(response.data.barangays || []);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [rangeStart, rangeEnd, serviceId, barangayId]);

    const active = ACTIVITY_TYPES.find((item) => item.value === typeId) ?? ACTIVITY_TYPES[0];
    const block = data?.[active.value];
    const top = block?.top || [];
    const slices = (block?.breakdown || []).map((row, index) => ({
        name: row.name,
        value: row.count,
        color: SPECIES_PALETTE[index % SPECIES_PALETTE.length],
    }));
    const sliceTotal = slices.reduce((sum, slice) => sum + slice.value, 0);

    const selectClass = 'rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 transition focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted';
    const dateClass = 'block w-[10.75rem] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100';
    const dateLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400';
    const emptyMessage = loading ? 'Loading…' : hasDateFilter ? 'Nothing for these dates.' : 'Nothing yet.';

    return (
        <Panel
            title="Activity"
            subtitle="Completed only"
            action={(
                <div className="flex flex-wrap items-end gap-2">
                    <div>
                        <label htmlFor="activity-barangay" className={dateLabelClass}>Barangay</label>
                        <select
                            id="activity-barangay"
                            value={barangayId}
                            onChange={(event) => setBarangayId(event.target.value)}
                            className={selectClass}
                        >
                            <option value="">All barangays</option>
                            {barangays.map((barangay) => (
                                <option key={barangay.id} value={barangay.id}>{barangay.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="activity-service" className={dateLabelClass}>Service</label>
                        <select
                            id="activity-service"
                            value={typeId === 'registered' ? '' : serviceId}
                            onChange={(event) => setServiceId(event.target.value)}
                            disabled={typeId === 'registered'}
                            className={selectClass}
                        >
                            <option value="">All services</option>
                            {services.map((service) => (
                                <option key={service.id} value={service.id}>{service.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="activity-from" className={dateLabelClass}>From</label>
                        <input
                            id="activity-from"
                            type="date"
                            value={fromDate}
                            onChange={(event) => setFromDate(event.target.value)}
                            className={dateClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="activity-till" className={dateLabelClass}>Till</label>
                        <input
                            id="activity-till"
                            type="date"
                            value={tillDate}
                            onChange={(event) => setTillDate(event.target.value)}
                            className={dateClass}
                        />
                    </div>
                    {!isCurrentMonth && (
                        <button
                            type="button"
                            onClick={() => {
                                setFromDate(monthRange.from);
                                setTillDate(monthRange.till);
                            }}
                            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                            This month
                        </button>
                    )}
                    {hasDateFilter && (
                        <button
                            type="button"
                            onClick={() => {
                                setFromDate('');
                                setTillDate('');
                            }}
                            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}
            className="mb-6"
        >
            {/* Pick what to look at */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Show">
                {ACTIVITY_TYPES.map((type) => {
                    const selected = type.value === active.value;
                    const total = data?.[type.value]?.total;

                    return (
                        <button
                            key={type.value}
                            type="button"
                            onClick={() => setTypeId(type.value)}
                            aria-pressed={selected}
                            className={`rounded-md border p-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                selected ? 'border-navy bg-canvas' : 'border-line bg-white hover:border-navy/40 hover:bg-canvas/60'
                            }`}
                        >
                            <span className="flex items-center gap-2 text-sm text-muted">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: type.color }} />
                                {type.label}
                            </span>
                            <span className="mt-1 block text-2xl font-bold tabular-nums text-navy">
                                {total === undefined ? '–' : formatNumber(total)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Donut + top 5 */}
            <div className={`mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                <div className="lg:col-span-2">
                    <p className="mb-2 text-sm font-medium text-navy">
                        {active.value === 'registered' ? 'By species' : 'By service'}
                    </p>
                    {failed ? (
                        <ChartEmpty message="Could not load these dates. Please refresh." height="h-56" />
                    ) : slices.length === 0 ? (
                        <ChartEmpty message={emptyMessage} height="h-56" />
                    ) : (
                        <div className="flex flex-col items-center gap-6 sm:flex-row">
                            <div className="relative h-56 w-56 shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Tooltip content={<ChartTooltip formatValue={formatNumber} unit={active.unit} total={sliceTotal} />} />
                                        <Pie
                                            data={slices}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={68}
                                            outerRadius={100}
                                            paddingAngle={slices.length > 1 ? 2 : 0}
                                            stroke="none"
                                        >
                                            {slices.map((slice) => (
                                                <Cell key={slice.name} fill={slice.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-bold tabular-nums text-navy">{formatNumber(block?.total)}</span>
                                    <span className="text-xs text-muted">{active.value === 'registered' ? 'registered' : 'completed'}</span>
                                </div>
                            </div>

                            <ul className="w-full min-w-0 flex-1 space-y-1">
                                {slices.map((slice) => (
                                    <li key={slice.name} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                                        <span className="min-w-0 flex-1 truncate text-ink">{slice.name}</span>
                                        <span className="shrink-0 tabular-nums">
                                            <span className="font-semibold text-navy">{formatNumber(slice.value)}</span>
                                            <span className="ml-2 inline-block w-9 text-right text-muted">{formatPercent(slice.value, sliceTotal)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div>
                    <p className="mb-2 text-sm font-medium text-navy">{active.topTitle}</p>
                    {top.length === 0 ? (
                        <p className="rounded-md border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
                            {emptyMessage}
                        </p>
                    ) : (
                        <ol className="divide-y divide-line">
                            {top.map((animal, index) => (
                                <li key={animal.id} className="flex items-center gap-3 py-2.5">
                                    <span className="w-4 shrink-0 text-sm font-semibold tabular-nums text-muted">{index + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-ink">
                                            {animal.pet}
                                            <span className="font-normal text-muted"> · {animal.species}</span>
                                        </span>
                                        <span className="block truncate text-xs text-muted">{animal.owner}</span>
                                    </span>
                                    {active.showCount && (
                                        <span className="shrink-0 text-sm tabular-nums text-navy">
                                            <span className="font-semibold">{animal.count}</span>
                                            <span className="text-muted"> {animal.count === 1 ? 'visit' : 'visits'}</span>
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </Panel>
    );
}

// Diri ang main page sa admin dashboard.
export default function Dashboard({ stats, todaySchedule = [] }) {
    const { flash } = usePage().props;

    const [flashMessage, setFlashMessage] = useState(null);

    useEffect(() => {
        if (flash?.success) {
            setFlashMessage({ type: 'success', text: flash.success });
            const timer = setTimeout(() => setFlashMessage(null), 3000);
            return () => clearTimeout(timer);
        }
        if (flash?.error) {
            setFlashMessage({ type: 'error', text: flash.error });
            const timer = setTimeout(() => setFlashMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [flash]);

    const todayLabel = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar />

            <div className="staff-main flex flex-1 flex-col">
                <header className="sticky top-0 z-30 border-b border-line bg-white px-8 py-4">
                    <div className="flex items-center justify-between gap-6">
                        <div className="min-w-0">
                            <p className="app-kicker">Clinic overview</p>
                            <h1 className="text-xl font-bold tracking-tight text-navy">Admin Dashboard</h1>
                            <p className="text-sm text-muted">{todayLabel}</p>
                        </div>

                        <AdminHeaderToolbar />
                    </div>
                </header>

                {/* Dashboard Content */}
                <main
                    className="flex-1 p-8 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {/* Flash Message */}
                    {flashMessage && (
                        <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                            flashMessage.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800'
                        }`}>
                            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {flashMessage.type === 'success' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                )}
                            </svg>
                            {flashMessage.text}
                        </div>
                    )}

                    {/* Today (left) + stat cards (right) */}
                    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <TodayPanel items={todaySchedule} />

                        <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
                            <StatCard
                                label="Total Clients"
                                value={stats?.totalClients?.toLocaleString() || 0}
                                accent="navy"
                                href="/admin/barangay-animals?view=clients"
                                icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                            <StatCard
                                label="Total Animals"
                                value={stats?.totalPets?.toLocaleString() || 0}
                                accent="blue"
                                href="/admin/barangay-animals"
                                icon="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                            />
                            <StatCard
                                label="Total Revenue"
                                value={formatCurrency(stats?.totalRevenue)}
                                accent="rose"
                                href="/admin/revenue"
                                icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                            <StatCard
                                label="Pending Animal Approvals"
                                value={stats?.pendingAnimals?.toLocaleString() || 0}
                                accent="teal"
                                href="/admin/barangay-animals/pending"
                                attention={Number(stats?.pendingAnimals) > 0}
                                icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </div>
                    </div>

                    {/* Activity */}
                    <ActivityPanel />

                    {/* Calendar */}
                    <div className="mb-3">
                        <h2 className="text-lg font-bold text-navy">Calendar</h2>
                        <p className="text-sm text-muted">See bookings by day. Block a day when the vet is away.</p>
                    </div>
                    <ClinicCalendar />
                </main>
            </div>
        </div>
    );
}
