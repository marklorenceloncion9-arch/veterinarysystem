<?php

namespace App\Support;

use App\Models\Animal;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ElsalvadorMapPets
{
    private const SERVICE_LABELS = [
        'home_service' => 'Home service',
        'appointment' => 'Appointment',
        'walk_in' => 'Walk-in',
    ];

    /**
     * Pets for the city map, including those without a saved street pin.
     * A completed Vaccination visit marks the pet vaccinated and keeps the service type.
     */
    // Diri kuhaon ang mga pet para sa mapa, apil ang wala pa nabakunahan.
    public static function collect(array $clientRoles): Collection
    {
        $today = now()->toDateString();
        $hasStreet = Schema::hasColumn('users', 'street_latitude')
            && Schema::hasColumn('users', 'street_longitude');
        $vaccinations = self::latestVaccinationByAnimal();

        $userColumns = ['id', 'firstname', 'lastname', 'name', 'barangay_id', 'zone', 'street'];
        if ($hasStreet) {
            $userColumns[] = 'street_latitude';
            $userColumns[] = 'street_longitude';
        }

        $animalColumns = [
            'id',
            'user_id',
            'pet_name',
            'pet_photo_url',
            'species_id',
            'breed_id',
            'sex',
            'identification_number',
            'rabies_vaccine',
            'rabies_last_vaccination',
            'dhppl_vaccine',
            'dhppl_last_vaccination',
            'other_vaccine_name',
            'other_vaccine_last_vaccination',
        ];
        foreach (['rabies_dose_type', 'dhppl_dose_type', 'other_vaccine_dose_type'] as $column) {
            if (Schema::hasColumn('animals', $column)) {
                $animalColumns[] = $column;
            }
        }

        return Animal::query()
            ->active()
            ->whereHas('user', function ($query) use ($clientRoles) {
                $query->whereIn('role', $clientRoles);
            })
            ->with([
                'user:'.implode(',', $userColumns),
                'user.barangay:id,name',
                'species:id,species_name,type_id',
                'species.animalType:id,type_name',
                'breed:id,breed_name',
            ])
            ->get($animalColumns)
            ->map(function (Animal $animal) use ($today, $hasStreet, $vaccinations) {
                $covered = false;
                $vaccines = [];

                foreach ([
                    ['label' => 'Rabies', 'active' => $animal->rabies_vaccine === 'yes', 'date' => $animal->rabies_last_vaccination, 'dose' => $animal->rabies_dose_type],
                    ['label' => 'DHPPL', 'active' => $animal->dhppl_vaccine === 'yes', 'date' => $animal->dhppl_last_vaccination, 'dose' => $animal->dhppl_dose_type],
                    ['label' => $animal->other_vaccine_name ?: 'Other', 'active' => filled($animal->other_vaccine_name), 'date' => $animal->other_vaccine_last_vaccination, 'dose' => $animal->other_vaccine_dose_type],
                ] as $vaccine) {
                    if (! $vaccine['active']) {
                        continue;
                    }

                    $validUntil = VaccinationSchedule::validUntil($vaccine['date'], $vaccine['dose']);
                    $current = $validUntil !== null && $validUntil >= $today;
                    $covered = $covered || $current;
                    $vaccines[] = [
                        'label' => $vaccine['label'],
                        'valid_until' => $validUntil,
                        'current' => $current,
                    ];
                }

                $latestVaccination = $vaccinations[$animal->id] ?? null;
                $serviceLabels = $latestVaccination
                    ? [self::SERVICE_LABELS[$latestVaccination['type']]]
                    : [];

                $owner = $animal->user;
                $ownerName = trim(implode(' ', array_filter([$owner->firstname ?? null, $owner->lastname ?? null])));
                $barangayId = $owner->barangay_id != null ? (int) $owner->barangay_id : null;
                [$latitude, $longitude, $pinSource] = self::resolvePin(
                    $hasStreet ? $owner->street_latitude : null,
                    $hasStreet ? $owner->street_longitude : null,
                    $latestVaccination,
                    $barangayId
                );

                if ($latitude === null || $longitude === null) {
                    return null;
                }

                return [
                    'id' => $animal->id,
                    'user_id' => $animal->user_id,
                    'pet_name' => $animal->pet_name,
                    'pet_photo_url' => $animal->pet_photo_url,
                    'animal_type' => $animal->species?->animalType?->type_name,
                    'species' => $animal->species->species_name ?? null,
                    'breed' => $animal->breed->breed_name ?? null,
                    'sex' => $animal->sex,
                    'identification_number' => $animal->identification_number,
                    'vaccinated' => $covered || $serviceLabels !== [],
                    'vaccines' => $vaccines,
                    'service_types' => array_values($serviceLabels),
                    'pin_source' => $pinSource,
                    'owner_name' => $ownerName !== '' ? $ownerName : ($owner->name ?? 'Owner'),
                    'barangay_id' => $barangayId,
                    'barangay' => $owner->barangay->name ?? null,
                    'zone' => $owner->zone,
                    'street' => $owner->street,
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                ];
            })
            ->filter()
            ->values();
    }

    /**
     * Newest completed vaccination per pet.
     *
     * @return array<int, array{type:string,latitude:?float,longitude:?float}>
     */
    // Diri kuhaon ang pinaka-ulahi nga nahuman nga vaccination sa matag pet.
    private static function latestVaccinationByAnimal(): array
    {
        if (! Schema::hasTable('booking_services') || ! Schema::hasTable('bookings') || ! Schema::hasTable('services')) {
            return [];
        }

        $columns = [
            'booking_services.animal_id as service_animal_id',
            'bookings.animal_id',
            'bookings.booked_animals',
            'bookings.booking_type',
        ];
        $hasMeeting = Schema::hasColumn('bookings', 'meeting_latitude')
            && Schema::hasColumn('bookings', 'meeting_longitude');
        if ($hasMeeting) {
            $columns[] = 'bookings.meeting_latitude';
            $columns[] = 'bookings.meeting_longitude';
        }

        $rows = DB::table('booking_services')
            ->join('bookings', 'bookings.id', '=', 'booking_services.booking_id')
            ->join('services', 'services.id', '=', 'booking_services.service_type_id')
            ->where('bookings.status', 'completed')
            ->whereIn('bookings.booking_type', array_keys(self::SERVICE_LABELS))
            ->whereRaw('LOWER(services.type_name) LIKE ?', ['%vaccin%'])
            ->orderByDesc('bookings.booking_date')
            ->orderByDesc('bookings.id')
            ->get($columns);

        $byAnimal = [];
        foreach ($rows as $row) {
            $type = (string) $row->booking_type;
            if (! isset(self::SERVICE_LABELS[$type])) {
                continue;
            }

            $animalIds = $row->service_animal_id
                ? [(int) $row->service_animal_id]
                : self::animalIdsFromBooking($row);

            foreach ($animalIds as $animalId) {
                if ($animalId <= 0 || isset($byAnimal[$animalId]) || self::animalEntryCancelled($row->booked_animals, $animalId)) {
                    continue;
                }

                $latitude = $hasMeeting && $row->meeting_latitude !== null ? (float) $row->meeting_latitude : null;
                $longitude = $hasMeeting && $row->meeting_longitude !== null ? (float) $row->meeting_longitude : null;
                $byAnimal[$animalId] = [
                    'type' => $type,
                    'latitude' => self::usableCoordinate($latitude, $longitude) ? $latitude : null,
                    'longitude' => self::usableCoordinate($latitude, $longitude) ? $longitude : null,
                ];
            }
        }

        return $byAnimal;
    }

    /**
     * @param  array{type:string,latitude:?float,longitude:?float}|null  $latestVaccination
     * @return array{0:float|null,1:float|null,2:string|null}
     */
    // Home service follows the meeting place the client picked. Appointment and walk-in use the registered address.
    private static function resolvePin(mixed $streetLatitude, mixed $streetLongitude, ?array $latestVaccination, ?int $barangayId): array
    {
        $streetLat = $streetLatitude !== null ? (float) $streetLatitude : null;
        $streetLng = $streetLongitude !== null ? (float) $streetLongitude : null;
        $homeService = ($latestVaccination['type'] ?? null) === 'home_service';

        if ($homeService && self::usableCoordinate($latestVaccination['latitude'] ?? null, $latestVaccination['longitude'] ?? null)) {
            return [$latestVaccination['latitude'], $latestVaccination['longitude'], 'meeting'];
        }

        if (self::usableCoordinate($streetLat, $streetLng)) {
            return [$streetLat, $streetLng, 'street'];
        }

        $centroid = BarangayGeoLocator::centroidForBarangay($barangayId);
        if ($centroid && self::usableCoordinate($centroid['latitude'], $centroid['longitude'])) {
            return [$centroid['latitude'], $centroid['longitude'], 'barangay'];
        }

        return [null, null, null];
    }

    /**
     * @return array<int, int>
     */
    // Diri kuhaon ang mga animal ID sa booking.
    private static function animalIdsFromBooking(object $row): array
    {
        $entries = self::bookedEntries($row->booked_animals ?? null);
        $ids = [];
        foreach ($entries as $entry) {
            $animalId = (int) ($entry['animal_id'] ?? 0);
            if ($animalId > 0) {
                $ids[] = $animalId;
            }
        }

        if ($ids === [] && ! empty($row->animal_id)) {
            $ids[] = (int) $row->animal_id;
        }

        return array_values(array_unique($ids));
    }

    // Diri susihon kung gikansela ang hayop sulod sa booking.
    private static function animalEntryCancelled(mixed $bookedAnimals, int $animalId): bool
    {
        foreach (self::bookedEntries($bookedAnimals) as $entry) {
            if ((int) ($entry['animal_id'] ?? 0) === $animalId) {
                return ($entry['status'] ?? null) === 'cancelled';
            }
        }

        return false;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    // Diri i-decode ang booked_animals nga JSON.
    private static function bookedEntries(mixed $bookedAnimals): array
    {
        if (is_string($bookedAnimals)) {
            $bookedAnimals = json_decode($bookedAnimals, true);
        }

        return is_array($bookedAnimals) ? $bookedAnimals : [];
    }

    // Diri susihon kung pwede gamiton ang coordinates.
    private static function usableCoordinate(mixed $latitude, mixed $longitude): bool
    {
        return is_numeric($latitude)
            && is_numeric($longitude)
            && is_finite((float) $latitude)
            && is_finite((float) $longitude)
            && ! ((float) $latitude === 0.0 && (float) $longitude === 0.0);
    }
}
