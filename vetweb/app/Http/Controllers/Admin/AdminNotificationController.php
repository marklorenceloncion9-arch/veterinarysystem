<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\User;
use App\Services\AdminAlertService;
use Illuminate\Http\Request;

class AdminNotificationController extends Controller
{
    /** Staff roles that may use the admin (or field) notification bell. */
    private const ADMIN_PANEL_ROLES = ['data_manager', 'owner', 'fieldman', 'budget_officer'];

    // Diri kuhaon ang staff user nga naka-login.
    private function resolveStaffUser(Request $request): ?User
    {
        $user = $request->user();

        if ($user && in_array($user->role, self::ADMIN_PANEL_ROLES, true)) {
            return $user;
        }

        return null;
    }

    // Diri ilista ang mga notification sa admin.
    public function index(Request $request)
    {
        $user = $this->resolveStaffUser($request);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Please refresh the page and sign in again.',
            ], 401);
        }

        $payload = AdminAlertService::buildPayloadForUser($user);

        return response()->json([
            'success' => true,
            'total_count' => $payload['total_count'],
            'counts' => $payload['counts'],
            'alerts' => $payload['alerts'],
            'pending_count' => $payload['counts']['pending_clients'],
            'unread_count' => $payload['unread_count'],
            'notifications' => $payload['notifications'],
        ]);
    }

    // Diri markahan nga nabasa ang usa ka notification.
    public function markRead(Request $request, int $id)
    {
        $user = $this->resolveStaffUser($request);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Please refresh the page and sign in again.',
            ], 401);
        }

        $notification = Notification::query()
            ->where('user_id', $user->id)
            ->where('type', 'client_pending_registration')
            ->where('id', $id)
            ->first();

        if (!$notification) {
            return response()->json([
                'success' => false,
                'message' => 'Notification not found',
            ], 404);
        }

        if (!$notification->read_at) {
            $notification->update(['read_at' => now()]);
        }

        return $this->index($request);
    }

    // Diri tangtangon ang usa ka live alert sa admin.
    public function dismiss(Request $request)
    {
        $user = $this->resolveStaffUser($request);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Please refresh the page and sign in again.',
            ], 401);
        }

        $validated = $request->validate([
            'alert_key' => 'required|string|max:191',
        ]);

        AdminAlertService::dismissAlert($user, $validated['alert_key']);

        return $this->index($request);
    }

    // Diri markahan nga nabasa tanan notification sa admin.
    public function markAllRead(Request $request)
    {
        $user = $this->resolveStaffUser($request);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Please refresh the page and sign in again.',
            ], 401);
        }

        Notification::query()
            ->where('user_id', $user->id)
            ->where('type', 'client_pending_registration')
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        AdminAlertService::dismissAllLiveAlerts($user);

        return $this->index($request);
    }
}
