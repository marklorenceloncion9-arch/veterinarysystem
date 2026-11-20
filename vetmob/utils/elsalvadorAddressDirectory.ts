import {
  ELSALVADOR_CITY_CENTER,
  ELSALVADOR_CITY_NAME,
  getElSalvadorBarangayPolygons,
  type MeetingCoordinate,
} from '@/components/meetingPlaceMap.shared';
import { API_BASE_URL } from '@/config/api';
import axios from 'axios';

export type AddressDirectoryBarangay = {
  id: number;
  name: string;
  aliases: string[];
  coordinate: MeetingCoordinate;
};

export type AddressDirectoryZone = {
  id: number;
  barangayId: number;
  barangayName: string;
  name: string;
  coordinate: MeetingCoordinate;
};

export type AddressDirectoryLandmark = {
  id: string;
  label: string;
  keywords: string[];
  subtitle: string;
  barangay: string;
  coordinate: MeetingCoordinate;
};

type ApiBarangay = { id: number; name: string };
type ApiZone = { id: number; barangay_id: number; name: string };

const BARANGAY_ALIAS_GROUPS: Array<{ name: string; aliases: string[] }> = [
  { name: 'Amoros', aliases: ['amoros'] },
  { name: 'Bolisong', aliases: ['bolisong'] },
  { name: 'Cogon', aliases: ['cogon'] },
  { name: 'Himaya', aliases: ['himaya'] },
  { name: 'Hinigdaan', aliases: ['hinigdaan', 'tag-ilas', 'tag ilas'] },
  { name: 'Kalabaylabay', aliases: ['kalabaylabay', 'kalabay labay'] },
  { name: 'Kibonbon', aliases: ['kibonbon'] },
  { name: 'Molugan', aliases: ['molugan'] },
  {
    name: 'Pedro S. Baculio (Bolo-Bolo)',
    aliases: ['bolobolo', 'bolo-bolo', 'baculio', 'pedro s baculio', 'pedro sa baculio'],
  },
  {
    name: 'Poblacion (city center)',
    aliases: ['poblacion', 'city center', 'poblacion city center', 'city hall', 'night cafe', 'night cafè'],
  },
  { name: 'Quibonbon', aliases: ['quibonbon'] },
  {
    name: 'San Francisco de Asis (Calongonan)',
    aliases: ['calongonan', 'san francisco de asis', 'san francisco', 'abaga', 'sikiop'],
  },
  { name: 'Sambulawan', aliases: ['sambulawan'] },
  { name: 'Sinaloc', aliases: ['sinaloc'] },
  { name: 'Taytay', aliases: ['taytay'] },
  { name: 'Ulaliman', aliases: ['ulaliman', 'divine mercy', 'mercy shrine'] },
];

const STATIC_ZONES_BY_BARANGAY: Record<string, string[]> = {
  Amoros: ['Zone 1', 'Zone 2', 'Zone 3'],
  Bolisong: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
  Cogon: ['Zone 1', 'Zone 2', 'Zone 3'],
  Himaya: ['Zone 1', 'Zone 2', 'Zone 3'],
  Hinigdaan: ['Zone 1', 'Zone 2', 'Zone 3'],
  Kalabaylabay: ['Zone 1', 'Zone 2', 'Zone 3'],
  Molugan: Array.from({ length: 15 }, (_, index) => `Zone ${index + 1}`),
  'Pedro S. Baculio (Bolo-Bolo)': ['Zone 1', 'Zone 2', 'Zone 3'],
  'Poblacion (city center)': ['Zone 1', 'Zone 2', 'Zone 3'],
  Quibonbon: ['Zone 1', 'Zone 2', 'Zone 3'],
  'San Francisco de Asis (Calongonan)': ['Zone 1', 'Zone 2', 'Zone 3'],
  Sambulawan: ['Zone 1', 'Zone 2', 'Zone 3'],
  Sinaloc: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6'],
  Taytay: ['Zone 1-A', 'Zone 1-B', 'Zone 2', 'Zone 3'],
  Ulaliman: ['Zone 1', 'Zone 2', 'Zone 3'],
};

const COMMON_STREETS: Array<{ label: string; keywords: string[]; barangay: string }> = [
  { label: 'National Highway', keywords: ['national highway', 'highway', 'butuan', 'cagayan', 'iligan road'], barangay: 'Poblacion' },
  { label: 'Laguindingan Road', keywords: ['laguindingan', 'airport road'], barangay: 'Poblacion' },
  { label: 'Divine Mercy Hills Road', keywords: ['divine mercy hills', 'psb ulaliman', 'mercy hills'], barangay: 'Ulaliman' },
  { label: 'Molugan Road', keywords: ['molugan road'], barangay: 'Molugan' },
  { label: 'Poblacion Main Road', keywords: ['poblacion road', 'main road poblacion'], barangay: 'Poblacion' },
  { label: 'Macajalar Bay Coastal Road', keywords: ['macajalar', 'coastal road', 'bay road'], barangay: 'Ulaliman' },
];

const LANDMARKS: Array<Omit<AddressDirectoryLandmark, 'coordinate'>> = [
  {
    id: 'divine-mercy-shrine',
    label: 'Divine Mercy Shrine',
    keywords: ['divine mercy shrine', 'divine mercy', 'mercy shrine', 'shrine ulaliman'],
    subtitle: 'Landmark · Ulaliman',
    barangay: 'Ulaliman',
  },
  {
    id: 'our-lady-snows',
    label: 'Our Lady of the Snows Parish Church',
    keywords: ['our lady of the snows', 'snows church', 'parish church', 'lady of snows'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'city-hall',
    label: 'El Salvador City Hall',
    keywords: ['city hall', 'municipal hall', 'city government', 'elsalvador city hall'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'house-pasalubong',
    label: 'House of Pasalubong',
    keywords: ['house of pasalubong', 'pasalubong'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'tuburan-spring',
    label: 'Tuburan Spring',
    keywords: ['tuburan spring', 'tuburan'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'tag-ilas-falls',
    label: 'Tag-ilas Falls',
    keywords: ['tag-ilas falls', 'tag ilas falls', 'tagilas'],
    subtitle: 'Landmark · Hinigdaan',
    barangay: 'Hinigdaan',
  },
  {
    id: 'abaga-falls',
    label: 'Abaga Falls',
    keywords: ['abaga falls', 'abaga'],
    subtitle: 'Landmark · Calongonan',
    barangay: 'Calongonan',
  },
  {
    id: 'sikiop-falls',
    label: 'Sikiop Falls',
    keywords: ['sikiop falls', 'sikiop'],
    subtitle: 'Landmark · Calongonan',
    barangay: 'Calongonan',
  },
  {
    id: 'pagasa-planetarium',
    label: 'PAGASA Planetarium',
    keywords: ['pagasa', 'planetarium'],
    subtitle: 'Landmark · Molugan',
    barangay: 'Molugan',
  },
  {
    id: 'night-cafe',
    label: 'El Salvador Night Cafe',
    keywords: ['night cafe', 'night cafè', 'night market'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'city-gymnasium',
    label: 'El Salvador City Gymnasium',
    keywords: ['gymnasium', 'city gym', 'sports complex', 'basketball gym'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'city-plaza',
    label: 'El Salvador City Plaza',
    keywords: ['plaza', 'town plaza', 'city plaza', 'park', 'people park'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'public-market',
    label: 'El Salvador Public Market',
    keywords: ['public market', 'market', 'palengke'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
  {
    id: 'molugan-port',
    label: 'Molugan Port',
    keywords: ['molugan port', 'port', 'pier', 'wharf'],
    subtitle: 'Landmark · Molugan',
    barangay: 'Molugan',
  },
  {
    id: 'city-rhu',
    label: 'El Salvador Rural Health Unit',
    keywords: ['rhu', 'health center', 'clinic', 'hospital', 'rural health'],
    subtitle: 'Landmark · Poblacion',
    barangay: 'Poblacion',
  },
];

// Diri kuhaon ang mubo nga ngalan sa barangay.
function barangayShortName(name: string): string {
  if (name.includes('Poblacion')) return 'Poblacion';
  if (name.includes('Calongonan')) return 'Calongonan';
  if (name.includes('Bolo')) return 'Bolobolo';
  return name;
}

const BARANGAY_PLACE_LANDMARKS: Array<Omit<AddressDirectoryLandmark, 'coordinate'>> =
  BARANGAY_ALIAS_GROUPS.flatMap((group) => {
    const shortName = barangayShortName(group.name);
    const slug = shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return [
      {
        id: `covered-court-${slug}`,
        label: `${shortName} Covered Court`,
        keywords: [
          'basketball court',
          'covered court',
          'gymnasium',
          'gym',
          'court',
          `${shortName} court`,
          `${shortName} basketball`,
        ],
        subtitle: `Landmark · ${shortName}`,
        barangay: group.name,
      },
      {
        id: `barangay-hall-${slug}`,
        label: `${shortName} Barangay Hall`,
        keywords: ['barangay hall', 'brgy hall', 'barangay office', `${shortName} hall`],
        subtitle: `Landmark · ${shortName}`,
        barangay: group.name,
      },
    ];
  });

const DIRECTORY_TO_GEOJSON_BARANGAY: Record<string, string> = {
  'Pedro S. Baculio (Bolo-Bolo)': 'Bolobolo',
  'Poblacion (city center)': 'Poblacion',
  'San Francisco de Asis (Calongonan)': 'Calongonan',
  Quibonbon: 'Poblacion',
};

let cachedBarangayCoordinates: Map<string, MeetingCoordinate> | null = null;
let cachedDirectory:
  | {
      barangays: AddressDirectoryBarangay[];
      zones: AddressDirectoryZone[];
      landmarks: AddressDirectoryLandmark[];
      streets: Array<{ label: string; keywords: string[]; barangay: string; coordinate: MeetingCoordinate }>;
    }
  | null = null;
let directoryLoadPromise: Promise<void> | null = null;

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

// Diri buhaton ang lookup sa coordinates sa barangay.
function getBarangayCoordinateLookup(): Map<string, MeetingCoordinate> {
  if (cachedBarangayCoordinates) return cachedBarangayCoordinates;

  const lookup = new Map<string, MeetingCoordinate>();
  const polygons = getElSalvadorBarangayPolygons();

  for (const barangay of polygons) {
    lookup.set(barangay.name.toLowerCase(), polygonCentroid(barangay.coordinates));
  }

  for (const group of BARANGAY_ALIAS_GROUPS) {
    const mappedGeoJsonName = DIRECTORY_TO_GEOJSON_BARANGAY[group.name];
    const polygon = mappedGeoJsonName
      ? polygons.find((item) => item.name.toLowerCase() === mappedGeoJsonName.toLowerCase())
      : polygons.find(
          (item) =>
            item.name.toLowerCase() === group.name.toLowerCase() ||
            group.aliases.some((alias) => alias === item.name.toLowerCase())
        );

    if (polygon) {
      lookup.set(group.name.toLowerCase(), polygonCentroid(polygon.coordinates));
    }
  }

  cachedBarangayCoordinates = lookup;
  return lookup;
}

// Diri pangitaon ang coordinates sa barangay.
function resolveBarangayCoordinate(barangayName: string): MeetingCoordinate {
  const lookup = getBarangayCoordinateLookup();
  const direct = lookup.get(barangayName.toLowerCase());
  if (direct) return direct;

  const polygons = getElSalvadorBarangayPolygons();
  const mappedName = DIRECTORY_TO_GEOJSON_BARANGAY[barangayName] ?? barangayName;
  const polygon = polygons.find((item) => item.name.toLowerCase() === mappedName.toLowerCase());
  if (polygon) return polygonCentroid(polygon.coordinates);

  return ELSALVADOR_CITY_CENTER;
}

// Diri buhaton ang default nga lista sa barangay ug zone.
function buildStaticDirectory() {
  const barangays: AddressDirectoryBarangay[] = BARANGAY_ALIAS_GROUPS.map((group, index) => ({
    id: index + 1,
    name: group.name,
    aliases: group.aliases,
    coordinate: resolveBarangayCoordinate(group.name),
  }));

  const zones: AddressDirectoryZone[] = [];
  for (const barangay of barangays) {
    const zoneNames = STATIC_ZONES_BY_BARANGAY[barangay.name] ?? ['Zone 1', 'Zone 2', 'Zone 3'];
    zoneNames.forEach((zoneName, zoneIndex) => {
      zones.push({
        id: barangay.id * 100 + zoneIndex,
        barangayId: barangay.id,
        barangayName: barangay.name,
        name: zoneName,
        coordinate: barangay.coordinate,
      });
    });
  }

  const landmarks: AddressDirectoryLandmark[] = [...LANDMARKS, ...BARANGAY_PLACE_LANDMARKS].map((landmark) => ({
    ...landmark,
    coordinate: resolveBarangayCoordinate(landmark.barangay),
  }));

  const streets = COMMON_STREETS.map((street) => ({
    ...street,
    coordinate: resolveBarangayCoordinate(street.barangay),
  }));

  return { barangays, zones, landmarks, streets };
}

// Diri isagol ang barangay ug zone gikan sa API.
async function mergeApiDirectory(): Promise<void> {
  try {
    const [barangayResponse, zoneResponse] = await Promise.all([
      axios.get(`${API_BASE_URL}/api/mobile/barangays`, { timeout: 5000 }),
      axios.get(`${API_BASE_URL}/api/mobile/zones`, { timeout: 5000 }),
    ]);

    const apiBarangays = (barangayResponse.data?.barangays ?? []) as ApiBarangay[];
    const apiZones = (zoneResponse.data?.zones ?? []) as ApiZone[];
    if (!apiBarangays.length && !apiZones.length) return;

    const base = cachedDirectory ?? buildStaticDirectory();
    const barangayById = new Map<number, AddressDirectoryBarangay>();
    const barangayByName = new Map<string, AddressDirectoryBarangay>();

    for (const barangay of base.barangays) {
      barangayByName.set(barangay.name.toLowerCase(), barangay);
    }

    for (const apiBarangay of apiBarangays) {
      const existing =
        barangayByName.get(apiBarangay.name.toLowerCase()) ??
        base.barangays.find((item) =>
          item.aliases.some((alias) => apiBarangay.name.toLowerCase().includes(alias))
        );

      const merged: AddressDirectoryBarangay = {
        id: apiBarangay.id,
        name: apiBarangay.name,
        aliases: existing?.aliases ?? [apiBarangay.name.toLowerCase()],
        coordinate: existing?.coordinate ?? resolveBarangayCoordinate(apiBarangay.name),
      };

      barangayById.set(apiBarangay.id, merged);
      barangayByName.set(apiBarangay.name.toLowerCase(), merged);
    }

    const mergedBarangays = apiBarangays.length
      ? apiBarangays.map((apiBarangay) => barangayById.get(apiBarangay.id)!)
      : base.barangays;

    const mergedZones: AddressDirectoryZone[] = apiZones.length
      ? apiZones.map((apiZone) => {
          const barangay = barangayById.get(apiZone.barangay_id);
          return {
            id: apiZone.id,
            barangayId: apiZone.barangay_id,
            barangayName: barangay?.name ?? 'Barangay',
            name: apiZone.name,
            coordinate: barangay?.coordinate ?? resolveBarangayCoordinate('Poblacion'),
          };
        })
      : base.zones;

    cachedDirectory = {
      barangays: mergedBarangays,
      zones: mergedZones,
      landmarks: base.landmarks,
      streets: base.streets,
    };
  } catch {
    // Static directory remains usable offline.
  }
}

// Diri siguroon nga na-load na ang address directory.
export async function ensureAddressDirectoryLoaded(): Promise<void> {
  if (!cachedDirectory) {
    cachedDirectory = buildStaticDirectory();
  }

  if (!directoryLoadPromise) {
    directoryLoadPromise = mergeApiDirectory().finally(() => {
      directoryLoadPromise = null;
    });
  }

  await directoryLoadPromise;
}

// Diri kuhaon ang address directory.
export function getAddressDirectory() {
  if (!cachedDirectory) {
    cachedDirectory = buildStaticDirectory();
  }
  return cachedDirectory;
}

// Diri limpyohan ang text para sa search.
export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Diri kwentahon ang score sa pag-match sa address.
export function getAddressMatchScore(query: string, candidate: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCandidate = normalizeSearchText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedCandidate === normalizedQuery) return 100;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 80;
  if (normalizedCandidate.includes(normalizedQuery)) return 60;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const candidateTokens = new Set(normalizedCandidate.split(' ').filter(Boolean));
  const matchedTokens = queryTokens.filter((token) =>
    [...candidateTokens].some((candidateToken) => candidateToken.startsWith(token))
  );

  if (!matchedTokens.length) return 0;
  return 30 + Math.round((matchedTokens.length / queryTokens.length) * 30);
}

// Diri idugang ang ngalan sa siyudad sa barangay.
export function formatBarangayLabel(name: string): string {
  return `${name}, ${ELSALVADOR_CITY_NAME}`;
}
