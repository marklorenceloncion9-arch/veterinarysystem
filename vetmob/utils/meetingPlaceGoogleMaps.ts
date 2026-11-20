import * as Location from 'expo-location';
import {
  ELSALVADOR_CITY_NAME,
  isInsideElSalvadorCity,
  parseCoordinatesFromGoogleMapsLink,
  type MeetingCoordinate,
} from '@/components/meetingPlaceMap.shared';

// Diri kuhaon ang URL gikan sa text.
export function extractUrlFromText(input: string): string {
  const text = input.trim();
  const urlMatch = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!urlMatch) return text;
  return urlMatch[0].replace(/[),.;\]]+$/g, '');
}

// Diri susihon kung mubo nga Google Maps link.
export function isShortGoogleMapsLink(url: string): boolean {
  return /(^https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url);
}

// Diri i-expand ang mubo nga Google Maps link.
export async function expandGoogleMapsLink(input: string): Promise<string> {
  const url = extractUrlFromText(input);
  if (!isShortGoogleMapsLink(url)) {
    return url;
  }

  const attempts: Array<() => Promise<string | null>> = [
    async () => {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      return response.url || null;
    },
    async () => {
      const response = await fetch(url, { method: 'GET', redirect: 'follow' });
      return response.url || null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const expanded = await attempt();
      if (expanded && expanded !== url) {
        return expanded;
      }
    } catch {
      // Try the next expansion method.
    }
  }

  return url;
}

// Diri kuhaon ang ngalan sa lugar gikan sa link.
function extractPlaceQueryFromGoogleMapsLink(input: string): string | null {
  const decoded = decodeURIComponent(input.replace(/\+/g, ' '));
  const queryMatch = decoded.match(/[?&](?:q|query)=([^&]+)/i);
  if (!queryMatch) return null;

  const query = queryMatch[1].trim();
  if (!query) return null;
  if (/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(query)) return null;
  if (/^loc:-?\d+(?:\.\d+)?[,\s]+-?\d+(?:\.\d+)?$/i.test(query)) return null;

  return query;
}

// Diri pangitaon ang coordinates sa ngalan sa lugar.
async function geocodePlaceQuery(query: string): Promise<MeetingCoordinate | null> {
  const searches = [
    `${query}, ${ELSALVADOR_CITY_NAME}, Philippines`,
    query,
  ];

  for (const search of searches) {
    try {
      const results = await Location.geocodeAsync(search);
      const match = results.find((result) =>
        isInsideElSalvadorCity(result.latitude, result.longitude)
      );
      if (match) {
        return { latitude: match.latitude, longitude: match.longitude };
      }
    } catch {
      // Try the next search query.
    }
  }

  return null;
}

// Diri kuhaon ang coordinates gikan sa Google Maps link.
export async function resolveGoogleMapsLink(input: string): Promise<MeetingCoordinate | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const expanded = await expandGoogleMapsLink(trimmed);
  const candidates = Array.from(new Set([expanded, extractUrlFromText(trimmed), trimmed]));

  for (const candidate of candidates) {
    const parsed = parseCoordinatesFromGoogleMapsLink(candidate);
    if (parsed) return parsed;
  }

  for (const candidate of candidates) {
    const placeQuery = extractPlaceQueryFromGoogleMapsLink(candidate);
    if (!placeQuery) continue;

    const geocoded = await geocodePlaceQuery(placeQuery);
    if (geocoded) return geocoded;
  }

  return null;
}
