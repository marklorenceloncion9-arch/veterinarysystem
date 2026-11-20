import barangayGeoJson from '@/assets/geojson/elsalvador-barangays.json';

type LatLng = {
  latitude: number;
  longitude: number;
};

export type BarangayPolygon = {
  name: string;
  coordinates: LatLng[];
};

type GeoJsonFeature = {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    ADM4_EN?: string;
  };
};

type GeoJsonCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

let cachedPolygons: BarangayPolygon[] | null = null;
let cachedOutline: LatLng[] | null = null;
let cachedBounds: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null = null;

// Diri himuon og key ang usa ka punto.
function vertexKey(point: LatLng): string {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

// Diri himuon og key ang usa ka edge.
function edgeKey(a: LatLng, b: LatLng): string {
  const left = vertexKey(a);
  const right = vertexKey(b);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

// Diri i-convert balik ang key ngadto sa lat ug lng.
function parseLatLngKey(key: string): LatLng {
  const [latitude, longitude] = key.split(',').map(Number);
  return { latitude, longitude };
}

// Diri tabion ang mga edge para mahimong outline.
function stitchOuterRings(edges: Array<{ start: LatLng; end: LatLng }>): LatLng[][] {
  const adjacency = new Map<string, LatLng[]>();
  const unused = new Set<string>();

  // Diri idugang ang silingan nga punto.
  const addAdjacency = (from: LatLng, to: LatLng) => {
    const key = vertexKey(from);
    const neighbors = adjacency.get(key) ?? [];
    neighbors.push(to);
    adjacency.set(key, neighbors);
  };

  for (const edge of edges) {
    unused.add(edgeKey(edge.start, edge.end));
    addAdjacency(edge.start, edge.end);
    addAdjacency(edge.end, edge.start);
  }

  // Diri pangitaon ang sunod nga wala pa magamit nga silingan.
  const nextUnusedNeighbor = (from: LatLng): LatLng | null => {
    const neighbors = adjacency.get(vertexKey(from)) ?? [];
    return neighbors.find((neighbor) => unused.has(edgeKey(from, neighbor))) ?? null;
  };

  const rings: LatLng[][] = [];

  for (const startKey of adjacency.keys()) {
    const startPoint = parseLatLngKey(startKey);
    if (!nextUnusedNeighbor(startPoint)) continue;

    const ring: LatLng[] = [startPoint];
    let current = startPoint;
    let safety = unused.size + 2;

    while (safety > 0) {
      safety -= 1;
      const next = nextUnusedNeighbor(current);
      if (!next) break;
      unused.delete(edgeKey(current, next));
      current = next;
      ring.push(current);
      if (vertexKey(current) === vertexKey(startPoint) && ring.length > 2) break;
    }

    if (ring.length < 4) continue;
    if (vertexKey(ring[0]) !== vertexKey(ring[ring.length - 1])) {
      ring.push(ring[0]);
    }
    rings.push(ring);
  }

  return rings;
}

// Diri kwentahon ang area sa bounds sa ring.
function ringBoundsArea(ring: LatLng[]): number {
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
  return Math.max(0, maxLat - minLat) * Math.max(0, maxLng - minLng);
}

// Diri buhaton ang outline sa siyudad.
function buildCityOutline(): LatLng[] {
  const edgeCounts = new Map<string, { start: LatLng; end: LatLng; count: number }>();

  for (const barangay of parseBarangayPolygons()) {
    const ring = barangay.coordinates;
    if (ring.length < 4) continue;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const start = ring[i];
      const end = ring[i + 1];
      if (vertexKey(start) === vertexKey(end)) continue;
      const key = edgeKey(start, end);
      const existing = edgeCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        edgeCounts.set(key, { start, end, count: 1 });
      }
    }
  }

  const outerEdges = [...edgeCounts.values()]
    .filter((edge) => edge.count === 1)
    .map(({ start, end }) => ({ start, end }));
  const rings = stitchOuterRings(outerEdges);
  const outline = rings.sort((a, b) => ringBoundsArea(b) - ringBoundsArea(a))[0];
  if (!outline) return [];
  return outline;
}

// Diri basahon ang mga polygon sa barangay.
function parseBarangayPolygons(): BarangayPolygon[] {
  if (cachedPolygons) return cachedPolygons;

  const collection = barangayGeoJson as GeoJsonCollection;
  cachedPolygons = collection.features.map((feature) => ({
    name: feature.properties.ADM4_EN ?? 'Barangay',
    coordinates: feature.geometry.coordinates[0].map(([longitude, latitude]) => ({
      latitude,
      longitude,
    })),
  }));

  return cachedPolygons;
}

// Diri kwentahon ang utlanan sa siyudad.
function getCityBounds() {
  if (cachedBounds) return cachedBounds;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const barangay of parseBarangayPolygons()) {
    for (const point of barangay.coordinates) {
      minLat = Math.min(minLat, point.latitude);
      maxLat = Math.max(maxLat, point.latitude);
      minLng = Math.min(minLng, point.longitude);
      maxLng = Math.max(maxLng, point.longitude);
    }
  }

  cachedBounds = { minLat, maxLat, minLng, maxLng };
  return cachedBounds;
}

// Diri susihon kung naa sa sulod sa ring ang punto.
function pointInRing(latitude: number, longitude: number, ring: LatLng[]): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].latitude;
    const xi = ring[i].longitude;
    const yj = ring[j].latitude;
    const xj = ring[j].longitude;
    const intersects =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

// Diri kuhaon ang mga polygon sa barangay.
export function getElSalvadorBarangayPolygons(): BarangayPolygon[] {
  return parseBarangayPolygons();
}

// Diri kuhaon ang outline sa siyudad.
export function getElSalvadorCityOutline(): LatLng[] {
  if (!cachedOutline) {
    cachedOutline = buildCityOutline();
  }
  return cachedOutline;
}

// Diri kuhaon ang bounds sa siyudad.
export function getElSalvadorCityBounds() {
  return getCityBounds();
}

// Diri pangitaon ang barangay nga naa ang pin.
export function findElSalvadorBarangayAt(
  latitude: number,
  longitude: number
): BarangayPolygon | null {
  return (
    parseBarangayPolygons().find((barangay) =>
      pointInRing(latitude, longitude, barangay.coordinates)
    ) ?? null
  );
}

// Diri susihon kung naa sa sulod sa siyudad ang pin.
export function isInsideElSalvadorCity(latitude: number, longitude: number): boolean {
  return findElSalvadorBarangayAt(latitude, longitude) != null;
}

// Diri kuhaon ang map region sa siyudad.
export function getElSalvadorCityRegionFromBoundary() {
  const { minLat, maxLat, minLng, maxLng } = getCityBounds();
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: (maxLat - minLat) * 1.08,
    longitudeDelta: (maxLng - minLng) * 1.08,
  };
}

// Diri pugngan ang region nga dili molapas sa siyudad.
export function clampRegionToCityBoundary(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}) {
  const { minLat, maxLat, minLng, maxLng } = getCityBounds();
  const maxLatDelta = (maxLat - minLat) * 1.12;
  const maxLngDelta = (maxLng - minLng) * 1.12;
  const latitudeDelta = Math.min(Math.max(region.latitudeDelta, 0.008), maxLatDelta);
  const longitudeDelta = Math.min(Math.max(region.longitudeDelta, 0.008), maxLngDelta);
  const halfLat = latitudeDelta / 2;
  const halfLng = longitudeDelta / 2;

  return {
    latitude: Math.min(Math.max(region.latitude, minLat + halfLat), maxLat - halfLat),
    longitude: Math.min(Math.max(region.longitude, minLng + halfLng), maxLng - halfLng),
    latitudeDelta,
    longitudeDelta,
  };
}
