import { useEffect, useMemo, useRef, useState } from 'react';
import { router, usePage, useRemember } from '@inertiajs/react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from '@/Components/Admin/Sidebar';
import AppointmentStatusHistory from '@/Components/Admin/AppointmentStatusHistory';
import PetMedicalSections from '@/Components/Admin/PetMedicalSections';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import { subscribeToAppointments } from '@/utils/echo';
import { sortAdminAppointmentsNewestFirst } from '@/utils/adminAppointmentSort';
import OwnerApprovalBadge from '@/Components/Admin/OwnerApprovalBadge';
import { markBookingViewed, shouldShowNewBookingBadge } from '@/utils/adminViewedBookings';

const ADMIN_PENDING_CANCELLATION_TEMPLATES = [
    'The clinic is unavailable on your scheduled date. Please book a new appointment.',
    'The veterinarian is unavailable for this time slot. Please choose another schedule.',
    'Your pet must be registered or exempt before we can proceed with this appointment.',
    'We are unable to accommodate this service on the requested date.',
    'Please rebook your appointment on a different available date.',
];

const STATUS_BADGE = {
    pending: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    approved: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    cancelled: 'bg-violet-50 text-violet-400 ring-1 ring-violet-100',
    ongoing: 'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
    completed: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const REGISTRATION_BADGE = {
    registered: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    exempt: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
    unregistered: 'bg-violet-50 text-violet-500 ring-1 ring-violet-100',
};

const MODAL_HEADER_BG = 'bg-gradient-to-br from-violet-50/70 via-white to-white';

// Diri kuhaon ang label sa registration status.
function getRegistrationLabel(status) {
    if (status === 'registered') return 'Registered';
    if (status === 'exempt') return 'Exempt';
    if (status === 'unregistered') return 'Unregistered';
    return null;
}

// Diri i-capitalize ang label sa status.
function formatStatusLabel(status) {
    if (!status) return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

// Diri i-format ang petsa sa booking.
function formatBookingDate(dateStr) {
    if (!dateStr) return '—';
    const [year, month, day] = String(dateStr).split('-').map(Number);
    if (!year || !month || !day) return String(dateStr);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// Diri i-format ang oras sa booking.
function formatBookingTime(timeStr) {
    if (!timeStr) return '—';
    const [hours, minutes] = String(timeStr).split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10) || 0);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

// Diri i-convert ang oras ngadto sa minutes.
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = String(timeStr).split(':').map(Number);
    return (hours * 60) + (minutes || 0);
}

// Diri i-convert ang minutes ngadto sa label sa oras.
function minutesToTimeLabel(totalMinutes) {
    const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    const date = new Date();
    date.setHours(hours, minutes);
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
    return `${formatBookingTime(timeStr)} – ${minutesToTimeLabel(timeToMinutes(timeStr) + duration)}`;
}

// Diri kuhaon ang mga ngalan sa na-assign nga fieldmen.
function getAssignedFieldmenLabel(booking) {
    const names = (booking?.assigned_fieldmen || [])
        .map((fieldman) => fieldman?.name)
        .filter(Boolean);

    if (names.length === 0) return null;
    return names.join(', ');
}

// Diri kuhaon kinsa ang nag-administer.
function getAdministeredByLabel(booking) {
    return booking?.administered_by || getAssignedFieldmenLabel(booking) || null;
}

// Diri himuon ang label sa marker sa home service.
function buildHomeServiceMarkerLabel(booking) {
    if (booking?.status === 'pending') {
        return 'PENDING APPROVAL · MEETING PLACE';
    }

    const scheduleLabel = [formatBookingDate(booking?.date), formatBookingTime(booking?.time)]
        .filter((value) => value && value !== '—')
        .join(' · ');

    if (scheduleLabel) {
        const statusPrefix = booking?.status === 'approved'
            ? 'APPROVED'
            : (booking?.status || 'SCHEDULED').toUpperCase();
        return `${statusPrefix} · ${scheduleLabel}`;
    }

    return booking?.meeting_place_label || 'MEETING PLACE';
}

// Diri i-format ang gitas-on sa oras.
function formatDuration(minutes) {
    const value = minutes > 0 ? minutes : 10;
    if (value < 60) return `${value} min`;
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

// Diri kuhaon ang ngalan sa barangay.
function getBarangayName(barangay) {
    if (!barangay) return null;
    if (typeof barangay === 'string') return barangay;
    if (typeof barangay === 'object' && barangay.name) return barangay.name;
    return null;
}

// Diri i-format ang location sa client.
function formatClientLocation(barangay, zone) {
    const parts = [barangay, zone].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
}

// Diri kuhaon ang coordinates sa meeting place.
function getMeetingPlaceCoords(booking) {
    const lat = Number(booking?.meeting_latitude);
    const lng = Number(booking?.meeting_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        return null;
    }
    return { lat, lng };
}

// Diri i-format ang coordinates sa meeting place.
function formatMeetingCoordinates(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Diri himuon ang key sa coordinates.
function getMeetingPlaceCoordKey(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// Diri pamub-on ang ngalan sa lugar.
function shortenPlaceName(placeName) {
    if (!placeName) return null;
    const cleaned = String(placeName)
        .replace(/,?\s*Philippines$/i, '')
        .replace(/,?\s*Misamis Oriental$/i, '')
        .replace(/,?\s*El Salvador( City)?$/i, '')
        .trim();
    return cleaned || placeName;
}

// Diri pangitaon sa Mapbox ang ngalan sa meeting place.
async function reverseGeocodeMeetingPlace(lng, lat, token) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&types=address,poi,neighborhood,locality,place&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    return shortenPlaceName(feature.place_name || feature.text) || null;
}

// Diri kuhaon ang label sa meeting place sa booking.
function getBookedMeetingPlaceLabel(booking, labelsByCoord = {}) {
    const coords = getMeetingPlaceCoords(booking);
    if (!coords) return null;
    const key = getMeetingPlaceCoordKey(coords.lat, coords.lng);
    return labelsByCoord[key]
        || formatMeetingCoordinates(coords.lat, coords.lng);
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

// Diri ang mga field sa rason sa pag-cancel.
function CancellationReasonFields({
    cancelReason,
    setCancelReason,
    cancelError,
    setCancelError,
    fieldId = 'map-cancel-reason',
    templates = ADMIN_PENDING_CANCELLATION_TEMPLATES,
}) {
    return (
        <div>
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
            <textarea
                id={fieldId}
                rows={3}
                value={cancelReason}
                onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelError) setCancelError('');
                }}
                placeholder="Explain why this appointment is being cancelled. The client will receive this message."
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 ${
                    cancelError
                        ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                        : 'border-gray-200 focus:border-violet-300 focus:ring-violet-100'
                }`}
            />
            {cancelError && <p className="mt-1.5 text-xs text-red-600">{cancelError}</p>}
        </div>
    );
}

/** Active visits stay on the map. A completed visit stays for one day, then leaves. */
const DOOR_TO_DOOR_VISIBLE_STATUSES = ['pending', 'approved', 'processing', 'ongoing'];
const COMPLETED_VISIBLE_MS = 24 * 60 * 60 * 1000;

function isCompletedWithinOneDay(booking, now = Date.now()) {
    const completedAt = booking?.completed_at || booking?.updated_at;
    if (!completedAt) return false;
    const completedTime = new Date(completedAt).getTime();
    if (!Number.isFinite(completedTime)) return false;
    return now - completedTime < COMPLETED_VISIBLE_MS;
}

// Diri i-check kung makita ang door-to-door booking.
function isVisibleDoorToDoorBooking(booking) {
    if (DOOR_TO_DOOR_VISIBLE_STATUSES.includes(booking?.status)) return true;
    return booking?.status === 'completed' && isCompletedWithinOneDay(booking);
}

const DOOR_TO_DOOR_STATUS_STYLES = {
    pending: {
        label: 'Pending approval',
        gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        glow: '0 0 0 4px rgba(37, 99, 235, 0.25), 0 2px 10px rgba(29, 78, 216, 0.5)',
        badgeColor: '#1e3a8a',
        badgeBackground: '#eff6ff',
        badgeBorder: '#bfdbfe',
    },
    approved: {
        label: 'Approved · awaiting fieldman',
        gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        glow: '0 2px 10px rgba(5, 150, 105, 0.45)',
        badgeColor: '#065f46',
        badgeBackground: '#ecfdf5',
        badgeBorder: '#a7f3d0',
    },
    processing: {
        label: 'Processing · preparing visit',
        gradient: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
        glow: '0 2px 10px rgba(8, 145, 178, 0.45)',
        badgeColor: '#155e75',
        badgeBackground: '#ecfeff',
        badgeBorder: '#a5f3fc',
    },
    ongoing: {
        label: 'Ongoing · visit in progress',
        gradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
        glow: '0 2px 10px rgba(234, 88, 12, 0.45)',
        badgeColor: '#9a3412',
        badgeBackground: '#fff7ed',
        badgeBorder: '#fed7aa',
    },
    completed: {
        label: 'Completed',
        gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        glow: '0 2px 10px rgba(71, 85, 105, 0.4)',
        badgeColor: '#334155',
        badgeBackground: '#f1f5f9',
        badgeBorder: '#cbd5e1',
    },
};

/** Overrides status color when the booking is scheduled for today. */
const TODAY_PIN_STYLE = {
    label: 'Scheduled today',
    gradient: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
    glow: '0 0 0 4px rgba(225, 29, 72, 0.28), 0 2px 10px rgba(190, 18, 60, 0.5)',
    badgeColor: '#9f1239',
    badgeBackground: '#fff1f2',
    badgeBorder: '#fecdd3',
};

// Diri i-check kung karon naka-schedule ang booking.
function isBookingScheduledToday(dateStr) {
    if (!dateStr) return false;
    const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return false;
    const today = new Date();
    return (
        year === today.getFullYear()
        && month === (today.getMonth() + 1)
        && day === today.getDate()
    );
}

function escapeMapHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Diri kuhaon ang service type sa nabakunahan nga pet.
function petServiceLabel(pet) {
    const types = Array.isArray(pet?.service_types) ? pet.service_types.filter(Boolean) : [];
    return types.join(' · ');
}

// Diri ang mubo nga label sa pin: Vaccinated o Not vaccinated lang.
function petStatusLabel(pet) {
    return pet?.vaccinated ? 'Vaccinated' : 'Not vaccinated';
}

// Diri i-spread ang mga pet nga parehas og street pin aron matag usa makita.
function spreadPetMapCoordinates(pets) {
    const groups = new Map();

    pets.forEach((pet) => {
        const lat = Number(pet.latitude);
        const lng = Number(pet.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        const group = groups.get(key) || [];
        group.push(pet);
        groups.set(key, group);
    });

    const placed = [];
    groups.forEach((group) => {
        group.forEach((pet, index) => {
            let lat = Number(pet.latitude);
            let lng = Number(pet.longitude);
            if (group.length > 1) {
                const angle = (Math.PI * 2 * index) / group.length;
                const radius = 0.00012;
                lat += Math.sin(angle) * radius;
                lng += Math.cos(angle) * radius;
            }
            placed.push({ ...pet, latitude: lat, longitude: lng });
        });
    });

    return placed;
}

// Diri kuhaon ang style sa pin sa home service.
function getHomeServicePinStyle(booking) {
    if (booking?.status !== 'completed' && isBookingScheduledToday(booking?.date)) {
        return TODAY_PIN_STYLE;
    }
    return DOOR_TO_DOOR_STATUS_STYLES[booking?.status] || DOOR_TO_DOOR_STATUS_STYLES.approved;
}

if (typeof document !== 'undefined' && !document.getElementById('elsalvador-pending-pulse-style')) {
    const styleTag = document.createElement('style');
    styleTag.id = 'elsalvador-pending-pulse-style';
    styleTag.textContent = `
        @keyframes elsalvador-pending-pulse {
            0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.55); }
            70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
            100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        @keyframes elsalvador-today-pulse {
            0% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.55); }
            70% { box-shadow: 0 0 0 10px rgba(225, 29, 72, 0); }
            100% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0); }
        }
    `;
    document.head.appendChild(styleTag);
} else if (typeof document !== 'undefined' && !document.getElementById('elsalvador-today-pulse-style')) {
    const styleTag = document.createElement('style');
    styleTag.id = 'elsalvador-today-pulse-style';
    styleTag.textContent = `
        @keyframes elsalvador-today-pulse {
            0% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.55); }
            70% { box-shadow: 0 0 0 10px rgba(225, 29, 72, 0); }
            100% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0); }
        }
    `;
    document.head.appendChild(styleTag);
}

// Diri i-check kung home service ang appointment.
function isHomeServiceAppointment(appointment) {
    return Boolean(
        appointment?.is_door_to_door
        || appointment?.booking_type === 'home_service'
    );
}

// Diri i-format ang door-to-door booking para sa map.
function formatDoorToDoorBooking(appointment) {
    const pet = appointment.pet || {};
    const user = appointment.user || {};
    const species = typeof pet.species === 'string'
        ? pet.species
        : (pet.species?.species_name || appointment.pet_species || null);
    const breed = typeof pet.breed === 'string'
        ? pet.breed
        : (pet.breed?.breed_name || appointment.pet_breed || null);
    const barangay = getBarangayName(user.barangay) || appointment.client_barangay || null;
    const zone = user.zone || appointment.client_zone || null;
    const clientName = [user.firstname, user.lastname]
        .filter(Boolean)
        .join(' ')
        .trim() || user.name || appointment.client_name || 'Client';

    return {
        ...appointment,
        id: appointment.id,
        pet: {
            ...pet,
            name: pet.name || pet.pet_name || appointment.pet_name,
            pet_name: pet.pet_name || pet.name || appointment.pet_name,
            species: species || pet.species,
            breed: breed || pet.breed,
            sex: pet.sex || appointment.pet_sex,
            age: pet.age || appointment.pet_age,
            registration_status: pet.registration_status || appointment.pet_registration_status,
            identification_number: pet.identification_number || null,
            color: pet.color || null,
            weight: pet.weight ?? null,
            pet_photo_url: pet.pet_photo_url || null,
            markings_photo_url: pet.markings_photo_url || null,
            markings: pet.markings || null,
        },
        user: {
            ...user,
            name: clientName,
            phone_number: user.phone_number || appointment.client_phone,
            email: user.email || appointment.client_email,
            barangay,
            zone,
        },
        pet_name: pet.pet_name || pet.name || appointment.pet_name,
        pet_species: species,
        pet_breed: breed,
        pet_sex: pet.sex || appointment.pet_sex,
        pet_age: pet.age || appointment.pet_age,
        pet_registration_status: pet.registration_status || appointment.pet_registration_status,
        client_name: clientName,
        client_phone: user.phone_number || appointment.client_phone,
        client_email: user.email || appointment.client_email,
        client_barangay: barangay,
        client_zone: zone,
        services: Array.isArray(appointment.services) ? appointment.services : [],
        notes: appointment.notes,
        date: appointment.date,
        time: appointment.time,
        duration_minutes: appointment.duration_minutes,
        status: appointment.status,
        complaint: appointment.complaint || null,
        administered_by: appointment.administered_by
            || (Array.isArray(appointment.assigned_fieldmen)
                ? appointment.assigned_fieldmen.map((fieldman) => fieldman.name).filter(Boolean).join(', ')
                : null)
            || null,
        treatment_items: appointment.treatment_items || [],
        status_history: appointment.status_history || [],
        cancellation_reason: appointment.cancellation_reason || null,
        meeting_latitude: appointment.meeting_latitude != null ? Number(appointment.meeting_latitude) : null,
        meeting_longitude: appointment.meeting_longitude != null ? Number(appointment.meeting_longitude) : null,
        meeting_place_label: appointment.meeting_place_label || 'MEETING PLACE',
        meeting_place_photo_url: appointment.meeting_place_photo_url || null,
        assigned_fieldman_ids: Array.isArray(appointment.assigned_fieldman_ids)
            ? appointment.assigned_fieldman_ids
            : [],
        assigned_fieldmen: Array.isArray(appointment.assigned_fieldmen)
            ? appointment.assigned_fieldmen
            : [],
    };
}

const ELSALVADOR_CITY_CENTER = [124.5218, 8.5630];
// Slightly padded so meeting-place pins near the city edge stay inside maxBounds.
const ELSALVADOR_CITY_BOUNDS = [
    [124.42, 8.42],
    [124.62, 8.66],
];
const BARANGAY_GEOJSON_URL = '/geojson/elsalvador-barangays.geojson';
const BARANGAY_SOURCE_ID = 'elsalvador-barangays';
const BARANGAY_FILL_LAYER_ID = 'elsalvador-barangays-fill';
const BARANGAY_OUTLINE_LAYER_ID = 'elsalvador-barangays-outline';
const BARANGAY_LABEL_LAYER_ID = 'elsalvador-barangays-labels';

// Diri tangtangon ang mga layer sa barangay sa map.
const removeBarangayLayers = (map) => {
    [BARANGAY_LABEL_LAYER_ID, BARANGAY_OUTLINE_LAYER_ID, BARANGAY_FILL_LAYER_ID].forEach((layerId) => {
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
    });

    if (map.getSource(BARANGAY_SOURCE_ID)) {
        map.removeSource(BARANGAY_SOURCE_ID);
    }
};

// Diri i-apply ang kolor sa layer sa barangay.
const applyBarangayLayerPaint = (map, selectedId = '') => {
    if (!map.getLayer(BARANGAY_FILL_LAYER_ID)) return;

    const selected = selectedId || '';

    map.setPaintProperty(BARANGAY_FILL_LAYER_ID, 'fill-color', [
        'case',
        ['==', ['to-string', ['get', 'barangay_id']], selected],
        '#55ed3a',
        '#3C91E6',
    ]);
    map.setPaintProperty(BARANGAY_FILL_LAYER_ID, 'fill-opacity', [
        'case',
        ['==', ['to-string', ['get', 'barangay_id']], selected],
        0.28,
        0.12,
    ]);
    map.setPaintProperty(BARANGAY_OUTLINE_LAYER_ID, 'line-color', [
        'case',
        ['==', ['to-string', ['get', 'barangay_id']], selected],
        '#2bb621',
        '#1F7A8C',
    ]);
    map.setPaintProperty(BARANGAY_OUTLINE_LAYER_ID, 'line-width', [
        'case',
        ['==', ['to-string', ['get', 'barangay_id']], selected],
        4.5,
        2.5,
    ]);
    map.setPaintProperty(BARANGAY_OUTLINE_LAYER_ID, 'line-opacity', 0.95);
};

// Diri himuon balik ang mga layer sa barangay.
const rebuildBarangayLayers = (map, geojson, selectedId = '') => {
    if (!map.getStyle() || !geojson?.features?.length) return;

    removeBarangayLayers(map);

    map.addSource(BARANGAY_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
    });

    map.addLayer({
        id: BARANGAY_FILL_LAYER_ID,
        type: 'fill',
        source: BARANGAY_SOURCE_ID,
        paint: {
            'fill-color': '#92fa8b',
            'fill-opacity': 0.12,
            'fill-antialias': true,
        },
    });

    map.addLayer({
        id: BARANGAY_OUTLINE_LAYER_ID,
        type: 'line',
        source: BARANGAY_SOURCE_ID,
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
        },
        paint: {
            'line-color': '#3aed61',
            'line-width': 2.5,
            'line-opacity': 0.95,
        },
    });

    try {
        map.addLayer({
            id: BARANGAY_LABEL_LAYER_ID,
            type: 'symbol',
            source: BARANGAY_SOURCE_ID,
            layout: {
                'text-field': ['get', 'display_name'],
                'text-size': 15,
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-anchor': 'center',
                'text-allow-overlap': true,
            },
            paint: {
                'text-color': '#21b62b',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
            },
        });
    } catch (error) {
        console.warn('Barangay label layer skipped:', error);
    }

    applyBarangayLayerPaint(map, selectedId);
};

const GEOJSON_NAME_ALIASES = {
    Calongonan: 'San Francisco de Asis (Calongonan)',
    Bolobolo: 'Pedro S. Baculio (Bolo-Bolo)',
    Kibonbon: 'Quibonbon',
    Poblacion: 'Poblacion (city center)',
};

/** Average of ring vertices — good enough for barangay marker placement. */
// Diri kwentahon ang tunga sa ring sa polygon.
const getRingCentroid = (ring) => {
    if (!Array.isArray(ring) || ring.length === 0) return null;
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;
    for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const lng = Number(point[0]);
        const lat = Number(point[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        sumLng += lng;
        sumLat += lat;
        count += 1;
    }
    if (count === 0) return null;
    return [sumLng / count, sumLat / count];
};

// Diri kwentahon ang tunga sa feature sa map.
const getFeatureCentroid = (feature) => {
    const geometry = feature?.geometry;
    if (!geometry) return null;

    if (geometry.type === 'Polygon') {
        return getRingCentroid(geometry.coordinates?.[0]);
    }

    if (geometry.type === 'MultiPolygon') {
        const rings = (geometry.coordinates || [])
            .map((polygon) => polygon?.[0])
            .filter(Boolean);
        if (rings.length === 0) return null;
        // Prefer the largest ring (most vertices) as the main area.
        const mainRing = rings.reduce((best, ring) => (
            (ring?.length || 0) > (best?.length || 0) ? ring : best
        ), rings[0]);
        return getRingCentroid(mainRing);
    }

    return null;
};

function pointInRing(lng, lat, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = Number(ring[i][0]);
        const yi = Number(ring[i][1]);
        const xj = Number(ring[j][0]);
        const yj = Number(ring[j][1]);
        const intersects = ((yi > lat) !== (yj > lat))
            && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
}

function boundsFromFeature(feature) {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    featureRings(feature).forEach((ring) => {
        (ring || []).forEach((coord) => {
            const lng = Number(coord?.[0]);
            const lat = Number(coord?.[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        });
    });

    if (!Number.isFinite(minLng)) return null;
    return [[minLng, minLat], [maxLng, maxLat]];
}

function featureRings(feature) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'Polygon') return geometry.coordinates || [];
    if (geometry?.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
    return [];
}

function resolveMeetingBarangayId(booking, geojson) {
    const lat = Number(booking?.meeting_latitude);
    const lng = Number(booking?.meeting_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

    for (const feature of geojson?.features || []) {
        const barangayId = feature?.properties?.barangay_id;
        if (!barangayId) continue;
        for (const ring of featureRings(feature)) {
            if (pointInRing(lng, lat, ring)) return String(barangayId);
        }
    }

    return null;
}

function distanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Diri pangitaon ang barangay nga nasulod sa pin sa pet.
function resolveCoordinateBarangayId(latitude, longitude, geojson) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

    const inside = resolveMeetingBarangayId(
        { meeting_latitude: lat, meeting_longitude: lng },
        geojson
    );
    if (inside) return inside;

    let bestId = null;
    let bestKm = Infinity;
    for (const feature of geojson?.features || []) {
        const barangayId = feature?.properties?.barangay_id;
        const centroid = getFeatureCentroid(feature);
        if (!barangayId || !centroid) continue;
        const km = distanceKm(lat, lng, centroid[1], centroid[0]);
        if (km < bestKm) {
            bestKm = km;
            bestId = String(barangayId);
        }
    }

    return bestId && bestKm <= 2.5 ? bestId : null;
}

function petMatchesSelectedBarangay(pet, selectedId, selectedName, geojson) {
    if (!selectedId) return true;
    if (pet?.pin_source !== 'barangay') {
        const pinBarangayId = resolveCoordinateBarangayId(pet?.latitude, pet?.longitude, geojson);
        if (pinBarangayId) return pinBarangayId === String(selectedId);
    }
    if (pet?.barangay_id != null && String(pet.barangay_id) !== '') {
        return String(pet.barangay_id) === String(selectedId);
    }
    if (!selectedName || !pet?.barangay) return false;
    return String(pet.barangay).toLowerCase() === String(selectedName).toLowerCase();
}

function bookingMatchesSelectedBarangay(booking, selectedId, selectedName, geojson) {
    if (!selectedId) return true;
    const resolvedId = resolveMeetingBarangayId(booking, geojson);
    if (resolvedId) return resolvedId === String(selectedId);
    if (!selectedName || !booking?.client_barangay) return false;
    return String(booking.client_barangay).toLowerCase() === String(selectedName).toLowerCase();
}

/** Marker positions from official barangay polygons (avoids Mapbox mis-geocodes). */
// Diri kuhaon ang coordinates sa barangay gikan sa GeoJSON.
const coordinatesFromBarangayGeoJson = (geojson) => {
    const next = {};
    for (const feature of geojson?.features || []) {
        const barangayId = feature?.properties?.barangay_id;
        if (!barangayId) continue;
        const centroid = getFeatureCentroid(feature);
        if (centroid) {
            next[String(barangayId)] = centroid;
        }
    }
    return next;
};

// Diri limpyohan ang URL sa litrato.
const normalizeMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
        return trimmed;
    }
    return `/${trimmed.replace(/^\/+/, '')}`;
};

// Diri pangitaon ang barangay ID gikan sa ngalan sa GeoJSON.
const resolveBarangayIdFromGeoName = (geoName, barangayList) => {
    if (!geoName) return null;
    const aliasName = GEOJSON_NAME_ALIASES[geoName] || geoName;
    const normalizedAlias = aliasName.toLowerCase();

    const exact = barangayList.find((barangay) => barangay.name.toLowerCase() === normalizedAlias);
    if (exact) return String(exact.id);

    const partial = barangayList.find((barangay) => {
        const dbName = barangay.name.toLowerCase();
        return dbName.includes(normalizedAlias) || normalizedAlias.includes(dbName.split('(')[0].trim());
    });

    return partial ? String(partial.id) : null;
};

// Diri idugang ang barangay info sa GeoJSON.
const enrichBarangayGeoJson = (geojson, barangayList) => ({
    ...geojson,
    features: (geojson.features || []).map((feature) => {
        const geoName = feature.properties?.ADM4_EN || '';
        const barangayId = resolveBarangayIdFromGeoName(geoName, barangayList);
        return {
            ...feature,
            properties: {
                ...feature.properties,
                barangay_id: barangayId,
                display_name: GEOJSON_NAME_ALIASES[geoName] || geoName,
            },
        };
    }),
});

/** Classic map pin for barangay markers (enlarges when selected). */
// Diri himuon ang pin sa location sa barangay.
const createBarangayLocationPin = ({ isActive, onClick }) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.cursor = 'pointer';
    wrapper.style.zIndex = isActive ? '8' : '4';

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.setAttribute('aria-label', 'Select barangay');
    const size = isActive ? 34 : 22;
    pin.style.width = `${size}px`;
    pin.style.height = `${size}px`;
    pin.style.padding = '0';
    pin.style.border = 'none';
    pin.style.background = 'transparent';
    pin.style.cursor = 'pointer';
    pin.style.display = 'block';
    pin.style.lineHeight = '0';
    pin.style.filter = isActive
        ? 'drop-shadow(0 4px 10px rgba(109, 40, 217, 0.45))'
        : 'drop-shadow(0 2px 6px rgba(15, 23, 42, 0.35))';
    pin.style.transition = 'transform 160ms ease, filter 160ms ease';
    pin.style.transform = isActive ? 'scale(1.08)' : 'scale(1)';
    pin.style.transformOrigin = 'bottom center';

    const fill = isActive ? '#1F7A8C' : '#0284c7';
    const stroke = '#ffffff';
    pin.innerHTML = `
        <svg viewBox="0 0 24 36" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
                d="M12 0C5.925 0 1 4.925 1 11c0 8.25 11 25 11 25s11-16.75 11-25C23 4.925 18.075 0 12 0z"
                fill="${fill}"
                stroke="${stroke}"
                stroke-width="1.75"
            />
            <circle cx="12" cy="11" r="4.25" fill="#ffffff"/>
        </svg>
    `;

    pin.addEventListener('mouseenter', () => {
        if (!isActive) pin.style.transform = 'scale(1.12)';
    });
    pin.addEventListener('mouseleave', () => {
        pin.style.transform = isActive ? 'scale(1.08)' : 'scale(1)';
    });
    pin.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick?.();
    });

    wrapper.appendChild(pin);
    return wrapper;
};

const MAP_STYLES = {
    streets: {
        label: 'Streets',
        style: 'mapbox://styles/mapbox/streets-v12',
    },
    satellite: {
        label: 'Satellite',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
    },
    outdoors: {
        label: 'Outdoors',
        style: 'mapbox://styles/mapbox/outdoors-v12',
    },
    light: {
        label: 'Light',
        style: 'mapbox://styles/mapbox/light-v11',
    },
};

const HOME_SERVICE_PREVIEW_DELAY_MS = 1000;

const HOME_SERVICE_STATUS_RANK = {
    pending: 0,
    approved: 1,
    processing: 2,
    ongoing: 3,
};

const PANEL =
    'rounded-2xl border border-white/70 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl';

function MapSwitchButton({ active, onClick, children, activeClass = 'bg-violet-600 text-white shadow-sm' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                active ? activeClass : 'text-gray-500 hover:bg-white hover:text-gray-800'
            }`}
        >
            {children}
        </button>
    );
}

function PetVaccinationSwitch({ value, onChange, vaccinatedCount, unvaccinatedCount }) {
    const options = [
        { id: 'vaccinated', label: 'Vaccinated', count: vaccinatedCount, dot: 'bg-emerald-500' },
        { id: 'unvaccinated', label: 'Not vaccinated', count: unvaccinatedCount, dot: 'bg-amber-500' },
        { id: 'all_pets', label: 'All', count: vaccinatedCount + unvaccinatedCount, dot: 'bg-slate-700' },
    ];

    return (
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100/80 p-1" role="tablist" aria-label="Pet vaccination">
            {options.map((option) => {
                const active = value === option.id;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.id)}
                        className={`flex min-w-0 flex-col items-center rounded-lg px-1 py-2 transition ${
                            active
                                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-slate-200'
                                : 'text-gray-500 hover:bg-white/70 hover:text-gray-800'
                        }`}
                    >
                        <span className={`text-base font-bold tabular-nums leading-none ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                            {option.count}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-center text-[10px] font-semibold leading-tight">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.dot}`} />
                            {option.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// Diri ang pill sa stat nga naay dot.
function StatPill({ label, value, accent = 'violet' }) {
    const dots = {
        violet: 'bg-violet-500',
        sky: 'bg-sky-500',
        emerald: 'bg-emerald-500',
    };

    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${dots[accent] || dots.violet}`} />
                <span className="text-sm font-bold tabular-nums tracking-tight text-gray-900">{value}</span>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        </div>
    );
}

// Diri ang placeholder kung walay napiling barangay.
function BarangayInfoPlaceholder() {
    return (
        <div className={`${PANEL} overflow-hidden`}>
            <div className="relative h-36 bg-gradient-to-br from-violet-100 via-slate-50 to-sky-50">
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-violet-500 shadow-sm ring-1 ring-violet-100">
                        <svg viewBox="0 0 24 36" className="h-6 w-4" aria-hidden="true">
                            <path
                                d="M12 0C5.925 0 1 4.925 1 11c0 8.25 11 25 11 25s11-16.75 11-25C23 4.925 18.075 0 12 0z"
                                fill="currentColor"
                            />
                            <circle cx="12" cy="11" r="4.25" fill="#fff" />
                        </svg>
                    </span>
                    <p className="mt-3 text-sm font-semibold text-gray-700">Click a pin to view info</p>
                    <p className="mt-1 text-[11px] text-gray-400">Tap a barangay marker on the map</p>
                </div>
            </div>
        </div>
    );
}

// Diri ang card sa info sa barangay.
function BarangayInfoCard({
    barangay,
    onClose,
    onEdit,
}) {
    const photoUrl = normalizeMediaUrl(barangay?.photo_url);

    return (
        <div className={`${PANEL} overflow-hidden animate-[map-panel-in_220ms_ease-out]`}>
            <div className="relative h-36 bg-gradient-to-br from-violet-200 via-slate-100 to-sky-100">
                {photoUrl ? (
                    <img src={photoUrl} alt={`${barangay.name} photo`} className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-violet-300/80">
                        <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="mt-1.5 text-[10px] font-medium text-violet-400">No photo yet</p>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/5" />
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35"
                    aria-label="Close barangay details"
                >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <div className="absolute bottom-3 left-3.5 right-12">
                    <span className="inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/90 backdrop-blur-sm">
                        Barangay
                    </span>
                    <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-white drop-shadow-sm">{barangay.name}</h3>
                </div>
            </div>

            <div className="space-y-3 p-3.5">
                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-gradient-to-br from-sky-50 to-white px-3 py-2.5 ring-1 ring-sky-100">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-sky-500">Total Clients</p>
                        <p className="mt-1 text-lg font-bold tabular-nums leading-none text-gray-900">
                            {barangay.clients_count || 0}
                        </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-white px-3 py-2.5 ring-1 ring-emerald-100">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                            Home Svc Done
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums leading-none text-gray-900">
                            {barangay.home_services_completed_this_month || 0}
                        </p>
                        <p className="mt-1 text-[9px] font-medium text-emerald-600/80">This month</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                    </button>
                </div>
            </div>
        </div>
    );
}

// Diri ang main page sa mapa sa El Salvador City.
export default function ElsalvadorCityMap({
    barangays = [],
    barangayGeoJson = null,
    doorToDoorBookings: initialDoorToDoorBookings = [],
    mapPets = [],
    homeServiceTotal = 0,
}) {
    const { mapboxToken: sharedMapboxToken, flash, cloudinary } = usePage().props;
    const [doorToDoorBookings, setDoorToDoorBookings] = useState(
        (initialDoorToDoorBookings || []).filter(isVisibleDoorToDoorBooking)
    );
    const [viewedTick, setViewedTick] = useState(0);
    const [selectedDoorToDoorBooking, setSelectedDoorToDoorBooking] = useState(null);
    const [previewDoorToDoorBooking, setPreviewDoorToDoorBooking] = useState(null);
    const [pendingPreviewBookingId, setPendingPreviewBookingId] = useState(null);
    const previewDelayTimerRef = useRef(null);
    const [approvingBookingId, setApprovingBookingId] = useState(null);
    const [approveError, setApproveError] = useState('');
    const [fieldmen, setFieldmen] = useState([]);
    const [selectedFieldmanIds, setSelectedFieldmanIds] = useState([]);
    const [fieldmanDropdownOpen, setFieldmanDropdownOpen] = useState(false);
    const fieldmanDropdownRef = useRef(null);
    const [photoPreview, setPhotoPreview] = useState({ open: false, url: null, label: '' });
    const [petMedical, setPetMedical] = useState({
        loading: false,
        profile: null,
        history: [],
        lastService: null,
        historyCount: 0,
        petId: null,
    });
    const [doorToDoorDetailTab, setDoorToDoorDetailTab] = useState('history');
    const [showCancelForm, setShowCancelForm] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelError, setCancelError] = useState('');
    const [cancellingBookingId, setCancellingBookingId] = useState(null);

    // Keep the map in sync with the initial server-rendered list whenever Inertia
    // reloads this page's props (e.g. navigating back to it).
    useEffect(() => {
        setDoorToDoorBookings((initialDoorToDoorBookings || []).filter(isVisibleDoorToDoorBooking));
    }, [initialDoorToDoorBookings]);

    useEffect(() => {
        let cancelled = false;

        // Diri kuhaon ang listahan sa fieldmen.
        const loadFieldmen = async () => {
            try {
                const response = await axios.get('/api/admin/fieldmen');
                if (!cancelled && response.data?.success) {
                    setFieldmen(response.data.fieldmen || []);
                }
            } catch (error) {
                console.error('Failed to load fieldmen:', error);
            }
        };

        loadFieldmen();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedDoorToDoorBooking) {
            setSelectedFieldmanIds([]);
            setFieldmanDropdownOpen(false);
            return;
        }

        const ids = Array.isArray(selectedDoorToDoorBooking.assigned_fieldman_ids)
            ? selectedDoorToDoorBooking.assigned_fieldman_ids
            : (selectedDoorToDoorBooking.assigned_fieldmen || []).map((fieldman) => fieldman.id);

        setSelectedFieldmanIds(ids.map((id) => Number(id)).filter((id) => id > 0));
    }, [selectedDoorToDoorBooking?.id]);

    useEffect(() => {
        if (!fieldmanDropdownOpen) return undefined;

        // Diri sirado ang fieldman dropdown kung mo-click sa gawas.
        const handleClickOutside = (event) => {
            if (fieldmanDropdownRef.current && !fieldmanDropdownRef.current.contains(event.target)) {
                setFieldmanDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [fieldmanDropdownOpen]);

    // Keep the open detail panel in sync if the underlying booking changes
    // (e.g. a fieldman marks it ongoing/completed while the admin has it open).
    useEffect(() => {
        if (!selectedDoorToDoorBooking) return;
        const updated = doorToDoorBookings.find((item) => item.id === selectedDoorToDoorBooking.id);
        if (!updated) {
            setSelectedDoorToDoorBooking(null);
        } else {
            setSelectedDoorToDoorBooking(updated);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doorToDoorBookings]);

    useEffect(() => {
        if (!previewDoorToDoorBooking) return;
        const updated = doorToDoorBookings.find((item) => item.id === previewDoorToDoorBooking.id);
        if (!updated) {
            setPreviewDoorToDoorBooking(null);
        } else {
            setPreviewDoorToDoorBooking(updated);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doorToDoorBookings]);

    // Live-track Home Services: pending pins appear as soon as a client books;
    // fieldmen then move bookings through processing → ongoing → completed.
    useEffect(() => {
        const unsubscribe = subscribeToAppointments((event) => {
            const appointment = event?.appointment;
            if (!appointment || !isHomeServiceAppointment(appointment)) {
                return;
            }

            const hasCoordinates = appointment.meeting_latitude != null
                && appointment.meeting_longitude != null
                && Number.isFinite(Number(appointment.meeting_latitude))
                && Number.isFinite(Number(appointment.meeting_longitude));
            const status = appointment.status;
            const tracked = status === 'completed' && !appointment.completed_at
                ? { ...appointment, completed_at: new Date().toISOString() }
                : appointment;
            const shouldRemove = event.action === 'cancelled' || !isVisibleDoorToDoorBooking(tracked);

            setDoorToDoorBookings((prev) => {
                const existing = prev.find((booking) => booking.id === tracked.id);
                const withoutThis = prev.filter((booking) => booking.id !== tracked.id);

                if (shouldRemove) {
                    return withoutThis;
                }

                // Keep an existing pin if a live payload is missing coordinates
                // instead of wiping a pending booking off the map.
                if (!hasCoordinates) {
                    if (!existing) {
                        return prev;
                    }
                    return [
                        ...withoutThis,
                        {
                            ...existing,
                            status: tracked.status || existing.status,
                            completed_at: tracked.completed_at || existing.completed_at || null,
                        },
                    ];
                }

                return [...withoutThis, formatDoorToDoorBooking(tracked)];
            });
        });

        return unsubscribe;
    }, []);

    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const barangaysRef = useRef(barangays);
    const selectedBarangayRef = useRef('');
    const placedVisiblePetsRef = useRef([]);
    const enrichedBarangayGeoJsonRef = useRef(null);
    const editPhotoInputRef = useRef(null);
    const enrichedBarangayGeoJson = useMemo(
        () => enrichBarangayGeoJson(barangayGeoJson || { type: 'FeatureCollection', features: [] }, barangays),
        [barangayGeoJson, barangays]
    );
    enrichedBarangayGeoJsonRef.current = enrichedBarangayGeoJson;
    const skipInitialStyleChange = useRef(true);
    const [mapStyle, setMapStyle] = useState('streets');
    const [mapReady, setMapReady] = useState(false);
    const [selectedBarangay, setSelectedBarangay] = useRemember(
        typeof window !== 'undefined'
            ? (new URLSearchParams(window.location.search).get('barangay_id') || '')
            : '',
        'city-map-barangay'
    );
    const [coordinatesByBarangay, setCoordinatesByBarangay] = useState({});
    const [meetingPlaceLabels, setMeetingPlaceLabels] = useState({});
    const mapboxToken = sharedMapboxToken || import.meta.env.VITE_MAPBOX_TOKEN;
    const hasToken = Boolean(mapboxToken);

    // Notification toast for flash / edit feedback
    const [toast, setToast] = useState(null);

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingBarangay, setEditingBarangay] = useState(null);
    const [editPhotoUrl, setEditPhotoUrl] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editPhotoUploading, setEditPhotoUploading] = useState(false);
    const [editError, setEditError] = useState('');
    const [listOpen, setListOpen] = useRemember(
        (initialDoorToDoorBookings || []).some((booking) => booking?.status === 'pending'),
        'city-map-list-open'
    );
    const [mapView, setMapView] = useRemember('home_service', 'city-map-view');
    const [selectedPetId, setSelectedPetId] = useState(null);
    const [petCardPoint, setPetCardPoint] = useState(null);

    useEffect(() => {
        barangaysRef.current = barangays;
        enrichedBarangayGeoJsonRef.current = enrichedBarangayGeoJson;
    }, [barangays, enrichedBarangayGeoJson]);

    useEffect(() => {
        selectedBarangayRef.current = selectedBarangay;
        const map = mapRef.current;
        if (!map || !mapReady || !map.getLayer(BARANGAY_FILL_LAYER_ID)) return;
        applyBarangayLayerPaint(map, selectedBarangay);
    }, [selectedBarangay, mapReady]);

    // Diri ibutang ang boundaries sa barangay sa map.
    const mountBarangayBoundaries = (map) => {
        const geojson = enrichedBarangayGeoJsonRef.current;
        if (!geojson?.features?.length) return;
        rebuildBarangayLayers(map, geojson, selectedBarangayRef.current);
    };

    useEffect(() => {
        if (flash?.error) {
            setToast({ type: 'error', message: flash.error });
        }
        if (flash?.success) {
            setToast({ type: 'success', message: flash.success });
        }
    }, [flash?.error, flash?.success]);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(timer);
    }, [toast]);

    // Diri ablihan ang edit modal sa barangay.
    const openEditModal = (barangay) => {
        setEditingBarangay(barangay);
        setEditPhotoUrl(barangay.photo_url || '');
        setEditError('');
        setShowEditModal(true);
    };

    // Diri sirado ang edit modal sa barangay.
    const closeEditModal = () => {
        setShowEditModal(false);
        setEditingBarangay(null);
        setEditPhotoUrl('');
        setEditPhotoUploading(false);
        setEditError('');
    };

    // Diri i-upload ang napiling litrato sa barangay.
    const handlePhotoFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setEditError('Please choose an image file.');
            event.target.value = '';
            return;
        }

        setEditPhotoUploading(true);
        setEditError('');

        try {
            const uploadedUrl = await uploadImageToCloudinary(file, {
                cloudName: cloudinary?.cloudName,
                uploadPreset: cloudinary?.uploadPreset,
            });
            setEditPhotoUrl(uploadedUrl);
        } catch (error) {
            setEditError(error?.message || 'Failed to upload photo.');
        } finally {
            setEditPhotoUploading(false);
            event.target.value = '';
        }
    };

    // Diri i-save ang pag-edit sa barangay.
    const handleSaveBarangay = () => {
        if (!editingBarangay) return;

        setEditError('');
        router.post(
            `/admin/barangays/${editingBarangay.id}`,
            {
                photo_url: editPhotoUrl.trim(),
            },
            {
                preserveScroll: true,
                onStart: () => setEditSaving(true),
                onFinish: () => setEditSaving(false),
                onSuccess: () => {
                    closeEditModal();
                    router.reload({ only: ['barangays'], preserveScroll: true });
                },
                onError: (errors) => {
                    const first = errors ? Object.values(errors)[0] : null;
                    setEditError(first || 'Failed to save barangay details.');
                },
            }
        );
    };

    // Diri sirado ang detalye sa door-to-door booking.
    const closeDoorToDoorDetail = () => {
        setSelectedDoorToDoorBooking(null);
        setApproveError('');
        setPhotoPreview({ open: false, url: null, label: '' });
        setShowCancelForm(false);
        setCancelReason('');
        setCancelError('');
        setPetMedical({ loading: false, profile: null, history: [], lastService: null, historyCount: 0, petId: null });
    };

    // Diri sirado ang preview sa door-to-door booking.
    const closeDoorToDoorPreview = () => {
        if (previewDelayTimerRef.current) {
            window.clearTimeout(previewDelayTimerRef.current);
            previewDelayTimerRef.current = null;
        }
        setPendingPreviewBookingId(null);
        setPreviewDoorToDoorBooking(null);
    };

    // Diri ablihan ang preview sa litrato.
    const openPhotoPreview = (url, label) => {
        setPhotoPreview({ open: true, url, label });
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

    // Diri ablihan ang preview sa door-to-door booking.
    const openDoorToDoorPreview = (booking) => {
        if (!booking) return;
        if (booking.id && markBookingViewed(booking.id)) {
            setViewedTick((tick) => tick + 1);
        }
        if (previewDelayTimerRef.current) {
            window.clearTimeout(previewDelayTimerRef.current);
            previewDelayTimerRef.current = null;
        }
        setPendingPreviewBookingId(null);
        setSelectedDoorToDoorBooking(null);
        setShowCancelForm(false);
        setCancelReason('');
        setCancelError('');
        setApproveError('');
        setPreviewDoorToDoorBooking(booking);
    };

    // Diri i-schedule ang preview sa booking human sa delay.
    const scheduleDoorToDoorPreview = (booking, delayMs = HOME_SERVICE_PREVIEW_DELAY_MS) => {
        if (!booking) return;
        if (previewDelayTimerRef.current) {
            window.clearTimeout(previewDelayTimerRef.current);
        }
        setPendingPreviewBookingId(booking.id);
        previewDelayTimerRef.current = window.setTimeout(() => {
            previewDelayTimerRef.current = null;
            openDoorToDoorPreview(booking);
        }, delayMs);
    };

    // Diri i-focus ang map sa home service booking.
    const focusHomeServiceBooking = (booking, { openDetail = true } = {}) => {
        if (!booking) return;
        setMapView('home_service');
        setSelectedPetId(null);
        if (openDetail) {
            scheduleDoorToDoorPreview(booking);
        }

        const map = mapRef.current;
        const lat = Number(booking.meeting_latitude);
        const lng = Number(booking.meeting_longitude);
        if (!map || !mapReady || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

        // Keep the pin in the open map area (not under the right sidebar).
        map.flyTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 16.5),
            duration: 900,
            essential: true,
            padding: { top: 100, bottom: 120, left: 60, right: listOpen ? 400 : 60 },
        });
    };

    const focusMapPet = (pet) => {
        if (!pet) return;
        setSelectedPetId(pet.id);
        setListOpen(true);

        const map = mapRef.current;
        const placed = (placedVisiblePetsRef.current || []).find(
            (item) => String(item.id) === String(pet.id)
        );
        const lat = Number(placed?.latitude ?? pet.latitude);
        const lng = Number(placed?.longitude ?? pet.longitude);
        if (!map || !mapReady || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

        map.flyTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 16.5),
            duration: 900,
            essential: true,
            padding: { top: 100, bottom: 120, left: 60, right: listOpen ? 400 : 60 },
        });
    };

    const focusHomeServiceBookingRef = useRef(focusHomeServiceBooking);
    focusHomeServiceBookingRef.current = focusHomeServiceBooking;

    useEffect(() => () => {
        if (previewDelayTimerRef.current) {
            window.clearTimeout(previewDelayTimerRef.current);
        }
    }, []);

    // Diri ablihan ang detalye sa door-to-door booking.
    const openDoorToDoorDetail = (booking) => {
        if (!booking) return;
        if (booking.id && markBookingViewed(booking.id)) {
            setViewedTick((tick) => tick + 1);
        }
        if (previewDelayTimerRef.current) {
            window.clearTimeout(previewDelayTimerRef.current);
            previewDelayTimerRef.current = null;
        }
        setPendingPreviewBookingId(null);
        setPreviewDoorToDoorBooking(null);
        setSelectedDoorToDoorBooking(booking);
        setApproveError('');
        setShowCancelForm(false);
        setCancelReason('');
        setCancelError('');
        setDoorToDoorDetailTab('history');
        setFieldmanDropdownOpen(false);
        loadPetMedical(booking.pet?.id);
    };

    // Diri tangtangon ang deep link params sa URL.
    const clearNotificationDeepLink = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('booking');
        url.searchParams.delete('filter');
        const nextUrl = url.pathname + (url.search ? url.search : '');
        window.history.replaceState({}, '', nextUrl);
    };

    const notificationDeepLinkHandledRef = useRef(false);

    useEffect(() => {
        if (notificationDeepLinkHandledRef.current) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const bookingId = params.get('booking');
        const filterParam = params.get('filter');

        if (!bookingId && filterParam !== 'pending' && filterParam !== 'today') {
            return;
        }

        if (filterParam === 'pending' || filterParam === 'today') {
            setListOpen(true);
        }

        // Diri tapuson ang deep link gikan sa notification.
        const finishDeepLink = (booking = null) => {
            notificationDeepLinkHandledRef.current = true;
            setListOpen(true);

            if (booking) {
                if (mapReady) {
                    focusHomeServiceBookingRef.current(booking, { openDetail: true });
                } else {
                    openDoorToDoorDetail(booking);
                }
            }

            clearNotificationDeepLink();
        };

        if (bookingId) {
            const booking = doorToDoorBookings.find((item) => String(item.id) === String(bookingId));
            if (!booking) {
                return;
            }
            finishDeepLink(booking);
            return;
        }

        if (filterParam === 'pending') {
            const booking = doorToDoorBookings.find((item) => item.status === 'pending');
            finishDeepLink(booking ?? null);
            return;
        }

        if (filterParam === 'today') {
            const booking = doorToDoorBookings.find((item) => isBookingScheduledToday(item.date));
            finishDeepLink(booking ?? null);
        }
    }, [doorToDoorBookings, mapReady]);

    // Diri i-check kung pwede ma-approve ang door-to-door booking.
    const canApproveDoorToDoorBooking = (booking) => {
        const status = booking?.pet?.registration_status || booking?.pet_registration_status;
        return status === 'registered' || status === 'exempt';
    };

    // Diri i-toggle ang pagpili sa fieldman.
    const toggleSelectedFieldman = (fieldmanId) => {
        const id = Number(fieldmanId);
        setSelectedFieldmanIds((prev) => (
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        ));
        setApproveError('');
    };

    const selectedFieldmanLabel = useMemo(() => {
        if (selectedFieldmanIds.length === 0) {
            return 'Select fieldmen';
        }

        const names = fieldmen
            .filter((fieldman) => selectedFieldmanIds.includes(Number(fieldman.id)))
            .map((fieldman) => fieldman.name);

        if (names.length <= 2) {
            return names.join(', ');
        }

        return `${names.length} fieldmen selected`;
    }, [fieldmen, selectedFieldmanIds]);

    // Diri i-approve ang door-to-door booking.
    const handleApproveDoorToDoorBooking = async (booking) => {
        if (!booking) return;

        if (!canApproveDoorToDoorBooking(booking)) {
            setApproveError('Cannot approve — pet must be registered or exempt first.');
            return;
        }

        if (selectedFieldmanIds.length === 0) {
            setApproveError('Please assign at least one fieldman before approving this Home Service booking.');
            return;
        }

        setApproveError('');
        setApprovingBookingId(booking.id);
        try {
            const response = await axios.put(`/api/admin/appointments/${booking.id}/status`, {
                status: 'approved',
                assigned_fieldman_ids: selectedFieldmanIds,
            });

            if (response.data?.success) {
                const assignedFieldmen = fieldmen.filter((fieldman) =>
                    selectedFieldmanIds.includes(Number(fieldman.id))
                );
                const administeredBy = assignedFieldmen
                    .map((fieldman) => fieldman.name)
                    .filter(Boolean)
                    .join(', ') || booking.administered_by || null;
                const approvedAt = new Date().toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                });
                const approvalHistoryEntry = {
                    status: 'approved',
                    status_label: 'Approved',
                    changed_by: 'Data Manager',
                    action_label: 'Approved by Data Manager',
                    changed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    changed_at_formatted: approvedAt,
                    notes: null,
                };

                const patch = {
                    status: 'approved',
                    assigned_fieldman_ids: selectedFieldmanIds,
                    assigned_fieldmen: assignedFieldmen.map((fieldman) => ({
                        id: fieldman.id,
                        name: fieldman.name,
                        email: fieldman.email,
                    })),
                    administered_by: administeredBy,
                    status_history: [
                        ...(booking.status_history || []).filter((entry) => entry.status !== 'approved'),
                        approvalHistoryEntry,
                    ],
                };

                setDoorToDoorBookings((prev) =>
                    prev.map((item) => (item.id === booking.id ? { ...item, ...patch } : item))
                );
                setSelectedDoorToDoorBooking((prev) =>
                    prev && prev.id === booking.id ? { ...prev, ...patch } : prev
                );
                setToast({
                    type: 'success',
                    message: `Home Service booking for ${booking.pet_name || booking.pet?.name || 'the pet'} approved and assigned to ${assignedFieldmen.length} fieldman${assignedFieldmen.length === 1 ? '' : 'en'}.`,
                });
            } else {
                setApproveError(response.data?.error || 'Failed to approve booking.');
            }
        } catch (error) {
            setApproveError(
                error.response?.data?.error || error.response?.data?.message || 'Failed to approve booking.'
            );
        } finally {
            setApprovingBookingId(null);
        }
    };

    // Diri i-cancel ang door-to-door booking.
    const handleCancelDoorToDoorBooking = async (booking) => {
        if (!booking) return;
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
        setCancellingBookingId(booking.id);
        try {
            const response = await axios.patch(`/api/admin/appointments/${booking.id}/cancel`, {
                cancellation_reason: reason,
            });

            if (response.data?.success) {
                setDoorToDoorBookings((prev) => prev.filter((item) => item.id !== booking.id));
                closeDoorToDoorDetail();
                setToast({
                    type: 'success',
                    message: `Home Service booking for ${booking.pet_name || booking.pet?.name || 'the pet'} has been cancelled.`,
                });
            } else {
                setCancelError(response.data?.error || 'Failed to cancel booking.');
            }
        } catch (error) {
            setCancelError(
                error.response?.data?.errors?.cancellation_reason?.[0]
                || error.response?.data?.error
                || error.response?.data?.message
                || 'Failed to cancel booking.'
            );
        } finally {
            setCancellingBookingId(null);
        }
    };

    const geocodeTargets = useMemo(
        () => barangays.map((barangay) => ({ id: String(barangay.id), name: barangay.name })),
        [barangays]
    );

    const sortedHomeServiceBookings = useMemo(() => {
        const selectedName = barangays.find((barangay) => String(barangay.id) === String(selectedBarangay))?.name;
        return sortAdminAppointmentsNewestFirst(
            (doorToDoorBookings || []).filter((booking) => (
                isVisibleDoorToDoorBooking(booking)
                && bookingMatchesSelectedBarangay(booking, selectedBarangay, selectedName, enrichedBarangayGeoJson)
            ))
        );
    }, [doorToDoorBookings, selectedBarangay, barangays, enrichedBarangayGeoJson]);

    const pendingHomeServiceCount = useMemo(
        () => (doorToDoorBookings || []).filter((booking) => booking.status === 'pending').length,
        [doorToDoorBookings]
    );
    const selectedBarangayName = useMemo(
        () => barangays.find((barangay) => String(barangay.id) === String(selectedBarangay))?.name || '',
        [barangays, selectedBarangay]
    );
    const barangayMapPets = useMemo(
        () => (mapPets || []).filter((pet) => petMatchesSelectedBarangay(
            pet,
            selectedBarangay,
            selectedBarangayName,
            enrichedBarangayGeoJson
        )),
        [mapPets, selectedBarangay, selectedBarangayName, enrichedBarangayGeoJson]
    );
    const vaccinatedPetCount = useMemo(
        () => barangayMapPets.filter((pet) => pet.vaccinated).length,
        [barangayMapPets]
    );
    const unvaccinatedPetCount = useMemo(
        () => barangayMapPets.filter((pet) => !pet.vaccinated).length,
        [barangayMapPets]
    );
    const visibleMapPets = useMemo(() => {
        if (mapView === 'home_service') return [];
        return barangayMapPets
            .filter((pet) => {
                if (mapView === 'all_pets') return true;
                return Boolean(pet.vaccinated) === (mapView === 'vaccinated');
            })
            .slice()
            .sort((a, b) => String(a.pet_name || '').localeCompare(String(b.pet_name || '')));
    }, [barangayMapPets, mapView]);
    const placedVisiblePets = useMemo(() => {
        if (mapView === 'home_service') return [];
        const pins = (mapPets || []).filter((pet) => {
            const inSelected = !selectedBarangay || petMatchesSelectedBarangay(
                pet,
                selectedBarangay,
                selectedBarangayName,
                enrichedBarangayGeoJson
            );
            if (selectedBarangay && !inSelected) return true;
            if (mapView === 'all_pets') return true;
            return Boolean(pet.vaccinated) === (mapView === 'vaccinated');
        });
        return spreadPetMapCoordinates(pins);
    }, [mapPets, mapView, selectedBarangay, selectedBarangayName, enrichedBarangayGeoJson]);
    placedVisiblePetsRef.current = placedVisiblePets;
    const selectedMapPet = useMemo(
        () => (mapPets || []).find((pet) => String(pet.id) === String(selectedPetId)) || null,
        [mapPets, selectedPetId]
    );

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !selectedMapPet || mapView === 'home_service') {
            setPetCardPoint(null);
            return;
        }

        const placed = placedVisiblePets.find(
            (pet) => String(pet.id) === String(selectedMapPet.id)
        );
        const lng = Number(placed?.longitude ?? selectedMapPet.longitude);
        const lat = Number(placed?.latitude ?? selectedMapPet.latitude);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            setPetCardPoint(null);
            return;
        }

        const update = () => {
            const currentMap = mapRef.current;
            const container = mapContainerRef.current;
            if (!currentMap || !container) return;
            const point = currentMap.project([lng, lat]);
            const width = container.clientWidth;
            const cardWidth = Math.min(width - 16, 320);
            const x = Math.min(Math.max(point.x, cardWidth / 2 + 8), width - cardWidth / 2 - 8);
            setPetCardPoint({
                x,
                y: point.y,
                below: point.y < 230,
            });
        };

        update();
        map.on('move', update);
        map.on('resize', update);
        return () => {
            map.off('move', update);
            map.off('resize', update);
        };
    }, [selectedMapPet, mapPets, mapReady, mapView, placedVisiblePets]);

    useEffect(() => {
        if (!selectedPetId || mapView === 'home_service') return;
        document.getElementById(`map-pet-${selectedPetId}`)?.scrollIntoView({ block: 'nearest' });
    }, [selectedPetId, mapView]);

    useEffect(() => {
        if (!hasToken || !mapboxToken) return;

        const cacheKey = 'elsalvador-meeting-place-labels-v1';
        let cached = {};
        try {
            cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        } catch {
            cached = {};
        }

        const targets = [];
        const seen = new Set();
        (doorToDoorBookings || []).forEach((booking) => {
            const coords = getMeetingPlaceCoords(booking);
            if (!coords) return;
            const key = getMeetingPlaceCoordKey(coords.lat, coords.lng);
            if (!key || seen.has(key) || cached[key]) return;
            seen.add(key);
            targets.push({ key, ...coords });
        });

        if (Object.keys(cached).length > 0) {
            setMeetingPlaceLabels((prev) => ({ ...cached, ...prev }));
        }

        if (targets.length === 0) return;

        let cancelled = false;
        // Diri kuhaon ang mga ngalan sa meeting place.
        const resolveLabels = async () => {
            const next = { ...cached };
            for (const target of targets) {
                try {
                    const label = await reverseGeocodeMeetingPlace(target.lng, target.lat, mapboxToken);
                    if (label) {
                        next[target.key] = label;
                    }
                } catch (error) {
                    console.error('Meeting place reverse geocode failed', error);
                }
            }

            if (cancelled) return;

            setMeetingPlaceLabels((prev) => ({ ...prev, ...next }));
            try {
                localStorage.setItem(cacheKey, JSON.stringify(next));
            } catch {
                // Ignore storage write issues.
            }
        };

        resolveLabels();

        return () => {
            cancelled = true;
        };
    }, [doorToDoorBookings, hasToken, mapboxToken]);

    const selectedBarangayData = useMemo(
        () => barangays.find((barangay) => String(barangay.id) === String(selectedBarangay)),
        [barangays, selectedBarangay]
    );

    const locatedCount = useMemo(
        () => geocodeTargets.filter((barangay) => coordinatesByBarangay[barangay.id]).length,
        [geocodeTargets, coordinatesByBarangay]
    );

    useEffect(() => {
        if (!hasToken || !mapContainerRef.current || mapRef.current) return;

        let cancelled = false;
        let resizeObserver;

        // Diri i-setup ang Mapbox nga map.
        const initMap = () => {
            if (cancelled || !mapContainerRef.current || mapRef.current) return;

            mapboxgl.accessToken = mapboxToken;
            const map = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: MAP_STYLES.streets.style,
                center: ELSALVADOR_CITY_CENTER,
                zoom: 14.5,
                minZoom: 10.5,
                maxZoom: 19,
                pixelRatio: Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
                maxBounds: ELSALVADOR_CITY_BOUNDS,
                // Reduce Mapbox telemetry noise in Edge Tracking Prevention.
                performanceMetricsCollection: false,
            });

            mapRef.current = map;

            // Diri himuon pointer ang cursor sa polygon.
            const handlePolygonMouseEnter = () => {
                map.getCanvas().style.cursor = 'pointer';
            };

            // Diri ibalik ang cursor paggawas sa polygon.
            const handlePolygonMouseLeave = () => {
                map.getCanvas().style.cursor = '';
            };

            // Diri pilion ang barangay nga gi-click sa map.
            const handlePolygonClick = (event) => {
                const barangayId = event.features?.[0]?.properties?.barangay_id;
                if (!barangayId) return;
                setSelectedBarangay(String(barangayId));
                setListOpen(true);
            };

            map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
            map.addControl(new mapboxgl.FullscreenControl(), 'bottom-right');

            map.on('load', () => {
                map.resize();
                map.fitBounds(ELSALVADOR_CITY_BOUNDS, {
                    padding: { top: 80, bottom: 80, left: 40, right: 40 },
                    duration: 0,
                });
                mountBarangayBoundaries(map);
                // Wait for idle so HTML markers can attach on first paint.
                let ready = false;
                // Diri i-mark nga ready na ang map.
                const markReady = () => {
                    if (cancelled || ready) return;
                    ready = true;
                    setMapReady(true);
                };
                map.once('idle', markReady);
                window.setTimeout(markReady, 300);
            });

            map.on('style.load', () => {
                mountBarangayBoundaries(map);
            });

            map.on('mouseenter', BARANGAY_FILL_LAYER_ID, handlePolygonMouseEnter);
            map.on('mouseleave', BARANGAY_FILL_LAYER_ID, handlePolygonMouseLeave);
            map.on('click', BARANGAY_FILL_LAYER_ID, handlePolygonClick);

            map.on('error', (event) => {
                console.error('Mapbox error:', event?.error || event);
            });

            resizeObserver = new ResizeObserver(() => {
                map.resize();
            });
            resizeObserver.observe(mapContainerRef.current);
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(initMap);
        });

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            setMapReady(false);
            skipInitialStyleChange.current = true;
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, [hasToken, mapboxToken]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        if (skipInitialStyleChange.current) {
            skipInitialStyleChange.current = false;
            return;
        }

        // setStyle destroys/breaks existing HTML markers — clear them first so the
        // marker effect can re-attach cleanly after style.load + idle.
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];
        map.setStyle(MAP_STYLES[mapStyle].style);
    }, [mapStyle, mapReady]);

    useEffect(() => {
        const next = coordinatesFromBarangayGeoJson(enrichedBarangayGeoJson);
        setCoordinatesByBarangay(next);
        // Drop the old Mapbox geocode cache (it put Quibonbon on Poblacion).
        try {
            localStorage.removeItem('elsalvador-barangay-coordinates-v1');
        } catch {
            // Ignore storage issues.
        }
    }, [enrichedBarangayGeoJson]);

    // Keep latest marker inputs in refs so style.load/idle handlers never paint stale data.
    const doorToDoorBookingsRef = useRef(doorToDoorBookings);
    const meetingPlaceLabelsRef = useRef(meetingPlaceLabels);
    const geocodeTargetsRef = useRef(geocodeTargets);
    const coordinatesByBarangayRef = useRef(coordinatesByBarangay);
    const selectedBarangayRefForMarkers = useRef(selectedBarangay);
    const mapViewRef = useRef(mapView);
    const mapPetsRef = useRef(mapPets);
    doorToDoorBookingsRef.current = doorToDoorBookings;
    meetingPlaceLabelsRef.current = meetingPlaceLabels;
    geocodeTargetsRef.current = geocodeTargets;
    coordinatesByBarangayRef.current = coordinatesByBarangay;
    selectedBarangayRefForMarkers.current = selectedBarangay;
    mapViewRef.current = mapView;
    mapPetsRef.current = mapPets;

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        let cancelled = false;
        let idleToken = 0;

        // Diri i-drawing ang mga marker sa map.
        const renderMarkers = () => {
            if (cancelled || !mapRef.current) return;
            if (!map.isStyleLoaded()) return;

            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];

            const currentGeocodeTargets = geocodeTargetsRef.current || [];
            const currentCoordinates = coordinatesByBarangayRef.current || {};
            const currentSelected = selectedBarangayRefForMarkers.current;
            const currentHomeServices = doorToDoorBookingsRef.current || [];

            currentGeocodeTargets.forEach((barangay) => {
                const coords = currentCoordinates[barangay.id];
                if (!coords) return;

                const isActive = String(barangay.id) === String(currentSelected);
                const barangayData = barangaysRef.current.find((item) => String(item.id) === String(barangay.id));

                const wrapper = createBarangayLocationPin({
                    isActive,
                    onClick: () => {
                        setSelectedBarangay(String(barangay.id));
                        setListOpen(true);
                    },
                });

                const clientsCount = barangayData?.clients_count || 0;
                const completedThisMonth = barangayData?.home_services_completed_this_month || 0;
                const popupHtml = `
                    <div style="font-size:12px;line-height:1.4;padding:2px 0">
                        <div style="font-weight:700;color:#111827;font-size:13px">${barangay.name}</div>
                        <div style="color:#6b7280;margin-top:4px;font-size:11px">${clientsCount} client(s)</div>
                        <div style="color:#6b7280;margin-top:2px;font-size:11px">${completedThisMonth} home service(s) done this month</div>
                    </div>
                `;

                const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
                    .setLngLat(coords)
                    .setPopup(
                        new mapboxgl.Popup({
                            offset: 18,
                            closeButton: false,
                            className: 'elsalvador-map-popup',
                        }).setHTML(popupHtml)
                    )
                    .addTo(map);

                markersRef.current.push(marker);
            });

            if (mapViewRef.current === 'home_service') {
            currentHomeServices.forEach((booking) => {
                const lat = Number(booking.meeting_latitude);
                const lng = Number(booking.meeting_longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;

                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'center';
                wrapper.style.cursor = 'pointer';
                wrapper.style.zIndex = '5';

                const isPending = booking.status === 'pending';
                const isToday = isBookingScheduledToday(booking.date);
                const pinStyle = getHomeServicePinStyle(booking);
                const statusStyle = DOOR_TO_DOOR_STATUS_STYLES[booking.status] || DOOR_TO_DOOR_STATUS_STYLES.approved;
                const markerLabel = buildHomeServiceMarkerLabel(booking);
                const label = document.createElement('div');
                label.textContent = isToday ? `TODAY · ${markerLabel}` : markerLabel;
                label.style.fontSize = '10px';
                label.style.fontWeight = '800';
                label.style.letterSpacing = '0.02em';
                label.style.lineHeight = '1.2';
                label.style.color = isToday ? TODAY_PIN_STYLE.badgeColor : (isPending ? '#1e3a8a' : '#065f46');
                label.style.background = isToday ? TODAY_PIN_STYLE.badgeBackground : (isPending ? '#eff6ff' : '#ecfdf5');
                label.style.padding = '2px 6px';
                label.style.borderRadius = '6px';
                label.style.whiteSpace = 'nowrap';
                label.style.boxShadow = '0 1px 4px rgba(15, 23, 42, 0.22)';
                label.style.border = isToday
                    ? `1px solid ${TODAY_PIN_STYLE.badgeBorder}`
                    : (isPending ? '1px solid #bfdbfe' : '1px solid #a7f3d0');
                label.style.marginBottom = '4px';
                label.style.pointerEvents = 'none';
                wrapper.appendChild(label);

                const markerElement = document.createElement('button');
                markerElement.type = 'button';
                const pinSize = (isPending || isToday) ? 22 : 18;
                markerElement.style.width = `${pinSize}px`;
                markerElement.style.height = `${pinSize}px`;
                markerElement.style.borderRadius = '9999px';
                markerElement.style.border = '2.5px solid #ffffff';
                markerElement.style.background = pinStyle.gradient;
                markerElement.style.boxShadow = pinStyle.glow;
                markerElement.style.cursor = 'pointer';
                markerElement.style.padding = '0';
                if (isToday) {
                    markerElement.style.animation = 'elsalvador-today-pulse 1.6s ease-in-out infinite';
                } else if (isPending) {
                    markerElement.style.animation = 'elsalvador-pending-pulse 1.6s ease-in-out infinite';
                }
                markerElement.addEventListener('click', (event) => {
                    event.stopPropagation();
                    focusHomeServiceBookingRef.current(booking);
                });
                wrapper.appendChild(markerElement);

                const servicesLabel = (booking.services || []).join(', ') || 'Home Services visit';
                const meetingPlaceLabel = getBookedMeetingPlaceLabel(
                    booking,
                    meetingPlaceLabelsRef.current
                );
                const ownerLocationLabel = formatClientLocation(booking.client_barangay, booking.client_zone);
                const scheduleLabel = [formatBookingDate(booking.date), formatBookingTime(booking.time)]
                    .filter((value) => value && value !== '—')
                    .join(' · ');
                const headerColor = isToday ? TODAY_PIN_STYLE.badgeColor : (isPending ? '#1e3a8a' : '#065f46');
                const headerText = isToday
                    ? 'TODAY · MEETING PLACE'
                    : (isPending ? 'PENDING APPROVAL · MEETING PLACE' : 'MEETING PLACE');
                const popupHtml = `
                    <div style="font-size:12px;line-height:1.45;padding:2px 0">
                        <div style="font-weight:800;color:${headerColor};font-size:11px;letter-spacing:0.04em">${headerText}</div>
                        <div style="font-weight:700;color:#111827;font-size:13px;margin-top:4px">${booking.client_name || 'Client'}</div>
                        ${meetingPlaceLabel ? `<div style="color:#047857;margin-top:2px;font-size:11px;font-weight:600">Booked place: ${meetingPlaceLabel}</div>` : ''}
                        ${ownerLocationLabel ? `<div style="color:#9ca3af;margin-top:2px;font-size:10px">Owner address: ${ownerLocationLabel}</div>` : ''}
                        <div style="color:#374151;margin-top:2px">${booking.pet_name || 'Pet'} · ${servicesLabel}</div>
                        ${scheduleLabel ? `<div style="color:#6b7280;margin-top:4px;font-size:11px">Schedule: ${scheduleLabel}</div>` : ''}
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                            ${isToday ? `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;color:${TODAY_PIN_STYLE.badgeColor};background:${TODAY_PIN_STYLE.badgeBackground};border:1px solid ${TODAY_PIN_STYLE.badgeBorder}">Today</span>` : ''}
                            <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;color:${statusStyle.badgeColor};background:${statusStyle.badgeBackground};border:1px solid ${statusStyle.badgeBorder}">${statusStyle.label}</span>
                        </div>
                        <div style="color:#2563eb;margin-top:6px;font-size:11px;font-weight:600">Click pin for full details</div>
                    </div>
                `;

                const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
                    .setLngLat([lng, lat])
                    .setPopup(
                        new mapboxgl.Popup({
                            offset: 14,
                            closeButton: false,
                            className: 'elsalvador-map-popup',
                        }).setHTML(popupHtml)
                    )
                    .addTo(map);

                markersRef.current.push(marker);
            });
            } else {
            const visiblePets = placedVisiblePetsRef.current || [];

            visiblePets.forEach((pet) => {
                const vaccinated = Boolean(pet.vaccinated);
                const isChosen = String(pet.id) === String(selectedPetId);
                const color = vaccinated ? '#047857' : '#d97706';
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'center';
                wrapper.style.cursor = 'pointer';

                const label = document.createElement('div');
                label.style.display = 'flex';
                label.style.flexDirection = 'column';
                label.style.alignItems = 'center';
                label.style.gap = '1px';
                label.style.background = '#ffffff';
                label.style.padding = '2px 6px';
                label.style.borderRadius = '6px';
                label.style.boxShadow = '0 1px 4px rgba(15, 23, 42, 0.22)';
                label.style.border = isChosen
                    ? '2px solid #111827'
                    : `1px solid ${vaccinated ? '#a7f3d0' : '#fde68a'}`;
                label.style.marginBottom = '4px';
                label.style.pointerEvents = 'none';

                const nameLine = document.createElement('div');
                nameLine.textContent = pet.pet_name || 'Pet';
                nameLine.style.fontSize = '10px';
                nameLine.style.fontWeight = '800';
                nameLine.style.lineHeight = '1.2';
                nameLine.style.color = color;
                nameLine.style.whiteSpace = 'nowrap';
                label.appendChild(nameLine);

                const statusLine = document.createElement('div');
                statusLine.textContent = petStatusLabel(pet);
                statusLine.style.fontSize = '9px';
                statusLine.style.fontWeight = '700';
                statusLine.style.lineHeight = '1.2';
                statusLine.style.color = color;
                statusLine.style.whiteSpace = 'nowrap';
                label.appendChild(statusLine);
                wrapper.appendChild(label);

                const markerElement = document.createElement('div');
                markerElement.style.width = isChosen ? '22px' : '16px';
                markerElement.style.height = isChosen ? '22px' : '16px';
                markerElement.style.borderRadius = '9999px';
                markerElement.style.border = isChosen ? '3px solid #111827' : '2.5px solid #ffffff';
                markerElement.style.background = color;
                markerElement.style.boxShadow = isChosen
                    ? '0 0 0 6px rgba(17, 24, 39, 0.18), 0 2px 8px rgba(15, 23, 42, 0.28)'
                    : '0 2px 8px rgba(15, 23, 42, 0.28)';
                wrapper.appendChild(markerElement);
                wrapper.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setSelectedPetId(pet.id);
                });

                const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
                    .setLngLat([Number(pet.longitude), Number(pet.latitude)])
                    .addTo(map);

                markersRef.current.push(marker);
            });
            }

            try {
                map.triggerRepaint();
            } catch {
                // Older mapbox builds may not expose triggerRepaint.
            }
        };

        // Diri i-schedule ang pag-drawing sa mga marker.
        const scheduleRender = () => {
            const token = ++idleToken;
            // Paint once now (covers already-idle maps), then again on the next
            // idle so pins survive fitBounds/resize/style swaps.
            renderMarkers();
            map.once('idle', () => {
                if (cancelled || token !== idleToken) return;
                renderMarkers();
            });
        };

        // Diri i-render balik ang markers human ma-load ang style.
        const onStyleLoad = () => {
            // After Satellite↔Streets (or any setStyle), wait for idle then re-pin.
            scheduleRender();
        };

        scheduleRender();
        map.on('style.load', onStyleLoad);

        return () => {
            cancelled = true;
            idleToken += 1;
            map.off('style.load', onStyleLoad);
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
        };
    }, [coordinatesByBarangay, geocodeTargets, selectedBarangay, mapReady, doorToDoorBookings, meetingPlaceLabels, mapView, mapPets, selectedPetId, placedVisiblePets]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !selectedBarangay) return;

        const feature = (enrichedBarangayGeoJson?.features || []).find(
            (item) => String(item?.properties?.barangay_id) === String(selectedBarangay)
        );
        const bounds = boundsFromFeature(feature);
        if (bounds) {
            map.fitBounds(bounds, {
                padding: { top: 90, bottom: 90, left: 70, right: 70 },
                duration: 1000,
                maxZoom: 16,
            });
            return;
        }

        const coords = coordinatesByBarangay[selectedBarangay];
        if (!coords) return;

        map.flyTo({
            center: coords,
            zoom: 15,
            duration: 1000,
            essential: true,
        });
    }, [selectedBarangay, coordinatesByBarangay, enrichedBarangayGeoJson, mapReady]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        mountBarangayBoundaries(map);
    }, [enrichedBarangayGeoJson, mapReady]);

    // Diri i-reset ang view sa map.
    const handleResetView = () => {
        closeDoorToDoorPreview();
        setSelectedDoorToDoorBooking(null);
        setSelectedPetId(null);
        setSelectedBarangay('');
        setShowEditModal(false);
        setEditingBarangay(null);
        setListOpen(true);

        const map = mapRef.current;
        if (!map || !mapReady) return;

        markersRef.current.forEach((marker) => {
            const popup = marker.getPopup();
            if (popup?.isOpen()) {
                popup.remove();
            }
        });

        window.setTimeout(() => {
            map.resize();
            map.fitBounds(ELSALVADOR_CITY_BOUNDS, {
                padding: { top: 80, bottom: 80, left: 40, right: 40 },
                duration: 1000,
            });
        }, 120);
    };

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar />

            <div className="relative staff-main flex min-h-screen min-w-0 flex-1 flex-col">
                {toast && (
                    <div className="pointer-events-none fixed right-4 top-4 z-[80] max-w-sm">
                        <div className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${
                            toast.type === 'success'
                                ? 'border-emerald-200/80 bg-emerald-50/95 text-emerald-800'
                                : 'border-red-200/80 bg-red-50/95 text-red-800'
                        }`}>
                            <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {toast.type === 'success'
                                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86l-7.4 12.84A2 2 0 004.53 20h14.94a2 2 0 001.64-2.9l-7.4-12.84a2 2 0 00-3.42 0z" />
                                }
                            </svg>
                            <p className="text-sm font-medium">{toast.message}</p>
                            <button type="button" onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {!hasToken ? (
                    <div className="flex flex-1 items-center justify-center p-6">
                        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                            <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86l-7.4 12.84A2 2 0 004.53 20h14.94a2 2 0 001.64-2.9l-7.4-12.84a2 2 0 00-3.42 0z" />
                                    </svg>
                                </div>
                                <h2 className="font-semibold text-amber-900">Map unavailable</h2>
                            </div>
                            <div className="px-5 py-4">
                                <p className="text-sm text-gray-600">
                                    Add <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">VITE_MAPBOX_TOKEN</code> in{' '}
                                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">vetweb/.env</code>, then refresh the page.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={`relative min-h-0 flex-1 bg-slate-200 ${listOpen ? 'elsalvador-map-list-open' : ''}`}>
                        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

                        {!mapReady && (
                            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-gray-100">
                                <div className="text-center">
                                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                    <p className="mt-3 text-sm font-medium text-gray-600">Loading map…</p>
                                </div>
                            </div>
                        )}

                        {/* Floating UI overlays — panels only (no full-screen cover over Mapbox markers) */}
                        <style>{`
                            @keyframes map-panel-in {
                                from { opacity: 0; transform: translateY(8px) scale(0.98); }
                                to { opacity: 1; transform: translateY(0) scale(1); }
                            }
                            .mapboxgl-ctrl-bottom-left { margin: 0 0 12px 12px !important; }
                            .mapboxgl-ctrl-bottom-right { margin: 0 12px 12px 0 !important; }
                            .elsalvador-map-list-open .mapboxgl-ctrl-bottom-right {
                                margin-right: calc(min(100% - 1.5rem, 352px) + 1.5rem) !important;
                            }
                            .mapboxgl-ctrl-group { border-radius: 14px !important; overflow: hidden; box-shadow: 0 8px 24px rgba(15,23,42,0.12) !important; border: 1px solid rgba(255,255,255,0.7) !important; }
                            /* Keep meeting-place pins above the basemap and easy to see/click */
                            .mapboxgl-marker {
                                z-index: 3 !important;
                            }
                            .mapboxgl-popup {
                                z-index: 4 !important;
                            }
                            .elsalvador-map-legend {
                                z-index: 30;
                            }
                        `}</style>

                            {/* Top-left: title + stats */}
                            <div className="pointer-events-auto absolute left-3 top-3 z-20 flex max-w-[min(100%-1.5rem,380px)] flex-col gap-2 lg:left-4 lg:top-4">
                                <div className={`${PANEL} overflow-hidden`}>
                                    <div className="flex items-center gap-3 px-3.5 py-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">City Map</p>
                                            <h1 className="truncate text-[15px] font-bold leading-tight text-gray-900">
                                                {selectedBarangayData?.name || 'El Salvador City'}
                                            </h1>
                                            <p className="mt-0.5 truncate text-[11px] text-gray-400">
                                                {selectedBarangayData
                                                    ? 'Focused barangay view'
                                                    : 'Click a pin on the map to view info'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 border-t border-gray-100/90 bg-gray-50/60">
                                        <StatPill label="Barangays" value={barangays.length} accent="violet" />
                                        <StatPill label="Located" value={`${locatedCount}/${barangays.length}`} accent="sky" />
                                        <StatPill
                                            label={mapView === 'home_service' ? 'Home Svc' : 'Vaccinated'}
                                            value={mapView === 'home_service' ? homeServiceTotal : vaccinatedPetCount}
                                            accent="emerald"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Top-right controls */}
                            <div className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-2 lg:right-4 lg:top-4">
                                    <div className={`${PANEL} inline-flex p-1`} role="group" aria-label="Map view">
                                        <MapSwitchButton
                                            active={mapView === 'home_service'}
                                            onClick={() => {
                                                setMapView('home_service');
                                                setSelectedPetId(null);
                                            }}
                                        >
                                            <span className={`h-1.5 w-1.5 rounded-full ${mapView === 'home_service' ? 'bg-white' : 'bg-emerald-500'}`} />
                                            Home service
                                        </MapSwitchButton>
                                        <MapSwitchButton
                                            active={mapView !== 'home_service'}
                                        onClick={() => {
                                            if (mapView === 'home_service') setMapView('all_pets');
                                            setListOpen(true);
                                        }}
                                        >
                                            <span className={`h-1.5 w-1.5 rounded-full ${mapView !== 'home_service' ? 'bg-white' : 'bg-amber-500'}`} />
                                            Pets
                                        </MapSwitchButton>
                                    </div>
                                <button
                                    type="button"
                                    onClick={handleResetView}
                                    className={`${PANEL} inline-flex h-10 items-center gap-1.5 px-3 text-xs font-semibold text-gray-700 transition hover:bg-white hover:text-violet-700`}
                                    title="Reset to full city view"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Reset
                                </button>
                                <div className={`${PANEL} inline-flex h-10 items-center p-1`}>
                                    {Object.entries(MAP_STYLES).map(([key, value]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setMapStyle(key)}
                                            className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                                                mapStyle === key
                                                    ? 'bg-navy text-white shadow-sm'
                                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                            }`}
                                        >
                                            {value.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setListOpen((open) => !open)}
                                    className={`${PANEL} relative inline-flex h-10 w-10 items-center justify-center text-gray-700 transition hover:bg-white`}
                                    aria-label={listOpen ? 'Hide side panel' : 'Show side panel'}
                                    title={listOpen ? 'Hide panel' : 'Show panel'}
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {listOpen ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                        )}
                                    </svg>
                                    {pendingHomeServiceCount > 0 && mapView === 'home_service' && (
                                        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-white">
                                            {pendingHomeServiceCount > 99 ? '99+' : pendingHomeServiceCount}
                                        </span>
                                    )}
                                </button>
                            </div>

                            {listOpen && (
                                <aside className="pointer-events-auto absolute bottom-3 right-3 top-[4.5rem] z-20 flex w-[min(100%-1.5rem,352px)] flex-col gap-3 lg:bottom-4 lg:right-4 lg:top-[5rem]">
                                    <div className="shrink-0">
                                        {selectedBarangayData ? (
                                            <BarangayInfoCard
                                                barangay={selectedBarangayData}
                                                onClose={() => setSelectedBarangay('')}
                                                onEdit={() => openEditModal(selectedBarangayData)}
                                            />
                                        ) : (
                                            <BarangayInfoPlaceholder />
                                        )}
                                    </div>

                                    {mapView === 'home_service' ? (
                                    <div className={`${PANEL} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                                        <div className="shrink-0 border-b border-gray-100/90 px-3.5 py-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-900">Home Services</h3>
                                                    <p className="text-[11px] text-gray-400">
                                                        {selectedBarangayData
                                                            ? `${sortedHomeServiceBookings.length} in ${selectedBarangayData.name}`
                                                            : pendingHomeServiceCount > 0
                                                                ? `${pendingHomeServiceCount} pending approval`
                                                                : `${sortedHomeServiceBookings.length} on map`}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {pendingHomeServiceCount > 0 && (
                                                        <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                                                            {pendingHomeServiceCount}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const query = selectedBarangay
                                                                ? { barangay_id: selectedBarangay }
                                                                : {};
                                                            router.get('/admin/elsalvador-city-map/home-service-history', query);
                                                        }}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 transition hover:bg-violet-100"
                                                        title={selectedBarangayData
                                                            ? `Home Service history in ${selectedBarangayData.name}`
                                                            : 'Home Service history for all barangays'}
                                                    >
                                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        History
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                                            {sortedHomeServiceBookings.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-6 text-center">
                                                    <p className="text-xs font-medium text-gray-500">
                                                        {selectedBarangayData
                                                            ? `No Home Service pins in ${selectedBarangayData.name}`
                                                            : 'No Home Service pins yet'}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-gray-400">
                                                        {selectedBarangayData
                                                            ? 'Visits whose meeting place is in this barangay appear here.'
                                                            : 'Pending bookings with a meeting place appear here.'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <ul className="space-y-1.5">
                                                    {sortedHomeServiceBookings.map((booking) => {
                                                        const isToday = isBookingScheduledToday(booking.date);
                                                        const statusStyle = DOOR_TO_DOOR_STATUS_STYLES[booking.status]
                                                            || DOOR_TO_DOOR_STATUS_STYLES.approved;
                                                        const meetingPlaceLabel = getBookedMeetingPlaceLabel(
                                                            booking,
                                                            meetingPlaceLabels
                                                        );
                                                        const scheduleLabel = [
                                                            formatBookingDate(booking.date),
                                                            formatBookingTime(booking.time),
                                                        ]
                                                            .filter((value) => value && value !== '—')
                                                            .join(' · ');
                                                        const isActive = selectedDoorToDoorBooking?.id === booking.id
                                                            || previewDoorToDoorBooking?.id === booking.id
                                                            || pendingPreviewBookingId === booking.id;
                                                        const isNew = shouldShowNewBookingBadge(booking) && viewedTick >= 0;
                                                        return (
                                                            <li key={booking.id}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => focusHomeServiceBooking(booking)}
                                                                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                                                                        isActive
                                                                            ? (isToday
                                                                                ? 'border-rose-300 bg-rose-50 shadow-sm'
                                                                                : 'border-blue-300 bg-blue-50 shadow-sm')
                                                                            : (isToday
                                                                                ? 'border-rose-200 bg-rose-50/70 hover:border-rose-300 hover:bg-rose-50'
                                                                                : isNew
                                                                                    ? 'border-rose-200 bg-rose-50/50 hover:border-rose-300 hover:bg-rose-50'
                                                                                    : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/40')
                                                                    }`}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="min-w-0">
                                                                            <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-semibold text-gray-900">
                                                                                <span className="truncate">{booking.pet_name || 'Pet'}</span>
                                                                                {isNew ? (
                                                                                    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                                                                                        New
                                                                                    </span>
                                                                                ) : null}
                                                                            </p>
                                                                            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                                                                                <span className="truncate">{booking.client_name || 'Client'}</span>
                                                                                <OwnerApprovalBadge user={booking.user} />
                                                                            </p>
                                                                            {meetingPlaceLabel && (
                                                                                <p
                                                                                    className="mt-0.5 truncate text-[11px] font-medium text-emerald-700"
                                                                                    title={meetingPlaceLabel}
                                                                                >
                                                                                    {meetingPlaceLabel}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                                                            {isToday && (
                                                                                <span
                                                                                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                                                                    style={{
                                                                                        color: TODAY_PIN_STYLE.badgeColor,
                                                                                        background: TODAY_PIN_STYLE.badgeBackground,
                                                                                        border: `1px solid ${TODAY_PIN_STYLE.badgeBorder}`,
                                                                                    }}
                                                                                >
                                                                                    Today
                                                                                </span>
                                                                            )}
                                                                            <span
                                                                                className="rounded-full px-2 py-0.5 text-[10px] font-bold capitalize"
                                                                                style={{
                                                                                    color: statusStyle.badgeColor,
                                                                                    background: statusStyle.badgeBackground,
                                                                                    border: `1px solid ${statusStyle.badgeBorder}`,
                                                                                }}
                                                                            >
                                                                                {booking.status}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <p className={`mt-1 text-[11px] ${isToday ? 'font-semibold text-rose-600' : 'text-gray-400'}`}>
                                                                        {scheduleLabel || [booking.date, booking.time].filter(Boolean).join(' · ')}
                                                                    </p>
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                    ) : (
                                    <div className={`${PANEL} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                                        <div className="shrink-0 border-b border-gray-100/90 px-3 py-3">
                                            <PetVaccinationSwitch
                                                value={mapView}
                                                onChange={setMapView}
                                                vaccinatedCount={vaccinatedPetCount}
                                                unvaccinatedCount={unvaccinatedPetCount}
                                            />
                                        </div>
                                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                                            {visibleMapPets.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-6 text-center">
                                                    <p className="text-xs font-medium text-gray-500">
                                                        {selectedBarangayName
                                                            ? `No ${mapView === 'vaccinated' ? 'vaccinated ' : mapView === 'unvaccinated' ? 'unvaccinated ' : ''}pets listed in ${selectedBarangayName}`
                                                            : mapView === 'vaccinated'
                                                                ? 'No vaccinated pets on the map'
                                                                : mapView === 'unvaccinated'
                                                                    ? 'No unvaccinated pets on the map'
                                                                    : 'No pets on the map'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <ul className="space-y-1.5">
                                                    {visibleMapPets.map((pet) => {
                                                        const placeLabel = [pet.street, pet.barangay].filter(Boolean).join(', ');
                                                        const speciesLabel = [pet.species, pet.breed].filter(Boolean).join(' · ');
                                                        return (
                                                            <li key={pet.id} id={`map-pet-${pet.id}`}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => focusMapPet(pet)}
                                                                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                                                                        String(selectedPetId) === String(pet.id)
                                                                            ? 'border-gray-900 bg-gray-50 shadow-sm ring-2 ring-gray-900'
                                                                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                                                                    }`}
                                                                >
                                                                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-900">
                                                                        <span className="max-w-full truncate">{pet.pet_name || 'Pet'}</span>
                                                                        {String(selectedPetId) === String(pet.id) && (
                                                                            <span className="shrink-0 rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                                                                Selected
                                                                            </span>
                                                                        )}
                                                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                                                            pet.vaccinated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                                        }`}>
                                                                            {petStatusLabel(pet)}
                                                                        </span>
                                                                    </p>
                                                                    <p className="truncate text-[11px] text-gray-500">{pet.owner_name || 'Owner'}</p>
                                                                    {speciesLabel ? (
                                                                        <p className="mt-0.5 truncate text-[11px] text-gray-400">{speciesLabel}</p>
                                                                    ) : null}
                                                                    {placeLabel ? (
                                                                        <p className="mt-0.5 truncate text-[11px] font-medium text-gray-600">{placeLabel}</p>
                                                                    ) : null}
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                    )}
                                </aside>
                            )}

                            {/* Bottom-left legend (portrait) — kept clear of zoom controls */}
                            <div className="elsalvador-map-legend pointer-events-auto absolute bottom-3 left-3 z-30 lg:bottom-4 lg:left-4">
                                <div className={`${PANEL} overflow-hidden shadow-lg`}>
                                    <div className="flex flex-col gap-1.5 px-3 py-2.5 text-[10px] font-semibold text-gray-600">
                                        <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                            Legend
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2 border-violet-600 bg-violet-200" />
                                            Border
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="inline-flex h-3.5 w-2.5 shrink-0 items-end justify-center">
                                                <svg viewBox="0 0 24 36" className="h-3.5 w-2.5" aria-hidden="true">
                                                    <path d="M12 0C5.925 0 1 4.925 1 11c0 8.25 11 25 11 25s11-16.75 11-25C23 4.925 18.075 0 12 0z" fill="#0284c7" />
                                                    <circle cx="12" cy="11" r="4.25" fill="#fff" />
                                                </svg>
                                            </span>
                                            Marker
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="inline-flex h-3.5 w-2.5 shrink-0 items-end justify-center">
                                                <svg viewBox="0 0 24 36" className="h-3.5 w-2.5" aria-hidden="true">
                                                    <path d="M12 0C5.925 0 1 4.925 1 11c0 8.25 11 25 11 25s11-16.75 11-25C23 4.925 18.075 0 12 0z" fill="#1F7A8C" />
                                                    <circle cx="12" cy="11" r="4.25" fill="#fff" />
                                                </svg>
                                            </span>
                                            Selected
                                        </div>
                                        {mapView === 'home_service' ? (
                                            <>
                                                <div className="my-0.5 border-t border-gray-100" />
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600 ring-2 ring-rose-100" />
                                                    Today
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600 ring-2 ring-blue-100" />
                                                    Pending
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-700 ring-2 ring-emerald-100" />
                                                    Approved
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-600 ring-2 ring-cyan-100" />
                                                    Processing
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-600 ring-2 ring-orange-100" />
                                                    Ongoing
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500 ring-2 ring-slate-200" />
                                                    Completed
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="my-0.5 border-t border-gray-100" />
                                                {(mapView === 'vaccinated' || mapView === 'all_pets') && (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-700 ring-2 ring-emerald-100" />
                                                        Vaccinated
                                                    </div>
                                                )}
                                                {(mapView === 'unvaccinated' || mapView === 'all_pets') && (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-100" />
                                                        Not vaccinated
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                        {selectedMapPet && mapView !== 'home_service' && petCardPoint && (
                            <div
                                className="pointer-events-auto absolute z-40 w-[min(100%-1rem,20rem)] rounded-2xl border border-gray-900 bg-white p-3 shadow-lg"
                                style={{
                                    left: petCardPoint.x,
                                    top: petCardPoint.y,
                                    transform: petCardPoint.below
                                        ? 'translate(-50%, 16px)'
                                        : 'translate(-50%, calc(-100% - 18px))',
                                }}
                            >
                                <span
                                    className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-gray-900 bg-white ${
                                        petCardPoint.below
                                            ? '-top-1.5 border-l border-t'
                                            : '-bottom-1.5 border-b border-r'
                                    }`}
                                />
                                <div className="mb-2 flex items-start justify-between gap-2 border-b border-gray-100 pb-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
                                            Selected pet
                                        </p>
                                        <p className="truncate text-base font-bold text-gray-900">
                                            {selectedMapPet.pet_name || 'Pet'}
                                        </p>
                                        <p className="truncate text-xs text-gray-500">
                                            {selectedMapPet.owner_name || 'Unknown owner'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPetId(null)}
                                        className="rounded-lg px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                        aria-label="Close pet details"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                                        {normalizeMediaUrl(selectedMapPet.pet_photo_url) ? (
                                            <img
                                                src={normalizeMediaUrl(selectedMapPet.pet_photo_url)}
                                                alt={selectedMapPet.pet_name || 'Pet'}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-400">
                                                No photo
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1 pt-0.5">
                                        <p className="text-sm text-gray-700">{selectedMapPet.animal_type || '—'}</p>
                                        <p className="text-sm text-gray-500">{selectedMapPet.species || '—'}</p>
                                    </div>
                                </div>
                                <dl className="mt-3 space-y-1.5 text-sm">
                                    <div className="flex gap-2">
                                        <dt className="w-16 shrink-0 text-gray-400">Location</dt>
                                        <dd className="min-w-0 text-gray-800">
                                            {[selectedMapPet.street, selectedMapPet.zone, selectedMapPet.barangay].filter(Boolean).join(', ') || '—'}
                                        </dd>
                                    </div>
                                    <div className="flex gap-2">
                                        <dt className="w-16 shrink-0 text-gray-400">Status</dt>
                                        <dd className={`min-w-0 font-semibold ${selectedMapPet.vaccinated ? 'text-emerald-800' : 'text-amber-800'}`}>
                                            {petStatusLabel(selectedMapPet)}
                                        </dd>
                                    </div>
                                    {petServiceLabel(selectedMapPet) ? (
                                        <div className="flex gap-2">
                                            <dt className="w-16 shrink-0 text-gray-400">Service</dt>
                                            <dd className="min-w-0 text-gray-800">{petServiceLabel(selectedMapPet)}</dd>
                                        </div>
                                    ) : null}
                                    {(selectedMapPet.vaccines || []).length > 0 ? (
                                        <div className="flex gap-2">
                                            <dt className="w-16 shrink-0 text-gray-400">Record</dt>
                                            <dd className="min-w-0 text-gray-800">
                                                {selectedMapPet.vaccines.map((vaccine) => (
                                                    `${vaccine.label} · ${vaccine.current ? 'current' : 'expired'}`
                                                )).join(', ')}
                                            </dd>
                                        </div>
                                    ) : null}
                                    {selectedMapPet.pin_source === 'barangay' && (
                                        <div className="flex gap-2">
                                            <dt className="w-16 shrink-0 text-gray-400">Pin</dt>
                                            <dd className="min-w-0 text-gray-500">Shown at the barangay center. This pet has no street pin.</dd>
                                        </div>
                                    )}
                                </dl>
                                {selectedMapPet.user_id && (
                                    <button
                                        type="button"
                                        onClick={() => router.get(`/admin/clients/${selectedMapPet.user_id}/animals/${selectedMapPet.id}/history`)}
                                        className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                    >
                                        Show more
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {previewDoorToDoorBooking && (() => {
                const booking = previewDoorToDoorBooking;
                const photoUrl = normalizeMediaUrl(booking.meeting_place_photo_url);
                const statusStyle = DOOR_TO_DOOR_STATUS_STYLES[booking.status] || DOOR_TO_DOOR_STATUS_STYLES.approved;
                const servicesLabel = (booking.services || []).join(', ') || 'Home Services visit';
                const meetingPlaceLabel = getBookedMeetingPlaceLabel(booking, meetingPlaceLabels);
                const ownerLocationLabel = formatClientLocation(
                    booking.client_barangay || getBarangayName(booking.user?.barangay),
                    booking.client_zone || booking.user?.zone
                );

                return (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
                        onClick={closeDoorToDoorPreview}
                    >
                        <div
                            className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="border-b border-violet-100 px-5 pb-4 pt-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                                            Meeting Place / Landmark
                                        </p>
                                        <h2 className="mt-1 truncate text-lg font-bold text-gray-900">
                                            {booking.pet_name || booking.pet?.name || 'Home Service'}
                                        </h2>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
                                            <span>{booking.client_name || booking.user?.name || 'Client'}</span>
                                            <OwnerApprovalBadge user={booking.user} />
                                        </p>
                                        {meetingPlaceLabel && (
                                            <p className="mt-1 text-sm font-medium text-emerald-700">
                                                Marked location: {meetingPlaceLabel}
                                            </p>
                                        )}
                                        {ownerLocationLabel && (
                                            <p className="mt-0.5 text-xs text-gray-400">
                                                Owner address: {ownerLocationLabel}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeDoorToDoorPreview}
                                        className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 text-gray-400 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-600"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span
                                        className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                                        style={{
                                            color: statusStyle.badgeColor,
                                            backgroundColor: statusStyle.badgeBackground,
                                            border: `1px solid ${statusStyle.badgeBorder}`,
                                        }}
                                    >
                                        {statusStyle.label}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {[formatBookingDate(booking.date), formatBookingTime(booking.time)]
                                            .filter((value) => value && value !== '—')
                                            .join(' · ')
                                            || `${booking.date || ''}${booking.time ? ` · ${booking.time}` : ''}`}
                                    </span>
                                </div>
                            </div>

                            <div className="px-5 py-4">
                                {photoUrl ? (
                                    <button
                                        type="button"
                                        onClick={() => openPhotoPreview(photoUrl, 'Meeting Place / Landmark')}
                                        className="group relative block w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-300"
                                    >
                                        <img
                                            src={photoUrl}
                                            alt="Meeting place landmark"
                                            className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
                                        />
                                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                                            Click to enlarge
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center">
                                        <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <p className="mt-2 text-sm font-medium text-gray-500">No landmark photo uploaded</p>
                                        <p className="mt-1 text-xs text-gray-400">Owner did not attach a meeting place image</p>
                                    </div>
                                )}
                                <p className="mt-3 text-sm text-gray-600">
                                    <span className="font-semibold text-gray-800">Services:</span> {servicesLabel}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={closeDoorToDoorPreview}
                                    className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openDoorToDoorDetail(booking)}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700"
                                >
                                    View details
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {selectedDoorToDoorBooking && (() => {
                const booking = selectedDoorToDoorBooking;
                const petDetails = booking.pet || {
                    name: booking.pet_name,
                    pet_name: booking.pet_name,
                    species: booking.pet_species,
                    breed: booking.pet_breed,
                    sex: booking.pet_sex,
                    age: booking.pet_age,
                    registration_status: booking.pet_registration_status,
                };
                const ownerName = booking.user?.name || booking.client_name || 'Client';
                const appointmentStatus = booking.status || 'pending';
                const serviceNames = (
                    Array.isArray(booking.services) && booking.services.length > 0
                        ? booking.services
                        : booking.service
                            ? [booking.service]
                            : []
                ).filter(Boolean);
                const actualSymptoms = (booking.complaint?.symptoms || []).filter((s) => s.name !== 'Bite Incident');
                const hasTreatmentSymptoms =
                    actualSymptoms.length > 0 &&
                    serviceNames.some((n) => String(n).toLowerCase().includes('treatment'));
                const barangayValue = getBarangayName(booking.user?.barangay) || booking.client_barangay || '—';
                const zoneValue = booking.client_zone || booking.user?.zone || '—';
                const ownerLocationValue = formatClientLocation(
                    barangayValue !== '—' ? barangayValue : null,
                    zoneValue !== '—' ? zoneValue : null
                );
                const meetingPlaceLabel = getBookedMeetingPlaceLabel(booking, meetingPlaceLabels);
                const locationValue = meetingPlaceLabel || ownerLocationValue || '—';
                const locationSub = meetingPlaceLabel && ownerLocationValue
                    ? `Owner address: ${ownerLocationValue}`
                    : undefined;

                return (
                    <>
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-4 backdrop-blur-sm">
                            <div className="flex h-[90vh] max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl">
                                <div className={`shrink-0 border-b border-violet-100 px-5 py-3.5 ${MODAL_HEADER_BG}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">
                                                Appointment Details
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <h2 className="text-xl font-bold tracking-tight text-gray-900">
                                                    {petDetails?.name || petDetails?.pet_name || 'Unknown Pet'}
                                                </h2>
                                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                    STATUS_BADGE[appointmentStatus] || STATUS_BADGE.pending
                                                }`}>
                                                    {formatStatusLabel(appointmentStatus)}
                                                </span>
                                                {appointmentStatus === 'pending' && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/80 px-2.5 py-0.5 text-[11px] font-medium text-violet-800">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                                                        Awaiting review
                                                    </span>
                                                )}
                                            </div>
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
                                                    {petDetails?.breed || booking.pet_breed || '—'} · {petDetails?.species || booking.pet_species || '—'}
                                                    {petDetails?.color ? ` · ${petDetails.color}` : ''}
                                                    {' · '}
                                                    <span className="font-medium text-gray-700">{ownerName}</span>
                                                    <OwnerApprovalBadge user={booking.user} className="ml-1 align-middle" />
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {appointmentStatus === 'approved' && (
                                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                                                    Booking approved
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={closeDoorToDoorDetail}
                                                className="rounded-xl border border-gray-200 bg-white p-2 text-gray-400 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-600"
                                            >
                                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                                    <div className="min-h-0 flex-1 overflow-y-auto border-b border-gray-100 bg-gray-50/70 px-5 py-4 scrollbar-hide lg:max-w-[26rem] lg:flex-none lg:border-b-0 lg:border-r">
                                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                            This visit
                                        </p>
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 gap-2">
                                                <QuickFact
                                                    label="Schedule"
                                                    value={formatBookingDate(booking.date)}
                                                    sub={`${formatBookingTimeRange(booking.time, booking.duration_minutes)} · ${formatDuration(booking.duration_minutes)}`}
                                                />
                                                <QuickFact
                                                    label="Services"
                                                    value={serviceNames.join(', ') || '—'}
                                                />
                                                <QuickFact
                                                    label="Location"
                                                    value={locationValue}
                                                    sub={locationSub}
                                                />
                                            </div>

                                            {approveError && (
                                                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                                    {approveError}
                                                </div>
                                            )}

                                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                                <ViewSectionHeader
                                                    title="Meeting Place / Landmark"
                                                    subtitle="Exact place the client marked for this visit"
                                                />
                                                {meetingPlaceLabel ? (
                                                    <p className="mb-3 text-sm font-semibold text-emerald-700">
                                                        {meetingPlaceLabel}
                                                    </p>
                                                ) : (
                                                    <p className="mb-3 text-sm text-gray-400">No marked location name</p>
                                                )}
                                                {normalizeMediaUrl(booking.meeting_place_photo_url) ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openPhotoPreview(
                                                            normalizeMediaUrl(booking.meeting_place_photo_url),
                                                            'Meeting Place / Landmark'
                                                        )}
                                                        className="group relative block w-full overflow-hidden rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                    >
                                                        <img
                                                            src={normalizeMediaUrl(booking.meeting_place_photo_url)}
                                                            alt="Meeting place landmark"
                                                            className="max-h-36 w-full object-cover transition-transform group-hover:scale-[1.02]"
                                                        />
                                                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                                                            Click to enlarge
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-400">
                                                        No landmark photo uploaded
                                                    </div>
                                                )}
                                            </section>

                                            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                                <ViewSectionHeader title="Service & Clinical" subtitle="Treatments, bite incident, and notes" />
                                                <div className="mb-3">
                                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Services</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {serviceNames.length > 0 ? (
                                                            serviceNames.map((name, idx) => (
                                                                <span
                                                                    key={idx}
                                                                    className="inline-flex rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-800 ring-1 ring-violet-100"
                                                                >
                                                                    {name}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <span className="text-sm text-gray-500">No services recorded</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 gap-2">
                                                    <div className={`rounded-xl border p-3 ${
                                                        booking.complaint?.is_bitten
                                                            ? 'border-red-200 bg-red-50/70'
                                                            : 'border-gray-100 bg-gray-50/70'
                                                    }`}>
                                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bite Incident</p>
                                                        <p className="mt-1.5 text-sm font-semibold text-gray-900">
                                                            {booking.complaint?.is_bitten ? 'Yes — reported' : 'No'}
                                                        </p>
                                                        {booking.complaint?.is_bitten && booking.complaint?.bite_details && (
                                                            <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                                                                {booking.complaint.bite_details}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Administered By</p>
                                                        <p className="mt-1.5 text-sm font-semibold text-gray-900">
                                                            {getAdministeredByLabel(booking) || '—'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {hasTreatmentSymptoms && (
                                                    <div className="mt-3">
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

                                                {booking.notes && (
                                                    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
                                                        <p className="mt-1.5 text-sm leading-relaxed text-gray-800">{booking.notes}</p>
                                                    </div>
                                                )}

                                                {booking.cancellation_reason && appointmentStatus === 'cancelled' && (
                                                    <div className="mt-3 rounded-xl border border-red-100 bg-red-50/70 px-4 py-3">
                                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">Cancellation Reason</p>
                                                        <p className="mt-1.5 text-sm leading-relaxed text-red-900">{booking.cancellation_reason}</p>
                                                    </div>
                                                )}
                                            </section>

                                            {booking.status_history?.length > 0 && (
                                                <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                                    <ViewSectionHeader
                                                        title="Status History"
                                                        subtitle="Who submitted, approved, processed, completed, or cancelled this booking"
                                                    />
                                                    <AppointmentStatusHistory history={booking.status_history} />
                                                </section>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
                                        <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 bg-white px-4 py-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setDoorToDoorDetailTab('history')}
                                                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                                                    doorToDoorDetailTab === 'history'
                                                        ? 'bg-violet-100 text-violet-800'
                                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                                }`}
                                            >
                                                Medical history
                                                {(petMedical.historyCount || petMedical.history?.length) ? (
                                                    <span className="ml-1.5 tabular-nums text-xs font-bold">
                                                        {petMedical.historyCount || petMedical.history.length}
                                                    </span>
                                                ) : null}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDoorToDoorDetailTab('profile')}
                                                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                                                    doorToDoorDetailTab === 'profile'
                                                        ? 'bg-violet-100 text-violet-800'
                                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                                }`}
                                            >
                                                Pet profile
                                            </button>
                                        </div>
                                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
                                            <PetMedicalSections
                                                pet={petDetails}
                                                owner={booking.user || {
                                                    name: booking.client_name,
                                                    phone_number: booking.client_phone,
                                                    email: booking.client_email,
                                                    barangay: booking.client_barangay,
                                                    zone: booking.client_zone,
                                                }}
                                                medical={petMedical}
                                                loading={petMedical.loading}
                                                onPreview={openPhotoPreview}
                                                variant={doorToDoorDetailTab === 'profile' ? 'profile' : 'history'}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-3">
                                    {appointmentStatus === 'pending' ? (
                                        <div className="space-y-2">
                                            {!canApproveDoorToDoorBooking(booking) && (
                                                <p className="text-xs text-amber-700">
                                                    Pet must be registered or exempt before this booking can be approved.
                                                </p>
                                            )}
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                                <div ref={fieldmanDropdownRef} className="relative min-w-0 sm:max-w-xs sm:flex-1">
                                                    <label
                                                        htmlFor="assign-fieldman-select"
                                                        className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500"
                                                    >
                                                        Assign Fieldmen *
                                                    </label>
                                                    {fieldmen.length === 0 ? (
                                                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                                                            No fieldman accounts found. Create one first before approving.
                                                        </p>
                                                    ) : (
                                                        <>
                                                            <button
                                                                id="assign-fieldman-select"
                                                                type="button"
                                                                onClick={() => setFieldmanDropdownOpen((open) => !open)}
                                                                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-gray-800 shadow-sm transition focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                                            >
                                                                <span className={`truncate ${selectedFieldmanIds.length === 0 ? 'text-gray-500' : 'text-gray-800'}`}>
                                                                    {selectedFieldmanLabel}
                                                                </span>
                                                                <svg
                                                                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${fieldmanDropdownOpen ? 'rotate-180' : ''}`}
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </button>

                                                            {fieldmanDropdownOpen && (
                                                                <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                                                                    {fieldmen.map((fieldman) => {
                                                                        const isChecked = selectedFieldmanIds.includes(Number(fieldman.id));
                                                                        return (
                                                                            <label
                                                                                key={fieldman.id}
                                                                                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                                                                                    isChecked
                                                                                        ? 'border-violet-300 bg-violet-50'
                                                                                        : 'border-transparent hover:bg-gray-50'
                                                                                }`}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isChecked}
                                                                                    onChange={() => toggleSelectedFieldman(fieldman.id)}
                                                                                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                                                                />
                                                                                <span className="text-sm font-medium text-gray-800">
                                                                                    {fieldman.name}
                                                                                </span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApproveDoorToDoorBooking(booking)}
                                                        disabled={
                                                            approvingBookingId === booking.id
                                                            || !canApproveDoorToDoorBooking(booking)
                                                            || !selectedFieldmanIds.length
                                                        }
                                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-50"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        {approvingBookingId === booking.id ? 'Processing...' : 'Approve'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCancelReason('');
                                                            setCancelError('');
                                                            setShowCancelForm(true);
                                                        }}
                                                        disabled={approvingBookingId === booking.id}
                                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-all hover:bg-red-50 disabled:opacity-50"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={closeDoorToDoorDetail}
                                                        className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={closeDoorToDoorDetail}
                                                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {showCancelForm && appointmentStatus === 'pending' && (
                            <div
                                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                                onClick={() => {
                                    if (cancellingBookingId === booking.id) return;
                                    setShowCancelForm(false);
                                    setCancelReason('');
                                    setCancelError('');
                                }}
                            >
                                <div
                                    className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="border-b border-gray-100 px-5 py-4">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">Cancel booking</p>
                                        <h3 className="mt-1 text-lg font-bold text-gray-900">
                                            {petDetails?.name || petDetails?.pet_name || 'This booking'}
                                        </h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            Misclicked? Use Back to details — nothing is cancelled until you confirm.
                                        </p>
                                    </div>
                                    <div className="space-y-4 px-5 py-4">
                                        <CancellationReasonFields
                                            cancelReason={cancelReason}
                                            setCancelReason={setCancelReason}
                                            cancelError={cancelError}
                                            setCancelError={setCancelError}
                                        />
                                        <div className="flex flex-col gap-2.5 sm:flex-row">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowCancelForm(false);
                                                    setCancelReason('');
                                                    setCancelError('');
                                                }}
                                                disabled={cancellingBookingId === booking.id}
                                                className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Back to details
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleCancelDoorToDoorBooking(booking)}
                                                disabled={cancellingBookingId === booking.id}
                                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50"
                                            >
                                                {cancellingBookingId === booking.id ? 'Processing...' : 'Confirm Cancel'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {photoPreview.open && photoPreview.url && (
                            <div
                                className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
                                onClick={() => setPhotoPreview({ open: false, url: null, label: '' })}
                            >
                                <div
                                    className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                                        <p className="text-sm font-semibold text-gray-900">{photoPreview.label || 'Photo Preview'}</p>
                                        <button
                                            type="button"
                                            onClick={() => setPhotoPreview({ open: false, url: null, label: '' })}
                                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                        >
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="max-h-[calc(90vh-4rem)] overflow-auto bg-gray-950 p-3">
                                        <img
                                            src={photoPreview.url}
                                            alt={photoPreview.label || 'Preview'}
                                            className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}

            {showEditModal && editingBarangay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Edit Barangay</h2>
                                <p className="text-sm text-gray-500">{editingBarangay.name}</p>
                            </div>
                            <button type="button" onClick={closeEditModal} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                            {editError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                    {editError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Barangay photo</label>
                                <input
                                    ref={editPhotoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handlePhotoFileChange}
                                />
                                <button
                                    type="button"
                                    onClick={() => editPhotoInputRef.current?.click()}
                                    disabled={editPhotoUploading}
                                    className="relative mt-1.5 w-full overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 transition hover:border-violet-300 hover:bg-violet-50/40 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {normalizeMediaUrl(editPhotoUrl) ? (
                                        <img
                                            src={normalizeMediaUrl(editPhotoUrl)}
                                            alt="Barangay preview"
                                            className="h-40 w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-40 w-full flex-col items-center justify-center text-gray-500">
                                            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="1.5"
                                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                />
                                            </svg>
                                            <p className="mt-2 text-sm font-medium">Click to choose photo</p>
                                            <p className="mt-0.5 text-xs text-gray-400">Uploads to Cloudinary</p>
                                        </div>
                                    )}
                                    {editPhotoUploading && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                                            <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                                Uploading...
                                            </div>
                                        </div>
                                    )}
                                </button>
                                {normalizeMediaUrl(editPhotoUrl) && !editPhotoUploading && (
                                    <button
                                        type="button"
                                        onClick={() => setEditPhotoUrl('')}
                                        className="mt-2 text-xs font-semibold text-red-600 transition hover:text-red-700"
                                    >
                                        Remove photo
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
                            <button type="button" onClick={closeEditModal} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                                Cancel
                            </button>
                            <button type="button" onClick={handleSaveBarangay} disabled={editSaving || editPhotoUploading} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">
                                {editSaving ? 'Saving...' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
