import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/Components/Admin/Sidebar';
import Tabs from '@/Components/Ui/Tabs';

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'livestock', label: 'Livestock Fees' },
    { id: 'poultry', label: 'Poultry Fees' },
];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YEAR_OPTIONS = [2024, 2025, 2026, 2027];

// Diri i-format ang local nga petsa.
const formatLocalDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Diri kuhaon ang petsa lang sa history value.
const historyDate = (value) => (value ? String(value).slice(0, 10) : '');

// Diri i-format ang kwarta sa peso.
const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);

// Diri i-format ang fee nga mubo.
const formatCompactFee = (amount) => {
    const value = Number(amount ?? 0);
    return Number.isInteger(value) ? `₱${value}` : `₱${value.toFixed(2)}`;
};

// Diri i-format ang petsa para ipakita.
const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
};

// Diri ang table sa fee sa matag species.
function SpeciesFeeTable({
    species,
    typeLabel,
    accent,
    onEdit,
    editingId,
    editValue,
    onEditValueChange,
    effectiveDate,
    onEffectiveDateChange,
    onSave,
    onCancel,
    saving,
}) {
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return species;
        return species.filter((s) => s.species_name.toLowerCase().includes(query));
    }, [species, search]);

    const accentStyles = {
        emerald: {
            header: 'from-emerald-600 to-teal-600',
            button: 'text-emerald-700 bg-emerald-50 ring-emerald-200 hover:bg-emerald-100',
            focus: 'focus:ring-emerald-500 focus:border-emerald-500',
        },
        amber: {
            header: 'from-amber-500 to-orange-500',
            button: 'text-amber-700 bg-amber-50 ring-amber-200 hover:bg-amber-100',
            focus: 'focus:ring-amber-500 focus:border-amber-500',
        },
    }[accent];

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className={`bg-gradient-to-r ${accentStyles.header} px-6 py-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">{typeLabel}</p>
                        <h2 className="mt-1 text-xl font-bold text-white">Per-Species Fees</h2>
                        <p className="mt-1 text-sm text-white/80">{species.length} species · fee per head · set a starting day when you edit</p>
                    </div>
                    <div className="relative">
                        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search species..."
                            className="w-full rounded-xl border-0 bg-white/95 py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none sm:w-64"
                        />
                    </div>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="px-6 py-16 text-center">
                    <p className="text-sm font-medium text-slate-500">No {typeLabel.toLowerCase()} species found</p>
                    <p className="mt-1 text-xs text-slate-400">Add species in the system to configure fees here.</p>
                </div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {filtered.map((item) => {
                        const isEditing = editingId === item.id;

                        return (
                            <div key={item.id} className="flex flex-col gap-3 px-6 py-4 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-base font-semibold text-slate-900">{item.species_name}</p>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-3">
                                    {isEditing ? (
                                        <>
                                            <div>
                                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Starting date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={effectiveDate}
                                                    onChange={(e) => onEffectiveDateChange(e.target.value)}
                                                    className={`rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ${accentStyles.focus}`}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Fee per head
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editValue}
                                                        onChange={(e) => onEditValueChange(e.target.value)}
                                                        className={`w-28 rounded-xl border border-slate-200 py-2 pl-7 pr-3 text-sm font-semibold outline-none ${accentStyles.focus}`}
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => onSave(item)}
                                                className="mt-5 rounded-lg bg-violet-600 p-2 text-white transition hover:bg-violet-700 disabled:opacity-50"
                                            >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </button>
                                            <button type="button" onClick={onCancel} className="mt-5 rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xl font-bold tabular-nums text-violet-700">
                                                {formatCurrency(item.vhc_fee)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onEdit(item)}
                                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${accentStyles.button}`}
                                            >
                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                                Edit
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Diri ang page sa revenue sa VHC.
export default function RevenueVhc() {
    const today = new Date();
    const [revenueData, setRevenueData] = useState(null);
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [savingCert, setSavingCert] = useState(false);
    const [flashMessage, setFlashMessage] = useState(null);

    const [showCertModal, setShowCertModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [certFee, setCertFee] = useState('');
    const [certReason, setCertReason] = useState('');

    const [editingSpeciesId, setEditingSpeciesId] = useState(null);
    const [speciesEditValue, setSpeciesEditValue] = useState('');
    const [speciesEffectiveDate, setSpeciesEffectiveDate] = useState(formatLocalDate(today));
    const [savingSpecies, setSavingSpecies] = useState(false);

    // Diri ipakita ang flash message kadiyot.
    const showFlash = (type, text) => {
        setFlashMessage({ type, text });
        setTimeout(() => setFlashMessage(null), 3000);
    };

    // Diri kuhaon ang CSRF token.
    const getCSRFToken = () => {
        const token = document.head.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    };

    // Diri kuhaon ang revenue data sa VHC.
    const fetchRevenueData = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/revenue/vhc?year=${selectedYear}`, {
                headers: {
                    'X-CSRF-TOKEN': getCSRFToken(),
                    Accept: 'application/json',
                },
            });
            const data = await response.json();
            if (data.success) setRevenueData(data);
        } catch (error) {
            console.error('Failed to fetch VHC revenue data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRevenueData();
    }, [selectedYear]);

    const certificateType = revenueData?.fee_types?.[0];
    const livestockSpecies = revenueData?.species_fees?.livestock || [];
    const poultrySpecies = revenueData?.species_fees?.poultry || [];
    const dailyStats = revenueData?.daily_stats || {};
    const selectedDayStats = selectedDate ? dailyStats[selectedDate] : null;

    const selectedMonthSummary = useMemo(() => {
        const monthData = revenueData?.monthly_revenue?.find((month) => month.month === calendarMonth + 1);
        return {
            count: monthData?.count ?? 0,
            total_revenue: monthData?.total_revenue ?? 0,
        };
    }, [revenueData, calendarMonth]);

    const calendarDays = useMemo(() => {
        const year = selectedYear;
        const month = calendarMonth;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];
        const todayStr = formatLocalDate(new Date());
        const fallbackFee = certificateType?.amount ?? revenueData?.current_fees?.certificate ?? 0;

        for (let i = 0; i < firstDay; i += 1) {
            days.push(null);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, month, day);
            const dateStr = formatLocalDate(date);
            const stats = dailyStats[dateStr] || {
                date: dateStr,
                count: 0,
                livestock_heads: 0,
                poultry_heads: 0,
                total_revenue: 0,
                certificate_fee: fallbackFee,
                fee_changed: false,
            };

            days.push({
                day,
                date: dateStr,
                isToday: dateStr === todayStr,
                ...stats,
            });
        }

        return days;
    }, [selectedYear, calendarMonth, dailyStats, certificateType?.amount, revenueData?.current_fees?.certificate]);

    // Diri balik sa miaging bulan.
    const goPrevMonth = () => {
        if (calendarMonth === 0) {
            if (selectedYear > YEAR_OPTIONS[0]) {
                setSelectedYear(selectedYear - 1);
                setCalendarMonth(11);
            }
        } else {
            setCalendarMonth(calendarMonth - 1);
        }
    };

    // Diri adto sa sunod nga bulan.
    const goNextMonth = () => {
        if (calendarMonth === 11) {
            if (selectedYear < YEAR_OPTIONS[YEAR_OPTIONS.length - 1]) {
                setSelectedYear(selectedYear + 1);
                setCalendarMonth(0);
            }
        } else {
            setCalendarMonth(calendarMonth + 1);
        }
    };

    // Diri ablihan ang editor sa fee sa adlaw.
    const openDayEditor = (dateStr, fee) => {
        setSelectedDate(dateStr);
        setSpeciesEffectiveDate(dateStr);
        setCertFee(String(fee ?? ''));
        setCertReason('');
        setShowCertModal(true);
    };

    // Diri sirado ang editor sa fee sa adlaw.
    const closeDayEditor = () => {
        setShowCertModal(false);
        setCertReason('');
    };

    // Diri i-update ang fee sa certificate.
    const handleUpdateCertificateFee = async (e) => {
        e.preventDefault();
        if (!certFee || isNaN(certFee) || parseFloat(certFee) < 0) {
            showFlash('error', 'Please enter a valid fee amount');
            return;
        }

        if (!selectedDate || !certificateType) {
            showFlash('error', 'Please select a date on the calendar');
            return;
        }

        setSavingCert(true);
        try {
            const response = await fetch('/api/revenue/update-fee', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCSRFToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    payment_type_id: certificateType.id,
                    new_amount: parseFloat(certFee),
                    effective_date: selectedDate,
                    reason: certReason || 'Certificate fee adjustment',
                }),
            });
            const data = await response.json();
            if (data.success) {
                closeDayEditor();
                fetchRevenueData();
                showFlash('success', data.message || 'Certificate fee updated!');
            } else {
                showFlash('error', data.message || 'Failed to update fee');
            }
        } catch {
            showFlash('error', 'Failed to update fee');
        } finally {
            setSavingCert(false);
        }
    };

    // Diri sugdan ang pag-edit sa fee sa species.
    const startSpeciesEdit = (species) => {
        setEditingSpeciesId(species.id);
        setSpeciesEditValue(String(species.vhc_fee ?? 0));
        setSpeciesEffectiveDate(selectedDate || formatLocalDate(new Date()));
    };

    // Diri i-cancel ang pag-edit sa fee sa species.
    const cancelSpeciesEdit = () => {
        setEditingSpeciesId(null);
        setSpeciesEditValue('');
    };

    // Diri i-save ang fee sa species.
    const saveSpeciesFee = async (species) => {
        if (speciesEditValue === '' || isNaN(speciesEditValue) || parseFloat(speciesEditValue) < 0) {
            showFlash('error', 'Please enter a valid fee amount');
            return;
        }

        if (!speciesEffectiveDate) {
            showFlash('error', 'Please choose a starting date');
            return;
        }

        setSavingSpecies(true);
        try {
            const response = await fetch('/api/revenue/vhc/species-fee', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCSRFToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    species_id: species.id,
                    new_amount: parseFloat(speciesEditValue),
                    effective_date: speciesEffectiveDate,
                    reason: `${species.species_name} fee adjustment`,
                }),
            });
            const data = await response.json();
            if (data.success) {
                cancelSpeciesEdit();
                fetchRevenueData();
                showFlash('success', `${species.species_name} fee updated starting ${formatDisplayDate(speciesEffectiveDate)}!`);
            } else {
                showFlash('error', data.message || 'Failed to update species fee');
            }
        } catch {
            showFlash('error', 'Failed to update species fee');
        } finally {
            setSavingSpecies(false);
        }
    };

    const allHistory = useMemo(() => {
        const certHistory = Object.values(revenueData?.fee_history || {}).flat().map((e) => ({
            id: `cert-${e.id}`,
            type: 'certificate',
            label: e.payment_type?.type_name || 'Certificate',
            date: historyDate(e.effective_date),
            old_amount: e.old_amount,
            new_amount: e.new_amount,
            reason: e.reason,
        }));
        const speciesHistory = (revenueData?.species_fee_history || []).map((e) => ({
            id: `species-${e.id}`,
            type: 'species',
            label: e.species?.species_name || 'Species',
            date: historyDate(e.effective_date),
            old_amount: e.old_amount,
            new_amount: e.new_amount,
            reason: e.reason,
        }));
        return [...certHistory, ...speciesHistory].sort((a, b) => b.date.localeCompare(a.date));
    }, [revenueData]);

    const speciesTableProps = {
        editingId: editingSpeciesId,
        editValue: speciesEditValue,
        onEdit: startSpeciesEdit,
        onEditValueChange: setSpeciesEditValue,
        effectiveDate: speciesEffectiveDate,
        onEffectiveDateChange: setSpeciesEffectiveDate,
        onSave: saveSpeciesFee,
        onCancel: cancelSpeciesEdit,
        saving: savingSpecies,
    };

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
            <main className="min-h-0 flex-1 overflow-y-auto p-8 scrollbar-hide">
                <div>
                    <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div className="bg-navy px-8 py-8">
                            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Finance</p>
                                    <h1 className="mt-2 text-3xl font-bold text-white">VHC Revenue</h1>
                                    <p className="mt-2 max-w-xl text-sm text-violet-100">
                                        Click a calendar day to set the certificate fee starting that date. Species fees also use a starting day, not a whole month.
                                    </p>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-violet-200">Year</label>
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                                        className="rounded-xl border-0 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                                    >
                                        {YEAR_OPTIONS.map((year) => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 lg:grid-cols-4">
                            {[
                                {
                                    label: `${MONTH_NAMES[calendarMonth]} ${selectedYear}`,
                                    value: formatCurrency(selectedMonthSummary.total_revenue),
                                    sub: `${selectedMonthSummary.count} certificates`,
                                },
                                {
                                    label: `Total ${selectedYear}`,
                                    value: formatCurrency(revenueData?.total_revenue),
                                    sub: 'Revenue',
                                },
                                {
                                    label: 'Livestock',
                                    value: revenueData?.total_livestock_heads ?? '—',
                                    sub: 'Heads this year',
                                },
                                {
                                    label: 'Poultry',
                                    value: revenueData?.total_poultry_heads ?? '—',
                                    sub: 'Heads this year',
                                },
                            ].map((stat) => (
                                <div key={stat.label} className="px-6 py-5">
                                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
                                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{loading ? '…' : stat.value}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">{stat.sub}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {flashMessage && (
                        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
                            flashMessage.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                        }`}>
                            {flashMessage.text}
                        </div>
                    )}

                    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-violet-600">Certificate Fee</p>
                                <p className="text-2xl font-bold text-violet-900">
                                    {certificateType ? formatCurrency(certificateType.amount) : '—'}
                                </p>
                                <p className="text-xs text-violet-500">Click a calendar day to change this starting that date</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => openDayEditor(formatLocalDate(new Date()), certificateType?.amount)}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
                        >
                            Edit Today
                        </button>
                    </div>

                    <div className="mb-6">
                        <Tabs
                            value={activeTab}
                            onChange={setActiveTab}
                            fullWidth
                            items={TABS.map((tab) => ({
                                id: tab.id,
                                label: tab.label,
                                count:
                                    tab.id === 'livestock'
                                        ? livestockSpecies.length || null
                                        : tab.id === 'poultry'
                                          ? poultrySpecies.length || null
                                          : null,
                            }))}
                        />
                    </div>

                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                <div className="border-b border-slate-100 px-6 py-5">
                                    <h2 className="text-lg font-semibold text-slate-900">Certificate Fee Calendar</h2>
                                    <p className="text-sm text-slate-500">
                                        Click any day to set the certificate fee starting that date. Example: June 9 at ₱100.
                                    </p>
                                </div>

                                <div className="p-6">
                                    <div className="mb-5 flex items-center justify-center">
                                        <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
                                            <button
                                                type="button"
                                                onClick={goPrevMonth}
                                                className="rounded-lg p-2 transition-colors hover:bg-white hover:shadow-sm"
                                            >
                                                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </button>
                                            <span className="min-w-[180px] px-2 text-center text-sm font-semibold text-gray-900">
                                                {MONTH_NAMES[calendarMonth]} {selectedYear}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={goNextMonth}
                                                className="rounded-lg p-2 transition-colors hover:bg-white hover:shadow-sm"
                                            >
                                                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {loading && !revenueData ? (
                                        <div className="flex items-center justify-center py-16">
                                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mb-2 grid grid-cols-7 gap-1.5">
                                                {WEEK_DAYS.map((day) => (
                                                    <div key={day} className="py-2 text-center text-gray-500">
                                                        <span className="text-xs font-semibold uppercase tracking-wide">{day}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-7 gap-1.5">
                                                {calendarDays.map((date, index) => (
                                                    <div key={date ? date.date : `empty-${index}`} className="min-h-[88px]">
                                                        {date ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openDayEditor(date.date, date.certificate_fee)}
                                                                className={`flex h-full w-full flex-col items-start rounded-xl px-2 py-1.5 text-left transition-all ${
                                                                    date.fee_changed
                                                                        ? 'bg-violet-50 text-violet-900 ring-2 ring-violet-300 hover:bg-violet-100'
                                                                        : date.isToday
                                                                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-200 hover:bg-violet-700'
                                                                        : date.count > 0
                                                                        ? 'bg-emerald-50 text-gray-800 ring-1 ring-emerald-100 hover:bg-emerald-100'
                                                                        : 'bg-gray-50 text-gray-700 hover:bg-violet-50 hover:text-violet-700'
                                                                }`}
                                                            >
                                                                <span className="text-sm font-semibold">{date.day}</span>
                                                                <span className={`mt-auto text-[11px] font-semibold ${date.isToday && !date.fee_changed ? 'text-white/90' : ''}`}>
                                                                    {formatCompactFee(date.certificate_fee)}
                                                                </span>
                                                                {date.count > 0 && (
                                                                    <span className={`text-[10px] ${date.isToday && !date.fee_changed ? 'text-white/80' : 'text-emerald-700'}`}>
                                                                        {date.count} cert{date.count === 1 ? '' : 's'}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <div className="h-full w-full" />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-100 pt-4 text-xs">
                                                {[
                                                    { color: 'bg-violet-600', label: 'Today' },
                                                    { color: 'bg-violet-50 ring-violet-300', label: 'Fee starts this day' },
                                                    { color: 'bg-emerald-50 ring-emerald-100', label: 'Has certificates' },
                                                    { color: 'bg-gray-50 ring-gray-200', label: 'Click to edit' },
                                                ].map(({ color, label }) => (
                                                    <div key={label} className="flex items-center gap-1.5">
                                                        <div className={`h-3 w-3 rounded-md ring-1 ${color}`} />
                                                        <span className="text-gray-600">{label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {allHistory.length > 0 && (
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    <div className="border-b border-slate-100 px-6 py-5">
                                        <h2 className="text-lg font-semibold text-slate-900">Recent Fee Changes</h2>
                                        <p className="text-sm text-slate-500">Click a certificate row to edit that date</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-slate-100 bg-slate-50/80">
                                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Old</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">New</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {allHistory.slice(0, 15).map((entry) => (
                                                    <tr
                                                        key={entry.id}
                                                        className={entry.type === 'certificate' ? 'cursor-pointer hover:bg-violet-50/60' : 'hover:bg-slate-50/50'}
                                                        onClick={() => {
                                                            if (entry.type !== 'certificate' || !entry.date) return;
                                                            const [year, month] = entry.date.split('-').map(Number);
                                                            if (year) setSelectedYear(year);
                                                            if (month) setCalendarMonth(month - 1);
                                                            openDayEditor(entry.date, entry.new_amount);
                                                        }}
                                                    >
                                                        <td className="px-6 py-3.5 text-sm font-medium text-slate-900">{entry.label}</td>
                                                        <td className="px-6 py-3.5 text-sm text-slate-600">{formatDisplayDate(entry.date)}</td>
                                                        <td className="px-6 py-3.5 text-sm text-slate-400">{formatCurrency(entry.old_amount)}</td>
                                                        <td className="px-6 py-3.5 text-sm font-semibold text-violet-600">{formatCurrency(entry.new_amount)}</td>
                                                        <td className="px-6 py-3.5 text-sm text-slate-500">{entry.reason || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'livestock' && (
                        <SpeciesFeeTable
                            species={livestockSpecies}
                            typeLabel="Livestock"
                            accent="emerald"
                            {...speciesTableProps}
                        />
                    )}

                    {activeTab === 'poultry' && (
                        <SpeciesFeeTable
                            species={poultrySpecies}
                            typeLabel="Poultry"
                            accent="amber"
                            {...speciesTableProps}
                        />
                    )}
                </div>

                {showCertModal && certificateType && selectedDate && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={closeDayEditor}>
                        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Edit day fee</p>
                            <h2 className="mt-1 text-xl font-bold text-slate-900">{formatDisplayDate(selectedDate)}</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Set the certificate fee starting this day. It stays in effect until you change a later date.
                            </p>

                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-violet-50 px-4 py-3">
                                    <p className="text-xs text-gray-500">Fee this day</p>
                                    <p className="text-lg font-bold text-violet-700">
                                        {formatCurrency(selectedDayStats?.certificate_fee ?? certFee)}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                                    <p className="text-xs text-gray-500">Certificates</p>
                                    <p className="text-lg font-bold text-emerald-700">
                                        {selectedDayStats?.count ?? 0}
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleUpdateCertificateFee} className="mt-6 space-y-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">
                                        Certificate Fee *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={certFee}
                                            onChange={(e) => setCertFee(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 py-2.5 pl-8 pr-4 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
                                    <textarea
                                        value={certReason}
                                        onChange={(e) => setCertReason(e.target.value)}
                                        rows={2}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15"
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={closeDayEditor} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={savingCert} className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                                        {savingCert ? 'Saving...' : 'Save Fee'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
            </div>
        </div>
    );
}
