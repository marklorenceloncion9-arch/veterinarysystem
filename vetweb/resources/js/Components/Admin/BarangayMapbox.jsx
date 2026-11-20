import { useEffect, useMemo, useRef, useState } from 'react';
import { usePage } from '@inertiajs/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const EL_SALVADOR_CENTER = [124.5218, 8.5630];

// Diri ang Mapbox map sa mga barangay.
export default function BarangayMapbox({
    barangays = [],
    selectedBarangay = '',
    onSelectBarangay,
    clientCounts = {},
}) {
    const { mapboxToken: sharedMapboxToken } = usePage().props;
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const [coordinatesByBarangay, setCoordinatesByBarangay] = useState({});
    const [isGeocoding, setIsGeocoding] = useState(false);

    const mapboxToken = sharedMapboxToken || import.meta.env.VITE_MAPBOX_TOKEN;
    const hasToken = Boolean(mapboxToken);

    const selectedId = String(selectedBarangay || '');

    const geocodeTargets = useMemo(
        () => barangays.map((b) => ({ id: String(b.id), name: b.name })),
        [barangays]
    );

    useEffect(() => {
        if (!hasToken || !mapContainerRef.current || mapRef.current) return;

        mapboxgl.accessToken = mapboxToken;
        mapRef.current = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: EL_SALVADOR_CENTER,
            zoom: 14,
            pixelRatio: Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
            performanceMetricsCollection: false,
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        return () => {
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, [hasToken, mapboxToken]);

    useEffect(() => {
        if (!hasToken || geocodeTargets.length === 0) return;

        const cacheKey = 'elsalvador-barangay-coordinates-v1';
        const cached = (() => {
            try {
                return JSON.parse(localStorage.getItem(cacheKey) || '{}');
            } catch {
                return {};
            }
        })();

        const missing = geocodeTargets.filter((b) => !cached[b.id]);
        setCoordinatesByBarangay(cached);

        if (missing.length === 0) return;

        let cancelled = false;
        // Diri pangitaon ang coordinates sa barangay nga wala pa sa cache.
        const geocodeMissing = async () => {
            setIsGeocoding(true);
            const next = { ...cached };

            for (const item of missing) {
                const query = `${item.name}, El Salvador City, Misamis Oriental, Philippines`;
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=1`;
                try {
                    const response = await fetch(url);
                    const data = await response.json();
                    const center = data?.features?.[0]?.center;
                    if (Array.isArray(center) && center.length === 2) {
                        next[item.id] = center;
                    }
                } catch (error) {
                    // Continue even if one barangay fails geocoding.
                    console.error('Mapbox geocoding failed for', item.name, error);
                }
            }

            if (!cancelled) {
                setCoordinatesByBarangay(next);
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(next));
                } catch {
                    // Ignore storage write issues.
                }
                setIsGeocoding(false);
            }
        };

        geocodeMissing();

        return () => {
            cancelled = true;
        };
    }, [geocodeTargets, hasToken, mapboxToken]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        const bounds = new mapboxgl.LngLatBounds();
        const hasAny = geocodeTargets.some((b) => coordinatesByBarangay[b.id]);

        geocodeTargets.forEach((barangay) => {
            const coords = coordinatesByBarangay[barangay.id];
            if (!coords) return;

            const isActive = String(barangay.id) === selectedId;
            const markerElement = document.createElement('button');
            markerElement.type = 'button';
            markerElement.style.width = isActive ? '20px' : '14px';
            markerElement.style.height = isActive ? '20px' : '14px';
            markerElement.style.borderRadius = '9999px';
            markerElement.style.border = '2px solid #ffffff';
            markerElement.style.background = isActive ? '#1F7A8C' : '#0ea5e9';
            markerElement.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.28)';
            markerElement.style.cursor = 'pointer';

            markerElement.addEventListener('click', () => {
                onSelectBarangay?.(String(barangay.id));
            });

            const popupHtml = `
                <div style="font-size:12px;line-height:1.4">
                    <div style="font-weight:700;color:#111827">${barangay.name}</div>
                    <div style="color:#4b5563">${clientCounts?.[barangay.id] || 0} clients</div>
                </div>
            `;

            const marker = new mapboxgl.Marker({ element: markerElement })
                .setLngLat(coords)
                .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(popupHtml))
                .addTo(map);

            markersRef.current.push(marker);
            bounds.extend(coords);
        });

        if (hasAny) {
            map.fitBounds(bounds, { padding: 45, maxZoom: 16, duration: 800 });
        }
    }, [coordinatesByBarangay, geocodeTargets, onSelectBarangay, selectedId, clientCounts]);

    if (!hasToken) return null;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">El Salvador Barangay Map</h3>
                    <p className="text-xs text-gray-500 mt-1">Click a marker to filter clients</p>
                </div>
                {isGeocoding && (
                    <span className="text-xs font-medium text-violet-700 bg-violet-100 px-2.5 py-1 rounded-full">
                        Locating...
                    </span>
                )}
            </div>
            <div ref={mapContainerRef} className="h-[340px] w-full" />
        </div>
    );
}
