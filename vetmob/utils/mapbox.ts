import {
  ELSALVADOR_CITY_BOUNDS,
  ELSALVADOR_CITY_CENTER,
  ELSALVADOR_CITY_NAME,
  isInsideElSalvadorCity,
  type MeetingCoordinate,
} from '@/components/meetingPlaceMap.shared';

const TILE_SIZE = 256;

// Diri kuhaon ang Mapbox token.
export function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '').trim();
}

// Diri susihon kung naay Mapbox token.
export function hasMapboxToken(): boolean {
  return getMapboxToken().length > 0;
}

// Diri i-convert ang lat ug lng ngadto sa pixel.
function project(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

// Diri i-convert ang pixel ngadto sa lat ug lng.
function unproject(x: number, y: number, zoom: number): MeetingCoordinate {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude, longitude };
}

// Diri i-convert ang tuldok sa mapa ngadto sa coordinates.
export function pixelToCoordinate(
  locationX: number,
  locationY: number,
  width: number,
  height: number,
  center: MeetingCoordinate,
  zoom: number
): MeetingCoordinate {
  const centerPx = project(center.latitude, center.longitude, zoom);
  return unproject(centerPx.x - width / 2 + locationX, centerPx.y - height / 2 + locationY, zoom);
}

// Diri i-convert ang coordinates ngadto sa tuldok sa mapa.
export function coordinateToPixel(
  coordinate: MeetingCoordinate,
  width: number,
  height: number,
  center: MeetingCoordinate,
  zoom: number
): { x: number; y: number } {
  const centerPx = project(center.latitude, center.longitude, zoom);
  const pointPx = project(coordinate.latitude, coordinate.longitude, zoom);
  return {
    x: pointPx.x - centerPx.x + width / 2,
    y: pointPx.y - centerPx.y + height / 2,
  };
}

// Diri pugngan ang zoom sa 11 hangtod 20 aron makita ang eksaktong balay.
export function clampMapZoom(zoom: number): number {
  return Math.min(20, Math.max(11, zoom));
}

// Diri i-round ang zoom sa mapa.
export function snapMapZoom(zoom: number): number {
  return Math.round(clampMapZoom(zoom));
}

export type MapboxBasemapStyle = 'streets' | 'satellite';

const BASEMAP_STYLE_IDS: Record<MapboxBasemapStyle, string> = {
  streets: 'streets-v12',
  satellite: 'satellite-streets-v12',
};

export type MapboxTile = {
  key: string;
  url: string;
  left: number;
  top: number;
  size: number;
};

// Diri kuhaon ang mga tile nga makita sa mapa.
export function getVisibleMapboxTiles({
  center,
  zoom,
  width,
  height,
  style,
  offsetX = 0,
  offsetY = 0,
}: {
  center: MeetingCoordinate;
  zoom: number;
  width: number;
  height: number;
  style: MapboxBasemapStyle;
  offsetX?: number;
  offsetY?: number;
}): MapboxTile[] {
  const token = getMapboxToken();
  if (!token || width < 8 || height < 8) return [];

  const viewZoom = Math.min(17.5, Math.max(0, zoom));
  // Match the tile zoom to the view so streets show up sharp without waiting for a closer tile set.
  const zInt = Math.min(17, Math.max(0, Math.round(viewZoom)));
  const k = 2 ** (viewZoom - zInt);
  const centerPx = project(center.latitude, center.longitude, zInt);
  const padX = Math.min(TILE_SIZE, Math.abs(offsetX) + 8);
  const padY = Math.min(TILE_SIZE, Math.abs(offsetY) + 8);
  const worldLeft = centerPx.x - (width / 2 + padX) / k;
  const worldTop = centerPx.y - (height / 2 + padY) / k;
  const worldRight = centerPx.x + (width / 2 + padX) / k;
  const worldBottom = centerPx.y + (height / 2 + padY) / k;
  const tileCount = 2 ** zInt;
  const startX = Math.max(0, Math.floor(worldLeft / TILE_SIZE));
  const startY = Math.max(0, Math.floor(worldTop / TILE_SIZE));
  const endX = Math.min(tileCount - 1, Math.floor(worldRight / TILE_SIZE));
  const endY = Math.min(tileCount - 1, Math.floor(worldBottom / TILE_SIZE));
  const styleId = BASEMAP_STYLE_IDS[style];
  const size = TILE_SIZE * k;
  // Plain tiles are much smaller than @2x, so the map fills in instead of staying white.
  const tiles: MapboxTile[] = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      tiles.push({
        key: `${styleId}-${zInt}-${x}-${y}`,
        url:
          `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/${TILE_SIZE}/${zInt}/${x}/${y}` +
          `?access_token=${encodeURIComponent(token)}`,
        left: (x * TILE_SIZE - centerPx.x) * k + width / 2,
        top: (y * TILE_SIZE - centerPx.y) * k + height / 2,
        size,
      });
    }
  }

  return tiles;
}

// Diri kwentahon ang zoom nga kasud-an ang duha ka punto.
export function zoomToFitCoordinates(
  a: MeetingCoordinate,
  b: MeetingCoordinate,
  width: number,
  height: number
): number {
  if (!width || !height) return 16;

  for (let zoom = 17.5; zoom >= 12; zoom -= 0.25) {
    const start = project(a.latitude, a.longitude, zoom);
    const end = project(b.latitude, b.longitude, zoom);
    if (Math.abs(end.x - start.x) < width * 0.7 && Math.abs(end.y - start.y) < height * 0.7) {
      return zoom;
    }
  }

  return 11;
}

type StaticMapMarker = MeetingCoordinate & {
  color?: string;
  size?: 's' | 'l';
};

// Diri i-encode ang path para sa static map.
function encodePath(coordinates: MeetingCoordinate[]): string {
  const points = coordinates
    .map((point) => `${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`)
    .join(';');
  return `path-4+1F7A8C-0.9(${points})`;
}

// Diri i-encode ang border path para sa static map.
function encodeBorderPath(coordinates: MeetingCoordinate[]): string {
  const points = coordinates
    .map((point) => `${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`)
    .join(';');
  return `path-3+1F7A8C-1+1F7A8C-0.10(${points})`;
}

// Diri i-encode ang marker para sa static map.
function encodeMarker(marker: StaticMapMarker): string {
  const size = marker.size === 'l' ? 'pin-l' : 'pin-s';
  const color = (marker.color || '059669').replace('#', '');
  return `${size}+${color}(${marker.longitude},${marker.latitude})`;
}

// Diri himuon ang URL sa static map sa Mapbox.
export function buildMapboxStaticUrl({
  center,
  zoom,
  width,
  height,
  retina = false,
  markers = [],
  path = [],
  border = [],
  style = 'streets',
}: {
  center: MeetingCoordinate;
  zoom: number;
  width: number;
  height: number;
  retina?: boolean;
  markers?: StaticMapMarker[];
  path?: MeetingCoordinate[];
  border?: MeetingCoordinate[];
  style?: MapboxBasemapStyle;
}): string | null {
  const token = getMapboxToken();
  if (!token || width < 8 || height < 8) return null;

  const overlays = [
    ...(border.length >= 3 ? [encodeBorderPath(border)] : []),
    ...(path.length >= 2 ? [encodePath(path)] : []),
    ...markers.map(encodeMarker),
  ];
  const overlay = overlays.length ? `${overlays.join(',')}/` : '';
  const scale = retina ? '@2x' : '';
  const w = Math.max(1, Math.min(1280, Math.round(width)));
  const h = Math.max(1, Math.min(1280, Math.round(height)));

  const styleId = BASEMAP_STYLE_IDS[style];
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/${overlay}${center.longitude},${center.latitude},${zoom},0/${w}x${h}${scale}?access_token=${encodeURIComponent(token)}&logo=false&attribution=false`;
}

// Diri kuhaon ang ruta sa pagdrive gikan sa Mapbox.
export async function fetchMapboxDrivingPath(
  origin: MeetingCoordinate,
  destination: MeetingCoordinate
): Promise<MeetingCoordinate[]> {
  const token = getMapboxToken();
  if (!token) return [origin, destination];

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [origin, destination];
    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return [origin, destination];
    }

    const points: MeetingCoordinate[] = coordinates.map(([longitude, latitude]: [number, number]) => ({
      latitude,
      longitude,
    }));
    points[0] = origin;
    points[points.length - 1] = destination;
    return points;
  } catch {
    return [origin, destination];
  }
}

export type MapboxPlaceSuggestion = MeetingCoordinate & {
  id: string;
  label: string;
  subtitle?: string;
};

type MapboxSearchOptions = {
  proximity?: MeetingCoordinate | null;
  bbox?: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
};

function isWaterFeature(layer: string, featureClass: string, name: string) {
  const kind = `${featureClass} ${name}`.toLowerCase();
  return /river|stream|creek|water|canal|lake|falls|waterfall/.test(kind) && layer !== 'road';
}

function nearestMapPoint(
  coordinates: unknown,
  origin: MeetingCoordinate,
  inside?: (point: MeetingCoordinate) => boolean,
  water = false
): MeetingCoordinate | null {
  const points: MeetingCoordinate[] = [];
  const walk = (value: unknown) => {
    if (!Array.isArray(value) || !value.length) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const latitude = Number(value[1]);
      const longitude = Number(value[0]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        points.push({ latitude, longitude });
      }
      return;
    }
    value.forEach(walk);
  };
  walk(coordinates);

  const candidates = inside ? points.filter(inside) : points;
  if (!candidates.length) return null;

  // Rivers run into the mountains. The known place is the north end, toward the coast where people live.
  if (water) {
    return candidates.reduce((best, point) => (point.latitude > best.latitude ? point : best));
  }

  let best = candidates[0];
  let bestDistance = Infinity;
  for (const point of candidates) {
    const distance = (point.latitude - origin.latitude) ** 2 + (point.longitude - origin.longitude) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

function livePlaceKind(layer: string, roadClass: string): 'Road' | 'Street' | 'Landmark' {
  if (layer !== 'road') return 'Landmark';
  if (/^(motorway|trunk|primary|secondary|tertiary)/.test(roadClass)) return 'Road';
  return 'Street';
}

// Diri pangitaon ang mga lugar sa Mapbox.
export async function searchMapboxPlaces(
  query: string,
  options?: MapboxSearchOptions
): Promise<MapboxPlaceSuggestion[]> {
  const token = getMapboxToken();
  const trimmed = query.trim();
  if (!token || trimmed.length < 2) return [];

  const bounds = options?.bbox;
  const bbox = bounds
    ? [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].join(',')
    : [
        ELSALVADOR_CITY_BOUNDS.minLng,
        ELSALVADOR_CITY_BOUNDS.minLat,
        ELSALVADOR_CITY_BOUNDS.maxLng,
        ELSALVADOR_CITY_BOUNDS.maxLat,
      ].join(',');
  const near = options?.proximity;
  const proximity = near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)
    ? `${near.longitude},${near.latitude}`
    : `${ELSALVADOR_CITY_CENTER.longitude},${ELSALVADOR_CITY_CENTER.latitude}`;
  const queries = Array.from(
    new Set([trimmed, `${trimmed}, ${ELSALVADOR_CITY_NAME}`])
  );

  // Diri usa ka search sa Mapbox geocoding.
  const searchOne = async (searchQuery: string): Promise<MapboxPlaceSuggestion[]> => {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json` +
      `?access_token=${encodeURIComponent(token)}` +
      `&bbox=${bbox}&proximity=${proximity}&country=ph&limit=${bounds ? 10 : 8}&autocomplete=true` +
      `&types=${bounds ? 'poi,address' : 'poi,address,place,neighborhood,locality,district'}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1600);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return [];
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];

      return features.flatMap((feature: any) => {
        const [longitude, latitude] = feature?.center || [];
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        if (!isInsideElSalvadorCity(latitude, longitude)) return [];
        const placeTypes = Array.isArray(feature?.place_type) ? feature.place_type : [];
        const isPoi = placeTypes.includes('poi');
        const category = String(feature?.properties?.category || '').split(',')[0].trim();
        return [{
          id: String(feature.id || `${latitude},${longitude}`),
          label: specificPlaceLabel(
            String(feature.text || ''),
            shortenPlaceName(String(feature.place_name || '')),
            category
          ) || trimmed,
          subtitle: isPoi
            ? String(feature.place_name || 'Landmark')
            : String(feature.place_name || ELSALVADOR_CITY_NAME),
          latitude,
          longitude,
        }];
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  };

  const groups = await Promise.all(queries.map((searchQuery) => searchOne(searchQuery)));
  const seen = new Set<string>();
  const merged: MapboxPlaceSuggestion[] = [];
  for (const suggestion of groups.flat()) {
    const key = `${suggestion.label.toLowerCase()}|${suggestion.latitude.toFixed(5)}|${suggestion.longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(suggestion);
  }
  return merged.slice(0, bounds ? 25 : 12);
}

// Diri kuhaon ang buhi nga mga dalan ug landmark duol sa mga punto.
export async function searchLiveMapboxPlaces(
  points: MeetingCoordinate[],
  options?: { inside?: (point: MeetingCoordinate) => boolean }
): Promise<MapboxPlaceSuggestion[]> {
  const token = getMapboxToken();
  const origins = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );
  if (!token || !origins.length) return [];

  const searchOne = async (point: MeetingCoordinate): Promise<Array<MapboxPlaceSuggestion & { distance: number }>> => {
    const url =
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${point.longitude},${point.latitude}.json` +
      `?access_token=${encodeURIComponent(token)}` +
      '&radius=1600&limit=50&dedupe=true&layers=poi_label,road,natural_label';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return [];
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      return features.flatMap((feature: any) => {
        const properties = feature?.properties || {};
        const layer = String(properties.tilequery?.layer || '');
        const roadClass = String(properties.class || '').toLowerCase();
        const isRoadLayer = layer === 'road';
        if (isRoadLayer && /rail|ferry/.test(roadClass)) return [];
        const featureClass = String(properties.class || properties.type || '');
        const name = specificPlaceLabel(
          String(properties.name_en || properties.name || (isRoadLayer ? properties.ref : '') || ''),
          '',
          isRoadLayer ? '' : featureClass
        );
        if (name.length < 2) return [];
        const water = isWaterFeature(layer, featureClass, name);
        const nearest = nearestMapPoint(
          feature?.geometry?.coordinates,
          point,
          options?.inside,
          water
        );
        if (!nearest) return [];
        const { latitude, longitude } = nearest;
        if (!options?.inside && !isInsideElSalvadorCity(latitude, longitude)) return [];
        const kind = livePlaceKind(layer, roadClass);
        return [{
          id: `live-${kind.toLowerCase()}-${name.toLowerCase()}`,
          label: name,
          subtitle: kind,
          latitude,
          longitude,
          distance: Number(properties.tilequery?.distance) || 0,
          water,
        }];
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  };

  const groups = await Promise.all(origins.map((point) => searchOne(point)));
  const byName = new Map<string, MapboxPlaceSuggestion & { distance: number; water?: boolean }>();
  for (const place of groups.flat()) {
    const key = `${place.subtitle}|${place.label.toLowerCase()}`;
    const existing = byName.get(key);
    const closerToPeople = Boolean(place.water) && place.latitude > (existing?.latitude ?? -Infinity);
    if (!existing || closerToPeople || (!place.water && place.distance < existing.distance)) {
      byName.set(key, place);
    }
  }

  const rank = (place: MapboxPlaceSuggestion) => (
    place.subtitle === 'Landmark' ? 0 : place.subtitle === 'Road' ? 1 : 2
  );

  return [...byName.values()]
    .sort((left, right) => (
      rank(left) - rank(right) || left.distance - right.distance || left.label.localeCompare(right.label)
    ))
    .slice(0, 80)
    .map(({ distance: _distance, water: _water, ...place }) => place);
}

export function isNamedWater(name: string) {
  return /river|creek|stream|falls|waterfall/i.test(name);
}

// Diri ibalik ang bahin sa sapa nga duol sa mga tawo, dili ang bukid.
export async function peopleSideWaterPoint(
  name: string,
  near: MeetingCoordinate,
  inside?: (point: MeetingCoordinate) => boolean
): Promise<MeetingCoordinate | null> {
  const token = getMapboxToken();
  const wanted = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!token || wanted.length < 4) return null;

  const probes = [0, 0.012, 0.024].map((shift) => ({
    latitude: near.latitude + shift,
    longitude: near.longitude,
  }));

  const matches = await Promise.all(probes.map(async (probe) => {
    const url =
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${probe.longitude},${probe.latitude}.json` +
      `?access_token=${encodeURIComponent(token)}` +
      '&radius=2500&limit=40&dedupe=true&layers=natural_label';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return [];
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      return features.flatMap((feature: any) => {
        const properties = feature?.properties || {};
        const featureName = String(properties.name_en || properties.name || '');
        const compact = featureName.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!compact || (!compact.includes(wanted) && !wanted.includes(compact))) return [];
        const point = nearestMapPoint(feature?.geometry?.coordinates, probe, inside, true);
        return point ? [point] : [];
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }));

  const points = matches.flat();
  if (!points.length) return null;
  return points.reduce((best, point) => (point.latitude > best.latitude ? point : best));
}

export { ELSALVADOR_CITY_CENTER };

function readableDetail(detail: string) {
  const cleaned = detail.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/school|church|hospital|clinic|college|university|market|park|mosque|chapel|hall|court/.test(cleaned)) {
    return '';
  }
  return cleaned.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function specificPlaceLabel(name: string, placeName: string, detail: string) {
  const cleanName = name.trim();
  const leading = placeName.split(',')[0]?.trim() || '';
  const base = leading.length > cleanName.length ? leading : cleanName;
  const extra = readableDetail(detail);
  if (!base) return extra;
  if (!extra || base.toLowerCase().includes(extra.toLowerCase())) return base;
  return `${base} ${extra}`;
}

function compactPlaceName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function namedPlaceMatches(wanted: string, featureName: string) {
  const place = compactPlaceName(featureName);
  if (wanted.length < 8 || place.length < 8) return false;
  if (place === wanted) return true;
  const shorter = Math.min(place.length, wanted.length);
  const longer = Math.max(place.length, wanted.length);
  if (shorter / longer < 0.6) return false;
  return place.startsWith(wanted) || wanted.startsWith(place);
}

// Diri pangitaon ang eksaktong building sa ngalan, dili ang tunga sa barangay.
export async function findNamedPlaceCoordinate(
  name: string,
  near?: MeetingCoordinate | null
): Promise<MeetingCoordinate | null> {
  const token = getMapboxToken();
  const wanted = compactPlaceName(name.replace(/^near\s+/i, ''));
  if (!token || wanted.length < 8) return null;

  const origin = near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)
    ? near
    : ELSALVADOR_CITY_CENTER;
  const url =
    `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${origin.longitude},${origin.latitude}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    '&radius=3000&limit=50&dedupe=true&layers=poi_label';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  let matches: Array<MeetingCoordinate & { distance: number; exact: boolean }> = [];
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    matches = features.flatMap((feature: any) => {
      const properties = feature?.properties || {};
      const featureName = String(properties.name_en || properties.name || '');
      if (!namedPlaceMatches(wanted, featureName)) return [];
      const point = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
      const longitude = Number(point?.[0]);
      const latitude = Number(point?.[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      if (!isInsideElSalvadorCity(latitude, longitude)) return [];
      const distance = (latitude - origin.latitude) ** 2 + (longitude - origin.longitude) ** 2;
      return [{ latitude, longitude, distance, exact: compactPlaceName(featureName) === wanted }];
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!matches.length) return null;
  matches.sort((left, right) => Number(right.exact) - Number(left.exact) || left.distance - right.distance);
  const best = matches[0];
  return { latitude: best.latitude, longitude: best.longitude };
}

export async function nearestNamedPlaceAt(
  latitude: number,
  longitude: number
): Promise<{ label: string; distance: number; poi: boolean } | null> {
  const token = getMapboxToken();
  if (!token || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!isInsideElSalvadorCity(latitude, longitude)) return null;

  const url =
    `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${longitude},${latitude}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    '&radius=80&limit=15&dedupe=true&layers=poi_label,road';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    const places = features.flatMap((feature: any) => {
      const properties = feature?.properties || {};
      const layer = String(properties.tilequery?.layer || '');
      const roadClass = String(properties.class || '').toLowerCase();
      const isRoadLayer = layer === 'road';
      if (isRoadLayer && /rail|ferry/.test(roadClass)) return [];
      const label = specificPlaceLabel(
        String(properties.name_en || properties.name || (isRoadLayer ? properties.ref : '') || ''),
        '',
        isRoadLayer ? '' : String(properties.type || properties.class || '')
      );
      if (label.length < 2) return [];
      const distance = Number(properties.tilequery?.distance);
      return [{
        label,
        distance: Number.isFinite(distance) ? distance : 9999,
        poi: !isRoadLayer,
      }];
    });
    const nearbyPoi = places
      .filter((place) => place.poi && place.distance <= 60)
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearbyPoi) return nearbyPoi;
    const nearbyRoad = places
      .filter((place) => !place.poi && place.distance <= 35)
      .sort((left, right) => left.distance - right.distance)[0];
    return nearbyRoad || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Diri pamub-on ang ngalan sa lugar.
function shortenPlaceName(placeName: string) {
  const cleaned = String(placeName || '')
    .replace(/,?\s*Philippines$/i, '')
    .replace(/,?\s*Misamis Oriental$/i, '')
    .replace(/,?\s*El Salvador( City)?$/i, '')
    .trim();
  return cleaned || placeName;
}

const reverseGeocodeCache = new Map<string, string>();
const preciseReverseGeocodeCache = new Map<string, string>();

function preciseFeatureLabel(feature: any): string | null {
  const types = Array.isArray(feature?.place_type) ? feature.place_type : [];
  const text = String(feature?.text || '').trim();
  const addressNumber = String(feature?.address || '').trim();

  if (types.includes('poi') && text) {
    return shortenPlaceName(text);
  }

  if (types.includes('address')) {
    const street = [addressNumber, text].filter(Boolean).join(' ').trim();
    return shortenPlaceName(street || String(feature?.place_name || '').trim());
  }

  return null;
}

async function fetchReverseFeatures(
  longitude: number,
  latitude: number,
  types: string,
  limit: number
): Promise<any[]> {
  const token = getMapboxToken();
  if (!token) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&types=${types}&limit=${limit}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.features) ? data.features : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Diri pangitaon ang ngalan sa lugar gikan sa coordinates.
export async function reverseGeocodeMeetingPlace(
  latitude: number,
  longitude: number
): Promise<string | null> {
  const token = getMapboxToken();
  if (!token || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(key);
  if (cached) return cached;

  const features = await fetchReverseFeatures(longitude, latitude, 'address,poi,neighborhood,locality,place', 1);
  const feature = features[0];
  if (!feature) return null;
  const label = shortenPlaceName(String(feature.place_name || feature.text || '').trim());
  if (!label) return null;
  reverseGeocodeCache.set(key, label);
  return label;
}

// Diri kuhaon ang tukma nga street o landmark gikan sa pin.
export async function reverseGeocodeStreetOrLandmark(
  latitude: number,
  longitude: number
): Promise<string | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = preciseReverseGeocodeCache.get(key);
  if (cached) return cached;

  const features = await fetchReverseFeatures(longitude, latitude, 'poi,address', 5);
  const ranked = [...features].sort((left, right) => {
    const score = (feature: any) => {
      const types = Array.isArray(feature?.place_type) ? feature.place_type : [];
      if (types.includes('poi')) return 3;
      if (types.includes('address')) return 2;
      return 0;
    };
    return score(right) - score(left);
  });

  for (const feature of ranked) {
    const [featureLng, featureLat] = feature?.center || [];
    if (Number.isFinite(featureLat) && Number.isFinite(featureLng) && !isInsideElSalvadorCity(featureLat, featureLng)) {
      continue;
    }
    const label = preciseFeatureLabel(feature);
    if (!label) continue;
    preciseReverseGeocodeCache.set(key, label);
    return label;
  }

  return null;
}
