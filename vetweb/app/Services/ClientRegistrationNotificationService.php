<?php

namespace App\Services;

use App\Events\ServiceNotificationCreated;
use App\Models\Notification;
use App\Models\User;

class ClientRegistrationNotificationService
{
    private const ADMIN_ROLES = ['data_manager', 'owner'];

    // Diri pahibaw-on ang client sa resulta sa registration.
    public static function notifyClientOfDecision(User $client, bool $approved): void
    {
        if ($client->role !== 'client') {
            return;
        }

        $type = $approved ? 'client_registration_approved' : 'client_registration_rejected';
        $title = $approved ? 'Account Approved' : 'Registration Not Approved';
        $message = $approved
            ? 'Your account registration has been approved by El Salvador Vet Clinic. Your owner name now shows normally.'
            : 'Your account registration was not approved because the details you provided did not match your ID or residence photo. Please register again with correct information.';

        $payload = [
            'client_id' => $client->id,
            'approval_status' => $approved ? 'approved' : 'rejected',
        ];

        Notification::create([
            'user_id' => $client->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $payload,
        ]);

        broadcast(new ServiceNotificationCreated(
            $client->id,
            $title,
            $message,
            $payload,
            $type
        ));
    }

    // Diri pahibaw-on ang admin sa bag-ong pending nga client.
    public static function notifyAdminsOfPendingRegistration(User $client): void
    {
        if ($client->role !== 'client' || $client->approval_status !== 'pending') {
            return;
        }

        $clientName = trim(($client->firstname ?? '') . ' ' . ($client->lastname ?? '')) ?: $client->name;
        $title = 'New Client Registration';
        $message = "{$clientName} submitted a registration and is waiting for approval.";

        $payload = [
            'client_id' => $client->id,
            'client_name' => $clientName,
            'href' => "/admin/clients/{$client->id}",
            'alert_key' => "client_pending_registration:{$client->id}",
        ];

        $admins = User::query()
            ->whereIn('role', self::ADMIN_ROLES)
            ->get();

        foreach ($admins as $admin) {
            $alreadyExists = Notification::query()
                ->where('user_id', $admin->id)
                ->where('type', 'client_pending_registration')
                ->whereNull('read_at')
                ->where('data->client_id', $client->id)
                ->exists();

            if ($alreadyExists) {
                continue;
            }

            Notification::create([
                'user_id' => $admin->id,
                'type' => 'client_pending_registration',
                'title' => $title,
                'message' => $message,
                'data' => $payload,
            ]);
        }
    }

    // Diri markahan nga nahuman ang notification sa registration.
    public static function markClientRegistrationHandled(int $clientId): void
    {
        Notification::query()
            ->where('type', 'client_pending_registration')
            ->whereNull('read_at')
            ->where('data->client_id', $clientId)
            ->update(['read_at' => now()]);
    }

    // Diri kuhaon ang registration notifications sa user.
    public static function getNotificationsForUser(User $user): array
    {
        $notifications = Notification::query()
            ->where('user_id', $user->id)
            ->where('type', 'client_pending_registration')
            ->whereNull('read_at')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        $clientIds = $notifications
            ->map(fn (Notification $notification) => $notification->data['client_id'] ?? null)
            ->filter()
            ->unique()
            ->values();

        $pendingClientIds = User::query()
            ->whereIn('id', $clientIds)
            ->where('role', 'client')
            ->where('approval_status', 'pending')
            ->pluck('id')
            ->all();

        foreach ($notifications as $notification) {
            $clientId = $notification->data['client_id'] ?? null;
            if ($clientId && !in_array((int) $clientId, array_map('intval', $pendingClientIds), true)) {
                $notification->update(['read_at' => now()]);
            }
        }

        return $notifications
            ->filter(function (Notification $notification) use ($pendingClientIds) {
                $clientId = $notification->data['client_id'] ?? null;
                if ($notification->read_at) {
                    return false;
                }
                if (!$clientId) {
                    return true;
                }
                return in_array((int) $clientId, array_map('intval', $pendingClientIds), true);
            })
            ->map(function (Notification $notification) {
                return [
                    'id' => $notification->id,
                    'type' => $notification->type,
                    'title' => $notification->title,
                    'message' => $notification->message,
                    'client_name' => $notification->data['client_name'] ?? null,
                    'action_label' => 'Review registration',
                    'data' => $notification->data,
                    'is_read' => false,
                    'created_at' => $notification->created_at,
                    'created_at_human' => $notification->created_at?->diffForHumans(),
                ];
            })
            ->values()
            ->all();
    }

    // Diri ihapon ang pending nga registration.
    public static function pendingRegistrationCount(): int
    {
        return User::query()
            ->where('role', 'client')
            ->where('approval_status', 'pending')
            ->count();
    }
}
