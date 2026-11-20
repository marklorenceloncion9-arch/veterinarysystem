import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Head, usePage } from '@inertiajs/react';
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
} from '@/Components/Admin/OutsidePurchaseReceipt';
import MedicineVisitSummary from '@/Components/Admin/MedicineVisitSummary';
import axios from 'axios';
import { readAdminListCacheEntry, writeAdminListCache, clearAdminListCache } from '@/utils/adminListCache';
import { subscribeToAppointments } from '@/utils/echo';
import { sortAdminAppointmentsNewestFirst } from '@/utils/adminAppointmentSort';
import { autoInventoryCategoryLabel, filterGroupedInventoryByServices } from '@/utils/serviceInventoryCategories';
import { filterUsableInventory } from '@/utils/inventoryStock';
import Tabs from '@/Components/Ui/Tabs';

// Diri himuon ang cache key sa services sa bulan.
const getServicesCacheKey = (fromDate, tillDate) => `admin:services:v7:${fromDate || 'all'}:${tillDate || 'all'}`;

const STATUS_BADGE = {
    processing: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
    ongoing:    'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
    completed:  'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const REGISTRATION_BADGE = {
    registered: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    exempt: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
    unregistered: 'bg-violet-50 text-violet-500 ring-1 ring-violet-100',
};

// Diri kuhaon ang label sa registration status.
function getRegistrationLabel(status) {
    if (status === 'registered') return 'Registered';
    if (status === 'exempt') return 'Exempt';
    if (status === 'unregistered') return 'Unregistered';
    return null;
}

const SERVICE_DURATION_MINUTES = {
    'vitamin supplement': 10,
    vitamin: 10,
    vaccination: 10,
    deworming: 10,
    treatment: 10,
    castration: 40,
    spay: 60,
};

// Diri i-convert ang service ID ngadto sa numero.
function normalizeServiceId(id) {
    const parsed = parseInt(id, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

// Diri kuhaon ang gitas-on sa oras sa service.
function getDurationForServiceName(typeName) {
    const key = (typeName || '').toLowerCase().trim();
    if (!key) return 10;

    const entries = Object.entries(SERVICE_DURATION_MINUTES)
        .sort(([a], [b]) => b.length - a.length);

    for (const [name, minutes] of entries) {
        if (key === name || key.includes(name)) return minutes;
    }
    return 10;
}

// Diri kwentahon ang total nga oras sa napiling services.
function getSelectedServicesDuration(serviceIds, availableServices) {
    if (!serviceIds?.length) return 10;

    const uniqueIds = [...new Set(
        serviceIds.map(normalizeServiceId).filter((id) => id !== null)
    )];

    const total = uniqueIds.reduce((sum, id) => {
        const service = availableServices.find((s) => Number(s.id) === id);
        return sum + getDurationForServiceName(service?.type_name);
    }, 0);

    return total > 0 ? total : 10;
}

// Diri kuhaon ang mga service ID sa hayop.
function getPetServiceIds(petServices, petId) {
    const list = petServices?.[normalizePetId(petId)];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeServiceId).filter((id) => id !== null);
}

// Diri kuhaon ang unique nga service ID sa tanang hayop.
function uniqueServiceIdsFromPetServices(petServices, petIds = []) {
    const ids = [];
    petIds.forEach((petId) => {
        getPetServiceIds(petServices, petId).forEach((id) => {
            if (!ids.includes(id)) ids.push(id);
        });
    });
    return ids;
}

// Diri ang walay napiling tambal sa usa ka hayop.
function emptyWalkInPetMedicine() {
    return {
        selectedInventoryItems: [],
        outsidePurchaseItems: [createOutsidePurchaseLine()],
    };
}

// Diri kuhaon ang mga ngalan sa service gikan sa ID.
function serviceNamesForIds(serviceIds, availableServices) {
    return (serviceIds || [])
        .map((id) => availableServices.find((service) => normalizeServiceId(service.id) === normalizeServiceId(id))?.type_name)
        .filter(Boolean);
}

// Diri kwentahon ang gitas-on sa appointment.
function getAppointmentDuration(appointment) {
    const names = [...new Set(appointment?.service_names || appointment?.services || [])];
    if (names.length > 0) {
        const total = names.reduce((sum, name) => sum + getDurationForServiceName(name), 0);
        if (total > 0) return total;
    }

    if (appointment?.duration_minutes > 0) return appointment.duration_minutes;
    return 10;
}

// Diri i-format ang mga service nga mubo.
function formatServicesCompact(serviceNames = []) {
    const names = [...new Set((serviceNames || []).filter(Boolean))];
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
}

// Diri i-normalize ang status sa walk-in.
function normalizeWalkInStatus(status) {
    if (!status || status === 'pending') return 'processing';
    return status;
}

// Diri himuon ang label sa status sa walk-in.
function formatWalkInStatusLabel(status) {
    const normalized = normalizeWalkInStatus(status);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// Diri i-convert ang pet ID ngadto sa string.
function normalizePetId(id) {
    return String(id);
}

// Diri kuhaon ang mga hayop sa appointment.
function getAppointmentPets(appointment) {
    if (Array.isArray(appointment?.pets) && appointment.pets.length > 0) {
        return appointment.pets.filter((pet) => pet?.id);
    }
    return appointment?.animal?.id ? [appointment.animal] : [];
}

// Diri himuon ang label sa mga ngalan sa hayop.
function formatPetsLabel(pets) {
    const names = (pets || []).map((pet) => pet?.pet_name).filter(Boolean);
    if (names.length === 0) return 'Unknown Pet';
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

// Diri kuhaon ang timbang sa hayop.
function getWeightFromPet(pet) {
    const weight = pet?.weight;
    if (weight == null || weight === '' || Number(weight) <= 0) return '';
    return formatDisplayNumber(weight);
}

// Diri kwentahon ang dosage sa vial base sa timbang.
function calculateVialDosage(weight) {
    if (!weight || weight === '') return 0;
    return parseFloat(String(weight)) * 0.10;
}

// Diri i-format ang numero para ipakita.
function formatDisplayNumber(value) {
    if (value == null || value === '') return '0';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    if (Number.isInteger(num)) return String(num);
    return String(parseFloat(num.toFixed(3)));
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
    assignedFieldmanId,
    treatmentPetWeight,
    treatmentPetWeights,
    selectedInventoryItems,
    treatmentInventory = [],
    selectedPets = [],
    outsidePurchaseItems = [],
}) {
    const errors = {};
    const staffName = administeredBy.trim();
    const pets = selectedPets.length > 0
        ? selectedPets
        : [{ id: 'single' }];
    const petCount = Math.max(1, pets.length);
    const weightsById = treatmentPetWeights && typeof treatmentPetWeights === 'object'
        ? treatmentPetWeights
        : { [pets[0]?.id ?? 'single']: treatmentPetWeight };

    if (!staffName) {
        errors.administeredBy = 'Please select who administered the treatment.';
    } else if (staffName.length < 2) {
        errors.administeredBy = 'Name must be at least 2 characters.';
    }

    // Fieldman-assigned walk-ins stay in processing. Medicine is recorded later
    // on the fieldman mobile app, so inventory is not required here.
    if (assignedFieldmanId) {
        return errors;
    }

    const hasVialItem = selectedInventoryItems.some((item) => item.is_vial);
    if (hasVialItem) {
        const missingWeight = pets.some((pet) => {
            const weight = Number(weightsById[normalizePetId(pet.id)] ?? weightsById[pet.id] ?? '');
            return Number.isNaN(weight) || weight <= 0;
        });
        if (missingWeight) {
            errors.treatmentPetWeight = petCount > 1
                ? 'Weight is required for each selected animal when using vial dosage.'
                : 'Animal weight is required for vial dosage.';
        }
    } else {
        const negativeWeight = pets.some((pet) => {
            const raw = weightsById[normalizePetId(pet.id)] ?? weightsById[pet.id] ?? '';
            return raw !== '' && Number(raw) < 0;
        });
        if (negativeWeight) {
            errors.treatmentPetWeight = 'Weight cannot be negative.';
        }
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
        const requiredQty = qty * petCount;

        if (!qty || qty < 1) {
            errors[`item_${item.id}`] = 'Quantity must be at least 1.';
        } else if (!Number.isNaN(maxQty) && requiredQty > maxQty) {
            errors[`item_${item.id}`] = petCount > 1
                ? `Need ${formatDisplayNumber(requiredQty)} for ${petCount} animals. Maximum available is ${formatDisplayNumber(maxQty)}.`
                : `Maximum available is ${formatDisplayNumber(maxQty)}.`;
        }
    });

    return errors;
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
        label: 'All Walk-ins',
        icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
        ...VIOLET_CARD,
    },
    processing: {
        label: 'Processing',
        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
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
};

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
function ServiceTypeCard({ service, count, active, onClick }) {
    const cfg = getServiceFilterConfig(service.type_name);
    return (
        <CompactFilterCard
            label={service.type_name}
            count={count}
            active={active}
            onClick={onClick}
            cfg={cfg}
        />
    );
}

// Diri kuhaon ang initials sa ngalan.
function getInitials(firstname, lastname) {
    const first = firstname?.trim?.() || '';
    const last = lastname?.trim?.() || '';
    if (first && last) return (first[0] + last[0]).toUpperCase();
    if (first) return first.charAt(0).toUpperCase();
    return '?';
}

// Diri kuhaon ang ngalan sa tag-iya.
function getOwnerDisplayName(user) {
    if (!user) return 'Unknown';
    if (user.firstname) return `${user.firstname} ${user.lastname || ''}`.trim();
    return user.name || 'Unknown';
}

// Diri kuhaon ang apelyido sa tag-iya.
function getOwnerLastName(user) {
    if (!user) return 'Unknown';
    if (user.lastname?.trim()) return user.lastname.trim();
    if (user.name?.trim()) {
        const parts = user.name.trim().split(/\s+/);
        return parts[parts.length - 1] || user.name.trim();
    }
    if (user.firstname?.trim()) return user.firstname.trim();
    return 'Unknown';
}

// Diri kuhaon ang ngalan sa barangay.
function getBarangayName(barangay) {
    if (!barangay) return null;
    if (typeof barangay === 'string') return barangay;
    if (typeof barangay === 'object' && barangay.name) return barangay.name;
    return null;
}

// Diri limpyohan ang URL sa litrato.
function normalizeMediaUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
    return value.startsWith('/') ? value : `/${value}`;
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

// Diri ang gamay nga card sa quick fact.
function QuickFact({ label, value, sub }) {
    return (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
    );
}

const MODAL_HEADER_BG = 'bg-gradient-to-br from-violet-50/70 via-white to-white';

// Diri ang row sa detalye nga naay label ug value.
function DetailRow({ label, value, className = '' }) {
    if (value == null || value === '') return null;
    return (
        <div className={`flex items-start justify-between gap-4 py-2.5 ${className}`}>
            <span className="shrink-0 text-sm text-gray-500">{label}</span>
            <span className="text-right text-sm font-medium text-gray-900">{value}</span>
        </div>
    );
}

// Diri ang header sa section sa view.
function ViewSectionHeader({ title, subtitle }) {
    return (
        <div className="mb-4 flex items-start gap-3">
            <div className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-violet-600" />
            <div>
                <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
            </div>
        </div>
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
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-400">
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

// Diri ang mga section sa medical info sa hayop.
function PetMedicalSections({ pet, owner, medical, loading = false, onPreview }) {
    if (!pet) return null;

    const profile = medical?.medical_profile || {};
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
        <div className="space-y-5">
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <ViewSectionHeader title="Identification Photos" subtitle="Animal photo and unique markings for verification" />
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

            <div className="grid grid-cols-1 gap-5">
                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <ViewSectionHeader title="Owner Information" subtitle="Client contact and location" />
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                        <AvatarImage
                            src={owner?.profile_photo_url}
                            alt={ownerName}
                            fallback={getInitials(owner?.firstname, owner?.lastname)}
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
                    </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
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
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
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

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <ViewSectionHeader
                    title={`Medical History${medical?.history_count ? ` (${medical.history_count})` : ''}`}
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
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {entry.outside_items.map((item, i) => (
                                                    <span key={i} className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">
                                                        Outside clinic · {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
                                                    </span>
                                                ))}
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
        </div>
    );
}

// Diri i-convert ang oras ngadto sa minutes.
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const normalized = timeStr.includes('T') ? timeStr.split('T')[1]?.slice(0, 5) : timeStr.slice(0, 5);
    const [hours, minutes] = normalized.split(':').map(Number);
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

const WALKIN_FIELD_CLASS =
    'block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 transition-colors placeholder:text-gray-400 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-gray-100';

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

// Diri ang row sa pagpili og tag-iya.
function OwnerPickRow({ client, onSelect }) {
    const displayName = getOwnerDisplayName(client);
    const barangay = getBarangayName(client.barangay);
    const meta = [client.phone_number, client.email, barangay].filter(Boolean).join(' · ');

    return (
        <button
            type="button"
            onClick={() => onSelect(client)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
        >
            <AvatarImage
                src={client.profile_photo_url}
                alt={displayName}
                fallback={getInitials(client.firstname, client.lastname)}
                sizeClass="h-9 w-9"
            />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
                    <OwnerApprovalBadge user={client} />
                </div>
                <p className="truncate text-xs text-gray-500">{meta || 'No contact details'}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
                Select
            </span>
        </button>
    );
}

// Diri ang section sa walk-in form nga naay step.
function WalkInFormSection({ step, title, subtitle, iconPath, children, className = '' }) {
    return (
        <section className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
            <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-200">
                    {step ? step : (iconPath ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
                        </svg>
                    ) : null)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {step && iconPath && (
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
                            </svg>
                        )}
                        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                    </div>
                    {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
                </div>
            </div>
            {children}
        </section>
    );
}

// Diri ang card sa detalye nga naay icon.
function DetailInfoCard({ iconPath, iconBg = 'bg-violet-100', iconText = 'text-violet-600', label, children, className = '' }) {
    return (
        <div className={`rounded-xl border border-violet-100 bg-violet-50/40 p-4 ${className}`}>
            <div className="mb-2 flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
                    <svg className={`h-3.5 w-3.5 ${iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
                    </svg>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            </div>
            {children}
        </div>
    );
}

// Diri ang main page sa services.
export default function Services() {
    const { props } = usePage();
    const initialServicesCache = readAdminListCacheEntry(getServicesCacheKey('', ''));

    const [services, setServices] = useState(initialServicesCache?.data ?? []);
    const [loading, setLoading] = useState(!initialServicesCache);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState('all');
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [tillDate, setTillDate] = useState('');
    const [apiToken, setApiToken] = useState(null);
    const [tokenLoaded, setTokenLoaded] = useState(false);
    const apiTokenRef = useRef(null);
    const tokenRequestRef = useRef(null);

    // Diri kuhaon ang API token.
    const retrieveApiToken = async (force = false) => {
        if (tokenRequestRef.current) {
            return tokenRequestRef.current;
        }

        tokenRequestRef.current = (async () => {
            try {
                const response = await fetch('/admin/api-token', {
                    credentials: 'include',
                });
                const data = await response.json();

                if (data.success && data.token) {
                    localStorage.setItem('admin_api_token', data.token);
                    apiTokenRef.current = data.token;
                    setApiToken(data.token);
                    setTokenLoaded(true);
                    return data.token;
                }

                localStorage.removeItem('admin_api_token');
                apiTokenRef.current = null;
                setApiToken(null);
                setTokenLoaded(true);
                return null;
            } catch (error) {
                console.error('Error getting API token:', error);
                localStorage.removeItem('admin_api_token');
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

    useEffect(() => {
        retrieveApiToken();
    }, []);

    // Helper function to make API requests with token auth and retry on 401
    // Diri mag-fetch gamit ang API token.
    const fetchWithToken = async (url, options = {}) => {
        const headers = {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        };

        const token = options._token ?? apiTokenRef.current;
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


    // Diri ablihan ang modal sa pag-add og walk-in.
    const openAddModal = () => {
        const now = new Date();
        // Format local date as YYYY-MM-DD (not UTC)
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        const time = now.toTimeString().slice(0, 5);
        
        setFormData(prev => ({
            ...prev,
            client_id: '',
            pet_ids: [],
            service_id: '',
            service_ids: [],
            pet_services: {},
            booking_date: today,
            booking_time: time,
            administered_by: '',
            notes: '',
            is_bitten: false,
            bite_details: '',
        }));
        setPets([]);
        setSelectedSymptoms([]);
        setAvailableTimeSlots([]);
        setClientSearchQuery('');
        clientSearchQueryRef.current = '';
        setMatchedAnimals([]);
        setFilteredClients([]);
        setWalkInStep(1);
        setWalkInPreviewPetId('');
        setWalkInServicePetId('');
        resetTreatmentForm();
        fetchTreatmentInventory();
        setShowAddModal(true);
        
        // Fetch time slots for today
        fetchAvailableTimeSlots(today);
    };
    const [clients, setClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [matchedAnimals, setMatchedAnimals] = useState([]);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [walkInStep, setWalkInStep] = useState(1);
    const clientSearchInputRef = useRef(null);
    const allClientsCacheRef = useRef([]);
    const clientSearchDebounceRef = useRef(null);
    const clientSearchAbortRef = useRef(null);
    const clientSearchSeqRef = useRef(0);
    const clientSearchQueryRef = useRef('');
    const [pets, setPets] = useState([]);
    const [loadingPets, setLoadingPets] = useState(false);
    const [clientSearchPending, setClientSearchPending] = useState(false);
    const [availableServices, setAvailableServices] = useState([]);

    const eligiblePets = pets.filter((pet) => {
        return pet.registration_status === 'registered' || pet.registration_status === 'exempt';
    });
    const [formData, setFormData] = useState({
        client_id: '',
        pet_ids: [],
        service_id: '',
        service_ids: [],
        pet_services: {},
        booking_date: '',
        booking_time: '',
        administered_by: '',
        notes: '',
        is_bitten: false,
        bite_details: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [loadingClients, setLoadingClients] = useState(false);
    const [symptoms, setSymptoms] = useState([]);
    const [selectedSymptoms, setSelectedSymptoms] = useState([]);
    const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
    const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all | processing | ongoing | completed
    const [walkInSuccess, setWalkInSuccess] = useState(null);
    const [successModal, setSuccessModal] = useState({ open: false, title: '', message: '' });
    const [treatmentInventory, setTreatmentInventory] = useState([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [petMedicineById, setPetMedicineById] = useState({});
    const [medicinePetId, setMedicinePetId] = useState('');
    const [treatmentPetWeights, setTreatmentPetWeights] = useState({});
    const [administeredBy, setAdministeredBy] = useState(DEFAULT_ADMINISTERED_BY);
    const [assignedFieldmanId, setAssignedFieldmanId] = useState(null);
    const [selectedInventoryCategory, setSelectedInventoryCategory] = useState('');
    const [treatmentErrors, setTreatmentErrors] = useState({});
    const [photoPreview, setPhotoPreview] = useState({ open: false, url: '', label: '' });
    const [walkInPetMedicalById, setWalkInPetMedicalById] = useState({});
    const [walkInPetMedicalLoading, setWalkInPetMedicalLoading] = useState(false);
    const [walkInPreviewPetId, setWalkInPreviewPetId] = useState('');
    const [walkInServicePetId, setWalkInServicePetId] = useState('');
    const [viewPetMedical, setViewPetMedical] = useState(null);
    const [viewPetMedicalLoading, setViewPetMedicalLoading] = useState(false);
    const [viewModalPetId, setViewModalPetId] = useState('');

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

    const inventoryServiceNames = useMemo(() => {
        if (showAddModal && formData.pet_ids.length > 0) {
            const petId = medicinePetId || formData.pet_ids[0];
            return serviceNamesForIds(getPetServiceIds(formData.pet_services, petId), availableServices);
        }

        if (selectedAppointment?.service_names?.length) {
            return selectedAppointment.service_names;
        }

        if (selectedAppointment?.services?.length) {
            return selectedAppointment.services;
        }

        return [];
    }, [showAddModal, formData.pet_ids, formData.pet_services, medicinePetId, availableServices, selectedAppointment]);

    const groupedInventory = useMemo(() => {
        const inStock = filterUsableInventory(treatmentInventory);

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

    useEffect(() => {
        setSelectedInventoryCategory((current) => {
            if (inventoryCategories.length === 1) {
                return inventoryCategories[0];
            }
            if (inventoryCategories.length >= 2) {
                return inventoryCategories.includes(current) ? current : '';
            }
            return '';
        });
    }, [inventoryCategories]);

    useEffect(() => {
        const ids = formData.pet_ids.map((id) => normalizePetId(id));
        setMedicinePetId((current) => (current && ids.includes(current) ? current : (ids[0] || '')));
        setPetMedicineById((prev) => {
            const next = {};
            ids.forEach((id) => {
                next[id] = prev[id] || emptyWalkInPetMedicine();
            });
            return next;
        });
    }, [formData.pet_ids]);

    // Diri i-reset ang treatment form.
    const resetTreatmentForm = () => {
        setTreatmentInventory([]);
        setPetMedicineById({});
        setMedicinePetId('');
        setTreatmentPetWeights({});
        setAdministeredBy(DEFAULT_ADMINISTERED_BY);
        setAssignedFieldmanId(null);
        setSelectedInventoryCategory('');
        setInventoryLoading(false);
        setTreatmentErrors({});
    };

    // Diri i-update ang tambal sa usa ka hayop.
    const patchPetMedicine = (petId, updater) => {
        const key = normalizePetId(petId);
        if (!key) return;
        setPetMedicineById((prev) => {
            const current = prev[key] || emptyWalkInPetMedicine();
            const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
            return { ...prev, [key]: next };
        });
    };

    // Diri sirado ang modal sa appointment.
    const closeAppointmentModal = () => {
        setSelectedAppointment(null);
        resetTreatmentForm();
        closePhotoPreview();
    };

    const fetchServices = useCallback(async ({ forceLoading = false } = {}) => {
        const cacheKey = getServicesCacheKey(fromDate, tillDate);
        const cached = !forceLoading ? readAdminListCacheEntry(cacheKey) : null;

        if (cached) {
            setServices(cached.data ?? []);
            setLoading(false);
            setRefreshing(false);
        } else if (!forceLoading) {
            setLoading(true);
        } else {
            setLoading(true);
        }

        setRefreshing(false);

        try {
            const params = new URLSearchParams();
            const startDate = fromDate && tillDate && fromDate > tillDate ? tillDate : fromDate;
            const endDate = fromDate && tillDate && fromDate > tillDate ? fromDate : tillDate;
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const url = params.toString()
                ? `/api/admin/services/completed-appointments?${params.toString()}`
                : '/api/admin/services/completed-appointments';
            const response = await axios.get(url);

            if (response.data.success) {
                const nextServices = response.data.services || [];
                setServices(nextServices);
                writeAdminListCache(cacheKey, nextServices);
            } else {
                console.error('Failed to fetch services:', response.data.error);
                if (!readAdminListCacheEntry(cacheKey)) {
                    setServices([]);
                }
            }
        } catch (error) {
            console.error('Error fetching services:', error);
            if (!readAdminListCacheEntry(cacheKey)) {
                setServices([]);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fromDate, tillDate]);

    useEffect(() => {
        fetchServices();
    }, [fetchServices]);

    // Live-refresh when fieldman (or admin) marks a walk-in ongoing / updates it.
    useEffect(() => {
        const unsubscribe = subscribeToAppointments((event) => {
            const appointment = event?.appointment;
            if (!appointment?.id) return;
            if (appointment.booking_type && appointment.booking_type !== 'walk_in') return;

            clearAdminListCache(getServicesCacheKey(fromDate, tillDate));
            fetchServices({ forceLoading: true });
        });

        return unsubscribe;
    }, [fetchServices, fromDate, tillDate]);

    useEffect(() => {
        if (!showAddModal || !tokenLoaded || !apiToken) {
            return;
        }

        fetchClients();
        fetchAvailableServices();
        fetchSymptoms();
    }, [showAddModal, tokenLoaded, apiToken]);

    useEffect(() => {
        if (showAddModal && formData.booking_date && formData.service_ids.length > 0) {
            fetchAvailableTimeSlots(formData.booking_date, formData.service_ids);
        }
    }, [formData.service_ids, formData.booking_date, showAddModal, availableServices]);

    useEffect(() => {
        if (!showAddModal || formData.pet_ids.length === 0) {
            setWalkInPetMedicalById({});
            setWalkInPetMedicalLoading(false);
            setWalkInPreviewPetId('');
            setWalkInServicePetId('');
            return;
        }

        if (!formData.pet_ids.includes(walkInPreviewPetId)) {
            setWalkInPreviewPetId(formData.pet_ids[0]);
        }
        if (!formData.pet_ids.includes(walkInServicePetId)) {
            setWalkInServicePetId(formData.pet_ids[0]);
        }

        let cancelled = false;
        setWalkInPetMedicalLoading(true);
        Promise.all(formData.pet_ids.map((petId) => (
            axios.get(`/api/admin/animals/${petId}/medical-summary`)
                .then((res) => [petId, res.data])
                .catch((error) => {
                    console.error('Error fetching pet medical summary:', error);
                    return [petId, null];
                })
        )))
            .then((results) => {
                if (cancelled) return;
                const next = {};
                results.forEach(([petId, data]) => {
                    if (data?.success) next[petId] = data;
                });
                setWalkInPetMedicalById(next);
            })
            .finally(() => {
                if (!cancelled) setWalkInPetMedicalLoading(false);
            });
        return () => { cancelled = true; };
    }, [showAddModal, formData.pet_ids.join(',')]);

    // Auto-fill walk-in weight from each selected pet's saved weight.
    // Does not overwrite a weight the admin has already typed for that pet.
    useEffect(() => {
        if (!showAddModal || formData.pet_ids.length === 0) {
            if (formData.pet_ids.length === 0) setTreatmentPetWeights({});
            return;
        }

        setTreatmentPetWeights((prev) => {
            const next = {};
            formData.pet_ids.forEach((petId) => {
                const key = normalizePetId(petId);
                if (Object.prototype.hasOwnProperty.call(prev, key)) {
                    next[key] = prev[key];
                    return;
                }
                const selectedPet = pets.find((p) => normalizePetId(p.id) === key);
                if (!selectedPet) return;
                next[key] = getWeightFromPet(selectedPet);
            });
            return next;
        });
    }, [showAddModal, formData.pet_ids.join(','), pets]);

    useEffect(() => {
        if (!selectedAppointment) {
            setViewModalPetId('');
            return;
        }
        const bookedPets = getAppointmentPets(selectedAppointment);
        setViewModalPetId(normalizePetId(bookedPets[0]?.id || selectedAppointment.animal_id || ''));
    }, [selectedAppointment?.id]);

    useEffect(() => {
        const animalId = viewModalPetId || selectedAppointment?.animal?.id || selectedAppointment?.animal_id;
        if (!animalId) {
            setViewPetMedical(null);
            setViewPetMedicalLoading(false);
            return;
        }
        let cancelled = false;
        setViewPetMedicalLoading(true);
        axios.get(`/api/admin/animals/${animalId}/medical-summary`)
            .then((res) => {
                if (!cancelled && res.data?.success) setViewPetMedical(res.data);
            })
            .catch((error) => console.error('Error fetching pet medical summary:', error))
            .finally(() => {
                if (!cancelled) setViewPetMedicalLoading(false);
            });
        return () => { cancelled = true; };
    }, [viewModalPetId, selectedAppointment?.id]);

    // Setup axios with token for form submissions
    useEffect(() => {
        if (apiToken) {
            apiTokenRef.current = apiToken;
            axios.defaults.headers.common['Authorization'] = `Bearer ${apiToken}`;
        }
    }, [apiToken]);

    useEffect(() => {
        return () => {
            if (clientSearchDebounceRef.current) {
                clearTimeout(clientSearchDebounceRef.current);
            }
            if (clientSearchAbortRef.current) {
                clientSearchAbortRef.current.abort();
            }
        };
    }, []);

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
        } finally {
            setInventoryLoading(false);
        }
    };

    // Diri i-toggle ang pagpili sa inventory item.
    const toggleInventoryItem = (item) => {
        const petId = medicinePetId || formData.pet_ids[0];
        patchPetMedicine(petId, (draft) => {
            const isSelected = draft.selectedInventoryItems.some((entry) => entry.id === item.id);
            return {
                ...draft,
                selectedInventoryItems: isSelected
                    ? draft.selectedInventoryItems.filter((entry) => entry.id !== item.id)
                    : [...draft.selectedInventoryItems, { ...item, quantity: 1 }],
            };
        });
        if (treatmentErrors.selectedItems) {
            setTreatmentErrors((prev) => ({ ...prev, selectedItems: undefined }));
        }
    };

    // Diri i-update ang quantity sa napiling item.
    const updateInventoryItemQuantity = (itemId, quantity) => {
        const petId = medicinePetId || formData.pet_ids[0];
        patchPetMedicine(petId, (draft) => ({
            ...draft,
            selectedInventoryItems: draft.selectedInventoryItems.map((item) =>
                item.id === itemId ? { ...item, quantity: parseInt(quantity, 10) || 1 } : item
            ),
        }));
    };

    // Diri kuhaon ang mga available nga oras sa petsa.
    const fetchAvailableTimeSlots = async (date, serviceIds = formData.service_ids) => {
        if (!date) {
            setAvailableTimeSlots([]);
            return;
        }
        
        setLoadingTimeSlots(true);
        try {
            const duration = getSelectedServicesDuration(serviceIds, availableServices);
            const response = await fetchWithToken(
                `/api/mobile/available-time-slots?date=${date}&duration_minutes=${duration}`
            );
            const data = await response.json();
            
            if (data.success) {
                const slots = (data.slots || []).filter((slot) =>
                    Number(String(slot.time || '').split(':')[1] || 0) === 0
                );
                setAvailableTimeSlots(slots);
            } else {
                console.error('Failed to fetch time slots:', data.error);
                setAvailableTimeSlots([]);
            }
        } catch (error) {
            console.error('Error fetching time slots:', error);
            setAvailableTimeSlots([]);
        } finally {
            setLoadingTimeSlots(false);
        }
    };

    // Diri kuhaon ang listahan sa mga sintomas.
    const fetchSymptoms = async () => {
        try {
            const response = await fetchWithToken('/api/mobile/symptoms');
            const data = await response.json();
            if (data.success) {
                setSymptoms(data.symptoms || []);
            }
        } catch (error) {
            console.error('Error fetching symptoms:', error);
        }
    };

    // Diri i-check kung treatment ang napiling service.
    const isTreatmentService = () => {
        if (!formData.service_ids || formData.service_ids.length === 0) {
            return false;
        }
        return formData.service_ids.some((id) => {
            const service = availableServices.find(s => s.id === parseInt(id));
            return service?.type_name === 'Treatment';
        });
    };

    // Diri i-toggle ang service sa hayop.
    const toggleServiceSelection = (serviceId, petId) => {
        const normalizedId = normalizeServiceId(serviceId);
        if (normalizedId === null) return;

        const targetPetId = normalizePetId(petId || walkInServicePetId || formData.pet_ids[0]);
        if (!targetPetId) return;

        const service = availableServices.find((s) => normalizeServiceId(s.id) === normalizedId);
        const isSelected = getPetServiceIds(formData.pet_services, targetPetId).includes(normalizedId);
        if (service?.is_available === false && !isSelected) {
            return;
        }

        setFormData((prev) => {
            const current = getPetServiceIds(prev.pet_services, targetPetId);
            const nextForPet = current.includes(normalizedId)
                ? current.filter((id) => id !== normalizedId)
                : [...current, normalizedId];
            const pet_services = { ...(prev.pet_services || {}), [targetPetId]: nextForPet };
            const service_ids = uniqueServiceIdsFromPetServices(pet_services, prev.pet_ids);
            const previousIds = (prev.service_ids || []).map(normalizeServiceId).filter((id) => id !== null);
            const servicesChanged = service_ids.join(',') !== previousIds.join(',');
            return {
                ...prev,
                pet_services,
                service_ids,
                service_id: service_ids.length > 0 ? service_ids[0] : '',
                booking_time: servicesChanged ? '' : prev.booking_time,
            };
        });
        patchPetMedicine(targetPetId, emptyWalkInPetMedicine());
    };

    // Diri i-apply ang services sa tanang hayop.
    const applyServicesToAllPets = () => {
        const sourceId = walkInServicePetId || formData.pet_ids[0];
        const sourceServices = getPetServiceIds(formData.pet_services, sourceId);
        if (!sourceId || sourceServices.length === 0) return;

        setFormData((prev) => {
            const pet_services = { ...(prev.pet_services || {}) };
            prev.pet_ids.forEach((id) => {
                pet_services[normalizePetId(id)] = [...sourceServices];
            });
            const service_ids = uniqueServiceIdsFromPetServices(pet_services, prev.pet_ids);
            return {
                ...prev,
                pet_services,
                service_ids,
                service_id: service_ids.length > 0 ? service_ids[0] : '',
            };
        });
        setPetMedicineById((prev) => {
            const next = { ...prev };
            formData.pet_ids.forEach((id) => {
                next[normalizePetId(id)] = emptyWalkInPetMedicine();
            });
            return next;
        });
    };

    // Diri i-toggle ang pagpili sa sintomas.
    const toggleSymptom = (symptom) => {
        setSelectedSymptoms(prev => {
            const symptomId = String(symptom.id);
            const exists = prev.find(s => String(s.id) === symptomId);
            if (exists) {
                return prev.filter(s => String(s.id) !== symptomId);
            }
            return [...prev, { ...symptom, days_count: '' }];
        });
    };

    // Diri i-update ang detalye sa sintomas.
    const updateSymptomDetails = (symptomId, field, value) => {
        setSelectedSymptoms(prev => prev.map(s => 
            String(s.id) === String(symptomId) ? { ...s, [field]: value } : s
        ));
    };

    // Diri hinumdoman ang napiling client.
    const rememberClient = (client) => {
        if (!client?.id) return;
        setClients((prev) => (prev.some((entry) => entry.id === client.id) ? prev : [...prev, client]));
        if (!allClientsCacheRef.current.some((entry) => entry.id === client.id)) {
            allClientsCacheRef.current = [...allClientsCacheRef.current, client];
        }
    };

    // Diri pangitaon ang mga client.
    const fetchClients = async (search = '') => {
        const query = search.trim();
        const seq = ++clientSearchSeqRef.current;

        if (clientSearchAbortRef.current) {
            clientSearchAbortRef.current.abort();
        }
        const controller = new AbortController();
        clientSearchAbortRef.current = controller;

        const sourceList = allClientsCacheRef.current.length > 0
            ? allClientsCacheRef.current
            : clients;
        const hasLocalResults = query !== '' && filterClientsLocally(query, sourceList).length > 0;

        if (hasLocalResults) {
            setClientSearchPending(true);
        } else {
            setLoadingClients(true);
        }

        try {
            const url = query ? `/api/clients?search=${encodeURIComponent(query)}` : '/api/clients';
            const response = await fetchWithToken(url, { signal: controller.signal });
            const data = await response.json();
            if (seq !== clientSearchSeqRef.current) return;

            if (data.success) {
                const nextClients = data.clients || [];
                if (!query) {
                    setClients(nextClients);
                    allClientsCacheRef.current = nextClients;
                    const typed = clientSearchQueryRef.current.trim();
                    if (typed) {
                        setFilteredClients(filterClientsLocally(typed, nextClients));
                    } else {
                        setFilteredClients([]);
                        setMatchedAnimals([]);
                    }
                } else if (clientSearchQueryRef.current.trim() === query) {
                    setClients((prev) => {
                        const merged = new Map(prev.map((client) => [client.id, client]));
                        nextClients.forEach((client) => merged.set(client.id, client));
                        return Array.from(merged.values());
                    });
                    const cache = new Map(allClientsCacheRef.current.map((client) => [client.id, client]));
                    nextClients.forEach((client) => cache.set(client.id, client));
                    allClientsCacheRef.current = Array.from(cache.values());
                    setFilteredClients(nextClients);
                    setMatchedAnimals(data.matched_animals || []);
                }
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Error fetching clients:', error);
        } finally {
            if (seq === clientSearchSeqRef.current) {
                setLoadingClients(false);
                setClientSearchPending(false);
            }
        }
    };

    // Diri kuhaon ang mga hayop sa client.
    const fetchClientPets = async (clientId) => {
        setLoadingPets(true);
        setPets([]);
        try {
            const response = await fetchWithToken(`/api/clients/${clientId}/animals`);
            const data = await response.json();
            if (data.success) {
                setPets(data.animals || []);
            }
        } catch (error) {
            console.error('Error fetching pets:', error);
        } finally {
            setLoadingPets(false);
        }
    };

    // Diri kuhaon ang mga available nga service.
    const fetchAvailableServices = async () => {
        try {
            const response = await fetchWithToken('/api/services');
            const data = await response.json();
            if (data.success) {
                setAvailableServices(data.services || []);
            }
        } catch (error) {
            console.error('Error fetching services:', error);
        }
    };

    // Diri i-handle ang pag-ilis sa client.
    const handleClientChange = (clientId, clientRecord = null) => {
        setFormData(prev => ({ ...prev, client_id: clientId, pet_ids: [], pet_services: {}, service_ids: [], service_id: '' }));
        setTreatmentPetWeights({});
        setWalkInPreviewPetId('');
        setWalkInServicePetId('');
        if (clientId) {
            const selectedClient = clientRecord
                || clients.find((client) => client.id === clientId)
                || allClientsCacheRef.current.find((client) => client.id === clientId);
            if (selectedClient) {
                rememberClient(selectedClient);
                setClientSearchQuery(getOwnerDisplayName(selectedClient));
                clientSearchQueryRef.current = getOwnerDisplayName(selectedClient);
            }
            fetchClientPets(clientId);
        } else {
            setPets([]);
            setLoadingPets(false);
        }
    };

    // Diri pangitaon ang client sa local nga listahan.
    const filterClientsLocally = (query, sourceList = []) => {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return [];

        const digits = trimmed.replace(/\D/g, '');
        const matches = [];

        for (let index = 0; index < sourceList.length; index += 1) {
            const client = sourceList[index];
            const displayName = getOwnerDisplayName(client).toLowerCase();
            const phone = (client.phone_number || '').toLowerCase();
            const phoneDigits = phone.replace(/\D/g, '');
            const barangay = getBarangayName(client.barangay)?.toLowerCase() || '';

            if (
                displayName.includes(trimmed)
                || client.firstname?.toLowerCase().includes(trimmed)
                || client.lastname?.toLowerCase().includes(trimmed)
                || client.middlename?.toLowerCase().includes(trimmed)
                || client.email?.toLowerCase().includes(trimmed)
                || phone.includes(trimmed)
                || (digits.length >= 3 && phoneDigits.includes(digits))
                || barangay.includes(trimmed)
            ) {
                matches.push(client);
                if (matches.length === 25) break;
            }
        }

        return matches;
    };

    // Diri padaganon ang search sa client.
    const runClientSearch = async (query = clientSearchQuery) => {
        const trimmed = query.trim();

        if (!trimmed) {
            setMatchedAnimals([]);
            return;
        }

        await fetchClients(trimmed);
    };

    // Diri i-handle ang pag-type sa search sa client.
    const handleClientSearch = (query) => {
        setClientSearchQuery(query);
        clientSearchQueryRef.current = query;

        if (formData.client_id) {
            setFormData((prev) => ({ ...prev, client_id: '', pet_ids: [], pet_services: {}, service_ids: [], service_id: '' }));
            setPets([]);
            setLoadingPets(false);
            setTreatmentPetWeights({});
            setWalkInPreviewPetId('');
            setWalkInServicePetId('');
        }

        if (clientSearchDebounceRef.current) {
            clearTimeout(clientSearchDebounceRef.current);
            clientSearchDebounceRef.current = null;
        }

        const trimmed = query.trim();

        if (!trimmed) {
            setFilteredClients([]);
            setMatchedAnimals([]);
            setClientSearchPending(false);
            return;
        }

        const sourceList = allClientsCacheRef.current.length > 0
            ? allClientsCacheRef.current
            : clients;

        setFilteredClients(filterClientsLocally(query, sourceList));
        setMatchedAnimals([]);

        if (trimmed.length < 2) {
            return;
        }

        clientSearchDebounceRef.current = setTimeout(() => {
            fetchClients(trimmed);
        }, 120);
    };

    // Diri i-search dayon kung mo-Enter.
    const handleClientSearchKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            runClientSearch(event.currentTarget.value);
        }
    };

    // Diri pilion ang hayop ug ang tag-iya niini.
    const selectMatchedAnimal = async (animal) => {
        if (!animal?.owner?.id) return;

        rememberClient(animal.owner);
        const petId = ['registered', 'exempt'].includes(animal.registration_status)
            ? normalizePetId(animal.id)
            : '';
        const ownerName = animal.owner.name || getOwnerDisplayName(animal.owner);
        setFormData((prev) => ({
            ...prev,
            client_id: animal.owner.id,
            pet_ids: petId ? [petId] : [],
            pet_services: petId ? { [petId]: [] } : {},
            service_ids: [],
            service_id: '',
        }));
        setWalkInPreviewPetId(petId);
        setWalkInServicePetId(petId);
        setClientSearchQuery(ownerName);
        clientSearchQueryRef.current = ownerName;
        await fetchClientPets(animal.owner.id);
    };

    // Diri i-clear ang napiling client.
    const clearSelectedClient = () => {
        setFormData((prev) => ({
            ...prev,
            client_id: '',
            pet_ids: [],
            pet_services: {},
            service_ids: [],
            service_id: '',
        }));
        setPets([]);
        setLoadingPets(false);
        setTreatmentPetWeights({});
        setWalkInPreviewPetId('');
        setWalkInServicePetId('');
        setClientSearchQuery('');
        clientSearchQueryRef.current = '';
        setFilteredClients([]);
        setMatchedAnimals([]);
        requestAnimationFrame(() => clientSearchInputRef.current?.focus());
    };

    // Diri i-toggle ang pagpili sa hayop sa walk-in.
    const toggleWalkInPet = (petId) => {
        const id = normalizePetId(petId);
        setFormData((prev) => {
            const exists = prev.pet_ids.includes(id);
            const pet_ids = exists
                ? prev.pet_ids.filter((value) => value !== id)
                : [...prev.pet_ids, id];
            const pet_services = { ...(prev.pet_services || {}) };
            if (exists) {
                delete pet_services[id];
            } else if (!Array.isArray(pet_services[id])) {
                pet_services[id] = [];
            }
            const service_ids = uniqueServiceIdsFromPetServices(pet_services, pet_ids);
            return {
                ...prev,
                pet_ids,
                pet_services,
                service_ids,
                service_id: service_ids.length > 0 ? service_ids[0] : '',
            };
        });
    };

    // Diri pilion o tangtangon tanang hayop sa walk-in.
    const toggleAllWalkInPets = () => {
        const allIds = eligiblePets.map((pet) => normalizePetId(pet.id));
        setFormData((prev) => {
            const allSelected = allIds.length > 0 && allIds.every((id) => prev.pet_ids.includes(id));
            if (allSelected) {
                return {
                    ...prev,
                    pet_ids: [],
                    pet_services: {},
                    service_ids: [],
                    service_id: '',
                };
            }
            const pet_services = { ...(prev.pet_services || {}) };
            allIds.forEach((id) => {
                if (!Array.isArray(pet_services[id])) pet_services[id] = [];
            });
            const service_ids = uniqueServiceIdsFromPetServices(pet_services, allIds);
            return {
                ...prev,
                pet_ids: allIds,
                pet_services,
                service_ids,
                service_id: service_ids.length > 0 ? service_ids[0] : '',
            };
        });
    };

    // Diri i-update ang timbang sa hayop sa walk-in.
    const updateWalkInPetWeight = (petId, newWeight) => {
        const key = normalizePetId(petId);
        setTreatmentPetWeights((prev) => ({ ...prev, [key]: newWeight }));
        setPets((prev) => prev.map((pet) => (
            normalizePetId(pet.id) === key
                ? { ...pet, weight: newWeight === '' ? null : newWeight }
                : pet
        )));
        if (treatmentErrors.treatmentPetWeight) {
            setTreatmentErrors((prev) => ({ ...prev, treatmentPetWeight: undefined }));
        }
    };

    // Diri pilion ang client.
    const selectClient = (client) => {
        if (!client?.id) return;
        handleClientChange(client.id, client);
    };

    // Diri i-handle ang pag-ilis sa petsa.
    const handleDateChange = (date) => {
        setFormData(prev => ({ ...prev, booking_date: date, booking_time: '' }));
        fetchAvailableTimeSlots(date);
    };

    // Diri pilion ang oras sa booking.
    const handleTimeSlotSelect = (time) => {
        setFormData(prev => ({ ...prev, booking_time: time }));
    };

    // Diri i-submit ang walk-in nga booking.
    const handleSubmitWalkIn = async () => {
        if (!formData.booking_date || !formData.booking_time) {
            return;
        }

        const petsHaveServices = formData.pet_ids.length > 0
            && formData.pet_ids.every((petId) => getPetServiceIds(formData.pet_services, petId).length > 0);

        if (!(formData.pet_ids.length > 0 && (petsHaveServices || formData.is_bitten))) {
            return;
        }

        const selectedWalkInPets = formData.pet_ids
            .map((id) => eligiblePets.find((pet) => normalizePetId(pet.id) === normalizePetId(id)))
            .filter(Boolean);

        if (selectedWalkInPets.length === 0) {
            return;
        }

        const assignToFieldman = Boolean(assignedFieldmanId);
        if (!assignToFieldman) {
            for (const pet of selectedWalkInPets) {
                const draft = petMedicineById[normalizePetId(pet.id)] || emptyWalkInPetMedicine();
                const treatmentValidation = validateTreatmentForm({
                    administeredBy,
                    assignedFieldmanId,
                    treatmentPetWeights,
                    selectedInventoryItems: draft.selectedInventoryItems,
                    treatmentInventory,
                    selectedPets: [pet],
                    outsidePurchaseItems: draft.outsidePurchaseItems,
                });
                if (Object.keys(treatmentValidation).length > 0) {
                    setMedicinePetId(normalizePetId(pet.id));
                    setTreatmentErrors(treatmentValidation);
                    return;
                }
            }

            const stockUsage = {};
            selectedWalkInPets.forEach((pet) => {
                const draft = petMedicineById[normalizePetId(pet.id)] || emptyWalkInPetMedicine();
                draft.selectedInventoryItems.forEach((item) => {
                    if (item.is_vial) return;
                    const medicineId = item.medicine_id ?? item.medicine?.id;
                    if (!medicineId) return;
                    stockUsage[medicineId] = (stockUsage[medicineId] || 0) + Number(item.quantity || 0);
                });
            });
            for (const [medicineId, qty] of Object.entries(stockUsage)) {
                const maxQty = getMedicineStockTotal(Number(medicineId), treatmentInventory);
                if (!Number.isNaN(maxQty) && qty > maxQty) {
                    const sample = selectedWalkInPets
                        .flatMap((pet) => (petMedicineById[normalizePetId(pet.id)] || emptyWalkInPetMedicine()).selectedInventoryItems)
                        .find((item) => (item.medicine_id ?? item.medicine?.id) === Number(medicineId));
                    setTreatmentErrors({
                        selectedItems: `Combined quantity for ${sample?.medicine?.name || 'an item'} exceeds available stock (${formatDisplayNumber(maxQty)}).`,
                    });
                    return;
                }
            }
        }
        setTreatmentErrors({});

        setSubmitting(true);

        const symptomsArray = [...selectedSymptoms];

        const biteService = availableServices.find((service) => {
            const name = service.type_name?.toLowerCase() || '';
            return name.includes('treatment') || name.includes('consultation');
        });
        const petServicesPayload = selectedWalkInPets.map((pet) => {
            let ids = getPetServiceIds(formData.pet_services, pet.id);
            if (ids.length === 0 && formData.is_bitten && biteService) {
                ids = [normalizeServiceId(biteService.id)].filter((id) => id !== null);
            }
            return { pet_id: pet.id, service_ids: ids };
        });
        const finalServiceIds = uniqueServiceIdsFromPetServices(
            Object.fromEntries(petServicesPayload.map((entry) => [normalizePetId(entry.pet_id), entry.service_ids])),
            selectedWalkInPets.map((pet) => normalizePetId(pet.id))
        );

        if (finalServiceIds.length === 0) {
            setSubmitting(false);
            return;
        }

        const payload = {
            client_id: formData.client_id,
            animal_id: selectedWalkInPets[0]?.id || null,
            animal_ids: selectedWalkInPets.map((pet) => pet.id),
            pet_services: petServicesPayload,
            service_ids: finalServiceIds,
            service_id: finalServiceIds.length > 0 ? finalServiceIds[0] : null,
            booking_date: formData.booking_date,
            booking_time: formData.booking_time,
            administered_by: administeredBy.trim(),
            assigned_fieldman_id: assignedFieldmanId,
            notes: formData.notes || '',
            symptoms: symptomsArray.length > 0 ? symptomsArray : undefined,
            is_bitten: formData.is_bitten,
            bite_details: formData.bite_details || '',
        };

        try {
            const response = await axios.post('/admin/walk-in-appointment', payload);

            if (response.data.success) {
                const savedClient = clients.find((client) => client.id === formData.client_id)
                    || allClientsCacheRef.current.find((client) => client.id === formData.client_id);
                const clientName = savedClient ? getOwnerDisplayName(savedClient) : 'client';
                const petName = formatPetsLabel(selectedWalkInPets);

                const newAppointmentId = response.data.appointment?.id;
                if (newAppointmentId && !assignToFieldman) {
                    const treatments = selectedWalkInPets.map((pet) => {
                        const weightValue = treatmentPetWeights[normalizePetId(pet.id)] || '';
                        const draft = petMedicineById[normalizePetId(pet.id)] || emptyWalkInPetMedicine();
                        return {
                            animal_id: Number(pet.id),
                            pet_weight: weightValue ? parseFloat(weightValue) : null,
                            administered_by: administeredBy.trim(),
                            selected_items: draft.selectedInventoryItems.map((item) => ({
                                inventory_id: item.id,
                                quantity: item.is_vial
                                    ? Number(calculateVialDosage(weightValue).toFixed(2))
                                    : Number(item.quantity || 1),
                            })),
                            outside_items: completedOutsidePurchaseItems(draft.outsidePurchaseItems),
                        };
                    });
                    await axios.post(`/api/admin/appointments/${newAppointmentId}/handoff`, {
                        treatments,
                        assigned_fieldman_id: assignedFieldmanId,
                    });
                }

                setShowAddModal(false);
                setFormData({
                    client_id: '',
                    pet_ids: [],
                    service_id: '',
                    service_ids: [],
                    pet_services: {},
                    booking_date: '',
                    booking_time: '',
                    administered_by: '',
                    notes: '',
                    is_bitten: formData.is_bitten,
                    bite_details: formData.bite_details
                });
                setPets([]);
                setSelectedSymptoms([]);
                resetTreatmentForm();
                fetchServices({ forceLoading: true });
                setWalkInSuccess({
                    clientName,
                    petName,
                    bookingDate: formData.booking_date,
                    bookingTime: formData.booking_time,
                    durationMinutes: getSelectedServicesDuration(finalServiceIds, availableServices),
                    services: availableServices
                        .filter((service) => finalServiceIds.map(normalizeServiceId).includes(normalizeServiceId(service.id)))
                        .map((service) => service.type_name),
                    status: assignToFieldman ? 'processing' : 'ongoing',
                });
            } else {
                alert(response.data.error || 'Failed to add walk-in service');
            }
        } catch (error) {
            console.error('Error adding walk-in:', error);
            console.error('Error response:', error.response?.data);
            let errorMsg = 'Failed to add walk-in service';

            if (error.response?.status === 422) {
                const errors = error.response?.data?.errors;
                if (errors) {
                    const errorList = Object.entries(errors)
                        .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                        .join('\n');
                    errorMsg = `Validation failed:\n${errorList}`;
                } else {
                    errorMsg = error.response?.data?.message || 'Validation failed';
                }
            } else {
                errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || errorMsg;
            }

            alert(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    // Diri i-format ang petsa.
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return 'N/A';
        }
    };

    // Diri i-format ang oras nga AM/PM.
    const formatTime = (timeString) => {
        if (!timeString) return 'N/A';
        try {
            let timeToFormat;
            
            // Handle ISO datetime format (e.g., "2026-05-12T05:00:00.000000Z")
            if (timeString.includes('T') && timeString.includes('Z')) {
                timeToFormat = new Date(timeString);
                // If it's midnight (00:00:00), the appointment might not have a specific time set
                if (timeToFormat.getUTCHours() === 0 && timeToFormat.getUTCMinutes() === 0) {
                    return 'No time set';
                }
            } 
            // Handle time only format (e.g., "14:30:00" or "14:30")
            else {
                const timeOnly = timeString.split(':').slice(0, 2).join(':');
                timeToFormat = new Date(`2000-01-01T${timeOnly}`);
            }
            
            if (isNaN(timeToFormat.getTime())) return 'N/A';
            
            return timeToFormat.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'N/A';
        }
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

    // Diri kuhaon ang breed sa hayop.
    const getPetBreed = (appointment, pet = null) => {
        const breed = (pet || getAppointmentPets(appointment)[0] || appointment.animal)?.breed;

        // Handle breed as string (new API format) or object (legacy format)
        if (typeof breed === 'string') {
            return breed || '-';
        }
        
        if (breed && typeof breed === 'object') {
            return breed.breed_name || '-';
        }
        
        return '-';
    };

    // Diri kuhaon ang species sa hayop.
    const getPetSpecies = (appointment, pet = null) => {
        const source = pet || getAppointmentPets(appointment)[0] || appointment.animal;
        const species = source?.species;
        if (typeof species === 'string') return species;
        if (species?.species_name) return species.species_name;
        return source?.species_name || '-';
    };

    // Diri kuhaon ang info sa pinaakan sa appointment.
    const getAppointmentBiteInfo = (appointment) => {
        return {
            isBitten: appointment.is_bitten ?? false,
            biteDetails: appointment.bite_details,
            symptoms: appointment.symptoms ?? []
        };
    };

    const totalAppointments = services.reduce((sum, service) =>
        sum + (service.processing_appointments?.length || 0) +
              (service.ongoing_appointments?.length || 0) +
              (service.completed_appointments?.length || 0), 0);
    const filteredServices = selectedServiceId === 'all'
        ? services
        : services.filter((service) => normalizeServiceId(service.id) === normalizeServiceId(selectedServiceId));
    
    // Include processing walk-ins assigned to fieldmen (waiting for mobile medicine).
    // Diri i-group ang mga appointment base sa status.
    const getAppointmentsByStatus = () => {
        const appointmentMap = {};

        filteredServices.forEach((service) => {
            // Diri idugang ang appointment sa map uban ang status.
            const attach = (list, fallbackStatus) => {
                (list || []).forEach((appointment) => {
                    const key = appointment.id;
                    if (!appointmentMap[key]) {
                        appointmentMap[key] = {
                            ...appointment,
                            service_names: [],
                            status: appointment.status || fallbackStatus,
                        };
                    }
                    appointmentMap[key].service_names.push(service.type_name);
                });
            };

            attach(service.processing_appointments, 'processing');
            attach(service.ongoing_appointments, 'ongoing');
            attach(service.completed_appointments, 'completed');
        });

        return Object.values(appointmentMap).map((appointment) => ({
            ...appointment,
            status: normalizeWalkInStatus(appointment.status),
            service_names: [...new Set(appointment.service_names.filter(Boolean))],
        }));
    };
    
    const allAppointments = getAppointmentsByStatus();

    const statusCounts = {
        all: allAppointments.length,
        processing: allAppointments.filter((a) => a.status === 'processing').length,
        ongoing: allAppointments.filter((a) => a.status === 'ongoing').length,
        completed: allAppointments.filter((a) => a.status === 'completed').length,
    };

    // Diri i-check kung mo-match sa search ang appointment.
    const matchesSearch = (appointment) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        const ownerName = getOwnerDisplayName(appointment.user).toLowerCase();
        const ownerLastName = getOwnerLastName(appointment.user).toLowerCase();
        const pets = getAppointmentPets(appointment);
        return (
            ownerName.includes(q) ||
            ownerLastName.includes(q) ||
            appointment.user?.firstname?.toLowerCase().includes(q) ||
            appointment.user?.lastname?.toLowerCase().includes(q) ||
            appointment.user?.name?.toLowerCase().includes(q) ||
            appointment.user?.email?.toLowerCase().includes(q) ||
            appointment.user?.phone_number?.toLowerCase().includes(q) ||
            pets.some((pet) => (
                pet.pet_name?.toLowerCase().includes(q)
                || pet.identification_number?.toLowerCase().includes(q)
            )) ||
            appointment.administered_by?.toLowerCase().includes(q) ||
            getPetBreed(appointment).toLowerCase().includes(q) ||
            getPetSpecies(appointment).toLowerCase().includes(q) ||
            appointment.service_names?.some((name) => name.toLowerCase().includes(q))
        );
    };

    const activeStatusFilter = STATUS_FILTER_CONFIG[statusFilter] ? statusFilter : 'all';

    const displayedAppointments = sortAdminAppointmentsNewestFirst(
        allAppointments.filter((appointment) => {
            if (activeStatusFilter !== 'all' && appointment.status !== activeStatusFilter) return false;
            return matchesSearch(appointment);
        })
    );

    const hasActiveFilters =
        fromDate !== '' ||
        tillDate !== '' ||
        searchTerm.trim() !== '' ||
        statusFilter !== 'all' ||
        selectedServiceId !== 'all';

    // Diri i-clear ang mga filter.
    const clearFilters = () => {
        setFromDate('');
        setTillDate('');
        setSearchTerm('');
        setStatusFilter('all');
        setSelectedServiceId('all');
    };

    const selectedAppointmentInfo = selectedAppointment ? getAppointmentBiteInfo(selectedAppointment) : {
        isBitten: false,
        biteDetails: null,
        symptoms: []
    };

    return (
        <>
            <Head title="Services" />
            <div className="flex h-screen overflow-hidden bg-canvas">
                <Sidebar />

                <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
                    <header className="shrink-0 border-b border-line bg-white px-6 py-4 lg:px-8">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="app-kicker">Clinic</p>
                                <h1 className="text-xl font-bold tracking-tight text-navy">Services</h1>
                                <p className="text-sm text-muted">Manage walk-in appointments</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => fetchServices({ forceLoading: true })}
                                    disabled={loading || refreshing}
                                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
                                >
                                    <svg className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh
                                </button>
                                <button
                                    type="button"
                                    onClick={openAddModal}
                                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    Add Walk-in
                                </button>
                            </div>
                        </div>
                    </header>

                    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5 lg:px-8">
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
                                        value={selectedServiceId === 'all' ? 'all' : String(selectedServiceId)}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setSelectedServiceId(value === 'all' ? 'all' : normalizeServiceId(value));
                                        }}
                                        className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    >
                                        <option value="all">All services ({totalAppointments})</option>
                                        {services.map((service) => {
                                            const appointmentCount =
                                                (service.processing_appointments?.length || 0) +
                                                (service.ongoing_appointments?.length || 0) +
                                                (service.completed_appointments?.length || 0);
                                            return (
                                                <option key={service.id} value={service.id}>
                                                    {service.type_name} ({appointmentCount})
                                                </option>
                                            );
                                        })}
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
                                    onChange={setStatusFilter}
                                    items={Object.keys(STATUS_FILTER_CONFIG).map((key) => ({
                                        id: key,
                                        label: key === 'all' ? 'All' : STATUS_FILTER_CONFIG[key].label,
                                        count: statusCounts[key] || 0,
                                    }))}
                                />
                                <div className="flex shrink-0 items-center gap-3 pb-2">
                                    <span className="text-sm text-muted">
                                        <span className="font-semibold text-navy">{displayedAppointments.length}</span> results
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
                            {loading && !refreshing ? (
                                <div className="flex flex-1 flex-col items-center justify-center py-20">
                                    <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600 border-t-transparent" />
                                    <p className="text-sm font-medium text-gray-500">Loading services...</p>
                                </div>
                            ) : displayedAppointments.length === 0 ? (
                                <div className="flex flex-1 flex-col items-center justify-center py-20">
                                    <p className="mb-1 font-semibold text-gray-900">No appointments found</p>
                                    <p className="text-sm text-gray-500">
                                        {hasActiveFilters
                                            ? 'Try adjusting your filters or search term'
                                            : 'New walk-in appointments will appear here'}
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
                                <div className="min-h-0 flex-1 overflow-auto">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                                            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                                <th className="px-4 py-3 font-bold">Owner</th>
                                                <th className="px-4 py-3 font-bold">Pet</th>
                                                <th className="px-4 py-3 font-bold">Details</th>
                                                <th className="px-4 py-3 font-bold">Services</th>
                                                <th className="px-4 py-3 font-bold">Schedule</th>
                                                <th className="px-4 py-3 font-bold">Administered By</th>
                                                <th className="px-4 py-3 font-bold">Status</th>
                                                <th className="px-4 py-3 font-bold"><span className="sr-only">Actions</span></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {displayedAppointments.map((appointment) => {
                                                const ownerLastName = getOwnerLastName(appointment.user);
                                                const appointmentDuration = getAppointmentDuration(appointment);
                                                const servicesLabel = formatServicesCompact(appointment.service_names);
                                                const barangayName = getBarangayName(appointment.user?.barangay);
                                                const bookedPets = getAppointmentPets(appointment);
                                                const breedSpecies = bookedPets.length === 1
                                                    ? ([getPetBreed(appointment, bookedPets[0]), getPetSpecies(appointment, bookedPets[0])]
                                                        .filter((value) => value && value !== '—' && value !== '-')
                                                        .join(' · ') || '—')
                                                    : `${bookedPets.length} animals`;

                                                return (
                                                    <tr
                                                        key={appointment.id}
                                                        onClick={() => setSelectedAppointment(appointment)}
                                                        className="group cursor-pointer transition-colors hover:bg-violet-50/50"
                                                    >
                                                        <td className="px-4 py-3.5">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <p className="truncate font-semibold text-gray-900">
                                                                        {ownerLastName}
                                                                    </p>
                                                                    <OwnerApprovalBadge user={appointment.user} />
                                                                </div>
                                                                {barangayName && (
                                                                    <p className="mt-0.5 truncate text-xs text-gray-500">
                                                                        {barangayName}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <p className="font-semibold text-gray-900">
                                                                {formatPetsLabel(bookedPets)}
                                                            </p>
                                                            {bookedPets.length === 1 ? (
                                                                <PetIdBadge pet={bookedPets[0]} className="mt-0.5" />
                                                            ) : (
                                                                <p className="mt-0.5 text-xs text-gray-500">
                                                                    {bookedPets.map((pet) => pet.identification_number || pet.pet_name).filter(Boolean).join(' · ')}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {appointment.animal?.registration_status && bookedPets.length === 1 ? (
                                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                                        REGISTRATION_BADGE[appointment.animal.registration_status] || REGISTRATION_BADGE.unregistered
                                                                    }`}>
                                                                        {getRegistrationLabel(appointment.animal.registration_status)}
                                                                    </span>
                                                                ) : null}
                                                                <span className="text-xs text-gray-500">{breedSpecies}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            {servicesLabel ? (
                                                                <span className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-100">
                                                                    {servicesLabel}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            <p className="font-medium text-gray-900">{formatDate(appointment.appointment_date)}</p>
                                                            <p className="text-xs text-gray-500">
                                                                {formatBookingTimeRange(appointment.appointment_time, appointmentDuration)}
                                                                {' · '}
                                                                {formatDuration(appointmentDuration)}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-gray-700">
                                                            {appointment.administered_by ? (
                                                                <span className="text-sm">{appointment.administered_by}</span>
                                                            ) : (
                                                                <span className="text-xs font-medium text-gray-400">Unassigned</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                                STATUS_BADGE[normalizeWalkInStatus(appointment.status)] || STATUS_BADGE.processing
                                                            }`}>
                                                                {formatWalkInStatusLabel(appointment.status)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedAppointment(appointment)}
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100 group-hover:border-violet-300"
                                                                title="View details"
                                                                aria-label="View details"
                                                            >
                                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
            {selectedAppointment && (() => {
                const ownerName = getOwnerDisplayName(selectedAppointment.user);
                const bookedPets = getAppointmentPets(selectedAppointment);
                const petDetails = bookedPets.find((pet) => normalizePetId(pet.id) === normalizePetId(viewModalPetId))
                    || bookedPets[0]
                    || selectedAppointment.animal;
                const appointmentStatus = normalizeWalkInStatus(selectedAppointment.status);
                const actualSymptoms = selectedAppointmentInfo.symptoms.filter((s) => s.name !== 'Bite Incident');
                const hasTreatmentSymptoms =
                    actualSymptoms.length > 0 &&
                    (selectedAppointment.service_names?.some((n) => n.toLowerCase().includes('treatment')) ||
                        selectedAppointment.services?.includes?.('Treatment'));
                const selectedDuration = getAppointmentDuration(selectedAppointment);

                return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-4 backdrop-blur-sm">
                    <div className="flex h-[90vh] max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                        <div className={`shrink-0 border-b border-violet-100 px-5 py-3.5 ${MODAL_HEADER_BG}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">Service Details</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <h2 className="text-xl font-bold tracking-tight text-gray-900">
                                            {formatPetsLabel(bookedPets)}
                                        </h2>
                                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            STATUS_BADGE[appointmentStatus] || STATUS_BADGE.processing
                                        }`}>
                                            {formatWalkInStatusLabel(appointmentStatus)}
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
                                            Walk-in
                                        </span>
                                    </div>
                                    {bookedPets.length > 1 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {bookedPets.map((pet) => {
                                                const isActive = normalizePetId(pet.id) === normalizePetId(petDetails?.id);
                                                return (
                                                    <button
                                                        key={pet.id}
                                                        type="button"
                                                        onClick={() => setViewModalPetId(normalizePetId(pet.id))}
                                                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                                            isActive
                                                                ? 'bg-violet-600 text-white'
                                                                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-violet-50'
                                                        }`}
                                                    >
                                                        {pet.pet_name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                        {petDetails?.identification_number ? (
                                            <span className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
                                                {petDetails.identification_number}
                                            </span>
                                        ) : (
                                            <PetIdBadge pet={petDetails} />
                                        )}
                                        {petDetails?.registration_status && (
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                REGISTRATION_BADGE[petDetails.registration_status] || REGISTRATION_BADGE.unregistered
                                            }`}>
                                                {getRegistrationLabel(petDetails.registration_status)}
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-500">
                                            {getPetBreed(selectedAppointment, petDetails)} · {getPetSpecies(selectedAppointment, petDetails)}
                                            {petDetails?.color ? ` · ${petDetails.color}` : ''}
                                            {' · '}
                                            <span className="font-medium text-gray-700">{ownerName}</span>
                                            <OwnerApprovalBadge user={selectedAppointment.user} className="ml-1 align-middle" />
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeAppointmentModal}
                                    className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 text-gray-400 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-600"
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 px-5 py-4 scrollbar-hide">
                            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <QuickFact
                                    label="Schedule"
                                    value={formatDate(selectedAppointment.appointment_date)}
                                    sub={`${formatBookingTimeRange(selectedAppointment.appointment_time, selectedDuration)} · ${formatDuration(selectedDuration)}`}
                                />
                                <QuickFact
                                    label="Services"
                                    value={(selectedAppointment.service_names || []).join(', ') || '—'}
                                />
                                <QuickFact
                                    label="Barangay"
                                    value={getBarangayName(selectedAppointment.user?.barangay) || '—'}
                                />
                            </div>

                            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                            <div className="min-w-0 space-y-4">
                            <PetMedicalSections
                                pet={petDetails}
                                owner={selectedAppointment.user}
                                medical={viewPetMedical}
                                loading={viewPetMedicalLoading}
                                onPreview={openPhotoPreview}
                            />
                            </div>

                            <div className="min-w-0 space-y-4">
                            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                <ViewSectionHeader title="Service & Clinical" subtitle="Treatments, bite incident, and notes" />
                                <div className="mb-4">
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                        {bookedPets.length > 1 && petDetails?.pet_name
                                            ? `Services for ${petDetails.pet_name}`
                                            : 'Services'}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {(petDetails?.services?.length ? petDetails.services : (selectedAppointment.service_names || [])).length > 0 ? (
                                            (petDetails?.services?.length ? petDetails.services : selectedAppointment.service_names).map((name, idx) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-800 ring-1 ring-violet-100"
                                                >
                                                    {name}
                                                    <span className="text-xs font-medium text-violet-600">
                                                        {formatDuration(getDurationForServiceName(name))}
                                                    </span>
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-sm text-gray-500">No services recorded</span>
                                        )}
                                    </div>
                                    {bookedPets.length > 1 && (
                                        <div className="mt-3 space-y-1">
                                            {bookedPets.map((pet) => (
                                                <p key={pet.id} className="text-xs text-gray-500">
                                                    <span className="font-semibold text-gray-700">{pet.pet_name}:</span>{' '}
                                                    {(pet.services || []).length > 0 ? pet.services.join(', ') : '—'}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className={`rounded-xl border p-4 ${
                                        selectedAppointmentInfo.isBitten
                                            ? 'border-red-200 bg-red-50/70'
                                            : 'border-gray-100 bg-gray-50/70'
                                    }`}>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bite Incident</p>
                                        <p className="mt-2 text-sm font-semibold text-gray-900">
                                            {selectedAppointmentInfo.isBitten ? 'Yes — reported' : 'No'}
                                        </p>
                                        {selectedAppointmentInfo.isBitten && selectedAppointmentInfo.biteDetails && (
                                            <p className="mt-2 text-sm leading-relaxed text-gray-700">
                                                {selectedAppointmentInfo.biteDetails}
                                            </p>
                                        )}
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Administered By</p>
                                        <p className="mt-2 text-sm font-semibold text-gray-900">
                                            {selectedAppointment.administered_by
                                                || (selectedAppointment.assigned_fieldmen || [])
                                                    .map((fieldman) => fieldman?.name)
                                                    .filter(Boolean)
                                                    .join(', ')
                                                || '—'}
                                        </p>
                                    </div>
                                </div>

                                {hasTreatmentSymptoms && (
                                    <div className="mt-4">
                                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Treatment Symptoms</p>
                                        <div className="flex flex-wrap gap-2">
                                            {actualSymptoms.map((symptom, idx) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex rounded-lg border border-violet-100 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800"
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
                                    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
                                        <p className="mt-2 text-sm leading-relaxed text-gray-800">{selectedAppointment.notes}</p>
                                    </div>
                                )}
                            </section>

                            {(() => {
                                const statusHistory = (selectedAppointment.status_history || []).filter(
                                    (entry) => appointmentStatus === 'processing'
                                        || (entry.status !== 'processing' && entry.status !== 'pending')
                                );
                                if (statusHistory.length === 0) return null;
                                return (
                                    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <ViewSectionHeader
                                            title="Status History"
                                            subtitle="Who marked this service as ongoing or completed"
                                        />
                                        <AppointmentStatusHistory history={statusHistory} />
                                    </section>
                                );
                            })()}

                            {/* Medicine used */}
                            {appointmentStatus !== 'processing' && selectedAppointment.treatment_items?.length > 0 && (
                                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <ViewSectionHeader title="Medicine Used" subtitle="Inventory items recorded for this service" />
                                    <div className="space-y-2">
                                        {selectedAppointment.treatment_items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3"
                                            >
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{item.medicine_name}</p>
                                                    <p className="text-xs text-gray-500">{item.unit_name}</p>
                                                </div>
                                                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                                                    {item.quantity_used}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {(() => {
                                const outsideItems = (selectedAppointment.outside_purchase_items?.length
                                    ? selectedAppointment.outside_purchase_items
                                    : bookedPets.flatMap((pet) => pet.outside_purchase_items || [])
                                ).filter((item, index, list) => list.findIndex((entry) => (
                                    entry.name === item.name
                                    && String(entry.quantity) === String(item.quantity)
                                    && entry.status === item.status
                                )) === index);
                                if (outsideItems.length === 0) return null;
                                return (
                                <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
                                    <OutsidePurchaseSummary
                                        items={outsideItems}
                                        onPrint={() => {
                                            const uniqueItems = outsideItems;
                                            const details = buildVisitReceiptDetails(
                                                petDetails?.services?.length ? petDetails.services : (selectedAppointment.service_names || selectedAppointment.services || []),
                                                actualSymptoms,
                                            );
                                            printOutsidePurchaseReceipt({
                                                animals: bookedPets.map((pet) => ({
                                                    name: pet.pet_name || pet.name,
                                                    patientId: pet.identification_number
                                                        || (pet.registration_status === 'exempt' ? 'No ID needed' : '—'),
                                                })),
                                                ownerName,
                                                serviceType: details.serviceType,
                                                treatment: details.treatment,
                                                category: autoInventoryCategoryLabel(
                                                    petDetails?.services?.length
                                                        ? petDetails.services
                                                        : (selectedAppointment.service_names || selectedAppointment.services || [])
                                                ),
                                                items: uniqueItems,
                                                issuedAt: uniqueItems[0]?.issued_at,
                                            });
                                        }}
                                    />
                                </section>
                                );
                            })()}

                            </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 px-6 py-4">
                            {appointmentStatus === 'processing' ? (
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <div className="flex flex-1 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800">
                                        Waiting for the assigned fieldman to record medicine in the mobile app.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeAppointmentModal}
                                        className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                        Close
                                    </button>
                                </div>
                            ) : appointmentStatus === 'ongoing' ? (
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <div className="flex flex-1 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800">
                                        Waiting for budget officer to complete this treatment.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeAppointmentModal}
                                        className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                        Close
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={closeAppointmentModal}
                                    className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200"
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Add Walk-in Modal */}
            {showAddModal && (() => {
                const selectedClient = clients.find((c) => String(c.id) === String(formData.client_id));
                const selectedPets = formData.pet_ids
                    .map((id) => eligiblePets.find((p) => normalizePetId(p.id) === normalizePetId(id)))
                    .filter(Boolean);
                const previewPet = selectedPets.find((p) => normalizePetId(p.id) === walkInPreviewPetId) || selectedPets[0];
                const servicePet = selectedPets.find((p) => normalizePetId(p.id) === walkInServicePetId) || selectedPets[0];
                const activePetServiceIds = getPetServiceIds(formData.pet_services, servicePet?.id);
                const petsMissingServices = selectedPets.filter((pet) => getPetServiceIds(formData.pet_services, pet.id).length === 0);
                const allPetsSelected = eligiblePets.length > 0
                    && eligiblePets.every((pet) => formData.pet_ids.includes(normalizePetId(pet.id)));
                const medicinePet = selectedPets.find((pet) => normalizePetId(pet.id) === normalizePetId(medicinePetId)) || selectedPets[0];
                const medicineDraft = petMedicineById[normalizePetId(medicinePet?.id)] || emptyWalkInPetMedicine();
                const selectedInventoryItems = medicineDraft.selectedInventoryItems;
                const outsidePurchaseItems = (() => {
                    const filled = selectedPets
                        .map((pet) => (petMedicineById[normalizePetId(pet.id)] || emptyWalkInPetMedicine()).outsidePurchaseItems)
                        .find((lines) => lines.some((line) => String(line.name || '').trim()));
                    return filled || medicineDraft.outsidePurchaseItems;
                })();
                const medicinePetServiceNames = serviceNamesForIds(
                    getPetServiceIds(formData.pet_services, medicinePet?.id),
                    availableServices
                );
                const medicineSummaryGroups = selectedPets.map((pet) => {
                    const petId = normalizePetId(pet.id);
                    const draft = petMedicineById[petId] || emptyWalkInPetMedicine();
                    const weight = treatmentPetWeights[petId];

                    return {
                        id: petId,
                        name: pet.pet_name,
                        services: serviceNamesForIds(getPetServiceIds(formData.pet_services, pet.id), availableServices),
                        active: petId === normalizePetId(medicinePet?.id),
                        clinicItems: draft.selectedInventoryItems.map((item) => ({
                            id: item.id,
                            name: item.medicine?.name || 'Unknown item',
                            category: item.medicine?.category?.name || '',
                            quantityLabel: item.is_vial && weight
                                ? `${calculateVialDosage(weight).toFixed(2)} ml`
                                : `${formatDisplayNumber(item.quantity)} ${item.is_box ? 'items' : item.unit?.name || 'units'}`,
                        })),
                        outsideItems: draft.outsidePurchaseItems
                            .filter((line) => String(line.name || '').trim())
                            .map((line) => ({
                                id: line.id,
                                name: String(line.name).trim(),
                                quantity: line.quantity,
                                status: normalizeOutsidePurchaseStatus(line.status),
                            })),
                    };
                });
                const incompleteMedicinePet = selectedPets.find((pet) => {
                    const draft = petMedicineById[normalizePetId(pet.id)] || emptyWalkInPetMedicine();
                    const errors = validateTreatmentForm({
                        administeredBy,
                        assignedFieldmanId,
                        treatmentPetWeights,
                        selectedInventoryItems: draft.selectedInventoryItems,
                        treatmentInventory,
                        selectedPets: [pet],
                        outsidePurchaseItems: draft.outsidePurchaseItems,
                    });
                    return Object.keys(errors).length > 0;
                });
                const walkInTreatmentErrors = incompleteMedicinePet
                    ? validateTreatmentForm({
                        administeredBy,
                        assignedFieldmanId,
                        treatmentPetWeights,
                        selectedInventoryItems: (petMedicineById[normalizePetId(incompleteMedicinePet.id)] || emptyWalkInPetMedicine()).selectedInventoryItems,
                        treatmentInventory,
                        selectedPets: [incompleteMedicinePet],
                        outsidePurchaseItems: (petMedicineById[normalizePetId(incompleteMedicinePet.id)] || emptyWalkInPetMedicine()).outsidePurchaseItems,
                    })
                    : {};
                const isFieldmanAssigned = Boolean(assignedFieldmanId);
                const servicesComplete = (selectedPets.length > 0 && petsMissingServices.length === 0) || formData.is_bitten;
                const treatmentComplete = !incompleteMedicinePet;
                const step1Complete = Boolean(formData.client_id && formData.pet_ids.length > 0);
                const step2Complete = servicesComplete;
                const step3Complete = Boolean(formData.booking_date && formData.booking_time) && treatmentComplete;
                const walkInReady = step1Complete && step2Complete && step3Complete;
                const walkInSteps = [
                    { num: 1, label: 'Client & Pets' },
                    { num: 2, label: 'Services' },
                    { num: 3, label: 'Schedule' },
                ];
                const selectedWalkInDuration = getSelectedServicesDuration(formData.service_ids, availableServices);
                const visibleWalkInTimeSlots = availableTimeSlots;
                const hasWalkInBookableSlot = visibleWalkInTimeSlots.some((slot) => slot.available)
                    || Boolean(formData.booking_time);

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                        <div
                            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl"
                        >
                            {/* Modal Header */}
                            <div className={`shrink-0 border-b border-violet-100 px-6 pb-5 pt-6 ${MODAL_HEADER_BG}`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Walk-in Service</p>
                                        <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">Add Walk-in Service</h2>
                                        <p className="mt-1 text-sm text-gray-500">Record a walk-in appointment for a client and their pets</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 text-gray-400 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-600"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Progress steps */}
                                <div className="mt-5 flex items-center">
                                    {walkInSteps.map(({ num, label }, index) => (
                                        <div key={num} className={`flex items-center ${index < walkInSteps.length - 1 ? 'flex-1' : ''}`}>
                                            <div className="flex items-center gap-2.5">
                                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all ${
                                                    walkInStep >= num
                                                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                                                        : 'bg-white text-gray-400 ring-1 ring-gray-200'
                                                }`}>
                                                    {walkInStep > num ? (
                                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : num}
                                                </div>
                                                <span className={`hidden text-sm font-medium sm:inline ${walkInStep >= num ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {label}
                                                </span>
                                            </div>
                                            {index < walkInSteps.length - 1 && (
                                                <div className="mx-3 h-0.5 flex-1 rounded-full bg-violet-100 sm:mx-4">
                                                    <div className={`h-full rounded-full bg-violet-600 transition-all duration-300 ${walkInStep > num ? 'w-full' : 'w-0'}`} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
                                <div
                                    className="flex-1 space-y-4 overflow-y-auto bg-gray-50/50 p-6 scrollbar-hide"
                                >
                                    {walkInStep === 1 && (
                                    <>
                                    <WalkInFormSection
                                        step="1"
                                        title="Owner & Animals"
                                        subtitle="Pick an owner by name, then choose the animals for this visit."
                                        iconPath="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                    >
                                        <div className="space-y-4">
                                            {selectedClient ? (
                                                <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                                                    <AvatarImage
                                                        src={selectedClient.profile_photo_url}
                                                        alt={getOwnerDisplayName(selectedClient)}
                                                        fallback={getInitials(selectedClient.firstname, selectedClient.lastname)}
                                                        sizeClass="h-11 w-11"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <p className="truncate text-sm font-semibold text-gray-900">{getOwnerDisplayName(selectedClient)}</p>
                                                            <OwnerApprovalBadge user={selectedClient} />
                                                        </div>
                                                        <p className="truncate text-xs text-gray-500">
                                                            {[selectedClient.phone_number, selectedClient.email, getBarangayName(selectedClient.barangay)].filter(Boolean).join(' · ') || 'Owner selected'}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={clearSelectedClient}
                                                        className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">Owner name</label>
                                                    <div className="relative">
                                                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                        <input
                                                            ref={clientSearchInputRef}
                                                            type="text"
                                                            value={clientSearchQuery}
                                                            onChange={(e) => handleClientSearch(e.target.value)}
                                                            onKeyDown={handleClientSearchKeyDown}
                                                            placeholder="Type an owner name, phone, pet, or ID"
                                                            autoComplete="off"
                                                            autoFocus
                                                            className={`${WALKIN_FIELD_CLASS} py-3 pl-9 pr-10`}
                                                        />
                                                        {clientSearchPending && (
                                                            <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                                        )}
                                                    </div>

                                                    {clientSearchQuery.trim() === '' ? (
                                                        <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                                                            <p className="text-sm font-medium text-gray-700">Search for an owner</p>
                                                            <p className="mt-1 text-xs text-gray-500">Results appear as you type. Click a name to select that owner.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                                            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                                                    {filteredClients.length + matchedAnimals.length} match{filteredClients.length + matchedAnimals.length === 1 ? '' : 'es'}
                                                                </p>
                                                                {clientSearchPending && (
                                                                    <p className="text-[10px] font-medium text-violet-600">Updating…</p>
                                                                )}
                                                            </div>
                                                            <div className="max-h-72 overflow-y-auto">
                                                                {loadingClients && filteredClients.length === 0 && matchedAnimals.length === 0 ? (
                                                                    <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                                                        Searching owners…
                                                                    </div>
                                                                ) : filteredClients.length === 0 && matchedAnimals.length === 0 ? (
                                                                    <div className="px-4 py-6 text-center">
                                                                        <p className="text-sm font-medium text-gray-700">No owner found</p>
                                                                        <p className="mt-1 text-xs text-gray-500">Try another name, phone, pet, or ID.</p>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        {matchedAnimals.length > 0 && (
                                                                            <div className="border-b border-gray-100 px-3 py-2">
                                                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Matching pets</p>
                                                                            </div>
                                                                        )}
                                                                        {matchedAnimals.map((animal) => (
                                                                            <button
                                                                                key={`animal-${animal.id}`}
                                                                                type="button"
                                                                                onClick={() => selectMatchedAnimal(animal)}
                                                                                className="flex w-full items-center gap-3 border-b border-gray-50 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-violet-50"
                                                                            >
                                                                                <AvatarImage
                                                                                    src={animal.pet_photo_url}
                                                                                    alt={animal.pet_name || 'Pet'}
                                                                                    fallback={getInitials(animal.pet_name, '')}
                                                                                    sizeClass="h-9 w-9"
                                                                                    roundedClass="rounded-lg"
                                                                                />
                                                                                <div className="min-w-0 flex-1">
                                                                                    <p className="truncate text-sm font-semibold text-gray-900">{animal.pet_name}</p>
                                                                                    <p className="truncate text-xs text-gray-500">
                                                                                        Owner: {animal.owner?.name || getOwnerDisplayName(animal.owner)}
                                                                                    </p>
                                                                                    <PetIdBadge pet={animal} className="mt-0.5" />
                                                                                </div>
                                                                                <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
                                                                                    Select
                                                                                </span>
                                                                            </button>
                                                                        ))}
                                                                        {filteredClients.length > 0 && (
                                                                            <div className="border-b border-gray-100 px-3 py-2">
                                                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Owners</p>
                                                                            </div>
                                                                        )}
                                                                        {filteredClients.map((client) => (
                                                                            <OwnerPickRow
                                                                                key={client.id}
                                                                                client={client}
                                                                                onSelect={selectClient}
                                                                            />
                                                                        ))}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="mt-3 flex justify-end">
                                                        <a
                                                            href="/admin/barangay-animals?add=true"
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                                                        >
                                                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                            </svg>
                                                            Add animal
                                                        </a>
                                                    </div>
                                                </div>
                                            )}

                                            {formData.client_id && (
                                                <div>
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">Animals</label>
                                                        {eligiblePets.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={toggleAllWalkInPets}
                                                                className="text-xs font-semibold text-violet-700 hover:text-violet-800"
                                                            >
                                                                {allPetsSelected ? 'Clear all' : 'Select all'}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {loadingPets ? (
                                                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                                            Loading animals…
                                                        </div>
                                                    ) : eligiblePets.length === 0 ? (
                                                        pets.length > 0 ? (
                                                            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                                                                No registered or exempt animals for this owner. Register the animal first.
                                                            </p>
                                                        ) : (
                                                            <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                                                                This owner has no animals yet.
                                                            </p>
                                                        )
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                            {eligiblePets.map((pet) => {
                                                                const isSelected = formData.pet_ids.includes(normalizePetId(pet.id));
                                                                return (
                                                                    <button
                                                                        key={pet.id}
                                                                        type="button"
                                                                        onClick={() => toggleWalkInPet(pet.id)}
                                                                        className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                                                                            isSelected
                                                                                ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100 shadow-sm'
                                                                                : 'border-gray-200 bg-white hover:border-violet-300'
                                                                        }`}
                                                                    >
                                                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                                                            isSelected
                                                                                ? 'border-violet-600 bg-violet-600 text-white'
                                                                                : 'border-gray-300 bg-white'
                                                                        }`}>
                                                                            {isSelected && (
                                                                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                                </svg>
                                                                            )}
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="truncate text-sm font-semibold text-gray-900">{pet.pet_name}</p>
                                                                            <p className="truncate text-xs text-gray-500">
                                                                                {pet.identification_number ? `${pet.identification_number} · ` : ''}
                                                                                {pet.species?.species_name || 'Unknown species'}
                                                                            </p>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {formData.pet_ids.length > 0 && (
                                                        <p className="mt-2 text-xs text-gray-500">
                                                            {formData.pet_ids.length} selected. Next, choose services for each animal.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </WalkInFormSection>
                                    {selectedClient && previewPet && (
                                        <>
                                            {selectedPets.length > 1 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedPets.map((pet) => {
                                                        const isActive = normalizePetId(pet.id) === normalizePetId(previewPet.id);
                                                        return (
                                                            <button
                                                                key={pet.id}
                                                                type="button"
                                                                onClick={() => setWalkInPreviewPetId(normalizePetId(pet.id))}
                                                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                                                    isActive
                                                                        ? 'bg-violet-600 text-white'
                                                                        : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-violet-50'
                                                                }`}
                                                            >
                                                                {pet.pet_name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <PetMedicalSections
                                                pet={previewPet}
                                                owner={selectedClient}
                                                medical={walkInPetMedicalById[normalizePetId(previewPet.id)]}
                                                loading={walkInPetMedicalLoading}
                                                onPreview={openPhotoPreview}
                                            />
                                        </>
                                    )}
                                    </>
                                    )}

                                    {walkInStep === 2 && (
                                    <WalkInFormSection
                                        step="2"
                                        title="Walk-in Services"
                                        subtitle="Choose a pet, then select the services for that animal"
                                        iconPath="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                    >
                                        {selectedPets.length === 0 ? (
                                            <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                                                Select at least one animal in the previous step.
                                            </p>
                                        ) : (
                                        <>
                                        {selectedPets.length > 1 && (
                                            <div className="mb-4">
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Choose a pet</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedPets.map((pet) => {
                                                        const isActive = normalizePetId(pet.id) === normalizePetId(servicePet?.id);
                                                        const count = getPetServiceIds(formData.pet_services, pet.id).length;
                                                        return (
                                                            <button
                                                                key={pet.id}
                                                                type="button"
                                                                onClick={() => setWalkInServicePetId(normalizePetId(pet.id))}
                                                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                                    isActive
                                                                        ? 'bg-violet-600 text-white'
                                                                        : count > 0
                                                                            ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100'
                                                                            : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-violet-50'
                                                                }`}
                                                            >
                                                                {count > 0 && (
                                                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                                {pet.pet_name}
                                                                <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                                                                    isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                    {count}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-gray-900">
                                                Services for {servicePet?.pet_name || 'this pet'}
                                            </p>
                                            {selectedPets.length > 1 && activePetServiceIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={applyServicesToAllPets}
                                                    className="text-xs font-semibold text-violet-700 hover:text-violet-800"
                                                >
                                                    Apply these to all pets
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {availableServices.map((service) => {
                                                const isSelected = activePetServiceIds.includes(normalizeServiceId(service.id));
                                                const isUnavailable = service.is_available === false && !isSelected;
                                                return (
                                                    <button
                                                        key={service.id}
                                                        type="button"
                                                        onClick={() => toggleServiceSelection(service.id, servicePet?.id)}
                                                        disabled={isUnavailable}
                                                        className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                                                            isUnavailable
                                                                ? 'cursor-not-allowed border-gray-200 bg-gray-100 opacity-60'
                                                                : isSelected
                                                                ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100 shadow-sm'
                                                                : 'border-gray-200 bg-gray-50/50 hover:border-violet-300 hover:bg-white'
                                                        }`}
                                                    >
                                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                                            isSelected
                                                                ? 'border-violet-600 bg-violet-600 text-white'
                                                                : 'border-gray-300 bg-white'
                                                        }`}>
                                                            {isSelected && (
                                                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className={`text-sm font-semibold ${isUnavailable ? 'text-gray-400' : 'text-gray-900'}`}>
                                                                {service.type_name}
                                                            </span>
                                                            <span className={`block text-xs ${isUnavailable ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                {isUnavailable
                                                                    ? (service.unavailable_reason || 'Temporarily unavailable')
                                                                    : formatDuration(getDurationForServiceName(service.type_name))}
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {activePetServiceIds.length > 0 && (
                                            <p className="mt-3 text-xs font-medium text-violet-600">
                                                {activePetServiceIds.length} service{activePetServiceIds.length === 1 ? '' : 's'} for {servicePet?.pet_name}
                                                {' · '}Duration: {formatDuration(getSelectedServicesDuration(activePetServiceIds, availableServices))}
                                            </p>
                                        )}
                                        {selectedPets.length > 1 && (
                                            <div className="mt-4 space-y-1.5 rounded-xl border border-gray-100 bg-white px-3 py-3">
                                                {selectedPets.map((pet) => {
                                                    const ids = getPetServiceIds(formData.pet_services, pet.id);
                                                    const names = serviceNamesForIds(ids, availableServices);
                                                    return (
                                                        <p key={pet.id} className="text-xs text-gray-600">
                                                            <span className="font-semibold text-gray-800">{pet.pet_name}:</span>{' '}
                                                            {names.length > 0 ? names.join(', ') : (
                                                                <span className="text-red-600">No services yet</span>
                                                            )}
                                                        </p>
                                                    );
                                                })}
                                                <p className="pt-1 text-xs font-medium text-violet-600">
                                                    Appointment duration: {formatDuration(getSelectedServicesDuration(formData.service_ids, availableServices))}
                                                </p>
                                            </div>
                                        )}
                                        {petsMissingServices.length > 0 && !formData.is_bitten && (
                                            <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                                                Select at least one service for {petsMissingServices.map((pet) => pet.pet_name).join(', ')}, or record a bite incident below.
                                            </p>
                                        )}
                                        </>
                                        )}

                                        {isTreatmentService() && (
                                            <div className="mt-5 border-t border-violet-50 pt-5">
                                                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Treatment Symptoms</p>
                                                {symptoms.length === 0 ? (
                                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                                        Loading symptoms...
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        {symptoms.map((symptom) => {
                                                            const isSelected = selectedSymptoms.find((s) => String(s.id) === String(symptom.id));
                                                            return (
                                                                <div
                                                                    key={symptom.id}
                                                                    className={`rounded-xl border p-3 transition-colors ${
                                                                        isSelected
                                                                            ? 'border-violet-300 bg-violet-50'
                                                                            : 'border-gray-200 bg-gray-50/50'
                                                                    }`}
                                                                >
                                                                    <label className="flex cursor-pointer items-start gap-3">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!isSelected}
                                                                            onChange={() => toggleSymptom(symptom)}
                                                                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                                                        />
                                                                        <div className="flex-1">
                                                                            <span className="text-sm font-medium text-gray-900">{symptom.name}</span>
                                                                            {isSelected && (
                                                                                <div className="mt-2">
                                                                                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                                                                        Duration (days)
                                                                                    </label>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        placeholder="e.g. 3"
                                                                                        value={isSelected.days_count || ''}
                                                                                        onChange={(e) => updateSymptomDetails(symptom.id, 'days_count', e.target.value)}
                                                                                        className="block w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {selectedSymptoms.length > 0 && (
                                                    <p className="mt-3 text-xs font-medium text-violet-700">
                                                        {selectedSymptoms.length} symptom{selectedSymptoms.length === 1 ? '' : 's'} recorded
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-5 space-y-4 border-t border-violet-50 pt-5">
                                            <div className={`rounded-xl border p-4 transition-colors ${
                                                formData.is_bitten
                                                    ? 'border-red-200 bg-red-50'
                                                    : 'border-gray-200 bg-gray-50/50'
                                            }`}>
                                                <div className="mb-3 flex items-center justify-between gap-4">
                                                    <div className="flex items-start gap-3">
                                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                                            formData.is_bitten ? 'bg-red-100' : 'bg-gray-200'
                                                        }`}>
                                                            <svg className={`h-4 w-4 ${formData.is_bitten ? 'text-red-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-900">Bite incident</p>
                                                            <p className="text-xs text-gray-500">
                                                                {formData.is_bitten
                                                                    ? 'Yes — bite incident reported'
                                                                    : 'No — no bite incident'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                                                        formData.is_bitten
                                                            ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                                                            : 'bg-gray-200 text-gray-700 ring-1 ring-gray-300'
                                                    }`}>
                                                        {formData.is_bitten ? 'Yes' : 'No'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData((prev) => ({
                                                            ...prev,
                                                            is_bitten: false,
                                                            bite_details: '',
                                                        }))}
                                                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                                                            !formData.is_bitten
                                                                ? 'border-gray-400 bg-white text-gray-900 shadow-sm ring-2 ring-gray-200'
                                                                : 'border-gray-200 bg-white/60 text-gray-500 hover:border-gray-300'
                                                        }`}
                                                    >
                                                        No
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData((prev) => ({
                                                            ...prev,
                                                            is_bitten: true,
                                                        }))}
                                                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                                                            formData.is_bitten
                                                                ? 'border-red-400 bg-red-100 text-red-800 shadow-sm ring-2 ring-red-200'
                                                                : 'border-gray-200 bg-white/60 text-gray-500 hover:border-red-200 hover:text-red-700'
                                                        }`}
                                                    >
                                                        Yes
                                                    </button>
                                                </div>
                                                {formData.is_bitten && (
                                                    <div className="mt-4">
                                                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-red-700">
                                                            Incident details
                                                        </label>
                                                        <textarea
                                                            value={formData.bite_details}
                                                            onChange={(e) => setFormData((prev) => ({ ...prev, bite_details: e.target.value }))}
                                                            placeholder="Describe when, where, and how the bite occurred..."
                                                            rows={3}
                                                            className="block w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                    Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
                                                </label>
                                                <textarea
                                                    value={formData.notes}
                                                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                                                    placeholder="Any additional notes for this walk-in..."
                                                    rows={3}
                                                    className={WALKIN_FIELD_CLASS}
                                                />
                                            </div>
                                        </div>
                                    </WalkInFormSection>
                                    )}

                                    {walkInStep === 3 && (
                                    <WalkInFormSection
                                        step="3"
                                        title="Schedule"
                                        subtitle="Pick the appointment date and an available time slot"
                                        iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    >
                                        <div className="space-y-4">
                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">Date</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={formData.booking_date}
                                                    onChange={(e) => handleDateChange(e.target.value)}
                                                    className={WALKIN_FIELD_CLASS}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">Time Slot</label>
                                                <p className="mb-2 text-xs text-violet-600">
                                                    Hourly slots only. Each time shows how many openings are left.
                                                </p>
                                                {!formData.booking_date ? (
                                                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                                                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        Select a date to view available slots
                                                    </div>
                                                ) : loadingTimeSlots ? (
                                                    <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-sm text-gray-500">
                                                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                                        Loading time slots...
                                                    </div>
                                                ) : !hasWalkInBookableSlot ? (
                                                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-6 text-center text-sm text-violet-800">
                                                        No available time slots for this date
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <p className="text-xs text-gray-500">Tap a slot to select</p>
                                                            {formData.booking_time && (
                                                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                                                    {visibleWalkInTimeSlots.find((s) => s.time === formData.booking_time)?.label || formData.booking_time}
                                                                    {' · '}
                                                                    {formatDuration(selectedWalkInDuration)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                                                            {visibleWalkInTimeSlots.map((slot) => (
                                                                <button
                                                                    key={slot.time}
                                                                    type="button"
                                                                    onClick={() => slot.available && handleTimeSlotSelect(slot.time)}
                                                                    disabled={!slot.available}
                                                                    className={`rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
                                                                        formData.booking_time === slot.time
                                                                            ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                                                                            : slot.fully_booked
                                                                                ? 'cursor-not-allowed border border-red-200 bg-red-50 text-red-700'
                                                                            : slot.available
                                                                                ? 'border border-gray-200 bg-white text-gray-800 hover:border-violet-300 hover:bg-violet-50'
                                                                                : 'cursor-not-allowed border border-transparent bg-gray-100 text-gray-400 line-through'
                                                                    }`}
                                                                >
                                                                    <span className="block">{slot.label}</span>
                                                                    {slot.fully_booked || Number(slot.remaining) <= 0 ? (
                                                                        <span className={`mt-0.5 block text-[10px] font-medium ${formData.booking_time === slot.time ? 'text-white/90' : 'text-red-600'}`}>
                                                                            Fully booked
                                                                        </span>
                                                                    ) : Number.isFinite(Number(slot.remaining ?? slot.capacity)) ? (
                                                                        <span className={`mt-0.5 block text-[10px] font-medium ${formData.booking_time === slot.time ? 'text-white/80' : 'text-gray-500'}`}>
                                                                            {Number(slot.remaining ?? slot.capacity)} available
                                                                        </span>
                                                                    ) : null}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {formData.booking_time ? (
                                                            <p className="mt-3 text-xs text-gray-500">
                                                                Reserved: {formatBookingTimeRange(formData.booking_time, selectedWalkInDuration)} ({formatDuration(selectedWalkInDuration)})
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </WalkInFormSection>
                                    )}

                                    {walkInStep === 3 && (
                                    <WalkInFormSection
                                        title={isFieldmanAssigned ? 'Assign Fieldman' : 'Treatment & Medicine'}
                                        subtitle={isFieldmanAssigned
                                            ? 'Assign a fieldman. They will record medicine in the mobile app while this walk-in is processing.'
                                            : 'Select who administered treatment and the inventory used'}
                                        iconPath="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                    >
                                        <div className="space-y-5">
                                            <div className={`grid grid-cols-1 gap-4 ${isFieldmanAssigned ? '' : 'lg:grid-cols-2'}`}>
                                                {!isFieldmanAssigned && (
                                                <div className={selectedPets.length > 1 ? 'lg:col-span-2' : ''}>
                                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                        {selectedPets.length > 1 ? 'Animal weights (kg)' : 'Animal weight (kg)'}
                                                    </label>
                                                    {selectedPets.length > 1 ? (
                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                            {selectedPets.map((pet) => (
                                                                <div key={pet.id}>
                                                                    <p className="mb-1 text-xs font-medium text-gray-600">{pet.pet_name}</p>
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        min="0"
                                                                        value={treatmentPetWeights[normalizePetId(pet.id)] || ''}
                                                                        onChange={(e) => updateWalkInPetWeight(pet.id, e.target.value)}
                                                                        className={`${WALKIN_FIELD_CLASS} ${
                                                                            treatmentErrors.treatmentPetWeight ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : ''
                                                                        }`}
                                                                        placeholder="Required for vial dosage"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min="0"
                                                            value={treatmentPetWeights[normalizePetId(selectedPets[0]?.id)] || ''}
                                                            onChange={(e) => selectedPets[0] && updateWalkInPetWeight(selectedPets[0].id, e.target.value)}
                                                            className={`${WALKIN_FIELD_CLASS} ${
                                                                treatmentErrors.treatmentPetWeight ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : ''
                                                            }`}
                                                            placeholder="Required for vial dosage"
                                                        />
                                                    )}
                                                    {treatmentErrors.treatmentPetWeight && (
                                                        <p className="mt-1 text-xs text-red-600">{treatmentErrors.treatmentPetWeight}</p>
                                                    )}
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        Auto-filled from the pet record. Editing this updates the pet&apos;s saved weight when you save.
                                                    </p>
                                                </div>
                                                )}
                                                <div>
                                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                        Administered by <span className="text-red-500">*</span>
                                                    </label>
                                                    <AdministeredBySelect
                                                        value={administeredBy}
                                                        onChange={(nextValue) => {
                                                            setAdministeredBy(nextValue);
                                                            if (treatmentErrors.administeredBy) {
                                                                setTreatmentErrors((prev) => ({ ...prev, administeredBy: undefined }));
                                                            }
                                                        }}
                                                        onStaffChange={(staffMember) => {
                                                            const fieldmanId = staffMember?.role === 'fieldman' ? staffMember.id : null;
                                                            setAssignedFieldmanId(fieldmanId);
                                                            if (fieldmanId) {
                                                                setPetMedicineById({});
                                                                setSelectedInventoryCategory('');
                                                                setTreatmentErrors((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next.selectedItems;
                                                                    delete next.treatmentPetWeight;
                                                                    Object.keys(next).forEach((key) => {
                                                                        if (key.startsWith('item_')) {
                                                                            delete next[key];
                                                                        }
                                                                    });
                                                                    return next;
                                                                });
                                                            }
                                                        }}
                                                        error={treatmentErrors.administeredBy}
                                                    />
                                                    {treatmentErrors.administeredBy && (
                                                        <p className="mt-1 text-xs text-red-600">{treatmentErrors.administeredBy}</p>
                                                    )}
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        {isFieldmanAssigned
                                                            ? 'This walk-in will stay in processing on the assigned fieldman\'s mobile app until they record the medicine.'
                                                            : 'Select a fieldman to assign this walk-in to their mobile app without recording medicine here. Choose a doctor or data manager to record medicine now.'}
                                                    </p>
                                                </div>
                                            </div>

                                            {isFieldmanAssigned ? (
                                                <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
                                                    Medicine will not be shown here. The assigned fieldman will record inventory while this visit is processing in the mobile app.
                                                </div>
                                            ) : (
                                            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
                                            <div className="min-w-0 space-y-5">
                                            {selectedPets.length > 1 && (
                                                <div>
                                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Choose an animal</p>
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                        {selectedPets.map((pet) => {
                                                            const isActive = normalizePetId(pet.id) === normalizePetId(medicinePet?.id);
                                                            const names = serviceNamesForIds(getPetServiceIds(formData.pet_services, pet.id), availableServices);
                                                            return (
                                                                <button
                                                                    key={pet.id}
                                                                    type="button"
                                                                    onClick={() => setMedicinePetId(normalizePetId(pet.id))}
                                                                    className={`rounded-xl px-4 py-3 text-left transition-colors ${
                                                                        isActive
                                                                            ? 'bg-violet-600 text-white shadow-sm'
                                                                            : 'bg-white text-gray-800 ring-1 ring-gray-200 hover:bg-violet-50'
                                                                    }`}
                                                                >
                                                                    <span className="block text-sm font-semibold">{pet.pet_name}</span>
                                                                    <span className={`mt-0.5 block text-xs ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                                                                        {names.join(', ') || 'No service'}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {medicinePet && (
                                                <p className="text-sm text-gray-600">
                                                    Medicines for <span className="font-semibold text-gray-900">{medicinePet.pet_name}</span>
                                                    {medicinePetServiceNames.length > 0 ? ` · ${medicinePetServiceNames.join(', ')}` : ''}
                                                </p>
                                            )}
                                            {selectedInventoryItems.some((item) => item.is_vial) && treatmentPetWeights[normalizePetId(medicinePet?.id)] && (
                                                <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
                                                    Vial dosage: <span className="font-semibold">{calculateVialDosage(treatmentPetWeights[normalizePetId(medicinePet?.id)]).toFixed(2)} ml</span>
                                                    <span className="text-violet-700"> (1 kg = 0.10 ml)</span>
                                                </div>
                                            )}

                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                    Category
                                                </label>
                                                <select
                                                    value={activeInventoryCategory}
                                                    onChange={(e) => {
                                                        setSelectedInventoryCategory(e.target.value);
                                                        if (treatmentErrors.selectedItems) {
                                                            setTreatmentErrors((prev) => ({ ...prev, selectedItems: undefined }));
                                                        }
                                                    }}
                                                    disabled={inventoryLoading || inventoryCategories.length === 0}
                                                    className={`${WALKIN_FIELD_CLASS} ${
                                                        treatmentErrors.selectedItems ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : ''
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
                                                                ? 'No medicine is in stock for this service. Use the outside purchase receipt.'
                                                                : 'Choose a category to see the medicines.'}
                                                    </p>
                                                ) : visibleInventoryItems.length === 0 ? (
                                                    <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                                                        {inventoryLoading
                                                            ? 'Loading items...'
                                                            : `No medicine is in stock in ${activeInventoryCategory}. Use the outside purchase receipt.`}
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
                                                                            {item.is_vial && treatmentPetWeights[normalizePetId(medicinePet?.id)] ? (
                                                                                <p className="text-xs font-medium text-violet-700">
                                                                                    Dosage: {calculateVialDosage(treatmentPetWeights[normalizePetId(medicinePet?.id)]).toFixed(2)} ml
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
                                                items={outsidePurchaseItems}
                                                onChange={(nextItems) => {
                                                    setPetMedicineById((prev) => {
                                                        const next = { ...prev };
                                                        selectedPets.forEach((pet) => {
                                                            const key = normalizePetId(pet.id);
                                                            const current = next[key] || emptyWalkInPetMedicine();
                                                            next[key] = { ...current, outsidePurchaseItems: nextItems };
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
                                                    animals: selectedPets.map((pet) => ({
                                                        name: pet.pet_name,
                                                        patientId: pet.identification_number
                                                            || (pet.registration_status === 'exempt' ? 'No ID needed' : '—'),
                                                    })),
                                                    ownerName: selectedClient ? getOwnerDisplayName(selectedClient) : '',
                                                    serviceNames: [...new Set(selectedPets.flatMap((pet) => serviceNamesForIds(
                                                        getPetServiceIds(formData.pet_services, pet.id),
                                                        availableServices,
                                                    )))],
                                                    symptoms: selectedPets.some((pet) => serviceNamesForIds(
                                                        getPetServiceIds(formData.pet_services, pet.id),
                                                        availableServices,
                                                    ).some((name) => name.toLowerCase().includes('treatment')))
                                                        ? selectedSymptoms
                                                        : [],
                                                    category: activeInventoryCategory,
                                                    categories: inventoryCategories,
                                                }}
                                            />
                                            </div>
                                            <MedicineVisitSummary groups={medicineSummaryGroups} />
                                            </div>
                                            )}
                                        </div>
                                    </WalkInFormSection>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-xs text-gray-500">
                                            Step {walkInStep} of 3
                                            {walkInStep === 1 && !step1Complete && ' · Select a client and at least one pet to continue'}
                                            {walkInStep === 2 && !step2Complete && ' · Select services for each pet, or record a bite incident'}
                                            {walkInStep === 3 && !(formData.booking_date && formData.booking_time) && ' · Choose a date and time slot'}
                                            {walkInStep === 3 && formData.booking_date && formData.booking_time && !treatmentComplete && (
                                                isFieldmanAssigned
                                                    ? ' · Select who will administer this visit'
                                                    : ` · Select medicine for ${incompleteMedicinePet?.pet_name || 'each animal'}, or add an outside purchase`
                                            )}
                                            {walkInReady && ' · Ready to save'}
                                        </p>
                                        {walkInReady && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                </svg>
                                                Ready
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-3">
                                        {walkInStep === 1 ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowAddModal(false)}
                                                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setWalkInStep((prev) => Math.max(1, prev - 1))}
                                                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                                            >
                                                Back
                                            </button>
                                        )}
                                        {walkInStep < 3 ? (
                                            <button
                                                type="button"
                                                onClick={() => setWalkInStep((prev) => Math.min(3, prev + 1))}
                                                disabled={
                                                    (walkInStep === 1 && !step1Complete)
                                                    || (walkInStep === 2 && !step2Complete)
                                                }
                                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Next Step
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleSubmitWalkIn}
                                                disabled={submitting || !walkInReady}
                                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {submitting ? (
                                                    <>
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Save Walk-in Service
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Walk-in Success Modal */}
            {walkInSuccess && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
                        <div className="px-6 pt-8 pb-6 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
                                <svg className="h-8 w-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Walk-in Added</h3>
                            <p className="mt-2 text-sm text-gray-500">
                                The walk-in appointment has been recorded successfully.
                            </p>
                        </div>

                        <div className="border-t border-gray-100 bg-gray-50/80 px-6 py-4">
                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-gray-500">Client</span>
                                    <span className="font-semibold text-gray-900">{walkInSuccess.clientName}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-gray-500">{walkInSuccess.petName?.includes(',') ? 'Pets' : 'Pet'}</span>
                                    <span className="font-semibold text-gray-900">{walkInSuccess.petName}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-gray-500">Schedule</span>
                                    <span className="text-right font-semibold text-gray-900">
                                        {formatDate(walkInSuccess.bookingDate)} · {formatBookingTimeRange(walkInSuccess.bookingTime, walkInSuccess.durationMinutes || 10)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-gray-500">Duration</span>
                                    <span className="font-semibold text-gray-900">
                                        {formatDuration(walkInSuccess.durationMinutes || 10)}
                                    </span>
                                </div>
                                {walkInSuccess.services?.length > 0 ? (
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-gray-500">Services</span>
                                        <span className="text-right font-semibold text-gray-900">
                                            {walkInSuccess.services
                                                .map((name) => `${name} (${formatDuration(getDurationForServiceName(name))})`)
                                                .join(', ')}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                        STATUS_BADGE[normalizeWalkInStatus(walkInSuccess.status)] || STATUS_BADGE.processing
                                    }`}>
                                        {formatWalkInStatusLabel(walkInSuccess.status)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setWalkInSuccess(null)}
                                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PhotoPreviewOverlay preview={photoPreview} onClose={closePhotoPreview} />

            <SuccessModal
                open={successModal.open}
                title={successModal.title}
                message={successModal.message}
                onClose={() => setSuccessModal({ open: false, title: '', message: '' })}
            />
        </>
    );
}
