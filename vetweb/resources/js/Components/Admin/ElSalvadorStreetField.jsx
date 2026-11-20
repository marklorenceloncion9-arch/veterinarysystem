import { useEffect, useState } from 'react';

const CITY_BBOX = '124.44,8.5,124.6,8.63';
const OUTSIDE_CITY = /\b(cagayan de oro|opol|alubijid|gitagum|manticao|naawan|initao)\b/i;

function shortBarangayName(name) {
    const value = String(name || '').trim();
    if (/poblacion/i.test(value)) return 'Poblacion';
    if (/calongonan|san francisco/i.test(value)) return 'Calongonan';
    if (/bolo/i.test(value)) return 'Bolobolo';
    return value.replace(/\s*\(.*\)\s*/, '').trim();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsZone(text, zone) {
    if (!zone) return false;
    return new RegExp(`\\b${escapeRegExp(zone)}\\b`, 'i').test(text);
}

function mentionsBarangay(text, barangay) {
    const short = shortBarangayName(barangay).toLowerCase();
    const full = String(barangay || '').toLowerCase();
    const haystack = String(text || '').toLowerCase();
    return (short && haystack.includes(short)) || (full && haystack.includes(full));
}

function zonePlaces(barangay, zone) {
    const area = shortBarangayName(barangay);
    if (!area || !zone) return [];

    return [
        { label: `${area} ${zone} Road`, kind: 'Street', keywords: ['road', 'street', zone, area] },
        { label: `${area} ${zone} Street`, kind: 'Street', keywords: ['street', zone, area] },
        { label: `${zone} Covered Court`, kind: 'Landmark', keywords: ['covered court', 'basketball', 'court', 'gym', zone] },
        { label: `${zone} Chapel`, kind: 'Landmark', keywords: ['chapel', 'church', zone] },
        { label: `${zone} Health Station`, kind: 'Landmark', keywords: ['health', 'center', 'station', zone] },
    ].map((place) => ({
        id: `zone-${place.kind}-${place.label}`,
        label: place.label,
        kind: place.kind,
        keywords: place.keywords.map((keyword) => keyword.toLowerCase()),
        subtitle: `${place.kind} · ${zone}, ${area}, El Salvador City`,
    }));
}

function localPlaceMatches(query, barangay, zone) {
    const term = query.trim().toLowerCase();
    return zonePlaces(barangay, zone).filter((place) => {
        if (!term) return true;
        if (place.label.toLowerCase().includes(term)) return true;
        if (term.length < 3) return false;
        return place.keywords.some((keyword) => keyword.includes(term) || term.includes(keyword));
    });
}

function insideElSalvador(latitude, longitude) {
    return latitude >= 8.5 && latitude <= 8.63 && longitude >= 124.44 && longitude <= 124.6;
}

function shortenPlace(placeName) {
    return String(placeName || '')
        .replace(/,?\s*Philippines$/i, '')
        .replace(/,?\s*Misamis Oriental$/i, '')
        .trim();
}

function mapboxSuggestions(features, barangay, zone) {
    return features.flatMap((feature) => {
        const [longitude, latitude] = feature.center || [];
        const place = String(feature.place_name || '');
        const label = String(feature.text || '').trim();
        const types = Array.isArray(feature.place_type) ? feature.place_type : [];
        const context = Array.isArray(feature.context) ? feature.context.map((item) => item.text).join(' ') : '';
        const haystack = `${label} ${place} ${context}`;
        if (!label || !Number.isFinite(latitude) || !insideElSalvador(latitude, longitude)) return [];
        if (OUTSIDE_CITY.test(place) && !/el salvador/i.test(place)) return [];
        if (!mentionsBarangay(haystack, barangay) || !mentionsZone(haystack, zone)) return [];
        const kind = types.includes('poi') ? 'Landmark' : 'Street';
        return [{
            id: String(feature.id || `${label}-${latitude}`),
            label,
            kind,
            subtitle: `${kind} · ${shortenPlace(place) || `${zone}, ${shortBarangayName(barangay)}`}`,
        }];
    });
}

export default function ElSalvadorStreetField({ value, onChange, inputClass, token, barangay = '', zone = '' }) {
    const [query, setQuery] = useState(value || '');
    const [open, setOpen] = useState(false);
    const [remote, setRemote] = useState([]);
    const [loading, setLoading] = useState(false);
    const ready = Boolean(barangay && zone);
    const areaLabel = ready ? `${shortBarangayName(barangay)}, ${zone}` : '';

    useEffect(() => {
        setQuery(value || '');
        setRemote([]);
    }, [value, barangay, zone]);

    useEffect(() => {
        const term = query.trim();
        if (!ready || !token || term.length < 2 || term === value) {
            setRemote([]);
            setLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const search = `${term}, ${zone}, ${shortBarangayName(barangay)}, El Salvador City`;
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search)}.json`
                    + `?access_token=${encodeURIComponent(token)}`
                    + `&bbox=${CITY_BBOX}&proximity=124.5218,8.563&country=ph`
                    + '&types=poi,address,neighborhood&limit=8&autocomplete=true';
                const response = await fetch(url, { signal: controller.signal });
                const data = response.ok ? await response.json() : {};
                if (!controller.signal.aborted) {
                    setRemote(mapboxSuggestions(Array.isArray(data.features) ? data.features : [], barangay, zone));
                }
            } catch (error) {
                if (error.name !== 'AbortError') setRemote([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 180);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, token, value, barangay, zone, ready]);

    const seen = new Set();
    const suggestions = [...localPlaceMatches(query, barangay, zone), ...remote].filter((place) => {
        const key = place.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 12);

    return (
        <div className="relative">
            <input
                type="text"
                value={query}
                autoComplete="off"
                disabled={!ready}
                placeholder={ready ? `Search a street or landmark in ${areaLabel}` : 'Select a barangay and zone first'}
                className={inputClass + (!ready ? ' cursor-not-allowed opacity-60' : '')}
                onFocus={() => ready && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onChange={(event) => {
                    const next = event.target.value;
                    setQuery(next);
                    setOpen(true);
                    if (value) onChange('');
                }}
            />
            {ready && <p className="mt-1.5 text-xs text-gray-500">Only streets and landmarks in {areaLabel}.</p>}
            {loading && <p className="mt-1.5 text-xs text-gray-500">Searching {areaLabel}...</p>}
            {open && ready && suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    {suggestions.map((place) => (
                        <button
                            key={place.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onChange(place.label);
                                setQuery(place.label);
                                setOpen(false);
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-violet-50"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-900">{place.label}</span>
                                <span className="block truncate text-xs text-gray-500">{place.subtitle}</span>
                            </span>
                            <span className="shrink-0 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                                {place.kind}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {open && ready && query.trim().length >= 2 && !loading && suggestions.length === 0 && (
                <p className="mt-1.5 text-xs text-gray-500">No street or landmark found in {areaLabel}.</p>
            )}
        </div>
    );
}
