import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import MonthNavigator, { currentMonthValue } from '@/Components/Admin/MonthNavigator';
import Tabs from '@/Components/Ui/Tabs';

const VIEW_TABS = {
    ongoing: 'ongoing',
    completed: 'completed',
};

const VIEW_TAB_OPTIONS = [
    { key: VIEW_TABS.ongoing, label: 'Ongoing' },
    { key: VIEW_TABS.completed, label: 'Completed' },
];

const TYPE_FILTERS = {
    all: 'all',
    walk_in: 'walk_in',
    appointment: 'appointment',
};

const TYPE_FILTER_OPTIONS = [
    { key: TYPE_FILTERS.all, label: 'All' },
    { key: TYPE_FILTERS.walk_in, label: 'Walk-in' },
    { key: TYPE_FILTERS.appointment, label: 'Appointment' },
];

const SUMMARY_CARDS = [
    {
        key: 'total_completed',
        label: 'Completed',
        hint: 'This month',
        icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        accent: 'border-l-emerald-500',
        iconClass: 'text-emerald-600 bg-emerald-50',
    },
    {
        key: 'walk_ins',
        label: 'Walk-ins',
        hint: 'Completed walk-ins',
        icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
        accent: 'border-l-amber-500',
        iconClass: 'text-amber-600 bg-amber-50',
    },
    {
        key: 'appointments',
        label: 'Appointments',
        hint: 'Scheduled visits',
        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        accent: 'border-l-violet-500',
        iconClass: 'text-violet-600 bg-violet-50',
    },
];

const ONGOING_STAT_CARDS = [
    {
        key: 'total',
        label: 'Ongoing treatments',
        hint: 'Active rows in the table below',
        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        accent: 'border-l-violet-500',
        iconClass: 'text-violet-600 bg-violet-50',
    },
    {
        key: 'ready',
        label: 'Ready to complete',
        hint: 'Inventory recorded — awaiting deduction',
        icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
        accent: 'border-l-sky-500',
        iconClass: 'text-sky-600 bg-sky-50',
    },
    {
        key: 'needs_inventory',
        label: 'Needs inventory',
        hint: 'Still missing medicine records',
        icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
        accent: 'border-l-amber-500',
        iconClass: 'text-amber-600 bg-amber-50',
    },
];

// Diri ang card sa stat sa service history.
function StatCard({ label, hint, value, icon, accent, iconClass }) {
    return (
        <div
            className={`flex items-center gap-4 rounded-xl border border-slate-200/90 border-l-4 bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${accent}`}
        >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={icon} />
                </svg>
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
                {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
            </div>
        </div>
    );
}

// Diri himuon Title Case ang text.
function toTitleCase(value) {
    if (!value || typeof value !== 'string') return value || '';
    return value
        .trim()
        .split(/\s+/)
        .map((word) => {
            if (!word) return word;
            if (word.toLowerCase() === 'dr.' || word.toLowerCase() === 'doc.') {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

// Diri kuhaon ang ngalan nga naka-Title Case o fallback.
function displayName(value, fallback = '—') {
    const formatted = toTitleCase(value);
    return formatted || fallback;
}

// Diri kuhaon ang sugod ug katapusan sa bulan.
function getMonthRange(monthValue) {
    if (!monthValue) {
        return { from: '', to: '' };
    }

    const [year, month] = monthValue.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();

    return {
        from: `${monthValue}-01`,
        to: `${monthValue}-${String(lastDay).padStart(2, '0')}`,
    };
}

// Diri himuon ang label sa bulan.
function formatMonthLabel(monthValue) {
    if (!monthValue) return 'All months';

    const [year, month] = monthValue.split('-').map(Number);
    const date = new Date(year, month - 1, 1);

    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Diri ang badge sa klase (walk-in o booking).
function TypeBadge({ label }) {
    const isWalkIn = String(label || '').toLowerCase().includes('walk');
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                isWalkIn
                    ? 'bg-amber-50 text-amber-800 ring-amber-200/80'
                    : 'bg-sky-50 text-sky-800 ring-sky-200/80'
            }`}
        >
            {label}
        </span>
    );
}

// Diri ang pill sa status.
function StatusPill({ label = 'Awaiting completion' }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200/80">
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
            </span>
            {label}
        </span>
    );
}

// Diri ang chip sa service.
function ServiceChip({ label }) {
    return (
        <span className="inline-flex max-w-[12rem] truncate rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200/70">
            {label}
        </span>
    );
}

// Diri ang avatar sa hayop nga initial.
function PetAvatar({ name }) {
    const initial = (name || '?').charAt(0).toUpperCase();
    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-violet-50 text-xs font-bold text-violet-700 ring-1 ring-violet-200/60">
            {initial}
        </span>
    );
}

// Diri ang icon sa view.
function ViewIcon({ className = 'h-4 w-4' }) {
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

// Diri i-format ang oras para ipakita.
function formatDisplayTime(timeString) {
    if (!timeString) return '—';
    try {
        const timeOnly = String(timeString).split(':').slice(0, 2).join(':');
        const timeToFormat = new Date(`2000-01-01T${timeOnly}`);
        if (Number.isNaN(timeToFormat.getTime())) return timeString;
        return timeToFormat.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
        return timeString;
    }
}

// Diri i-convert ang oras ngadto sa minutes.
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = String(timeStr).split(':').map(Number);
    return (hours * 60) + minutes;
}

// Diri i-convert ang minutes ngadto sa label sa oras.
function minutesToTimeLabel(totalMinutes) {
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const date = new Date();
    date.setHours(hours24, minutes);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

// Diri i-format ang range sa oras sa booking.
function formatBookingTimeRange(timeStr, durationMinutes = 10) {
    if (!timeStr) return '—';
    const duration = durationMinutes > 0 ? durationMinutes : 10;
    const start = formatDisplayTime(timeStr);
    const end = minutesToTimeLabel(timeToMinutes(timeStr) + duration);
    return `${start} – ${end}`;
}

// Diri i-format ang gitas-on sa oras.
function formatDuration(minutes) {
    const value = minutes > 0 ? minutes : 10;
    if (value < 60) return `${value} min`;
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

// Diri i-format ang quantity nga value.
function formatQuantityValue(value, maxDecimals = 3) {
    if (value == null || value === '') return null;
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    if (Math.abs(num % 1) < 1e-9) return String(Math.round(num));
    return Number(num.toFixed(maxDecimals)).toString();
}

// Diri i-format ang planned nga quantity.
function formatPlannedQuantity(item) {
    if (item.quantity_display) return item.quantity_display;

    if (item.is_box) {
        const qty = formatQuantityValue(item.quantity_used);
        return qty != null ? `${qty} items` : '—';
    }

    if (item.is_vial) {
        const ml = item.dosage_ml ?? item.quantity_used;
        const qty = formatQuantityValue(ml, 2);
        return qty != null ? `${qty} ml` : '—';
    }

    const qty = formatQuantityValue(item.quantity_used);
    const unit = item.unit_name || 'units';
    return qty != null ? `${qty} ${unit}` : '—';
}

// Diri kuhaon ang mga hayop nga naka-book.
function getBookedPets(appointment) {
    if (appointment?.booked_pets?.length) {
        return appointment.booked_pets;
    }

    if (appointment?.animal) {
        const services = appointment.services?.length
            ? appointment.services
            : [appointment.service].filter(Boolean);

        return [{
            id: appointment.animal.id,
            pet_name: appointment.animal.pet_name,
            species: appointment.animal.species,
            breed: appointment.animal.breed,
            weight: appointment.animal.weight,
            services,
            planned_items: appointment.planned_items || [],
        }];
    }

    return [];
}

// Diri i-check kung kulang og timbang ang hayop para sa vial.
function petHasVialWeightIssue(pet) {
    const hasVial = (pet.planned_items || []).some((item) => item.is_vial);
    return hasVial && (!pet.weight || Number(pet.weight) <= 0);
}

// Diri himuon ang label sa mga hayop nga naka-book.
function formatBookedPetLabel(pets) {
    if (!pets.length) return 'Unknown pet';
    if (pets.length === 1) return displayName(pets[0].pet_name, 'Unknown pet');
    if (pets.length === 2) {
        return `${displayName(pets[0].pet_name, 'Pet 1')} & ${displayName(pets[1].pet_name, 'Pet 2')}`;
    }
    return `${displayName(pets[0].pet_name, 'Pet 1')} + ${pets.length - 1} more`;
}

// Diri kuhaon ang unique nga services sa mga hayop.
function getUniqueServices(pets) {
    return [...new Set(pets.flatMap((pet) => pet.services || []).filter(Boolean))];
}

// Diri ang modal sa ongoing nga treatment.
function OngoingTreatmentModal({ appointment, onClose, onComplete, completing }) {
    if (!appointment) return null;

    const bookedPets = getBookedPets(appointment);
    const petCount = appointment.pet_count || bookedPets.length || 1;
    const primaryPet = bookedPets[0] || appointment.animal;
    const hasVialWeightIssue = bookedPets.some(petHasVialWeightIssue);
    const uniqueServices = getUniqueServices(bookedPets);
    const hasPlannedItems = (appointment.planned_items || []).length > 0;
    const outsideItems = appointment.outside_items || [];
    const hasOutsideItems = outsideItems.length > 0;
    const ownerName = displayName(appointment.user?.name, 'Unknown');
    const administeredBy = displayName(appointment.administered_by, '—');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50/80 to-white px-6 py-5">
                    <div>
                        <div className="mb-2">
                            <StatusPill />
                        </div>
                        <h3 className="text-xl font-semibold tracking-tight text-slate-900">Treatment review</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            {petCount > 1
                                ? `${petCount} pets in one appointment`
                                : displayName(primaryPet?.pet_name, 'Unknown pet')}
                            {uniqueServices.length > 0 ? ` · ${uniqueServices.join(', ')}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                        aria-label="Close"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-4 sm:col-span-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                Booked pets ({petCount})
                            </p>
                            <div className="mt-2 space-y-2">
                                {bookedPets.map((pet) => (
                                    <div
                                        key={pet.id}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                                    >
                                        <p className="font-semibold text-slate-900">{displayName(pet.pet_name, 'Unknown pet')}</p>
                                        <p className="text-sm text-slate-500">
                                            {[pet.species, pet.breed].filter(Boolean).join(' · ') || '—'}
                                            {pet.weight ? ` · ${pet.weight} kg` : ''}
                                        </p>
                                        {(pet.services || []).length > 0 ? (
                                            <div className="mt-2">
                                                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Services</p>
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    {pet.services.map((service, index) => (
                                                        <span
                                                            key={`${pet.id}-${service}-${index}`}
                                                            className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200/80"
                                                        >
                                                            {service}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                        {(pet.planned_items || []).length > 0 ? (
                                            <div className="mt-2.5">
                                                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Medicines</p>
                                                <ul className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200/80">
                                                    {pet.planned_items.map((item, index) => (
                                                        <li
                                                            key={`${pet.id}-${item.inventory_id}-${index}`}
                                                            className="flex items-center justify-between bg-slate-50/40 px-2.5 py-2 text-xs"
                                                        >
                                                            <div className="min-w-0 pr-2">
                                                                <p className="font-medium text-slate-900">{item.medicine_name}</p>
                                                                <p className="text-[11px] text-slate-500">
                                                                    {item.is_vial ? 'Vial' : item.is_box ? 'Box' : 'Item'}
                                                                </p>
                                                            </div>
                                                            <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                                                                {item.quantity_display || formatPlannedQuantity(item)}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Owner</p>
                            <p className="mt-1 font-semibold text-slate-900">{ownerName}</p>
                            <p className="text-sm text-slate-500">{appointment.user?.email || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Schedule</p>
                            <p className="mt-1 font-semibold text-slate-900">
                                {appointment.date
                                    ? new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-US', {
                                          weekday: 'short',
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                      })
                                    : '—'}
                            </p>
                            <p className="text-sm text-slate-500">
                                {formatBookingTimeRange(appointment.time, appointment.duration_minutes)}
                            </p>
                            <p className="text-xs text-slate-400">
                                Duration · {formatDuration(appointment.duration_minutes)}
                            </p>
                        </div>
                        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Administered by</p>
                            <p className="mt-1 font-semibold text-slate-900">{administeredBy}</p>
                        </div>
                    </div>

                    {appointment.symptoms?.length > 0 && (
                        <div className="mt-5">
                            <p className="mb-2 text-sm font-semibold text-slate-900">Treatment / symptoms</p>
                            <div className="flex flex-wrap gap-2">
                                {appointment.symptoms.map((symptom, index) => (
                                    <span
                                        key={`${symptom.name}-${index}`}
                                        className="rounded-md bg-amber-50 px-2.5 py-1 text-sm text-amber-800 ring-1 ring-inset ring-amber-200/80"
                                    >
                                        {symptom.name}
                                        {symptom.days_count ? ` (${symptom.days_count} days)` : ''}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {appointment.notes && (
                        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Notes</p>
                            <p className="mt-1 text-sm leading-relaxed text-slate-700">{appointment.notes}</p>
                        </div>
                    )}

                    {(appointment.unassigned_planned_items || []).length > 0 && (
                        <div className="mt-5">
                            <p className="mb-2 text-sm font-semibold text-slate-900">Shared / unassigned medicines</p>
                            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                                {appointment.unassigned_planned_items.map((item, index) => (
                                    <li
                                        key={`unassigned-${item.inventory_id}-${index}`}
                                        className="flex items-center justify-between bg-white px-4 py-3 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium text-slate-900">{item.medicine_name}</p>
                                            <p className="text-xs text-slate-500">
                                                {item.is_vial ? 'Vial' : item.is_box ? 'Box' : 'Item'}
                                            </p>
                                        </div>
                                        <span className="font-semibold tabular-nums text-slate-700">
                                            {item.quantity_display || formatPlannedQuantity(item)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {hasOutsideItems && (
                        <div className="mt-5">
                            <p className="mb-2 text-sm font-semibold text-slate-900">Outside clinic</p>
                            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-violet-200">
                                {outsideItems.map((item, index) => (
                                    <li
                                        key={`${item.name}-${index}`}
                                        className="bg-violet-50/40 px-4 py-3 text-sm"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium text-slate-900">{item.name}</p>
                                            <span className="shrink-0 font-semibold tabular-nums text-violet-800">{item.quantity}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">Status: {item.status || 'Approved by the clinic'}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {!hasPlannedItems && !hasOutsideItems && (
                        <p className="mt-5 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                            No inventory items were recorded for this treatment.
                        </p>
                    )}

                    {hasVialWeightIssue && (
                        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Pet weight is required for each animal receiving a vial-based medicine before completing inventory deduction.
                        </p>
                    )}
                </div>

                <div className="flex gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={completing}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                    >
                        Close
                    </button>
                    <button
                        type="button"
                        onClick={onComplete}
                        disabled={completing || hasVialWeightIssue}
                        className="flex-1 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {completing ? 'Completing...' : 'Complete treatment'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Diri ang modal sa mga tambal nga gigamit.
function MedicinesModal({ row, onClose }) {
    if (!row) return null;

    const bookedPets = getBookedPets(row);
    const petLabel = formatBookedPetLabel(bookedPets);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-sky-50/80 to-white px-5 py-4">
                    <div>
                        <h3 className="font-semibold tracking-tight text-slate-900">Medicines used</h3>
                        <p className="mt-0.5 text-sm text-slate-500">
                            {petLabel} · {row.service_label || 'No service'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                        aria-label="Close"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {(row.medicines || []).length > 0 ? (
                <ul className="divide-y divide-slate-100">
                    {(row.medicines || []).map((medicine, index) => (
                        <li key={`${medicine.name}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium text-slate-900">{medicine.name}</p>
                                {medicine.pet_name ? (
                                    <p className="text-xs text-slate-500">{displayName(medicine.pet_name)}</p>
                                ) : null}
                            </div>
                            <span className="shrink-0 tabular-nums text-slate-500">{medicine.quantity}</span>
                        </li>
                    ))}
                </ul>
                ) : null}
                {(row.outside_items || []).length > 0 ? (
                    <div className="border-t border-violet-100">
                        <p className="bg-violet-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-violet-700">Outside clinic</p>
                        <ul className="divide-y divide-violet-100">
                            {row.outside_items.map((item, index) => (
                                <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-medium text-slate-900">{item.name}</p>
                                        <p className="text-xs text-slate-500">{item.status || 'Approved by the clinic'}</p>
                                    </div>
                                    <span className="shrink-0 tabular-nums text-violet-800">{item.quantity}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {(row.medicines || []).length === 0 && (row.outside_items || []).length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-slate-500">No medicines recorded for this visit.</p>
                ) : null}
            </div>
        </div>
    );
}

// Diri ang page sa service history.
export default function ServiceHistory() {
    const [rows, setRows] = useState([]);
    const [ongoingRows, setOngoingRows] = useState([]);
    const [summary, setSummary] = useState({
        total_completed: 0,
        walk_ins: 0,
        appointments: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState(TYPE_FILTERS.all);
    const [viewTab, setViewTab] = useState(VIEW_TABS.ongoing);
    const [medicinesView, setMedicinesView] = useState(null);
    const [selectedOngoing, setSelectedOngoing] = useState(null);
    const [completing, setCompleting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Diri kuhaon ang mga ongoing nga appointment.
    const fetchOngoingAppointments = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/budget/treatments/processing', {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch ongoing treatments');
            }

            setOngoingRows(data.appointments || []);
        } catch (err) {
            setError(err.message || 'Failed to fetch ongoing treatments');
        } finally {
            setLoading(false);
        }
    };

    // Diri kuhaon ang service history sa bulan.
    const fetchServiceHistory = async (month = selectedMonth) => {
        setLoading(true);
        setError('');

        try {
            const { from, to } = getMonthRange(month);
            const params = new URLSearchParams();
            if (from) params.append('from', from);
            if (to) params.append('to', to);

            const response = await fetch(`/api/budget/reports/service-history?${params.toString()}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch service history');
            }

            setRows(data.report || []);
            setSummary(
                data.summary || {
                    total_completed: 0,
                    walk_ins: 0,
                    appointments: 0,
                }
            );
        } catch (err) {
            setError(err.message || 'Failed to fetch service history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (viewTab === VIEW_TABS.ongoing) {
            fetchOngoingAppointments();
            return;
        }

        fetchServiceHistory(selectedMonth);
    }, [viewTab, selectedMonth]);

    // Diri ilisan ang napiling bulan.
    const handleMonthChange = (month) => {
        if (!month) return;
        setSelectedMonth(month);
    };

    const formatTime = formatDisplayTime;

    // Diri i-format ang schedule sa row.
    const formatSchedule = (row) => {
        if (row.booking_date) {
            const date = new Date(`${row.booking_date}T00:00:00`);
            const dateLabel = Number.isNaN(date.getTime())
                ? row.booking_date
                : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return row.booking_time ? `${dateLabel}, ${formatTime(row.booking_time)}` : dateLabel;
        }

        if (row.completed_at) {
            const dt = new Date(row.completed_at);
            if (!Number.isNaN(dt.getTime())) {
                return dt.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
            }
        }

        return '—';
    };

    const filteredOngoingRows = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return ongoingRows.filter((row) => {
            if (!query) return true;

            const medicineText = (row.planned_items || [])
                .map((item) => `${item.medicine_name} ${item.quantity_display || formatPlannedQuantity(item)}`)
                .join(' ');

            const petSearchText = getBookedPets(row)
                .map((pet) => {
                    const medicineText = (pet.planned_items || [])
                        .map((item) => `${item.medicine_name} ${item.quantity_display || formatPlannedQuantity(item)}`)
                        .join(' ');
                    return `${pet.pet_name} ${(pet.services || []).join(' ')} ${medicineText}`;
                })
                .join(' ');

            return (
                row.animal?.pet_name?.toLowerCase().includes(query) ||
                petSearchText.toLowerCase().includes(query) ||
                row.user?.name?.toLowerCase().includes(query) ||
                row.service?.toLowerCase().includes(query) ||
                row.administered_by?.toLowerCase().includes(query) ||
                medicineText.toLowerCase().includes(query)
            );
        });
    }, [ongoingRows, searchTerm]);

    const filteredRows = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return rows.filter((row) => {
            if (typeFilter !== TYPE_FILTERS.all && row.booking_type !== typeFilter) {
                return false;
            }

            if (!query) return true;

            const medicineText = (row.medicines || []).map((m) => `${m.name} ${m.quantity}`).join(' ');

            return (
                row.pet_name?.toLowerCase().includes(query) ||
                (row.pet_names || []).some((name) => name?.toLowerCase().includes(query)) ||
                getBookedPets(row).some((pet) => pet.pet_name?.toLowerCase().includes(query)) ||
                row.owner_name?.toLowerCase().includes(query) ||
                row.service_label?.toLowerCase().includes(query) ||
                row.administered_by?.toLowerCase().includes(query) ||
                row.booking_type_label?.toLowerCase().includes(query) ||
                medicineText.toLowerCase().includes(query)
            );
        });
    }, [rows, searchTerm, typeFilter]);

    const hasActiveFilters = Boolean(
        searchTerm.trim() ||
        (viewTab === VIEW_TABS.completed && typeFilter !== TYPE_FILTERS.all) ||
        (viewTab === VIEW_TABS.completed && selectedMonth !== currentMonthValue())
    );

    // Diri i-clear ang mga filter.
    const clearFilters = () => {
        setSearchTerm('');
        setTypeFilter(TYPE_FILTERS.all);
        setSelectedMonth(currentMonthValue());
    };

    // Diri i-format ang petsa sa ongoing.
    const formatOngoingDate = (row) => {
        if (!row.date) return '—';

        const date = new Date(`${row.date}T00:00:00`);
        if (Number.isNaN(date.getTime())) return row.date;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Diri i-format ang range sa oras sa ongoing.
    const formatOngoingTimeRange = (row) => {
        if (!row.time) return '—';
        return formatBookingTimeRange(row.time, row.duration_minutes);
    };

    // Diri i-format ang schedule sa ongoing.
    const formatOngoingSchedule = (row) => {
        const dateLabel = formatOngoingDate(row);
        if (!row.time) return dateLabel;
        return `${dateLabel}, ${formatOngoingTimeRange(row)}`;
    };

    // Diri i-format ang gitas-on sa ongoing.
    const formatOngoingDuration = (row) => formatDuration(row.duration_minutes);

    // Diri i-complete ang ongoing nga treatment.
    const completeOngoingTreatment = async () => {
        if (!selectedOngoing) return;

        setCompleting(true);
        setError('');
        setSuccessMessage('');

        try {
            const petWeight = selectedOngoing.animal?.weight;
            const payload = {
                administered_by: selectedOngoing.administered_by || 'Budget Officer',
            };

            if (petWeight && Number(petWeight) > 0) {
                payload.pet_weight = Number(petWeight);
            }

            await axios.post(`/api/budget/treatments/${selectedOngoing.id}/complete`, payload);

            setSelectedOngoing(null);
            const deductedStock = (selectedOngoing.planned_items || []).length > 0;
            setSuccessMessage(
                deductedStock
                    ? 'Treatment completed. Inventory has been deducted.'
                    : 'Treatment completed.',
            );
            await fetchOngoingAppointments();
            setTimeout(() => setSuccessMessage(''), 4000);
        } catch (err) {
            setError(
                err?.response?.data?.error ||
                    err?.response?.data?.message ||
                    'Failed to complete treatment',
            );
        } finally {
            setCompleting(false);
        }
    };

    const activeRows = viewTab === VIEW_TABS.ongoing ? filteredOngoingRows : filteredRows;
    const totalRows = viewTab === VIEW_TABS.ongoing ? ongoingRows.length : rows.length;

    const ongoingStats = useMemo(() => {
        const total = ongoingRows.length;
        const ready = ongoingRows.filter((row) => (
            (row.planned_items || []).length > 0 || (row.outside_items || []).length > 0
        )).length;
        const totalPets = ongoingRows.reduce(
            (sum, row) => sum + (row.pet_count || getBookedPets(row).length || 1),
            0,
        );

        return {
            total,
            ready,
            needs_inventory: Math.max(total - ready, 0),
            total_pets: totalPets,
        };
    }, [ongoingRows]);

    // Diri himuon ang hint sa stat sa ongoing.
    const getOngoingStatHint = (cardKey) => {
        const card = ONGOING_STAT_CARDS.find((entry) => entry.key === cardKey);
        const baseHint = card?.hint || '';
        const total = ongoingStats.total;

        if (total <= 0) {
            return baseHint;
        }

        if (cardKey === 'total') {
            if (ongoingStats.total_pets > ongoingStats.total) {
                return `${ongoingStats.total} appointment${ongoingStats.total === 1 ? '' : 's'} · ${ongoingStats.total_pets} pets`;
            }
            return baseHint;
        }

        if (cardKey === 'ready') {
            return `${ongoingStats.ready} of ${total} ongoing — ${baseHint.toLowerCase()}`;
        }

        if (cardKey === 'needs_inventory') {
            return `${ongoingStats.needs_inventory} of ${total} ongoing — ${baseHint.toLowerCase()}`;
        }

        return baseHint;
    };

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />
            <MedicinesModal row={medicinesView} onClose={() => setMedicinesView(null)} />
            <OngoingTreatmentModal
                appointment={selectedOngoing}
                onClose={() => !completing && setSelectedOngoing(null)}
                onComplete={completeOngoingTreatment}
                completing={completing}
            />

            <main className="relative staff-main flex min-h-0 flex-1 flex-col">
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-canvas"
                    aria-hidden="true"
                />

                <div className="relative flex min-h-0 flex-1 flex-col px-6 py-6 lg:px-8">
                    <div className="mb-6 shrink-0">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="app-kicker">
                                    Budget operations
                                </p>
                                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">
                                    Booked Services
                                </h1>
                                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
                                    {viewTab === VIEW_TABS.ongoing
                                        ? 'Review ongoing treatments and complete inventory deduction.'
                                        : `Completed treatments and medicine usage for ${formatMonthLabel(selectedMonth)}.`}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <Tabs
                                    variant="segmented"
                                    value={viewTab}
                                    onChange={setViewTab}
                                    items={VIEW_TAB_OPTIONS.map((option) => ({
                                        id: option.key,
                                        label: option.label,
                                        count: option.key === VIEW_TABS.ongoing ? ongoingRows.length || null : null,
                                    }))}
                                />
                            </div>
                        </div>

                        {successMessage && (
                            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {successMessage}
                            </div>
                        )}

                        {error && (
                            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {viewTab === VIEW_TABS.ongoing
                                ? ONGOING_STAT_CARDS.map((card) => (
                                      <StatCard
                                          key={card.key}
                                          label={card.label}
                                          hint={getOngoingStatHint(card.key)}
                                          value={ongoingStats[card.key]}
                                          icon={card.icon}
                                          accent={card.accent}
                                          iconClass={card.iconClass}
                                      />
                                  ))
                                : SUMMARY_CARDS.map((card) => (
                                      <StatCard
                                          key={card.key}
                                          label={card.label}
                                          hint={card.hint}
                                          value={summary[card.key]}
                                          icon={card.icon}
                                          accent={card.accent}
                                          iconClass={card.iconClass}
                                      />
                                  ))}
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                        <div className="shrink-0 border-b border-slate-200 bg-slate-50/80 px-4 py-3.5 sm:px-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                <div className="relative min-w-0 flex-1 lg:max-w-xs">
                                    <svg
                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                        />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search pet, owner, service..."
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    />
                                </div>

                                {viewTab === VIEW_TABS.completed && (
                                    <Tabs
                                        variant="segmented"
                                        value={typeFilter}
                                        onChange={setTypeFilter}
                                        items={TYPE_FILTER_OPTIONS.map((option) => ({
                                            id: option.key,
                                            label: option.label,
                                        }))}
                                    />
                                )}

                                <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
                                    {viewTab === VIEW_TABS.completed && (
                                        <MonthNavigator value={selectedMonth} onChange={handleMonthChange} />
                                    )}
                                    {hasActiveFilters && (
                                        <button
                                            type="button"
                                            onClick={clearFilters}
                                            className="text-sm font-medium text-slate-500 transition-colors hover:text-violet-700"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex flex-1 flex-col items-center justify-center py-20">
                                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600 border-t-transparent" />
                                <p className="text-sm font-medium text-slate-700">
                                    {viewTab === VIEW_TABS.ongoing
                                        ? 'Loading ongoing treatments...'
                                        : 'Loading booked services...'}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">Please wait a moment</p>
                            </div>
                        ) : activeRows.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                    <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="1.75"
                                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                        />
                                    </svg>
                                </div>
                                <p className="text-base font-semibold text-slate-900">
                                    {totalRows === 0 ? 'No records yet' : 'No matching results'}
                                </p>
                                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
                                    {totalRows === 0
                                        ? viewTab === VIEW_TABS.ongoing
                                            ? 'Ongoing treatments appear here after an appointment is marked as ongoing.'
                                            : `No completed treatments for ${formatMonthLabel(selectedMonth)}.`
                                        : 'Try a different search or clear your filters.'}
                                </p>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        ) : viewTab === VIEW_TABS.ongoing ? (
                            <div
                                className="min-h-0 flex-1 overflow-auto [&::-webkit-scrollbar]:hidden"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Schedule</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Pet</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Owner</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Service</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Status</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Administered by</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 text-right backdrop-blur-sm">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredOngoingRows.map((row) => {
                                            const bookedPets = getBookedPets(row);
                                            const petCount = row.pet_count || bookedPets.length || 1;
                                            const petLabel = formatBookedPetLabel(bookedPets);
                                            const uniqueServices = getUniqueServices(bookedPets);
                                            const hasMedicines = (row.planned_items || []).length > 0 || (row.outside_items || []).length > 0;

                                            return (
                                            <tr key={row.id} className="group transition-colors hover:bg-violet-50/30">
                                                <td className="whitespace-nowrap px-5 py-3">
                                                    <p className="font-semibold text-slate-900">{formatOngoingDate(row)}</p>
                                                    <p className="text-xs text-slate-600">{formatOngoingTimeRange(row)}</p>
                                                    {row.time && (
                                                        <p className="mt-0.5 text-[11px] text-slate-400">
                                                            {formatOngoingDuration(row)}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <PetAvatar name={bookedPets[0]?.pet_name || row.animal?.pet_name} />
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-900">{petLabel}</p>
                                                            {petCount > 1 ? (
                                                                <p className="text-xs text-violet-700 font-medium">
                                                                    {petCount} pets · 1 appointment
                                                                </p>
                                                            ) : (bookedPets[0]?.species || bookedPets[0]?.breed || row.animal?.species || row.animal?.breed) ? (
                                                                <p className="text-xs text-slate-500">
                                                                    {[bookedPets[0]?.species || row.animal?.species, bookedPets[0]?.breed || row.animal?.breed]
                                                                        .filter(Boolean)
                                                                        .join(' · ')}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-slate-700">
                                                    {displayName(row.user?.name, 'Unknown')}
                                                </td>
                                                <td className="px-5 py-3">
                                                    {uniqueServices.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {uniqueServices.map((service) => (
                                                                <ServiceChip key={`${row.id}-${service}`} label={service} />
                                                            ))}
                                                        </div>
                                                    ) : row.service ? (
                                                        <ServiceChip label={row.service} />
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <StatusPill />
                                                </td>
                                                <td className="px-5 py-3 text-slate-700">
                                                    {displayName(row.administered_by, '—')}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedOngoing(row)}
                                                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                                                hasMedicines
                                                                    ? 'bg-violet-700 text-white shadow-sm hover:bg-violet-800'
                                                                    : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'
                                                            }`}
                                                        >
                                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                            Review
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div
                                className="min-h-0 flex-1 overflow-auto [&::-webkit-scrollbar]:hidden"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Date and time</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Pet</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Owner</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Service</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Type</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 backdrop-blur-sm">Administered by</th>
                                            <th className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 text-center backdrop-blur-sm">Medicines</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRows.map((row) => {
                                            const bookedPets = getBookedPets(row);
                                            const petCount = row.pet_count || bookedPets.length || 1;
                                            const petLabel = formatBookedPetLabel(bookedPets);

                                            return (
                                            <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                                                <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                                                    {formatSchedule(row)}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <PetAvatar name={bookedPets[0]?.pet_name || row.pet_name} />
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-900">{petLabel}</p>
                                                            {petCount > 1 ? (
                                                                <p className="text-xs font-medium text-violet-700">
                                                                    {petCount} pets · 1 appointment
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-slate-700">
                                                    {displayName(row.owner_name)}
                                                </td>
                                                <td className="px-5 py-3">
                                                    {row.service_label ? (
                                                        <ServiceChip label={row.service_label} />
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <TypeBadge label={row.booking_type_label} />
                                                </td>
                                                <td className="px-5 py-3 text-slate-700">
                                                    {displayName(row.administered_by, '—')}
                                                </td>
                                                <td className="px-5 py-3">
                                                    {(row.medicines || []).length > 0 || (row.outside_items || []).length > 0 ? (
                                                        <div className="flex justify-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => setMedicinesView(row)}
                                                                title={`View ${(row.medicines || []).length + (row.outside_items || []).length} item${(row.medicines || []).length + (row.outside_items || []).length !== 1 ? 's' : ''}`}
                                                                aria-label={`View ${(row.medicines || []).length + (row.outside_items || []).length} item${(row.medicines || []).length + (row.outside_items || []).length !== 1 ? 's' : ''}`}
                                                                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                                                            >
                                                                <ViewIcon />
                                                                {((row.medicines || []).length + (row.outside_items || []).length) > 1 && (
                                                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-violet-700 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-white">
                                                                        {(row.medicines || []).length + (row.outside_items || []).length}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center text-slate-400">—</div>
                                                    )}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {!loading && activeRows.length > 0 && (
                            <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                                <p className="text-xs text-slate-500">
                                    Showing{' '}
                                    <span className="font-semibold tabular-nums text-slate-700">{activeRows.length}</span> of{' '}
                                    <span className="font-semibold tabular-nums text-slate-700">{totalRows}</span> records
                                    {viewTab === VIEW_TABS.completed && (
                                        <span className="text-slate-400"> · {formatMonthLabel(selectedMonth)}</span>
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
