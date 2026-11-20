import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/Components/Admin/Sidebar';

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

// Diri ang page sa revenue sa pet registration.
export default function RevenuePetRegistration() {
    const today = new Date();
    const [revenueData, setRevenueData] = useState(null);
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
    const [selectedPaymentType, setSelectedPaymentType] = useState(1);
    const [loading, setLoading] = useState(false);
    const [savingFee, setSavingFee] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [newFee, setNewFee] = useState('');
    const [feeReason, setFeeReason] = useState('');
    const [showDayModal, setShowDayModal] = useState(false);
    const [history, setHistory] = useState([]);
    const [flashMessage, setFlashMessage] = useState(null);

    // Diri ipakita ang flash message kadiyot.
    const showFlash = (type, text) => {
        setFlashMessage({ type, text });
        setTimeout(() => setFlashMessage(null), type === 'success' ? 4000 : 3000);
    };

    // Diri kuhaon ang CSRF token.
    const getCSRFToken = () => {
        const token = document.head.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    };

    // Diri i-format ang kwarta sa peso.
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
        }).format(amount ?? 0);
    };

    // Diri i-format ang fee nga mubo.
    const formatCompactFee = (amount) => {
        const value = Number(amount ?? 0);
        return Number.isInteger(value) ? `₱${value}` : `₱${value.toFixed(2)}`;
    };

    // Diri kuhaon ang revenue data.
    const fetchRevenueData = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/revenue?year=${selectedYear}&payment_type_id=${selectedPaymentType}`, {
                headers: {
                    'X-CSRF-TOKEN': getCSRFToken(),
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (data.success) {
                setRevenueData(data);
                setHistory(data.history || []);
            }
        } catch (error) {
            console.error('Failed to fetch revenue data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRevenueData();
    }, [selectedYear, selectedPaymentType]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchRevenueData();
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [selectedYear, selectedPaymentType]);

    const dailyStats = revenueData?.daily_stats || {};

    const calendarDays = useMemo(() => {
        const year = selectedYear;
        const month = calendarMonth;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];
        const todayStr = formatLocalDate(new Date());

        for (let i = 0; i < firstDay; i += 1) {
            days.push(null);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, month, day);
            const dateStr = formatLocalDate(date);
            const stats = dailyStats[dateStr] || {
                date: dateStr,
                count: 0,
                fee: revenueData?.current_fee ?? 0,
                total_revenue: 0,
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
    }, [selectedYear, calendarMonth, dailyStats, revenueData?.current_fee]);

    const selectedMonthSummary = useMemo(() => {
        const monthData = revenueData?.monthly_revenue?.find((month) => month.month === calendarMonth + 1);
        return {
            count: monthData?.count ?? 0,
            total_revenue: monthData?.total_revenue ?? 0,
        };
    }, [revenueData, calendarMonth]);

    const selectedDayStats = selectedDate ? dailyStats[selectedDate] : null;

    // Diri ablihan ang editor sa fee sa adlaw.
    const openDayEditor = (dateStr, fee) => {
        setSelectedDate(dateStr);
        setNewFee(String(fee ?? ''));
        setFeeReason('');
        setShowDayModal(true);
    };

    // Diri sirado ang editor sa fee sa adlaw.
    const closeDayEditor = () => {
        setShowDayModal(false);
        setFeeReason('');
    };

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

    // Diri i-update ang fee sa registration.
    const handleUpdateFee = async (e) => {
        e.preventDefault();

        if (!newFee || isNaN(newFee) || parseFloat(newFee) < 0) {
            showFlash('error', 'Please enter a valid fee amount');
            return;
        }

        if (!selectedDate) {
            showFlash('error', 'Please select a date on the calendar');
            return;
        }

        setSavingFee(true);
        try {
            const response = await fetch('/api/revenue/update-fee', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCSRFToken(),
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    payment_type_id: selectedPaymentType,
                    new_amount: parseFloat(newFee),
                    effective_date: selectedDate,
                    reason: feeReason || 'Fee adjustment',
                }),
            });

            const data = await response.json();
            if (data.success) {
                closeDayEditor();
                fetchRevenueData();
                showFlash('success', data.message || 'Registration fee updated successfully!');
            } else {
                showFlash('error', data.message || 'Failed to update fee');
            }
        } catch (error) {
            console.error('Failed to update fee:', error);
            showFlash('error', 'Failed to update fee');
        } finally {
            setSavingFee(false);
        }
    };

    const currentFeeLabel = revenueData && selectedYear === new Date().getFullYear()
        ? 'Current Fee (Today)'
        : `Current Fee (${selectedYear})`;

    const sortedHistory = [...history].sort((a, b) => {
        const dateDiff = historyDate(b.effective_date).localeCompare(historyDate(a.effective_date));
        return dateDiff !== 0 ? dateDiff : (b.id || 0) - (a.id || 0);
    });

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            {flashMessage && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                    onClick={() => setFlashMessage(null)}
                >
                    <div
                        className={`w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-2xl ${
                            flashMessage.type === 'success'
                                ? 'border-emerald-200'
                                : 'border-red-200'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                                flashMessage.type === 'success'
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : 'bg-red-100 text-red-600'
                            }`}
                        >
                            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {flashMessage.type === 'success' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                )}
                            </svg>
                        </div>
                        <p
                            className={`text-xl font-bold ${
                                flashMessage.type === 'success' ? 'text-emerald-800' : 'text-red-800'
                            }`}
                        >
                            {flashMessage.type === 'success' ? 'Success!' : 'Something went wrong'}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-gray-600">{flashMessage.text}</p>
                        <button
                            type="button"
                            onClick={() => setFlashMessage(null)}
                            className={`mt-6 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition ${
                                flashMessage.type === 'success'
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {showDayModal && selectedDate && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                    onClick={closeDayEditor}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-violet-100 bg-white p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                                Edit day fee
                            </p>
                            <h2 className="mt-1 text-xl font-bold text-gray-900">
                                {formatDisplayDate(selectedDate)}
                            </h2>
                            <p className="mt-2 text-sm text-gray-500">
                                Set the registration fee starting this day. It stays in effect until you change a later date.
                            </p>
                        </div>

                        <div className="mb-5 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-violet-50 px-4 py-3">
                                <p className="text-xs text-gray-500">Fee this day</p>
                                <p className="text-lg font-bold text-violet-700">
                                    {formatCurrency(selectedDayStats?.fee ?? newFee)}
                                </p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 px-4 py-3">
                                <p className="text-xs text-gray-500">Registrations</p>
                                <p className="text-lg font-bold text-emerald-700">
                                    {selectedDayStats?.count ?? 0}
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateFee} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Registration Fee *
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newFee}
                                    onChange={(e) => setNewFee(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:border-violet-500 focus:ring-2 focus:ring-violet-500"
                                    placeholder="100.00"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                    Reason (optional)
                                </label>
                                <input
                                    type="text"
                                    value={feeReason}
                                    onChange={(e) => setFeeReason(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 focus:border-violet-500 focus:ring-2 focus:ring-violet-500"
                                    placeholder="Fee adjustment"
                                />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={closeDayEditor}
                                    className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingFee}
                                    className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                                >
                                    {savingFee ? 'Saving...' : 'Save Fee'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
            <main className="min-h-0 flex-1 overflow-y-auto p-8 scrollbar-hide">
                <div>
                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-gray-900">Pet Registration Revenue</h1>
                        <p className="text-gray-500 mt-1">Click a calendar day to set the registration fee starting that date</p>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                        <div className="flex flex-wrap gap-4 items-end justify-between">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                                    className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                >
                                    {YEAR_OPTIONS.map((year) => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="bg-violet-50 px-6 py-3 rounded-xl">
                                <p className="text-sm text-gray-600">{currentFeeLabel}</p>
                                <p className="text-xl font-bold text-violet-700">
                                    {revenueData ? formatCurrency(revenueData.current_fee) : 'Loading...'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-2xl p-6 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-emerald-100 text-sm">
                                        {MONTH_NAMES[calendarMonth]} {selectedYear} Revenue
                                    </p>
                                    <p className="text-3xl font-bold">
                                        {revenueData ? formatCurrency(selectedMonthSummary.total_revenue) : 'Loading...'}
                                    </p>
                                    <p className="mt-1 text-sm text-emerald-100">
                                        {selectedMonthSummary.count} registration{selectedMonthSummary.count === 1 ? '' : 's'}
                                    </p>
                                </div>
                                <div className="w-16 h-16 bg-white/30 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div className="bg-navy rounded-xl p-6 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-violet-100 text-sm">Total Revenue {selectedYear}</p>
                                    <p className="text-3xl font-bold">
                                        {revenueData ? formatCurrency(revenueData.total_revenue) : 'Loading...'}
                                    </p>
                                </div>
                                <div className="w-16 h-16 bg-white/30 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Registration Fee Calendar</h2>
                            <p className="text-sm text-gray-500">
                                Click any day to set the fee starting that date. Example: June 9 at ₱100.
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
                                <div className="p-8 text-center">
                                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-violet-600" />
                                    <p className="mt-2 text-gray-500">Loading calendar...</p>
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
                                                        onClick={() => openDayEditor(date.date, date.fee)}
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
                                                            {formatCompactFee(date.fee)}
                                                        </span>
                                                        {date.count > 0 && (
                                                            <span className={`text-[10px] ${date.isToday && !date.fee_changed ? 'text-white/80' : 'text-emerald-700'}`}>
                                                                {date.count} reg{date.count === 1 ? '' : 's'}
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
                                            { color: 'bg-emerald-50 ring-emerald-100', label: 'Has registrations' },
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

                    {sortedHistory.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900">Fee Change History</h2>
                                <p className="text-sm text-gray-500 mt-1">Click a row to edit that date on the calendar</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Old Fee</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Fee</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {sortedHistory.map((entry) => {
                                            const dateStr = historyDate(entry.effective_date);
                                            return (
                                                <tr
                                                    key={entry.id}
                                                    className="cursor-pointer hover:bg-violet-50/60"
                                                    onClick={() => {
                                                        const [year, month] = dateStr.split('-').map(Number);
                                                        if (year) setSelectedYear(year);
                                                        if (month) setCalendarMonth(month - 1);
                                                        openDayEditor(dateStr, entry.new_amount);
                                                    }}
                                                    title="Edit this date"
                                                >
                                                    <td className="px-6 py-4 text-sm text-gray-900">
                                                        {formatDisplayDate(dateStr)}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">
                                                        {formatCurrency(entry.old_amount)}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-medium text-violet-600">
                                                        {formatCurrency(entry.new_amount)}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">
                                                        {entry.reason}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            </div>
        </div>
    );
}
