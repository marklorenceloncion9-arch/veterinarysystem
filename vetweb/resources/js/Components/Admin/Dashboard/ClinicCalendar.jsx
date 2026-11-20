import { Link } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Holidays from 'date-holidays';
import { Panel, STATUS_CHIPS, TYPE_LABELS } from './dashboardUi';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// Domingo ang una. Ang Biyernes, Sabado ug Domingo sirado.
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CLOSED_DAYS = [0, 5, 6]; // Sunday, Friday, Saturday (JS getDay)

const BLOCK_TYPES = [
    { value: 'full_day', label: 'Whole day' },
    { value: 'morning', label: 'Morning only' },
    { value: 'afternoon', label: 'Afternoon only' },
];

// Diri i-format ang local nga petsa (YYYY-MM-DD).
function formatLocalDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Diri himuon nga Date ang YYYY-MM-DD nga string.
function parseLocalDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Diri ang ngalan sa blocked nga bahin sa adlaw.
function blockLabel(type) {
    if (type === 'morning') return 'Morning off';
    if (type === 'afternoon') return 'Afternoon off';
    return 'Off all day';
}

// Diri ang calendar sa clinic. Makita ang gidaghanon sa booking matag adlaw ug pwede i-block ang adlaw.
export default function ClinicCalendar() {
    const todayStr = formatLocalDate(new Date());

    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [unavailableDates, setUnavailableDates] = useState([]);
    const [bookingDays, setBookingDays] = useState({});
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(todayStr);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [notice, setNotice] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState({ reason: '', type: 'full_day' });
    const [conflictStep, setConflictStep] = useState(false);
    const [conflictingAppointments, setConflictingAppointments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [modalError, setModalError] = useState('');

    // Diri ang Philippine holidays (mo-update sa kaugalingon matag tuig).
    const hd = useMemo(() => new Holidays('PH'), []);

    // Diri kuhaon ang holiday sa petsa (kung naa). Public ra ang giisip nga sirado.
    const getHoliday = useCallback((dateStr) => {
        const result = hd.isHoliday(dateStr);
        if (!result) return null;
        const list = Array.isArray(result) ? result : [result];
        const closed = list.find((item) => ['public', 'bank'].includes(item.type));
        return closed ? closed.name : null;
    }, [hd]);

    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;

    // Diri kuhaon ang blocked nga petsa ug ang mga booking sa bulan.
    const loadMonth = useCallback(async () => {
        setLoading(true);
        try {
            const [blocked, bookings] = await Promise.all([
                axios.get('/api/admin/vet-unavailable-dates', { params: { year, month: monthNumber } }),
                axios.get('/api/admin/calendar-bookings', { params: { year, month: monthNumber } }),
            ]);
            if (blocked.data.success) setUnavailableDates(blocked.data.unavailable_dates || []);
            if (bookings.data.success) setBookingDays(bookings.data.days || {});
        } catch (error) {
            console.error('Failed to load calendar:', error);
            setNotice({ tone: 'error', text: 'Could not load the calendar. Please refresh the page.' });
        } finally {
            setLoading(false);
        }
    }, [year, monthNumber]);

    useEffect(() => {
        loadMonth();
    }, [loadMonth]);

    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 5000);
        return () => clearTimeout(timer);
    }, [notice]);

    // Diri ang tanang adlaw sa bulan nga naay impormasyon.
    const days = useMemo(() => {
        const total = new Date(year, month.getMonth() + 1, 0).getDate();
        const offset = new Date(year, month.getMonth(), 1).getDay();
        const list = Array.from({ length: offset }, () => null);

        for (let day = 1; day <= total; day++) {
            const date = new Date(year, month.getMonth(), day);
            const dateStr = formatLocalDate(date);
            list.push({
                day,
                date: dateStr,
                isToday: dateStr === todayStr,
                isPast: dateStr < todayStr,
                isClosedDay: CLOSED_DAYS.includes(date.getDay()),
                holiday: getHoliday(dateStr),
                unavailable: unavailableDates.find((item) => item.date === dateStr) || null,
                count: bookingDays[dateStr]?.count || 0,
            });
        }

        return list;
    }, [year, month, todayStr, unavailableDates, bookingDays, getHoliday]);

    const maxCount = Math.max(1, ...days.filter(Boolean).map((day) => day.count));
    const monthBookings = days.filter(Boolean).reduce((sum, day) => sum + day.count, 0);
    const selectedDay = days.find((day) => day?.date === selected) || null;
    const selectedItems = selectedDay ? bookingDays[selectedDay.date]?.items || [] : [];

    const viewingCurrentMonth = year === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

    // Diri i-change ang bulan. Kung karon nga bulan, i-select ang karon nga adlaw.
    const goToMonth = (target) => {
        const next = new Date(target.getFullYear(), target.getMonth(), 1);
        setMonth(next);
        setConfirmOpen(false);
        const isCurrent = next.getFullYear() === new Date().getFullYear() && next.getMonth() === new Date().getMonth();
        setSelected(isCurrent ? todayStr : null);
    };

    // Diri i-select ang adlaw.
    const selectDay = (day) => {
        setSelected(day.date);
        setConfirmOpen(false);
    };

    // Diri ang hint sa adlaw kung i-hover.
    const dayStatus = (day) => {
        if (day.holiday) return { text: `Holiday: ${day.holiday}`, dot: 'bg-rose-500', detail: 'The clinic is closed.' };
        if (day.isClosedDay) return { text: 'Clinic closed', dot: 'bg-gray-400', detail: 'Closed every Friday, Saturday and Sunday.' };
        if (day.unavailable) {
            return {
                text: `Blocked: ${blockLabel(day.unavailable.type)}`,
                dot: 'bg-amber-500',
                detail: day.unavailable.reason || 'No reason given.',
            };
        }
        return { text: 'Open for bookings', dot: 'bg-success', detail: day.isPast ? 'This date has passed.' : 'You can block this day if the vet is away.' };
    };

    // Diri ablihan ang modal para mag-block og adlaw.
    const openBlockModal = () => {
        setModalData({ reason: '', type: 'full_day' });
        setConflictStep(false);
        setConflictingAppointments([]);
        setModalError('');
        setShowModal(true);
    };

    // Diri sirado ang modal.
    const closeModal = () => {
        setShowModal(false);
        setConflictStep(false);
        setConflictingAppointments([]);
        setModalError('');
    };

    // Diri i-save ang blocked nga petsa.
    const saveBlock = async (cancelConflicting) => {
        setSubmitting(true);
        setModalError('');
        const conflictCount = conflictingAppointments.length;

        try {
            const response = await axios.post('/api/admin/vet-unavailable-dates', {
                unavailable_date: selected,
                reason: modalData.reason,
                type: modalData.type,
                cancel_conflicting: cancelConflicting,
            });

            if (response.data.success) {
                let text = response.data.message || 'Date blocked.';
                if (!cancelConflicting && conflictCount > 0) {
                    text = `Date blocked. ${conflictCount} existing booking${conflictCount === 1 ? ' was' : 's were'} kept and new bookings are closed.`;
                } else if (cancelConflicting && !(response.data.cancelled_appointments > 0)) {
                    text = 'Date blocked. No bookings needed to be cancelled.';
                }

                closeModal();
                setNotice({ tone: 'success', text });
                loadMonth();
            }
        } catch (error) {
            console.error('Failed to block date:', error);
            setModalError(error.response?.data?.error || 'Could not block this date. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Diri susihon una kung naay booking nga maapektuhan.
    const handleContinue = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setModalError('');

        try {
            const response = await axios.get('/api/admin/vet-unavailable-dates/conflicts', {
                params: { date: selected, type: modalData.type },
            });

            if (response.data.success && response.data.count > 0) {
                setConflictingAppointments(response.data.appointments);
                setConflictStep(true);
                setSubmitting(false);
                return;
            }
        } catch (error) {
            console.error('Failed to check conflicts:', error);
            setModalError('Could not check existing bookings. Please try again.');
            setSubmitting(false);
            return;
        }

        setSubmitting(false);
        await saveBlock(false);
    };

    // Diri ablihan balik ang blocked nga adlaw.
    const reopenDay = async (dateStr) => {
        setSubmitting(true);
        try {
            await axios.delete(`/api/admin/vet-unavailable-dates/${dateStr}`);
            setConfirmOpen(false);
            setNotice({ tone: 'success', text: `${parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} is open for bookings again.` });
            loadMonth();
        } catch (error) {
            console.error('Failed to reopen date:', error);
            setNotice({ tone: 'error', text: 'Could not open this date again. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    const status = selectedDay ? dayStatus(selectedDay) : null;
    const canBlock = selectedDay && !selectedDay.isClosedDay && !selectedDay.holiday && !selectedDay.unavailable && !selectedDay.isPast;

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Month grid */}
            <Panel className="xl:col-span-2">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold text-navy">
                            {MONTH_NAMES[month.getMonth()]} {year}
                        </h2>
                        <p className="text-sm text-muted">
                            {loading ? 'Loading…' : `${monthBookings} booking${monthBookings === 1 ? '' : 's'} this month`}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {!viewingCurrentMonth && (
                            <button
                                type="button"
                                onClick={() => goToMonth(new Date())}
                                className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-navy transition hover:border-navy/40 hover:bg-canvas"
                            >
                                Today
                            </button>
                        )}
                        <div className="inline-flex overflow-hidden rounded-md border border-line">
                            <button
                                type="button"
                                onClick={() => goToMonth(new Date(year, month.getMonth() - 1, 1))}
                                className="px-2.5 py-1.5 text-navy transition hover:bg-canvas"
                                aria-label="Previous month"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => goToMonth(new Date(year, month.getMonth() + 1, 1))}
                                className="border-l border-line px-2.5 py-1.5 text-navy transition hover:bg-canvas"
                                aria-label="Next month"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className={`border-l border-t border-line transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-7">
                        {WEEK_DAYS.map((name, index) => (
                            <div
                                key={name}
                                className={`border-b border-r border-line bg-canvas px-2 py-2 text-xs font-semibold uppercase tracking-wide ${
                                    CLOSED_DAYS.includes(index) ? 'text-red-700' : 'text-navy'
                                }`}
                            >
                                {name}
                            </div>
                        ))}

                        {days.map((day, index) => {
                            if (!day) {
                                return <div key={`empty-${index}`} className="min-h-[5.5rem] border-b border-r border-line bg-canvas/50" />;
                            }

                            const column = index % 7;
                            const openUpwards = Math.floor(index / 7) >= Math.ceil(days.length / 7) - 2;
                            const isSelected = day.date === selected;
                            const dayInfo = dayStatus(day);
                            const tag = day.holiday
                                ? day.holiday
                                : day.isClosedDay
                                    ? 'Closed'
                                    : day.unavailable
                                        ? blockLabel(day.unavailable.type)
                                        : null;
                            const tagTone = day.holiday
                                ? 'text-rose-800 font-semibold'
                                : day.isClosedDay
                                    ? 'text-red-700 font-semibold'
                                    : day.unavailable
                                        ? 'text-amber-900 font-semibold'
                                        : 'text-muted';

                            return (
                                <button
                                    key={day.date}
                                    type="button"
                                    onClick={() => selectDay(day)}
                                    aria-pressed={isSelected}
                                    aria-label={`${parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. ${dayInfo.text}. ${day.count} bookings.`}
                                    className={`group relative flex min-h-[5.5rem] flex-col border-b border-r border-line p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                                        day.holiday
                                            ? 'bg-rose-100 hover:bg-rose-200'
                                            : day.isClosedDay
                                                ? 'bg-red-100 hover:bg-red-200'
                                                : day.unavailable
                                                    ? 'bg-amber-100 hover:bg-amber-200'
                                                    : 'bg-white hover:bg-teal/5'
                                    } ${isSelected ? 'z-10 ring-2 ring-inset ring-navy' : ''}`}
                                >
                                    <span className="flex items-start justify-between">
                                        <span
                                            className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${
                                                day.isToday ? 'bg-navy text-white' : day.isPast ? 'text-muted' : 'text-navy'
                                            }`}
                                        >
                                            {day.day}
                                        </span>
                                        {day.count > 0 && (
                                            <span className="text-xs font-semibold tabular-nums text-teal-dark">
                                                {day.count}
                                                <span className="ml-0.5 font-normal text-muted">{day.count === 1 ? 'visit' : 'visits'}</span>
                                            </span>
                                        )}
                                    </span>

                                    {tag && (
                                        <span className={`mt-1 line-clamp-2 text-[11px] leading-tight ${tagTone}`}>{tag}</span>
                                    )}

                                    {day.count > 0 && (
                                        <span className="mt-auto block h-1 w-full overflow-hidden rounded-full bg-line/70">
                                            <span
                                                className="block h-full rounded-full bg-teal"
                                                style={{ width: `${Math.max(12, (day.count / maxCount) * 100)}%` }}
                                            />
                                        </span>
                                    )}

                                    {/* Hover card */}
                                    <span
                                        className={`pointer-events-none absolute z-30 hidden w-56 rounded-md border border-line bg-white p-3 text-left shadow-lg group-hover:block ${
                                            openUpwards ? 'bottom-full mb-1' : 'top-full mt-1'
                                        } ${
                                            column <= 1 ? 'left-0' : column >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                                        }`}
                                    >
                                        <span className="block text-xs text-muted">
                                            {parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                        </span>
                                        <span className="mt-1 flex items-center gap-2 text-sm font-semibold text-navy">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${dayInfo.dot}`} />
                                            {dayInfo.text}
                                        </span>
                                        <span className="mt-1 block text-xs text-muted">{dayInfo.detail}</span>
                                        <span className="mt-2 block border-t border-line pt-2 text-xs text-ink">
                                            {day.count > 0 ? `${day.count} booking${day.count === 1 ? '' : 's'}. Click to see them.` : 'No bookings'}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Legend */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-red-300 bg-red-100" />
                        Closed (Sun, Fri, Sat)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-rose-300 bg-rose-100" />
                        Holiday
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-amber-300 bg-amber-100" />
                        Blocked by you
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-1 w-5 rounded-full bg-teal" />
                        Longer bar means more bookings
                    </span>
                </div>
            </Panel>

            {/* Selected day */}
            <div className="flex flex-col gap-6">
                <Panel
                    title={selectedDay ? parseLocalDate(selectedDay.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Pick a day'}
                    subtitle={selectedDay ? undefined : 'Click a date to see its bookings and availability.'}
                >
                    {notice && (
                        <div
                            role="status"
                            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
                                notice.tone === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-red-200 bg-red-50 text-red-800'
                            }`}
                        >
                            {notice.text}
                        </div>
                    )}

                    {selectedDay && status ? (
                        <>
                            <div className="flex items-start gap-2.5">
                                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
                                <div>
                                    <p className="text-sm font-semibold text-navy">{status.text}</p>
                                    <p className="text-sm text-muted">{status.detail}</p>
                                </div>
                            </div>

                            {canBlock && (
                                <button
                                    type="button"
                                    onClick={openBlockModal}
                                    className="mt-4 w-full rounded-md border border-navy px-3 py-2 text-sm font-semibold text-navy transition hover:bg-navy hover:text-white"
                                >
                                    Mark as unavailable
                                </button>
                            )}

                            {selectedDay.unavailable && !confirmOpen && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmOpen(true)}
                                    className="mt-4 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-50"
                                >
                                    Open this day again
                                </button>
                            )}

                            {selectedDay.unavailable && confirmOpen && (
                                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-sm text-amber-900">Clients will be able to book this day again.</p>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() => reopenDay(selectedDay.date)}
                                            className="flex-1 rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50"
                                        >
                                            {submitting ? 'Opening…' : 'Yes, open it'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmOpen(false)}
                                            className="flex-1 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-canvas"
                                        >
                                            Keep blocked
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-5 border-t border-line pt-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-navy">Bookings</h3>
                                    <span className="text-xs tabular-nums text-muted">{selectedItems.length}</span>
                                </div>

                                {selectedItems.length === 0 ? (
                                    <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
                                        No bookings on this day.
                                    </p>
                                ) : (
                                    <ul className="scrollbar-hide -mx-2 max-h-72 divide-y divide-line overflow-y-auto">
                                        {selectedItems.map((item) => (
                                            <li key={item.id}>
                                                <Link
                                                    href={`/admin/appointments/${item.id}`}
                                                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-canvas"
                                                >
                                                    <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-navy">{item.time}</span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium text-ink">{item.pet}</span>
                                                        <span className="block truncate text-xs text-muted">
                                                            {item.client} · {TYPE_LABELS[item.type] || 'Visit'}
                                                        </span>
                                                    </span>
                                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STATUS_CHIPS[item.status] || 'bg-gray-100 text-gray-700'}`}>
                                                        {item.status}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    ) : null}
                </Panel>

                <Panel title="Blocked this month" subtitle="Click one to see it in the calendar.">
                    {unavailableDates.length === 0 ? (
                        <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
                            Nothing blocked in {MONTH_NAMES[month.getMonth()]}.
                        </p>
                    ) : (
                        <ul className="scrollbar-hide -mx-2 max-h-56 divide-y divide-line overflow-y-auto">
                            {unavailableDates.map((item) => (
                                <li key={item.date}>
                                    <button
                                        type="button"
                                        onClick={() => { setSelected(item.date); setConfirmOpen(false); }}
                                        className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-canvas ${
                                            selected === item.date ? 'bg-canvas' : ''
                                        }`}
                                    >
                                        <span>
                                            <span className="block text-sm font-medium text-ink">
                                                {parseLocalDate(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="block text-xs text-muted">
                                                {blockLabel(item.type)}{item.reason ? ` · ${item.reason}` : ''}
                                            </span>
                                        </span>
                                        <svg className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            {/* Block modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-2xl">
                        {!conflictStep ? (
                            <form onSubmit={handleContinue}>
                                <h3 className="text-lg font-semibold text-navy">Mark as unavailable</h3>
                                <p className="mb-5 mt-0.5 text-sm text-muted">
                                    {parseLocalDate(selected).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>

                                <fieldset>
                                    <legend className="mb-1.5 text-sm font-medium text-ink">Which part of the day?</legend>
                                    <div className="grid grid-cols-3 gap-2">
                                        {BLOCK_TYPES.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setModalData({ ...modalData, type: option.value })}
                                                aria-pressed={modalData.type === option.value}
                                                className={`rounded-md border px-2 py-2 text-sm font-medium transition ${
                                                    modalData.type === option.value
                                                        ? 'border-navy bg-navy text-white'
                                                        : 'border-line text-ink hover:border-navy/40 hover:bg-canvas'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>

                                <div className="mt-4">
                                    <label htmlFor="block-reason" className="mb-1.5 block text-sm font-medium text-ink">
                                        Reason <span className="font-normal text-muted">(optional)</span>
                                    </label>
                                    <input
                                        id="block-reason"
                                        type="text"
                                        value={modalData.reason}
                                        onChange={(event) => setModalData({ ...modalData, reason: event.target.value })}
                                        placeholder="For example: training, vacation"
                                        className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
                                    />
                                </div>

                                {modalError && <p className="mt-3 text-sm text-danger">{modalError}</p>}

                                <div className="mt-6 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="flex-1 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-1 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50"
                                    >
                                        {submitting ? 'Checking…' : 'Continue'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div>
                                <h3 className="text-lg font-semibold text-navy">This day already has bookings</h3>
                                <p className="mt-1 text-sm text-muted">
                                    {conflictingAppointments.length} booking{conflictingAppointments.length === 1 ? ' is' : 's are'} already set for this day.
                                </p>

                                <ul className="mt-4 max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line">
                                    {conflictingAppointments.map((appointment) => (
                                        <li key={appointment.id} className="px-3 py-2 text-sm">
                                            <p className="font-medium text-ink">{appointment.pet_name}</p>
                                            <p className="text-xs text-muted">
                                                {appointment.client_name} · {appointment.booking_time_label} · <span className="capitalize">{appointment.status}</span>
                                            </p>
                                        </li>
                                    ))}
                                </ul>

                                <p className="mt-4 text-sm text-ink">
                                    Keep them, or cancel them and tell the owners?
                                </p>

                                {modalError && <p className="mt-3 text-sm text-danger">{modalError}</p>}

                                <div className="mt-5 flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={() => saveBlock(false)}
                                        disabled={submitting}
                                        className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-50"
                                    >
                                        Keep bookings, block new ones only
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => saveBlock(true)}
                                        disabled={submitting}
                                        className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {submitting ? 'Working…' : 'Cancel bookings and notify owners'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConflictStep(false)}
                                        disabled={submitting}
                                        className="w-full px-4 py-2 text-sm font-medium text-muted transition hover:text-navy disabled:opacity-50"
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
