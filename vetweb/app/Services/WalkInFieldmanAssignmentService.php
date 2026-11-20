<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\User;
use App\Support\TreatmentStaff;

class WalkInFieldmanAssignmentService
{
    /**
     * Resolve fieldman user IDs from an explicit ID and/or administered_by name.
     *
     * @return array<int, int>
     */
    // Diri pangitaon ang ID sa fieldman gikan sa administered by.
    public static function resolveFieldmanIds(?string $administeredBy, ?int $explicitFieldmanId = null): array
    {
        $ids = collect();

        if ($explicitFieldmanId && $explicitFieldmanId > 0) {
            $valid = User::query()
                ->where('id', $explicitFieldmanId)
                ->where('role', 'fieldman')
                ->exists();

            if ($valid) {
                $ids->push($explicitFieldmanId);
            }
        }

        if ($ids->isEmpty() && $administeredBy) {
            $name = self::normalizeAdministeredByName($administeredBy);

            if ($name !== '') {
                $match = TreatmentStaff::listForTreatment()
                    ->first(function (array $staff) use ($name) {
                        return strcasecmp($staff['name'], $name) === 0
                            && $staff['role'] === 'fieldman';
                    });

                if ($match) {
                    $ids->push((int) $match['id']);
                }
            }
        }

        return $ids->unique()->values()->all();
    }

    /**
     * Sync booking_fieldmen for a walk-in when a fieldman is selected.
     *
     * @return array<int, int>
     */
    // Diri i-sync ang assigned fieldman sa walk-in.
    public static function syncForWalkIn(
        Appointment $appointment,
        ?string $administeredBy = null,
        ?int $explicitFieldmanId = null
    ): array {
        if ($appointment->booking_type !== 'walk_in') {
            return [];
        }

        return self::syncFieldman($appointment, $administeredBy, $explicitFieldmanId);
    }

    /**
     * Sync booking_fieldmen from an explicit fieldman ID and/or administered_by name.
     *
     * @return array<int, int>
     */
    // Diri i-assign ang fieldman sa appointment.
    public static function syncFieldman(
        Appointment $appointment,
        ?string $administeredBy = null,
        ?int $explicitFieldmanId = null
    ): array {
        $administeredBy ??= $appointment->administered_by;
        $fieldmanIds = self::resolveFieldmanIds($administeredBy, $explicitFieldmanId);

        if ($fieldmanIds === []) {
            return [];
        }

        $appointment->assignedFieldmen()->sync($fieldmanIds);

        return $fieldmanIds;
    }

    // Diri limpyohan ang ngalan sa administered by.
    private static function normalizeAdministeredByName(string $value): string
    {
        $name = trim($value);
        $name = preg_replace('/\s*\([^)]+\)\s*$/', '', $name) ?? $name;

        return trim($name);
    }
}
