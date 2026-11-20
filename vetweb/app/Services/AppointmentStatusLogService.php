<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\BookingStatusLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;

class AppointmentStatusLogService
{
    public const STATUS_LABELS = [
        'pending' => 'Submitted',
        'approved' => 'Approved',
        'processing' => 'Processing',
        'ongoing' => 'Ongoing',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
        'rejected' => 'Rejected',
    ];

    public const STATUS_ACTION_VERBS = [
        'pending' => 'Submitted by',
        'approved' => 'Approved by',
        'processing' => 'Processed by',
        'ongoing' => 'Marked as ongoing by',
        'completed' => 'Completed by',
        'cancelled' => 'Cancelled by',
        'rejected' => 'Rejected by',
    ];

    public const ROLE_LABELS = [
        'data_manager' => 'Data Manager',
        'budget_officer' => 'Budget Officer',
        'fieldman' => 'Fieldman',
        'owner' => 'Owner',
        'admin' => 'Admin',
        'veterinarian' => 'Veterinarian',
    ];

    public const STAFF_ROLES = [
        'data_manager',
        'budget_officer',
        'fieldman',
        'owner',
        'admin',
        'veterinarian',
    ];

    public const ADMIN_ACTOR_LABEL = 'Data Manager';

    public const BUDGET_OFFICER_ACTOR_LABEL = 'Budget Officer';

    // Diri i-record ang pag-usab sa status sa booking.
    public static function record(
        Appointment $appointment,
        string $status,
        ?string $changedByName = null,
        ?int $changedByUserId = null,
        ?string $notes = null,
        ?Carbon $changedAt = null
    ): BookingStatusLog {
        $actorName = self::resolveActorName($changedByName, $changedByUserId);

        return BookingStatusLog::create([
            'booking_id' => $appointment->id,
            'status' => $status,
            'changed_by_user_id' => $changedByUserId,
            'changed_by_name' => $actorName,
            'notes' => $notes,
            'changed_at' => $changedAt ?? now(),
        ]);
    }

    // Diri i-record ang status gamit ang naka-login nga user.
    public static function recordForAuthenticatedUser(
        Appointment $appointment,
        string $status,
        ?string $overrideName = null,
        ?string $notes = null
    ): BookingStatusLog {
        $user = Auth::user() ?? Auth::guard('web')->user();

        return self::record(
            $appointment,
            $status,
            $overrideName,
            $user?->id,
            $notes
        );
    }

    /**
     * Admin panel actions (approve, process, cancel, etc.) are always attributed to Data Manager.
     */
    // Diri i-record ang status isip data manager.
    public static function recordForDataManager(
        Appointment $appointment,
        string $status,
        ?string $notes = null
    ): BookingStatusLog {
        $user = Auth::user() ?? Auth::guard('web')->user();

        return self::record(
            $appointment,
            $status,
            self::ADMIN_ACTOR_LABEL,
            $user?->id,
            $notes
        );
    }

    /**
     * Budget officer completing a treatment is attributed to Budget Officer, not administered_by.
     */
    // Diri i-record ang status isip budget officer.
    public static function recordForBudgetOfficer(
        Appointment $appointment,
        string $status,
        ?string $notes = null
    ): BookingStatusLog {
        $user = Auth::user() ?? Auth::guard('web')->user();

        return self::record(
            $appointment,
            $status,
            self::BUDGET_OFFICER_ACTOR_LABEL,
            $user?->id,
            $notes
        );
    }

    /**
     * Record a per-animal or bulk animal approval/cancellation action.
     */
    // Diri i-record ang action sa usa ka hayop.
    public static function recordAnimalAction(
        Appointment $appointment,
        string $action,
        array $animalIds,
        array $animalNames,
        ?array $services = null,
        ?string $cancellationReason = null
    ): ?BookingStatusLog {
        unset($animalIds);

        $animalNames = array_values(array_filter(array_map(
            fn ($name) => trim((string) $name),
            $animalNames
        )));

        if ($animalNames === []) {
            return null;
        }

        $notes = self::buildAnimalActionNotes($action, $animalNames, $services, $cancellationReason);

        if (self::hasRecentDuplicate($appointment, $action, $notes)) {
            return null;
        }

        return self::recordForDataManager($appointment, $action, $notes);
    }

    // Diri kuhaon ang serbisyo sa mga hayop sa booking.
    public static function resolveAnimalServices(Appointment $appointment, array $animalIds): array
    {
        $appointment->loadMissing('bookingServices.service');
        $animalIdSet = array_flip(array_map('intval', $animalIds));
        $services = [];

        foreach ($appointment->bookingServices as $bookingService) {
            $animalId = (int) ($bookingService->animal_id ?? 0);
            $serviceName = $bookingService->service?->type_name;
            if ($animalId > 0 && isset($animalIdSet[$animalId]) && $serviceName) {
                $services[] = $serviceName;
            }
        }

        if ($services === []) {
            $appointment->loadMissing('treatmentTypes');
            foreach ($appointment->treatmentTypes as $service) {
                if ($service->type_name) {
                    $services[] = $service->type_name;
                }
            }
        }

        return array_values(array_unique($services));
    }

    // Diri himuon ang notes sa action sa hayop.
    public static function buildAnimalActionNotes(
        string $action,
        array $animalNames,
        ?array $services = null,
        ?string $cancellationReason = null
    ): string {
        $isBulk = count($animalNames) > 1;
        $namesList = implode(', ', $animalNames);
        $verb = $action === 'cancelled' ? 'Cancelled' : 'Approved';

        $notes = $isBulk
            ? "{$verb} animals (bulk): {$namesList}"
            : "{$verb} animal: {$namesList}";

        $services = array_values(array_unique(array_filter($services ?? [])));
        if ($services !== []) {
            $notes .= ' | Services: ' . implode(', ', $services);
        }

        if ($action === 'cancelled') {
            $reason = trim((string) $cancellationReason);
            if ($reason !== '') {
                $notes .= ' | Reason: ' . $reason;
            }
        }

        return $notes;
    }

    // Diri susihon kung naay doble nga log bag-o lang.
    private static function hasRecentDuplicate(Appointment $appointment, string $status, string $notes): bool
    {
        return BookingStatusLog::query()
            ->where('booking_id', $appointment->id)
            ->where('status', $status)
            ->where('notes', $notes)
            ->where('changed_at', '>=', now()->subSeconds(5))
            ->exists();
    }

    /**
     * Whether the most recent log for a status was recorded by admin / Data Manager.
     */
    // Diri susihon kung admin ang nag-usab sa status.
    public static function wasStatusChangedByAdmin(Appointment $appointment, string $status): bool
    {
        $appointment->loadMissing(['statusLogs.changedByUser']);

        $log = $appointment->statusLogs
            ->where('status', $status)
            ->sortByDesc(fn (BookingStatusLog $entry) => $entry->changed_at)
            ->first();

        if (!$log) {
            return false;
        }

        if (strcasecmp(trim((string) $log->changed_by_name), self::ADMIN_ACTOR_LABEL) === 0) {
            return true;
        }

        $user = $log->changedByUser;

        return $user && in_array($user->role, ['data_manager', 'admin'], true);
    }

    // Diri i-format ang status history para sa API.
    public static function formatHistoryForApi(Appointment $appointment, string $audience = 'admin'): array
    {
        $appointment->unsetRelation('statusLogs');
        $appointment->load(['statusLogs.changedByUser']);

        return $appointment->statusLogs
            ->sortByDesc(fn (BookingStatusLog $log) => $log->changed_at?->timestamp ?? 0)
            ->values()
            ->map(function (BookingStatusLog $log) use ($audience, $appointment) {
                $actor = self::formatChangedByForAudience($log, $audience, $appointment);
                $status = $log->status;
                $display = self::formatHistoryDisplay($log, $appointment, $actor);

                return [
                    'status' => $status,
                    'status_label' => $display['status_label'],
                    'changed_by' => $actor,
                    'action_label' => $display['action_label'],
                    'changed_at' => $log->changed_at?->format('Y-m-d H:i:s'),
                    'changed_at_formatted' => $log->changed_at
                        ? $log->changed_at->format('F j, Y \a\t g:i A')
                        : null,
                    'notes' => $display['notes'],
                    'animal_names' => $display['animal_names'],
                    'services' => $display['services'],
                    'is_bulk' => $display['is_bulk'],
                    'scope' => $display['scope'],
                ];
            })
            ->all();
    }

    // Diri i-format ang usa ka history entry para ipakita.
    private static function formatHistoryDisplay(BookingStatusLog $log, Appointment $appointment, string $actor): array
    {
        $status = $log->status;
        $storedNotes = trim((string) $log->notes);
        $parsed = self::parseAnimalActionNotes($storedNotes);

        if ($parsed !== null) {
            return self::formatParsedAnimalHistoryDisplay($parsed, $actor);
        }

        $rawNotes = self::resolveLogNotes($log, $appointment);
        $statusLabel = self::STATUS_LABELS[$status] ?? ucfirst((string) $status);
        $actionLabel = self::formatActionLabel($status, $actor);
        $notes = $rawNotes;

        if (preg_match('/^Approved animal:\s*([^|]+?)(?:\s*\|\s*(.+))?$/i', $storedNotes, $matches)) {
            $petName = trim($matches[1]);
            $statusLabel = "Approved {$petName}";
            $actionLabel = self::formatActionLabel('approved', $actor);
            $notes = null;
        } elseif (preg_match('/^Cancelled animal:\s*(.+)$/is', $storedNotes, $matches)) {
            $detail = trim($matches[1]);
            $petName = $detail;
            $reason = '';

            if (str_contains($detail, ' | ')) {
                $parts = array_map('trim', explode(' | ', $detail));
                $petName = $parts[0] ?? $petName;
                $reason = $parts[1] ?? '';
                if (preg_match('/^\d+ (Approved|Cancelled|Pending)/', $reason)) {
                    $reason = $parts[2] ?? '';
                }
            }

            $statusLabel = "Cancelled {$petName}";
            $actionLabel = self::formatActionLabel('cancelled', $actor);
            $notes = $reason !== '' ? $reason : null;
        } elseif (preg_match('/^(Approved|Cancelled)\s+\d+\s+animals?:\s*(.+?)(?:\.\s*Reason:\s*(.+))?$/is', $storedNotes, $matches)) {
            $verb = ucfirst(strtolower($matches[1]));
            $names = trim($matches[2]);
            $reason = trim($matches[3] ?? '');
            $statusLabel = "{$verb} multiple animals";
            $actionLabel = "{$verb} {$names} by {$actor}";
            $notes = $reason !== '' ? $reason : null;
        }

        return [
            'status_label' => $statusLabel,
            'action_label' => $actionLabel,
            'notes' => $notes,
            'animal_names' => [],
            'services' => [],
            'is_bulk' => false,
            'scope' => 'booking',
        ];
    }

    // Diri basahon ang notes sa action sa hayop.
    private static function parseAnimalActionNotes(?string $notes): ?array
    {
        $notes = trim((string) $notes);
        if ($notes === '') {
            return null;
        }

        if (preg_match('/^(Approved|Cancelled) animal:\s*([^|]+?)(?:\|\s*Services:\s*([^|]+))?(?:\|\s*Reason:\s*(.+))?$/is', $notes, $matches)) {
            $action = strtolower($matches[1]) === 'cancelled' ? 'cancelled' : 'approved';

            return [
                'scope' => 'animal',
                'action' => $action,
                'animal_names' => [trim($matches[2])],
                'services' => self::parseServicesList($matches[3] ?? ''),
                'reason' => trim($matches[4] ?? '') ?: null,
                'is_bulk' => false,
            ];
        }

        if (preg_match('/^(Approved|Cancelled) animals \(bulk\):\s*([^|]+?)(?:\|\s*Services:\s*([^|]+))?(?:\|\s*Reason:\s*(.+))?$/is', $notes, $matches)) {
            $action = strtolower($matches[1]) === 'cancelled' ? 'cancelled' : 'approved';

            return [
                'scope' => 'animals',
                'action' => $action,
                'animal_names' => array_values(array_filter(array_map('trim', explode(',', $matches[2])))),
                'services' => self::parseServicesList($matches[3] ?? ''),
                'reason' => trim($matches[4] ?? '') ?: null,
                'is_bulk' => true,
            ];
        }

        return null;
    }

    // Diri bulagon ang lista sa serbisyo gikan sa text.
    private static function parseServicesList(?string $value): array
    {
        $value = trim((string) $value);
        if ($value === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode(',', $value))));
    }

    // Diri i-format ang na-parse nga history sa hayop.
    private static function formatParsedAnimalHistoryDisplay(array $parsed, string $actor): array
    {
        $action = $parsed['action'];
        $animalNames = array_values(array_filter($parsed['animal_names'] ?? []));
        $isBulk = (bool) ($parsed['is_bulk'] ?? false);
        $verb = $action === 'cancelled' ? 'Cancelled' : 'Approved';

        if ($isBulk) {
            $namesList = implode(', ', $animalNames);
            $pendingLabel = $action === 'cancelled' ? 'selected animals' : 'pending animals';

            return [
                'status_label' => "{$verb} all {$pendingLabel}",
                'action_label' => "{$verb} {$namesList} by {$actor}",
                'notes' => $parsed['reason'] ?? null,
                'animal_names' => $animalNames,
                'services' => $parsed['services'] ?? [],
                'is_bulk' => true,
                'scope' => 'animals',
            ];
        }

        $petName = $animalNames[0] ?? 'animal';

        return [
            'status_label' => "{$verb} {$petName}",
            'action_label' => self::formatActionLabel($action === 'cancelled' ? 'cancelled' : 'approved', $actor),
            'notes' => $parsed['reason'] ?? null,
            'animal_names' => [],
            'services' => [],
            'is_bulk' => false,
            'scope' => 'animal',
        ];
    }

    /**
     * Notes for a status-log entry. Cancellation text lives on bookings.cancellation_reason;
     * the log only stores notes for other status-specific context when needed.
     */
    // Diri kuhaon ang sakto nga notes sa log.
    public static function resolveLogNotes(BookingStatusLog $log, Appointment $appointment): ?string
    {
        $storedNotes = trim((string) $log->notes);
        $parsed = self::parseAnimalActionNotes($storedNotes);

        if ($log->status === 'cancelled') {
            if ($parsed !== null) {
                return $parsed['reason'] ?? null;
            }

            if ($storedNotes !== '') {
                return $storedNotes;
            }

            $bookingReason = trim((string) $appointment->cancellation_reason);

            return $bookingReason !== '' ? $bookingReason : null;
        }

        return $storedNotes !== '' ? $storedNotes : null;
    }

    // Diri i-format kinsa ang nag-usab base sa motan-aw.
    public static function formatChangedByForAudience(
        BookingStatusLog $log,
        string $audience = 'admin',
        ?Appointment $appointment = null
    ): string {
        $user = $log->changedByUser;
        $storedName = trim((string) $log->changed_by_name);
        $bookingOwnerId = $appointment?->user_id;

        if (strcasecmp($storedName, self::ADMIN_ACTOR_LABEL) === 0) {
            return $audience === 'client' ? 'Staff' : self::ADMIN_ACTOR_LABEL;
        }

        if (strcasecmp($storedName, self::BUDGET_OFFICER_ACTOR_LABEL) === 0) {
            return $audience === 'client' ? 'Staff' : self::BUDGET_OFFICER_ACTOR_LABEL;
        }

        if ($log->status === 'cancelled' && $bookingOwnerId) {
            $cancelledByOwner = ($user && self::isClientUser($user))
                || ($log->changed_by_user_id && (int) $log->changed_by_user_id === (int) $bookingOwnerId);

            if (!$cancelledByOwner && !$log->changed_by_user_id) {
                $cancelledByOwner = self::isOwnerCancellationLog($log, $appointment);
            }

            if ($cancelledByOwner) {
                $ownerName = self::resolveActorName(null, $log->changed_by_user_id ?: $bookingOwnerId);

                if ($audience === 'client') {
                    return 'You';
                }

                return $ownerName;
            }
        }

        if ($audience === 'client') {
            if ($user && self::isClientUser($user)) {
                return self::resolveActorName(null, $user->id);
            }

            if (strcasecmp($storedName, 'Clinic') === 0) {
                return 'Clinic';
            }

            if ($log->status === 'pending' && $storedName !== '') {
                return $storedName;
            }

            return 'Staff';
        }

        if ($user) {
            if (self::isClientUser($user)) {
                return self::resolveActorName(null, $user->id);
            }

            return self::roleLabel($user->role);
        }

        return self::normalizeAdminActorLabel($log->changed_by_name);
    }

    // Diri susihon kung tag-iya ang nag-cancel sa log.
    private static function isOwnerCancellationLog(BookingStatusLog $log, ?Appointment $appointment = null): bool
    {
        if ($log->status !== 'cancelled' || $log->changed_by_user_id) {
            return false;
        }

        if (self::isStaffInitiatedCancellationReason($appointment?->cancellation_reason)) {
            return false;
        }

        $storedName = trim((string) $log->changed_by_name);
        if ($storedName === '' || self::isStaffActorLabel($storedName)) {
            return false;
        }

        if (!$appointment?->user_id) {
            return false;
        }

        $ownerName = self::resolveActorName(null, $appointment->user_id);

        return strcasecmp($storedName, $ownerName) === 0;
    }

    // Diri susihon kung staff ang nag-cancel base sa reason.
    public static function isStaffInitiatedCancellationReason(?string $reason): bool
    {
        $reason = strtolower(trim((string) $reason));
        if ($reason === '') {
            return false;
        }

        $staffPhrases = [
            'the clinic is unavailable',
            'the veterinarian is unavailable',
            'your pet must be registered or exempt',
            'we are unable to accommodate this service',
            'please rebook your appointment',
            'did not arrive on time',
            'past your scheduled appointment time',
            'were not present during your scheduled time',
            'appointment date has passed',
        ];

        foreach ($staffPhrases as $phrase) {
            if (str_contains($reason, $phrase)) {
                return true;
            }
        }

        return false;
    }

    // Diri susihon kung label sa staff ang ngalan.
    private static function isStaffActorLabel(string $name): bool
    {
        if (in_array($name, ['Clinic', 'System', 'Staff'], true)) {
            return true;
        }

        foreach (self::ROLE_LABELS as $label) {
            if (strcasecmp($name, $label) === 0) {
                return true;
            }
        }

        return false;
    }

    // Diri kuhaon ang ngalan sa nag-action.
    public static function resolveActorName(?string $overrideName = null, ?int $userId = null): string
    {
        if ($overrideName !== null && trim($overrideName) !== '') {
            return trim($overrideName);
        }

        $user = $userId ? User::find($userId) : Auth::user();
        if ($user) {
            $fullName = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));
            if ($fullName !== '') {
                return $fullName;
            }

            if (!empty($user->name)) {
                return (string) $user->name;
            }
        }

        return 'Staff';
    }

    // Diri kuhaon ang label sa role.
    public static function roleLabel(?string $role): string
    {
        if ($role && isset(self::ROLE_LABELS[$role])) {
            return self::ROLE_LABELS[$role];
        }

        if (!$role) {
            return 'Staff';
        }

        return ucwords(str_replace('_', ' ', $role));
    }

    // Diri susihon kung staff ang user.
    public static function isStaffUser(User $user): bool
    {
        return in_array($user->role, self::STAFF_ROLES, true);
    }

    // Diri susihon kung client ang user.
    public static function isClientUser(User $user): bool
    {
        return $user->role === 'client' || $user->role === null;
    }

    // Diri usbon ang label sa admin nga nag-action.
    private static function normalizeAdminActorLabel(?string $name): string
    {
        $name = trim((string) $name);
        if ($name === '') {
            return self::ADMIN_ACTOR_LABEL;
        }

        if (strcasecmp($name, 'Clinic') === 0) {
            return 'Clinic';
        }

        if (strcasecmp($name, 'System') === 0 || strcasecmp($name, 'Staff') === 0) {
            return self::ADMIN_ACTOR_LABEL;
        }

        foreach (self::ROLE_LABELS as $label) {
            if (strcasecmp($name, $label) === 0) {
                return $label;
            }
        }

        $normalizedRoleKey = strtolower(str_replace(' ', '_', $name));
        if (isset(self::ROLE_LABELS[$normalizedRoleKey])) {
            return self::ROLE_LABELS[$normalizedRoleKey];
        }

        return $name;
    }

    // Diri i-format ang label sa action sa status.
    public static function formatActionLabel(string $status, string $actor): string
    {
        $verb = self::STATUS_ACTION_VERBS[$status] ?? (ucfirst($status) . ' by');

        return trim($verb . ' ' . $actor);
    }
}
