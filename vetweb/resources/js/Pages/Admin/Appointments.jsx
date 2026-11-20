import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { router, usePage } from '@inertiajs/react';
import Sidebar from '@/Components/Admin/Sidebar';
import OwnerApprovalBadge from '@/Components/Admin/OwnerApprovalBadge';
import { vaccineCoverageLabel } from '@/utils/vaccinationSchedule';
import AppointmentStatusHistory from '@/Components/Admin/AppointmentStatusHistory';
import AdministeredBySelect, { DEFAULT_ADMINISTERED_BY } from '@/Components/Admin/AdministeredBySelect';
import {
    OutsidePurchaseEditor,
    OutsidePurchaseSummary,
    buildVisitReceiptDetails,
    completedOutsidePurchaseItems,
    normalizeOutsidePurchaseStatus,
    createOutsidePurchaseLine,
    outsidePurchaseFieldErrors,
    printOutsidePurchaseReceipt,
    printSavedOutsideClinicReceipt,
} from '@/Components/Admin/OutsidePurchaseReceipt';
import MedicineVisitSummary from '@/Components/Admin/MedicineVisitSummary';
import axios from 'axios';
import { getEcho, subscribeToAppointments } from '@/utils/echo';
import { readAdminListCacheEntry, writeAdminListCache } from '@/utils/adminListCache';
import { sortAdminAppointmentsNewestFirst, sortAdminAppointmentsByHour, groupAdminAppointmentsByHour } from '@/utils/adminAppointmentSort';
import { autoInventoryCategoryLabel, filterGroupedInventoryByServices } from '@/utils/serviceInventoryCategories';
import { filterUsableInventory } from '@/utils/inventoryStock';
import { markBookingViewed, shouldShowNewBookingBadge } from '@/utils/adminViewedBookings';
import Tabs from '@/Components/Ui/Tabs';
import BookingSlotEditor from '@/Components/Admin/BookingSlotEditor';

const APPOINTMENTS_CACHE_KEY = 'admin:appointments:list:v5';

const ADMIN_PENDING_CANCELLATION_TEMPLATES = [
    'The clinic is unavailable on your scheduled date. Please book a new appointment.',
    'The veterinarian is unavailable for this time slot. Please choose another schedule.',
    'Your pet must be registered or exempt before we can proceed with this appointment.',
    'We are unable to accommodate this service on the requested date.',
    'Please rebook your appointment on a different available date.',
];

const ADMIN_APPROVED_LATE_CANCELLATION_TEMPLATES = [
    'You did not arrive on time or past your scheduled appointment time. Please book a new appointment.',
    'Your approved appointment was cancelled because you were not present during your scheduled time. Please rebook when ready.',
];

// Diri kuhaon ang mga template sa rason sa pag-cancel.
function getCancellationTemplates(status) {
    return status === 'approved'
        ? ADMIN_APPROVED_LATE_CANCELLATION_TEMPLATES
        : ADMIN_PENDING_CANCELLATION_TEMPLATES;
}

const VIOLET_CARD = {
    iconBg: 'bg-violet-100',
    iconText: 'text-violet-600',
    accent: 'bg-violet-500',
    ring: 'ring-violet-200',
    border: 'border-violet-600',
    hover: 'hover:border-violet-300',
};

const SERVICE_FILTER_ICONS = {
    all: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    deworming: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    vaccination: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    treatment: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    'vitamin supplement': 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
    spay: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    castration: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    default: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
};

const ALL_SERVICES_FILTER_CONFIG = {
    ...VIOLET_CARD,
    icon: SERVICE_FILTER_ICONS.all,
};

// Diri kuhaon ang icon ug kolor sa service filter.
function getServiceFilterConfig(serviceName) {
    const key = (serviceName || '').trim().toLowerCase();
    const icon = SERVICE_FILTER_ICONS[key] || SERVICE_FILTER_ICONS.default;
    return { ...VIOLET_CARD, icon };
}

const STATUS_FILTER_CONFIG = {
    all: {
        label: 'All Clinical Appointments',
        icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
        ...VIOLET_CARD,
    },
    today: {
        label: 'Today',
        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        ...VIOLET_CARD,
        border: 'border-violet-500',
    },
    pending: {
        label: 'Pending',
        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        ...VIOLET_CARD,
        border: 'border-violet-500',
    },
    approved: {
        label: 'Approved',
        icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        ...VIOLET_CARD,
    },
    processing: {
        label: 'Processing',
        icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
        ...VIOLET_CARD,
        border: 'border-violet-500',
    },
    ongoing: {
        label: 'Ongoing',
        icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        ...VIOLET_CARD,
        border: 'border-violet-500',
    },
    completed: {
        label: 'Completed',
        icon: 'M5 13l4 4L19 7',
        ...VIOLET_CARD,
    },
    cancelled: {
        label: 'Cancelled',
        icon: 'M6 18L18 6M6 6l12 12',
        iconBg: 'bg-violet-50',
        iconText: 'text-violet-400',
        accent: 'bg-violet-300',
        ring: 'ring-violet-100',
        border: 'border-violet-300',
        hover: 'hover:border-violet-200',
    },
};

// Diri himuon ang local nga petsa nga YYYY-MM-DD.
function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Diri kuhaon ang ngalan sa tag-iya para sa notice.
function getOwnerDisplayNameForNotice(user) {
    if (!user) return 'Client';
    const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ').trim();
    return fullName || user.name || 'Client';
}

// Diri kuhaon ang mga ngalan sa hayop sa appointment.
function getNoticePetNames(appointment) {
    const pets = Array.isArray(appointment?.pets) && appointment.pets.length > 0
        ? appointment.pets
        : (appointment?.pet ? [appointment.pet] : []);
    return pets.map((pet) => pet.name || pet.pet_name).filter(Boolean).join(', ') || null;
}

// Diri i-format ang petsa para sa notice.
function formatNoticeDate(dateStr) {
    if (!dateStr) return null;
    const [year, month, day] = String(dateStr).split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

// Diri i-format ang oras para sa notice.
function formatNoticeTime(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = String(timeStr).slice(0, 5).split(':').map(Number);
    if (!Number.isFinite(hours)) return timeStr;
    const date = new Date();
    date.setHours(hours, Number.isFinite(minutes) ? minutes : 0);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

// Diri ang usa ka row sa detalye sa notice.
function NoticeDetailRow({ label, value }) {
    if (!value) return null;

    return (
        <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-2 text-[13px] leading-5">
            <span className="pt-px text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
            <span className="break-words text-slate-700">{value}</span>
        </div>
    );
}

// Diri ang card sa appointment sa notice panel.
function AppointmentNoticeCard({ appointment, badge, barClass, onOpen }) {
    const ownerName = getOwnerDisplayNameForNotice(appointment.user);
    const service = (appointment.services || []).join(', ') || appointment.service || 'Appointment';
    const when = [formatNoticeDate(appointment.date), formatNoticeTime(appointment.time)].filter(Boolean).join(' · ');

    return (
        <article className="relative border-b border-slate-100 last:border-b-0">
            <span className={`absolute bottom-3 left-1.5 top-3 w-1.5 rounded-full ${barClass}`} />
            <button type="button" onClick={onOpen} className="block w-full py-3.5 pl-5 pr-4 text-left hover:bg-slate-50/80">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${badge.className}`}>
                    {badge.label}
                </span>
                <p className="mt-1.5 text-[15px] font-semibold leading-snug text-slate-900">{ownerName}</p>
                <div className="mt-2 space-y-1">
                    <NoticeDetailRow label="Pet" value={getNoticePetNames(appointment)} />
                    <NoticeDetailRow label="Service" value={service} />
                    <NoticeDetailRow label="When" value={when} />
                </div>
            </button>
        </article>
    );
}

// Diri ang dropdown sa mga notice sa pending ug karon.
function AppointmentPageNotices({ pendingItems, todayItems, onOpenPending, onOpenToday, onOpenAppointment }) {
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const noticeCount = pendingItems.length + todayItems.length;

    useEffect(() => {
        if (!open) return;

        // Diri sirado ang notice panel kung mo-click sa gawas.
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const todayGroups = groupAdminAppointmentsByHour(todayItems);

    return (
        <div className="relative" ref={panelRef}>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                aria-label="Appointment notices"
                aria-expanded={open}
            >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {noticeCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
                        {noticeCount > 99 ? '99+' : noticeCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 z-30 w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="border-b border-slate-100 px-4 py-3.5">
                        <p className="text-[15px] font-semibold text-slate-900">Appointment notices</p>
                        <p className="mt-0.5 text-[13px] leading-5 text-slate-500">Clinical appointments only</p>
                    </div>
                    <div className="max-h-[22rem] overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {noticeCount === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-slate-500">No appointment notices right now.</p>
                        ) : (
                            <>
                                {pendingItems.length > 0 && (
                                    <div className="border-b border-slate-100">
                                        <div className="flex items-center justify-between px-4 pt-3">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">Pending approval</p>
                                            <button type="button" onClick={() => { setOpen(false); onOpenPending(); }} className="text-[12px] font-semibold text-violet-700 hover:text-violet-800">
                                                View all
                                            </button>
                                        </div>
                                        {pendingItems.slice(0, 5).map((appointment) => (
                                            <AppointmentNoticeCard
                                                key={`pending-${appointment.id}`}
                                                appointment={appointment}
                                                badge={{ label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-200' }}
                                                barClass="bg-amber-500"
                                                onOpen={() => { setOpen(false); onOpenAppointment(appointment); }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {todayItems.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between px-4 pt-3">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Today by hour</p>
                                            <button type="button" onClick={() => { setOpen(false); onOpenToday(); }} className="text-[12px] font-semibold text-violet-700 hover:text-violet-800">
                                                View today
                                            </button>
                                        </div>
                                        {todayGroups.map((group) => (
                                            <div key={group.hour}>
                                                <p className="bg-violet-50/80 px-4 py-1.5 text-[12px] font-semibold text-violet-700">
                                                    {group.label}
                                                </p>
                                                {group.items.map((appointment) => (
                                                    <AppointmentNoticeCard
                                                        key={`today-${appointment.id}`}
                                                        appointment={appointment}
                                                        badge={{ label: appointment.status === 'pending' ? 'Pending' : 'Today', className: appointment.status === 'pending' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-violet-50 text-violet-800 ring-violet-200' }}
                                                        barClass={appointment.status === 'pending' ? 'bg-amber-500' : 'bg-violet-500'}
                                                        onOpen={() => { setOpen(false); onOpenAppointment(appointment); }}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const STATUS_BADGE = {
    pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    approved:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    cancelled:  'bg-red-50 text-red-600 ring-1 ring-red-100',
    ongoing:    'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
    completed:  'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    processing: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
};

const REGISTRATION_BADGE = {
    registered:   'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    exempt:         'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
    unregistered:   'bg-violet-50 text-violet-500 ring-1 ring-violet-100',
};

const TABLE_STATUS_OPTIONS = {
    approved: [
        { value: 'approved', label: 'Approved' },
        { value: 'processing', label: 'Processing' },
        { value: 'cancelled', label: 'Cancel (Late)' },
    ],
};

// Diri ang mga field sa rason sa pag-cancel.
function CancellationReasonFields({
    cancelReason,
    setCancelReason,
    cancelError,
    setCancelError,
    fieldId = 'cancel-reason',
    templates = ADMIN_PENDING_CANCELLATION_TEMPLATES,
    helperText = null,
    placeholder = 'Explain why this appointment is being cancelled. The client will receive this message.',
}) {
    return (
        <div>
            {helperText && (
                <p className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
                    {helperText}
                </p>
            )}
            <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-gray-700">
                Cancellation reason
            </label>
            {templates.length > 0 && (
                <>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Message templates
                    </p>
                    <div className="mb-3 flex flex-wrap gap-2">
                        {templates.map((template) => {
                            const isSelected = cancelReason.trim() === template;

                            return (
                                <button
                                    key={template}
                                    type="button"
                                    onClick={() => {
                                        setCancelReason(template);
                                        if (cancelError) setCancelError('');
                                    }}
                                    className={`rounded-full border px-3 py-1.5 text-left text-xs leading-5 transition-colors ${
                                        isSelected
                                            ? 'border-violet-300 bg-violet-50 text-violet-800'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:bg-violet-50/60'
                                    }`}
                                >
                                    {template}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {templates.length > 0 ? 'Your message' : 'Message'}
            </p>
            <textarea
                id={fieldId}
                value={cancelReason}
                onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelError) setCancelError('');
                }}
                className={`w-full resize-none rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                    cancelError
                        ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                        : 'border-gray-200 focus:border-red-300 focus:ring-red-100'
                }`}
                rows="3"
                placeholder={placeholder}
                autoFocus
            />
            {cancelError && (
                <p className="mt-1.5 text-xs text-red-600">{cancelError}</p>
            )}
        </div>
    );
}


// Diri ang gamay nga card sa filter nga naay count.
function CompactFilterCard({ label, count, active, onClick, cfg }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative inline-flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 transition-all ${
                active
                    ? `${cfg.border} bg-white shadow-sm ring-1 ${cfg.ring}`
                    : `border-gray-200 bg-white ${cfg.hover}`
            }`}
        >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                <svg className={`h-4 w-4 ${cfg.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={cfg.icon} />
                </svg>
            </div>
            <div className="min-w-0 text-left">
                <p className="max-w-[7rem] truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <p className="text-base font-bold leading-none tabular-nums text-gray-900">{count}</p>
            </div>
            {active && <span className={`absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl ${cfg.accent}`} />}
        </button>
    );
}

// Diri ang filter card sa status.
function StatusFilterCard({ statusKey, count, active, onClick }) {
    const cfg = STATUS_FILTER_CONFIG[statusKey];
    return (
        <CompactFilterCard
            label={cfg.label}
            count={count}
            active={active === statusKey}
            onClick={onClick}
            cfg={cfg}
        />
    );
}

// Diri ang filter card sa klase sa service.
function ServiceTypeCard({ serviceName, count, active, onClick }) {
    const cfg = getServiceFilterConfig(serviceName);
    return (
        <CompactFilterCard
            label={serviceName}
            count={count}
            active={active}
            onClick={onClick}
            cfg={cfg}
        />
    );
}

// Diri kuhaon ang ngalan sa barangay.
function getBarangayName(barangay) {
    if (!barangay) return null;
    if (typeof barangay === 'string') return barangay;
    if (typeof barangay === 'object' && barangay.name) return barangay.name;
    return null;
}

// Diri kuhaon ang ngalan sa zone.
function getZoneName(zone) {
    if (!zone) return null;
    if (typeof zone === 'string') return zone;
    if (typeof zone === 'object' && zone.name) return zone.name;
    return null;
}

// Diri ang badge sa ID number sa hayop.
function PetIdBadge({ pet, className = '' }) {
    if (pet?.identification_number) {
        return (
            <span className={`inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100 ${className}`}>
                {pet.identification_number}
            </span>
        );
    }
    if (pet?.registration_status === 'exempt') {
        return <p className={`text-[10px] text-gray-400 ${className}`}>No ID needed</p>;
    }
    return <p className={`text-[10px] text-gray-400 ${className}`}>No ID yet</p>;
}

// Diri kuhaon ang mga hayop sa appointment.
function getAppointmentPets(appointment) {
    if (Array.isArray(appointment?.pets) && appointment.pets.length > 0) {
        return appointment.pets;
    }
    return appointment?.pet ? [appointment.pet] : [];
}

// Diri kuhaon ang mga hayop nga pwede pa matambalan.
function getTreatablePets(appointment) {
    return getAppointmentPets(appointment).filter(
        (pet) => getPetBookingStatus(pet, appointment) !== 'cancelled'
    );
}

// Diri himuon ang bag-ong draft sa treatment sa hayop.
function createTreatmentDraft(pet = null) {
    const weight = pet?.weight;
    return {
        selectedInventoryItems: [],
        treatmentPetWeight: weight && weight !== '0' && weight !== 0
            ? formatDisplayNumber(weight)
            : '',
        administeredBy: DEFAULT_ADMINISTERED_BY,
        calculatedDosages: {},
        selectedInventoryCategory: '',
        outsidePurchaseItems: [createOutsidePurchaseLine()],
        errors: {},
    };
}

// Diri kuhaon ang mga tambal nga gigamit sa hayop.
function getPetTreatmentItems(appointment, pet) {
    if (Array.isArray(pet?.treatment_items) && pet.treatment_items.length > 0) {
        return pet.treatment_items;
    }
    const items = appointment?.treatment_items || [];
    if (!pet?.id) return items;
    const assigned = items.filter((item) => item.animal_id != null);
    if (assigned.length > 0) {
        return items.filter((item) => Number(item.animal_id) === Number(pet.id));
    }
    const primaryId = appointment?.pets?.[0]?.id ?? appointment?.pet?.id;
    return Number(primaryId) === Number(pet.id) ? items : [];
}

// Diri kuhaon kinsa ang nag-administer sa tambal.
function getPetAdministeredBy(appointment, pet) {
    if (pet?.administered_by) return pet.administered_by;
    if (appointment?.administered_by) return appointment.administered_by;
    const names = (appointment?.assigned_fieldmen || [])
        .map((fieldman) => fieldman?.name)
        .filter(Boolean);
    return names.length > 0 ? names.join(', ') : null;
}

// Diri kuhaon ang booking status sa hayop.
function getPetBookingStatus(pet, appointment) {
    if (pet?.booking_status === 'cancelled') {
        return 'cancelled';
    }
    const appointmentStatus = appointment?.status;
    if (['processing', 'ongoing', 'completed'].includes(appointmentStatus) && pet?.booking_status !== 'pending') {
        return appointmentStatus;
    }
    return pet?.booking_status || appointmentStatus || 'pending';
}

// Diri ihapon ang mga status sa mga hayop.
function countPetStatuses(appointment) {
    const pets = getAppointmentPets(appointment);
    const counts = { approved: 0, cancelled: 0, pending: 0, total: pets.length };

    pets.forEach((pet) => {
        const status = getPetBookingStatus(pet, appointment);
        if (status === 'cancelled') counts.cancelled += 1;
        else if (status === 'approved') counts.approved += 1;
        else if (status === 'pending') counts.pending += 1;
    });

    return counts;
}

// Diri kuhaon ang mga hayop nga pwede pa i-approve o i-cancel.
function getActionablePets(appointment, { statuses = ['pending', 'approved'] } = {}) {
    if (!['pending', 'approved'].includes(appointment?.status)) {
        return [];
    }

    return getAppointmentPets(appointment).filter((pet) => {
        const petStatus = getPetBookingStatus(pet, appointment);
        return statuses.includes(petStatus);
    });
}

// Diri himuon ang label sa status sa appointment.
function formatAppointmentStatusLabel(appointment) {
    const workflowStatuses = ['processing', 'ongoing', 'completed'];
    if (workflowStatuses.includes(appointment?.status)) {
        const status = appointment.status;
        return status.charAt(0).toUpperCase() + status.slice(1);
    }

    if (appointment?.status_summary) {
        return appointment.status_summary;
    }

    const pets = getAppointmentPets(appointment);
    if (pets.length === 0) {
        const status = appointment?.status;
        return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
    }

    const { approved, cancelled, pending, total } = countPetStatuses(appointment);

    if (cancelled === total) return 'All Cancelled';
    if (approved === total) return 'All Approved';
    if (pending === total) return 'Pending';

    if (approved > 0 && pending > 0 && cancelled === 0) {
        return 'Partially Approved';
    }

    const parts = [];
    if (approved > 0) parts.push(`${approved} Approved`);
    if (pending > 0) parts.push(`${pending} Pending`);
    if (cancelled > 0) parts.push(`${cancelled} Cancelled`);

    if (parts.length > 0) {
        return parts.join(', ');
    }

    const status = appointment?.status;
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
}

// Diri i-check kung pwede ma-approve ang hayop.
function canApprovePet(pet) {
    return pet?.registration_status === 'registered' || pet?.registration_status === 'exempt';
}

// Diri himuon ang date key sa local nga petsa.
function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Diri i-check kung karon ang adlaw sa appointment.
function isAppointmentScheduleDay(appointment) {
    const scheduleDate = appointment?.date;
    if (!scheduleDate) {
        return false;
    }

    return scheduleDate.slice(0, 10) === getLocalDateKey();
}

// Diri i-check kung pwede ang late cancel sa appointment.
function canLateCancelAppointment(appointment) {
    return appointment?.status === 'approved' && isAppointmentScheduleDay(appointment);
}

// Diri i-check kung late cancel ang aksyon sa hayop.
function isLateCancelPetAction(appointment, pet) {
    const petStatus = getPetBookingStatus(pet, appointment);
    return appointment?.status === 'approved' && petStatus === 'approved';
}

// Diri i-check kung ipakita ang cancel button sa hayop.
function canShowPetCancelAction(appointment, pet) {
    const appointmentStatus = appointment?.status;
    const petStatus = getPetBookingStatus(pet, appointment);

    if (!['pending', 'approved'].includes(appointmentStatus)) {
        return false;
    }

    if (petStatus === 'pending') {
        return true;
    }

    if (petStatus === 'approved') {
        return canLateCancelAppointment(appointment);
    }

    return false;
}

// Diri i-check kung pwede mapili ang hayop sa bulk action.
function canSelectPetForBulkActions(appointment, pet) {
    const appointmentStatus = appointment?.status;
    const petStatus = getPetBookingStatus(pet, appointment);

    if (!['pending', 'approved'].includes(appointmentStatus)) {
        return false;
    }

    if (petStatus === 'pending') {
        return true;
    }

    if (petStatus === 'approved') {
        return canLateCancelAppointment(appointment);
    }

    return false;
}

// Diri kuhaon ang mga option sa status sa table.
function getTableStatusOptions(appointment) {
    const options = TABLE_STATUS_OPTIONS[appointment?.status];
    if (!options) {
        return null;
    }

    if (appointment.status === 'approved' && !isAppointmentScheduleDay(appointment)) {
        return options.filter((option) => option.value !== 'cancelled' && option.value !== 'processing');
    }

    return options;
}

// Diri kuhaon ang kolor sa status.
function getStatusTone(status) {
    switch (status) {
        case 'approved':
            return { wrap: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500', chevron: 'text-emerald-500' };
        case 'pending':
            return { wrap: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500', chevron: 'text-amber-500' };
        case 'processing':
            return { wrap: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500', chevron: 'text-violet-500' };
        case 'ongoing':
            return { wrap: 'bg-orange-50 text-orange-800 ring-orange-200', dot: 'bg-orange-500', chevron: 'text-orange-500' };
        case 'completed':
            return { wrap: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-500', chevron: 'text-slate-400' };
        case 'cancelled':
            return { wrap: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', chevron: 'text-red-400' };
        default:
            return { wrap: 'bg-slate-50 text-slate-700 ring-slate-200', dot: 'bg-slate-400', chevron: 'text-slate-400' };
    }
}

// Diri ang dropdown sa status sa table.
function TableStatusControl({ appointment, disabled = false, onChange }) {
    const statusLabel = formatAppointmentStatusLabel(appointment);
    const options = getTableStatusOptions(appointment);
    const tone = getStatusTone(appointment?.status);

    if (!options) {
        return (
            <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold ring-1 ${tone.wrap}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                <span className="truncate">{statusLabel}</span>
            </span>
        );
    }

    return (
        <div className={`relative inline-flex min-w-[8.75rem] max-w-full items-center rounded-full py-1.5 pl-2.5 pr-7 ring-1 ${tone.wrap} ${disabled ? 'opacity-50' : ''}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <span className="ml-1.5 truncate text-xs font-semibold">{statusLabel}</span>
            <svg className={`pointer-events-none absolute right-2 h-3.5 w-3.5 ${tone.chevron}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
            <select
                value={appointment.status}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                aria-label={`Change status (${statusLabel})`}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

// Diri ang modal sa pagpili og fieldman para processing.
function ProcessingFieldmanModal({ open, onClose, onConfirm, processing = false }) {
    const [fieldmen, setFieldmen] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) {
            setSelectedId('');
            setError('');
            return;
        }

        let cancelled = false;
        setLoading(true);

        axios.get('/api/admin/treatment-staff')
            .then((response) => {
                if (cancelled) return;
                const staff = Array.isArray(response.data?.staff) ? response.data.staff : [];
                setFieldmen(staff.filter((member) => member?.role === 'fieldman' && member?.name));
            })
            .catch((fetchError) => {
                if (!cancelled) {
                    console.error('Failed to fetch fieldmen:', fetchError);
                    setFieldmen([]);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open]);

    if (!open) return null;

    // Diri i-confirm ang napiling fieldman.
    const submit = () => {
        const fieldman = fieldmen.find((member) => String(member.id) === String(selectedId));
        if (selectedId !== 'doc' && !fieldman) {
            setError('Please select who will administer this appointment.');
            return;
        }

        onConfirm(selectedId === 'doc'
            ? { administered_by: DEFAULT_ADMINISTERED_BY }
            : {
                assigned_fieldman_id: fieldman.id,
                administered_by: fieldman.name,
            });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                <div className="border-b border-violet-100 px-6 py-4">
                    <h2 className="text-lg font-bold text-gray-900">Mark as Processing</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Choose who will administer this clinic appointment. A fieldman selection appears on that fieldman&apos;s account today.
                    </p>
                </div>
                <div className="space-y-4 px-6 py-5">
                    <div>
                        <label htmlFor="processing-fieldman" className="mb-2 block text-sm font-medium text-gray-700">
                            Administered by
                        </label>
                        <select
                            id="processing-fieldman"
                            value={selectedId}
                            disabled={loading || processing}
                            onChange={(event) => {
                                setSelectedId(event.target.value);
                                if (error) setError('');
                            }}
                            className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 disabled:cursor-wait disabled:bg-gray-50 ${
                                error
                                    ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                                    : 'border-gray-200 focus:border-violet-300 focus:ring-violet-100'
                            }`}
                        >
                            <option value="" disabled>{loading ? 'Loading staff...' : 'Select who will administer'}</option>
                            <option value="doc">{DEFAULT_ADMINISTERED_BY}</option>
                            {fieldmen.map((fieldman) => (
                                <option key={fieldman.id} value={fieldman.id}>
                                    {fieldman.role_label ? `${fieldman.name} (${fieldman.role_label})` : fieldman.name}
                                </option>
                            ))}
                        </select>
                        {error && (
                            <p className="mt-1.5 text-xs text-red-600">{error}</p>
                        )}
                    </div>
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={processing}
                            className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={processing || loading}
                            className="flex flex-1 items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
                        >
                            {processing ? 'Processing...' : 'Confirm Processing'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Diri ang dialog sa pag-confirm.
function ConfirmDialog({ open, title, message, confirmLabel, confirmTone = 'primary', onConfirm, onCancel, processing = false }) {
    if (!open) return null;

    const confirmClasses = confirmTone === 'danger'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-violet-600 hover:bg-violet-700';

    return (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                <div className="border-b border-violet-100 px-6 py-4">
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{message}</p>
                </div>
                <div className="flex flex-col gap-2.5 px-6 py-5 sm:flex-row">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={processing}
                        className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                        Go back
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={processing}
                        className={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50 ${confirmClasses}`}
                    >
                        {processing ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Diri ang card sa hayop nga naka-book.
function BookedPetCard({
    pet,
    appointment,
    isActive,
    isSelected,
    canSelect,
    serviceNames,
    petBusy,
    treatmentHint,
    compact = false,
    onSelectPet,
    onToggleSelect,
    onApprove,
    onCancel,
}) {
    const petServices = Array.isArray(pet.services) && pet.services.length > 0 ? pet.services : serviceNames;
    const petStatus = getPetBookingStatus(pet, appointment);
    const appointmentStatus = appointment?.status;
    const canShowPetApprove = ['pending', 'approved'].includes(appointmentStatus) && petStatus === 'pending';
    const canShowPetCancel = canShowPetCancelAction(appointment, pet);
    const showLateCancelLabel = isLateCancelPetAction(appointment, pet) && canLateCancelAppointment(appointment);
    const speciesName = typeof pet.species === 'string'
        ? pet.species
        : (pet.species?.species_name || pet.species_name || null);
    const breedName = typeof pet.breed === 'string'
        ? pet.breed
        : (pet.breed?.breed_name || pet.breed_name || null);
    const animalType = [speciesName, breedName].filter(Boolean).join(' · ') || '—';
    const statusLabel = petStatus.charAt(0).toUpperCase() + petStatus.slice(1);

    const petName = pet.name || pet.pet_name || 'Unknown';
    const petIdLabel = pet.identification_number
        || (pet.registration_status === 'exempt' ? 'No ID needed' : 'No ID yet');
    const registrationLabel = getRegistrationLabel(pet.registration_status);

    if (compact) {
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectPet(pet.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectPet(pet.id);
                    }
                }}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isActive
                        ? 'border-teal bg-teal/5 ring-1 ring-teal/20'
                        : 'border-line bg-white hover:border-teal/40 hover:bg-canvas'
                }`}
            >
                <div className="flex items-start gap-2.5">
                    {canSelect ? (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(pet.id)}
                            onClick={(event) => event.stopPropagation()}
                            className="mt-1 rounded border-gray-300 text-teal focus:ring-teal"
                            aria-label={`Select ${petName}`}
                        />
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{petName}</p>
                            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                STATUS_BADGE[petStatus] || STATUS_BADGE.pending
                            }`}>
                                {statusLabel}
                            </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                            {petIdLabel}
                            {animalType !== '—' ? ` · ${animalType}` : ''}
                            {registrationLabel ? ` · ${registrationLabel}` : ''}
                        </p>
                        {petServices.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {petServices.map((name) => (
                                    <span
                                        key={name}
                                        className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-navy ring-1 ring-line"
                                    >
                                        {name}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {treatmentHint ? (
                            <p className={`mt-1.5 text-xs font-medium ${
                                treatmentHint.ready ? 'text-teal' : 'text-amber-700'
                            }`}>
                                {treatmentHint.ready
                                    ? `${treatmentHint.itemCount} item${treatmentHint.itemCount === 1 ? '' : 's'} selected`
                                    : 'Select medicines'}
                            </p>
                        ) : null}
                        {pet.cancellation_reason && petStatus === 'cancelled' ? (
                            <p className="mt-1.5 line-clamp-2 text-xs text-red-700">{pet.cancellation_reason}</p>
                        ) : null}
                        {canShowPetApprove ? (
                            <div className="mt-2 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
                                <button
                                    type="button"
                                    onClick={() => onApprove(pet)}
                                    disabled={petBusy || !canApprovePet(pet)}
                                    title={!canApprovePet(pet) ? 'Pet must be registered or exempt first' : 'Approve this animal'}
                                    className="inline-flex items-center rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50"
                                >
                                    {petBusy ? 'Saving...' : 'Approve'}
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectPet(pet.id)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectPet(pet.id);
                }
            }}
            className={`rounded-lg border bg-white px-4 py-4 text-left transition-colors ${
                isActive
                    ? 'border-teal bg-teal/5 shadow-sm'
                    : 'border-line hover:border-teal/40 hover:bg-canvas'
            }`}
        >
            <div className="flex items-start gap-3">
                {canSelect ? (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(pet.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1.5 rounded border-gray-300 text-teal focus:ring-teal"
                        aria-label={`Select ${petName}`}
                    />
                ) : null}
                <div className={`grid min-w-0 flex-1 ${
                    compact
                        ? 'grid-cols-1 gap-3'
                        : 'gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-start'
                }`}>
                    <div className="min-w-0">
                        <p className="text-base font-semibold text-navy">{petName}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                            {petIdLabel}
                            {animalType !== '—' ? ` · ${animalType}` : ''}
                        </p>
                        {registrationLabel ? (
                            <p className="mt-1 text-sm font-medium text-teal">{registrationLabel}</p>
                        ) : null}
                    </div>

                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Services</p>
                        <p className="mt-1 text-sm leading-relaxed text-navy">
                            {petServices.length > 0 ? petServices.join(', ') : '—'}
                        </p>
                    </div>

                    <div className={compact ? '' : 'sm:pt-0.5 sm:text-right'}>
                        <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
                            STATUS_BADGE[petStatus] || STATUS_BADGE.pending
                        }`}>
                            {statusLabel}
                        </span>
                    </div>
                </div>
            </div>

            {treatmentHint ? (
                <p className={`mt-3 text-sm font-medium ${
                    treatmentHint.ready ? 'text-teal' : 'text-amber-700'
                }`}>
                    {treatmentHint.ready
                        ? `${treatmentHint.itemCount} item${treatmentHint.itemCount === 1 ? '' : 's'} selected`
                        : 'Select medicines for this animal'}
                </p>
            ) : null}

            {pet.cancellation_reason && petStatus === 'cancelled' ? (
                <p className="mt-3 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-sm text-red-800">
                    {pet.cancellation_reason}
                </p>
            ) : null}

            {canShowPetApprove || canShowPetCancel ? (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                    {canShowPetApprove ? (
                        <button
                            type="button"
                            onClick={() => onApprove(pet)}
                            disabled={petBusy || !canApprovePet(pet)}
                            title={!canApprovePet(pet) ? 'Pet must be registered or exempt first' : 'Approve this animal'}
                            className="inline-flex items-center rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50"
                        >
                            {petBusy ? 'Saving...' : 'Approve'}
                        </button>
                    ) : null}
                    {canShowPetCancel ? (
                        <button
                            type="button"
                            onClick={() => onCancel(pet)}
                            disabled={petBusy}
                            className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                            {showLateCancelLabel ? 'Cancel (Late)' : 'Cancel'}
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

// Diri ang button nga mata para tan-awon ang detalye.
function EyeActionButton({ onClick, label = 'View details' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
            title={label}
            aria-label={label}
        >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
        </button>
    );
}

// Diri ang card sulod sa modal nga naay title.
function ModalCard({ title, subtitle, children, className = '', bodyClassName = 'p-4' }) {
    return (
        <section className={`overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm ${className}`}>
            <div className="flex items-center gap-3 border-b border-violet-50 px-4 py-3.5">
                <span className="h-8 w-1 rounded-full bg-violet-600" />
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
                </div>
            </div>
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}

const MODAL_HEADER_BG = 'bg-gradient-to-br from-violet-50/70 via-white to-white';

// Diri kuhaon ang label sa registration status.
function getRegistrationLabel(status) {
    if (status === 'registered') return 'Registered';
    if (status === 'exempt') return 'Exempt';
    if (status === 'unregistered') return 'Unregistered';
    return null;
}

// Diri kuhaon ang ngalan sa tag-iya.
function getOwnerDisplayName(user) {
    if (!user) return 'Unknown';
    if (user.firstname) return `${user.firstname} ${user.lastname || ''}`.trim();
    return user.name || 'Unknown';
}

// Diri kuhaon ang initials sa tag-iya.
function getOwnerInitials(user) {
    if (!user) return '?';
    const first = user.firstname?.trim?.() || '';
    const last = user.lastname?.trim?.() || '';
    if (first && last) return (first[0] + last[0]).toUpperCase();
    if (first) return first.charAt(0).toUpperCase();
    const name = user.name?.trim?.() || '';
    if (!name) return '?';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
}

// Diri limpyohan ang URL sa litrato.
function normalizeMediaUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
    return value.startsWith('/') ? value : `/${value}`;
}

// Diri ang avatar nga litrato o initials.
function AvatarImage({ src, alt, fallback, sizeClass = 'h-9 w-9', roundedClass = 'rounded-full' }) {
    const normalized = normalizeMediaUrl(src);
    if (normalized) {
        return (
            <img
                src={normalized}
                alt={alt}
                className={`${sizeClass} ${roundedClass} shrink-0 border border-gray-200 object-cover`}
            />
        );
    }
    return (
        <div className={`flex ${sizeClass} shrink-0 items-center justify-center ${roundedClass} bg-gradient-to-br from-violet-100 to-violet-200 text-sm font-semibold text-violet-700`}>
            {fallback}
        </div>
    );
}

// Diri ang header sa section sa view.
function ViewSectionHeader({ title, subtitle }) {
    return (
        <div className="mb-4">
            <h3 className="text-base font-semibold text-navy">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p> : null}
        </div>
    );
}

// Diri ang panel sa mga tambal nga gigamit.
function MedicineUsedPanel({ petName, administeredBy, items = [], outsideItems = [], onPrintOutside }) {
    const subtitle = items.length > 0
        ? `Inventory items recorded for ${petName}`
        : outsideItems.length > 0
            ? `Outside clinic recorded for ${petName}`
            : `Inventory items recorded for ${petName}`;

    return (
        <section className="rounded-lg border border-line bg-white p-5">
            <ViewSectionHeader
                title="Medicine Used"
                subtitle={subtitle}
            />
            {administeredBy ? (
                <p className="mb-3 text-sm text-muted">
                    Administered by{' '}
                    <span className="font-semibold text-navy">{administeredBy}</span>
                </p>
            ) : null}
            {items.length > 0 ? (
                <div className="space-y-2">
                    {items.map((item, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-4 py-3"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-navy">{item.medicine_name}</p>
                                <p className="text-sm text-muted">{item.unit_name}</p>
                            </div>
                            <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-sm font-semibold text-teal ring-1 ring-line">
                                {item.quantity_used}
                            </span>
                        </div>
                    ))}
                </div>
            ) : outsideItems.length === 0 ? (
                <p className="text-sm text-muted">No medicines recorded for {petName}.</p>
            ) : null}
            <OutsidePurchaseSummary items={outsideItems} onPrint={onPrintOutside} />
        </section>
    );
}

// Diri ang row sa info nga naay label ug value.
function ViewInfoRow({ label, value }) {
    if (value == null || value === '') return null;
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
        </div>
    );
}

// Diri ang panel sa litrato sa hayop.
function AnimalPhotoPanel({ label, photoUrl, onPreview }) {
    const normalized = normalizeMediaUrl(photoUrl);
    return (
        <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            {normalized ? (
                <button
                    type="button"
                    onClick={() => onPreview(normalized, label)}
                    className="group relative block w-full overflow-hidden rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                    <img
                        src={normalized}
                        alt={label}
                        className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        Click to enlarge
                    </span>
                </button>
            ) : (
                <div className="flex min-h-[7.5rem] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-400">
                    No {label.toLowerCase()} uploaded
                </div>
            )}
        </div>
    );
}

// Diri ang overlay sa preview sa litrato.
function PhotoPreviewOverlay({ preview, onClose }) {
    if (!preview?.open || !preview?.url) return null;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">{preview.label || 'Photo Preview'}</p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="max-h-[calc(90vh-4rem)] overflow-auto bg-gray-950 p-3">
                    <img
                        src={preview.url}
                        alt={preview.label || 'Preview'}
                        className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
                    />
                </div>
            </div>
        </div>
    );
}

// Diri i-format ang medical label nga readable.
function formatMedicalLabel(value) {
    if (value === null || value === undefined || value === '') return '—';
    return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Diri i-format ang medical nga petsa.
function formatMedicalDate(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Diri ang card sa health status sa hayop.
function HealthStatCard({ title, status, detail, date }) {
    const normalized = (status || '').toLowerCase();
    const badge = normalized === 'yes'
        ? 'bg-emerald-100 text-emerald-700'
        : normalized === 'no'
            ? 'bg-red-100 text-red-700'
            : 'bg-gray-100 text-gray-500';
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
                {status ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge}`}>
                        {formatMedicalLabel(status)}
                    </span>
                ) : null}
            </div>
            <p className="text-sm font-semibold text-gray-900">{detail}</p>
            {date && date !== '-' && date !== '—' ? <p className="mt-0.5 text-xs text-gray-500">{date}</p> : null}
        </div>
    );
}

// Diri i-format ang numero para ipakita.
function formatDisplayNumber(value) {
    if (value == null || value === '') return '0';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    if (Number.isInteger(num)) return String(num);
    return String(parseFloat(num.toFixed(3)));
}

// Diri ang mga section sa medical info sa hayop.
function PetMedicalSections({ pet, owner, medical, loading = false, onPreview, showOwner = true, variant = 'full' }) {
    if (!pet) return null;

    const showPhotos = variant !== 'history';
    const showProfile = variant !== 'history';
    const showMedical = variant !== 'history';
    const showHistory = true;

    const profile = medical?.profile || medical?.medical_profile || {};
    // Diri kuhaon ang value gikan sa profile o sa hayop.
    const pick = (key) => profile[key] ?? pet?.[key] ?? null;
    const ownerName = getOwnerDisplayName(owner);
    const speciesName = typeof pet.species === 'string'
        ? pet.species
        : (pet.species?.species_name || pet.species_name || '—');
    const breedName = typeof pet.breed === 'string'
        ? pet.breed
        : (pet.breed?.breed_name || pet.breed_name || '—');
    const history = medical?.history || [];
    const otherVaccine = pick('other_vaccine_name');
    const hasOtherVaccine = Boolean(otherVaccine && String(otherVaccine).trim());

    return (
        <div className="space-y-4">
            {showPhotos ? (
            <section className="rounded-xl border border-line bg-white p-4">
                <ViewSectionHeader title="Photos" subtitle="Animal photo and unique markings" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AnimalPhotoPanel label="Animal Photo" photoUrl={pet.pet_photo_url} onPreview={onPreview} />
                    <AnimalPhotoPanel label="Unique Markings Photo" photoUrl={pet.markings_photo_url} onPreview={onPreview} />
                </div>
                {pet.markings ? (
                    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Markings Description</p>
                        <p className="mt-1 text-sm leading-relaxed text-gray-800">{pet.markings}</p>
                    </div>
                ) : null}
            </section>
            ) : null}

            <div className="grid grid-cols-1 gap-4">
                {showOwner ? (
                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <ViewSectionHeader title="Owner Information" subtitle="Client contact and location" />
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                        <AvatarImage
                            src={owner?.profile_photo_url}
                            alt={ownerName}
                            fallback={getOwnerInitials(owner)}
                            sizeClass="h-12 w-12"
                            roundedClass="rounded-xl"
                        />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900">{ownerName}</p>
                                <OwnerApprovalBadge user={owner} />
                            </div>
                            {owner?.email ? <p className="truncate text-xs text-gray-500">{owner.email}</p> : null}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ViewInfoRow label="Full Name" value={ownerName} />
                        <ViewInfoRow label="Phone" value={owner?.phone_number} />
                        <ViewInfoRow label="Email" value={owner?.email} />
                        <ViewInfoRow label="Barangay" value={getBarangayName(owner?.barangay)} />
                        <ViewInfoRow label="Zone" value={getZoneName(owner?.zone)} />
                    </div>
                </section>
                ) : null}

                {showProfile ? (
                <section className="rounded-xl border border-line bg-white p-4">
                    <ViewSectionHeader title="Animal Profile" subtitle="Physical details and registration" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ViewInfoRow
                            label="Identification No."
                            value={pet.identification_number || (pet.registration_status === 'exempt' ? 'No ID needed' : '—')}
                        />
                        <ViewInfoRow label="Species" value={speciesName} />
                        <ViewInfoRow label="Breed" value={breedName} />
                        <ViewInfoRow label="Color" value={pet.color} />
                        <ViewInfoRow label="Sex" value={pet.sex ? formatMedicalLabel(pet.sex) : null} />
                        <ViewInfoRow label="Birthdate" value={formatMedicalDate(pet.birthdate)} />
                        <ViewInfoRow
                            label="Weight"
                            value={pet.weight != null && pet.weight !== '' ? `${formatDisplayNumber(pet.weight)} kg` : null}
                        />
                        <ViewInfoRow
                            label="Registration"
                            value={pet.registration_status ? getRegistrationLabel(pet.registration_status) : null}
                        />
                    </div>
                </section>
                ) : null}
            </div>

            {showMedical ? (
            <section className="rounded-xl border border-line bg-white p-4">
                <ViewSectionHeader title="Medical Profile" subtitle="Reproductive status, diet, deworming, and vaccinations" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <HealthStatCard
                        title="Reproductive"
                        detail={formatMedicalLabel(pick('reproductive_status'))}
                        date={pick('weeks_months') ? `Duration: ${pick('weeks_months')}` : null}
                    />
                    <HealthStatCard
                        title="Diet"
                        detail={formatMedicalLabel(pick('diet'))}
                        date={pick('diet_other') || null}
                    />
                    <HealthStatCard
                        title="Deworming"
                        status={pick('dewormed')}
                        detail={pick('dewormed') === 'yes'
                            ? (pick('dewormer_name') || 'Recorded')
                            : pick('dewormed') === 'no' ? 'Not dewormed' : '—'}
                        date={pick('dewormed') === 'yes' ? formatMedicalDate(pick('last_deworming_date')) : null}
                    />
                    <HealthStatCard
                        title="Rabies Vaccine"
                        status={pick('rabies_vaccine')}
                        detail={pick('rabies_vaccine') === 'yes'
                            ? 'Vaccinated'
                            : pick('rabies_vaccine') === 'no' ? 'Not vaccinated' : '—'}
                        date={pick('rabies_vaccine') === 'yes' ? vaccineCoverageLabel(pick('rabies_last_vaccination'), pick('rabies_dose_type')) : null}
                    />
                    <HealthStatCard
                        title="DHPPL Vaccine"
                        status={pick('dhppl_vaccine')}
                        detail={pick('dhppl_vaccine') === 'yes'
                            ? 'Vaccinated'
                            : pick('dhppl_vaccine') === 'no' ? 'Not vaccinated' : '—'}
                        date={pick('dhppl_vaccine') === 'yes' ? vaccineCoverageLabel(pick('dhppl_last_vaccination'), pick('dhppl_dose_type')) : null}
                    />
                    {hasOtherVaccine ? (
                        <HealthStatCard
                            title="Other Vaccine"
                            detail={String(otherVaccine).trim()}
                            date={vaccineCoverageLabel(pick('other_vaccine_last_vaccination'), pick('other_vaccine_dose_type'))}
                        />
                    ) : null}
                </div>
            </section>
            ) : null}

            {showHistory ? (
            <section className="rounded-xl border border-line bg-white p-4">
                <ViewSectionHeader
                    title={`Medical History${medical?.historyCount || medical?.history_count ? ` (${medical.historyCount || medical.history_count})` : ''}`}
                    subtitle="Past treatments, vaccines, and services"
                />
                {loading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                        Loading medical history...
                    </div>
                ) : history.length ? (
                    <div className="space-y-2">
                        {history.map((entry, index) => (
                            <div key={`${entry.id}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                                        {index + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900">{entry.service_type}</p>
                                        <p className="mt-0.5 text-xs text-gray-500">
                                            {entry.booking_type_label ? `${entry.booking_type_label} · ` : ''}
                                            {formatMedicalDate(entry.treatment_date) || formatMedicalDate(entry.created_at) || '—'}
                                            {entry.treatment_time ? ` · ${entry.treatment_time}` : ''}
                                            {entry.administered_by ? ` · ${entry.administered_by}` : ''}
                                        </p>
                                        {entry.notes ? (
                                            <p className="mt-1 text-sm leading-relaxed text-gray-700">{entry.notes}</p>
                                        ) : null}
                                        {entry.medicines?.length ? (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {entry.medicines.map((m, i) => (
                                                    <span key={i} className="inline-flex rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-100">
                                                        {m.medicine_name}{m.quantity ? ` · ${formatDisplayNumber(m.quantity)}${m.unit ? ` ${m.unit}` : ''}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        {entry.outside_items?.length ? (
                                            <div className="mt-2">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {entry.outside_items.map((item, i) => (
                                                        <span key={i} className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">
                                                            Outside clinic · {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
                                                            {item.status ? ` · ${item.status}` : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => printSavedOutsideClinicReceipt({ pet, ownerName, entry })}
                                                    className="mt-2 inline-flex items-center rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-50"
                                                >
                                                    Print receipt
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="py-2 text-sm text-gray-500">No medical history recorded yet.</p>
                )}
            </section>
            ) : null}
        </div>
    );
}

// Diri kwentahon ang dosage sa vial base sa timbang.
function calculateVialDosage(weight) {
    if (!weight || weight === '') return 0;
    return parseFloat(String(weight)) * 0.10;
}

// Diri pilion ang pinakadaan nga batch sa matag tambal.
function pickOldestBatchPerMedicine(items) {
    const byMedicine = new Map();

    items.forEach((item) => {
        const medicineId = item.medicine_id ?? item.medicine?.id;
        if (!medicineId) return;

        const existing = byMedicine.get(medicineId);
        if (!existing || new Date(item.created_at) < new Date(existing.created_at)) {
            byMedicine.set(medicineId, item);
        }
    });

    return Array.from(byMedicine.values());
}

// Diri kwentahon ang total stock sa tambal.
function getMedicineStockTotal(medicineId, inventory) {
    return inventory
        .filter((item) => (item.medicine_id ?? item.medicine?.id) === medicineId)
        .reduce((sum, item) => {
            if (item.is_box) {
                return sum + Number(item.total_items ?? 0);
            }
            return sum + Number(item.quantity ?? 0);
        }, 0);
}

// Diri i-group ang inventory base sa category.
function groupInventoryByCategory(items) {
    const grouped = new Map();

    items.forEach((item) => {
        const categoryName = item.medicine?.category?.name || 'Others';
        if (!grouped.has(categoryName)) {
            grouped.set(categoryName, []);
        }
        grouped.get(categoryName).push(item);
    });

    return Array.from(grouped.entries()).sort(([a], [b]) => {
        if (a === 'Others') return 1;
        if (b === 'Others') return -1;
        return a.localeCompare(b);
    });
}

// Diri i-validate ang treatment form.
function validateTreatmentForm({
    administeredBy,
    treatmentPetWeight,
    selectedInventoryItems,
    treatmentInventory = [],
    outsidePurchaseItems = [],
}) {
    const errors = {};
    const staffName = administeredBy.trim();

    if (!staffName) {
        errors.administeredBy = 'Please select who administered the treatment.';
    } else if (staffName.length < 2) {
        errors.administeredBy = 'Name must be at least 2 characters.';
    }

    const hasVialItem = selectedInventoryItems.some((item) => item.is_vial);
    if (hasVialItem) {
        const weight = Number(treatmentPetWeight);
        if (!treatmentPetWeight || Number.isNaN(weight) || weight <= 0) {
            errors.treatmentPetWeight = 'Animal weight is required for vial dosage.';
        }
    } else if (treatmentPetWeight && Number(treatmentPetWeight) < 0) {
        errors.treatmentPetWeight = 'Weight cannot be negative.';
    }

    const outsideErrors = outsidePurchaseFieldErrors(outsidePurchaseItems);
    Object.assign(errors, outsideErrors);
    const hasOutsidePurchase = completedOutsidePurchaseItems(outsidePurchaseItems).length > 0
        && Object.keys(outsideErrors).length === 0;

    if (selectedInventoryItems.length === 0 && !hasOutsidePurchase) {
        errors.selectedItems = 'Select at least one inventory item, or add a medicine to buy outside.';
    }

    selectedInventoryItems.forEach((item) => {
        if (item.is_vial) return;

        const stockItem = treatmentInventory.find((entry) => entry.id === item.id) || item;
        const medicineId = stockItem.medicine_id ?? stockItem.medicine?.id;
        const qty = Number(item.quantity);
        const maxQty = getMedicineStockTotal(medicineId, treatmentInventory);

        if (!qty || qty < 1) {
            errors[`item_${item.id}`] = 'Quantity must be at least 1.';
        } else if (!Number.isNaN(maxQty) && qty > maxQty) {
            errors[`item_${item.id}`] = `Maximum available is ${formatDisplayNumber(maxQty)}.`;
        }
    });

    return errors;
}

// Diri ang modal sa success.
function SuccessModal({ open, title, message, onClose }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
                        <svg className="h-7 w-7 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{message}</p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}

// Diri ang modal kung kulang og tambal ang hayop.
function MissingMedicineModal({ open, pets = [], onClose }) {
    if (!open) return null;

    const names = pets.map((pet) => pet.name || pet.pet_name || 'Unknown');
    const isSingle = names.length === 1;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                        <svg className="h-7 w-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Medicine required</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                        {isSingle
                            ? `Select at least one medicine for ${names[0]}, or add a receipt to buy it outside, before marking this appointment as ongoing.`
                            : 'Select at least one medicine for every booked animal, or add a receipt to buy it outside, before marking this appointment as ongoing.'}
                    </p>
                    {pets.length > 0 ? (
                        <ul className="mt-4 space-y-1.5 text-left">
                            {pets.map((pet) => (
                                <li
                                    key={pet.id || pet.name}
                                    className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
                                >
                                    {pet.name || pet.pet_name || 'Unknown'}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}

// Diri ang main page sa appointments.
export default function Appointments() {
    const { detailId } = usePage().props;
    const isDetailPage = Boolean(detailId);
    const initialAppointmentsCache = readAdminListCacheEntry(APPOINTMENTS_CACHE_KEY);
    const [appointments, setAppointments] = useState(initialAppointmentsCache?.data ?? []);
    const [viewedTick, setViewedTick] = useState(0);
    const [allServices, setAllServices] = useState([]);
    const [loading, setLoading] = useState(!initialAppointmentsCache);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [modalPetId, setModalPetId] = useState(null);
    const [detailTab, setDetailTab] = useState('profile');
    const [animalSearch, setAnimalSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const appointmentDetailOpen = showModal || isDetailPage;
    const [cancelReason, setCancelReason] = useState('');
    const [showCancelForm, setShowCancelForm] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [showSlotEditor, setShowSlotEditor] = useState(false);
    const [serviceFilter, setServiceFilter] = useState('all');
    const [fromDate, setFromDate] = useState('');
    const [tillDate, setTillDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [flashMessage, setFlashMessage] = useState(null);
    const [liveConnected, setLiveConnected] = useState(false);
    const [updatingStatusId, setUpdatingStatusId] = useState(null);
    const [tableCancelAppointmentId, setTableCancelAppointmentId] = useState(null);
    const [processingAssignId, setProcessingAssignId] = useState(null);
    const [animalCancelTarget, setAnimalCancelTarget] = useState(null);
    const [selectedPetIds, setSelectedPetIds] = useState([]);
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [bulkCancelTarget, setBulkCancelTarget] = useState(null);
    const [updatingAnimalId, setUpdatingAnimalId] = useState(null);
    const [petMedical, setPetMedical] = useState({
        loading: false,
        profile: null,
        history: [],
        lastService: null,
        historyCount: 0,
        petId: null,
    });
    const [photoPreview, setPhotoPreview] = useState({ open: false, url: '', label: '' });
    const liveFlashTimer = useRef(null);
    const [treatmentInventory, setTreatmentInventory] = useState([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [treatmentDrafts, setTreatmentDrafts] = useState({});
    const [treatmentErrors, setTreatmentErrors] = useState({});
    const [cancelError, setCancelError] = useState('');
    const [successModal, setSuccessModal] = useState({ open: false, title: '', message: '' });
    const [missingMedicineAlert, setMissingMedicineAlert] = useState({ open: false, pets: [] });
    const successModalCallback = useRef(null);

    const inventoryServiceNames = useMemo(() => {
        if (!selectedAppointment) return [];

        const pets = getAppointmentPets(selectedAppointment);
        const activePet = modalPetId
            ? pets.find((pet) => pet.id === modalPetId)
            : pets[0];

        if (activePet?.services?.length) {
            return activePet.services;
        }

        if (selectedAppointment.services?.length) return selectedAppointment.services;
        if (selectedAppointment.service) return [selectedAppointment.service];
        return [];
    }, [selectedAppointment, modalPetId]);

    const groupedInventory = useMemo(() => {
        const inStock = filterUsableInventory(treatmentInventory);

        // One row per medicine; stock shown is total across batches.
        // Backend always deducts from the oldest batch first (FIFO).
        const representatives = pickOldestBatchPerMedicine(inStock).map((item) => {
            const medicineId = item.medicine_id ?? item.medicine?.id;
            const total = getMedicineStockTotal(medicineId, inStock);
            return {
                ...item,
                available_total: total,
                quantity: item.is_box ? item.quantity : total,
                total_items: item.is_box ? total : item.total_items,
            };
        });

        return filterGroupedInventoryByServices(
            groupInventoryByCategory(representatives),
            inventoryServiceNames
        );
    }, [treatmentInventory, inventoryServiceNames]);

    const inventoryCategories = useMemo(
        () => groupedInventory.map(([name]) => name),
        [groupedInventory]
    );

    const activePetForDraft = selectedAppointment
        ? getAppointmentPets(selectedAppointment).find((pet) => pet.id === modalPetId)
        : null;
    const activeTreatmentDraft = treatmentDrafts[modalPetId] || createTreatmentDraft(activePetForDraft);
    const selectedInventoryItems = activeTreatmentDraft.selectedInventoryItems;
    const treatmentPetWeight = activeTreatmentDraft.treatmentPetWeight;
    const administeredBy = activeTreatmentDraft.administeredBy;
    const calculatedDosages = activeTreatmentDraft.calculatedDosages;
    const selectedInventoryCategory = activeTreatmentDraft.selectedInventoryCategory;
    const activeInventoryCategory = inventoryCategories.length === 1
        ? inventoryCategories[0]
        : selectedInventoryCategory;

    const visibleInventoryItems = useMemo(() => {
        if (!activeInventoryCategory) return [];
        const match = groupedInventory.find(([name]) => name === activeInventoryCategory);
        return match ? match[1] : [];
    }, [groupedInventory, activeInventoryCategory]);
    const automaticCategory = activeInventoryCategory
        || autoInventoryCategoryLabel(inventoryServiceNames);

    // Diri i-update ang treatment draft sa hayop.
    const patchTreatmentDraft = (petId, patch) => {
        if (!petId) return;
        setTreatmentDrafts((prev) => {
            const current = prev[petId] || createTreatmentDraft();
            const nextDraft = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
            return { ...prev, [petId]: nextDraft };
        });
    };

    useEffect(() => {
        if (!modalPetId) return;

        setTreatmentDrafts((prev) => {
            const draft = prev[modalPetId] || createTreatmentDraft(activePetForDraft);

            if (inventoryCategories.length === 1 && draft.selectedInventoryCategory !== inventoryCategories[0]) {
                return {
                    ...prev,
                    [modalPetId]: { ...draft, selectedInventoryCategory: inventoryCategories[0] },
                };
            }

            if (
                inventoryCategories.length >= 2
                && draft.selectedInventoryCategory
                && !inventoryCategories.includes(draft.selectedInventoryCategory)
            ) {
                return {
                    ...prev,
                    [modalPetId]: { ...draft, selectedInventoryCategory: '' },
                };
            }

            if (inventoryCategories.length === 0 && draft.selectedInventoryCategory) {
                return {
                    ...prev,
                    [modalPetId]: { ...draft, selectedInventoryCategory: '' },
                };
            }

            return prev;
        });
    }, [inventoryCategories, modalPetId, activePetForDraft]);

    // Diri i-reset ang treatment form.
    const resetTreatmentForm = () => {
        setTreatmentInventory([]);
        setTreatmentDrafts({});
        setInventoryLoading(false);
        setTreatmentErrors({});
        setMissingMedicineAlert({ open: false, pets: [] });
    };

    // Diri ablihan ang success modal.
    const openSuccessModal = (title, message, onClose = null) => {
        successModalCallback.current = onClose;
        setSuccessModal({ open: true, title, message });
    };

    // Diri sirado ang success modal ug tawgon ang callback.
    const closeSuccessModal = () => {
        setSuccessModal({ open: false, title: '', message: '' });
        if (typeof successModalCallback.current === 'function') {
            successModalCallback.current();
            successModalCallback.current = null;
        }
    };

    // Diri ablihan ang alert sa kulang nga tambal.
    const openMissingMedicineAlert = (pets) => {
        const list = (pets || []).map((pet) => ({
            id: pet.id,
            name: pet.name || pet.pet_name || 'Unknown',
        }));
        setMissingMedicineAlert({ open: true, pets: list });
        if (list[0]?.id) {
            setModalPetId(list[0].id);
            loadPetMedical(list[0].id);
            setTreatmentErrors({ selectedItems: 'Select at least one inventory item.' });
        }
    };

    // Diri sirado ang alert sa kulang nga tambal.
    const closeMissingMedicineAlert = () => {
        setMissingMedicineAlert({ open: false, pets: [] });
    };

    // Diri ipakita ang flash message kadiyot.
    const showFlash = (type, text) => {
        setFlashMessage({ type, text });
        setTimeout(() => setFlashMessage(null), 3000);
    };

    // Diri kuhaon ang medical record sa hayop.
    const loadPetMedical = async (petId) => {
        if (!petId) {
            setPetMedical({ loading: false, profile: null, history: [], lastService: null, historyCount: 0, petId: null });
            return;
        }

        setPetMedical((prev) => (
            prev.petId === petId && prev.profile
                ? { ...prev, loading: true }
                : { loading: true, profile: null, history: [], lastService: null, historyCount: 0, petId }
        ));

        try {
            const response = await axios.get(`/api/admin/animals/${petId}/medical-summary`);
            if (response.data.success) {
                setPetMedical({
                    loading: false,
                    profile: response.data.medical_profile,
                    history: response.data.history || [],
                    lastService: response.data.last_service,
                    historyCount: response.data.history_count || 0,
                    petId,
                });
            } else {
                setPetMedical({ loading: false, profile: null, history: [], lastService: null, historyCount: 0, petId });
            }
        } catch (error) {
            console.error('Failed to fetch pet medical summary:', error);
            setPetMedical({ loading: false, profile: null, history: [], lastService: null, historyCount: 0, petId });
        }
    };

    // Diri kuhaon ang inventory para sa treatment.
    const fetchTreatmentInventory = async () => {
        setInventoryLoading(true);
        try {
            const response = await axios.get('/api/admin/inventory');
            if (response.data.success) {
                setTreatmentInventory(response.data.inventory || []);
            }
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
            showFlash('error', 'Failed to load inventory');
        } finally {
            setInventoryLoading(false);
        }
    };

    // Diri i-toggle ang pagpili sa inventory item.
    const toggleInventoryItem = (item) => {
        if (!modalPetId) return;
        patchTreatmentDraft(modalPetId, (draft) => {
            const isSelected = draft.selectedInventoryItems.some((entry) => entry.id === item.id);
            const nextItems = isSelected
                ? draft.selectedInventoryItems.filter((entry) => entry.id !== item.id)
                : [...draft.selectedInventoryItems, { ...item, quantity: 1 }];
            const nextDosages = { ...draft.calculatedDosages };

            if (isSelected) {
                delete nextDosages[item.id];
            } else if (item.is_vial && draft.treatmentPetWeight) {
                nextDosages[item.id] = calculateVialDosage(draft.treatmentPetWeight);
            }

            return {
                ...draft,
                selectedInventoryItems: nextItems,
                calculatedDosages: nextDosages,
            };
        });
        if (treatmentErrors.selectedItems) {
            setTreatmentErrors((prev) => ({ ...prev, selectedItems: undefined }));
        }
    };

    // Diri i-update ang quantity sa napiling item.
    const updateInventoryItemQuantity = (itemId, quantity) => {
        if (!modalPetId) return;
        patchTreatmentDraft(modalPetId, (draft) => ({
            ...draft,
            selectedInventoryItems: draft.selectedInventoryItems.map((item) =>
                item.id === itemId ? { ...item, quantity: parseInt(quantity, 10) || 1 } : item
            ),
        }));
    };

    // Diri i-complete ang treatment sa appointment.
    const handleCompleteTreatment = async (id) => {
        const treatablePets = getTreatablePets(selectedAppointment);
        if (treatablePets.length === 0) {
            showFlash('error', 'No animals are available to record treatment for.');
            return;
        }

        const draftsByPet = {};
        const missingMedicinePets = [];
        for (const pet of treatablePets) {
            const draft = treatmentDrafts[pet.id] || createTreatmentDraft(pet);
            draftsByPet[pet.id] = draft;
            const startedOutsideLine = (draft.outsidePurchaseItems || []).some((line) => (
                String(line.name || '').trim() || String(line.quantity ?? '').trim()
            ));
            if (!draft.selectedInventoryItems?.length && !startedOutsideLine) {
                missingMedicinePets.push({
                    id: pet.id,
                    name: pet.name || pet.pet_name || 'Unknown',
                });
            }
        }

        if (missingMedicinePets.length > 0) {
            openMissingMedicineAlert(missingMedicinePets);
            return;
        }

        for (const pet of treatablePets) {
            const draft = draftsByPet[pet.id];
            const errors = validateTreatmentForm({
                administeredBy: draft.administeredBy,
                treatmentPetWeight: draft.treatmentPetWeight,
                selectedInventoryItems: draft.selectedInventoryItems,
                treatmentInventory,
                outsidePurchaseItems: draft.outsidePurchaseItems || [],
            });

            if (Object.keys(errors).length > 0) {
                setModalPetId(pet.id);
                loadPetMedical(pet.id);
                setTreatmentErrors(errors);
                const petName = pet.name || pet.pet_name || 'this animal';
                const firstError = errors.administeredBy
                    || errors.treatmentPetWeight
                    || errors.selectedItems
                    || Object.values(errors).find(Boolean);
                showFlash(
                    'error',
                    `Complete treatment for ${petName}. ${firstError || 'Select administered by and inventory items.'}`,
                );
                return;
            }
        }

        const stockUsage = {};
        for (const pet of treatablePets) {
            for (const item of draftsByPet[pet.id].selectedInventoryItems) {
                if (item.is_vial) continue;
                const medicineId = item.medicine_id ?? item.medicine?.id;
                if (!medicineId) continue;
                stockUsage[medicineId] = (stockUsage[medicineId] || 0) + Number(item.quantity || 0);
            }
        }
        for (const [medicineId, qty] of Object.entries(stockUsage)) {
            const maxQty = getMedicineStockTotal(Number(medicineId), treatmentInventory);
            if (!Number.isNaN(maxQty) && qty > maxQty) {
                const sample = treatablePets
                    .flatMap((pet) => draftsByPet[pet.id].selectedInventoryItems)
                    .find((item) => (item.medicine_id ?? item.medicine?.id) === Number(medicineId));
                showFlash(
                    'error',
                    `Combined quantity for ${sample?.medicine?.name || 'an item'} exceeds available stock (${formatDisplayNumber(maxQty)}).`,
                );
                return;
            }
        }

        setTreatmentErrors({});
        setProcessing(true);
        try {
            const response = await axios.post(`/api/admin/appointments/${id}/handoff`, {
                treatments: treatablePets.map((pet) => {
                    const draft = draftsByPet[pet.id];
                    return {
                        animal_id: pet.id,
                        pet_weight: draft.treatmentPetWeight ? parseFloat(draft.treatmentPetWeight) : null,
                        administered_by: draft.administeredBy.trim(),
                        selected_items: draft.selectedInventoryItems.map((item) => ({
                            inventory_id: item.id,
                            quantity: item.is_vial
                                ? Number(calculateVialDosage(draft.treatmentPetWeight).toFixed(2))
                                : Number(item.quantity || 1),
                        })),
                        outside_items: completedOutsidePurchaseItems(draft.outsidePurchaseItems || []),
                    };
                }),
            });

            if (response.data.success) {
                const listResponse = await axios.get('/api/admin/all-appointments');
                if (listResponse.data.success) {
                    const nextAppointments = listResponse.data.appointments || [];
                    setAppointments(nextAppointments);
                    writeAdminListCache(APPOINTMENTS_CACHE_KEY, nextAppointments);
                }
                resetTreatmentForm();
                if (isDetailPage) {
                    const updated = (listResponse.data.success ? listResponse.data.appointments : appointments)
                        ?.find((item) => item.id === id);
                    if (updated) setSelectedAppointment(updated);
                } else {
                    closeModal();
                }
                const usedClinicStock = treatablePets.some((pet) => draftsByPet[pet.id].selectedInventoryItems.length > 0);
                openSuccessModal(
                    'Marked as Ongoing',
                    usedClinicStock
                        ? 'Appointment marked as ongoing. Inventory has been recorded for the budget officer.'
                        : 'Appointment marked as ongoing. The outside purchase receipt was saved. No clinic stock was used.',
                );
            } else if (Array.isArray(response.data.missing_pets) && response.data.missing_pets.length > 0) {
                openMissingMedicineAlert(response.data.missing_pets);
            } else {
                showFlash('error', response.data.error || 'Failed to mark appointment as ongoing');
            }
        } catch (error) {
            console.error('Handoff treatment error:', error);
            const missingPets = error.response?.data?.missing_pets;
            if (Array.isArray(missingPets) && missingPets.length > 0) {
                openMissingMedicineAlert(missingPets);
            } else {
                showFlash(
                    'error',
                    error.response?.data?.error || error.response?.data?.message || 'Failed to mark appointment as ongoing'
                );
            }
        } finally {
            setProcessing(false);
        }
    };

    const fetchAllServices = useCallback(async () => {
        try {
            const response = await axios.get('/api/admin/services-list');
            if (response.data.success) {
                setAllServices(response.data.services);
            }
        } catch (error) {
            console.error('Failed to fetch services:', error);
        }
    }, []);

    const fetchAppointments = useCallback(async ({ silent = false, forceLoading = false } = {}) => {
        if (silent) {
            setRefreshing(true);
        } else if (forceLoading) {
            setLoading(true);
        } else {
            const cached = readAdminListCacheEntry(APPOINTMENTS_CACHE_KEY);
            if (cached) {
                setAppointments(cached.data ?? []);
                setLoading(false);
                setRefreshing(true);
            } else {
                setLoading(true);
            }
        }

        try {
            const response = await axios.get('/api/admin/all-appointments');
            if (response.data.success) {
                const nextAppointments = response.data.appointments || [];
                setAppointments(nextAppointments);
                writeAdminListCache(APPOINTMENTS_CACHE_KEY, nextAppointments);
            } else {
                setAppointments([]);
            }
        } catch (error) {
            console.error('Failed to fetch appointments:', error);
            if (!silent && !readAdminListCacheEntry(APPOINTMENTS_CACHE_KEY)) {
                showFlash('error', 'Failed to fetch appointments');
                setAppointments([]);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        setSelectedPetIds([]);
        setConfirmDialog(null);
        setBulkCancelTarget(null);
        setAnimalSearch('');
        setDetailTab(selectedAppointment?.status === 'processing' ? 'visit' : 'profile');
    }, [selectedAppointment?.id]);

    useEffect(() => {
        if (!appointmentDetailOpen || !selectedAppointment) {
            return;
        }

        const pets = getAppointmentPets(selectedAppointment);
        const activePetId = modalPetId && pets.some((pet) => pet.id === modalPetId)
            ? modalPetId
            : (pets[0]?.id ?? selectedAppointment.pet?.id ?? null);

        if (!modalPetId && activePetId) {
            setModalPetId(activePetId);
            return;
        }

        if (!activePetId) {
            return;
        }

        loadPetMedical(activePetId);
    }, [appointmentDetailOpen, selectedAppointment?.id, modalPetId]);

    // Diri ablihan ang preview sa litrato.
    const openPhotoPreview = (url, label) => {
        const normalized = normalizeMediaUrl(url);
        if (!normalized) return;
        setPhotoPreview({ open: true, url: normalized, label: label || 'Photo Preview' });
    };

    // Diri sirado ang preview sa litrato.
    const closePhotoPreview = () => {
        setPhotoPreview({ open: false, url: '', label: '' });
    };

    useEffect(() => {
        if (!appointmentDetailOpen || selectedAppointment?.status !== 'processing') {
            return;
        }

        const pets = getTreatablePets(selectedAppointment);
        setTreatmentDrafts(() => {
            const next = {};
            pets.forEach((pet) => {
                next[pet.id] = createTreatmentDraft(pet);
            });
            return next;
        });
        fetchTreatmentInventory();
    }, [appointmentDetailOpen, selectedAppointment?.id, selectedAppointment?.status]);

    useEffect(() => {
        fetchAppointments();
        fetchAllServices();
    }, [fetchAppointments, fetchAllServices]);

    const applyLiveUpdate = useCallback((event) => {
        const { action, appointment } = event;
        if (!appointment?.id) return;
        // Walk-ins belong on Admin Services, not the Clinical Appointments page.
        if (appointment.booking_type === 'walk_in') return;
        // Home Services bookings belong on the Elsalvador City Map page.
        if (appointment.is_door_to_door) return;

        setAppointments((prev) => {
            const exists = prev.some((a) => a.id === appointment.id);

            let next;
            if (action === 'created' && !exists) {
                next = [appointment, ...prev];
            } else if (exists) {
                next = prev.map((a) => (a.id === appointment.id ? appointment : a));
            } else {
                next = [appointment, ...prev];
            }

            writeAdminListCache(APPOINTMENTS_CACHE_KEY, next);
            return next;
        });

        setSelectedAppointment((prev) => (prev?.id === appointment.id ? appointment : prev));

        if (action === 'created') {
            if (liveFlashTimer.current) clearTimeout(liveFlashTimer.current);
            setFlashMessage({ type: 'info', text: `New appointment from ${appointment.user?.name}` });
            liveFlashTimer.current = setTimeout(() => setFlashMessage(null), 4000);
        } else if (action === 'cancelled') {
            if (liveFlashTimer.current) clearTimeout(liveFlashTimer.current);
            setFlashMessage({
                type: 'info',
                text: `${appointment.pet?.name}'s appointment was cancelled`,
            });
            liveFlashTimer.current = setTimeout(() => setFlashMessage(null), 4000);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeToAppointments(applyLiveUpdate);

        const echo = getEcho();
        if (!echo) return unsubscribe;

        const pusher = echo.connector?.pusher;
        if (!pusher) return unsubscribe;

        // Diri i-mark nga connected ang live updates.
        const onConnected = () => setLiveConnected(true);
        // Diri i-mark nga disconnected ang live updates.
        const onDisconnected = () => setLiveConnected(false);

        pusher.connection.bind('connected', onConnected);
        pusher.connection.bind('disconnected', onDisconnected);
        pusher.connection.bind('unavailable', onDisconnected);
        pusher.connection.bind('failed', onDisconnected);

        if (pusher.connection.state === 'connected') {
            setLiveConnected(true);
        }

        return () => {
            if (liveFlashTimer.current) clearTimeout(liveFlashTimer.current);
            pusher.connection.unbind('connected', onConnected);
            pusher.connection.unbind('disconnected', onDisconnected);
            pusher.connection.unbind('unavailable', onDisconnected);
            pusher.connection.unbind('failed', onDisconnected);
            unsubscribe();
        };
    }, [applyLiveUpdate]);

    // Diri kuhaon ang apelyido sa tag-iya.
    const getOwnerLastName = (user) => {
        if (!user) return 'Unknown';
        if (user.lastname?.trim()) return user.lastname.trim();
        if (user.name?.trim()) {
            const parts = user.name.trim().split(/\s+/);
            return parts[parts.length - 1] || user.name.trim();
        }
        if (user.firstname?.trim()) return user.firstname.trim();
        return 'Unknown';
    };

    // Diri i-check kung mo-match sa search ang appointment.
    const matchesSearch = (a) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        const ownerLastName = getOwnerLastName(a.user).toLowerCase();
        const serviceNames = [
            ...(Array.isArray(a.services) ? a.services : []),
            a.service,
        ].filter(Boolean).join(' ').toLowerCase();
        const petNames = getAppointmentPets(a)
            .map((pet) => `${pet?.name || ''} ${pet?.pet_name || ''} ${pet?.identification_number || ''} ${pet?.breed || ''}`)
            .join(' ')
            .toLowerCase();
        return (
            a.user?.name?.toLowerCase().includes(q) ||
            ownerLastName.includes(q) ||
            a.user?.firstname?.toLowerCase().includes(q) ||
            a.user?.lastname?.toLowerCase().includes(q) ||
            a.user?.email?.toLowerCase().includes(q) ||
            a.pet?.name?.toLowerCase().includes(q) ||
            a.pet?.identification_number?.toLowerCase().includes(q) ||
            a.pet?.breed?.toLowerCase().includes(q) ||
            petNames.includes(q) ||
            a.administered_by?.toLowerCase().includes(q) ||
            serviceNames.includes(q) ||
            String(getBarangayName(a.user?.barangay) || '').toLowerCase().includes(q) ||
            String(getZoneName(a.user?.zone) || '').toLowerCase().includes(q)
        );
    };

    const rangeStart = fromDate && tillDate && fromDate > tillDate ? tillDate : fromDate;
    const rangeEnd = fromDate && tillDate && fromDate > tillDate ? fromDate : tillDate;
    const matchesDateRange = (appointment) => {
        const day = appointment?.date ? String(appointment.date).slice(0, 10) : '';
        if (!day) return !rangeStart && !rangeEnd;
        if (rangeStart && day < rangeStart) return false;
        if (rangeEnd && day > rangeEnd) return false;
        return true;
    };

    const monthAndSearchFiltered = appointments.filter((a) => matchesDateRange(a) && matchesSearch(a));

    const baseFiltered = monthAndSearchFiltered.filter((a) => {
        if (serviceFilter === 'all') return true;
        return (a.services && a.services.includes(serviceFilter)) || a.service === serviceFilter;
    });

    const todayDate = localDateString();
    // Diri i-check kung mo-match sa service filter.
    const matchesService = (a) => (
        serviceFilter === 'all'
            || (a.services && a.services.includes(serviceFilter))
            || a.service === serviceFilter
    );
    const searchAndServiceFiltered = appointments.filter((a) => matchesSearch(a) && matchesService(a) && matchesDateRange(a));
    const todayAppointments = searchAndServiceFiltered.filter((a) => a.date === todayDate);

    const filteredAppointments = filter === 'today'
        ? sortAdminAppointmentsByHour(todayAppointments)
        : sortAdminAppointmentsNewestFirst(
            baseFiltered.filter((a) => filter === 'all' || a.status === filter)
        );

    const appointmentHourGroups = filter === 'today'
        ? groupAdminAppointmentsByHour(filteredAppointments)
        : [{ hour: 'all', label: null, items: filteredAppointments }];

    const statusCounts = {
        all: baseFiltered.length,
        today: todayAppointments.length,
        pending: baseFiltered.filter((a) => a.status === 'pending').length,
        approved: baseFiltered.filter((a) => a.status === 'approved').length,
        processing: baseFiltered.filter((a) => a.status === 'processing').length,
        ongoing: baseFiltered.filter((a) => a.status === 'ongoing').length,
        completed: baseFiltered.filter((a) => a.status === 'completed').length,
        cancelled: baseFiltered.filter((a) => a.status === 'cancelled').length,
    };

    const appointmentNoticePending = appointments.filter((a) => a.status === 'pending');
    const appointmentNoticeToday = sortAdminAppointmentsByHour(
        appointments.filter((a) => a.date === todayDate && a.status !== 'cancelled')
    );

    // Diri ilisan ang status filter.
    const handleStatusFilterChange = (nextFilter) => {
        setFilter(nextFilter);
    };

    const serviceCounts = {};
    allServices.forEach((service) => {
        serviceCounts[service] = monthAndSearchFiltered.filter(
            (a) => (a.services && a.services.includes(service)) || a.service === service
        ).length;
    });

    const activeStatusFilter = STATUS_FILTER_CONFIG[filter] ? filter : 'all';

    // Diri i-check kung pwede ma-approve ang appointment.
    const canApproveAppointment = (appointment) => {
        const pets = getAppointmentPets(appointment).filter(
            (pet) => getPetBookingStatus(pet, appointment) !== 'cancelled'
        );
        if (pets.length === 0) {
            const registrationStatus = appointment?.pet?.registration_status;
            return registrationStatus === 'registered' || registrationStatus === 'exempt';
        }
        return pets.every((pet) => canApprovePet(pet));
    };

    // Diri i-approve ang appointment.
    const handleApprove = async (id) => {
        const appointment = appointments.find((a) => a.id === id) || selectedAppointment;
        if (!canApproveAppointment(appointment)) {
            showFlash('error', 'Cannot approve appointment. Each remaining animal must be registered or exempt first.');
            return;
        }

        setProcessing(true);
        try {
            const response = await axios.put(`/api/admin/appointments/${id}/status`, {
                status: 'approved',
            });
            if (response.data.success) {
                const listResponse = await axios.get('/api/admin/all-appointments');
                const nextAppointments = listResponse.data.success
                    ? (listResponse.data.appointments || [])
                    : appointments.map((a) => (a.id === id ? { ...a, status: 'approved' } : a));

                setAppointments(nextAppointments);
                writeAdminListCache(APPOINTMENTS_CACHE_KEY, nextAppointments);
                const updated = nextAppointments.find((item) => item.id === id);
                if (updated) setSelectedAppointment(updated);
                if (!isDetailPage) {
                    closeModal();
                }
                openSuccessModal(
                    'Appointment Approved',
                    'The client has been notified to arrive before the scheduled time.',
                );
            }
        } catch (error) {
            console.error('Failed to approve appointment:', error);
            const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Failed to approve appointment';
            showFlash('error', errorMsg);
        } finally {
            setProcessing(false);
        }
    };

    // Diri i-handle ang pagpili og status sa table.
    const handleTableStatusSelect = (appointmentId, newStatus) => {
        if (newStatus === 'cancelled') {
            const appointment = appointments.find((item) => item.id === appointmentId);
            if (appointment?.status === 'approved' && !isAppointmentScheduleDay(appointment)) {
                showFlash('error', 'Cancel (Late) is only available on the scheduled appointment date.');
                return;
            }

            setCancelReason('');
            setCancelError('');
            setTableCancelAppointmentId(appointmentId);
            return;
        }

        if (newStatus === 'processing') {
            openProcessingAssign(appointmentId);
            return;
        }

        handleStatusChange(appointmentId, newStatus);
    };

    // Diri ablihan ang pag-assign sa processing.
    const openProcessingAssign = (appointmentId) => {
        const appointment = appointments.find((item) => item.id === appointmentId) || selectedAppointment;
        if (!isAppointmentScheduleDay(appointment)) {
            showFlash('error', 'Clinic appointments can be marked as processing on the scheduled date.');
            return;
        }

        setProcessingAssignId(appointmentId);
    };

    // Diri sirado ang cancel modal sa table.
    const closeTableCancelModal = () => {
        setTableCancelAppointmentId(null);
        setCancelReason('');
        setCancelError('');
    };

    // Diri i-update ang status sa appointment sa server.
    const handleStatusChange = async (appointmentId, newStatus, extra = {}) => {
        setUpdatingStatusId(appointmentId);
        try {
            const response = await axios.put(`/api/admin/appointments/${appointmentId}/status`, {
                status: newStatus,
                ...extra,
            });
            if (response.data.success) {
                const listResponse = await axios.get('/api/admin/all-appointments');
                const nextAppointments = listResponse.data.success
                    ? (listResponse.data.appointments || [])
                    : appointments.map((a) =>
                        a.id === appointmentId ? { ...a, status: newStatus } : a
                    );

                setAppointments(nextAppointments);
                writeAdminListCache(APPOINTMENTS_CACHE_KEY, nextAppointments);

                const updated = nextAppointments.find((a) => a.id === appointmentId);
                if (updated) {
                    setSelectedAppointment(updated);
                }

                if (newStatus === 'processing') {
                    setProcessingAssignId(null);
                    showFlash(
                        'success',
                        extra.assigned_fieldman_id
                            ? 'Appointment marked as processing. The assigned fieldman has been notified.'
                            : 'Appointment marked as processing.'
                    );
                }
            } else {
                showFlash('error', response.data.error || 'Failed to update status');
            }
        } catch (error) {
            console.error('Failed to update appointment status:', error);
            showFlash('error', error.response?.data?.error || error.response?.data?.message || 'Failed to update status');
        } finally {
            setUpdatingStatusId(null);
        }
    };

    // Diri i-cancel ang appointment uban ang rason.
    const handleCancel = async (id, { closeDetailModal = false } = {}) => {
        const reason = cancelReason.trim();
        if (!reason) {
            setCancelError('Please enter a cancellation reason. The client will receive this message.');
            return;
        }
        if (reason.length < 3) {
            setCancelError('Reason must be at least 3 characters.');
            return;
        }

        setCancelError('');
        setProcessing(true);
        try {
            const response = await axios.patch(`/api/admin/appointments/${id}/cancel`, {
                cancellation_reason: reason,
            });
            if (response.data.success) {
                const listResponse = await axios.get('/api/admin/all-appointments');
                const nextAppointments = listResponse.data.success
                    ? (listResponse.data.appointments || [])
                    : appointments.map((a) =>
                        a.id === id ? { ...a, status: 'cancelled' } : a
                    );

                setAppointments(nextAppointments);
                writeAdminListCache(APPOINTMENTS_CACHE_KEY, nextAppointments);

                const updated = nextAppointments.find((a) => a.id === id);
                if (updated) {
                    setSelectedAppointment(updated);
                }

                openSuccessModal(
                    'Appointment Cancelled',
                    'The client has been notified with your cancellation reason.',
                    () => {
                        setTableCancelAppointmentId(null);
                        setShowCancelForm(false);
                        setCancelReason('');
                        if (closeDetailModal) {
                            if (isDetailPage) {
                                router.visit('/admin/appointments');
                            } else {
                                closeModal();
                            }
                        }
                    },
                );
            } else {
                showFlash('error', response.data.error || 'Failed to cancel appointment');
            }
        } catch (error) {
            console.error('Cancel appointment error:', error);
            const errorMsg = error.response?.data?.errors?.cancellation_reason?.[0]
                || error.response?.data?.error
                || error.response?.data?.message
                || 'Failed to cancel appointment';
            showFlash('error', errorMsg);
        } finally {
            setProcessing(false);
        }
    };

    // Diri i-refresh ang napiling appointment.
    const refreshSelectedAppointment = async (id, fallbackAppointments = null) => {
        const listResponse = await axios.get('/api/admin/all-appointments');
        const nextAppointments = listResponse.data.success
            ? (listResponse.data.appointments || [])
            : (fallbackAppointments || appointments);

        setAppointments(nextAppointments);
        writeAdminListCache(APPOINTMENTS_CACHE_KEY, nextAppointments);
        const updated = nextAppointments.find((item) => item.id === id);
        if (updated) {
            setSelectedAppointment(updated);
        }
        return updated;
    };

    // Diri i-approve ang usa ka hayop.
    const handleApprovePet = async (appointmentId, pet) => {
        if (!canApprovePet(pet)) {
            showFlash('error', `Cannot approve ${pet?.name || pet?.pet_name || 'this animal'}. Pet must be registered or exempt first.`);
            return;
        }

        setUpdatingAnimalId(pet.id);
        setProcessing(true);
        try {
            const response = await axios.put(`/api/admin/appointments/${appointmentId}/animals/${pet.id}/status`, {
                status: 'approved',
            });
            if (response.data.success) {
                setSelectedPetIds((prev) => prev.filter((id) => id !== pet.id));
                setSelectedAppointment((prev) => {
                    if (!prev || prev.id !== appointmentId) return prev;
                    const pets = getAppointmentPets(prev).map((item) => (
                        item.id === pet.id ? { ...item, booking_status: 'approved' } : item
                    ));
                    return { ...prev, pets, pet: pets[0] || prev.pet };
                });
                await refreshSelectedAppointment(appointmentId);
                openSuccessModal(
                    'Animal Approved',
                    response.data.message || `${pet?.name || 'Animal'} has been approved.`,
                );
            } else {
                showFlash('error', response.data.error || 'Failed to approve animal');
            }
        } catch (error) {
            console.error('Failed to approve animal:', error);
            showFlash('error', error.response?.data?.error || error.response?.data?.message || 'Failed to approve animal');
        } finally {
            setUpdatingAnimalId(null);
            setProcessing(false);
        }
    };

    // Diri i-update ang daghang hayop dungan.
    const handleBulkUpdateAnimals = async (appointmentId, animalIds, action, cancellationReason = null) => {
        if (!animalIds.length) {
            showFlash('error', 'Select at least one animal first.');
            return;
        }

        if (action === 'approve') {
            const appointment = appointments.find((item) => item.id === appointmentId) || selectedAppointment;
            const blocked = getAppointmentPets(appointment).filter(
                (pet) => animalIds.includes(pet.id) && !canApprovePet(pet),
            );
            if (blocked.length > 0) {
                showFlash('error', 'Each selected animal must be registered or exempt before approval.');
                return;
            }
        }

        setProcessing(true);
        try {
            const payload = {
                animal_ids: animalIds,
                action,
            };
            if (action === 'cancel') {
                payload.cancellation_reason = cancellationReason;
            }

            const response = await axios.patch(`/api/admin/appointments/${appointmentId}/animals/bulk`, payload);
            if (response.data.success) {
                setSelectedPetIds((prev) => prev.filter((id) => !animalIds.includes(id)));
                setBulkCancelTarget(null);
                setCancelReason('');
                await refreshSelectedAppointment(appointmentId);
                openSuccessModal(
                    action === 'approve' ? 'Animals Approved' : 'Animals Cancelled',
                    response.data.message || `Updated ${animalIds.length} animal(s).`,
                );
            } else {
                showFlash('error', response.data.error || 'Failed to update selected animals');
            }
        } catch (error) {
            console.error('Bulk animal update error:', error);
            showFlash(
                'error',
                error.response?.data?.error || error.response?.data?.message || 'Failed to update selected animals',
            );
        } finally {
            setProcessing(false);
        }
    };

    // Diri i-toggle ang pagpili sa hayop.
    const togglePetSelection = (petId) => {
        setSelectedPetIds((prev) => (
            prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
        ));
    };

    // Diri pilion o tangtangon tanan nga actionable nga hayop.
    const toggleSelectAllActionable = (appointment) => {
        const actionable = getAppointmentPets(appointment).filter((pet) => canSelectPetForBulkActions(appointment, pet));
        const actionableIds = actionable.map((pet) => pet.id);
        const allSelected = actionableIds.length > 0 && actionableIds.every((id) => selectedPetIds.includes(id));

        if (allSelected) {
            setSelectedPetIds((prev) => prev.filter((id) => !actionableIds.includes(id)));
            return;
        }

        setSelectedPetIds((prev) => Array.from(new Set([...prev, ...actionableIds])));
    };

    // Diri mangayo og confirm sa pag-approve sa tanang pending.
    const requestApproveAllPending = (appointment) => {
        const pendingPets = getActionablePets(appointment, { statuses: ['pending'] });
        if (pendingPets.length === 0) {
            showFlash('error', 'There are no pending animals to approve.');
            return;
        }

        if (!canApproveAppointment(appointment)) {
            showFlash('error', 'Cannot approve appointment. Each remaining animal must be registered or exempt first.');
            return;
        }

        setConfirmDialog({
            title: 'Approve All Pending Animals',
            message: `Approve all ${pendingPets.length} pending ${pendingPets.length === 1 ? 'animal' : 'animals'}? Other animals on this appointment will not be changed.`,
            confirmLabel: 'Approve all pending',
            confirmTone: 'primary',
            onConfirm: async () => {
                setConfirmDialog(null);
                const pendingIds = pendingPets.map((pet) => pet.id);
                await handleBulkUpdateAnimals(appointment.id, pendingIds, 'approve');
            },
        });
    };

    // Diri mangayo og confirm sa pag-cancel sa tanang pending.
    const requestCancelAllPending = (appointment) => {
        const pendingPets = getActionablePets(appointment, { statuses: ['pending'] });
        if (pendingPets.length === 0) {
            showFlash('error', 'There are no pending animals to cancel.');
            return;
        }

        setConfirmDialog({
            title: 'Cancel All Pending Animals',
            message: `Cancel all ${pendingPets.length} pending ${pendingPets.length === 1 ? 'animal' : 'animals'}? Approved or already cancelled animals will not be affected.`,
            confirmLabel: 'Continue',
            confirmTone: 'danger',
            onConfirm: () => {
                setConfirmDialog(null);
                setCancelReason('');
                setCancelError('');
                setBulkCancelTarget({
                    appointmentId: appointment.id,
                    animalIds: pendingPets.map((pet) => pet.id),
                    label: `all ${pendingPets.length} pending ${pendingPets.length === 1 ? 'animal' : 'animals'}`,
                });
            },
        });
    };

    // Diri mangayo og confirm sa pag-approve sa napili.
    const requestBulkApproveSelected = (appointment) => {
        const selectedPendingIds = selectedPetIds.filter((petId) => {
            const pet = getAppointmentPets(appointment).find((item) => item.id === petId);
            return pet && getPetBookingStatus(pet, appointment) === 'pending';
        });

        if (selectedPendingIds.length === 0) {
            showFlash('error', 'Select at least one pending animal to approve.');
            return;
        }

        setConfirmDialog({
            title: 'Approve Selected Animals',
            message: `Approve ${selectedPendingIds.length} selected ${selectedPendingIds.length === 1 ? 'animal' : 'animals'}? Other animals will not be changed.`,
            confirmLabel: 'Approve selected',
            confirmTone: 'primary',
            onConfirm: async () => {
                setConfirmDialog(null);
                await handleBulkUpdateAnimals(appointment.id, selectedPendingIds, 'approve');
            },
        });
    };

    // Diri mangayo og confirm sa pag-cancel sa napili.
    const requestBulkCancelSelected = (appointment) => {
        const selectedCancelIds = selectedPetIds.filter((petId) => {
            const pet = getAppointmentPets(appointment).find((item) => item.id === petId);
            return pet && canShowPetCancelAction(appointment, pet);
        });

        if (selectedCancelIds.length === 0) {
            showFlash('error', canLateCancelAppointment(appointment)
                ? 'Select at least one animal to cancel.'
                : 'Cancel (Late) for approved animals is only available on the scheduled appointment date.');
            return;
        }

        setConfirmDialog({
            title: 'Cancel Selected Animals',
            message: `Cancel ${selectedCancelIds.length} selected ${selectedCancelIds.length === 1 ? 'animal' : 'animals'}? Other animals will not be changed.`,
            confirmLabel: 'Continue',
            confirmTone: 'danger',
            onConfirm: () => {
                setConfirmDialog(null);
                setCancelReason('');
                setCancelError('');
                setBulkCancelTarget({
                    appointmentId: appointment.id,
                    animalIds: selectedCancelIds,
                    label: `${selectedCancelIds.length} selected ${selectedCancelIds.length === 1 ? 'animal' : 'animals'}`,
                    isLate: canLateCancelAppointment(appointment)
                        && selectedCancelIds.every((petId) => {
                            const pet = getAppointmentPets(appointment).find((item) => item.id === petId);
                            return pet && isLateCancelPetAction(appointment, pet);
                        }),
                });
            },
        });
    };

    // Diri i-submit ang bulk cancel.
    const handleSubmitBulkCancel = async () => {
        if (!bulkCancelTarget) return;

        const reason = cancelReason.trim();
        if (!reason) {
            setCancelError('Please enter a cancellation reason. The client will receive this message.');
            return;
        }
        if (reason.length < 3) {
            setCancelError('Reason must be at least 3 characters.');
            return;
        }

        setCancelError('');
        await handleBulkUpdateAnimals(
            bulkCancelTarget.appointmentId,
            bulkCancelTarget.animalIds,
            'cancel',
            reason,
        );
    };

    // Diri sirado ang bulk cancel.
    const closeBulkCancel = () => {
        setBulkCancelTarget(null);
        setCancelReason('');
        setCancelError('');
    };

    // Diri mangayo og confirm sa late cancel sa tanan.
    const requestCancelAllLate = (appointment) => {
        if (!canLateCancelAppointment(appointment)) {
            showFlash('error', 'Cancel (Late) is only available on the scheduled appointment date.');
            return;
        }

        const remainingPets = getActionablePets(appointment, { statuses: ['approved'] });
        if (remainingPets.length === 0) {
            showFlash('error', 'There are no animals left to cancel.');
            return;
        }

        setConfirmDialog({
            title: 'Cancel All Animals (Late)',
            message: `Cancel all ${remainingPets.length} remaining ${remainingPets.length === 1 ? 'animal' : 'animals'} for this no-show? Other already cancelled animals will not be changed.`,
            confirmLabel: 'Continue',
            confirmTone: 'danger',
            onConfirm: () => {
                setConfirmDialog(null);
                setCancelReason('');
                setCancelError('');
                setBulkCancelTarget({
                    appointmentId: appointment.id,
                    animalIds: remainingPets.map((pet) => pet.id),
                    label: `all ${remainingPets.length} remaining ${remainingPets.length === 1 ? 'animal' : 'animals'}`,
                    isLate: true,
                });
            },
        });
    };

    // Diri ablihan ang cancel sa usa ka hayop.
    const openAnimalCancel = (appointment, pet) => {
        if (!canShowPetCancelAction(appointment, pet)) {
            if (isLateCancelPetAction(appointment, pet)) {
                showFlash('error', 'Cancel (Late) is only available on the scheduled appointment date.');
            }
            return;
        }

        setCancelReason('');
        setCancelError('');
        setAnimalCancelTarget({
            appointmentId: appointment.id,
            petId: pet.id,
            petName: pet.name || pet.pet_name || 'this animal',
            isLate: isLateCancelPetAction(appointment, pet) && canLateCancelAppointment(appointment),
        });
    };

    // Diri sirado ang cancel sa hayop.
    const closeAnimalCancel = () => {
        setAnimalCancelTarget(null);
        setCancelReason('');
        setCancelError('');
    };

    // Diri i-cancel ang usa ka hayop.
    const handleCancelAnimal = async () => {
        if (!animalCancelTarget) return;

        const reason = cancelReason.trim();
        if (!reason) {
            setCancelError('Please enter a cancellation reason. The client will receive this message.');
            return;
        }
        if (reason.length < 3) {
            setCancelError('Reason must be at least 3 characters.');
            return;
        }

        setCancelError('');
        setProcessing(true);
        const { appointmentId, petId, petName } = animalCancelTarget;
        try {
            const response = await axios.patch(
                `/api/admin/appointments/${appointmentId}/animals/${petId}/cancel`,
                { cancellation_reason: reason },
            );
            if (response.data.success) {
                setAnimalCancelTarget(null);
                setCancelReason('');
                setSelectedAppointment((prev) => {
                    if (!prev || prev.id !== appointmentId) return prev;
                    const pets = getAppointmentPets(prev).map((item) => (
                        item.id === petId ? { ...item, booking_status: 'cancelled' } : item
                    ));
                    return { ...prev, pets, pet: pets[0] || prev.pet };
                });
                await refreshSelectedAppointment(appointmentId);
                openSuccessModal(
                    'Animal Cancelled',
                    response.data.message || `${petName} has been cancelled.`,
                );
            } else {
                showFlash('error', response.data.error || 'Failed to cancel animal');
            }
        } catch (error) {
            console.error('Cancel animal error:', error);
            const errorMsg = error.response?.data?.errors?.cancellation_reason?.[0]
                || error.response?.data?.error
                || error.response?.data?.message
                || 'Failed to cancel animal';
            showFlash('error', errorMsg);
        } finally {
            setProcessing(false);
        }
    };

    // Diri adto sa detail page sa appointment.
    const goToDetail = (appointment, petId = null) => {
        if (!appointment?.id) return;
        if (markBookingViewed(appointment.id)) {
            setViewedTick((tick) => tick + 1);
        }
        const query = petId ? `?pet=${petId}` : '';
        router.visit(`/admin/appointments/${appointment.id}${query}`);
    };

    // Diri balik sa listahan sa appointments.
    const leaveDetailPage = () => {
        router.visit('/admin/appointments');
    };

    // Diri tangtangon ang deep link params sa URL.
    const clearNotificationDeepLink = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('booking');
        url.searchParams.delete('filter');
        url.searchParams.delete('today');
        const nextUrl = url.pathname + (url.search ? url.search : '');
        window.history.replaceState({}, '', nextUrl);
    };

    const notificationDeepLinkHandledRef = useRef(false);

    useEffect(() => {
        if (notificationDeepLinkHandledRef.current || loading || isDetailPage) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const bookingId = params.get('booking');
        const filterParam = params.get('filter');
        const todayOnly = params.get('today') === '1';

        if (!bookingId && !filterParam && !todayOnly) {
            return;
        }

        if (appointments.length === 0) {
            return;
        }

        // Diri tapuson ang deep link gikan sa notification.
        const finishDeepLink = (appointment = null) => {
            notificationDeepLinkHandledRef.current = true;

            if (filterParam === 'today' || todayOnly) {
                setFilter('today');
            } else if (filterParam) {
                setFilter(filterParam);
            }

            if (appointment) {
                goToDetail(appointment);
                return;
            }

            clearNotificationDeepLink();
        };

        if (bookingId) {
            const appointment = appointments.find((item) => String(item.id) === String(bookingId));
            if (appointment) {
                finishDeepLink(appointment);
            }
            return;
        }

        if (todayOnly || filterParam === 'today') {
            finishDeepLink(null);
            return;
        }

        if (filterParam) {
            finishDeepLink(null);
        }
    }, [appointments, loading]);

    useEffect(() => {
        if (!detailId) {
            return;
        }

        const appointment = appointments.find((item) => item.id === Number(detailId));
        if (!appointment) {
            return;
        }

        setSelectedAppointment(appointment);
        const pets = getAppointmentPets(appointment);
        const petFromQuery = Number(new URLSearchParams(window.location.search).get('pet'));
        setModalPetId((current) => {
            if (current && pets.some((pet) => pet.id === current)) {
                return current;
            }
            if (petFromQuery && pets.some((pet) => pet.id === petFromQuery)) {
                return petFromQuery;
            }
            return pets[0]?.id ?? appointment.pet?.id ?? null;
        });
        setShowModal(true);
    }, [detailId, appointments]);

    // Diri sirado ang modal sa appointment.
    const closeModal = () => {
        setShowModal(false);
        setSelectedAppointment(null);
        setModalPetId(null);
        setCancelReason('');
        setCancelError('');
        setShowCancelForm(false);
        setAnimalCancelTarget(null);
        setTreatmentErrors({});
        resetTreatmentForm();
        closePhotoPreview();
        setPetMedical({ loading: false, profile: null, history: [], lastService: null, historyCount: 0, petId: null });
    };

    // Diri i-format ang petsa.
    const formatDate = (dateStr) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Diri i-format ang oras nga AM/PM.
    const formatTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Diri i-convert ang oras ngadto sa minutes.
    const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return (hours * 60) + minutes;
    };

    // Diri i-convert ang minutes ngadto sa label sa oras.
    const minutesToTimeLabel = (totalMinutes) => {
        const hours24 = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        const date = new Date();
        date.setHours(hours24, minutes);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Diri i-format ang range sa oras sa booking.
    const formatBookingTimeRange = (timeStr, durationMinutes = 10) => {
        if (!timeStr) return '—';
        const duration = durationMinutes > 0 ? durationMinutes : 10;
        const start = formatTime(timeStr);
        const end = minutesToTimeLabel(timeToMinutes(timeStr) + duration);
        return `${start} – ${end}`;
    };

    // Diri i-format ang gitas-on sa oras.
    const formatDuration = (minutes) => {
        const value = minutes > 0 ? minutes : 10;
        if (value < 60) return `${value} min`;
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
    };

    // Diri i-capitalize ang label sa status.
    const formatStatusLabel = (status) => {
        if (!status) return 'Pending';
        return status.charAt(0).toUpperCase() + status.slice(1);
    };

    const hasActiveFilters =
        filter !== 'all' ||
        serviceFilter !== 'all' ||
        fromDate !== '' ||
        tillDate !== '' ||
        searchTerm.trim() !== '';

    // Diri i-clear ang mga filter.
    const clearFilters = () => {
        setServiceFilter('all');
        setFromDate('');
        setTillDate('');
        setSearchTerm('');
        setFilter('all');
    };

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            {!isDetailPage ? (
            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
                <header className="shrink-0 border-b border-gray-200/80 bg-white">
                    <div className="px-6 py-5 lg:px-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="app-kicker">Clinic</p>
                                <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy">
                                    Clinical Appointments
                                </h1>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                    liveConnected
                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                        : 'bg-gray-100 text-gray-500'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${liveConnected ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'}`} />
                                    {liveConnected ? 'Live' : 'Connecting…'}
                                </div>
                                <AppointmentPageNotices
                                    pendingItems={appointmentNoticePending}
                                    todayItems={appointmentNoticeToday}
                                    onOpenPending={() => setFilter('pending')}
                                    onOpenToday={() => handleStatusFilterChange('today')}
                                    onOpenAppointment={goToDetail}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSlotEditor(true)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                                >
                                    Slots
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fetchAppointments({ forceLoading: true })}
                                    disabled={loading || refreshing}
                                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
                                >
                                    <svg className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5 lg:px-8">
                    {flashMessage && (
                        <div className={`shrink-0 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                            flashMessage.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : flashMessage.type === 'info'
                                    ? 'border-violet-200 bg-violet-50 text-violet-800'
                                    : 'border-red-200 bg-red-50 text-red-800'
                        }`}>
                            {flashMessage.text}
                        </div>
                    )}

                    <section className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
                            <div className="lg:col-span-4">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Search
                                </label>
                                <div className="relative">
                                    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="block w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        placeholder="Owner, pet, ID, administered by..."
                                    />
                                </div>
                            </div>
                            <div className="lg:col-span-4">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Service
                                </label>
                                <select
                                    value={serviceFilter}
                                    onChange={(e) => setServiceFilter(e.target.value)}
                                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                >
                                    <option value="all">All services ({monthAndSearchFiltered.length})</option>
                                    {allServices.map((service) => (
                                        <option key={service} value={service}>
                                            {service} ({serviceCounts[service] || 0})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="lg:col-span-2">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    From
                                </label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                />
                            </div>
                            <div className="lg:col-span-2">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Till
                                </label>
                                <input
                                    type="date"
                                    value={tillDate}
                                    onChange={(e) => setTillDate(e.target.value)}
                                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <Tabs
                                value={activeStatusFilter}
                                onChange={handleStatusFilterChange}
                                items={Object.keys(STATUS_FILTER_CONFIG).map((key) => ({
                                    id: key,
                                    label: key === 'all' ? 'All' : STATUS_FILTER_CONFIG[key].label,
                                    count: statusCounts[key] || 0,
                                    tone: (key === 'pending' || key === 'today') && (statusCounts[key] || 0) > 0 ? 'danger' : 'default',
                                }))}
                            />
                            <div className="flex shrink-0 items-center gap-3 pb-2">
                                <span className="text-sm text-muted">
                                    <span className="font-semibold text-navy">{filteredAppointments.length}</span> results
                                </span>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        {loading && !refreshing && appointments.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center py-20">
                                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600 border-t-transparent" />
                                <p className="text-sm font-medium text-gray-500">Loading appointments...</p>
                            </div>
                        ) : filteredAppointments.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center py-20">
                                <p className="mb-1 font-semibold text-gray-900">No appointments found</p>
                                <p className="text-sm text-gray-500">
                                    {filter === 'today'
                                        ? 'No clinical appointments scheduled for today'
                                        : filter === 'pending'
                                        ? 'No pending appointments to review'
                                        : hasActiveFilters
                                            ? 'Try adjusting your filters or search term'
                                            : `No ${filter === 'all' ? '' : filter + ' '}appointments in the system`}
                                </p>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                                    >
                                        Clear all filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-auto scrollbar-hide">
                                <table className="min-w-full table-fixed text-left text-sm">
                                    <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                            <th className="w-[18%] px-4 py-3 font-bold">Name</th>
                                            <th className="w-[14%] px-4 py-3 font-bold">Total Appoint Animals</th>
                                            <th className="w-[14%] px-4 py-3 font-bold">Barangay</th>
                                            <th className="w-[12%] px-4 py-3 font-bold">Zone</th>
                                            <th className="w-[18%] px-4 py-3 font-bold">Schedule</th>
                                            <th className="w-[14%] px-4 py-3 font-bold">Status</th>
                                            <th className="w-[10%] px-4 py-3 font-bold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {appointmentHourGroups.map((group) => (
                                            <Fragment key={group.hour}>
                                                {group.label ? (
                                                    <tr className="bg-violet-50/80">
                                                        <td colSpan={7} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                                                            {group.label}
                                                            <span className="ml-2 font-semibold normal-case tracking-normal text-violet-500">
                                                                {group.items.length} {group.items.length === 1 ? 'appointment' : 'appointments'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ) : null}
                                                {group.items.map((appointment) => {
                                            const ownerName = getOwnerDisplayName(appointment.user);
                                            const bookedPets = getAppointmentPets(appointment);
                                            const animalCount = bookedPets.length;
                                            const barangayName = getBarangayName(appointment.user?.barangay);
                                            const zoneName = getZoneName(appointment.user?.zone);
                                            const isNew = shouldShowNewBookingBadge(appointment) && viewedTick >= 0;

                                            return (
                                                <tr
                                                    key={appointment.id}
                                                    onClick={() => goToDetail(appointment)}
                                                    className={`group cursor-pointer transition-colors hover:bg-violet-50/50 ${
                                                        isNew ? 'bg-rose-50/40' : ''
                                                    }`}
                                                >
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <p className="truncate font-semibold text-gray-900">
                                                                {ownerName}
                                                            </p>
                                                            {isNew ? (
                                                                <span className="inline-flex items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                                                                    New
                                                                </span>
                                                            ) : null}
                                                            <OwnerApprovalBadge user={appointment.user} />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <p className="font-semibold text-gray-900">{animalCount}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {animalCount === 1 ? 'animal' : 'animals'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-sm text-gray-700">
                                                        {barangayName || <span className="text-xs text-gray-400">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-sm text-gray-700">
                                                        {zoneName || <span className="text-xs text-gray-400">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <p className="font-medium text-gray-900">{formatDate(appointment.date)}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {formatBookingTimeRange(appointment.time, appointment.duration_minutes)}
                                                            {' · '}
                                                            {formatDuration(appointment.duration_minutes)}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                                        <TableStatusControl
                                                            appointment={appointment}
                                                            disabled={updatingStatusId === appointment.id}
                                                            onChange={(nextStatus) => handleTableStatusSelect(appointment.id, nextStatus)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <EyeActionButton
                                                            onClick={() => goToDetail(appointment)}
                                                            label="View appointment"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>
            ) : isDetailPage && !selectedAppointment ? (
            <div className="staff-main flex min-h-0 flex-1 flex-col items-center justify-center">
                {loading || refreshing ? (
                    <>
                        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600 border-t-transparent" />
                        <p className="text-sm font-medium text-gray-500">Loading appointment...</p>
                    </>
                ) : (
                    <>
                        <p className="font-semibold text-gray-900">Appointment not found</p>
                        <p className="mt-1 text-sm text-gray-500">It may have been removed or is not a clinic booking.</p>
                    </>
                )}
                <button
                    type="button"
                    onClick={leaveDetailPage}
                    className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                >
                    Back to appointments
                </button>
            </div>
            ) : null}

            {/* Appointment details page */}
            {isDetailPage && selectedAppointment && (() => {
                const ownerName = getOwnerDisplayName(selectedAppointment.user);
                const bookedPets = getAppointmentPets(selectedAppointment);
                const animalQuery = animalSearch.trim().toLowerCase();
                const visiblePets = animalQuery
                    ? bookedPets.filter((pet) => {
                        const haystack = [
                            pet.name,
                            pet.pet_name,
                            pet.identification_number,
                            ...(Array.isArray(pet.services) ? pet.services : []),
                        ].filter(Boolean).join(' ').toLowerCase();
                        return haystack.includes(animalQuery);
                    })
                    : bookedPets;
                const petDetails = bookedPets.find((pet) => pet.id === modalPetId)
                    || bookedPets[0]
                    || selectedAppointment.pet;
                const activePetName = petDetails?.name || petDetails?.pet_name || 'animal';
                const petIsCancelled = getPetBookingStatus(petDetails, selectedAppointment) === 'cancelled';
                const activePetStatus = getPetBookingStatus(petDetails, selectedAppointment);
                const petTreatmentItems = getPetTreatmentItems(selectedAppointment, petDetails);
                const petAdministeredBy = getPetAdministeredBy(selectedAppointment, petDetails);
                const appointmentStatus = selectedAppointment.status;
                const serviceNames = (
                    Array.isArray(petDetails?.services) && petDetails.services.length > 0
                        ? petDetails.services
                        : (selectedAppointment.services?.length > 0
                            ? selectedAppointment.services
                            : [selectedAppointment.service])
                ).filter(Boolean);
                const actualSymptoms = (selectedAppointment.complaint?.symptoms || []).filter((s) => s.name !== 'Bite Incident');
                const hasTreatmentSymptoms =
                    actualSymptoms.length > 0 &&
                    serviceNames.some((n) => String(n).toLowerCase().includes('treatment'));
                const sharedOutsidePurchaseItems = (() => {
                    const filled = getTreatablePets(selectedAppointment)
                        .map((pet) => (treatmentDrafts[pet.id] || createTreatmentDraft(pet)).outsidePurchaseItems || [])
                        .find((lines) => lines.some((line) => String(line.name || '').trim()));
                    return filled || activeTreatmentDraft.outsidePurchaseItems;
                })();
                const medicineSummaryGroups = getTreatablePets(selectedAppointment).map((pet) => {
                    const draft = treatmentDrafts[pet.id] || createTreatmentDraft(pet);
                    const weight = draft.treatmentPetWeight;
                    const names = Array.isArray(pet.services) && pet.services.length > 0
                        ? pet.services
                        : [];

                    return {
                        id: pet.id,
                        name: pet.name || pet.pet_name || 'Animal',
                        services: names.filter(Boolean),
                        active: pet.id === petDetails?.id,
                        clinicItems: (draft.selectedInventoryItems || []).map((item) => ({
                            id: item.id,
                            name: item.medicine?.name || 'Unknown item',
                            category: item.medicine?.category?.name || '',
                            quantityLabel: item.is_vial && (draft.calculatedDosages?.[item.id] || weight)
                                ? `${Number(draft.calculatedDosages?.[item.id] ?? calculateVialDosage(weight)).toFixed(2)} ml`
                                : `${formatDisplayNumber(item.quantity)} ${item.is_box ? 'items' : item.unit?.name || 'units'}`,
                        })),
                        outsideItems: (draft.outsidePurchaseItems || [])
                            .filter((line) => String(line.name || '').trim())
                            .map((line) => ({
                                id: line.id,
                                name: String(line.name).trim(),
                                quantity: line.quantity,
                                status: normalizeOutsidePurchaseStatus(line.status),
                            })),
                    };
                });
                const actionablePets = getAppointmentPets(selectedAppointment).filter(
                    (pet) => canSelectPetForBulkActions(selectedAppointment, pet)
                );
                const canManagePets = actionablePets.length > 0;
                const allActionableSelected = actionablePets.length > 0
                    && actionablePets.every((pet) => selectedPetIds.includes(pet.id));
                const selectedPendingCount = selectedPetIds.filter((petId) => {
                    const pet = bookedPets.find((item) => item.id === petId);
                    return pet && getPetBookingStatus(pet, selectedAppointment) === 'pending';
                }).length;
                const selectedCancelCount = selectedPetIds.filter((petId) => {
                    const pet = bookedPets.find((item) => item.id === petId);
                    return pet && canShowPetCancelAction(selectedAppointment, pet);
                }).length;
                const showLateCancelActions = canLateCancelAppointment(selectedAppointment);

                return (
                <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <header className="shrink-0 border-b border-line bg-white px-5 py-3 lg:px-6">
                            <button
                                type="button"
                                onClick={leaveDetailPage}
                                className="text-sm font-semibold text-teal hover:text-navy"
                            >
                                Back to appointments
                            </button>
                            <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-xl font-semibold tracking-tight text-navy">
                                            {ownerName}
                                        </h2>
                                        <OwnerApprovalBadge user={selectedAppointment.user} />
                                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                                            STATUS_BADGE[appointmentStatus] || STATUS_BADGE.pending
                                        }`}>
                                            {formatAppointmentStatusLabel(selectedAppointment)}
                                        </span>
                                    </div>
                                    {(selectedAppointment.user?.phone_number || selectedAppointment.user?.email) ? (
                                        <p className="mt-1 text-sm text-muted">
                                            {[selectedAppointment.user?.phone_number, selectedAppointment.user?.email].filter(Boolean).join('  ·  ')}
                                        </p>
                                    ) : null}
                                </div>
                                <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">When</dt>
                                        <dd className="font-semibold text-navy">{formatDate(selectedAppointment.date)}</dd>
                                        <dd className="text-xs text-muted">
                                            {formatBookingTimeRange(
                                                selectedAppointment.time,
                                                selectedAppointment.duration_minutes
                                            )}
                                            {' · '}
                                            {formatDuration(selectedAppointment.duration_minutes)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Where</dt>
                                        <dd className="font-semibold text-navy">{getBarangayName(selectedAppointment.user?.barangay) || '—'}</dd>
                                        {getZoneName(selectedAppointment.user?.zone) ? (
                                            <dd className="text-xs text-muted">{getZoneName(selectedAppointment.user?.zone)}</dd>
                                        ) : null}
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Animals</dt>
                                        <dd className="font-semibold text-navy">{bookedPets.length} booked</dd>
                                    </div>
                                </dl>
                            </div>
                        </header>

                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                            <aside className="flex max-h-[40vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-line bg-white lg:max-h-none lg:w-[22rem] lg:border-b-0 lg:border-r xl:w-[24rem]">
                                <div className="shrink-0 border-b border-line px-4 py-3">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <h3 className="text-sm font-semibold text-navy">Booked animals</h3>
                                        <span className="text-xs font-medium tabular-nums text-muted">{bookedPets.length}</span>
                                    </div>
                                    {bookedPets.length >= 4 ? (
                                        <input
                                            type="search"
                                            value={animalSearch}
                                            onChange={(e) => setAnimalSearch(e.target.value)}
                                            placeholder="Search name, ID, or service"
                                            className="mt-2 w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-navy placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                                        />
                                    ) : (
                                        <p className="mt-1 text-xs text-muted">Select an animal to view details.</p>
                                    )}
                                </div>

                                {canManagePets ? (
                                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-5 py-3">
                                        <label className="inline-flex items-center gap-2 text-sm font-medium text-navy">
                                            <input
                                                type="checkbox"
                                                checked={allActionableSelected}
                                                onChange={() => toggleSelectAllActionable(selectedAppointment)}
                                                className="rounded border-gray-300 text-teal focus:ring-teal"
                                            />
                                            Select all actionable
                                        </label>
                                        {selectedPetIds.length > 0 ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm text-muted">
                                                    {selectedPetIds.length} selected
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => requestBulkApproveSelected(selectedAppointment)}
                                                    disabled={processing || selectedPendingCount === 0}
                                                    className="inline-flex items-center rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-50"
                                                >
                                                    Approve selected
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => requestBulkCancelSelected(selectedAppointment)}
                                                    disabled={processing || selectedCancelCount === 0}
                                                    className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                                >
                                                    Cancel selected
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-hide">
                                    {visiblePets.length === 0 ? (
                                        <p className="px-1 py-6 text-center text-sm text-muted">No animals match that search.</p>
                                    ) : visiblePets.map((pet) => {
                                        const petBusy = processing || updatingAnimalId === pet.id;
                                        const petStatus = getPetBookingStatus(pet, selectedAppointment);
                                        const petDraft = treatmentDrafts[pet.id];
                                        const outsideReadyCount = (petDraft?.outsidePurchaseItems || []).filter((line) => (
                                            String(line.name || '').trim() && Number(line.quantity) > 0
                                        )).length;
                                        const treatmentHint = appointmentStatus === 'processing' && petStatus !== 'cancelled'
                                            ? {
                                                ready: (petDraft?.selectedInventoryItems?.length || 0) > 0 || outsideReadyCount > 0,
                                                itemCount: (petDraft?.selectedInventoryItems?.length || 0) + outsideReadyCount,
                                            }
                                            : null;
                                        return (
                                            <BookedPetCard
                                                key={pet.id}
                                                pet={pet}
                                                appointment={selectedAppointment}
                                                isActive={pet.id === petDetails?.id}
                                                isSelected={selectedPetIds.includes(pet.id)}
                                                canSelect={canSelectPetForBulkActions(selectedAppointment, pet)}
                                                serviceNames={serviceNames}
                                                petBusy={petBusy}
                                                treatmentHint={treatmentHint}
                                                compact
                                                onSelectPet={(petId) => {
                                                    setModalPetId(petId);
                                                    setTreatmentErrors({});
                                                    loadPetMedical(petId);
                                                }}
                                                onToggleSelect={togglePetSelection}
                                                onApprove={(selectedPet) => handleApprovePet(selectedAppointment.id, selectedPet)}
                                                onCancel={(selectedPet) => openAnimalCancel(selectedAppointment, selectedPet)}
                                            />
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
                                <div className="shrink-0 border-b border-line bg-white px-5 py-3 lg:px-6">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Selected animal</p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                        <h3 className="text-lg font-semibold text-navy">
                                            {petDetails?.name || petDetails?.pet_name || 'animal'}
                                        </h3>
                                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                            STATUS_BADGE[activePetStatus] || STATUS_BADGE.pending
                                        }`}>
                                            {activePetStatus ? activePetStatus.charAt(0).toUpperCase() + activePetStatus.slice(1) : '—'}
                                        </span>
                                    </div>
                                    {serviceNames.length > 0 ? (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {serviceNames.map((name) => (
                                                <span
                                                    key={name}
                                                    className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-navy ring-1 ring-line"
                                                >
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                    <Tabs
                                        className="mt-3 w-full"
                                        variant="segmented"
                                        fullWidth
                                        value={detailTab}
                                        onChange={setDetailTab}
                                        items={[
                                            { id: 'profile', label: 'Profile' },
                                            { id: 'visit', label: 'This visit' },
                                            {
                                                id: 'records',
                                                label: 'Records',
                                                count: (petMedical.historyCount || petMedical.history?.length || 0) || undefined,
                                            },
                                        ]}
                                    />
                                </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 scrollbar-hide" key={modalPetId}>
                            {detailTab === 'visit' ? (
                            <>
                            {['processing', 'ongoing', 'completed'].includes(appointmentStatus) ? (
                            <div className="mb-5 space-y-4">
                            {selectedAppointment.status === 'processing' && petIsCancelled && (
                                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <ViewSectionHeader
                                        title="Medicine Used"
                                        subtitle={`${activePetName} was cancelled for this appointment`}
                                    />
                                    <p className="text-sm text-gray-600">
                                        This animal will not receive treatment. Click another booked animal to record medicines.
                                    </p>
                                </section>
                            )}

                            {selectedAppointment.status === 'processing' && !petIsCancelled && (
                                <ModalCard
                                    title="Medicine Used"
                                    subtitle={`Select items used for ${activePetName}, then mark as ongoing`}
                                >
                                    <div key={modalPetId} className="space-y-5">
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                                                    Animal weight (kg)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    value={treatmentPetWeight}
                                                    onChange={(e) => {
                                                        const newWeight = e.target.value;
                                                        patchTreatmentDraft(modalPetId, (draft) => {
                                                            const newDosages = {};
                                                            draft.selectedInventoryItems.forEach((item) => {
                                                                if (item.is_vial && newWeight) {
                                                                    newDosages[item.id] = calculateVialDosage(newWeight);
                                                                }
                                                            });
                                                            return {
                                                                ...draft,
                                                                treatmentPetWeight: newWeight,
                                                                calculatedDosages: newDosages,
                                                            };
                                                        });
                                                        if (treatmentErrors.treatmentPetWeight) {
                                                            setTreatmentErrors((prev) => ({ ...prev, treatmentPetWeight: undefined }));
                                                        }
                                                    }}
                                                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 ${
                                                        treatmentErrors.treatmentPetWeight
                                                            ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                                                            : 'border-gray-200 focus:border-violet-300 focus:ring-violet-100'
                                                    }`}
                                                    placeholder="Required for vial dosage"
                                                />
                                                {treatmentErrors.treatmentPetWeight && (
                                                    <p className="mt-1 text-xs text-red-600">{treatmentErrors.treatmentPetWeight}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                                                    Administered by <span className="text-red-500">*</span>
                                                </label>
                                                <AdministeredBySelect
                                                    value={administeredBy}
                                                    onChange={(nextValue) => {
                                                        patchTreatmentDraft(modalPetId, { administeredBy: nextValue });
                                                        if (treatmentErrors.administeredBy) {
                                                            setTreatmentErrors((prev) => ({ ...prev, administeredBy: undefined }));
                                                        }
                                                    }}
                                                    error={treatmentErrors.administeredBy}
                                                />
                                                {treatmentErrors.administeredBy && (
                                                    <p className="mt-1 text-xs text-red-600">{treatmentErrors.administeredBy}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
                                        <div className="min-w-0 space-y-5">
                                        {selectedInventoryItems.some((item) => item.is_vial) && treatmentPetWeight && (
                                            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
                                                Vial dosage: <span className="font-semibold">{calculateVialDosage(treatmentPetWeight).toFixed(2)} ml</span>
                                                <span className="text-violet-700"> (1 kg = 0.10 ml)</span>
                                            </div>
                                        )}

                                        <div>
                                            <label className="mb-1.5 block text-sm font-medium text-gray-700">
                                                Category
                                            </label>
                                            <select
                                                value={activeInventoryCategory}
                                                onChange={(e) => {
                                                    patchTreatmentDraft(modalPetId, { selectedInventoryCategory: e.target.value });
                                                    if (treatmentErrors.selectedItems) {
                                                        setTreatmentErrors((prev) => ({ ...prev, selectedItems: undefined }));
                                                    }
                                                }}
                                                disabled={inventoryLoading || inventoryCategories.length === 0}
                                                className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 disabled:opacity-50 ${
                                                    treatmentErrors.selectedItems
                                                        ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                                                        : 'border-gray-200 focus:border-violet-300 focus:ring-violet-100'
                                                }`}
                                            >
                                                {inventoryCategories.length !== 1 && (
                                                    <option value="">Select a category</option>
                                                )}
                                                {inventoryCategories.map((categoryName) => (
                                                    <option key={categoryName} value={categoryName}>
                                                        {categoryName}
                                                    </option>
                                                ))}
                                            </select>
                                            {treatmentErrors.selectedItems && (
                                                <p className="mb-3 mt-2 text-xs text-red-600">{treatmentErrors.selectedItems}</p>
                                            )}

                                            {!activeInventoryCategory ? (
                                                <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                                                    {inventoryLoading
                                                        ? 'Loading categories...'
                                                        : inventoryCategories.length === 0
                                                            ? 'No medicine is in stock for this service. Use the outside clinic receipt.'
                                                            : 'Choose a category to see the medicines.'}
                                                </p>
                                            ) : visibleInventoryItems.length === 0 ? (
                                                <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                                                    {inventoryLoading
                                                        ? 'Loading items...'
                                                        : `No medicine is in stock in ${activeInventoryCategory}. Use the outside clinic receipt.`}
                                                </p>
                                            ) : (
                                                <div className="mt-3 grid max-h-80 grid-cols-1 gap-3 overflow-y-auto pr-1 scrollbar-hide md:grid-cols-2">
                                                    {visibleInventoryItems.map((item) => {
                                                        const selected = selectedInventoryItems.find((entry) => entry.id === item.id);
                                                        return (
                                                            <div
                                                                key={item.id}
                                                                className={`rounded-xl border bg-white p-4 transition-colors ${
                                                                    selected ? 'border-violet-300 ring-1 ring-violet-100' : 'border-gray-200'
                                                                }`}
                                                            >
                                                                <label className="flex cursor-pointer items-start gap-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={Boolean(selected)}
                                                                        onChange={() => toggleInventoryItem(item)}
                                                                        className="mt-0.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                                                    />
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-sm font-medium text-gray-900">
                                                                            {item.medicine?.name || 'Unknown item'}
                                                                        </p>
                                                                        <p className="mt-0.5 text-xs text-gray-500">
                                                                                    {item.is_box ? (
                                                                                        <>
                                                                                            {formatDisplayNumber(item.available_total ?? item.total_items)} items available
                                                                                            <span className="text-gray-400"> · oldest batch first</span>
                                                                                        </>
                                                                                    ) : item.is_vial ? (
                                                                                        <>
                                                                                            {formatDisplayNumber(item.available_total ?? item.quantity)} vial(s)
                                                                                            {item.volume_ml ? ` · ${formatDisplayNumber(item.volume_ml)} ml each` : ''}
                                                                                            <span className="text-gray-400"> · oldest batch first</span>
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            Stock: {formatDisplayNumber(item.available_total ?? item.quantity)} {item.unit?.name || 'units'}
                                                                                            <span className="text-gray-400"> · oldest batch first</span>
                                                                                        </>
                                                                                    )}
                                                                        </p>
                                                                    </div>
                                                                </label>
                                                                {selected && (
                                                                    <div className="mt-3 border-t border-gray-100 pt-3">
                                                                        {item.is_vial && treatmentPetWeight ? (
                                                                            <p className="text-xs font-medium text-violet-700">
                                                                                Dosage: {(calculatedDosages[item.id] ?? calculateVialDosage(treatmentPetWeight)).toFixed(2)} ml
                                                                            </p>
                                                                        ) : (
                                                                            <div>
                                                                                <label className="text-xs text-gray-600">
                                                                                    Quantity ({item.is_box ? 'items' : item.unit?.name || 'units'})
                                                                                </label>
                                                                                        <input
                                                                                            type="number"
                                                                                            min="1"
                                                                                            max={item.available_total ?? (item.is_box ? item.total_items : item.quantity)}
                                                                                            value={selected.quantity || 1}
                                                                                            onChange={(e) => {
                                                                                                updateInventoryItemQuantity(item.id, e.target.value);
                                                                                                if (treatmentErrors[`item_${item.id}`]) {
                                                                                                    setTreatmentErrors((prev) => {
                                                                                                        const next = { ...prev };
                                                                                                        delete next[`item_${item.id}`];
                                                                                                        return next;
                                                                                                    });
                                                                                                }
                                                                                            }}
                                                                                            className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 ${
                                                                                                treatmentErrors[`item_${item.id}`]
                                                                                                    ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                                                                                                    : 'border-gray-200 focus:border-violet-300 focus:ring-violet-100'
                                                                                            }`}
                                                                                        />
                                                                                        {treatmentErrors[`item_${item.id}`] && (
                                                                                            <p className="mt-1 text-xs text-red-600">{treatmentErrors[`item_${item.id}`]}</p>
                                                                                        )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <OutsidePurchaseEditor
                                            items={sharedOutsidePurchaseItems}
                                            onChange={(nextItems) => {
                                                const pets = getTreatablePets(selectedAppointment);
                                                setTreatmentDrafts((prev) => {
                                                    const next = { ...prev };
                                                    pets.forEach((pet) => {
                                                        const current = next[pet.id] || createTreatmentDraft(pet);
                                                        next[pet.id] = { ...current, outsidePurchaseItems: nextItems };
                                                    });
                                                    return next;
                                                });
                                                setTreatmentErrors((prev) => {
                                                    const next = { ...prev };
                                                    delete next.selectedItems;
                                                    Object.keys(next).forEach((key) => {
                                                        if (key.startsWith('outside_')) delete next[key];
                                                    });
                                                    return next;
                                                });
                                            }}
                                            errors={treatmentErrors}
                                            clinicHasNoStock={!inventoryLoading && visibleInventoryItems.length === 0}
                                            receipt={{
                                                animals: getTreatablePets(selectedAppointment).map((pet) => ({
                                                    name: pet.name || pet.pet_name,
                                                    patientId: pet.identification_number
                                                        || (pet.registration_status === 'exempt' ? 'No ID needed' : '—'),
                                                })),
                                                ownerName,
                                                serviceNames: [...new Set(getTreatablePets(selectedAppointment).flatMap((pet) => (
                                                    Array.isArray(pet.services) && pet.services.length > 0 ? pet.services : serviceNames
                                                )).filter(Boolean))],
                                                symptoms: actualSymptoms,
                                                category: activeInventoryCategory,
                                                categories: inventoryCategories,
                                            }}
                                        />
                                        </div>
                                        <MedicineVisitSummary groups={medicineSummaryGroups} />
                                        </div>
                                    </div>
                                </ModalCard>
                            )}
                            {(petAdministeredBy || petTreatmentItems.length > 0 || (petDetails?.outside_purchase_items?.length > 0) || appointmentStatus !== 'processing') && (
                                <MedicineUsedPanel
                                    petName={activePetName}
                                    administeredBy={petAdministeredBy}
                                    items={petTreatmentItems}
                                    outsideItems={petDetails?.outside_purchase_items || []}
                                    onPrintOutside={(selectedAppointment.outside_purchase_items?.length || petDetails?.outside_purchase_items?.length) ? () => {
                                        const savedItems = selectedAppointment.outside_purchase_items?.length
                                            ? selectedAppointment.outside_purchase_items
                                            : petDetails.outside_purchase_items;
                                        const uniqueItems = savedItems.filter((item, index, list) => list.findIndex((entry) => (
                                            entry.name === item.name
                                            && String(entry.quantity) === String(item.quantity)
                                            && entry.status === item.status
                                        )) === index);
                                        const receiptPets = getTreatablePets(selectedAppointment);
                                        const receiptServices = [...new Set(receiptPets.flatMap((pet) => (
                                            Array.isArray(pet.services) && pet.services.length > 0 ? pet.services : serviceNames
                                        )).filter(Boolean))];
                                        const details = buildVisitReceiptDetails(receiptServices, actualSymptoms);
                                        printOutsidePurchaseReceipt({
                                            animals: receiptPets.map((pet) => ({
                                                name: pet.name || pet.pet_name,
                                                patientId: pet.identification_number
                                                    || (pet.registration_status === 'exempt' ? 'No ID needed' : '—'),
                                            })),
                                            ownerName,
                                            serviceType: details.serviceType,
                                            treatment: details.treatment,
                                            category: autoInventoryCategoryLabel(receiptServices),
                                            items: uniqueItems,
                                            issuedAt: uniqueItems[0]?.issued_at,
                                        });
                                    } : undefined}
                                />
                            )}
                            </div>
                            ) : null}

                            <section className="mt-4 rounded-xl border border-line bg-white p-4">
                                <ViewSectionHeader title="This visit" subtitle="Staff and notes for this appointment" />
                                <div className="rounded-lg border border-line bg-canvas p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Administered By</p>
                                    <p className="mt-1.5 text-sm font-semibold text-navy">
                                        {petAdministeredBy || 'Unassigned'}
                                    </p>
                                </div>

                                {hasTreatmentSymptoms && (
                                    <div className="mt-4">
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Treatment Symptoms</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {actualSymptoms.map((symptom, idx) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex rounded-md border border-violet-100 bg-violet-50 px-2.5 py-1 text-sm font-medium text-violet-800"
                                                >
                                                    {symptom.name}
                                                    {symptom.days_count ? (
                                                        <span className="ml-1 text-violet-600">· {symptom.days_count} days</span>
                                                    ) : null}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedAppointment.notes && (
                                    <div className="mt-4 rounded-lg border border-line bg-canvas px-3 py-2.5">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Notes</p>
                                        <p className="mt-1.5 text-sm leading-relaxed text-navy">{selectedAppointment.notes}</p>
                                    </div>
                                )}

                                {selectedAppointment.cancellation_reason && appointmentStatus === 'cancelled' && (
                                    <div className="mt-4 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2.5">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500">Cancellation Reason</p>
                                        <p className="mt-1.5 text-sm leading-relaxed text-red-900">{selectedAppointment.cancellation_reason}</p>
                                    </div>
                                )}
                            </section>

                            <section className="mt-4 rounded-xl border border-line bg-white p-4">
                                <ViewSectionHeader
                                    title="Status History"
                                    subtitle="Who submitted, approved, processed, completed, or cancelled this appointment"
                                />
                                {selectedAppointment.status_history?.length > 0 ? (
                                    <AppointmentStatusHistory
                                        history={selectedAppointment.status_history}
                                    />
                                ) : (
                                    <p className="text-sm text-muted">No status history recorded yet.</p>
                                )}
                            </section>
                            </>
                            ) : null}

                            {detailTab === 'profile' ? (
                                <PetMedicalSections
                                    pet={petDetails}
                                    owner={selectedAppointment.user}
                                    medical={petMedical}
                                    loading={petMedical.loading}
                                    onPreview={openPhotoPreview}
                                    showOwner={false}
                                    variant="profile"
                                />
                            ) : null}

                            {detailTab === 'records' ? (
                                <PetMedicalSections
                                    pet={petDetails}
                                    owner={selectedAppointment.user}
                                    medical={petMedical}
                                    loading={petMedical.loading}
                                    onPreview={openPhotoPreview}
                                    showOwner={false}
                                    variant="history"
                                />
                            ) : null}
                            </div>
                            </div>
                        </div>

                        {/* Footer */}
                        {selectedAppointment.status !== 'pending' ? (
                        <div className="shrink-0 border-t border-line bg-white px-5 py-3 lg:px-6">
                            {selectedAppointment.status === 'processing' ? (
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => handleCompleteTreatment(selectedAppointment.id)}
                                        disabled={processing}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                        {processing ? 'Processing...' : 'Mark as Ongoing'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={leaveDetailPage}
                                        disabled={processing}
                                        className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Back to list
                                    </button>
                                </div>
                            ) : selectedAppointment.status === 'ongoing' ? (
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <div className="flex flex-1 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800">
                                        Waiting for budget officer to complete this treatment.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={leaveDetailPage}
                                        className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                        Back to list
                                    </button>
                                </div>
                            ) : selectedAppointment.status === 'approved' ? (
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => openProcessingAssign(selectedAppointment.id)}
                                        disabled={processing || updatingStatusId === selectedAppointment.id || !isAppointmentScheduleDay(selectedAppointment)}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {processing || updatingStatusId === selectedAppointment.id ? 'Processing...' : 'Mark as Processing'}
                                    </button>
                                    {showLateCancelActions ? (
                                        <button
                                            type="button"
                                            onClick={() => requestCancelAllLate(selectedAppointment)}
                                            disabled={processing}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition-all hover:bg-red-50 disabled:opacity-50"
                                        >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Cancel all (Late)
                                        </button>
                                    ) : null}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={leaveDetailPage}
                                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                                >
                                    Back to list
                                </button>
                            )}
                            {selectedAppointment.status === 'approved' && !isAppointmentScheduleDay(selectedAppointment) && (
                                <p className="mt-2 text-center text-xs text-slate-500">
                                    On the appointment date, mark this as processing and choose the fieldman who will administer it.
                                </p>
                            )}
                            {selectedAppointment.status === 'processing' && getTreatablePets(selectedAppointment).length > 1 && (
                                <p className="mt-2 text-center text-xs text-amber-700">
                                    Record treatment and medicines for every booked animal before marking as ongoing.
                                </p>
                            )}
                        </div>
                        ) : null}
                    </div>
                </div>
                );
            })()}

            <PhotoPreviewOverlay preview={photoPreview} onClose={closePhotoPreview} />

            <ProcessingFieldmanModal
                open={processingAssignId !== null}
                processing={processing || updatingStatusId === processingAssignId}
                onClose={() => {
                    if (processing || updatingStatusId === processingAssignId) return;
                    setProcessingAssignId(null);
                }}
                onConfirm={(assignment) => {
                    if (!processingAssignId) return;
                    handleStatusChange(processingAssignId, 'processing', assignment);
                }}
            />

            {tableCancelAppointmentId && (() => {
                const tableCancelAppointment = appointments.find((a) => a.id === tableCancelAppointmentId);
                const isLateCancel = tableCancelAppointment?.status === 'approved'
                    && isAppointmentScheduleDay(tableCancelAppointment);

                return (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                        <div className="border-b border-violet-100 px-6 py-4">
                            <h2 className="text-lg font-bold text-gray-900">
                                {isLateCancel ? 'Cancel Late Appointment' : 'Cancel Appointment'}
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                {isLateCancel
                                    ? 'The owner did not arrive on time. The client will be notified to book again.'
                                    : 'The client will be notified with your cancellation reason.'}
                            </p>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                            <CancellationReasonFields
                                cancelReason={cancelReason}
                                setCancelReason={setCancelReason}
                                cancelError={cancelError}
                                setCancelError={setCancelError}
                                fieldId="table-cancel-reason"
                                templates={getCancellationTemplates(tableCancelAppointment?.status)}
                                helperText={isLateCancel
                                    ? 'Use this when the owner did not arrive on time for an approved appointment.'
                                    : null}
                                placeholder={isLateCancel
                                    ? 'Explain that the appointment was cancelled due to late arrival or no-show.'
                                    : 'Explain why this appointment is being cancelled. The client will receive this message.'}
                            />
                            <div className="flex flex-col gap-2.5 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={closeTableCancelModal}
                                    disabled={processing}
                                    className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCancel(tableCancelAppointmentId)}
                                    disabled={processing}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
                                >
                                    {processing ? 'Processing...' : (isLateCancel ? 'Confirm Cancel (Late)' : 'Confirm Cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}

            {animalCancelTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                        <div className="border-b border-violet-100 px-6 py-4">
                            <h2 className="text-lg font-bold text-gray-900">
                                {animalCancelTarget.isLate ? 'Cancel Late Animal' : 'Cancel Animal'}
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                {animalCancelTarget.isLate
                                    ? `${animalCancelTarget.petName} will be cancelled from this approved appointment. The client will be notified.`
                                    : `${animalCancelTarget.petName} will be cancelled from this appointment. The client will be notified.`}
                            </p>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                            <CancellationReasonFields
                                cancelReason={cancelReason}
                                setCancelReason={setCancelReason}
                                cancelError={cancelError}
                                setCancelError={setCancelError}
                                fieldId="animal-cancel-reason"
                                templates={getCancellationTemplates(animalCancelTarget.isLate ? 'approved' : 'pending')}
                                helperText={animalCancelTarget.isLate
                                    ? 'Use this when this animal should not continue on the approved appointment.'
                                    : null}
                                placeholder={`Explain why ${animalCancelTarget.petName} is being cancelled. The client will receive this message.`}
                            />
                            <div className="flex flex-col gap-2.5 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={closeAnimalCancel}
                                    disabled={processing}
                                    className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelAnimal}
                                    disabled={processing}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
                                >
                                    {processing
                                        ? 'Processing...'
                                        : (animalCancelTarget.isLate ? 'Confirm Cancel (Late)' : 'Confirm Cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(confirmDialog)}
                title={confirmDialog?.title || ''}
                message={confirmDialog?.message || ''}
                confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
                confirmTone={confirmDialog?.confirmTone || 'primary'}
                processing={processing}
                onConfirm={() => {
                    if (typeof confirmDialog?.onConfirm === 'function') {
                        confirmDialog.onConfirm();
                    }
                }}
                onCancel={() => setConfirmDialog(null)}
            />

            {bulkCancelTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                        <div className="border-b border-violet-100 px-6 py-4">
                            <h2 className="text-lg font-bold text-gray-900">
                                {bulkCancelTarget.isLate ? 'Cancel Animals (Late)' : 'Cancel Animals'}
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                {bulkCancelTarget.isLate
                                    ? `Provide a reason to cancel ${bulkCancelTarget.label}. Other animals on this appointment will not be changed.`
                                    : `Provide a reason to cancel ${bulkCancelTarget.label}. Other animals on this appointment will not be changed.`}
                            </p>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                            <CancellationReasonFields
                                cancelReason={cancelReason}
                                setCancelReason={setCancelReason}
                                cancelError={cancelError}
                                setCancelError={setCancelError}
                                fieldId="bulk-cancel-reason"
                                templates={getCancellationTemplates(bulkCancelTarget.isLate ? 'approved' : 'pending')}
                                helperText={bulkCancelTarget.isLate
                                    ? 'Use this when the owner did not arrive on time for an approved appointment.'
                                    : null}
                                placeholder="Explain why these animals are being cancelled. The client will receive this message."
                            />
                            <div className="flex flex-col gap-2.5 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={closeBulkCancel}
                                    disabled={processing}
                                    className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmitBulkCancel}
                                    disabled={processing}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
                                >
                                    {processing ? 'Processing...' : (bulkCancelTarget.isLate ? 'Confirm Cancel (Late)' : 'Confirm Cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal
                open={successModal.open}
                title={successModal.title}
                message={successModal.message}
                onClose={closeSuccessModal}
            />

            <BookingSlotEditor open={showSlotEditor} onClose={() => setShowSlotEditor(false)} />

            <MissingMedicineModal
                open={missingMedicineAlert.open}
                pets={missingMedicineAlert.pets}
                onClose={closeMissingMedicineAlert}
            />

        </div>
    );
}
