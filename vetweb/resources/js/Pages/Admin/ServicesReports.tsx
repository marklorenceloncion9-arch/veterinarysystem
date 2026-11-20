import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Head, usePage } from '@inertiajs/react';
import Sidebar from '@/Components/Admin/Sidebar';
import AppointmentStatusHistory from '@/Components/Admin/AppointmentStatusHistory';

// Diri i-join ang mga unique nga label.
function joinLabels(values) {
    const unique = [...new Set((values || []).filter(Boolean))];
    return unique.length > 0 ? unique.join(', ') : '—';
}

// Diri i-total ang mga hayop sa tanang tag-iya.
function sumAnimalTotals(owners) {
    return owners.reduce(
        (acc, owner) => ({
            petAnimals: acc.petAnimals + Number(owner.pet_animals || 0),
            livestock: acc.livestock + Number(owner.livestock || 0),
            poultry: acc.poultry + Number(owner.poultry || 0),
            total: acc.total + Number(owner.total_animals || 0),
        }),
        { petAnimals: 0, livestock: 0, poultry: 0, total: 0 }
    );
}

// Diri ang table sa mga tag-iya sa hayop.
function AnimalOwnersTable({ owners, loading, hasFilters, onView, onClear }) {
    if (loading && owners.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                <span className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                <p className="text-base font-semibold text-gray-600">Loading animal totals...</p>
            </div>
        );
    }

    if (owners.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                <p className="text-base font-semibold text-gray-600">No animals found</p>
                <p className="mt-1 text-sm text-gray-500">
                    {hasFilters
                        ? 'Try another date range, barangay, or clear the filters.'
                        : 'Animals served will appear here.'}
                </p>
                {hasFilters && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                    >
                        Clear filters
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="service-records-sheet animal-report-sheet flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm print:shadow-none print:rounded-none">
            <div className="min-h-0 flex-1 overflow-auto scrollbar-hide print:overflow-visible">
                <table className="min-w-full text-left text-sm print-table">
                    <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 print:static">
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <th className="px-4 py-3 font-bold">Name</th>
                            <th className="px-4 py-3 font-bold">Barangay</th>
                            <th className="px-4 py-3 font-bold">Zone</th>
                            <th className="px-4 py-3 text-right font-bold">Total Animals</th>
                            <th className="px-4 py-3 font-bold">Animal Type</th>
                            <th className="px-4 py-3 font-bold">Species</th>
                            <th className="px-4 py-3 font-bold print:hidden"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {owners.map((owner) => (
                            <tr
                                key={owner.id}
                                onClick={() => onView(owner)}
                                className="cursor-pointer transition-colors hover:bg-violet-50/50"
                            >
                                <td className="px-4 py-3.5 font-semibold text-gray-900">{owner.name || 'Unknown'}</td>
                                <td className="px-4 py-3.5 text-gray-800">{owner.barangay || '—'}</td>
                                <td className="px-4 py-3.5 text-gray-800">{owner.zone || '—'}</td>
                                <td className="px-4 py-3.5 text-right text-base font-bold tabular-nums text-violet-700">{owner.total_animals}</td>
                                <td className="px-4 py-3.5 text-gray-800">{joinLabels(owner.animal_types)}</td>
                                <td className="px-4 py-3.5 text-gray-800">{joinLabels(owner.species_names)}</td>
                                <td className="px-4 py-3.5 text-right print:hidden" onClick={(event) => event.stopPropagation()}>
                                    <button
                                        type="button"
                                        onClick={() => onView(owner)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                        title="View animals"
                                        aria-label="View animals"
                                    >
                                        <ViewIcon />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Diri ang bar sa total sa mga hayop.
function AnimalTotalsBar({ totals }) {
    const items = [
        { label: 'Pet Animals', value: totals.petAnimals },
        { label: 'Livestock', value: totals.livestock },
        { label: 'Poultry', value: totals.poultry },
        { label: 'Total', value: totals.total },
    ];

    return (
        <div className="sticky bottom-0 z-20 shrink-0 border-t border-violet-100 bg-white/95 px-1 py-1 backdrop-blur print:static print-year-totals">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
                {items.map((item) => (
                    <div
                        key={item.label}
                        className="rounded-xl border border-violet-100 bg-white px-4 py-3 shadow-sm print:shadow-none print-year-total-item"
                    >
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-600 print-year-total-label">
                            {item.label}
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700 print-year-total-value">
                            {item.value}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

const STATUS_BADGE = {
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    cancelled: 'bg-red-50 text-red-600 ring-1 ring-red-100',
    ongoing: 'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
    completed: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    processing: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
};

const STATUS_FILTERS = [
    { value: 'all', label: 'All statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Canceled' },
];

// Diri i-format ang petsa para ipakita.
function formatDisplayDate(dateStr) {
    if (!dateStr) return '—';
    const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// Diri himuon ang label sa status.
function formatStatusLabel(status) {
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Canceled';
    if (!status) return '—';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

// Diri kuhaon ang mga hayop sa record.
function recordPets(record) {
    if (Array.isArray(record?.pets) && record.pets.length > 0) {
        return record.pets;
    }
    return record?.pet ? [record.pet] : [];
}

// Diri himuon ang label sa mga ngalan sa hayop.
function formatAnimalsLabel(pets) {
    const names = (pets || []).map((pet) => pet?.pet_name || pet?.name).filter(Boolean);
    if (names.length === 0) return '—';
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

// Diri i-format ang mga service nga mubo.
function formatServicesCompact(serviceNames = []) {
    const names = [...new Set((serviceNames || []).filter(Boolean))];
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
}

// Diri i-format ang oras para ipakita.
function formatDisplayTime(timeString) {
    if (!timeString) return '—';
    const timeOnly = String(timeString).split(':').slice(0, 2).join(':');
    const timeToFormat = new Date(`2000-01-01T${timeOnly}`);
    if (Number.isNaN(timeToFormat.getTime())) return timeString;
    return timeToFormat.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Diri i-convert ang oras ngadto sa minutes.
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = String(timeStr).split(':').map(Number);
    return (hours * 60) + (minutes || 0);
}

// Diri i-convert ang minutes ngadto sa label sa oras.
function minutesToTimeLabel(totalMinutes) {
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const date = new Date();
    date.setHours(hours24, minutes, 0, 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Diri i-format ang range sa oras sa booking.
function formatBookingTimeRange(timeStr, durationMinutes = 10) {
    if (!timeStr) return '—';
    const duration = durationMinutes > 0 ? durationMinutes : 10;
    const start = formatDisplayTime(timeStr);
    const end = minutesToTimeLabel(timeToMinutes(timeStr) + duration);
    return `${start} – ${end}`;
}

// Diri kuhaon ang ngalan sa barangay sa user.
function barangayLabel(user) {
    if (!user?.barangay) return '—';
    if (typeof user.barangay === 'string') return user.barangay;
    return user.barangay.name || '—';
}

// Diri ang icon sa view.
function ViewIcon() {
    return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
    );
}

// Diri kuhaon ang text sa label gikan sa value.
function labelText(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.species_name || value.breed_name || value.name || null;
}

// Diri ang field sa detalye nga naay label.
function DetailField({ label, value }) {
    return (
        <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">{value || '—'}</dd>
        </div>
    );
}

// Diri ang table sa mga service record.
function ServiceRecordsTable({ records, loading, hasFilters, onView, onClear }) {
    if (loading && records.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                <span className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                <p className="text-base font-semibold text-gray-600">Loading service records...</p>
            </div>
        );
    }

    if (records.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
                <p className="text-base font-semibold text-gray-600">No service records found</p>
                <p className="mt-1 text-sm text-gray-500">
                    {hasFilters
                        ? 'Try another date range or clear the filters.'
                        : 'Service records will appear here.'}
                </p>
                {hasFilters && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                    >
                        Clear filters
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="service-records-sheet flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm print:shadow-none print:rounded-none">
            <div className="min-h-0 flex-1 overflow-auto scrollbar-hide print:overflow-visible">
                <table className="min-w-full text-left text-sm print-table">
                    <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 print:static">
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <th className="px-4 py-3 font-bold">Owner</th>
                            <th className="px-4 py-3 font-bold">Animals</th>
                            <th className="px-4 py-3 font-bold">Barangay</th>
                            <th className="px-4 py-3 font-bold">Zone</th>
                            <th className="px-4 py-3 font-bold">Services</th>
                            <th className="px-4 py-3 font-bold">Schedule</th>
                            <th className="px-4 py-3 font-bold">Administered By</th>
                            <th className="px-4 py-3 font-bold">Status</th>
                            <th className="px-4 py-3 font-bold print:hidden"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {records.map((record) => {
                            const pets = recordPets(record);
                            const ownerName = record.user?.name || 'Unknown';
                            const servicesLabel = formatServicesCompact(record.services);

                            return (
                                <tr
                                    key={record.id}
                                    onClick={() => onView(record)}
                                    className="cursor-pointer transition-colors hover:bg-violet-50/50"
                                >
                                    <td className="px-4 py-3.5">
                                        <p className="font-semibold text-gray-900">{ownerName}</p>
                                    </td>
                                    <td className="px-4 py-3.5 text-gray-800">{formatAnimalsLabel(pets)}</td>
                                    <td className="px-4 py-3.5 text-gray-800">{barangayLabel(record.user)}</td>
                                    <td className="px-4 py-3.5 text-gray-800">{record.user?.zone || '—'}</td>
                                    <td className="px-4 py-3.5">
                                        {servicesLabel ? (
                                            <span className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-100 print:hidden">
                                                {servicesLabel}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 print:hidden">—</span>
                                        )}
                                        <span className="hidden print:inline print-services">
                                            {(record.services || []).filter(Boolean).join(', ') || '—'}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3.5">
                                        <p className="font-medium text-gray-900">{formatDisplayDate(record.date)}</p>
                                        <p className="text-xs text-gray-500">
                                            {formatBookingTimeRange(record.time, record.duration_minutes)}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3.5 text-gray-700">
                                        {record.administered_by || (
                                            <span className="text-xs font-medium text-gray-400">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold print:hidden ${STATUS_BADGE[record.status] || STATUS_BADGE.pending}`}>
                                            {formatStatusLabel(record.status)}
                                        </span>
                                        <span className="hidden print:inline print-status">
                                            {formatStatusLabel(record.status)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5 text-right print:hidden" onClick={(event) => event.stopPropagation()}>
                                        <button
                                            type="button"
                                            onClick={() => onView(record)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                            title="View details"
                                            aria-label="View details"
                                        >
                                            <ViewIcon />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Diri ang modal sa detalye sa service record.
function ServiceRecordModal({ record, onClose }) {
    const pets = recordPets(record);
    const ownerName = record.user?.name || 'Unknown';
    const services = [...new Set((record.services || []).filter(Boolean))];
    const history = Array.isArray(record.status_history) ? record.status_history : [];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm print:hidden sm:p-4"
            onClick={onClose}
        >
            <div
                className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="service-record-title"
            >
                <div className="flex items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-5 py-3.5">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">Service record</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h2 id="service-record-title" className="text-xl font-bold text-gray-900">{ownerName}</h2>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[record.status] || STATUS_BADGE.pending}`}>
                                {formatStatusLabel(record.status)}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition hover:text-gray-600"
                        aria-label="Close"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-5 py-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
                        <div className="space-y-4">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                                <DetailField label="Barangay" value={barangayLabel(record.user)} />
                                <DetailField label="Zone" value={record.user?.zone || '—'} />
                                <DetailField
                                    label="Schedule"
                                    value={`${formatDisplayDate(record.date)} · ${formatBookingTimeRange(record.time, record.duration_minutes)}`}
                                />
                                <DetailField label="Administered by" value={record.administered_by || 'Unassigned'} />
                                <DetailField label="Services" value={services.join(', ') || '—'} />
                                <DetailField label="Phone" value={record.user?.phone_number || '—'} />
                            </dl>

                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Animals</p>
                                {pets.length === 0 ? (
                                    <p className="mt-2 text-sm text-gray-500">No animals listed.</p>
                                ) : (
                                    <ul className="mt-2 space-y-2">
                                        {pets.map((pet) => {
                                            const details = [labelText(pet.species), labelText(pet.breed), pet.identification_number]
                                                .filter(Boolean)
                                                .join(' · ');
                                            const petStaff = pet.administered_by && pet.administered_by !== record.administered_by
                                                ? pet.administered_by
                                                : null;
                                            return (
                                                <li key={pet.id} className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                                                    <p className="font-semibold text-gray-900">{pet.pet_name || pet.name || 'Unnamed animal'}</p>
                                                    <p className="text-xs text-gray-500">{details || '—'}</p>
                                                    {petStaff && (
                                                        <p className="mt-0.5 text-xs text-gray-600">Administered by {petStaff}</p>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {history.length > 0 && (
                            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status history</p>
                                <AppointmentStatusHistory history={history} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Diri ang modal sa detalye sa tag-iya sa hayop.
function AnimalOwnerModal({ owner, onClose }) {
    const animals = Array.isArray(owner.animals) ? owner.animals : [];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm print:hidden sm:p-4"
            onClick={onClose}
        >
            <div
                className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="animal-owner-title"
            >
                <div className="flex items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-5 py-3.5">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">Total animals</p>
                        <h2 id="animal-owner-title" className="mt-1 text-xl font-bold text-gray-900">{owner.name || 'Unknown'}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition hover:text-gray-600"
                        aria-label="Close"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-5 py-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4 sm:grid-cols-4">
                        <DetailField label="Barangay" value={owner.barangay || '—'} />
                        <DetailField label="Zone" value={owner.zone || '—'} />
                        <DetailField label="Total animals" value={String(owner.total_animals ?? animals.length)} />
                        <DetailField label="Phone" value={owner.phone_number || '—'} />
                    </dl>
                    <div className="mt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Animals</p>
                        {animals.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">No animals listed.</p>
                        ) : (
                            <ul className="mt-2 space-y-2">
                                {animals.map((animal) => {
                                    const details = [animal.animal_type, animal.species_name, animal.breed, animal.identification_number]
                                        .filter(Boolean)
                                        .join(' · ');
                                    return (
                                        <li key={animal.id} className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                                            <p className="font-semibold text-gray-900">{animal.name || 'Unnamed animal'}</p>
                                            <p className="text-xs text-gray-500">{details || '—'}</p>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const TOKEN_KEY = 'admin_api_token';

// Diri basahon ang token sa localStorage.
function readStoredToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

// Diri i-save o tangtangon ang token sa localStorage.
function writeStoredToken(token) {
    try {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    } catch {
        // Edge Tracking Prevention can block storage; session cookie auth still works.
    }
}

// Diri ang page sa services reports.
export default function ServicesReports() {
    const { url } = usePage();
    const activeTab = url.includes('tab=total-animals') ? 'total-animals' : 'monthly';
    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [apiToken, setApiToken] = useState(null);
    const [tokenLoaded, setTokenLoaded] = useState(false);
    const [serviceRecords, setServiceRecords] = useState([]);
    const [animalOwners, setAnimalOwners] = useState([]);
    const [barangays, setBarangays] = useState([]);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportError, setReportError] = useState(null);
    const [fromDate, setFromDate] = useState('');
    const [tillDate, setTillDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [barangayFilter, setBarangayFilter] = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [selectedOwner, setSelectedOwner] = useState(null);
    const apiTokenRef = useRef(null);
    const tokenRequestRef = useRef(null);
    const recordsRequestRef = useRef(0);

    // Diri kuhaon ang mga tag-iya sa hayop sa range sa petsa.
    const fetchAnimalOwners = async (from, till) => {
        const requestId = ++recordsRequestRef.current;

        if (from && till && from > till) {
            setAnimalOwners([]);
            setReportError('From date must be on or before the till date.');
            setReportLoading(false);
            return;
        }

        setReportLoading(true);
        setReportError(null);

        try {
            const params = new URLSearchParams({ report: 'animals' });
            if (from) params.set('from', from);
            if (till) params.set('till', till);
            const response = await fetchWithToken(`/api/admin/service-report?${params.toString()}`);
            const data = await response.json();
            if (requestId !== recordsRequestRef.current) return;

            if (response.ok && data.success && Array.isArray(data.owners)) {
                setAnimalOwners(data.owners);
                setBarangays(Array.isArray(data.barangays) ? data.barangays : []);
            } else {
                setAnimalOwners([]);
                setReportError(data.error || 'Failed to load total animals.');
            }
        } catch (error) {
            if (requestId !== recordsRequestRef.current) return;
            console.error('Error fetching total animals:', error);
            setAnimalOwners([]);
            setReportError('Unable to load total animals. Please try again.');
        } finally {
            if (requestId === recordsRequestRef.current) {
                setReportLoading(false);
            }
        }
    };

    // Diri kuhaon ang mga service record sa range sa petsa.
    const fetchServiceRecords = async (serviceId, from, till) => {
        const requestId = ++recordsRequestRef.current;

        if (from && till && from > till) {
            setServiceRecords([]);
            setReportError('From date must be on or before the till date.');
            setReportLoading(false);
            return;
        }

        setReportLoading(true);
        setReportError(null);

        try {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (till) params.set('till', till);
            if (serviceId) {
                params.append('service_id', serviceId);
            }
            const response = await fetchWithToken(`/api/admin/service-report?${params.toString()}`);
            const data = await response.json();
            if (requestId !== recordsRequestRef.current) return;

            if (response.ok && data.success && Array.isArray(data.records)) {
                setServiceRecords(data.records);
            } else {
                setServiceRecords([]);
                setReportError(data.error || 'Failed to load service report data.');
            }
        } catch (error) {
            if (requestId !== recordsRequestRef.current) return;
            console.error('Error fetching service records:', error);
            setServiceRecords([]);
            setReportError('Unable to load service report. Please try again.');
        } finally {
            if (requestId === recordsRequestRef.current) {
                setReportLoading(false);
            }
        }
    };

    // Diri kuhaon ang API token.
    const retrieveApiToken = async (force = false) => {
        if (tokenRequestRef.current) {
            return tokenRequestRef.current;
        }

        tokenRequestRef.current = (async () => {
            try {
                if (!force) {
                    const storedToken = readStoredToken();
                    if (storedToken) {
                        apiTokenRef.current = storedToken;
                        setApiToken(storedToken);
                    }
                }

                const response = await fetch('/admin/api-token', {
                    credentials: 'include',
                });
                const data = await response.json();

                if (data.success && data.token) {
                    writeStoredToken(data.token);
                    apiTokenRef.current = data.token;
                    setApiToken(data.token);
                    setTokenLoaded(true);
                    return data.token;
                }

                writeStoredToken(null);
                apiTokenRef.current = null;
                setApiToken(null);
                setTokenLoaded(true);
                return null;
            } catch (error) {
                console.error('Error getting API token:', error);
                writeStoredToken(null);
                apiTokenRef.current = null;
                setApiToken(null);
                setTokenLoaded(true);
                return null;
            } finally {
                tokenRequestRef.current = null;
            }
        })();

        return tokenRequestRef.current;
    };

    // Diri mag-fetch gamit ang API token.
    const fetchWithToken = async (url, options = {}) => {
        const headers = {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        };

        const token = options._token ?? apiTokenRef.current ?? apiToken;
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers,
        });

        if (response.status === 401 && !options._retry) {
            const newToken = await retrieveApiToken(true);
            if (newToken) {
                return fetchWithToken(url, { ...options, _retry: true, _token: newToken });
            }
        }

        return response;
    };

    // Diri kuhaon ang mga klase sa service.
    const fetchServiceTypes = async () => {
        try {
            const response = await fetchWithToken('/api/services');
            const data = await response.json();
            if (data.success && data.services) {
                setServices(data.services);
            }
        } catch (error) {
            console.error('Error fetching service types:', error);
        }
    };

    useEffect(() => {
        retrieveApiToken();
    }, []);

    // Diri kuhaon ang listahan sa barangay.
    const fetchBarangays = async () => {
        try {
            const response = await fetchWithToken('/admin/barangays');
            const data = await response.json();
            const list = Array.isArray(data) ? data : (Array.isArray(data.barangays) ? data.barangays : []);
            setBarangays(list
                .map((barangay) => ({ id: barangay.id, name: barangay.name }))
                .sort((a, b) => String(a.name).localeCompare(String(b.name))));
        } catch (error) {
            console.error('Error fetching barangays:', error);
        }
    };

    useEffect(() => {
        if (tokenLoaded) {
            fetchServiceTypes();
            fetchBarangays();
        }
    }, [tokenLoaded]);

    useEffect(() => {
        if (!tokenLoaded) return;
        if (activeTab === 'total-animals') {
            fetchAnimalOwners(fromDate, tillDate);
            return;
        }
        fetchServiceRecords(selectedServiceId, fromDate, tillDate);
    }, [tokenLoaded, selectedServiceId, activeTab, fromDate, tillDate]);

    const selectedService = services.find(service => String(service.id) === String(selectedServiceId)) || null;
    const selectedServiceName = selectedService?.type_name || 'All services';
    const selectedBarangayName = barangays.find((barangay) => String(barangay.id) === String(barangayFilter))?.name || '';
    const dateRangeLabel = !fromDate && !tillDate
        ? 'All dates'
        : `${fromDate ? formatDisplayDate(fromDate) : 'any date'} till ${tillDate ? formatDisplayDate(tillDate) : 'any date'}`;
    const hasRecordFilters = searchTerm.trim() !== ''
        || statusFilter !== 'all'
        || selectedServiceId !== ''
        || barangayFilter !== ''
        || fromDate !== ''
        || tillDate !== '';

    const filteredRecords = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const selectedBarangay = barangays.find((barangay) => String(barangay.id) === String(barangayFilter));
        return serviceRecords.filter((record) => {
            if (record.status !== 'completed' && record.status !== 'cancelled') return false;
            if (statusFilter !== 'all' && record.status !== statusFilter) return false;
            if (barangayFilter) {
                const recordBarangayId = record.user?.barangay_id;
                if (recordBarangayId != null && recordBarangayId !== '') {
                    if (String(recordBarangayId) !== String(barangayFilter)) return false;
                } else if (barangayLabel(record.user) !== (selectedBarangay?.name || '')) {
                    return false;
                }
            }
            if (!query) return true;
            const pets = recordPets(record);
            const haystack = [
                record.user?.name,
                record.user?.firstname,
                record.user?.lastname,
                barangayLabel(record.user),
                record.user?.zone,
                record.administered_by,
                record.status,
                record.date,
                ...(record.services || []),
                ...pets.flatMap((pet) => [pet.pet_name, pet.name, pet.identification_number]),
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [serviceRecords, searchTerm, statusFilter, barangayFilter, barangays]);

    // Diri i-clear ang mga filter sa records.
    const clearRecordFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setSelectedServiceId('');
        setBarangayFilter('');
        setFromDate('');
        setTillDate('');
    };

    const filteredOwners = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return animalOwners.filter((owner) => {
            if (barangayFilter && String(owner.barangay_id ?? '') !== String(barangayFilter)) return false;
            if (!query) return true;
            const haystack = [
                owner.name,
                owner.zone,
                owner.barangay,
                ...(owner.animal_types || []),
                ...(owner.species_names || []),
                ...(owner.animals || []).flatMap((animal) => [animal.name, animal.species_name, animal.animal_type, animal.breed]),
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [animalOwners, searchTerm, barangayFilter]);

    const animalTotals = sumAnimalTotals(filteredOwners);
    const hasAnimalFilters = searchTerm.trim() !== ''
        || barangayFilter !== ''
        || fromDate !== ''
        || tillDate !== '';

    // Diri i-clear ang mga filter sa hayop.
    const clearAnimalFilters = () => {
        setSearchTerm('');
        setBarangayFilter('');
        setFromDate('');
        setTillDate('');
    };

    const compactFilterClass =
        'block w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 transition-colors focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100';

    // Diri i-print ang report.
    const handlePrint = () => {
        window.print();
    };

    const printedOn = new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <>
            <Head title={'\u00A0'}>
                <style>{`
                    @media print {
                        @page {
                            margin: 10mm;
                        }

                        html,
                        body {
                            width: 100% !important;
                            height: auto !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            overflow: visible !important;
                            background: #fff !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }

                        .print-header {
                            display: block !important;
                            width: 100% !important;
                            margin: 0 0 8px !important;
                            padding: 0 0 8px !important;
                            border-bottom: 2px solid #111827 !important;
                        }

                        .print-header-top {
                            display: block !important;
                        }

                        .print-title {
                            font-size: 18px !important;
                            line-height: 1.2 !important;
                            color: #111827 !important;
                        }

                        .print-subtitle {
                            margin-top: 2px !important;
                            font-size: 11px !important;
                            color: #4b5563 !important;
                        }

                        .print-barangay {
                            display: block !important;
                            width: 100% !important;
                            margin: 0 0 6px !important;
                            text-align: center !important;
                            font-size: 14px !important;
                            font-weight: 700 !important;
                            color: #111827 !important;
                        }

                        .print-year-totals {
                            display: flex !important;
                            gap: 6px !important;
                            margin-top: 8px !important;
                        }

                        .print-year-total-item {
                            padding: 4px 8px !important;
                            min-width: 0 !important;
                        }

                        .print-year-total-label {
                            font-size: 8px !important;
                        }

                        .print-year-total-value {
                            font-size: 13px !important;
                            line-height: 1 !important;
                        }

                        .service-report-print {
                            display: block !important;
                            width: 100% !important;
                            height: auto !important;
                            overflow: visible !important;
                            padding: 0 !important;
                        }

                        .service-report-print.keep-together {
                            page-break-inside: avoid;
                            break-inside: avoid;
                        }

                        .service-report-print .print-table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                        }

                        .keep-together .print-table th,
                        .keep-together .print-table td {
                            padding: 6px 8px !important;
                            font-size: 12px !important;
                            font-weight: 700 !important;
                            border-bottom: 1px solid #e5e7eb !important;
                        }

                        .service-records-sheet,
                        .service-records-sheet > div {
                            display: block !important;
                            width: 100% !important;
                            height: auto !important;
                            max-height: none !important;
                            overflow: visible !important;
                            border: 0 !important;
                            border-radius: 0 !important;
                            box-shadow: none !important;
                        }

                        .service-records-sheet .print-table {
                            table-layout: fixed !important;
                            width: 100% !important;
                            border-collapse: collapse !important;
                        }

                        .service-records-sheet .print-table thead {
                            display: table-header-group;
                        }

                        .service-records-sheet .print-table thead,
                        .service-records-sheet .print-table tr,
                        .service-records-sheet .print-table th {
                            position: static !important;
                            top: auto !important;
                            z-index: auto !important;
                        }

                        .service-records-sheet .print-table th,
                        .service-records-sheet .print-table td {
                            padding: 5px 6px !important;
                            font-size: 10px !important;
                            font-weight: 500 !important;
                            line-height: 1.35 !important;
                            white-space: normal !important;
                            word-break: normal !important;
                            overflow-wrap: break-word !important;
                            vertical-align: top !important;
                            border: 1px solid #d1d5db !important;
                            color: #111827 !important;
                            background: #fff !important;
                        }

                        .service-records-sheet .print-table th {
                            font-size: 8px !important;
                            font-weight: 700 !important;
                            letter-spacing: 0.03em !important;
                            text-transform: uppercase !important;
                            background: #f3f4f6 !important;
                        }

                        .service-records-sheet .print-table th:nth-child(1),
                        .service-records-sheet .print-table td:nth-child(1) { width: 13%; }
                        .service-records-sheet .print-table th:nth-child(2),
                        .service-records-sheet .print-table td:nth-child(2) { width: 13%; }
                        .service-records-sheet .print-table th:nth-child(3),
                        .service-records-sheet .print-table td:nth-child(3) { width: 11%; }
                        .service-records-sheet .print-table th:nth-child(4),
                        .service-records-sheet .print-table td:nth-child(4) { width: 8%; }
                        .service-records-sheet .print-table th:nth-child(5),
                        .service-records-sheet .print-table td:nth-child(5) { width: 14%; }
                        .service-records-sheet .print-table th:nth-child(6),
                        .service-records-sheet .print-table td:nth-child(6) { width: 15%; }
                        .service-records-sheet .print-table th:nth-child(7),
                        .service-records-sheet .print-table td:nth-child(7) { width: 16%; }
                        .service-records-sheet .print-table th:nth-child(8),
                        .service-records-sheet .print-table td:nth-child(8) { width: 10%; }

                        .animal-report-sheet .print-table th:nth-child(1),
                        .animal-report-sheet .print-table td:nth-child(1) { width: 18% !important; }
                        .animal-report-sheet .print-table th:nth-child(2),
                        .animal-report-sheet .print-table td:nth-child(2) { width: 16% !important; }
                        .animal-report-sheet .print-table th:nth-child(3),
                        .animal-report-sheet .print-table td:nth-child(3) { width: 12% !important; }
                        .animal-report-sheet .print-table th:nth-child(4),
                        .animal-report-sheet .print-table td:nth-child(4) { width: 14% !important; }
                        .animal-report-sheet .print-table th:nth-child(5),
                        .animal-report-sheet .print-table td:nth-child(5) { width: 18% !important; }
                        .animal-report-sheet .print-table th:nth-child(6),
                        .animal-report-sheet .print-table td:nth-child(6) { width: 22% !important; }

                        .service-records-sheet .print-table tbody tr {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }

                        .service-records-sheet .print-services,
                        .service-records-sheet .print-status {
                            display: inline !important;
                            padding: 0 !important;
                            background: transparent !important;
                            color: #111827 !important;
                            border: 0 !important;
                            box-shadow: none !important;
                            font-size: 10px !important;
                            font-weight: 500 !important;
                        }

                        .print-footer {
                            margin-top: 8px !important;
                            font-size: 9px !important;
                            color: #6b7280 !important;
                        }
                    }
                `}</style>
            </Head>

            <div className="flex h-screen overflow-hidden bg-canvas print:block print:h-auto print:min-h-0 print:overflow-visible">
                <div className="print:hidden">
                    <Sidebar />
                </div>

                <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden print:ml-0 print:block print:overflow-visible">
                    <header className="shrink-0 border-b border-line bg-white px-6 py-4 lg:px-8 print:border-0 print:px-0 print:py-0 print-header">
                        <p className="hidden text-center text-base font-bold text-gray-900 print:block print-barangay">
                            {selectedBarangayName || 'All barangays'}
                        </p>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print-header-top">
                            <div>
                                <p className="app-kicker print:hidden">Reports</p>
                                <p className="hidden print:block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                                    {activeTab === 'total-animals' ? 'Reports' : 'Services Reports'}
                                </p>
                                <h1 className="text-xl font-bold tracking-tight text-navy print:text-2xl print-title">
                                    {activeTab === 'total-animals' ? 'Total Animals' : selectedServiceName}
                                </h1>
                                <p className="text-sm text-muted print-subtitle">
                                    {dateRangeLabel}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-stretch gap-3 print:hidden">
                                <button
                                    type="button"
                                    onClick={handlePrint}
                                    disabled={reportLoading || !!reportError}
                                    className="inline-flex items-center justify-center gap-2 self-end rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Print report
                                </button>
                            </div>
                        </div>
                    </header>

                    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5 lg:px-8 print:overflow-visible print:p-0 service-report-print">
                        {activeTab === 'total-animals' ? (
                        <section className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print:hidden">
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
                                <div className="lg:col-span-4">
                                    <label htmlFor="animalReportSearch" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Search
                                    </label>
                                    <div className="relative">
                                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            id="animalReportSearch"
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="block w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                            placeholder="Name, barangay, zone, type, species..."
                                        />
                                    </div>
                                </div>
                                <div className="lg:col-span-3">
                                    <label htmlFor="animalBarangay" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Barangay
                                    </label>
                                    <select
                                        id="animalBarangay"
                                        value={barangayFilter}
                                        onChange={(e) => setBarangayFilter(e.target.value)}
                                        className={compactFilterClass}
                                    >
                                        <option value="">All barangays</option>
                                        {barangays.map((barangay) => (
                                            <option key={barangay.id} value={String(barangay.id)}>
                                                {barangay.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="lg:col-span-2">
                                    <label htmlFor="animalReportFrom" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        From
                                    </label>
                                    <input
                                        id="animalReportFrom"
                                        type="date"
                                        value={fromDate}
                                        max={tillDate || undefined}
                                        onChange={(e) => setFromDate(e.target.value)}
                                        className={compactFilterClass}
                                    />
                                </div>
                                <div className="lg:col-span-3">
                                    <label htmlFor="animalReportTill" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Till
                                    </label>
                                    <input
                                        id="animalReportTill"
                                        type="date"
                                        value={tillDate}
                                        min={fromDate || undefined}
                                        onChange={(e) => setTillDate(e.target.value)}
                                        className={compactFilterClass}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                                {reportLoading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                                        Loading animal totals...
                                    </span>
                                ) : reportError ? (
                                    <span className="text-red-600">{reportError}</span>
                                ) : (
                                    <span>
                                        <span className="font-semibold text-navy">{filteredOwners.length}</span>
                                        {filteredOwners.length === 1 ? ' owner' : ' owners'}
                                        {' '}· {dateRangeLabel}
                                    </span>
                                )}
                                {hasAnimalFilters && (
                                    <button
                                        type="button"
                                        onClick={clearAnimalFilters}
                                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </section>
                        ) : (
                        <section className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print:hidden">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
                                <div>
                                    <label htmlFor="serviceReportSearch" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Search
                                    </label>
                                    <div className="relative">
                                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            id="serviceReportSearch"
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="block w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                            placeholder="Owner, animal, barangay, zone..."
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="serviceBarangay" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Barangay
                                    </label>
                                    <select
                                        id="serviceBarangay"
                                        value={barangayFilter}
                                        onChange={(e) => setBarangayFilter(e.target.value)}
                                        className={compactFilterClass}
                                    >
                                        <option value="">All barangays</option>
                                        {barangays.map((barangay) => (
                                            <option key={barangay.id} value={String(barangay.id)}>
                                                {barangay.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="serviceType" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Service
                                    </label>
                                    <select
                                        id="serviceType"
                                        value={selectedServiceId}
                                        onChange={(e) => setSelectedServiceId(e.target.value)}
                                        className={compactFilterClass}
                                    >
                                        <option value="">All services</option>
                                        {services.map((service) => (
                                            <option key={service.id} value={String(service.id)}>
                                                {service.type_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="reportFrom" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        From
                                    </label>
                                    <input
                                        id="reportFrom"
                                        type="date"
                                        value={fromDate}
                                        max={tillDate || undefined}
                                        onChange={(e) => setFromDate(e.target.value)}
                                        className={compactFilterClass}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="reportTill" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Till
                                    </label>
                                    <input
                                        id="reportTill"
                                        type="date"
                                        value={tillDate}
                                        min={fromDate || undefined}
                                        onChange={(e) => setTillDate(e.target.value)}
                                        className={compactFilterClass}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="reportStatus" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                        Status
                                    </label>
                                    <select
                                        id="reportStatus"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className={compactFilterClass}
                                    >
                                        {STATUS_FILTERS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                                {reportLoading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                                        Loading service records...
                                    </span>
                                ) : reportError ? (
                                    <span className="text-red-600">{reportError}</span>
                                ) : (
                                    <span>
                                        <span className="font-semibold text-navy">{filteredRecords.length}</span>
                                        {' '}records · {dateRangeLabel}
                                    </span>
                                )}
                                {hasRecordFilters && (
                                    <button
                                        type="button"
                                        onClick={clearRecordFilters}
                                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </section>
                        )}

                        {activeTab === 'monthly' && (
                            <ServiceRecordsTable
                                records={filteredRecords}
                                loading={reportLoading}
                                hasFilters={hasRecordFilters || searchTerm.trim() !== ''}
                                onView={setSelectedRecord}
                                onClear={clearRecordFilters}
                            />
                        )}

                        {activeTab === 'total-animals' && (
                            <>
                                <AnimalOwnersTable
                                    owners={filteredOwners}
                                    loading={reportLoading}
                                    hasFilters={hasAnimalFilters}
                                    onView={setSelectedOwner}
                                    onClear={clearAnimalFilters}
                                />
                                <AnimalTotalsBar totals={animalTotals} />
                            </>
                        )}

                        <p className="mt-4 hidden text-center text-xs text-gray-500 print:block print-footer">
                            Printed on {printedOn}
                        </p>
                    </main>
                </div>
            </div>

            {selectedRecord && (
                <ServiceRecordModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
            )}

            {selectedOwner && (
                <AnimalOwnerModal owner={selectedOwner} onClose={() => setSelectedOwner(null)} />
            )}
        </>
    );
}
