<?php

namespace App\Support;

use App\Models\Appointment;
use App\Models\User;
use App\Services\AppointmentStatusLogService;
use Illuminate\Support\Collection;

class TreatmentStaff
{
    public const DEFAULT_ADMINISTERED_BY = 'Doc. Beate Humilbe Obsioma';

    public const TREATMENT_STAFF_ROLES = [
        'data_manager',
        'fieldman',
        'veterinarian',
    ];

    // Diri kuhaon ang ngalan sa staff nga nagtambal.
    public static function displayName(User $user): string
    {
        $fullName = trim(implode(' ', array_filter([
            $user->firstname,
            $user->middlename,
            $user->lastname,
        ])));

        if ($fullName !== '') {
            return $fullName;
        }

        return trim((string) ($user->name ?? ''));
    }

    /**
     * Display stored administered_by as "Name (Role)" when possible.
     */
    // Diri i-format ang label kinsa ang nagtambal.
    public static function formatAdministeredByLabel(?string $stored, ?Appointment $appointment = null): ?string
    {
        $value = trim((string) $stored);
        if ($value === '') {
            return null;
        }

        if (preg_match('/\([^)]+\)\s*$/', $value)) {
            return $value;
        }

        static $staffByName = null;
        if ($staffByName === null) {
            $staffByName = self::listForTreatment()
                ->keyBy(fn (array $staff) => strtolower($staff['name']));
        }

        $match = $staffByName->get(strtolower($value));
        if ($match) {
            return "{$match['name']} ({$match['role_label']})";
        }

        if ($appointment) {
            $fromLog = self::resolveFromStatusLogs($appointment, $value);
            if ($fromLog) {
                return $fromLog;
            }
        }

        return $value;
    }

    /**
     * Match administered_by to the user who marked the walk-in ongoing.
     */
    // Diri pangitaon sa status logs kinsa ang nagtambal.
    private static function resolveFromStatusLogs(Appointment $appointment, string $adminName): ?string
    {
        $appointment->loadMissing(['statusLogs.changedByUser']);

        $ongoingLog = $appointment->statusLogs
            ->where('status', 'ongoing')
            ->sortByDesc('changed_at')
            ->first();

        if (!$ongoingLog?->changedByUser) {
            return null;
        }

        $user = $ongoingLog->changedByUser;
        $userName = self::displayName($user);
        $storedName = trim((string) $ongoingLog->changed_by_name);

        $matchesAdmin = strcasecmp($adminName, $userName) === 0
            || strcasecmp($adminName, (string) $user->name) === 0
            || strcasecmp($adminName, $storedName) === 0;

        if (!$matchesAdmin) {
            return null;
        }

        $roleLabel = AppointmentStatusLogService::roleLabel($user->role);

        return "{$adminName} ({$roleLabel})";
    }

    /**
     * @return Collection<int, array{id: int, name: string, role: string, role_label: string}>
     */
    // Diri kuhaon ang lista sa staff nga pwede motambal.
    public static function listForTreatment(): Collection
    {
        return User::query()
            ->whereIn('role', self::TREATMENT_STAFF_ROLES)
            ->orderBy('firstname')
            ->orderBy('lastname')
            ->get(['id', 'firstname', 'middlename', 'lastname', 'name', 'role'])
            ->map(function (User $user) {
                $name = self::displayName($user);

                return [
                    'id' => $user->id,
                    'name' => $name,
                    'role' => (string) $user->role,
                    'role_label' => AppointmentStatusLogService::roleLabel($user->role),
                ];
            })
            ->filter(fn (array $staff) => $staff['name'] !== '')
            ->values();
    }
}
