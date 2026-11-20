import { useCallback, useEffect, useMemo, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import Sidebar from '@/Components/Admin/Sidebar';
import AppointmentStatusHistory from '@/Components/Admin/AppointmentStatusHistory';
import { sortAdminAppointmentsNewestFirst } from '@/utils/adminAppointmentSort';

const STATUS_BADGE = {
    pending: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    processing: 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-100',
    ongoing: 'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
    completed: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    cancelled: 'bg-red-50 text-red-600 ring-1 ring-red-100',
    rejected: 'bg-red-50 text-red-600 ring-1 ring-red-100',
};

const STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Today' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'processing', label: 'Processing' },
    { key: 'ongoing', label: 'Ongoing' },
    { key: 'completed', label: 'Completed' },
];

// Diri i-capitalize ang label sa status.
function formatStatusLabel(status) {
    if (!status) return '—';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

// Diri limpyohan ang URL sa litrato.
function normalizeMediaUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
    return value.startsWith('/') ? value : `/${value}`;
}

// Diri i-format ang oras nga AM/PM.
function formatTime(timeStr) {
    if (!timeStr) return '—';
    if (String(timeStr).includes('AM') || String(timeStr).includes('PM')) return timeStr;
    const [hours, minutes] = String(timeStr).split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10) || 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Diri i-format ang location sa client.
function formatClientLocation(barangay, zone) {
    const parts = [barangay, zone].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
}

// Diri i-format ang coordinates sa meeting place.
function formatMeetingCoords(booking) {
    const lat = Number(booking?.meeting_latitude);
    const lng = Number(booking?.meeting_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        return null;
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Diri himuon ang key sa coordinates sa meeting place.
function getMeetingPlaceCoordKey(booking) {
    const lat = Number(booking?.meeting_latitude);
    const lng = Number(booking?.meeting_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        return null;
    }
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

// Diri kuhaon ang label sa lugar sa booking.
function getBookedPlaceLabel(booking, placeLabels = {}) {
    const key = getMeetingPlaceCoordKey(booking);
    if (key && placeLabels[key]) {
        return placeLabels[key];
    }
    if (booking?.meeting_barangay) {
        return booking.meeting_barangay;
    }
    return null;
}

// Diri ang icon sa location pin.
function LocationPinIcon({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );
}

// Diri i-check kung karon naka-schedule ang booking.
function isScheduledToday(dateStr) {
    if (!dateStr) return false;
    const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return false;
    const today = new Date();
    return year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
}

// Diri basahon ang barangay filter gikan sa URL.
function readBarangayFilterFromUrl() {
    if (typeof window === 'undefined') return null;
    const value = new URLSearchParams(window.location.search).get('barangay_id');
    return value ? String(value) : null;
}

// Diri ang page sa history sa home service.
export default function HomeServiceHistory() {
    const { mapboxToken: sharedMapboxToken } = usePage().props;
    const mapboxToken = sharedMapboxToken || import.meta.env.VITE_MAPBOX_TOKEN;
    const [fromDate, setFromDate] = useState('');
    const [tillDate, setTillDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [barangayFilter, setBarangayFilter] = useState(() => readBarangayFilterFromUrl());
    const [searchTerm, setSearchTerm] = useState('');
    const [bookings, setBookings] = useState([]);
    const [barangaySummaries, setBarangaySummaries] = useState([]);
    const [placeLabels, setPlaceLabels] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(null);

    const loadHistory = useCallback(async (from, till) => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.get('/api/admin/home-service-history', {
                params: {
                    from: from || undefined,
                    till: till || undefined,
                },
            });
            if (response.data?.success) {
                setBookings(response.data.bookings || []);
                setBarangaySummaries(response.data.barangay_summaries || []);
            } else {
                setBookings([]);
                setBarangaySummaries([]);
                setError(response.data?.error || 'Failed to load history.');
            }
        } catch (err) {
            console.error('Failed to load home service history:', err);
            setBookings([]);
            setBarangaySummaries([]);
            setError(err.response?.data?.error || 'Failed to load history.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHistory(fromDate, tillDate);
    }, [fromDate, tillDate, loadHistory]);

    useEffect(() => {
        if (!mapboxToken || bookings.length === 0) return;

        const cacheKey = 'elsalvador-meeting-place-labels-v1';
        let cached = {};
        try {
            cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        } catch {
            cached = {};
        }

        const targets = [];
        const seen = new Set();
        bookings.forEach((booking) => {
            const key = getMeetingPlaceCoordKey(booking);
            if (!key || seen.has(key) || cached[key]) return;
            seen.add(key);
            targets.push({
                key,
                lat: Number(booking.meeting_latitude),
                lng: Number(booking.meeting_longitude),
            });
        });

        if (Object.keys(cached).length > 0) {
            setPlaceLabels((prev) => ({ ...cached, ...prev }));
        }

        if (targets.length === 0) return;

        let cancelled = false;
        // Diri kuhaon ang mga ngalan sa meeting place.
        const resolveLabels = async () => {
            const next = { ...cached };
            for (const target of targets) {
                try {
                    const label = await reverseGeocodeMeetingPlace(target.lng, target.lat, mapboxToken);
                    if (label) next[target.key] = label;
                } catch (err) {
                    console.error('Meeting place reverse geocode failed', err);
                }
            }
            if (cancelled) return;
            setPlaceLabels((prev) => ({ ...prev, ...next }));
            try {
                localStorage.setItem(cacheKey, JSON.stringify(next));
            } catch {
                // Ignore storage issues.
            }
        };

        resolveLabels();
        return () => {
            cancelled = true;
        };
    }, [bookings, mapboxToken]);

    const selectedBarangayName = useMemo(() => {
        if (!barangayFilter) return null;
        return barangaySummaries.find((item) => String(item.id) === String(barangayFilter))?.name || null;
    }, [barangayFilter, barangaySummaries]);

    const statusCounts = useMemo(() => {
        const scoped = bookings.filter((booking) => {
            if (!barangayFilter) return true;
            return String(booking.meeting_barangay_id) === String(barangayFilter);
        });

        return {
            all: scoped.length,
            today: scoped.filter((booking) => isScheduledToday(booking.date)).length,
            pending: scoped.filter((booking) => booking.status === 'pending').length,
            approved: scoped.filter((booking) => booking.status === 'approved').length,
            processing: scoped.filter((booking) => booking.status === 'processing').length,
            ongoing: scoped.filter((booking) => booking.status === 'ongoing').length,
            completed: scoped.filter((booking) => booking.status === 'completed').length,
        };
    }, [bookings, barangayFilter]);

    const filteredBookings = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const filtered = bookings.filter((booking) => {
            if (statusFilter === 'today') {
                if (!isScheduledToday(booking.date)) return false;
            } else if (statusFilter !== 'all' && booking.status !== statusFilter) {
                return false;
            }
            if (barangayFilter && String(booking.meeting_barangay_id) !== String(barangayFilter)) {
                return false;
            }
            if (!query) return true;
            const haystack = [
                booking.pet_name,
                booking.pet?.name,
                booking.client_name,
                booking.user?.name,
                booking.meeting_barangay,
                booking.client_barangay,
                booking.user?.barangay,
                booking.client_zone,
                booking.user?.zone,
                booking.pet?.identification_number,
                ...(booking.services || []),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });

        return sortAdminAppointmentsNewestFirst(filtered, { preferUpdatedAt: true });
    }, [bookings, statusFilter, searchTerm, barangayFilter]);

    const selectedPhoto = normalizeMediaUrl(selected?.meeting_place_photo_url);
    const selectedBookedPlace = selected ? getBookedPlaceLabel(selected, placeLabels) : null;
    const selectedOwnerAddress = selected
        ? formatClientLocation(
            selected.client_barangay || selected.user?.barangay,
            selected.client_zone || selected.user?.zone
        )
        : null;

    return (
        <div className="flex min-h-screen bg-canvas">
            <Head title="Home Service History" />
            <Sidebar />

            <div className="staff-main flex min-h-screen flex-1 flex-col">
                <header className="border-b border-gray-200/80 bg-white">
                    <div className="px-6 py-5 lg:px-8">
                        <button
                            type="button"
                            onClick={() => {
                                if (window.history.length > 1) {
                                    window.history.back();
                                    return;
                                }

                                router.get(
                                    '/admin/elsalvador-city-map',
                                    barangayFilter ? { barangay_id: barangayFilter } : {}
                                );
                            }}
                            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-violet-700"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to map
                        </button>

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
                                    Home Services
                                </p>
                                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 lg:text-3xl">
                                    Visit History
                                </h1>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="rounded-xl bg-white px-3.5 py-2 ring-1 ring-slate-200">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Records</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {statusCounts.all || 0}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5 lg:px-8">
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
                                        placeholder="Pet, owner, booked place, service..."
                                    />
                                </div>
                            </div>

                            <div className="lg:col-span-4">
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Booked barangay
                                </label>
                                <select
                                    value={barangayFilter ?? ''}
                                    onChange={(e) => {
                                        const next = e.target.value ? e.target.value : null;
                                        setBarangayFilter(next);
                                        const url = new URL(window.location.href);
                                        if (next) {
                                            url.searchParams.set('barangay_id', next);
                                        } else {
                                            url.searchParams.delete('barangay_id');
                                        }
                                        window.history.replaceState({}, '', url);
                                    }}
                                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                >
                                    <option value="">All barangays</option>
                                    {barangaySummaries.map((barangay) => (
                                        <option key={barangay.id} value={barangay.id}>
                                            {barangay.name}
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

                        <div className="mt-4 flex flex-wrap gap-x-1 border-b border-gray-200" role="tablist" aria-label="Visit status">
                            {STATUS_FILTERS.map((filter) => {
                                const active = statusFilter === filter.key;
                                return (
                                    <button
                                        key={filter.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setStatusFilter(filter.key)}
                                        className={`border-b-2 px-3 py-2 text-sm ${
                                            active
                                                ? 'border-gray-900 font-semibold text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        {filter.label}
                                        <span className={`ml-1.5 ${active ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {statusCounts[filter.key] || 0}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                            {error}
                        </div>
                    )}

                    <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Bookings</h2>
                                <p className="text-xs text-gray-500">
                                    {loading
                                        ? 'Loading…'
                                        : `${filteredBookings.length} result${filteredBookings.length === 1 ? '' : 's'} in ${
                                            selectedBarangayName || 'all barangays'
                                        }`}
                                </p>
                            </div>
                        </div>

                        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
                            {loading ? (
                                <div className="flex items-center justify-center gap-3 py-20 text-sm text-gray-500">
                                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                    Loading history…
                                </div>
                            ) : filteredBookings.length === 0 ? (
                                <div className="px-6 py-16 text-center">
                                    <p className="text-sm font-semibold text-gray-800">No Home Service bookings</p>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Nothing found
                                        {fromDate || tillDate
                                            ? ` from ${fromDate || 'any date'} till ${tillDate || 'any date'}`
                                            : ''}
                                        {` in ${selectedBarangayName || 'all barangays'}`}
                                        {statusFilter !== 'all' ? ` · ${formatStatusLabel(statusFilter)}` : ''}.
                                    </p>
                                </div>
                            ) : (
                                <table className="min-w-full text-left text-sm">
                                    <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                            <th className="px-4 py-3 font-bold">Photo</th>
                                            <th className="px-4 py-3 font-bold">Pet</th>
                                            <th className="px-4 py-3 font-bold">Owner</th>
                                            <th className="px-4 py-3 font-bold">Status</th>
                                            <th className="px-4 py-3 font-bold">Booked Place</th>
                                            <th className="px-4 py-3 font-bold">Owner Address</th>
                                            <th className="px-4 py-3 font-bold">Schedule</th>
                                            <th className="px-4 py-3 font-bold">Service</th>
                                            <th className="px-4 py-3 font-bold"><span className="sr-only">View</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredBookings.map((booking) => {
                                            const photo = normalizeMediaUrl(booking.meeting_place_photo_url);
                                            const services = (booking.services || []).join(', ') || booking.service || '—';
                                            const bookedPlace = getBookedPlaceLabel(booking, placeLabels);
                                            const ownerAddress = formatClientLocation(
                                                booking.client_barangay || booking.user?.barangay,
                                                booking.client_zone || booking.user?.zone
                                            );

                                            return (
                                                <tr
                                                    key={booking.id}
                                                    onClick={() => setSelected(booking)}
                                                    className="cursor-pointer transition hover:bg-violet-50/50"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="h-12 w-14 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                                                            {photo ? (
                                                                <img
                                                                    src={photo}
                                                                    alt="Booked meeting place"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center text-gray-300">
                                                                    <LocationPinIcon className="h-4 w-4" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-semibold text-gray-900">
                                                            {booking.pet_name || booking.pet?.name || 'Pet'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">
                                                        {booking.client_name || booking.user?.name || 'Client'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                            STATUS_BADGE[booking.status] || STATUS_BADGE.pending
                                                        }`}>
                                                            {formatStatusLabel(booking.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                                                            <LocationPinIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                            <span className="truncate">
                                                                {bookedPlace || 'Not set'}
                                                            </span>
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500">
                                                        {ownerAddress || '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                                        <span className="font-medium text-gray-800">
                                                            {booking.date_formatted || booking.date}
                                                        </span>
                                                        {isScheduledToday(booking.date) && (
                                                            <span className="ml-1.5 inline-flex rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-100">
                                                                Today
                                                            </span>
                                                        )}
                                                        <br />
                                                        {booking.time_formatted || formatTime(booking.time)}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {services}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setSelected(booking);
                                                            }}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
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
                            )}
                        </div>
                    </section>
                </main>
            </div>

            {selected && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="shrink-0 border-b border-gray-100 px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600">
                                        Home Service Details
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900">
                                            {selected.pet_name || selected.pet?.name || 'Pet'}
                                        </h2>
                                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            STATUS_BADGE[selected.status] || STATUS_BADGE.pending
                                        }`}>
                                            {formatStatusLabel(selected.status)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {selected.client_name || selected.user?.name || 'Client'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelected(null)}
                                    className="rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                    <LocationPinIcon className="h-3.5 w-3.5" />
                                    Booked meeting place
                                </p>
                                <p className="mt-1.5 text-base font-semibold text-emerald-950">
                                    {selectedBookedPlace || selected?.meeting_barangay || 'Not set'}
                                </p>
                                {selected?.meeting_barangay && selectedBookedPlace !== selected.meeting_barangay && (
                                    <p className="mt-1 text-xs font-medium text-emerald-800">
                                        Barangay: {selected.meeting_barangay}
                                    </p>
                                )}
                                {formatMeetingCoords(selected) && (
                                    <p className="mt-1 text-xs text-emerald-800/70">
                                        Coordinates: {formatMeetingCoords(selected)}
                                    </p>
                                )}
                                {selectedOwnerAddress && (
                                    <p className="mt-2 text-xs text-emerald-900/50">
                                        Owner address: {selectedOwnerAddress}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Schedule</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-900">
                                        {selected.date_formatted || selected.date}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        {selected.time_formatted || formatTime(selected.time)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Services</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-900">
                                        {(selected.services || []).join(', ') || selected.service || '—'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contact</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-900">
                                        {selected.client_phone || selected.user?.phone_number || '—'}
                                    </p>
                                </div>
                            </div>

                            <section className="rounded-2xl border border-gray-100 bg-white p-4">
                                <h3 className="text-sm font-bold text-gray-900">Landmark photo</h3>
                                {selectedPhoto ? (
                                    <img
                                        src={selectedPhoto}
                                        alt="Landmark"
                                        className="mt-3 aspect-[4/3] w-full rounded-xl object-cover"
                                    />
                                ) : (
                                    <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                                        No landmark photo uploaded
                                    </p>
                                )}
                            </section>

                            {(selected.notes || selected.cancellation_reason) && (
                                <section className="rounded-2xl border border-gray-100 bg-white p-4">
                                    {selected.notes && (
                                        <div className="mb-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p>
                                            <p className="mt-1 text-sm text-gray-800">{selected.notes}</p>
                                        </div>
                                    )}
                                    {selected.cancellation_reason && (
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">
                                                Cancellation Reason
                                            </p>
                                            <p className="mt-1 text-sm text-red-900">{selected.cancellation_reason}</p>
                                        </div>
                                    )}
                                </section>
                            )}

                            {selected.status_history?.length > 0 && (
                                <section className="rounded-2xl border border-gray-100 bg-white p-4">
                                    <h3 className="mb-3 text-sm font-bold text-gray-900">Status History</h3>
                                    <AppointmentStatusHistory history={selected.status_history} />
                                </section>
                            )}
                        </div>

                        <div className="shrink-0 border-t border-gray-100 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
