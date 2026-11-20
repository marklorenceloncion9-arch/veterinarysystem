<?php

namespace App\Services;

use App\Models\Animal;
use App\Models\Appointment;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;

class AdminAlertService
{
    /**
     * @return array{
     *     total_count: int,
     *     counts: array<string, int>,
     *     alerts: array<int, array<string, mixed>>,
     *     notifications: array<int, array<string, mixed>>
     * }
     */
    // Diri himuon ang alerts ug ihap para sa admin.
    public static function buildPayloadForUser(User $user): array
    {
        $counts = self::buildCounts();
        $dismissedKeys = self::dismissedAlertKeys($user);
        $dbNotifications = ClientRegistrationNotificationService::getNotificationsForUser($user);
        $alerts = self::buildLiveAlerts($counts, $dismissedKeys);
        $visibleAlerts = collect($alerts)->where('is_summary', false);

        return [
            'total_count' => $visibleAlerts->count() + count($dbNotifications),
            'counts' => $counts,
            'alerts' => $alerts,
            'notifications' => $dbNotifications,
            'unread_count' => $visibleAlerts->count() + count($dbNotifications),
        ];
    }

    /**
     * @return array<string, int>
     */
    // Diri ihapon ang pending ug karong adlawa nga booking.
    public static function buildCounts(): array
    {
        $today = now()->toDateString();

        return [
            'pending_clients' => ClientRegistrationNotificationService::pendingRegistrationCount(),
            'pending_appointments' => Appointment::query()
                ->where('booking_type', 'appointment')
                ->where('status', 'pending')
                ->count(),
            'pending_home_services' => Appointment::query()
                ->where('booking_type', 'home_service')
                ->where('status', 'pending')
                ->count(),
            'today_clinic_appointments' => Appointment::query()
                ->where('booking_type', 'appointment')
                ->whereDate('booking_date', $today)
                ->whereNotIn('status', ['cancelled', 'completed'])
                ->count(),
            'today_home_services' => Appointment::query()
                ->where('booking_type', 'home_service')
                ->whereDate('booking_date', $today)
                ->whereNotIn('status', ['cancelled', 'completed'])
                ->count(),
            'today_appointments' => Appointment::query()
                ->where('booking_type', 'appointment')
                ->whereDate('booking_date', $today)
                ->whereNotIn('status', ['cancelled', 'completed'])
                ->count(),
            'pet_birthdays_today' => Animal::query()
                ->active()
                ->whereNotNull('birthdate')
                ->whereMonth('birthdate', now()->month)
                ->whereDay('birthdate', now()->day)
                ->count(),
        ];
    }

    /**
     * @param array<string, int> $counts
     * @param array<int, string> $dismissedKeys
     * @return array<int, array<string, mixed>>
     */
    // Diri himuon ang lista sa live alerts sa admin.
    private static function buildLiveAlerts(array $counts, array $dismissedKeys = []): array
    {
        $alerts = [];

        if ($counts['pending_clients'] > 0) {
            $alerts[] = self::summaryAlert(
                'client_pending_summary',
                'Pending registrations',
                "{$counts['pending_clients']} registration" . ($counts['pending_clients'] === 1 ? '' : 's') . ' waiting for approval',
                '/admin/barangay-animals/pending',
                $counts['pending_clients'],
                'red'
            );
        }

        if ($counts['pending_appointments'] > 0) {
            $alerts[] = self::summaryAlert(
                'appointment_pending_summary',
                'Pending appointments',
                "{$counts['pending_appointments']} appointment" . ($counts['pending_appointments'] === 1 ? '' : 's') . ' need approval',
                self::buildHref('/admin/appointments', null, ['filter' => 'pending']),
                $counts['pending_appointments'],
                'amber'
            );
        }

        if ($counts['pending_home_services'] > 0) {
            $alerts[] = self::summaryAlert(
                'home_service_pending_summary',
                'Pending home services',
                "{$counts['pending_home_services']} home service" . ($counts['pending_home_services'] === 1 ? '' : 's') . ' need approval',
                self::buildHref('/admin/elsalvador-city-map', null, ['filter' => 'pending']),
                $counts['pending_home_services'],
                'amber'
            );
        }

        if ($counts['today_clinic_appointments'] > 0) {
            $alerts[] = self::summaryAlert(
                'appointment_today_summary',
                "Today's appointments",
                "{$counts['today_clinic_appointments']} clinic appointment" . ($counts['today_clinic_appointments'] === 1 ? '' : 's') . ' scheduled for today',
                self::buildHref('/admin/appointments', null, ['filter' => 'today']),
                $counts['today_clinic_appointments'],
                'violet'
            );
        }

        if ($counts['today_home_services'] > 0) {
            $alerts[] = self::summaryAlert(
                'home_service_today_summary',
                "Today's home services",
                "{$counts['today_home_services']} home service" . ($counts['today_home_services'] === 1 ? '' : 's') . ' on the El Salvador map',
                self::buildHref('/admin/elsalvador-city-map', null, ['filter' => 'today']),
                $counts['today_home_services'],
                'violet'
            );
        }

        foreach (self::recentPendingAppointments() as $appointment) {
            $alerts[] = self::appointmentAlert($appointment, 'appointment_pending');
        }

        foreach (self::recentPendingHomeServices() as $appointment) {
            $alerts[] = self::appointmentAlert($appointment, 'home_service_pending');
        }

        foreach (self::todayAppointments() as $appointment) {
            $alerts[] = self::appointmentAlert($appointment, 'appointment_today');
        }

        foreach (self::petsWithBirthdayToday() as $animal) {
            $alerts[] = self::petBirthdayAlert($animal);
        }

        return array_values(array_filter($alerts, function (array $alert) use ($dismissedKeys) {
            return !in_array($alert['id'], $dismissedKeys, true);
        }));
    }

    // Diri himuon ang summary nga alert.
    private static function summaryAlert(
        string $id,
        string $title,
        string $message,
        string $href,
        int $count,
        string $tone
    ): array {
        return [
            'id' => $id,
            'type' => $id,
            'title' => $title,
            'message' => $message,
            'href' => $href,
            'count' => $count,
            'tone' => $tone,
            'created_at_human' => 'Active now',
            'is_read' => false,
            'is_summary' => true,
        ];
    }

    // Diri himuon ang alert para sa usa ka appointment.
    private static function appointmentAlert(Appointment $appointment, string $type): array
    {
        $isHomeService = $appointment->booking_type === 'home_service';
        $clientName = self::formatClientName($appointment->user);
        $petName = $appointment->petNamesLabel('Pet');
        $serviceNames = $appointment->treatmentTypes->pluck('type_name')->filter()->values();
        $service = $serviceNames->isNotEmpty()
            ? $serviceNames->implode(', ')
            : ($isHomeService ? 'a home service visit' : 'a clinical appointment');
        $dateLabel = $appointment->booking_date
            ? Carbon::parse($appointment->booking_date)->format('M d, Y')
            : 'Date TBD';
        $timeLabel = $appointment->booking_time
            ? Carbon::parse($appointment->booking_time)->format('g:i A')
            : null;

        $schedule = $timeLabel ? "{$dateLabel} at {$timeLabel}" : $dateLabel;

        if ($type === 'appointment_today') {
            if ($isHomeService) {
                $type = 'home_service_today';
            }
            $title = $isHomeService ? 'Home Service Today' : 'Appointment Today';
            $href = $isHomeService
                ? self::buildHref('/admin/elsalvador-city-map', $appointment->id, ['filter' => 'today'])
                : self::buildHref('/admin/appointments', $appointment->id, ['filter' => 'today']);
            $tone = 'violet';
            $actionLabel = $isHomeService ? 'View on map' : 'View schedule';
        } elseif ($isHomeService) {
            $title = 'Pending Home Service';
            $href = self::buildHref('/admin/elsalvador-city-map', $appointment->id, ['filter' => 'pending']);
            $tone = 'amber';
            $actionLabel = 'Review booking';
        } else {
            $title = 'Pending Appointment';
            $href = self::buildHref('/admin/appointments', $appointment->id, ['filter' => 'pending']);
            $tone = 'amber';
            $actionLabel = 'Review booking';
        }

        return [
            'id' => "{$type}:{$appointment->id}",
            'type' => $type,
            'title' => $title,
            'message' => "{$clientName} booked {$service} for {$petName} on {$schedule}.",
            'client_name' => $clientName,
            'pet_name' => $petName,
            'service' => $service,
            'date_label' => $dateLabel,
            'time_label' => $timeLabel,
            'schedule' => $schedule,
            'action_label' => $actionLabel,
            'href' => $href,
            'booking_id' => $appointment->id,
            'count' => null,
            'tone' => $tone,
            'created_at_human' => $appointment->created_at?->diffForHumans() ?? 'Recently',
            'is_read' => false,
            'is_summary' => false,
        ];
    }

    // Diri himuon ang alert sa birthday sa hayop.
    private static function petBirthdayAlert(Animal $animal): array
    {
        $petName = $animal->pet_name ?? 'Pet';
        $clientName = self::formatClientName($animal->user);
        $age = $animal->birthdate
            ? Carbon::parse($animal->birthdate)->age
            : null;
        $ageLabel = $age !== null ? " turning {$age}" : '';

        return [
            'id' => "pet_birthday_today:{$animal->id}",
            'type' => 'pet_birthday_today',
            'title' => 'Pet Birthday',
            'message' => "{$petName}{$ageLabel} — owned by {$clientName}.",
            'client_name' => $clientName,
            'pet_name' => $petName,
            'action_label' => 'View client',
            'href' => $animal->user_id ? "/admin/clients/{$animal->user_id}" : '/admin/barangay-animals',
            'count' => null,
            'tone' => 'emerald',
            'created_at_human' => 'Today',
            'is_read' => false,
            'is_summary' => false,
        ];
    }

    // Diri i-format ang ngalan sa client para sa alert.
    private static function formatClientName(?User $user): string
    {
        if (!$user) {
            return 'Client';
        }

        $name = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));

        return $name !== '' ? $name : ($user->name ?? 'Client');
    }

    // Diri himuon ang link sa alert.
    private static function buildHref(string $path, ?int $bookingId = null, array $query = []): string
    {
        if ($bookingId) {
            $query['booking'] = $bookingId;
        }

        if ($query === []) {
            return $path;
        }

        return $path . '?' . http_build_query($query);
    }

    /**
     * @return \Illuminate\Support\Collection<int, Appointment>
     */
    // Diri kuhaon ang bag-ong pending nga appointment.
    private static function recentPendingAppointments()
    {
        return Appointment::query()
            ->where('booking_type', 'appointment')
            ->where('status', 'pending')
            ->with(['user', 'animal', 'treatmentTypes'])
            ->orderBy('booking_date')
            ->orderBy('booking_time')
            ->limit(5)
            ->get();
    }

    /**
     * @return \Illuminate\Support\Collection<int, Appointment>
     */
    // Diri kuhaon ang bag-ong pending nga home service.
    private static function recentPendingHomeServices()
    {
        return Appointment::query()
            ->where('booking_type', 'home_service')
            ->where('status', 'pending')
            ->with(['user', 'animal', 'treatmentTypes'])
            ->orderByDesc('created_at')
            ->limit(5)
            ->get();
    }

    /**
     * @return \Illuminate\Support\Collection<int, Appointment>
     */
    // Diri kuhaon ang mga appointment karong adlawa.
    private static function todayAppointments()
    {
        return Appointment::query()
            ->whereIn('booking_type', ['appointment', 'home_service'])
            ->whereDate('booking_date', now()->toDateString())
            ->whereNotIn('status', ['cancelled', 'completed'])
            ->with(['user', 'animal', 'treatmentTypes'])
            ->orderBy('booking_time')
            ->limit(8)
            ->get();
    }

    /**
     * @return \Illuminate\Support\Collection<int, Animal>
     */
    // Diri kuhaon ang mga hayop nga birthday karon.
    private static function petsWithBirthdayToday()
    {
        return Animal::query()
            ->active()
            ->whereNotNull('birthdate')
            ->whereMonth('birthdate', now()->month)
            ->whereDay('birthdate', now()->day)
            ->with('user')
            ->orderBy('pet_name')
            ->limit(8)
            ->get();
    }

    /**
     * @return array<int, string>
     */
    // Diri kuhaon ang mga alert nga gi-dismiss sa user.
    public static function dismissedAlertKeys(User $user): array
    {
        return Notification::query()
            ->where('user_id', $user->id)
            ->where('type', 'admin_alert_dismissed')
            ->get()
            ->map(fn (Notification $notification) => $notification->data['alert_key'] ?? null)
            ->filter()
            ->values()
            ->all();
    }

    // Diri i-dismiss ang usa ka alert sa user.
    public static function dismissAlert(User $user, string $alertKey): void
    {
        $alertKey = trim($alertKey);
        if ($alertKey === '') {
            return;
        }

        $alreadyDismissed = Notification::query()
            ->where('user_id', $user->id)
            ->where('type', 'admin_alert_dismissed')
            ->where('data->alert_key', $alertKey)
            ->exists();

        if ($alreadyDismissed) {
            return;
        }

        Notification::create([
            'user_id' => $user->id,
            'type' => 'admin_alert_dismissed',
            'title' => 'Alert dismissed',
            'message' => $alertKey,
            'data' => ['alert_key' => $alertKey],
            'read_at' => now(),
        ]);
    }

    // Diri i-dismiss tanan live alerts sa user.
    public static function dismissAllLiveAlerts(User $user): void
    {
        $counts = self::buildCounts();
        $alerts = self::buildLiveAlerts($counts, []);

        foreach ($alerts as $alert) {
            self::dismissAlert($user, (string) $alert['id']);
        }
    }
}
