/** El Salvador City viewport padding (same as admin map). */
export const ELSALVADOR_CITY_BOUNDS = {
  minLat: 8.5,
  maxLat: 8.63,
  minLng: 124.44,
  maxLng: 124.6,
};

export const ELSALVADOR_CITY_CENTER = {
  latitude: 8.563,
  longitude: 124.5218,
};

export type MeetingCoordinate = {
  latitude: number;
  longitude: number;
};

export {
  clampRegionToCityBoundary as clampRegionToCityBounds,
  findElSalvadorBarangayAt,
  getElSalvadorBarangayPolygons,
  getElSalvadorCityBounds,
  getElSalvadorCityOutline,
  getElSalvadorCityRegionFromBoundary as getElSalvadorCityRegion,
  isInsideElSalvadorCity,
} from '@/utils/elsalvadorCityBoundary';

// Diri himuon ang Google Maps link sa direksyon.
export function buildGoogleMapsDirectionsUrl(
  destination: MeetingCoordinate,
  origin?: MeetingCoordinate | null
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: 'driving',
  });

  if (origin) {
    params.set('origin', `${origin.latitude},${origin.longitude}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Diri himuon ang Google Maps link para mag-marka.
export function buildGoogleMapsMarkingUrl(center?: MeetingCoordinate | null): string {
  const latitude = center?.latitude ?? ELSALVADOR_CITY_CENTER.latitude;
  const longitude = center?.longitude ?? ELSALVADOR_CITY_CENTER.longitude;
  return `https://www.google.com/maps/@${latitude},${longitude},17z`;
}

// Diri kuhaon ang coordinates gikan sa Google Maps link.
export function parseCoordinatesFromGoogleMapsLink(input: string): MeetingCoordinate | null {
  const text = decodeURIComponent(input.trim().replace(/\+/g, ' '));
  if (!text) return null;

  type Pattern = { regex: RegExp; latIndex: number; lngIndex: number };

  const patterns: Pattern[] = [
    { regex: /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /!4d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i, latIndex: 2, lngIndex: 1 },
    { regex: /[?&]cbll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]query=(-?\d+(?:\.\d+)?)%2c(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]q=loc:(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /geo:(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]center=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /[?&]destination=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /\/search\/(-?\d+(?:\.\d+)?),\+?(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
    { regex: /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i, latIndex: 1, lngIndex: 2 },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;

    const latitude = Number.parseFloat(match[pattern.latIndex]);
    const longitude = Number.parseFloat(match[pattern.lngIndex]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

export const ELSALVADOR_CITY_NAME = 'El Salvador City, Misamis Oriental';

// Diri himuon ang search query sa street address.
export function buildStreetGeocodeQuery(streetAddress: string): string {
  const street = streetAddress.trim();
  if (!street) return '';
  return `${street}, ${ELSALVADOR_CITY_NAME}, Philippines`;
}

export type MeetingPlaceInputMode = 'gps' | 'map' | 'manual';

export type MeetingPlaceMapProps = {
  coordinate: MeetingCoordinate | null;
  onCoordinateChange?: (
    coordinate: MeetingCoordinate | null
  ) => void | boolean | Promise<void | boolean>;
  editable?: boolean;
  height?: number;
  showUserLocation?: boolean;
  markerTitle?: string;
  additionalMarkers?: Array<MeetingCoordinate & { title?: string; id?: string | number }>;
  /** When true, GPS is fetched automatically and used as meeting place. */
  autoDetectGps?: boolean;
  /** When true, user can tap or drag on the map to set the meeting place. */
  allowMapMarking?: boolean;
  /** When false, hide the Use My GPS Location button. */
  showGpsButton?: boolean;
  /** Pan the map to this location without dropping a pin. */
  focusCoordinate?: MeetingCoordinate | null;
  focusZoom?: number;
  /** Zoom to this level when a place coordinate is set from outside the map. */
  snapZoom?: number;
  /** Name of the selected place, shown under the map. */
  markerLabel?: string;
  /** Lock the map view to El Salvador City and block pins outside the city. */
  restrictToCityBounds?: boolean;
  /** Show a YOU marker and route line from the fieldman's GPS to the meeting place. */
  showRouteLine?: boolean;
  /** Called when the first map image is on screen, or when loading gives up. */
  onBasemapSettled?: () => void;
};
