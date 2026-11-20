<?php

namespace App\Services;

use App\Events\ServiceNotificationCreated;
use App\Models\Inventory;
use App\Models\Medicine;
use App\Models\Notification;
use App\Models\User;
use App\Support\InventoryAlertHelper;
use Illuminate\Support\Collection;

class InventoryAlertNotificationService
{
    private const INVENTORY_ALERT_TYPES = [
        'inventory_out_of_stock',
        'inventory_low_stock',
        'inventory_expired',
        'inventory_expiring_soon',
    ];

    // Diri i-scan ang alerts sa usa ka tambal.
    public static function scanMedicine(int $medicineId): int
    {
        $medicine = Medicine::with(['inventories.unit'])->find($medicineId);
        if (!$medicine) {
            return 0;
        }

        $sent = 0;
        $stockAlert = self::buildMedicineStockAlert($medicine);
        if ($stockAlert) {
            $sent += self::notifyBudgetOfficers(
                $stockAlert['type'],
                $stockAlert['title'],
                $stockAlert['message'],
                $stockAlert['data']
            );
        }

        foreach ($medicine->inventories as $batch) {
            $batchAlert = self::buildBatchAlert($batch, $medicine);
            if ($batchAlert) {
                $sent += self::notifyBudgetOfficers(
                    $batchAlert['type'],
                    $batchAlert['title'],
                    $batchAlert['message'],
                    $batchAlert['data']
                );
            }
        }

        return $sent;
    }

    // Diri i-scan ang alerts sa tanang tambal.
    public static function scanAll(): int
    {
        $sent = 0;

        foreach (self::getActiveAlerts() as $alert) {
            $sent += self::notifyBudgetOfficers(
                $alert['type'],
                $alert['title'],
                $alert['message'],
                $alert['data']
            );
        }

        return $sent;
    }

    /**
     * @return array<int, array{type: string, title: string, message: string, data: array<string, mixed>}>
     */
    // Diri kuhaon ang tanang aktibo nga inventory alerts.
    public static function getActiveAlerts(): array
    {
        $alerts = [];

        Medicine::with(['inventories.unit'])
            ->orderBy('id')
            ->chunkById(50, function ($medicines) use (&$alerts) {
                foreach ($medicines as $medicine) {
                    $stockAlert = self::buildMedicineStockAlert($medicine);
                    if ($stockAlert) {
                        $alerts[] = $stockAlert;
                    }

                    foreach ($medicine->inventories as $batch) {
                        $batchAlert = self::buildBatchAlert($batch, $medicine);
                        if ($batchAlert) {
                            $alerts[] = $batchAlert;
                        }
                    }
                }
            });

        return $alerts;
    }

    /**
     * @return array<int, array{type: string, title: string, message: string, data: array<string, mixed>}>
     */
    // Diri kuhaon ang aktibo nga alerts nga wala gi-dismiss sa user.
    public static function getActiveAlertsForUser(?User $user): array
    {
        $alerts = self::getActiveAlerts();

        if (!$user) {
            return $alerts;
        }

        self::clearStaleDismissals($user, $alerts);

        $dismissedKeys = self::getDismissedAlertKeys($user, $alerts);

        return array_values(array_filter(
            $alerts,
            fn (array $alert) => !in_array($alert['data']['alert_key'] ?? '', $dismissedKeys, true)
        ));
    }

    // Diri i-dismiss ang usa ka inventory alert.
    public static function dismissAlert(User $user, string $alertKey): bool
    {
        $alert = collect(self::getActiveAlerts())->first(
            fn (array $item) => ($item['data']['alert_key'] ?? null) === $alertKey
        );

        if (!$alert) {
            return false;
        }

        $existing = Notification::query()
            ->where('user_id', $user->id)
            ->where('data->alert_key', $alertKey)
            ->first();

        if ($existing) {
            if ($existing->read_at === null) {
                $existing->update(['read_at' => now()]);
            }

            return true;
        }

        Notification::create([
            'user_id' => $user->id,
            'type' => $alert['type'],
            'title' => $alert['title'],
            'message' => $alert['message'],
            'data' => $alert['data'],
            'read_at' => now(),
        ]);

        return true;
    }

    // Diri i-dismiss tanan inventory alerts sa user.
    public static function dismissAllAlerts(User $user): int
    {
        $dismissed = 0;

        foreach (self::getActiveAlertsForUser($user) as $alert) {
            $alertKey = $alert['data']['alert_key'] ?? null;
            if (!$alertKey) {
                continue;
            }

            if (self::dismissAlert($user, $alertKey)) {
                $dismissed++;
            }
        }

        return $dismissed;
    }

    /**
     * @param  array<int, array{type: string, title: string, message: string, data: array<string, mixed>}>  $activeAlerts
     */
    // Diri papason ang daan nga dismiss sa alert.
    private static function clearStaleDismissals(User $user, array $activeAlerts): void
    {
        $activeKeys = collect($activeAlerts)
            ->map(fn (array $alert) => $alert['data']['alert_key'] ?? null)
            ->filter()
            ->values()
            ->all();

        Notification::query()
            ->where('user_id', $user->id)
            ->whereIn('type', self::INVENTORY_ALERT_TYPES)
            ->whereNotNull('read_at')
            ->get()
            ->each(function (Notification $notification) use ($activeKeys) {
                $alertKey = $notification->data['alert_key'] ?? null;

                if ($alertKey && !in_array($alertKey, $activeKeys, true)) {
                    $notification->delete();
                }
            });
    }

    /**
     * @param  array<int, array{type: string, title: string, message: string, data: array<string, mixed>}>  $activeAlerts
     * @return array<int, string>
     */
    // Diri kuhaon ang mga alert nga gi-dismiss sa user.
    private static function getDismissedAlertKeys(User $user, array $activeAlerts): array
    {
        $activeKeys = collect($activeAlerts)
            ->map(fn (array $alert) => $alert['data']['alert_key'] ?? null)
            ->filter()
            ->values()
            ->all();

        if ($activeKeys === []) {
            return [];
        }

        return Notification::query()
            ->where('user_id', $user->id)
            ->whereIn('type', self::INVENTORY_ALERT_TYPES)
            ->whereNotNull('read_at')
            ->get()
            ->map(fn (Notification $notification) => $notification->data['alert_key'] ?? null)
            ->filter(fn (?string $alertKey) => $alertKey && in_array($alertKey, $activeKeys, true))
            ->values()
            ->all();
    }

    // Diri himuon ang alert sa low o out of stock.
    private static function buildMedicineStockAlert(Medicine $medicine): ?array
    {
        $onHand = (float) $medicine->inventories
            ->filter(fn ($batch) => (float) $batch->quantity > 0 && !InventoryAlertHelper::isBatchExpired($batch))
            ->sum(fn ($batch) => (float) $batch->quantity);
        $displayUnits = InventoryAlertHelper::displayWholeUnits($onHand);
        $unitName = $medicine->inventories->first()?->unit?->name ?? 'units';

        if (InventoryAlertHelper::isOutOfStock($onHand)) {
            return [
                'type' => 'inventory_out_of_stock',
                'title' => 'Out of Stock',
                'message' => "{$medicine->name} is out of stock. Please restock as soon as possible.",
                'data' => [
                    'alert_key' => "out_of_stock:medicine:{$medicine->id}",
                    'medicine_id' => $medicine->id,
                    'medicine_name' => $medicine->name,
                    'on_hand' => $onHand,
                    'on_hand_display' => $displayUnits,
                    'unit' => $unitName,
                    'inventory_url' => '/budget/inventory/add?mode=restock&medicine_id='
                        . $medicine->id
                        . '&medicine_name=' . rawurlencode($medicine->name),
                ],
            ];
        }

        if (InventoryAlertHelper::isLowStock($onHand)) {
            return [
                'type' => 'inventory_low_stock',
                'title' => 'Low Stock',
                'message' => "{$medicine->name} is running low ({$displayUnits} {$unitName} remaining).",
                'data' => [
                    'alert_key' => "low_stock:medicine:{$medicine->id}",
                    'medicine_id' => $medicine->id,
                    'medicine_name' => $medicine->name,
                    'on_hand' => $onHand,
                    'on_hand_display' => $displayUnits,
                    'unit' => $unitName,
                    'threshold' => InventoryAlertHelper::lowStockThreshold(),
                    'inventory_url' => '/budget/inventory/add?mode=restock&medicine_id='
                        . $medicine->id
                        . '&medicine_name=' . rawurlencode($medicine->name),
                ],
            ];
        }

        return null;
    }

    // Diri himuon ang alert sa expired o hapit ma-expire nga batch.
    private static function buildBatchAlert(Inventory $batch, Medicine $medicine): ?array
    {
        if ((float) $batch->quantity <= 0) {
            return null;
        }

        $batch->loadMissing('unit');
        $medicineName = $medicine->name;
        $batchLabel = $batch->batch_number ?: "Batch #{$batch->id}";
        $expiryLabel = $batch->expiration_date?->format('F j, Y') ?? 'Unknown date';

        if (InventoryAlertHelper::isBatchExpired($batch)) {
            return [
                'type' => 'inventory_expired',
                'title' => 'Expired',
                'message' => "{$medicineName} ({$batchLabel}) expired on {$expiryLabel} and still has stock on hand.",
                'data' => [
                    'alert_key' => "expired:inventory:{$batch->id}",
                    'medicine_id' => $medicine->id,
                    'medicine_name' => $medicineName,
                    'inventory_id' => $batch->id,
                    'batch_number' => $batch->batch_number,
                    'expiration_date' => $batch->expiration_date?->toDateString(),
                    'expiration_date_formatted' => $expiryLabel,
                    'quantity' => (float) $batch->quantity,
                    'inventory_url' => "/budget/inventory/{$batch->id}",
                ],
            ];
        }

        if (InventoryAlertHelper::isBatchExpiringSoon($batch)) {
            return [
                'type' => 'inventory_expiring_soon',
                'title' => 'Expiring Soon',
                'message' => "{$medicineName} ({$batchLabel}) expires on {$expiryLabel}.",
                'data' => [
                    'alert_key' => "expiring:inventory:{$batch->id}",
                    'medicine_id' => $medicine->id,
                    'medicine_name' => $medicineName,
                    'inventory_id' => $batch->id,
                    'batch_number' => $batch->batch_number,
                    'expiration_date' => $batch->expiration_date?->toDateString(),
                    'expiration_date_formatted' => $expiryLabel,
                    'quantity' => (float) $batch->quantity,
                    'inventory_url' => "/budget/inventory/{$batch->id}",
                ],
            ];
        }

        return null;
    }

    // Diri pahibaw-on ang mga budget officer sa alert.
    private static function notifyBudgetOfficers(
        string $type,
        string $title,
        string $message,
        array $data
    ): int {
        $alertKey = $data['alert_key'] ?? null;
        $sent = 0;

        self::budgetOfficers()->each(function (User $user) use ($type, $title, $message, $data, $alertKey, &$sent) {
            if ($alertKey && self::wasRecentlyNotified($user->id, $alertKey)) {
                return;
            }

            Notification::create([
                'user_id' => $user->id,
                'type' => $type,
                'title' => $title,
                'message' => $message,
                'data' => $data,
            ]);

            broadcast(new ServiceNotificationCreated(
                $user->id,
                $title,
                $message,
                $data,
                $type
            ));

            $sent++;
        });

        return $sent;
    }

    // Diri kuhaon ang tanang budget officer.
    private static function budgetOfficers(): Collection
    {
        return User::query()
            ->where('role', 'budget_officer')
            ->orderBy('id')
            ->get();
    }

    // Diri susihon kung bag-o lang napahibaw-an ang user.
    private static function wasRecentlyNotified(int $userId, string $alertKey): bool
    {
        $hours = (int) config('inventory.notification_cooldown_hours', 24);

        return Notification::query()
            ->where('user_id', $userId)
            ->where('data->alert_key', $alertKey)
            ->where('created_at', '>=', now()->subHours($hours))
            ->exists();
    }
}
