import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MeetingPlaceMap } from '@/components/MeetingPlaceMap';
import {
  findElSalvadorBarangayAt,
  getElSalvadorBarangayPolygons,
  isInsideElSalvadorCity,
  type MeetingCoordinate,
} from '@/components/meetingPlaceMap.shared';
import { findNamedPlaceCoordinate, isNamedWater, nearestNamedPlaceAt, peopleSideWaterPoint, reverseGeocodeStreetOrLandmark, searchLiveMapboxPlaces, searchMapboxPlaces } from '@/utils/mapbox';
import {
  ensureAddressDirectoryLoaded,
  getAddressDirectory,
} from '@/utils/elsalvadorAddressDirectory';
import {
  getInstantStreetSuggestions,
  searchStreetAddressSuggestions,
  type StreetSuggestion,
} from '@/utils/streetAddressAutocomplete';

export type ResolvedPlace = {
  label: string;
  coordinate: MeetingCoordinate;
  barangayName?: string;
};

type Props = {
  value: string;
  onChange: (place: string) => void;
  barangay?: string;
  zone?: string;
  placeholder?: string;
  variant?: 'pill' | 'box';
  hasError?: boolean;
  showMap?: boolean;
  pinnedCoordinate?: MeetingCoordinate | null;
  onResolvedPlace?: (place: ResolvedPlace | null) => void;
  locatingSaved?: boolean;
};

const GEOJSON_TO_DIRECTORY: Record<string, string> = {
  Calongonan: 'San Francisco de Asis (Calongonan)',
  Bolobolo: 'Pedro S. Baculio (Bolo-Bolo)',
  Kibonbon: 'Quibonbon',
  Poblacion: 'Poblacion (city center)',
};

function shortBarangayName(name: string) {
  const value = String(name || '').trim();
  if (/poblacion/i.test(value)) return 'Poblacion';
  if (/calongonan|san francisco/i.test(value)) return 'Calongonan';
  if (/bolo/i.test(value)) return 'Bolobolo';
  return value.replace(/\s*\(.*\)\s*/, '').trim();
}

function mentionsBarangay(text: string, barangay: string) {
  const short = shortBarangayName(barangay).toLowerCase();
  const full = barangay.toLowerCase();
  const haystack = text.toLowerCase();
  return (short && haystack.includes(short)) || (full && haystack.includes(full));
}

function shortPlaceLabel(label: string) {
  return label
    .replace(/,?\s*Philippines$/i, '')
    .replace(/,?\s*Misamis Oriental$/i, '')
    .replace(/,?\s*El Salvador( City)?$/i, '')
    .trim();
}

function hasValidCoordinate(coordinate?: MeetingCoordinate | null) {
  return Boolean(
    coordinate
    && Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && !(coordinate.latitude === 0 && coordinate.longitude === 0)
  );
}

function isStreetOrLandmark(suggestion: StreetSuggestion) {
  if (
    suggestion.id.startsWith('barangay-')
    || suggestion.id.startsWith('geo-barangay-')
    || suggestion.id.startsWith('zone-')
  ) {
    return false;
  }
  return suggestion.subtitle !== 'Barangay' && suggestion.subtitle !== 'Zone';
}

function directoryBarangayName(geoName?: string | null) {
  if (!geoName) return undefined;
  return GEOJSON_TO_DIRECTORY[geoName] || geoName;
}

function normalizeZoneToken(value: string) {
  return value.toLowerCase().replace(/[\s-]+/g, '');
}

function mentionsDifferentZone(text: string, zone: string) {
  const selected = normalizeZoneToken(zone);
  const matches = text.match(/zone\s*\d+\s*-?\s*[a-z]?/gi) || [];
  return matches.some((token) => normalizeZoneToken(token) !== selected);
}

function placeMatchesBarangay(placeBarangay: string, selected: string) {
  return mentionsBarangay(placeBarangay, selected) || mentionsBarangay(selected, placeBarangay);
}

function areaCoordinate(barangay: string, zone: string): MeetingCoordinate | null {
  const directory = getAddressDirectory();
  const zoneHit = directory.zones.find(
    (item) =>
      item.name.toLowerCase() === zone.toLowerCase()
      && placeMatchesBarangay(item.barangayName, barangay)
  );
  if (zoneHit && hasValidCoordinate(zoneHit.coordinate)) return zoneHit.coordinate;

  const barangayHit = directory.barangays.find((item) => placeMatchesBarangay(item.name, barangay));
  if (barangayHit && hasValidCoordinate(barangayHit.coordinate)) return barangayHit.coordinate;
  return null;
}

function featuredPlacesForArea(barangay: string, zone: string): StreetSuggestion[] {
  const directory = getAddressDirectory();
  const area = shortBarangayName(barangay);
  const picked: StreetSuggestion[] = [];

  const push = (
    id: string,
    label: string,
    kind: 'Landmark' | 'Street',
    coordinate: MeetingCoordinate | null | undefined
  ) => {
    if (!hasValidCoordinate(coordinate)) return;
    const key = shortPlaceLabel(label).toLowerCase();
    if (picked.some((item) => shortPlaceLabel(item.label).toLowerCase() === key)) return;
    picked.push({
      id: `area-place-${id}`,
      label: shortPlaceLabel(label),
      subtitle: `${kind} · ${zone} · ${area}`,
      latitude: coordinate!.latitude,
      longitude: coordinate!.longitude,
    });
  };

  const inBarangay = (place: { barangay: string }) => placeMatchesBarangay(place.barangay, barangay);
  const specificLandmarks = directory.landmarks.filter(
    (place) =>
      inBarangay(place)
      && !place.id.startsWith('covered-court-')
      && !place.id.startsWith('barangay-hall-')
  );
  const streets = directory.streets.filter(inBarangay);
  const court = directory.landmarks.find((place) => place.id.startsWith('covered-court-') && inBarangay(place));
  const hall = directory.landmarks.find((place) => place.id.startsWith('barangay-hall-') && inBarangay(place));

  for (const place of specificLandmarks) push(place.id, place.label, 'Landmark', place.coordinate);
  for (const place of streets) push(place.label, place.label, 'Street', place.coordinate);
  if (court) push(court.id, court.label, 'Landmark', court.coordinate);
  if (hall) push(hall.id, hall.label, 'Landmark', hall.coordinate);

  return picked;
}

function insideSelectedArea(suggestion: StreetSuggestion, barangay: string, zone: string) {
  const text = `${suggestion.label} ${suggestion.subtitle || ''}`;
  if (zone && mentionsDifferentZone(text, zone)) return false;
  if (suggestion.id.startsWith('area-place-')) return true;
  if (!isStreetOrLandmark(suggestion)) return false;

  const label = shortPlaceLabel(suggestion.label).toLowerCase();
  if (zone && label === zone.toLowerCase()) return false;
  if (
    barangay
    && (label === barangay.toLowerCase() || label === shortBarangayName(barangay).toLowerCase())
  ) {
    return false;
  }

  if (barangay && hasValidCoordinate(suggestion) && !pinMatchesBarangay(suggestion, barangay)) {
    return false;
  }
  if (barangay && !mentionsBarangay(text, barangay) && !hasValidCoordinate(suggestion)) {
    return false;
  }
  return true;
}

function filterSuggestions(list: StreetSuggestion[], barangay: string, zone: string) {
  const seen = new Set<string>();
  return list.filter((place) => {
    if (!insideSelectedArea(place, barangay, zone)) return false;
    const key = shortPlaceLabel(place.label).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const livePlaceCache = new Map<string, StreetSuggestion[]>();

function polygonForBarangay(barangay: string) {
  return getElSalvadorBarangayPolygons().find(
    (item) => mentionsBarangay(item.name, barangay) || mentionsBarangay(barangay, item.name)
  ) ?? null;
}

function sampleAreaPoints(barangay: string): MeetingCoordinate[] {
  const ring = polygonForBarangay(barangay)?.coordinates ?? [];
  const anchor = areaCoordinate(barangay, '');
  if (!ring.length) return anchor ? [anchor] : [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of ring) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  const samples: MeetingCoordinate[] = [];
  const steps = 4;
  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const latitude = minLat + ((row + 0.5) / steps) * (maxLat - minLat);
      const longitude = minLng + ((column + 0.5) / steps) * (maxLng - minLng);
      if (pinMatchesBarangay({ latitude, longitude }, barangay)) {
        samples.push({ latitude, longitude });
      }
    }
  }

  const picked = anchor ? [anchor] : [];
  const stride = Math.max(1, Math.floor(samples.length / 8));
  for (let index = 0; index < samples.length && picked.length < 8; index += stride) {
    picked.push(samples[index]);
  }
  return picked.length ? picked : anchor ? [anchor] : [];
}

function barangaySearchBounds(barangay: string) {
  const ring = polygonForBarangay(barangay)?.coordinates ?? [];
  if (!ring.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of ring) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  const pad = 0.002;
  return {
    minLat: minLat - pad,
    maxLat: maxLat + pad,
    minLng: minLng - pad,
    maxLng: maxLng + pad,
  };
}

async function loadLiveAreaSuggestions(barangay: string, zone: string): Promise<StreetSuggestion[]> {
  const cacheKey = `${shortBarangayName(barangay).toLowerCase()}:live-place-names`;
  let live = livePlaceCache.get(cacheKey);
  if (!live) {
    live = await searchLiveMapboxPlaces(sampleAreaPoints(barangay), {
      inside: (point) => pinMatchesBarangay(point, barangay),
    });
    if (live.length) livePlaceCache.set(cacheKey, live);
  }

  const inArea = live.filter((place) => insideSelectedArea(place, barangay, zone));
  return filterSuggestions([...inArea, ...featuredPlacesForArea(barangay, zone)], barangay, zone);
}

function matchesTerm(suggestion: StreetSuggestion, term: string) {
  const haystack = `${suggestion.label} ${suggestion.subtitle || ''}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function suggestionKind(suggestion: StreetSuggestion) {
  const subtitle = suggestion.subtitle || '';
  if (subtitle.startsWith('Landmark')) return 'Landmark';
  if (subtitle.startsWith('Road')) return 'Road';
  if (subtitle.startsWith('Street')) return 'Street';
  return 'Place';
}

function offsetZoneCoordinate(zone: string, base: MeetingCoordinate): MeetingCoordinate {
  const match = zone.match(/(\d+)/);
  const num = match ? Number(match[1]) : 1;
  const letterBias = /b/i.test(zone) ? 1 : /a/i.test(zone) ? -1 : 0;
  return {
    latitude: base.latitude + ((num - 1) % 4) * 0.0009 - 0.0012,
    longitude: base.longitude + letterBias * 0.0011 + (((num - 1) % 3) - 1) * 0.0008,
  };
}

function pinMatchesBarangay(coordinate: MeetingCoordinate, barangay: string) {
  const geo = findElSalvadorBarangayAt(coordinate.latitude, coordinate.longitude);
  if (!geo) return false;
  const mapped = directoryBarangayName(geo.name) || geo.name;
  return (
    mentionsBarangay(mapped, barangay)
    || mentionsBarangay(barangay, mapped)
    || mentionsBarangay(geo.name, barangay)
  );
}

function distanceKm(from: MeetingCoordinate, to: MeetingCoordinate) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRad(to.latitude - from.latitude);
  const longitudeDelta = toRad(to.longitude - from.longitude);
  const fromLatitude = toRad(from.latitude);
  const toLatitude = toRad(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function nearestDirectoryPlace(
  coordinate: MeetingCoordinate,
  barangay: string
): { label: string; distanceMeters: number } | null {
  const directory = getAddressDirectory();
  let bestLabel: string | null = null;
  let bestDistance = Infinity;

  for (const place of [...directory.landmarks, ...directory.streets]) {
    if (!hasValidCoordinate(place.coordinate)) continue;
    const extra = 'subtitle' in place ? String(place.subtitle || '') : '';
    if (barangay && !mentionsBarangay(`${place.label} ${place.barangay} ${extra}`, barangay)) {
      continue;
    }
    const distance = distanceKm(coordinate, place.coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLabel = place.label;
    }
  }

  if (!bestLabel || bestDistance > 0.06) return null;
  return { label: bestLabel, distanceMeters: bestDistance * 1000 };
}

function isAreaOnlyLabel(label: string, barangay: string, zone: string) {
  const text = shortPlaceLabel(label).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const blocked = [barangay, shortBarangayName(barangay), zone, 'el salvador', 'el salvador city']
    .map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean);
  return blocked.includes(text);
}

function nearbyPlaceLabel(label: string, distanceMeters: number) {
  const name = shortPlaceLabel(label);
  if (distanceMeters <= 25) return name;
  return `near ${name}`;
}

async function resolvePrecisePinLabel(
  coordinate: MeetingCoordinate,
  barangay: string,
  zone: string
): Promise<string> {
  await ensureAddressDirectoryLoaded();
  const live = await nearestNamedPlaceAt(coordinate.latitude, coordinate.longitude);
  if (live && !isAreaOnlyLabel(live.label, barangay, zone)) {
    return nearbyPlaceLabel(live.label, live.distance);
  }

  const local = nearestDirectoryPlace(coordinate, barangay);
  if (local && !isAreaOnlyLabel(local.label, barangay, zone) && !/covered court|barangay hall/i.test(local.label)) {
    return nearbyPlaceLabel(local.label, local.distanceMeters);
  }

  const remote = await reverseGeocodeStreetOrLandmark(coordinate.latitude, coordinate.longitude);
  if (remote && !isAreaOnlyLabel(remote, barangay, zone)) return shortPlaceLabel(remote);

  return 'Pinned location';
}

async function resolveAreaMapCoordinate(
  barangay: string,
  zone: string
): Promise<{ coordinate: MeetingCoordinate; zoom: number } | null> {
  await ensureAddressDirectoryLoaded();
  const directory = getAddressDirectory();
  const area = shortBarangayName(barangay);

  if (zone) {
    const results = await searchStreetAddressSuggestions(`${zone}, ${area}, El Salvador City`);
    const match = results.find(
      (result) =>
        hasValidCoordinate(result)
        && isInsideElSalvadorCity(result.latitude, result.longitude)
        && pinMatchesBarangay(result, barangay)
    );
    if (match) {
      return {
        coordinate: { latitude: match.latitude, longitude: match.longitude },
        zoom: 17,
      };
    }

    const zoneHit = directory.zones.find(
      (item) =>
        item.name.toLowerCase() === zone.toLowerCase()
        && (mentionsBarangay(item.barangayName, barangay) || mentionsBarangay(barangay, item.barangayName))
    );
    if (zoneHit && hasValidCoordinate(zoneHit.coordinate)) {
      return { coordinate: offsetZoneCoordinate(zone, zoneHit.coordinate), zoom: 16.8 };
    }
  }

  const barangayHit = directory.barangays.find(
    (item) => mentionsBarangay(item.name, barangay) || mentionsBarangay(barangay, item.name)
  );
  if (barangayHit && hasValidCoordinate(barangayHit.coordinate)) {
    return { coordinate: barangayHit.coordinate, zoom: zone ? 16.8 : 15.2 };
  }

  return null;
}

export default function ElSalvadorPlaceField({
  value,
  onChange,
  barangay = '',
  zone = '',
  placeholder,
  variant = 'box',
  hasError = false,
  showMap = false,
  pinnedCoordinate = null,
  onResolvedPlace,
  locatingSaved = false,
}: Props) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<StreetSuggestion[]>([]);
  const [coordinate, setCoordinate] = useState<MeetingCoordinate | null>(
    hasValidCoordinate(pinnedCoordinate) ? pinnedCoordinate : null
  );
  const [focusCoordinate, setFocusCoordinate] = useState<MeetingCoordinate | null>(null);
  const [savedPinReady, setSavedPinReady] = useState(() => !hasValidCoordinate(pinnedCoordinate));
  const [focusZoom, setFocusZoom] = useState(15);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pinLabel, setPinLabel] = useState('');
  const skipReverseRef = useRef(false);
  const ignoreMapUntilRef = useRef(0);
  const editingRef = useRef(false);
  const selectingRef = useRef(false);
  const queryRef = useRef(query);
  const pinnedRef = useRef<MeetingCoordinate | null>(
    hasValidCoordinate(pinnedCoordinate) ? pinnedCoordinate : null
  );
  queryRef.current = query;
  const onChangeRef = useRef(onChange);
  const onResolvedRef = useRef(onResolvedPlace);
  onChangeRef.current = onChange;
  onResolvedRef.current = onResolvedPlace;
  const reverseRequestRef = useRef(0);
  const ready = Boolean(barangay && zone);
  const handleBasemapSettled = useCallback(() => setSavedPinReady(true), []);
  const suggestionOpacity = useRef(new Animated.Value(0)).current;
  const area = shortBarangayName(barangay);
  const areaLabel = ready ? `${area}, ${zone}` : barangay ? area : 'El Salvador City';
  const pill = variant === 'pill' && !showMap;

  useEffect(() => {
    if (editingRef.current) return;
    if (!value && hasValidCoordinate(pinnedCoordinate)) return;
    setQuery(value || '');
    if (!value && !queryRef.current.trim()) {
      pinnedRef.current = null;
      setCoordinate(null);
      setPinLabel('');
    }
  }, [pinnedCoordinate, value]);

  useEffect(() => {
    if (!hasValidCoordinate(pinnedCoordinate)) return;
    pinnedRef.current = pinnedCoordinate;
    setCoordinate(pinnedCoordinate);
    setPinLabel(value);
  }, [pinnedCoordinate, value]);

  useEffect(() => {
    // A saved pin owns the camera. The barangay or zone center is a different place.
    if (hasValidCoordinate(pinnedCoordinate)) {
      setFocusCoordinate(null);
      return undefined;
    }
    if (!barangay) {
      setFocusCoordinate(null);
      return undefined;
    }

    let cancelled = false;
    resolveAreaMapCoordinate(barangay, zone).then((next) => {
      if (cancelled || hasValidCoordinate(pinnedRef.current) || !next) return;
      setFocusCoordinate(next.coordinate);
      setFocusZoom(next.zoom);
    });

    return () => {
      cancelled = true;
    };
  }, [barangay, pinnedCoordinate, zone]);

  useEffect(() => {
    if (!open) {
      suggestionOpacity.setValue(0);
      return undefined;
    }
    suggestionOpacity.setValue(0);
    Animated.timing(suggestionOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [open, suggestionOpacity]);

  useEffect(() => {
    if (!ready || !open) {
      setLoading(false);
      return undefined;
    }

    const term = query.trim();
    if (!term || term === value.trim()) {
      let cancelled = false;
      setLoading(true);
      loadLiveAreaSuggestions(barangay, zone).then((places) => {
        if (cancelled) return;
        setSuggestions(places);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const instant = filterSuggestions(getInstantStreetSuggestions(term), barangay, zone)
      .filter((item) => matchesTerm(item, term));
    setSuggestions(instant);

    if (term.length < 2) {
      setLoading(false);
      return undefined;
    }

    const cacheKey = `${shortBarangayName(barangay).toLowerCase()}|${zone.toLowerCase()}|${term.toLowerCase()}`;
    const cached = searchResultCache.get(cacheKey);
    if (cached) {
      setSuggestions(
        filterSuggestions([...cached, ...instant], barangay, zone)
          .filter((item) => matchesTerm(item, term))
      );
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const near = areaCoordinate(barangay, zone);
        const [remote, named] = await Promise.all([
          searchMapboxPlaces(term, {
            proximity: near,
            bbox: barangaySearchBounds(barangay),
          }),
          findNamedPlaceCoordinate(term, near),
        ]);
        const namedSuggestion = named
          ? [{
              id: `named-place-${term.toLowerCase()}`,
              label: shortPlaceLabel(term),
              subtitle: 'Landmark',
              latitude: named.latitude,
              longitude: named.longitude,
            }]
          : [];
        const remoteResults = [...namedSuggestion, ...remote];
        if (remoteResults.length) searchResultCache.set(cacheKey, remoteResults);
        if (!cancelled) {
          setSuggestions(
            filterSuggestions([...remoteResults, ...instant], barangay, zone)
              .filter((item) => matchesTerm(item, term))
          );
        }
      } catch {
        if (!cancelled) setSuggestions(instant);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [barangay, open, query, ready, value, zone]);
  const commitPlace = useCallback(
    (label: string, nextCoordinate: MeetingCoordinate) => {
      const inside = isInsideElSalvadorCity(nextCoordinate.latitude, nextCoordinate.longitude);
      if (!inside) {
        setGpsError('That place is outside El Salvador City. The pin stays where it was.');
        return false;
      }

      const outsideBarangay = Boolean(barangay && !pinMatchesBarangay(nextCoordinate, barangay));
      skipReverseRef.current = true;
      ignoreMapUntilRef.current = Date.now() + 500;
      pinnedRef.current = nextCoordinate;
      const geoName = findElSalvadorBarangayAt(nextCoordinate.latitude, nextCoordinate.longitude)?.name;
      setGpsError(outsideBarangay ? `${label} is outside ${areaLabel}. The pin is on that place.` : null);
      setQuery(label);
      setPinLabel(label);
      setCoordinate(nextCoordinate);
      setOpen(false);
      setSuggestions([]);
      onChange(label);
      onResolvedPlace?.({
        label,
        coordinate: nextCoordinate,
        barangayName: directoryBarangayName(geoName),
      });
      return true;
    },
    [areaLabel, barangay, onChange, onResolvedPlace]
  );

  // A saved place name with no coordinate still gets a pin on that place.
  // A saved coordinate is never replaced by that search.
  useEffect(() => {
    if (hasValidCoordinate(pinnedCoordinate) || pinnedRef.current) return undefined;
    if (!showMap || !ready || editingRef.current) return undefined;
    if (hasValidCoordinate(coordinate)) {
      return undefined;
    }
    const label = value.trim();
    // "near …" is the name of a pin the user dropped. Do not move that pin onto the place.
    if (label.length < 3 || /^near\s/i.test(label)) return undefined;

    let cancelled = false;
    const near = areaCoordinate(barangay, zone);
    findNamedPlaceCoordinate(label, near).then(async (exact) => {
      if (cancelled || pinnedRef.current) return;
      if (exact && hasValidCoordinate(exact)) {
        commitPlace(shortPlaceLabel(label), exact);
        return;
      }
      const remote = await searchMapboxPlaces(label, { proximity: near });
      if (cancelled || pinnedRef.current) return;
      const wanted = shortPlaceLabel(label).toLowerCase();
      const match = remote.find((place) => shortPlaceLabel(place.label).toLowerCase() === wanted)
        || remote.find((place) => place.label.toLowerCase().includes(wanted));
      if (!match || !hasValidCoordinate(match)) return;
      commitPlace(shortPlaceLabel(match.label), {
        latitude: match.latitude,
        longitude: match.longitude,
      });
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [barangay, commitPlace, coordinate, pinnedCoordinate, ready, showMap, value, zone]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: StreetSuggestion) => {
      selectingRef.current = true;
      const label = shortPlaceLabel(suggestion.label);
      Keyboard.dismiss();
      if (!hasValidCoordinate(suggestion)) {
        onChange(label);
        setQuery(label);
        setOpen(false);
        setSuggestions([]);
        return;
      }
      let next = { latitude: suggestion.latitude, longitude: suggestion.longitude };
      if (isNamedWater(label)) {
        setLoading(true);
        try {
          const settled = await peopleSideWaterPoint(
            label,
            next,
            (point) => isInsideElSalvadorCity(point.latitude, point.longitude)
              && (!barangay || pinMatchesBarangay(point, barangay))
          );
          if (settled) next = settled;
        } finally {
          setLoading(false);
        }
      }
      commitPlace(label, next);
    },
    [barangay, commitPlace, onChange]
  );

  const handleMapCoordinate = useCallback(
    (next: MeetingCoordinate | null) => {
      if (!next || !hasValidCoordinate(next)) {
        if (queryRef.current.trim() && pinnedRef.current) return false;
        pinnedRef.current = null;
        setCoordinate(null);
        onResolvedRef.current?.(null);
        return true;
      }

      const echo =
        pinnedRef.current
        && Math.abs(pinnedRef.current.latitude - next.latitude) < 0.0000001
        && Math.abs(pinnedRef.current.longitude - next.longitude) < 0.0000001
        && Date.now() < ignoreMapUntilRef.current;
      if (echo) return true;

      if (!isInsideElSalvadorCity(next.latitude, next.longitude)) {
        setGpsError(`Keep the pin inside ${areaLabel}.`);
        return false;
      }

      const outsideBarangay = Boolean(barangay && !pinMatchesBarangay(next, barangay));
      pinnedRef.current = next;
      setCoordinate(next);
      setGpsError(outsideBarangay ? `That pin is outside ${areaLabel}. It stays where you dropped it.` : null);
      const geoName = findElSalvadorBarangayAt(next.latitude, next.longitude)?.name;
      const publish = (label: string) => {
        onResolvedRef.current?.({
          label,
          coordinate: next,
          barangayName: directoryBarangayName(geoName),
        });
      };

      if (editingRef.current) {
        const label = queryRef.current.trim() || 'Pinned location';
        setPinLabel(label);
        publish(label);
        return true;
      }

      const requestId = reverseRequestRef.current + 1;
      reverseRequestRef.current = requestId;
      publish(queryRef.current.trim() || 'Pinned location');
      setLoading(true);
      resolvePrecisePinLabel(next, barangay, zone)
        .then((label) => {
          if (reverseRequestRef.current !== requestId || editingRef.current) return;
          setQuery(label);
          setPinLabel(label);
          setOpen(false);
          onChange(label);
        })
        .finally(() => {
          if (reverseRequestRef.current === requestId) setLoading(false);
        });
      return true;
    },
    [areaLabel, barangay, onChange, zone]
  );

  const useGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    Keyboard.dismiss();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission is required to use GPS.');
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setGpsError('Turn on Location / GPS in your phone settings, then try again.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      if (
        !isInsideElSalvadorCity(next.latitude, next.longitude)
        || (barangay && !pinMatchesBarangay(next, barangay))
      ) {
        setGpsError(`You are outside ${areaLabel}. Move inside that area, then use GPS again.`);
        return;
      }

      const label = await resolvePrecisePinLabel(next, barangay, zone);
      commitPlace(label, next);
    } catch {
      setGpsError('Could not get your location. Turn on GPS and try again.');
    } finally {
      setGpsLoading(false);
    }
  }, [areaLabel, barangay, commitPlace, zone]);

  return (
    <View style={{ zIndex: 20, alignSelf: 'stretch', width: '100%' }}>
      <View
        style={{
          minHeight: 56,
          borderRadius: pill ? 999 : showMap ? 18 : 12,
          borderWidth: pill || showMap || hasError ? 1.5 : 0,
          borderColor: hasError ? '#ef4444' : '#e2e8f0',
          backgroundColor: hasError ? '#fef2f2' : '#f8fafc',
          paddingHorizontal: 16,
          justifyContent: 'center',
          opacity: ready ? 1 : 0.6,
          width: '100%',
        }}
        pointerEvents={ready ? 'auto' : 'none'}
      >
        <TextInput
          value={query}
          onChangeText={(next) => {
            editingRef.current = true;
            setQuery(next);
            if (gpsError) setGpsError(null);
            if (!showMap && value) onChange('');
            if (!next.trim()) {
              pinnedRef.current = null;
              setCoordinate(null);
              setPinLabel('');
              onChangeRef.current('');
              onResolvedRef.current?.(null);
              if (ready) setOpen(true);
              return;
            }
            setOpen(true);
          }}
          onFocus={() => {
            editingRef.current = true;
            if (ready) setOpen(true);
          }}
          onBlur={() => {
            const next = queryRef.current;
            editingRef.current = false;
            if (!showMap) return;
            if (!next.trim()) {
              pinnedRef.current = null;
              setCoordinate(null);
              setPinLabel('');
              onChangeRef.current('');
              onResolvedRef.current?.(null);
              return;
            }
            if (next !== value) onChangeRef.current(next);
            setTimeout(() => {
              if (selectingRef.current) {
                selectingRef.current = false;
                return;
              }
              setOpen(false);
            }, 180);
          }}
          editable={ready}
          placeholder={
            placeholder
            || (ready
              ? `Search a location in ${areaLabel}`
              : barangay
                ? 'Select a zone first'
                : 'Select a barangay and zone first')
          }
          placeholderTextColor="#94a3b8"
          autoCorrect={false}
          autoCapitalize="words"
          style={{ fontSize: 16, color: '#0f172a', paddingVertical: 14, paddingRight: 28, width: '100%' }}
        />
        {loading ? (
          <ActivityIndicator
            size="small"
            color="#1F7A8C"
            style={{ position: 'absolute', right: 16 }}
          />
        ) : null}
      </View>

      {open && ready && (loading || suggestions.length > 0 || (query.trim() !== '' && query.trim() !== value.trim())) ? (
        <Animated.View
          style={{
            marginTop: 8,
            width: '100%',
            overflow: 'hidden',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            backgroundColor: '#ffffff',
            zIndex: 30,
            opacity: suggestionOpacity,
          }}
        >
          <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, backgroundColor: '#f8fafc' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1F7A8C', letterSpacing: 0.3 }}>
              {areaLabel.toUpperCase()}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 11, color: '#64748b' }}>
              Live roads, streets, and landmarks
            </Text>
          </View>
          {suggestions.length === 0 ? (
            <Text style={{ paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: '#64748b' }}>
              {loading ? `Finding places in ${areaLabel}…` : `No locations found in ${areaLabel}. Try another name.`}
            </Text>
          ) : (
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              persistentScrollbar
              scrollEnabled={suggestions.length >= 3}
              showsVerticalScrollIndicator={suggestions.length >= 3}
              style={suggestions.length >= 3 ? { maxHeight: 176 } : undefined}
            >
              {suggestions.map((suggestion) => {
                const label = shortPlaceLabel(suggestion.label);
                const kind = suggestionKind(suggestion);
                const selected = Boolean(
                  coordinate
                  && Math.abs(suggestion.latitude - coordinate.latitude) < 0.00005
                  && Math.abs(suggestion.longitude - coordinate.longitude) < 0.00005
                );
                return (
                  <TouchableOpacity
                    key={suggestion.id}
                    onPress={() => handleSelectSuggestion(suggestion)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderTopWidth: 1,
                      borderTopColor: '#f1f5f9',
                      backgroundColor: selected ? '#e7f5f3' : '#ffffff',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? '#0f766e' : '#0f172a' }}>{label}</Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: '#64748b' }}>
                      {selected ? 'Selected' : kind} · {areaLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      ) : null}

      {showMap ? (
        <TouchableOpacity
          onPress={useGps}
          disabled={!ready || gpsLoading}
          activeOpacity={0.85}
          style={{
            marginTop: 8,
            minHeight: 44,
            borderRadius: 14,
            backgroundColor: ready ? '#16324F' : '#94a3b8',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            width: '100%',
          }}
        >
          {gpsLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <MaterialIcons name="gps-fixed" size={18} color="#ffffff" />
          )}
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
            {gpsLoading ? 'Finding GPS…' : 'Use GPS'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
        {!ready
          ? (barangay ? 'Select a zone first to search or pin your location.' : 'Select a barangay, then a zone, then pin your location.')
          : showMap
            ? `Tap once to drop the pin. Drag only moves the map. You can rename the search and the suggestions stay open. The pin does not move.`
            : `Live roads, streets, and landmarks in ${areaLabel} are listed under the search. After a place is chosen, you can rename it in the search.`}
      </Text>
      {gpsError ? (
        <Text style={{ marginTop: 6, fontSize: 12, color: '#b45309' }}>{gpsError}</Text>
      ) : null}

      {showMap && hasValidCoordinate(coordinate) ? (
        <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: '#0f766e' }}>
          Pin set at {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
        </Text>
      ) : null}
      {showMap ? (
        locatingSaved ? (
          <View
            style={{
              marginTop: 10,
              height: 280,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              backgroundColor: '#f8fafc',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator size="large" color="#16324F" />
            <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '700', color: '#16324F' }}>
              Loading location…
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
              Fetching the exact pin you saved
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 10, height: 280 }}>
            <MeetingPlaceMap
              coordinate={hasValidCoordinate(pinnedCoordinate) ? pinnedCoordinate : coordinate}
              onCoordinateChange={handleMapCoordinate}
              editable
              allowMapMarking={ready}
              restrictToCityBounds
              height={280}
              showUserLocation={false}
              showGpsButton={false}
              markerTitle="HOME"
              markerLabel={pinLabel}
              focusCoordinate={coordinate ? null : focusCoordinate}
              focusZoom={focusZoom}
              snapZoom={17}
              onBasemapSettled={handleBasemapSettled}
            />
            {!savedPinReady && hasValidCoordinate(pinnedCoordinate) ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderRadius: 12,
                  backgroundColor: '#f8fafc',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator size="large" color="#16324F" />
                <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '700', color: '#16324F' }}>
                  Loading location…
                </Text>
                <Text style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                  Opening the exact pin you saved
                </Text>
              </View>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}
