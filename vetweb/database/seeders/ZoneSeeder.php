<?php

namespace Database\Seeders;

use App\Models\Barangay;
use App\Models\Zone;
use Illuminate\Database\Seeder;

class ZoneSeeder extends Seeder
{
    /**
     * Seed zones per barangay for El Salvador City, Misamis Oriental.
     *
     * There is no official public registry of zones per barangay, so counts
     * are based on zones verified from public address records (PSA/DepEd
     * documents, PhilHealth facility lists, business registrations):
     *   - Molugan: addresses up to Zone 13-15 (largest barangay, urban)
     *   - Sinaloc: up to Zone 6
     *   - Bolisong: up to Zone 4
     *   - Poblacion, Amoros: Zones 1-3
     *   - Taytay: uses lettered zones (Zone 1-A / 1-B documented)
     * Barangays without documented zones get a Zone 1-3 baseline.
     * The list is editable at runtime via the admin/mobile "add zone" APIs.
     */
    public function run(): void
    {
        $zonesByBarangay = [
            'Amoros' => $this->numberedZones(3),
            'Bolisong' => $this->numberedZones(4),
            'Cogon' => $this->numberedZones(3),
            'Himaya' => $this->numberedZones(3),
            'Hinigdaan' => $this->numberedZones(3),
            'Kalabaylabay' => $this->numberedZones(3),
            'Molugan' => $this->numberedZones(15),
            'Pedro S. Baculio (Bolo-Bolo)' => $this->numberedZones(3),
            'Poblacion (city center)' => $this->numberedZones(3),
            'Quibonbon' => $this->numberedZones(3),
            'Sambulawan' => $this->numberedZones(3),
            'San Francisco de Asis (Calongonan)' => $this->numberedZones(3),
            'Sinaloc' => $this->numberedZones(6),
            'Taytay' => ['Zone 1-A', 'Zone 1-B', 'Zone 2', 'Zone 3'],
            'Ulaliman' => $this->numberedZones(3),
        ];

        foreach ($zonesByBarangay as $barangayName => $zoneNames) {
            $barangay = Barangay::where('name', $barangayName)->first();

            if (!$barangay) {
                continue;
            }

            foreach ($zoneNames as $zoneName) {
                Zone::firstOrCreate([
                    'barangay_id' => $barangay->id,
                    'name' => $zoneName,
                ]);
            }
        }
    }

    /**
     * Build a ['Zone 1', ..., 'Zone N'] list.
     */
    private function numberedZones(int $count): array
    {
        return array_map(fn (int $i) => "Zone {$i}", range(1, $count));
    }
}
