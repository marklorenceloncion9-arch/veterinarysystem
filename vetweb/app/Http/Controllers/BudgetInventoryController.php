<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Appointment;
use App\Models\Category;
use App\Models\Unit;
use App\Models\Medicine;
use App\Models\Inventory;
use App\Models\InventoryLog;
use App\Models\OutsidePurchaseItem;
use App\Support\AdminAppointmentFormatter;
use App\Support\BookingTimeHelper;
use App\Support\BookingTypeLabel;
use App\Support\InventoryAlertHelper;
use App\Support\QuantityFormatter;
use App\Support\TreatmentStaff;
use App\Services\InventoryAlertNotificationService;
use Illuminate\Support\Facades\DB;

class BudgetInventoryController extends Controller
{
    // Diri i-format ang numero nga walay sobra nga decimal.
    private function formatNumber($value): int|float|null
    {
        if ($value === null || $value === '') {
            return null;
        }

        $num = (float) $value;

        return fmod($num, 1.0) === 0.0 ? (int) round($num) : round($num, 3);
    }

    /**
     * Whole-unit display for on-hand stock.
     * Partial use (e.g. 19.70 vials) still shows as 20 until a full unit is consumed.
     */
    // Diri ipakita ang stock isip buo nga numero.
    private function displayWholeUnits($value): int
    {
        $num = (float) $value;
        if ($num <= 0) {
            return 0;
        }

        return (int) ceil($num - 0.0000001);
    }

    // Diri i-format ang usa ka inventory item.
    private function mapInventoryItem(Inventory $item): array
    {
        $isBox = $item->isBox();
        $isVial = $item->isVial();
        $rawQuantity = (float) $item->quantity;
        $quantity = $this->formatNumber($rawQuantity);
        $displayUnits = $this->displayWholeUnits($rawQuantity);
        $totalItemsRaw = (float) $item->getTotalItems();
        $totalItems = $this->formatNumber($totalItemsRaw);
        $displayItems = $isBox ? $this->displayWholeUnits($totalItemsRaw) : null;
        $volumeMl = $this->formatNumber($item->volume_ml);

        $displayQty = $isBox
            ? $displayItems . ' items'
            : ($isVial
                ? $displayUnits . ' vials'
                : $displayUnits . ' ' . ($item->unit?->name ?? 'units'));

        return [
            ...$item->toArray(),
            'quantity' => $quantity,
            'quantity_display' => $displayUnits,
            'volume_ml' => $volumeMl,
            'items_per_box' => $this->formatNumber($item->items_per_box),
            'total_items' => $totalItems,
            'total_items_display' => $displayItems,
            'is_box' => $isBox,
            'is_capsule_or_tablet' => $item->isCapsuleOrTablet(),
            'is_vial' => $isVial,
            'is_expired' => $item->isExpired(),
            'is_usable' => $rawQuantity > 0 && !$item->isExpired(),
            'display_quantity' => $displayQty,
            'items_remaining' => $isBox ? $displayItems : null,
        ];
    }

    /**
     * Get all categories
     */
    // Diri kuhaon ang lista sa category sa tambal.
    public function getCategories()
    {
        try {
            $categories = Category::orderByRaw("CASE WHEN name = 'Others' THEN 1 ELSE 0 END, name")->get();
            return response()->json([
                'success' => true,
                'categories' => $categories
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch categories'
            ], 500);
        }
    }

    /**
     * Get all units
     */
    // Diri kuhaon ang lista sa units.
    public function getUnits()
    {
        try {
            $units = Unit::orderBy('name')->get();
            return response()->json([
                'success' => true,
                'units' => $units
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch units'
            ], 500);
        }
    }

    /**
     * List existing medicines with current on-hand stock (for restocking).
     */
    // Diri ilista ang mga tambal ug ilang stock.
    public function medicines()
    {
        try {
            $medicines = Medicine::with(['category', 'inventories.unit'])
                ->orderBy('name')
                ->get()
                ->map(function (Medicine $medicine) {
                    $batches = $medicine->inventories;
                    $onHand = $batches
                        ->filter(fn ($b) => (float) $b->quantity > 0 && !InventoryAlertHelper::isBatchExpired($b))
                        ->sum(fn ($b) => (float) $b->quantity);
                    $latest = $batches->sortByDesc('created_at')->first();

                    return [
                        'id' => $medicine->id,
                        'name' => $medicine->name,
                        'category_id' => $medicine->category_id,
                        'category' => $medicine->category?->name,
                        'on_hand' => $this->formatNumber(round($onHand, 3)),
                        'on_hand_display' => $this->displayWholeUnits($onHand),
                        'is_out_of_stock' => $onHand <= 0,
                        'unit_id' => $latest?->unit_id,
                        'unit_name' => $latest?->unit?->name,
                        'volume_ml' => $latest?->volume_ml,
                        'items_per_box' => $latest?->items_per_box,
                        'batches' => $batches->filter(fn ($b) => (float) $b->quantity > 0)->count(),
                    ];
                });

            return response()->json([
                'success' => true,
                'medicines' => $medicines,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch medicines',
            ], 500);
        }
    }

    /**
     * Store new inventory item
     */
    // Diri i-save ang bag-ong stock sa tambal.
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'medicine_name' => 'required|string|max:255',
                'category_id' => 'required|exists:categories,id',
                'quantity' => 'required|integer|min:1',
                'unit_id' => 'required|exists:units,id',
                'expiration_date' => 'required|date|after:today',
                'volume_ml' => 'nullable|numeric|min:0.1',
                'items_per_box' => 'nullable|integer|min:1'
            ]);

            $unit = Unit::findOrFail($validated['unit_id']);
            $unitName = strtolower(trim($unit->name));
            $isVial = in_array($unitName, ['vial', 'vials'], true);
            $isBox = in_array($unitName, ['box', 'boxes'], true);

            if ($isVial && empty($validated['volume_ml'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Volume per vial (ml) is required for vial items.',
                ], 422);
            }

            if ($isBox && empty($validated['items_per_box'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Items per box is required for box items.',
                ], 422);
            }

            DB::beginTransaction();

            // Create or get medicine (same name = restock / new FIFO batch)
            $medicine = Medicine::firstOrCreate(
                ['name' => trim($validated['medicine_name'])],
                ['category_id' => $validated['category_id']]
            );

            if (!$medicine->wasRecentlyCreated && (int) $medicine->category_id !== (int) $validated['category_id']) {
                $medicine->update(['category_id' => $validated['category_id']]);
            }

            $batchNumber = 'BATCH-' . $medicine->id . '-' . date('Ymd') . '-' . uniqid();

            $inventory = Inventory::create([
                'medicine_id' => $medicine->id,
                'batch_number' => $batchNumber,
                'quantity' => $validated['quantity'],
                'unit_id' => $validated['unit_id'],
                'expiration_date' => $validated['expiration_date'],
                'volume_ml' => $isVial ? ($validated['volume_ml'] ?? null) : null,
                'items_per_box' => $isBox ? ($validated['items_per_box'] ?? null) : null,
            ]);

            InventoryLog::create([
                'medicine_id' => $medicine->id,
                'inventory_id' => $inventory->id,
                'change_qty' => $validated['quantity'],
                'type' => 'IN',
                'reason' => InventoryLog::REASON_STOCK_IN,
            ]);

            DB::commit();

            $inventory->load(['medicine.category', 'unit']);
            InventoryAlertNotificationService::scanMedicine($medicine->id);

            return response()->json([
                'success' => true,
                'message' => $medicine->wasRecentlyCreated
                    ? "{$medicine->name} added to inventory successfully."
                    : "{$medicine->name} restocked successfully. A new batch was added.",
                'inventory' => $this->mapInventoryItem($inventory),
                'is_restock' => !$medicine->wasRecentlyCreated,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first() ?? 'Invalid input',
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to add medicine: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Receive several existing medicines in one stock-in.
     */
    // Diri modawat ug daghang restock sa usa ka receiving.
    public function receive(Request $request)
    {
        try {
            $validated = $request->validate([
                'items' => 'required|array|min:1',
                'items.*.medicine_id' => 'required|exists:medicines,id',
                'items.*.category_id' => 'nullable|exists:categories,id',
                'items.*.unit_id' => 'required|exists:units,id',
                'items.*.quantity' => 'required|integer|min:1',
                'items.*.expiration_date' => 'required|date|after:today',
                'items.*.volume_ml' => 'nullable|numeric|min:0.1',
                'items.*.items_per_box' => 'nullable|integer|min:1',
            ]);

            DB::beginTransaction();

            $created = [];

            foreach ($validated['items'] as $item) {
                $medicine = Medicine::findOrFail($item['medicine_id']);
                $unit = Unit::findOrFail($item['unit_id']);

                if (!empty($item['category_id']) && (int) $medicine->category_id !== (int) $item['category_id']) {
                    $medicine->update(['category_id' => $item['category_id']]);
                }

                $unitName = strtolower(trim($unit->name ?? ''));
                $isVial = in_array($unitName, ['vial', 'vials'], true) || (bool) ($unit->is_liquid ?? false);
                $isBox = in_array($unitName, ['box', 'boxes'], true);
                $volumeMl = $item['volume_ml'] ?? null;
                $itemsPerBox = $item['items_per_box'] ?? null;

                if ($isVial && empty($volumeMl)) {
                    DB::rollBack();

                    return response()->json([
                        'success' => false,
                        'message' => "Volume per vial (ml) is required for {$medicine->name}.",
                    ], 422);
                }

                if ($isBox && empty($itemsPerBox)) {
                    DB::rollBack();

                    return response()->json([
                        'success' => false,
                        'message' => "Items per box is required for {$medicine->name}.",
                    ], 422);
                }

                $inventory = Inventory::create([
                    'medicine_id' => $medicine->id,
                    'batch_number' => 'BATCH-'.$medicine->id.'-'.date('Ymd').'-'.uniqid(),
                    'quantity' => $item['quantity'],
                    'unit_id' => $unit->id,
                    'expiration_date' => $item['expiration_date'],
                    'volume_ml' => $isVial ? $volumeMl : null,
                    'items_per_box' => $isBox ? $itemsPerBox : null,
                ]);

                InventoryLog::create([
                    'medicine_id' => $medicine->id,
                    'inventory_id' => $inventory->id,
                    'change_qty' => $item['quantity'],
                    'type' => 'IN',
                    'reason' => InventoryLog::REASON_RECEIVING,
                ]);

                $created[] = $inventory->id;
                InventoryAlertNotificationService::scanMedicine($medicine->id);
            }

            DB::commit();

            $count = count($created);

            return response()->json([
                'success' => true,
                'message' => $count === 1
                    ? '1 item received. A new batch was added.'
                    : "{$count} items received. A new batch was added for each.",
                'inventory_ids' => $created,
                'inventory_id' => $created[0] ?? null,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first() ?? 'Invalid input',
            ], 422);
        } catch (\Exception $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            return response()->json([
                'success' => false,
                'message' => 'Failed to receive items: '.$e->getMessage(),
            ], 500);
        }
    }

    /**
     * Live inventory alerts for the budget officer notification bell.
     */
    // Diri kuhaon ang aktibo nga inventory alerts.
    public function activeAlerts(Request $request)
    {
        try {
            $alerts = InventoryAlertNotificationService::getActiveAlertsForUser($request->user());

            return response()->json([
                'success' => true,
                'unread_count' => count($alerts),
                'active_alerts' => $alerts,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch inventory alerts',
            ], 500);
        }
    }

    /**
     * Dismiss a single live inventory alert for the current user.
     */
    // Diri markahan nga nabasa ang inventory alert.
    public function markAlertRead(Request $request)
    {
        $user = $request->user();

        if (!$user || $user->role !== 'budget_officer') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $alertKey = trim((string) $request->input('alert_key', ''));
        $type = trim((string) $request->input('type', ''));
        $allowedTypes = [
            'inventory_expiring_soon',
            'inventory_expired',
            'inventory_low_stock',
            'inventory_out_of_stock',
        ];
        $keys = array_values(array_filter(array_map(
            'strval',
            (array) $request->input('alert_keys', [])
        )));

        if ($type !== '' && !in_array($type, $allowedTypes, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid alert type',
            ], 422);
        }

        $activeAlerts = InventoryAlertNotificationService::getActiveAlertsForUser($user);

        if ($type !== '') {
            foreach ($activeAlerts as $alert) {
                if (($alert['type'] ?? '') === $type && !empty($alert['data']['alert_key'])) {
                    $keys[] = $alert['data']['alert_key'];
                }
            }
        }

        $inventoryId = $request->filled('inventory_id') ? (int) $request->input('inventory_id') : 0;
        $medicineId = $request->filled('medicine_id') ? (int) $request->input('medicine_id') : 0;

        if ($inventoryId > 0 || $medicineId > 0) {
            foreach ($activeAlerts as $alert) {
                $data = $alert['data'] ?? [];
                $matchesInventory = $inventoryId > 0 && (int) ($data['inventory_id'] ?? 0) === $inventoryId;
                $matchesMedicine = $medicineId > 0 && (int) ($data['medicine_id'] ?? 0) === $medicineId;

                if (($matchesInventory || $matchesMedicine) && !empty($data['alert_key'])) {
                    $keys[] = $data['alert_key'];
                }
            }
        }

        if ($alertKey !== '') {
            $keys[] = $alertKey;
        }

        $keys = array_values(array_unique(array_filter($keys)));
        $scoped = $type !== '' || $inventoryId > 0 || $medicineId > 0;

        if ($keys === []) {
            if ($scoped) {
                return response()->json([
                    'success' => true,
                    'unread_count' => count($activeAlerts),
                    'active_alerts' => $activeAlerts,
                ]);
            }

            return response()->json([
                'success' => false,
                'message' => 'Alert key is required',
            ], 422);
        }

        $dismissed = 0;
        foreach ($keys as $key) {
            if (InventoryAlertNotificationService::dismissAlert($user, $key)) {
                $dismissed++;
            }
        }

        if ($dismissed === 0 && $alertKey !== '' && count($keys) === 1) {
            return response()->json([
                'success' => false,
                'message' => 'Alert not found',
            ], 404);
        }

        $alerts = InventoryAlertNotificationService::getActiveAlertsForUser($user);

        return response()->json([
            'success' => true,
            'unread_count' => count($alerts),
            'active_alerts' => $alerts,
        ]);
    }

    /**
     * Dismiss all current live inventory alerts for the current user.
     */
    // Diri markahan nga nabasa tanan inventory alerts.
    public function markAllAlertsRead(Request $request)
    {
        $user = $request->user();

        if (!$user || $user->role !== 'budget_officer') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $dismissed = InventoryAlertNotificationService::dismissAllAlerts($user);
        $alerts = InventoryAlertNotificationService::getActiveAlertsForUser($user);

        return response()->json([
            'success' => true,
            'dismissed' => $dismissed,
            'unread_count' => count($alerts),
            'active_alerts' => $alerts,
        ]);
    }

    /**
     * Get all inventory items
     */
    // Diri ipakita ang inventory page.
    public function index()
    {
        try {
            $inventory = Inventory::with(['medicine.category', 'unit'])
                ->where('quantity', '>', 0)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json([
                'success' => true,
                'inventory' => $inventory->map(fn ($item) => $this->mapInventoryItem($item))
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch inventory'
            ], 500);
        }
    }

    /**
     * History of new items and receiving, with date and type filters.
     */
    // Diri kuhaon ang history sa new item ug receiving.
    public function entryHistory(Request $request)
    {
        try {
            $validated = $request->validate([
                'from' => 'nullable|date',
                'to' => 'nullable|date',
                'medicine_id' => 'nullable|integer',
                'q' => 'nullable|string|max:100',
            ]);

            $query = InventoryLog::with(['medicine.category', 'inventory.unit'])
                ->whereRaw('LOWER(type) = ?', ['in'])
                ->orderByDesc('created_at')
                ->orderByDesc('id');

            if (!empty($validated['medicine_id'])) {
                $query->where('medicine_id', (int) $validated['medicine_id']);
            }

            if (!empty($validated['from'])) {
                $query->whereDate('created_at', '>=', $validated['from']);
            }

            if (!empty($validated['to'])) {
                $query->whereDate('created_at', '<=', $validated['to']);
            }

            $search = trim((string) ($validated['q'] ?? ''));
            if ($search !== '') {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $query->where(function ($builder) use ($like) {
                    $builder->whereHas('medicine', function ($medicine) use ($like) {
                        $medicine->where('name', 'like', $like)
                            ->orWhereHas('category', fn ($category) => $category->where('name', 'like', $like));
                    })->orWhereHas('inventory', fn ($inventory) => $inventory->where('batch_number', 'like', $like));
                });
            }

            $logs = $query->limit(500)->get();
            $batchLabels = $this->batchLabelsFor($logs);
            $firstInboundIds = $this->firstInboundIds($logs->pluck('medicine_id'));

            $rows = $logs->map(function (InventoryLog $log) use ($batchLabels, $firstInboundIds) {
                $medicine = $log->medicine;
                $inventory = $log->inventory;
                $qty = abs((float) $log->change_qty);
                $isVial = $inventory?->isVial() ?? false;
                $isBox = $inventory?->isBox() ?? false;
                $itemsPerBox = (float) ($inventory?->items_per_box ?? 0);
                $volumeMl = (float) ($inventory?->volume_ml ?? 0);
                $source = $this->inboundKind($log, $firstInboundIds);

                return [
                    'id' => $log->id,
                    'kind' => $source,
                    'medicine_name' => $medicine?->name ?? 'Unknown item',
                    'category' => $medicine?->category?->name ?? 'Uncategorized',
                    'inventory_id' => $inventory?->id,
                    'batch_number' => $inventory?->batch_number,
                    'batch_label' => $batchLabels[$log->inventory_id] ?? null,
                    'qty' => $this->formatNumber($qty),
                    'unit' => $inventory?->unit?->name ?? 'units',
                    'total_items' => $isBox && $itemsPerBox > 0 ? $this->formatNumber($qty * $itemsPerBox) : null,
                    'total_ml' => $isVial && $volumeMl > 0 ? $this->formatNumber($qty * $volumeMl) : null,
                    'expiration_date' => $inventory?->expiration_date?->format('Y-m-d'),
                    'date' => optional($log->created_at)->format('Y-m-d'),
                    'time' => optional($log->created_at)->format('h:i A'),
                    'created_at' => optional($log->created_at)->toDateTimeString(),
                ];
            })->values();

            return response()->json([
                'success' => true,
                'history' => $rows,
                'summary' => [
                    'total' => $rows->count(),
                    'new_count' => $rows->where('kind', InventoryLog::ENTRY_NEW)->count(),
                    'receiving_count' => $rows->where('kind', InventoryLog::ENTRY_RECEIVING)->count(),
                ],
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first() ?? 'Invalid filter',
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch history',
            ], 500);
        }
    }

    /**
     * Get single inventory item
     */
    // Diri ipakita ang detalye ug logs sa usa ka tambal.
    public function show($id)
    {
        try {
            $inventory = Inventory::with(['medicine.category', 'unit'])
                ->findOrFail($id);

            $firstInboundIds = $this->firstInboundIds((int) $inventory->medicine_id);
            $logs = InventoryLog::with(['animal', 'booking.animal', 'booking.user', 'booking.treatmentTypes', 'booking.bookingServices.service'])
                ->where('inventory_id', $inventory->id)
                ->orderByDesc('created_at')
                ->get()
                ->map(fn ($log) => $this->mapLogRow($log, $inventory, $firstInboundIds));

            $batches = Inventory::where('medicine_id', $inventory->medicine_id)
                ->orderBy('created_at')
                ->get()
                ->sort(function ($a, $b) {
                    if ($a->isExpired() !== $b->isExpired()) {
                        return $a->isExpired() ? 1 : -1;
                    }

                    return $a->created_at <=> $b->created_at;
                })
                ->values();

            $firstActiveId = $batches->first(
                fn ($batch) => (float) $batch->quantity > 0 && ! $batch->isExpired()
            )?->id;

            return response()->json([
                'success' => true,
                'inventory' => $this->mapInventoryItem($inventory),
                'logs' => $logs,
                'batches' => $batches->map(fn ($batch, $index) => [
                    'id' => $batch->id,
                    'batch_number' => $batch->batch_number,
                    'label' => 'Batch '.($index + 1),
                    'used_first' => $batch->id === $firstActiveId,
                ])->values(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch inventory item'
            ], 404);
        }
    }

    // Diri kuhaon ang unang stock-in sa matag tambal.
    private function firstInboundIds(int|array|\Illuminate\Support\Collection|null $medicineIds = null): array
    {
        $query = InventoryLog::query()
            ->whereRaw('LOWER(type) = ?', ['in'])
            ->orderBy('created_at')
            ->orderBy('id');

        if ($medicineIds instanceof \Illuminate\Support\Collection) {
            $medicineIds = $medicineIds->filter()->unique()->values();
            if ($medicineIds->isEmpty()) {
                return [];
            }
            $query->whereIn('medicine_id', $medicineIds->all());
        } elseif (is_array($medicineIds)) {
            $medicineIds = array_values(array_unique(array_filter($medicineIds)));
            if ($medicineIds === []) {
                return [];
            }
            $query->whereIn('medicine_id', $medicineIds);
        } elseif ($medicineIds) {
            $query->where('medicine_id', $medicineIds);
        }

        $first = [];
        foreach ($query->get(['id', 'medicine_id']) as $log) {
            $medicineId = (int) $log->medicine_id;
            if (!isset($first[$medicineId])) {
                $first[$medicineId] = (int) $log->id;
            }
        }

        return $first;
    }

    // Diri ilain ang new item ug ang receiving.
    private function inboundKind(InventoryLog $log, array $firstInboundIds): string
    {
        $createdAt = $log->created_at;
        if (
            $log->reason === InventoryLog::REASON_STOCK_IN
            && $createdAt
            && $createdAt->greaterThanOrEqualTo('2026-11-16 00:00:00')
        ) {
            return InventoryLog::ENTRY_NEW;
        }

        $firstId = $firstInboundIds[(int) $log->medicine_id] ?? null;

        return $firstId && (int) $log->id === (int) $firstId
            ? InventoryLog::ENTRY_NEW
            : InventoryLog::ENTRY_RECEIVING;
    }

    /**
     * Format an inventory log entry for display (shared by detail page and reports).
     */
    // Diri i-format ang usa ka inventory log.
    private function mapLogRow(InventoryLog $log, ?Inventory $inventory = null, array $firstInboundIds = []): array
    {
        $inventory = $inventory ?? $log->inventory;
        $isVial = $inventory?->isVial() ?? false;
        $isBox = $inventory?->isBox() ?? false;
        $qty = abs((float) $log->change_qty);
        $volumePerVial = (float) ($inventory?->volume_ml ?? 0);
        $qtyDisplay = $qty;
        $unitLabel = $inventory?->unit?->name ?? 'unit';
        $isOut = strtolower((string) $log->type) === 'out';

        // OUT logs for vials are stored in ml; convert back to vials for display consistency.
        if ($isOut && $isVial && $volumePerVial > 0) {
            $qtyDisplay = round($qty / $volumePerVial, 3);
        } elseif ($isOut && $isBox) {
            $unitLabel = 'items';
        }

        return [
            'id' => $log->id,
            'type' => strtoupper((string) $log->type),
            'reason' => $log->reason ?? ($isOut ? 'used' : 'stock_in'),
            'entry_source' => $isOut ? null : $this->inboundKind($log, $firstInboundIds),
            'qty' => $qtyDisplay,
            'qty_ml' => ($isOut && $isVial) ? $qty : null,
            'unit' => $unitLabel,
            'is_box_item' => $isBox,
            'used_for' => $this->describeBookingUsage($log),
            'is_read' => $log->viewed_at !== null,
            'viewed_at' => optional($log->viewed_at)->toDateTimeString(),
            'date' => optional($log->created_at)->format('Y-m-d'),
            'time' => optional($log->created_at)->format('h:i A'),
            'created_at' => optional($log->created_at)->toDateTimeString(),
        ];
    }

    /**
     * Mark a single inventory transaction as read/viewed.
     */
    // Diri markahan nga nabasa ang usa ka log.
    public function markLogRead(Request $request, $id)
    {
        try {
            $log = InventoryLog::find($id);

            if (!$log) {
                return response()->json([
                    'success' => false,
                    'message' => 'Transaction not found',
                ], 404);
            }

            $log->markAsRead();

            return response()->json([
                'success' => true,
                'id' => $log->id,
                'is_read' => true,
                'viewed_at' => optional($log->fresh()->viewed_at)->toDateTimeString(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark transaction as read: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Mark all unread inventory transactions in a type/reason group as read.
     */
    // Diri markahan nga nabasa ang daghang log.
    public function markLogsRead(Request $request)
    {
        try {
            $validated = $request->validate([
                'type' => 'required|in:in,out,IN,OUT',
                'reason' => 'nullable|in:used,damaged,expired,stock_in,receiving',
            ]);

            $type = strtolower($validated['type']);
            $reason = $validated['reason'] ?? null;

            $query = InventoryLog::query()
                ->whereRaw('LOWER(type) = ?', [$type])
                ->whereNull('viewed_at');

            if ($reason === 'used') {
                $query->where(function ($q) {
                    $q->where('reason', 'used')->orWhereNull('reason');
                });
            } elseif ($reason) {
                $query->where('reason', $reason);
            }

            $ids = $query->pluck('id')->all();
            $viewedAt = now();

            if (count($ids) > 0) {
                InventoryLog::whereIn('id', $ids)->update(['viewed_at' => $viewedAt]);
            }

            return response()->json([
                'success' => true,
                'marked_count' => count($ids),
                'ids' => $ids,
                'viewed_at' => $viewedAt->toDateTimeString(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark transactions as read: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Map inventory IDs to "Batch N", numbered per medicine from oldest to newest.
     *
     * @return array<int, string>
     */
    // Diri himuon ang label sa batch para sa mga log.
    private function batchLabelsFor($logs): array
    {
        $medicineIds = $logs->pluck('medicine_id')->filter()->unique()->values();
        if ($medicineIds->isEmpty()) {
            return [];
        }

        $labels = [];
        Inventory::query()
            ->whereIn('medicine_id', $medicineIds)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'medicine_id', 'created_at'])
            ->groupBy('medicine_id')
            ->each(function ($batches) use (&$labels) {
                $batches->values()->each(function ($batch, $index) use (&$labels) {
                    $labels[$batch->id] = 'Batch ' . ($index + 1);
                });
            });

        return $labels;
    }

    /**
     * Describe which treatment/pet an OUT log was used for, if linked to a booking.
     */
    // Diri isaysay asa nga booking gigamit ang tambal.
    private function describeBookingUsage(InventoryLog $log): ?array
    {
        $booking = $log->booking;

        if (!$booking) {
            return null;
        }

        $animal = $log->animal ?: $booking->animal;
        $animalId = $log->animal_id ? (int) $log->animal_id : (int) ($animal?->id ?? 0);
        $ownerName = trim(($booking->user?->firstname ?? '') . ' ' . ($booking->user?->lastname ?? ''));

        $petServices = $booking->bookingServices
            ->filter(function ($row) use ($animalId) {
                if ($animalId <= 0) {
                    return true;
                }
                $rowAnimalId = (int) ($row->animal_id ?? 0);

                return $rowAnimalId === 0 || $rowAnimalId === $animalId;
            })
            ->map(fn ($row) => $row->service?->type_name)
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($petServices === []) {
            $petServices = $booking->treatmentTypes?->pluck('type_name')->filter()->values()->all() ?? [];
        }

        $administeredBy = null;
        if ($animalId > 0) {
            foreach ($booking->bookedAnimalEntries() as $entry) {
                if ((int) ($entry['animal_id'] ?? 0) !== $animalId) {
                    continue;
                }
                $name = trim((string) ($entry['administered_by'] ?? ''));
                if ($name !== '') {
                    $administeredBy = $name;
                }
                break;
            }
        }

        if ($administeredBy === null) {
            $names = collect($booking->bookedAnimalEntries())
                ->pluck('administered_by')
                ->map(fn ($name) => trim((string) $name))
                ->filter()
                ->unique()
                ->values();
            if ($names->isNotEmpty()) {
                $administeredBy = $names->implode(', ');
            }
        }

        $administeredBy = $administeredBy ?: (trim((string) $booking->administered_by) ?: null);
        $administeredBy = AdminAppointmentFormatter::resolveAdministeredByLabel($administeredBy, $booking);

        return [
            'booking_id' => $booking->id,
            'animal_id' => $animalId ?: null,
            'pet_name' => $animal?->pet_name ?? 'Unknown pet',
            'owner_name' => $ownerName !== '' ? $ownerName : 'Unknown owner',
            'service' => count($petServices) > 0 ? implode(', ', $petServices) : null,
            'booking_type' => BookingTypeLabel::label($booking->booking_type),
            'administered_by' => $administeredBy,
        ];
    }

    /**
     * Person responsible for this stock-out line: the visit's administered-by name,
     * or the staff member who reported a damage deduction.
     */
    // Diri kuhaon kinsa ang naghatag sa tambal sa log.
    private function describeLogAdministeredBy(InventoryLog $log): ?string
    {
        $fromBooking = $this->describeBookingUsage($log)['administered_by'] ?? null;
        if ($fromBooking) {
            return $fromBooking;
        }

        $report = $log->damageReport;
        $staff = $report?->reporter ?: $report?->deductedByUser;
        if (!$staff) {
            return null;
        }

        return TreatmentStaff::displayName($staff);
    }

    /**
     * Record a manual stock out (used, damaged or expired) against a batch.
     */
    // Diri ang manual nga pag-stock out sa tambal.
    public function stockOut(Request $request, $id)
    {
        try {
            $rules = [
                'reason' => 'required|in:used,damaged,expired',
            ];

            if ($request->input('reason') !== 'expired') {
                $rules['quantity'] = 'required|numeric|min:0.001';
            }

            $validated = $request->validate($rules);

            DB::beginTransaction();

            $inventory = Inventory::with(['medicine', 'unit'])->lockForUpdate()->findOrFail($id);
            $available = (float) $inventory->quantity;

            if ($available <= 0) {
                DB::rollBack();

                return response()->json([
                    'success' => false,
                    'message' => 'This batch has no stock left to remove.',
                ], 422);
            }

            if ($validated['reason'] === 'expired') {
                if (!InventoryAlertHelper::isBatchExpired($inventory)) {
                    DB::rollBack();

                    return response()->json([
                        'success' => false,
                        'message' => 'Only expired batches can be written off with the Expired reason.',
                    ], 422);
                }

                $qty = $available;
            } else {
                $qty = (float) $validated['quantity'];

                if ($qty > $available) {
                    DB::rollBack();

                    return response()->json([
                        'success' => false,
                        'message' => "Quantity exceeds available stock ({$available} " . ($inventory->unit?->name ?? 'units') . ').',
                    ], 422);
                }
            }

            $logQty = $qty;

            // Keep log qty consistent with treatment OUT logs:
            // boxes are logged in items, vials are logged in ml.
            if ($inventory->isBox() && $inventory->items_per_box > 0) {
                $logQty = $qty * (float) $inventory->items_per_box;
            } elseif ($inventory->isVial() && (float) $inventory->volume_ml > 0) {
                $logQty = round($qty * (float) $inventory->volume_ml, 2);
            }

            $inventory->quantity = $available - $qty;
            $inventory->save();

            InventoryLog::create([
                'medicine_id' => $inventory->medicine_id,
                'inventory_id' => $inventory->id,
                'change_qty' => -$logQty,
                'type' => 'OUT',
                'reason' => $validated['reason'],
            ]);

            DB::commit();

            InventoryAlertNotificationService::scanMedicine((int) $inventory->medicine_id);

            return response()->json([
                'success' => true,
                'message' => $validated['reason'] === 'expired'
                    ? 'Entire expired batch written off successfully'
                    : 'Stock out recorded successfully',
                'inventory' => $this->mapInventoryItem($inventory->fresh(['medicine.category', 'unit'])),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first() ?? 'Invalid input',
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to record stock out: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get inventory usage report (OUT logs).
     */
    // Diri himuon ang report sa paggamit sa tambal.
    public function usageReport(Request $request)
    {
        try {
            $from = $request->query('from');
            $to = $request->query('to');

            $query = InventoryLog::with([
                'medicine.category',
                'inventory.unit',
                'animal',
                'booking.animal',
                'booking.user',
                'booking.treatmentTypes',
                'booking.bookingServices.service',
                'booking.assignedFieldmen',
                'damageReport.reporter',
                'damageReport.deductedByUser',
            ])
                ->whereRaw('LOWER(type) = ?', ['out'])
                ->orderByDesc('created_at');

            if ($from) {
                $query->whereDate('created_at', '>=', $from);
            }

            if ($to) {
                $query->whereDate('created_at', '<=', $to);
            }

            $logs = $query->get();
            $batchLabels = $this->batchLabelsFor($logs);

            $rows = $logs->map(function ($log) use ($batchLabels) {
                $medicine = $log->medicine;
                $inventory = $log->inventory;
                $isVialUsage = $inventory?->isVial() ?? false;
                $isBoxUsage = $inventory?->isBox() ?? false;
                $usedQty = abs((float) $log->change_qty);
                $volumePerVial = (float) ($inventory?->volume_ml ?? 0);
                $usedQtyDisplay = $usedQty;
                
                $unitLabel = $inventory?->unit?->name ?? 'unit';

                if ($isVialUsage && $volumePerVial > 0) {
                    // Logs store vial usage in ml; convert back to vial fraction for report unit consistency.
                    $usedQtyDisplay = round($usedQty / $volumePerVial, 3);
                } elseif ($isBoxUsage) {
                    $unitLabel = 'items';
                }

                return [
                    'id' => $log->id,
                    'medicine_name' => $medicine?->name ?? 'Unknown medicine',
                    'category' => $medicine?->category?->name ?? 'Uncategorized',
                    'batch_number' => $inventory?->batch_number,
                    'batch_label' => $batchLabels[$log->inventory_id] ?? null,
                    'expiration_date' => $inventory?->expiration_date?->format('Y-m-d'),
                    'used_qty' => $usedQtyDisplay,
                    'used_ml' => $isVialUsage ? $usedQty : null,
                    'unit' => $unitLabel,
                    'reason' => $log->reason ?? 'used',
                    'used_for' => $this->describeBookingUsage($log),
                    'administered_by' => $this->describeLogAdministeredBy($log),
                    'is_box_item' => $isBoxUsage,
                    'is_read' => $log->viewed_at !== null,
                    'viewed_at' => optional($log->viewed_at)->toDateTimeString(),
                    'date' => optional($log->created_at)->format('Y-m-d'),
                    'time' => optional($log->created_at)->format('h:i A'),
                    'created_at' => optional($log->created_at)->toDateTimeString(),
                ];
            });

            $outsideRows = $this->outsidePurchaseReportRows($from, $to);
            $reportRows = $rows
                ->concat($outsideRows)
                ->sortByDesc('created_at')
                ->values();

            $unreadRows = $rows->where('is_read', false);
            $stockInUnreadQuery = InventoryLog::query()
                ->whereRaw('LOWER(type) = ?', ['in'])
                ->whereNull('viewed_at');

            if ($from) {
                $stockInUnreadQuery->whereDate('created_at', '>=', $from);
            }
            if ($to) {
                $stockInUnreadQuery->whereDate('created_at', '<=', $to);
            }

            return response()->json([
                'success' => true,
                'report' => $reportRows,
                'summary' => [
                    'total_transactions' => $rows->count(),
                    'total_items_used' => $rows->sum('used_qty'),
                    'used_count' => $rows->where('reason', 'used')->count(),
                    'damaged_count' => $rows->where('reason', 'damaged')->count(),
                    'expired_count' => $rows->where('reason', 'expired')->count(),
                    'outside_count' => $outsideRows->count(),
                    'unread_used_count' => $unreadRows->where('reason', 'used')->count(),
                    'unread_damaged_count' => $unreadRows->where('reason', 'damaged')->count(),
                    'unread_expired_count' => $unreadRows->where('reason', 'expired')->count(),
                    'unread_stock_out_count' => $unreadRows->count(),
                    'unread_stock_in_count' => $stockInUnreadQuery->count(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch usage report: ' . $e->getMessage(),
            ], 500);
        }
    }

    // Diri i-lista ang resibo nga paliton sa gawas.
    private function outsidePurchaseReportRows(?string $from, ?string $to)
    {
        $query = OutsidePurchaseItem::with([
            'animal',
            'booking.user',
            'booking.treatmentTypes',
            'booking.bookingServices.service',
            'booking.assignedFieldmen',
        ])->orderByDesc('issued_at');

        if ($from) {
            $query->whereDate('issued_at', '>=', $from);
        }

        if ($to) {
            $query->whereDate('issued_at', '<=', $to);
        }

        return $query->get()
            ->groupBy(function (OutsidePurchaseItem $item) {
                return implode('|', [
                    (string) $item->booking_id,
                    mb_strtolower(trim((string) $item->item_name)),
                    (string) $item->quantity,
                    mb_strtolower(trim((string) $item->status)),
                ]);
            })
            ->map(function ($group) {
                /** @var OutsidePurchaseItem $item */
                $item = $group->first();
                $booking = $item->booking;
                $petNames = $group
                    ->map(fn (OutsidePurchaseItem $row) => $row->animal?->pet_name)
                    ->filter()
                    ->unique()
                    ->values();
                $ownerName = trim(($booking?->user?->firstname ?? '') . ' ' . ($booking?->user?->lastname ?? ''));
                $services = $booking?->treatmentTypes?->pluck('type_name')->filter()->unique()->values()->all() ?? [];
                $issuedAt = $item->issued_at ?? $item->created_at;

                return [
                    'id' => 'outside-'.$item->booking_id.'-'.$item->id,
                    'medicine_name' => $item->item_name,
                    'category' => 'Outside clinic',
                    'batch_number' => null,
                    'batch_label' => null,
                    'expiration_date' => null,
                    'used_qty' => (float) $item->quantity,
                    'used_ml' => null,
                    'unit' => '',
                    'reason' => 'outside',
                    'status' => OutsidePurchaseItem::displayStatus($item->status),
                    'used_for' => $booking ? [
                        'booking_id' => $booking->id,
                        'animal_id' => null,
                        'pet_name' => $petNames->isNotEmpty() ? $petNames->implode(', ') : 'Unknown pet',
                        'owner_name' => $ownerName !== '' ? $ownerName : 'Unknown owner',
                        'service' => count($services) > 0 ? implode(', ', $services) : null,
                        'booking_type' => BookingTypeLabel::label($booking->booking_type),
                        'administered_by' => AdminAppointmentFormatter::resolveAdministeredByLabel(
                            $booking->administered_by,
                            $booking
                        ),
                    ] : null,
                    'administered_by' => $booking
                        ? AdminAppointmentFormatter::resolveAdministeredByLabel($booking->administered_by, $booking)
                        : null,
                    'is_box_item' => false,
                    'is_read' => true,
                    'viewed_at' => null,
                    'date' => optional($issuedAt)->format('Y-m-d'),
                    'time' => optional($issuedAt)->format('h:i A'),
                    'created_at' => optional($issuedAt)->toDateTimeString(),
                ];
            })
            ->values();
    }

    /**
     * Per-medicine stock summary: total in, total out (by reason) and balance on hand.
     */
    // Diri himuon ang summary sa stock sa tanang tambal.
    public function stockSummary()
    {
        try {
            $batchesByMedicine = Inventory::with(['medicine.category', 'unit'])
                ->get()
                ->groupBy('medicine_id');
            $logs = InventoryLog::with(['inventory.unit'])->get()->groupBy('medicine_id');

            $rows = Medicine::with(['category', 'inventories.unit'])
                ->orderBy('name')
                ->get()
                ->map(function (Medicine $medicine) use ($batchesByMedicine, $logs) {
                    $medicineBatches = $batchesByMedicine->get($medicine->id, collect());
                    $latestBatch = $medicineBatches->sortByDesc('created_at')->first()
                        ?? $medicine->inventories->sortByDesc('created_at')->first();
                    $unitName = $latestBatch?->unit?->name ?? 'units';

                    $stockBatches = $medicineBatches->filter(fn ($b) => (float) $b->quantity > 0);
                    $activeBatches = $stockBatches->filter(
                        fn ($b) => !InventoryAlertHelper::isBatchExpired($b)
                    );
                    $expiredBatches = $stockBatches->filter(
                        fn ($b) => InventoryAlertHelper::isBatchExpired($b)
                    );
                    $expiringSoonBatches = $activeBatches->filter(
                        fn ($b) => InventoryAlertHelper::isBatchExpiringSoon($b)
                    );

                    $onHand = $activeBatches->sum(fn ($b) => (float) $b->quantity);
                    $expiredOnHand = $expiredBatches->sum(fn ($b) => (float) $b->quantity);
                    $physicalOnHand = $stockBatches->sum(fn ($b) => (float) $b->quantity);
                    $nearestExpiry = $activeBatches->pluck('expiration_date')->filter()->sort()->first()
                        ?? $stockBatches->pluck('expiration_date')->filter()->sort()->first();

                    $totals = ['in' => 0.0, 'used' => 0.0, 'damaged' => 0.0, 'expired' => 0.0];

                    foreach ($logs->get($medicine->id, collect()) as $log) {
                        $qty = abs((float) $log->change_qty);
                        $inventory = $log->inventory;

                        if (strtolower((string) $log->type) === 'in') {
                            $totals['in'] += $qty;
                            continue;
                        }

                        if ($inventory) {
                            if ($inventory->isVial() && (float) $inventory->volume_ml > 0) {
                                $qty = $qty / (float) $inventory->volume_ml;
                            } elseif ($inventory->isBox() && (float) $inventory->items_per_box > 0) {
                                $qty = $qty / (float) $inventory->items_per_box;
                            }
                        }

                        $reason = in_array($log->reason, ['damaged', 'expired'], true) ? $log->reason : 'used';
                        $totals[$reason] += $qty;
                    }

                    $totalOut = $totals['used'] + $totals['damaged'] + $totals['expired'];

                    return [
                        'medicine_id' => (int) $medicine->id,
                        'medicine_name' => $medicine->name,
                        'category' => $medicine->category?->name ?? 'Uncategorized',
                        'category_id' => $medicine->category_id,
                        'unit' => $unitName,
                        'total_in' => $this->formatNumber(round($totals['in'], 3)),
                        'total_out' => $this->formatNumber(round($totalOut, 3)),
                        'out_used' => $this->formatNumber(round($totals['used'], 3)),
                        'out_damaged' => $this->formatNumber(round($totals['damaged'], 3)),
                        'out_expired' => $this->formatNumber(round($totals['expired'], 3)),
                        'on_hand' => $this->formatNumber(round($onHand, 3)),
                        'on_hand_display' => $this->displayWholeUnits($onHand),
                        'expired_on_hand' => $this->formatNumber(round($expiredOnHand, 3)),
                        'expired_on_hand_display' => $this->displayWholeUnits($expiredOnHand),
                        'physical_on_hand' => $this->formatNumber(round($physicalOnHand, 3)),
                        'physical_on_hand_display' => $this->displayWholeUnits($physicalOnHand),
                        'batches' => $activeBatches->count(),
                        'total_batches' => $stockBatches->count(),
                        'expired_batches' => $expiredBatches->count(),
                        'has_expiring_soon' => $expiringSoonBatches->isNotEmpty(),
                        'nearest_expiry' => $nearestExpiry?->format('Y-m-d'),
                    ];
                })
                ->sortBy('medicine_name')
                ->values();

            $statusCounts = [
                'good' => 0,
                'low_stock' => 0,
                'out_of_stock' => 0,
                'expired' => 0,
                'expiring' => 0,
            ];

            foreach ($rows as $row) {
                $usable = (float) ($row['on_hand'] ?? 0);
                $expired = (float) ($row['expired_on_hand'] ?? 0);
                $usableDisplay = $this->displayWholeUnits($usable);

                if ($usable <= 0 && $expired > 0) {
                    $statusCounts['expired']++;
                } elseif ($usable <= 0) {
                    $statusCounts['out_of_stock']++;
                } elseif ($usableDisplay <= InventoryAlertHelper::lowStockThreshold()) {
                    $statusCounts['low_stock']++;
                } elseif ($row['has_expiring_soon']) {
                    $statusCounts['expiring']++;
                } else {
                    $statusCounts['good']++;
                }
            }

            return response()->json([
                'success' => true,
                'summary' => $rows,
                'totals' => [
                    'medicines' => $rows->count(),
                    'usable_on_hand' => $this->displayWholeUnits(
                        $rows->sum(fn (array $row) => (float) ($row['on_hand'] ?? 0))
                    ),
                    'status_counts' => $statusCounts,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch stock summary: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get stock-in report (IN logs).
     */
    // Diri himuon ang report sa mga stock in.
    public function stockInReport(Request $request)
    {
        try {
            $from = $request->query('from');
            $to = $request->query('to');

            $query = InventoryLog::with(['medicine.category', 'inventory.unit'])
                ->whereRaw('LOWER(type) = ?', ['in'])
                ->orderByDesc('created_at');

            if ($from) {
                $query->whereDate('created_at', '>=', $from);
            }

            if ($to) {
                $query->whereDate('created_at', '<=', $to);
            }

            $logs = $query->get();
            $batchLabels = $this->batchLabelsFor($logs);

            $rows = $logs->map(function ($log) use ($batchLabels) {
                $medicine = $log->medicine;
                $inventory = $log->inventory;
                $qty = abs((float) $log->change_qty);
                $unitLabel = $inventory?->unit?->name ?? 'unit';

                return [
                    'id' => $log->id,
                    'medicine_name' => $medicine?->name ?? 'Unknown medicine',
                    'category' => $medicine?->category?->name ?? 'Uncategorized',
                    'batch_number' => $inventory?->batch_number,
                    'batch_label' => $batchLabels[$log->inventory_id] ?? null,
                    'qty' => $qty,
                    'unit' => $unitLabel,
                    'reason' => in_array($log->reason, ['receiving', 'stock_in'], true) || ! $log->reason
                        ? 'receiving'
                        : $log->reason,
                    'expiration_date' => $inventory?->expiration_date?->format('Y-m-d'),
                    'is_read' => $log->viewed_at !== null,
                    'viewed_at' => optional($log->viewed_at)->toDateTimeString(),
                    'date' => optional($log->created_at)->format('Y-m-d'),
                    'time' => optional($log->created_at)->format('h:i A'),
                    'created_at' => optional($log->created_at)->toDateTimeString(),
                ];
            });

            $stockOutUnreadQuery = InventoryLog::query()
                ->whereRaw('LOWER(type) = ?', ['out'])
                ->whereNull('viewed_at');

            if ($from) {
                $stockOutUnreadQuery->whereDate('created_at', '>=', $from);
            }
            if ($to) {
                $stockOutUnreadQuery->whereDate('created_at', '<=', $to);
            }

            return response()->json([
                'success' => true,
                'report' => $rows,
                'summary' => [
                    'total_transactions' => $rows->count(),
                    'total_items_in' => $rows->sum('qty'),
                    'unread_stock_in_count' => $rows->where('is_read', false)->count(),
                    'unread_stock_out_count' => $stockOutUnreadQuery->count(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch stock-in report: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * List inventory batches that are past expiry and still have stock on hand.
     */
    // Diri himuon ang report sa mga expired nga stock.
    public function expiredStockReport()
    {
        try {
            $batches = Inventory::with(['medicine.category', 'unit'])
                ->where('quantity', '>', 0)
                ->whereNotNull('expiration_date')
                ->orderBy('expiration_date')
                ->get()
                ->filter(fn (Inventory $batch) => InventoryAlertHelper::isBatchExpired($batch));

            $rows = $batches->map(function (Inventory $batch) {
                $medicine = $batch->medicine;
                $isVial = $batch->isVial();
                $isBox = $batch->isBox();
                $qty = (float) $batch->quantity;
                $unitLabel = $batch->unit?->name ?? 'unit';

                if ($isBox) {
                    $unitLabel = 'items';
                }

                $qtyDisplay = $qty;
                if ($isVial && (float) $batch->volume_ml > 0) {
                    $qtyDisplay = round($qty, 3);
                }

                $expiry = $batch->expiration_date?->startOfDay();
                $daysOverdue = $expiry ? $expiry->diffInDays(now()->startOfDay(), false) : 0;

                return [
                    'id' => $batch->id,
                    'medicine_name' => $medicine?->name ?? 'Unknown medicine',
                    'category' => $medicine?->category?->name ?? 'Uncategorized',
                    'batch_number' => $batch->batch_number,
                    'qty' => $this->formatNumber($qtyDisplay),
                    'unit' => $unitLabel,
                    'expiration_date' => $batch->expiration_date?->format('Y-m-d'),
                    'days_overdue' => max(0, (int) $daysOverdue),
                    'is_box_item' => $isBox,
                ];
            })->values();

            return response()->json([
                'success' => true,
                'report' => $rows,
                'summary' => [
                    'total_batches' => $rows->count(),
                    'total_items' => $rows->sum('qty'),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch expired stock report: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Completed treatment history for budget officer reporting.
     */
    // Diri himuon ang report sa history sa serbisyo.
    public function serviceHistoryReport(Request $request)
    {
        try {
            $from = $request->query('from');
            $to = $request->query('to');

            $query = Appointment::with([
                'user',
                'animal.breed',
                'animal.species',
                'treatmentTypes',
                'bookingMedicines.medicine',
                'bookingMedicines.inventory',
                'bookingMedicines.animal',
                'outsidePurchaseItems',
            ])
                ->where('status', 'completed')
                ->where(function ($match) {
                    $match->whereHas('bookingMedicines')
                        ->orWhereHas('outsidePurchaseItems');
                })
                ->orderByDesc('booking_date')
                ->orderByDesc('booking_time');

            if ($from) {
                $query->whereDate('booking_date', '>=', $from);
            }

            if ($to) {
                $query->whereDate('booking_date', '<=', $to);
            }

            $appointments = $query->get();
            Appointment::hydrateBookedAnimals($appointments);

            $rows = $appointments->map(function (Appointment $appointment) {
                $services = $appointment->treatmentTypes->pluck('type_name')->filter()->values()->all();
                $bookedPets = $appointment->resolvedAnimals();
                $petNames = $bookedPets->pluck('pet_name')->filter()->values()->all();

                return [
                    'id' => $appointment->id,
                    'pet_name' => $petNames[0] ?? ($appointment->animal?->pet_name ?? 'Unknown'),
                    'pet_names' => $petNames,
                    'pet_count' => max(count($petNames), $appointment->animal ? 1 : 0),
                    'booked_pets' => $bookedPets->map(function ($animal) {
                        return [
                            'id' => $animal->id,
                            'pet_name' => $animal->pet_name,
                            'species' => $animal->species?->species_name ?? $animal->species,
                            'breed' => $animal->breed?->breed_name ?? $animal->breed,
                        ];
                    })->values()->all(),
                    'owner_name' => trim(($appointment->user?->firstname ?? '') . ' ' . ($appointment->user?->lastname ?? '')) ?: 'Unknown',
                    'services' => $services,
                    'service_label' => count($services) > 0 ? implode(', ', $services) : null,
                    'booking_date' => $appointment->booking_date?->format('Y-m-d'),
                    'booking_time' => BookingTimeHelper::normalizeToHi($appointment->booking_time),
                    'completed_at' => $appointment->updated_at?->toDateTimeString(),
                    'administered_by' => $appointment->administered_by,
                    'booking_type' => $appointment->booking_type,
                    'booking_type_label' => BookingTypeLabel::label($appointment->booking_type),
                    'medicines' => $appointment->bookingMedicines->map(function ($bookingMedicine) {
                        return [
                            'name' => $bookingMedicine->medicine?->name ?? 'Unknown medicine',
                            'quantity' => QuantityFormatter::formatTreatmentDisplay(
                                $bookingMedicine,
                                $bookingMedicine->inventory
                            ),
                            'animal_id' => $bookingMedicine->animal_id ? (int) $bookingMedicine->animal_id : null,
                            'pet_name' => $bookingMedicine->animal?->pet_name
                                ?? $appointment->animal?->pet_name,
                        ];
                    })->values()->all(),
                    'outside_items' => $appointment->outsidePurchaseItems
                        ->map(fn ($item) => AdminAppointmentFormatter::formatOutsidePurchaseItem($item))
                        ->unique(fn ($item) => mb_strtolower((string) $item['name']).'|'.$item['quantity'].'|'.mb_strtolower((string) $item['status']))
                        ->values()
                        ->all(),
                ];
            })->values();

            return response()->json([
                'success' => true,
                'report' => $rows,
                'summary' => [
                    'total_completed' => $rows->count(),
                    'walk_ins' => $rows->where('booking_type', 'walk_in')->count(),
                    // Home Service bookings are counted alongside clinic appointments here
                    // so the summary totals still add up; the per-row label still says
                    // "Home Service" for those rows.
                    'appointments' => $rows->whereIn('booking_type', ['appointment', 'home_service'])->count(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch service history: ' . $e->getMessage(),
            ], 500);
        }
    }
}
