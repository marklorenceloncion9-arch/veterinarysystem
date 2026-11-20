<?php

namespace App\Support;

use App\Models\Barangay;
use Illuminate\Support\Collection;

class BarangayGeoLocator
{
    private const GEOJSON_ALIASES = [
        'Calongonan' => 'San Francisco de Asis (Calongonan)',
        'Bolobolo' => 'Pedro S. Baculio (Bolo-Bolo)',
        'Kibonbon' => 'Quibonbon',
        'Poblacion' => 'Poblacion (city center)',
    ];

    /** @var array<int, array{id:int,name:string,rings:array<int,array<int,array{0:float,1:float}>>}>|null */
    private static ?array $polygons = null;

    /**
     * Resolve the barangay that contains a meeting-place pin.
     * Falls back to the nearest barangay when the pin sits just outside a boundary.
     *
     * @return array{id:int,name:string}|null
     */
    // Diri pangitaon ang barangay gikan sa coordinates.
    public static function resolveFromCoordinates(?float $latitude, ?float $longitude): ?array
    {
        if ($latitude === null || $longitude === null) {
            return null;
        }

        if (!is_finite($latitude) || !is_finite($longitude) || ($latitude == 0.0 && $longitude == 0.0)) {
            return null;
        }

        foreach (self::polygons() as $polygon) {
            foreach ($polygon['rings'] as $ring) {
                if (self::pointInRing($longitude, $latitude, $ring)) {
                    return [
                        'id' => $polygon['id'],
                        'name' => $polygon['name'],
                    ];
                }
            }
        }

        return self::nearestBarangay($latitude, $longitude);
    }

    /**
     * When a pin is slightly outside polygon edges (common with GPS/map pins),
     * pick the closest barangay centroid within ~2.5km.
     *
     * @return array{id:int,name:string}|null
     */
    // Diri pangitaon ang pinakaduol nga barangay.
    private static function nearestBarangay(float $latitude, float $longitude): ?array
    {
        $best = null;
        $bestDistanceKm = PHP_FLOAT_MAX;

        foreach (self::polygons() as $polygon) {
            $centroid = self::ringCentroid($polygon['rings'][0] ?? []);
            if (!$centroid) {
                continue;
            }

            $distanceKm = self::haversineKm($latitude, $longitude, $centroid[1], $centroid[0]);
            if ($distanceKm < $bestDistanceKm) {
                $bestDistanceKm = $distanceKm;
                $best = [
                    'id' => $polygon['id'],
                    'name' => $polygon['name'],
                ];
            }
        }

        // Keep this tight so pins far outside El Salvador City stay unresolved.
        if (!$best || $bestDistanceKm > 2.5) {
            return null;
        }

        return $best;
    }

    /**
     * @param  array<int, array{0:float,1:float}>  $ring
     * @return array{0:float,1:float}|null
     */
    // Diri kuwentahon ang tunga sa polygon ring.
    private static function ringCentroid(array $ring): ?array
    {
        if ($ring === []) {
            return null;
        }

        $sumLng = 0.0;
        $sumLat = 0.0;
        $count = 0;
        foreach ($ring as $point) {
            $sumLng += $point[0];
            $sumLat += $point[1];
            $count++;
        }

        if ($count === 0) {
            return null;
        }

        return [$sumLng / $count, $sumLat / $count];
    }

    /**
     * Center of a barangay polygon, used when a pet has no street pin.
     *
     * @return array{latitude:float,longitude:float}|null
     */
    // Diri kuhaon ang tunga sa barangay para sa pet nga walay street pin.
    public static function centroidForBarangay(?int $barangayId): ?array
    {
        if (!$barangayId) {
            return null;
        }

        foreach (self::polygons() as $polygon) {
            if ((int) $polygon['id'] !== $barangayId) {
                continue;
            }

            $centroid = self::ringCentroid($polygon['rings'][0] ?? []);
            if (!$centroid) {
                return null;
            }

            return [
                'latitude' => $centroid[1],
                'longitude' => $centroid[0],
            ];
        }

        return null;
    }

    // Diri kuwentahon ang gilay-on sa duha ka punto sa km.
    private static function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadiusKm = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $earthRadiusKm * asin(min(1, sqrt($a)));
    }

    /**
     * @return array<int, array{id:int,name:string,rings:array<int,array<int,array{0:float,1:float}>>}>
     */
    // Diri i-load ang mga polygon sa barangay.
    private static function polygons(): array
    {
        if (self::$polygons !== null) {
            return self::$polygons;
        }

        $path = public_path('geojson/elsalvador-barangays.geojson');
        if (!file_exists($path)) {
            return self::$polygons = [];
        }

        $geojson = json_decode((string) file_get_contents($path), true);
        $barangays = Barangay::query()->orderBy('name')->get(['id', 'name']);
        $polygons = [];

        foreach (($geojson['features'] ?? []) as $feature) {
            $geoName = (string) ($feature['properties']['ADM4_EN'] ?? '');
            $barangay = self::matchBarangay($geoName, $barangays);
            if (!$barangay) {
                continue;
            }

            $rings = self::extractRings($feature['geometry'] ?? null);
            if ($rings === []) {
                continue;
            }

            $polygons[] = [
                'id' => (int) $barangay->id,
                'name' => (string) $barangay->name,
                'rings' => $rings,
            ];
        }

        return self::$polygons = $polygons;
    }

    // Diri itugma ang geo nga ngalan sa barangay sa database.
    private static function matchBarangay(string $geoName, Collection $barangays): ?Barangay
    {
        if ($geoName === '') {
            return null;
        }

        $aliasName = self::GEOJSON_ALIASES[$geoName] ?? $geoName;
        $normalizedAlias = strtolower($aliasName);

        $exact = $barangays->first(
            fn (Barangay $barangay) => strtolower($barangay->name) === $normalizedAlias
        );
        if ($exact) {
            return $exact;
        }

        return $barangays->first(function (Barangay $barangay) use ($normalizedAlias) {
            $dbName = strtolower($barangay->name);
            $baseName = trim(explode('(', $dbName)[0]);

            return str_contains($dbName, $normalizedAlias)
                || str_contains($normalizedAlias, $baseName)
                || str_contains($dbName, strtolower(explode(' ', $normalizedAlias)[0] ?? ''));
        });
    }

    /**
     * @return array<int, array<int, array{0:float,1:float}>>
     */
    // Diri kuhaon ang mga ring gikan sa geometry.
    private static function extractRings(?array $geometry): array
    {
        if (!$geometry || empty($geometry['coordinates'])) {
            return [];
        }

        $type = $geometry['type'] ?? '';
        $rings = [];

        if ($type === 'Polygon') {
            $outer = $geometry['coordinates'][0] ?? [];
            $normalized = self::normalizeRing($outer);
            if ($normalized !== []) {
                $rings[] = $normalized;
            }
        } elseif ($type === 'MultiPolygon') {
            foreach ($geometry['coordinates'] as $polygon) {
                $outer = $polygon[0] ?? [];
                $normalized = self::normalizeRing($outer);
                if ($normalized !== []) {
                    $rings[] = $normalized;
                }
            }
        }

        return $rings;
    }

    /**
     * @param  array<int, mixed>  $ring
     * @return array<int, array{0:float,1:float}>
     */
    // Diri ayuhon ang format sa polygon ring.
    private static function normalizeRing(array $ring): array
    {
        $points = [];
        foreach ($ring as $point) {
            if (!is_array($point) || count($point) < 2) {
                continue;
            }
            $lng = (float) $point[0];
            $lat = (float) $point[1];
            if (!is_finite($lng) || !is_finite($lat)) {
                continue;
            }
            $points[] = [$lng, $lat];
        }

        return $points;
    }

    /**
     * Ray-casting point-in-polygon. Coordinates are [lng, lat].
     *
     * @param  array<int, array{0:float,1:float}>  $ring
     */
    // Diri susihon kung sulod sa polygon ang punto.
    private static function pointInRing(float $lng, float $lat, array $ring): bool
    {
        $count = count($ring);
        if ($count < 3) {
            return false;
        }

        $inside = false;
        for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
            $xi = $ring[$i][0];
            $yi = $ring[$i][1];
            $xj = $ring[$j][0];
            $yj = $ring[$j][1];

            $intersects = (($yi > $lat) !== ($yj > $lat))
                && ($lng < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi);

            if ($intersects) {
                $inside = !$inside;
            }
        }

        return $inside;
    }
}
