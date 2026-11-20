import {
  ELSALVADOR_CITY_NAME,
  getElSalvadorBarangayPolygons,
  type MeetingCoordinate,
} from '@/components/meetingPlaceMap.shared';
import {
  ensureAddressDirectoryLoaded,
  formatBarangayLabel,
  getAddressDirectory,
  getAddressMatchScore,
  normalizeSearchText,
} from '@/utils/elsalvadorAddressDirectory';
import { searchMapboxPlaces } from '@/utils/mapbox';

export type StreetSuggestion = MeetingCoordinate & {
  id: string;
  label: string;
  subtitle?: string;
  score?: number;
};

const MAX_SUGGESTIONS = 15;

// Diri kuhaon ang tunga sa polygon.
function polygonCentroid(coordinates: MeetingCoordinate[]): MeetingCoordinate {
  let latitude = 0;
  let longitude = 0;

  for (const point of coordinates) {
    latitude += point.latitude;
    longitude += point.longitude;
  }

  const count = coordinates.length || 1;
  return {
    latitude: latitude / count,
    longitude: longitude / count,
  };
}

// Diri idugang ang suggestion kung wala pa.
function pushSuggestion(
  bucket: StreetSuggestion[],
  seen: Set<string>,
  suggestion: StreetSuggestion
) {
  const key = `${suggestion.label.toLowerCase()}|${suggestion.latitude.toFixed(5)}|${suggestion.longitude.toFixed(5)}`;
  if (seen.has(key)) return;
  seen.add(key);
  bucket.push(suggestion);
}

// Diri isagol ang mga suggestion nga walay doble.
function mergeSuggestions(groups: StreetSuggestion[][]): StreetSuggestion[] {
  const seen = new Set<string>();
  const merged: StreetSuggestion[] = [];

  for (const group of groups) {
    for (const suggestion of group) {
      pushSuggestion(merged, seen, suggestion);
    }
  }

  return merged
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, MAX_SUGGESTIONS);
}

// Diri pangitaon ang suggestion gikan sa local nga address.
function getLocalAddressSuggestions(query: string): StreetSuggestion[] {
  const directory = getAddressDirectory();
  const normalizedQuery = normalizeSearchText(query);
  const suggestions: StreetSuggestion[] = [];

  for (const barangay of directory.barangays) {
    const candidates = [barangay.name, ...barangay.aliases];
    const score = Math.max(...candidates.map((candidate) => getAddressMatchScore(query, candidate)));
    if (score <= 0) continue;

    suggestions.push({
      id: `barangay-${barangay.id}`,
      label: formatBarangayLabel(barangay.name),
      subtitle: 'Barangay',
      latitude: barangay.coordinate.latitude,
      longitude: barangay.coordinate.longitude,
      score: score + 10,
    });
  }

  for (const zone of directory.zones) {
    const zoneLabel = `${zone.name}, ${zone.barangayName}`;
    const score = Math.max(
      getAddressMatchScore(query, zoneLabel),
      getAddressMatchScore(query, zone.name),
      getAddressMatchScore(query, `${zone.name} ${zone.barangayName}`)
    );
    if (score <= 0) continue;

    suggestions.push({
      id: `zone-${zone.id}`,
      label: `${zoneLabel}, ${ELSALVADOR_CITY_NAME}`,
      subtitle: 'Zone',
      latitude: zone.coordinate.latitude,
      longitude: zone.coordinate.longitude,
      score: score + 8,
    });
  }

  for (const landmark of directory.landmarks) {
    const score = Math.max(
      getAddressMatchScore(query, landmark.label),
      ...landmark.keywords.map((keyword) => getAddressMatchScore(query, keyword))
    );
    if (score <= 0) continue;

    suggestions.push({
      id: landmark.id,
      label: `${landmark.label}, ${ELSALVADOR_CITY_NAME}`,
      subtitle: landmark.subtitle,
      latitude: landmark.coordinate.latitude,
      longitude: landmark.coordinate.longitude,
      score: score + 18,
    });
  }

  for (const street of directory.streets) {
    const score = Math.max(
      getAddressMatchScore(query, street.label),
      ...street.keywords.map((keyword) => getAddressMatchScore(query, keyword))
    );
    if (score <= 0) continue;

    suggestions.push({
      id: `street-${street.label}`,
      label: `${street.label}, ${ELSALVADOR_CITY_NAME}`,
      subtitle: `Street · ${street.barangay}`,
      latitude: street.coordinate.latitude,
      longitude: street.coordinate.longitude,
      score: score + 5,
    });
  }

  if (normalizedQuery.includes('zone')) {
    const zoneNumberMatch = normalizedQuery.match(/zone\s*([0-9]+[a-z-]*)/i);
    if (zoneNumberMatch) {
      const zoneToken = `Zone ${zoneNumberMatch[1].toUpperCase()}`;
      for (const zone of directory.zones) {
        if (!zone.name.toLowerCase().startsWith(zoneToken.toLowerCase())) continue;
        suggestions.push({
          id: `zone-pick-${zone.id}`,
          label: `${zone.name}, ${zone.barangayName}, ${ELSALVADOR_CITY_NAME}`,
          subtitle: 'Zone',
          latitude: zone.coordinate.latitude,
          longitude: zone.coordinate.longitude,
          score: 75,
        });
      }
    }
  }

  return suggestions
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, MAX_SUGGESTIONS);
}

// Diri pangitaon ang suggestion gikan sa daan nga barangay list.
function getLegacyBarangaySuggestions(query: string): StreetSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 1) return [];

  return getElSalvadorBarangayPolygons()
    .filter((barangay) => barangay.name.toLowerCase().includes(normalized))
    .map((barangay) => {
      const centroid = polygonCentroid(barangay.coordinates);
      return {
        id: `geo-barangay-${barangay.name}`,
        label: formatBarangayLabel(barangay.name),
        subtitle: 'Barangay',
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        score: getAddressMatchScore(query, barangay.name) + 10,
      };
    });
}

// Diri kuhaon ang suggestion gikan sa Mapbox.
async function getMapboxSuggestions(query: string): Promise<StreetSuggestion[]> {
  const results = await searchMapboxPlaces(query);
  return results.map((result) => ({
    ...result,
    score: getAddressMatchScore(query, result.label) + 14,
  }));
}

// Diri butangan og timeout ang promise.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

// Diri kuhaon dayon ang local nga suggestion.
export function getInstantStreetSuggestions(query: string): StreetSuggestion[] {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  void ensureAddressDirectoryLoaded();

  return mergeSuggestions([
    getLocalAddressSuggestions(trimmed),
    getLegacyBarangaySuggestions(trimmed),
  ]);
}

// Diri pangitaon ang street address suggestion.
export async function searchStreetAddressSuggestions(query: string): Promise<StreetSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  const localSuggestions = getInstantStreetSuggestions(trimmed);
  if (trimmed.length < 2) return localSuggestions;

  const remoteSuggestions = await withTimeout(getMapboxSuggestions(trimmed), 1600, []);
  return mergeSuggestions([localSuggestions, remoteSuggestions]);
}
