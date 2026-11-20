<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;

class BudgetNotificationController extends Controller
{
    // Diri kuhaon ang naka-login nga budget officer.
    private function budgetOfficer(Request $request)
    {
        $user = $request->user();

        if (!$user || $user->role !== 'budget_officer') {
            abort(403, 'Unauthorized');
        }

        return $user;
    }

    // Diri ilista ang notification sa budget officer.
    public function index(Request $request)
    {
        $user = $this->budgetOfficer($request);

        $notifications = Notification::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        $activeAlerts = \App\Services\InventoryAlertNotificationService::getActiveAlerts();

        return response()->json([
            'success' => true,
            'unread_count' => count($activeAlerts),
            'active_alerts' => $activeAlerts,
            'notifications' => $notifications->map(fn ($notification) => [
                'id' => $notification->id,
                'type' => $notification->type,
                'title' => $notification->title,
                'message' => $notification->message,
                'data' => $notification->data,
                'is_read' => $notification->read_at !== null,
                'created_at' => $notification->created_at,
                'created_at_human' => $notification->created_at?->diffForHumans(),
            ]),
        ]);
    }

    // Diri markahan nga nabasa ang notification sa budget.
    public function markRead(Request $request, int $id)
    {
        $user = $this->budgetOfficer($request);

        $notification = Notification::where('user_id', $user->id)
            ->where('id', $id)
            ->firstOrFail();

        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        return response()->json(['success' => true]);
    }

    // Diri markahan nga nabasa tanan notification sa budget.
    public function markAllRead(Request $request)
    {
        $user = $this->budgetOfficer($request);

        Notification::where('user_id', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['success' => true]);
    }

    // Diri i-scan dayon ang inventory alerts.
    public function scanAlerts(Request $request)
    {
        $this->budgetOfficer($request);

        $sent = \App\Services\InventoryAlertNotificationService::scanAll();

        return response()->json([
            'success' => true,
            'sent' => $sent,
        ]);
    }
}
