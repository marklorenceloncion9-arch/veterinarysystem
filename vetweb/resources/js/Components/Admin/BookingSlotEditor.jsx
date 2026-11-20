import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const MAX_HOUR_CAPACITY = 50;

// Diri i-preview ang pagbahin sa total slots matag oras.
function splitPreview(total, hourCount) {
    const hours = Math.max(1, Number(hourCount) || 1);
    const safeTotal = Math.max(0, Number(total) || 0);
    const base = Math.floor(safeTotal / hours);
    const remainder = safeTotal % hours;
    if (remainder === 0) {
        return `${base} per hour`;
    }
    return `${base + 1} in the first ${remainder} hour${remainder === 1 ? '' : 's'}, then ${base}`;
}

// Diri bahinon ang total capacity sa tanang oras.
function splitAcrossHours(total, slots) {
    const count = Math.max(1, slots.length);
    const safeTotal = Math.max(0, Number(total) || 0);
    const base = Math.floor(safeTotal / count);
    const remainder = safeTotal % count;

    return slots.map((slot, index) => {
        const capacity = Math.min(MAX_HOUR_CAPACITY, base + (index < remainder ? 1 : 0));
        const booked = Number(slot.booked || 0);
        const remaining = Math.max(0, capacity - booked);
        return {
            ...slot,
            capacity,
            remaining,
            fully_booked: remaining <= 0,
        };
    });
}

// Diri i-apply ang bag-ong capacities sa slots matag oras.
function applyCapacities(slots, nextCapacities) {
    const byTime = {};
    (nextCapacities || []).forEach((slot) => {
        if (slot?.time) byTime[slot.time] = Number(slot.capacity);
    });

    return slots.map((slot) => {
        if (!(slot.time in byTime)) return slot;
        const capacity = Math.max(0, Math.min(MAX_HOUR_CAPACITY, byTime[slot.time]));
        const booked = Number(slot.booked || 0);
        const remaining = Math.max(0, capacity - booked);
        return {
            ...slot,
            capacity,
            remaining,
            fully_booked: remaining <= 0,
        };
    });
}

// Diri i-format ang petsa ug oras sa history change.
function formatWhen(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

// Diri i-format ang petsa nga label.
function formatDateLabel(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

// Diri ang editor sa booking slots matag adlaw.
export default function BookingSlotEditor({ open, onClose }) {
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [savedSlots, setSavedSlots] = useState([]);
    const [slots, setSlots] = useState([]);
    const [history, setHistory] = useState([]);
    const [defaultCapacity, setDefaultCapacity] = useState(5);
    const [hourCount, setHourCount] = useState(8);
    const [maxDayCapacity, setMaxDayCapacity] = useState(400);
    const [allCapacity, setAllCapacity] = useState(40);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [panel, setPanel] = useState('view');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const skipNextDateLoad = useRef(false);

    const dayTotal = useMemo(
        () => slots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0),
        [slots]
    );
    const remainingTotal = useMemo(
        () => slots.reduce((sum, slot) => sum + Number(slot.remaining || 0), 0),
        [slots]
    );
    const isDirty = useMemo(
        () => JSON.stringify(slots.map((slot) => [slot.time, Number(slot.capacity)])) !==
            JSON.stringify(savedSlots.map((slot) => [slot.time, Number(slot.capacity)])),
        [slots, savedSlots]
    );

    // Diri i-apply ang slot data gikan sa server sa state.
    const applyPayload = useCallback((data) => {
        const nextSlots = data.slots || [];
        setSlots(nextSlots);
        setSavedSlots(nextSlots);
        setHistory(data.history || []);
        setDefaultCapacity(data.default_capacity || 5);
        setHourCount(data.hour_count || nextSlots.length || 8);
        setMaxDayCapacity(data.max_day_capacity || 400);
        const currentTotal = nextSlots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0);
        setAllCapacity(currentTotal || ((data.default_capacity || 5) * (data.hour_count || 8)));
    }, []);

    // Diri kuhaon ang booking slots sa napili nga petsa.
    const loadSlots = useCallback(async (nextDate) => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const response = await axios.get('/api/admin/booking-slot-capacities', {
                params: { date: nextDate },
            });
            if (response.data?.success) {
                applyPayload(response.data);
            } else {
                setError(response.data?.error || 'Failed to load slots');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load slots');
        } finally {
            setLoading(false);
        }
    }, [applyPayload]);

    useEffect(() => {
        if (!open) {
            setPanel('view');
            return;
        }
        if (skipNextDateLoad.current) {
            skipNextDateLoad.current = false;
            return;
        }
        loadSlots(date);
    }, [open, date, loadSlots]);

    // Diri usbon ang capacity sa usa ka oras.
    const updateHour = (time, capacity) => {
        const nextCapacity = Math.max(0, Math.min(MAX_HOUR_CAPACITY, capacity));
        setSlots((current) => current.map((slot) => {
            if (slot.time !== time) return slot;
            const booked = Number(slot.booked || 0);
            const remaining = Math.max(0, nextCapacity - booked);
            return {
                ...slot,
                capacity: nextCapacity,
                remaining,
                fully_booked: remaining <= 0,
            };
        }));
        setNotice('');
    };

    // Diri bahinon ang total capacity sa draft slots.
    const splitDraft = () => {
        setSlots((current) => splitAcrossHours(allCapacity, current));
        setNotice(`Split ${allCapacity} across ${hourCount} hours. Save to keep this.`);
        setError('');
    };

    // Diri ibalik ang slots sa na-save nga values.
    const discardDraft = () => {
        setSlots(savedSlots);
        const currentTotal = savedSlots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0);
        setAllCapacity(currentTotal);
        setNotice('');
        setError('');
    };

    // Diri i-save ang booking slots sa server.
    const saveSlots = async () => {
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const response = await axios.put('/api/admin/booking-slot-capacities', {
                date,
                slots: slots.map((slot) => ({
                    time: slot.time,
                    capacity: Number(slot.capacity || 0),
                })),
            });
            if (response.data?.success) {
                applyPayload(response.data);
                setNotice('Slot capacities saved.');
            } else {
                setError(response.data?.error || 'Failed to save slots');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save slots');
        } finally {
            setSaving(false);
        }
    };

    // Diri isira ang editor, mangutana kung naay wala na-save.
    const handleClose = () => {
        if (panel === 'edit' && isDirty && !window.confirm('Discard unsaved changes and close?')) {
            return;
        }
        setPanel('view');
        onClose();
    };

    // Diri mo-switch sa edit panel.
    const startEditing = () => {
        setNotice('');
        setError('');
        setPanel('edit');
    };

    // Diri mo-switch sa history panel.
    const startHistory = () => {
        setNotice('');
        setError('');
        setPanel('history');
    };

    // Diri mobalik sa view panel.
    const backToView = () => {
        if (panel === 'edit' && isDirty && !window.confirm('Discard unsaved changes?')) {
            return;
        }
        if (panel === 'edit') {
            discardDraft();
        }
        setPanel('view');
    };

    // Diri i-edit usab ang slots gikan sa history change.
    const editHistory = async (change) => {
        const nextDate = change.date;
        if (!nextDate) return;
        setPanel('edit');

        // Diri i-apply ang snapshot sa history ngadto sa draft.
        const applySnapshot = (baseSlots) => {
            const nextSlots = applyCapacities(baseSlots, change.after_slots);
            setSlots(nextSlots);
            setAllCapacity(nextSlots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0));
            setNotice(`Loaded ${formatDateLabel(nextDate)} from recent changes. Save to keep edits.`);
            setError('');
        };

        if (nextDate === date && slots.length > 0) {
            applySnapshot(savedSlots.length ? savedSlots : slots);
            return;
        }

        skipNextDateLoad.current = true;
        setDate(nextDate);
        setLoading(true);
        try {
            const response = await axios.get('/api/admin/booking-slot-capacities', {
                params: { date: nextDate },
            });
            if (response.data?.success) {
                applyPayload(response.data);
                applySnapshot(response.data.slots || []);
            } else {
                setError(response.data?.error || 'Failed to load that date');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load that date');
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    const remainingList = (
        loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading slots…</p>
        ) : (
            <div className="space-y-2">
                {slots.map((slot) => {
                    const remaining = Number(slot.remaining ?? 0);
                    const fullyBooked = Boolean(slot.fully_booked) || remaining <= 0;
                    return (
                        <div
                            key={slot.time}
                            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
                        >
                            <div>
                                <p className="font-semibold text-navy">{slot.label}</p>
                                <p className="text-xs text-gray-500">
                                    {slot.booked || 0} booked · {slot.capacity || 0} capacity
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {fullyBooked ? (
                                    <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                                        Fully booked
                                    </span>
                                ) : (
                                    <span className="text-right">
                                        <span className="block text-lg font-bold text-navy">{remaining}</span>
                                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">left</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        )
    );

    const historyList = history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">
            No saved changes yet. Save a day to start the history.
        </p>
    ) : (
        <div className="space-y-2">
            {history.map((change) => (
                <div key={change.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-navy">{formatDateLabel(change.date)}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                                {change.changed_by_name} · {formatWhen(change.created_at)}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => editHistory(change)}
                            className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-gray-50"
                        >
                            Edit
                        </button>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{change.summary}</p>
                </div>
            ))}
        </div>
    );

    const panelTitle = panel === 'edit' ? 'Edit slots' : panel === 'history' ? 'History' : 'Slots';

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 px-4">
            <div className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl ${panel === 'edit' ? 'max-w-2xl' : 'max-w-xl'}`}>
                <div className="flex items-start justify-between bg-navy px-5 py-4">
                    <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">Clinic</p>
                        <h2 className="mt-1 text-xl font-bold text-white">{panelTitle}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {panel !== 'view' ? (
                            <button
                                type="button"
                                onClick={backToView}
                                className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
                            >
                                Back
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={handleClose}
                            className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {panel === 'edit' ? (
                    <>
                        <div className="min-h-0 flex-1 overflow-auto p-5 scrollbar-hide">
                            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Date</span>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => {
                                            if (isDirty && !window.confirm('Discard unsaved changes and switch date?')) {
                                                return;
                                            }
                                            setDate(e.target.value);
                                        }}
                                        className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    />
                                </label>
                                <div>
                                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Total for this day</span>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            max={maxDayCapacity}
                                            value={allCapacity}
                                            onChange={(e) => setAllCapacity(Number(e.target.value))}
                                            className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                        <button
                                            type="button"
                                            disabled={saving || loading}
                                            onClick={splitDraft}
                                            className="rounded-xl border border-teal/20 bg-teal/10 px-3 py-2 text-sm font-semibold text-teal hover:bg-teal/15 disabled:opacity-50"
                                        >
                                            Split across hours
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-xs text-gray-500">
                                        {allCapacity || 0} slots ÷ {hourCount} hours = {splitPreview(allCapacity, hourCount)}
                                    </p>
                                </div>
                            </div>

                            <p className="mb-3 text-xs text-gray-500">
                                Draft total is {dayTotal}. Split and +/- stay on this screen until you save.
                                Default is {defaultCapacity} per hour if nothing is set yet.
                            </p>

                            {error ? (
                                <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                            ) : null}
                            {notice ? (
                                <p className="mb-3 rounded-xl border border-teal/20 bg-teal/10 px-3 py-2 text-sm text-teal">{notice}</p>
                            ) : null}

                            {loading ? (
                                <p className="py-8 text-center text-sm text-gray-500">Loading slots…</p>
                            ) : (
                                <div className="space-y-2">
                                    {slots.map((slot) => {
                                        const remaining = Number(slot.remaining ?? 0);
                                        const fullyBooked = Boolean(slot.fully_booked) || remaining <= 0;
                                        return (
                                            <div
                                                key={slot.time}
                                                className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
                                            >
                                                <div>
                                                    <p className="font-semibold text-navy">{slot.label}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {slot.booked || 0} booked · {remaining} left
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {fullyBooked ? (
                                                        <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                                                            Fully booked
                                                        </span>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        disabled={saving || Number(slot.capacity) <= 0}
                                                        onClick={() => updateHour(slot.time, Number(slot.capacity) - 1)}
                                                        className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-lg font-bold text-navy disabled:opacity-40"
                                                    >
                                                        −
                                                    </button>
                                                    <span className="w-8 text-center text-sm font-bold text-navy">{slot.capacity}</span>
                                                    <button
                                                        type="button"
                                                        disabled={saving || Number(slot.capacity) >= MAX_HOUR_CAPACITY}
                                                        onClick={() => updateHour(slot.time, Number(slot.capacity) + 1)}
                                                        className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-lg font-bold text-navy disabled:opacity-40"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-white px-5 py-3">
                            <p className="text-xs text-gray-500">
                                {isDirty ? 'Unsaved changes on this day.' : 'All changes on this day are saved.'}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={saving || !isDirty}
                                    onClick={discardDraft}
                                    className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                >
                                    Discard
                                </button>
                                <button
                                    type="button"
                                    disabled={saving || loading || !isDirty}
                                    onClick={saveSlots}
                                    className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : panel === 'history' ? (
                    <>
                        <div className="min-h-0 flex-1 overflow-auto p-5 scrollbar-hide">
                            <p className="mb-3 text-xs text-gray-500">Open a change to edit that day, then save.</p>
                            {historyList}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-white px-5 py-3">
                            <button
                                type="button"
                                onClick={backToView}
                                className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                Back
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="min-h-0 flex-1 overflow-auto p-5 scrollbar-hide">
                            <label className="mb-4 block">
                                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Date</span>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                />
                            </label>

                            <div className="mb-4 grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-teal/20 bg-teal/10 px-4 py-3">
                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-teal">Remaining</p>
                                    <p className="mt-1 text-2xl font-bold text-navy">
                                        {loading ? '…' : remainingTotal}
                                        <span className="ml-1 text-sm font-semibold text-gray-500">left</span>
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-gray-400">Total</p>
                                    <p className="mt-1 text-2xl font-bold text-navy">
                                        {loading ? '…' : dayTotal}
                                        <span className="ml-1 text-sm font-semibold text-gray-500">slots</span>
                                    </p>
                                </div>
                            </div>

                            {error ? (
                                <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                            ) : null}

                            {remainingList}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-white px-5 py-3">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={startHistory}
                                className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                History
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={startEditing}
                                className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50"
                            >
                                Edit slots
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
