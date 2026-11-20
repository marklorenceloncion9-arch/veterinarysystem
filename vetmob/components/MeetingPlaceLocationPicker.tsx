import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/auth-context';
import { API_BASE_URL } from '@/config/api';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MeetingPlaceMap } from '@/components/MeetingPlaceMap';
import {
  ELSALVADOR_CITY_BOUNDS,
  ELSALVADOR_CITY_NAME,
  buildStreetGeocodeQuery,
  findElSalvadorBarangayAt,
  getElSalvadorBarangayPolygons,
  isInsideElSalvadorCity,
  type MeetingCoordinate,
  type MeetingPlaceInputMode,
} from '@/components/meetingPlaceMap.shared';
import { searchLiveMapboxPlaces, searchMapboxPlaces } from '@/utils/mapbox';
import {
  searchStreetAddressSuggestions,
  type StreetSuggestion,
} from '@/utils/streetAddressAutocomplete';

type MeetingPlaceLocationPickerProps = {
  coordinate: MeetingCoordinate | null;
  onCoordinateChange: (coordinate: MeetingCoordinate | null) => void;
  height?: number;
};

const LOCATION_MODES: Array<{
  id: MeetingPlaceInputMode;
  label: string;
  icon: 'gps-fixed' | 'place' | 'search';
  description: string;
}> = [
  {
    id: 'gps',
    label: 'GPS',
    icon: 'gps-fixed',
    description: 'Use your current location inside El Salvador City',
  },
  {
    id: 'map',
    label: 'Mark Map',
    icon: 'place',
    description: 'Tap the Mapbox map to drop a pin inside El Salvador City',
  },
  {
    id: 'manual',
    label: 'Address',
    icon: 'search',
    description: 'Search live roads, streets, and landmarks',
  },
];

const cityLiveCache = new Map<string, StreetSuggestion[]>();

function placeKey(place: StreetSuggestion) {
  return `${place.subtitle || ''}|${place.label.toLowerCase()}`;
}

function matchesTerm(place: StreetSuggestion, term: string) {
  const haystack = `${place.label} ${place.subtitle || ''}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function suggestionKind(place: StreetSuggestion) {
  const subtitle = place.subtitle || '';
  if (subtitle.startsWith('Landmark')) return 'Landmark';
  if (subtitle.startsWith('Road')) return 'Road';
  if (subtitle.startsWith('Street')) return 'Street';
  return 'Place';
}

async function loadLiveCityPlaces(): Promise<StreetSuggestion[]> {
  const cacheKey = 'el-salvador-city:live-place-names';
  const cached = cityLiveCache.get(cacheKey);
  if (cached) return cached;

  const points = getElSalvadorBarangayPolygons()
    .map((barangay) => {
      const ring = barangay.coordinates;
      if (!ring.length) return null;
      const latitude = ring.reduce((sum, point) => sum + point.latitude, 0) / ring.length;
      const longitude = ring.reduce((sum, point) => sum + point.longitude, 0) / ring.length;
      return { latitude, longitude };
    })
    .filter((point): point is MeetingCoordinate => point != null);

  const groups = await Promise.all(
    points.map((point) =>
      searchLiveMapboxPlaces([point], {
        inside: (candidate) => isInsideElSalvadorCity(candidate.latitude, candidate.longitude),
      })
    )
  );

  const seen = new Set<string>();
  const places: StreetSuggestion[] = [];
  for (const place of groups.flat()) {
    const key = placeKey(place);
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
  }

  const rank = (place: StreetSuggestion) => (
    suggestionKind(place) === 'Landmark' ? 0 : suggestionKind(place) === 'Road' ? 1 : 2
  );
  places.sort((left, right) => rank(left) - rank(right) || left.label.localeCompare(right.label));
  if (places.length) cityLiveCache.set(cacheKey, places);
  return places;
}

function compactPlaceName(value: string) {
  return value
    .toLowerCase()
    .replace(/^near\s+/, '')
    .replace(/high[\s-]*school/g, 'highschool')
    .replace(/[^a-z0-9]+/g, '');
}

function shortAreaName(name: string) {
  const value = String(name || '').trim();
  if (/poblacion/i.test(value)) return 'poblacion';
  if (/calongonan|san francisco/i.test(value)) return 'calongonan';
  if (/bolo/i.test(value)) return 'bolobolo';
  if (/quibonbon|kibonbon/i.test(value)) return 'quibonbon';
  return value.replace(/\s*\(.*\)\s*/, '').trim().toLowerCase();
}

function insideRegisteredBarangay(point: MeetingCoordinate, barangay: string) {
  if (!isInsideElSalvadorCity(point.latitude, point.longitude)) return false;
  if (!barangay) return true;
  const found = findElSalvadorBarangayAt(point.latitude, point.longitude);
  return Boolean(found && shortAreaName(found.name) === shortAreaName(barangay));
}

async function resolveRegisteredPlace(
  street: string,
  barangay: string,
  zone: string
): Promise<MeetingCoordinate | null> {
  const placeName = street.replace(/^near\s+/i, '').replace(/highschool/gi, 'High School').trim();
  if (!placeName) return null;
  const wanted = compactPlaceName(placeName);
  const live = await loadLiveCityPlaces();
  const liveMatch = live.find((place) => {
    const label = compactPlaceName(place.label);
    const named = label === wanted || label.includes(wanted) || wanted.includes(label);
    return named && insideRegisteredBarangay(place, barangay);
  });
  if (liveMatch) return { latitude: liveMatch.latitude, longitude: liveMatch.longitude };

  const queries = Array.from(new Set([
    [street, zone, barangay, 'El Salvador City'].filter(Boolean).join(', '),
    [placeName, zone, barangay, 'El Salvador City'].filter(Boolean).join(', '),
  ]));
  for (const query of queries) {
    const results = await searchStreetAddressSuggestions(query);
    const match = results.find(
      (place) =>
        insideRegisteredBarangay(place, barangay)
        && place.subtitle !== 'Barangay'
        && place.subtitle !== 'Zone'
        && compactPlaceName(place.label).includes(wanted.slice(0, Math.min(wanted.length, 8)))
    ) || results.find(
      (place) => insideRegisteredBarangay(place, barangay) && place.subtitle !== 'Zone'
    );
    if (match) return { latitude: match.latitude, longitude: match.longitude };
  }

  return null;
}

// Diri ang pilianan sa lokasyon sa meeting place.
export function MeetingPlaceLocationPicker({
  coordinate,
  onCoordinateChange,
  height = 260,
}: MeetingPlaceLocationPickerProps) {
  const [mode, setMode] = useState<MeetingPlaceInputMode>('map');
  const [streetAddress, setStreetAddress] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [streetSuggestions, setStreetSuggestions] = useState<StreetSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);
  const [usingRegistered, setUsingRegistered] = useState(false);
  const [registeredError, setRegisteredError] = useState<string | null>(null);
  const { refreshUser, token } = useAuth();
  const suggestionRequestId = useRef(0);
  const selectedStreetAddressRef = useRef<string | null>(null);
  const suppressStreetSuggestionsRef = useRef(false);

  // Diri ilisan ang mode sa pag-input sa lokasyon.
  const switchMode = useCallback(
    (nextMode: MeetingPlaceInputMode) => {
      if (nextMode === mode) return;
      setMode(nextMode);
      setSearchError(null);
      setStreetSuggestions([]);
      setShowStreetSuggestions(false);
      selectedStreetAddressRef.current = null;
      suppressStreetSuggestionsRef.current = false;
      onCoordinateChange(null);
    },
    [mode, onCoordinateChange]
  );

  useEffect(() => {
    if (mode !== 'manual') return undefined;
    if (suppressStreetSuggestionsRef.current) {
      setLoadingSuggestions(false);
      setShowStreetSuggestions(false);
      return undefined;
    }

    const term = streetAddress.trim();
    const requestId = suggestionRequestId.current + 1;
    suggestionRequestId.current = requestId;
    setShowStreetSuggestions(true);
    setLoadingSuggestions(true);

    const timer = setTimeout(async () => {
      try {
        const live = await loadLiveCityPlaces();
        const filtered = term ? live.filter((place) => matchesTerm(place, term)) : live;
        let next = filtered;
        if (term.length >= 2) {
          const remote = await searchMapboxPlaces(term, { bbox: ELSALVADOR_CITY_BOUNDS });
          const seen = new Set(filtered.map(placeKey));
          const extra = remote.filter((place) => {
            const key = placeKey(place);
            if (seen.has(key) || !matchesTerm(place, term)) return false;
            seen.add(key);
            return true;
          });
          next = [...filtered, ...extra];
        }
        if (suggestionRequestId.current !== requestId) return;
        setStreetSuggestions(next);
        setShowStreetSuggestions(true);
      } catch {
        if (suggestionRequestId.current !== requestId) return;
        setStreetSuggestions([]);
      } finally {
        if (suggestionRequestId.current === requestId) {
          setLoadingSuggestions(false);
        }
      }
    }, term.length >= 2 ? 160 : 0);

    return () => clearTimeout(timer);
  }, [mode, streetAddress]);

  // Diri pilion ang gisugyot nga street address.
  const handleSelectStreetSuggestion = useCallback(
    (suggestion: StreetSuggestion) => {
      selectedStreetAddressRef.current = suggestion.label;
      suppressStreetSuggestionsRef.current = true;
      setStreetAddress(suggestion.label);
      setStreetSuggestions([]);
      setShowStreetSuggestions(false);
      setSearchError(null);
      setLoadingSuggestions(false);
      suggestionRequestId.current += 1;
      Keyboard.dismiss();
      onCoordinateChange({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      });
    },
    [onCoordinateChange]
  );

  const useRegisteredLocation = useCallback(async () => {
    setUsingRegistered(true);
    setRegisteredError(null);
    setSearchError(null);
    try {
      const profile = await refreshUser() as {
        street?: string | null;
        barangay?: string | null;
        zone?: string | null;
        street_latitude?: number | string | null;
        street_longitude?: number | string | null;
      } | null;
      const street = String(profile?.street || '').trim();
      const barangay = String(profile?.barangay || '').trim();
      const zone = String(profile?.zone || '').trim();
      const latitude = Number(profile?.street_latitude);
      const longitude = Number(profile?.street_longitude);
      const saved = Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && !(latitude === 0 && longitude === 0)
        ? { latitude, longitude }
        : null;
      if (!street && !saved) {
        setRegisteredError('Add a location on your profile first.');
        return;
      }
      const next = saved || await resolveRegisteredPlace(street, barangay, zone);
      if (!next) {
        setRegisteredError('Save your profile location again so the exact pin can be used.');
        return;
      }
      const label = street || 'Registered location';
      selectedStreetAddressRef.current = label;
      suppressStreetSuggestionsRef.current = true;
      setStreetAddress(label);
      setStreetSuggestions([]);
      setShowStreetSuggestions(false);
      setMode('map');
      onCoordinateChange(next);
      if (!saved && token) {
        axios.put(
          `${API_BASE_URL}/api/mobile/user`,
          { street_latitude: next.latitude, street_longitude: next.longitude },
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(() => undefined);
      }
    } catch {
      setRegisteredError('Could not load your registered location.');
    } finally {
      setUsingRegistered(false);
    }
  }, [onCoordinateChange, refreshUser, token]);

  // Diri pangitaon ang lokasyon sa street address.
  const searchStreetAddress = useCallback(async () => {
    const query = buildStreetGeocodeQuery(streetAddress);
    if (!query) {
      setSearchError('Please enter your street address.');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const suggestions = await searchStreetAddressSuggestions(streetAddress);
      const match = suggestions.find((result) =>
        isInsideElSalvadorCity(result.latitude, result.longitude)
      );
      if (match) {
        selectedStreetAddressRef.current = match.label;
        suppressStreetSuggestionsRef.current = true;
        setStreetAddress(match.label);
        setStreetSuggestions([]);
        setShowStreetSuggestions(false);
        onCoordinateChange({
          latitude: match.latitude,
          longitude: match.longitude,
        });
        return;
      }

      const mapboxResults = await searchMapboxPlaces(streetAddress);
      const mapboxMatch = mapboxResults.find((result) =>
        isInsideElSalvadorCity(result.latitude, result.longitude)
      );
      if (mapboxMatch) {
        onCoordinateChange({
          latitude: mapboxMatch.latitude,
          longitude: mapboxMatch.longitude,
        });
        return;
      }

      const results = await Location.geocodeAsync(query);
      if (!results.length) {
        setSearchError('Address not found. Try a more complete street line within El Salvador City.');
        onCoordinateChange(null);
        return;
      }

      const bestMatch = results.find((result) =>
        isInsideElSalvadorCity(result.latitude, result.longitude)
      );

      if (!bestMatch) {
        setSearchError('That address is outside El Salvador City. Please enter an address inside the city.');
        onCoordinateChange(null);
        return;
      }

      onCoordinateChange({
        latitude: bestMatch.latitude,
        longitude: bestMatch.longitude,
      });
    } catch {
      setSearchError('Could not search that address. Check your connection and try again.');
      onCoordinateChange(null);
    } finally {
      setSearching(false);
    }
  }, [onCoordinateChange, streetAddress]);

  return (
    <View>
      <View className="mb-2 flex-row gap-2">
        {LOCATION_MODES.map((option) => {
          const active = mode === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => switchMode(option.id)}
              className={`flex-1 rounded-xl border px-2 py-3 ${
                active
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/30'
                  : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800'
              }`}
            >
              <MaterialIcons
                name={option.icon}
                size={18}
                color={active ? '#1F7A8C' : '#64748b'}
                style={{ alignSelf: 'center' }}
              />
              <Text
                className={`mt-1 text-center text-xs font-bold ${
                  active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Drop a pin on the map for the exact meeting place. GPS uses the phone's current location, which is often not that place.
      </Text>

      <TouchableOpacity
        onPress={useRegisteredLocation}
        disabled={usingRegistered}
        activeOpacity={0.85}
        className="mb-3 flex-row items-center justify-center rounded-full bg-navy px-4 py-3"
        style={{ opacity: usingRegistered ? 0.75 : 1 }}
      >
        {usingRegistered ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <MaterialIcons name="home" size={18} color="#ffffff" />
        )}
        <Text className="ml-2 text-sm font-semibold text-white">
          {usingRegistered ? 'Finding your location…' : 'Use my registered location'}
        </Text>
      </TouchableOpacity>
      {registeredError ? (
        <Text className="mb-3 text-xs text-amber-700 dark:text-amber-300">{registeredError}</Text>
      ) : null}

      {mode === 'gps' && (
        <MeetingPlaceMap
          coordinate={coordinate}
          onCoordinateChange={onCoordinateChange}
          editable
          autoDetectGps
          restrictToCityBounds
          height={height}
        />
      )}

      {mode === 'map' && (
        <MeetingPlaceMap
          coordinate={coordinate}
          onCoordinateChange={onCoordinateChange}
          editable
          allowMapMarking
          restrictToCityBounds
          height={Math.max(height, 360)}
          showUserLocation={false}
          snapZoom={17}
        />
      )}

      {mode === 'manual' && (
        <View>
          <Text className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">City</Text>
          <View className="mb-4 flex-row items-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-600 dark:bg-slate-700/60">
            <MaterialIcons name="location-city" size={18} color="#64748b" />
            <Text className="ml-3 flex-1 text-base text-slate-700 dark:text-slate-200">
              {ELSALVADOR_CITY_NAME}
            </Text>
          </View>

          <Text className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Location
          </Text>
          <View className="relative z-10">
            <TextInput
              value={streetAddress}
              onChangeText={(value) => {
                if (
                  suppressStreetSuggestionsRef.current &&
                  value !== selectedStreetAddressRef.current
                ) {
                  suppressStreetSuggestionsRef.current = false;
                  selectedStreetAddressRef.current = null;
                  if (!value.trim()) onCoordinateChange(null);
                }

                setStreetAddress(value);
                if (searchError) setSearchError(null);
              }}
              placeholder="Search a location in El Salvador City"
              placeholderTextColor="#94a3b8"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-base text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              autoCorrect={false}
              autoCapitalize="words"
            />
            {loadingSuggestions && (
              <View className="absolute right-3 top-3.5">
                <ActivityIndicator size="small" color="#1F7A8C" />
              </View>
            )}
          </View>

          {showStreetSuggestions && (loadingSuggestions || streetSuggestions.length > 0 || streetAddress.trim() !== '') ? (
            <View className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
              <View className="bg-slate-50 px-3.5 pb-2 pt-2.5 dark:bg-slate-900/40">
                <Text className="text-[11px] font-bold tracking-wide text-[#1F7A8C]">
                  EL SALVADOR CITY
                </Text>
                <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Live roads, streets, and landmarks
                </Text>
              </View>
              {streetSuggestions.length === 0 ? (
                <Text className="px-3.5 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                  {loadingSuggestions
                    ? 'Finding live places in El Salvador City…'
                    : 'No location in El Salvador City matches that.'}
                </Text>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  persistentScrollbar
                  scrollEnabled={streetSuggestions.length >= 3}
                  showsVerticalScrollIndicator={streetSuggestions.length >= 3}
                  style={streetSuggestions.length >= 3 ? { maxHeight: 176 } : undefined}
                >
                  {streetSuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={`${suggestion.id}-${index}`}
                      onPress={() => handleSelectStreetSuggestion(suggestion)}
                      className="border-t border-slate-100 px-3.5 py-3 dark:border-slate-700"
                    >
                      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {suggestion.label}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {suggestionKind(suggestion)} · {ELSALVADOR_CITY_NAME}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          <Text className="mt-1 text-xs text-slate-400">
            Live roads, streets, and landmarks in El Salvador City are listed under the search.
          </Text>

          <TouchableOpacity
            onPress={searchStreetAddress}
            disabled={searching}
            className="mt-3 flex-row items-center justify-center rounded-full bg-navy px-4 py-3"
            style={{ opacity: searching ? 0.75 : 1 }}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <MaterialIcons name="search" size={18} color="#ffffff" />
            )}
            <Text className="ml-2 text-sm font-semibold text-white">
              {searching ? 'Searching…' : 'Search Place'}
            </Text>
          </TouchableOpacity>

          {searchError && (
            <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
              <Text className="text-xs text-amber-700 dark:text-amber-300">{searchError}</Text>
            </View>
          )}

          <View className="mt-4">
            <MeetingPlaceMap
              coordinate={coordinate}
              onCoordinateChange={onCoordinateChange}
              editable={false}
              restrictToCityBounds
              height={height}
              showUserLocation={false}
            />
          </View>
        </View>
      )}
    </View>
  );
}
