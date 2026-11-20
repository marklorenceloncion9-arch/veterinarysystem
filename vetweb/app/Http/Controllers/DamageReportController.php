<?php

namespace App\Http\Controllers;

use App\Models\DamageReport;
use App\Models\Inventory;
use App\Models\InventoryLog;
use App\Models\Medicine;
use App\Services\InventoryDeductionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DamageReportController extends Controller
{
    // Diri i-format ang user sa damage report.
    private function formatUser(?\App\Models\User $user): ?array
    {
        if (!$user) {
            return null;
        }

        $name = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));

        return [
            'id' => $user->id,
            'name' => $name !== '' ? $name : ($user->email ?? 'Unknown user'),
            'role' => $user->role,
        ];
    }

    // Diri i-format ang numero nga walay sobra nga decimal.
    private function formatNumber($value): int|float|null
    {
        if ($value === null || $value === '') {
            return null;
        }

        $num = (float) $value;

        return fmod($num, 1.0) === 0.0 ? (int) round($num) : round($num, 3);
    }

    // Diri ipakita ang stock isip buo nga numero.
    private function displayWholeUnits($value): int
    {
        $num = (float) $value;
        if ($num <= 0) {
            return 0;
        }

        return (int) ceil($num - 0.0000001);
    }

    // Diri kuhaon ang mga URL sa ebidensya sa report.
    private function evidenceUrlsFor(DamageReport $report): array
    {
        $urls = [];
        $stored = $report->evidence_image_urls;
        if (is_array($stored)) {
            $urls = $stored;
        }

        $clean = [];
        foreach ($urls as $url) {
            $url = trim((string) $url);
            if ($url !== '' && !in_array($url, $clean, true)) {
                $clean[] = $url;
            }
        }

        return array_values(array_slice($clean, 0, 3));
    }

    // Diri kuhaon ang ebidensya nga gi-upload sa request.
    private function incomingEvidenceUrls(Request $request): array
    {
        $urls = $request->input('evidence_image_urls', []);
        if (!is_array($urls)) {
            $urls = [];
        }

        $single = $request->input('evidence_image_url');
        if (is_string($single) && trim($single) !== '') {
            array_unshift($urls, trim($single));
        }

        $clean = [];
        foreach ($urls as $url) {
            $url = trim((string) $url);
            if ($url !== '' && !in_array($url, $clean, true)) {
                $clean[] = $url;
            }
        }

        return array_values(array_slice($clean, 0, 3));
    }

    // Diri kuhaon ang mga batch sa tambal nga naay stock.
    private function medicineStockBatches(int $medicineId, bool $lock = false)
    {
        $query = Inventory::with('unit')
            ->availableForUse()
            ->where('medicine_id', $medicineId)
            ->orderBy('created_at', 'asc');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get();
    }

    // Diri i-format ang usa ka damage report.
    private function mapReport(DamageReport $report): array
    {
        $inventory = $report->inventory;
        $stockedBatches = Inventory::with('unit')
            ->availableForUse()
            ->where('medicine_id', $report->medicine_id)
            ->orderBy('created_at', 'asc')
            ->get();

        if (!$inventory) {
            $inventory = $stockedBatches->first()
                ?? Inventory::with('unit')->where('medicine_id', $report->medicine_id)->orderByDesc('id')->first();
        }

        $isVial = $inventory?->isVial() ?? false;
        $unit = $isVial ? 'vials' : ($inventory?->unit?->name ?? 'unit');
        $qty = $this->formatNumber($report->quantity);
        $evidenceUrls = $this->evidenceUrlsFor($report);
        $available = $stockedBatches->sum(fn (Inventory $batch) => (float) $batch->quantity);

        return [
            'id' => $report->id,
            'medicine_id' => $report->medicine_id,
            'medicine_name' => $report->medicine?->name ?? 'Unknown medicine',
            'category' => $report->medicine?->category?->name ?? 'Uncategorized',
            'inventory_id' => $report->inventory_id,
            'batch_number' => $report->inventory?->batch_number,
            'quantity' => $qty,
            'quantity_display' => $isVial
                ? $qty . ' ' . ((float) $report->quantity === 1.0 ? 'vial' : 'vials')
                : $qty . ' ' . $unit,
            'unit' => $unit,
            'is_vial' => $isVial,
            'reason' => $report->reason,
            'evidence_image_url' => $evidenceUrls[0] ?? null,
            'evidence_image_urls' => $evidenceUrls,
            'status' => $report->status === DamageReport::STATUS_DEDUCTED
                ? DamageReport::STATUS_APPROVED
                : $report->status,
            'review_notes' => $report->review_notes,
            'reported_by' => $this->formatUser($report->reporter),
            'reviewed_by' => $this->formatUser($report->reviewer),
            'reviewed_at' => optional($report->reviewed_at)->toDateTimeString(),
            'deducted_by' => $this->formatUser($report->deductedByUser),
            'deducted_at' => optional($report->deducted_at)->toDateTimeString(),
            'inventory_log_id' => $report->inventory_log_id,
            'available_quantity' => $this->formatNumber($available),
            'created_at' => optional($report->created_at)->toDateTimeString(),
            'updated_at' => optional($report->updated_at)->toDateTimeString(),
            'status_history' => $report->statusHistories->map(function ($row) {
                return [
                    'id' => $row->id,
                    'from_status' => $row->from_status,
                    'to_status' => $row->to_status,
                    'note' => $row->note,
                    'changed_by' => $this->formatUser($row->changedByUser),
                    'created_at' => optional($row->created_at)->toDateTimeString(),
                ];
            })->values(),
        ];
    }

    // Diri ang mga relasyon nga i-load sa damage report.
    private function loadRelations()
    {
        return [
            'medicine.category',
            'inventory.unit',
            'reporter',
            'reviewer',
            'deductedByUser',
            'statusHistories.changedByUser',
        ];
    }

    // Diri ihapon ang wala pa nabasa nga damage report.
    public function unreadCount()
    {
        try {
            $count = DamageReport::where('status', DamageReport::STATUS_UNDER_REVIEW)->count();

            return response()->json([
                'success' => true,
                'unread_count' => $count,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch unread damage reports',
            ], 500);
        }
    }

    // Diri ilista ang mga damage report.
    public function index(Request $request)
    {
        try {
            $status = $request->query('status');
            $reportedBy = $request->input('reported_by') ?? $request->query('reported_by');

            $query = DamageReport::with($this->loadRelations())
                ->orderByDesc('created_at');

            if ($reportedBy) {
                $query->where('reported_by', (int) $reportedBy);
            }

            if ($status && $status !== 'all') {
                if ($status === DamageReport::STATUS_APPROVED) {
                    $query->whereIn('status', [
                        DamageReport::STATUS_APPROVED,
                        DamageReport::STATUS_DEDUCTED,
                    ]);
                } else {
                    $query->where('status', $status);
                }
            }

            $reports = $query->get()->map(fn (DamageReport $report) => $this->mapReport($report));

            return response()->json([
                'success' => true,
                'reports' => $reports,
                'unread_count' => DamageReport::where('status', DamageReport::STATUS_UNDER_REVIEW)->count(),
                'summary' => [
                    'under_review' => DamageReport::where('status', DamageReport::STATUS_UNDER_REVIEW)->count(),
                    'approved' => DamageReport::whereIn('status', [
                        DamageReport::STATUS_APPROVED,
                        DamageReport::STATUS_DEDUCTED,
                    ])->count(),
                    'rejected' => DamageReport::where('status', DamageReport::STATUS_REJECTED)->count(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch damage reports: ' . $e->getMessage(),
            ], 500);
        }
    }

    // Diri ipakita ang detalye sa damage report.
    public function show($id)
    {
        try {
            $report = DamageReport::with($this->loadRelations())->find($id);

            if (!$report) {
                return response()->json([
                    'success' => false,
                    'message' => 'Damage report not found',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'report' => $this->mapReport($report),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch damage report: ' . $e->getMessage(),
            ], 500);
        }
    }

    // Diri i-save ang bag-ong damage report.
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'medicine_id' => 'required|exists:medicines,id',
                'inventory_id' => 'nullable|exists:inventory,id',
                'quantity' => 'required|numeric|min:0.001',
                'reason' => 'required|string|min:3|max:2000',
                'evidence_image_url' => 'nullable|url|max:1000',
                'evidence_image_urls' => 'nullable|array|max:3',
                'evidence_image_urls.*' => 'nullable|url|max:1000',
            ]);

            $medicine = Medicine::findOrFail($validated['medicine_id']);
            $evidenceUrls = $this->incomingEvidenceUrls($request);
            $inventory = null;

            if (!empty($validated['inventory_id'])) {
                $inventory = Inventory::with('unit')->findOrFail($validated['inventory_id']);

                if ((int) $inventory->medicine_id !== (int) $medicine->id) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Selected batch does not belong to the selected medicine.',
                    ], 422);
                }
            }

            $qty = (float) $validated['quantity'];
            $stockBatches = $this->medicineStockBatches($medicine->id);
            $available = $stockBatches->sum(fn (Inventory $batch) => (float) $batch->quantity);
            $sample = $inventory ?: $stockBatches->first();
            $unitLabel = $sample?->isVial() ? 'vials' : ($sample?->unit?->name ?? 'units');

            // Soft availability check for UX; stock is NOT deducted on submit.
            if ($qty > $available) {
                return response()->json([
                    'success' => false,
                    'message' => 'Damaged quantity cannot exceed current stock (' .
                        $this->formatNumber($available) . ' ' . $unitLabel .
                        '). Inventory is not deducted until approval.',
                    'code' => 'insufficient_stock',
                ], 422);
            }

            $userId = optional($request->user())->id;

            $report = DB::transaction(function () use ($validated, $medicine, $inventory, $qty, $userId, $evidenceUrls) {
                $report = DamageReport::create([
                    'medicine_id' => $medicine->id,
                    'inventory_id' => $inventory?->id,
                    'reported_by' => $userId,
                    'quantity' => $qty,
                    'reason' => $validated['reason'],
                    'evidence_image_urls' => $evidenceUrls ?: null,
                    'status' => DamageReport::STATUS_UNDER_REVIEW,
                ]);

                $report->recordStatusChange(
                    null,
                    DamageReport::STATUS_UNDER_REVIEW,
                    $userId,
                    'Damage report submitted'
                );

                return $report->fresh($this->loadRelations());
            });

            return response()->json([
                'success' => true,
                'message' => 'Damage report submitted for review. Inventory was not deducted.',
                'report' => $this->mapReport($report),
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to submit damage report: ' . $e->getMessage(),
            ], 500);
        }
    }

    // Diri i-approve ang damage report.
    public function approve(Request $request, $id)
    {
        try {
            $validated = $request->validate([
                'review_notes' => 'nullable|string|max:2000',
            ]);

            $user = $request->user();
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized',
                ], 401);
            }

            $result = DB::transaction(function () use ($id, $validated, $user) {
                $report = DamageReport::with($this->loadRelations())->lockForUpdate()->find($id);

                if (!$report) {
                    return ['error' => 'not_found', 'message' => 'Damage report not found'];
                }

                if (!$report->isUnderReview()) {
                    return [
                        'error' => 'invalid_status',
                        'message' => 'Only reports under review can be approved.',
                        'report' => $report,
                    ];
                }

                if ($report->inventory_log_id) {
                    return [
                        'error' => 'already_deducted',
                        'message' => 'This damage report has already been deducted from inventory.',
                        'report' => $report,
                    ];
                }

                $qty = (float) $report->quantity;
                $stockBatches = $this->medicineStockBatches((int) $report->medicine_id, true);
                $available = $stockBatches->sum(fn (Inventory $batch) => (float) $batch->quantity);
                $sample = $stockBatches->first();
                $unitLabel = $sample?->isVial() ? 'vials' : ($sample?->unit?->name ?? 'units');

                if ($available <= 0 || $qty > $available) {
                    return [
                        'error' => 'insufficient_stock',
                        'message' => 'Insufficient stock to deduct the reported damaged quantity. Available: ' .
                            $this->formatNumber($available) . ' ' . $unitLabel .
                            '. Reported damaged quantity: ' . $this->formatNumber($qty) . ' ' . $unitLabel . '.',
                        'report' => $report->fresh($this->loadRelations()),
                        'available' => $this->formatNumber($available),
                        'requested' => $this->formatNumber($qty),
                    ];
                }

                $deduction = InventoryDeductionService::deductQuantityFifo(
                    (int) $report->medicine_id,
                    $qty,
                    InventoryLog::REASON_DAMAGED
                );

                $firstInventory = $deduction['primary_inventory'];
                $firstLog = $deduction['log'];

                $from = $report->status;
                $report->status = DamageReport::STATUS_APPROVED;
                $report->inventory_id = $firstInventory->id;
                $report->reviewed_by = $user->id;
                $report->reviewed_at = now();
                $report->review_notes = $validated['review_notes'] ?? null;
                $report->deducted_by = $user->id;
                $report->deducted_at = now();
                $report->inventory_log_id = $firstLog->id;
                $report->save();

                $report->recordStatusChange(
                    $from,
                    DamageReport::STATUS_APPROVED,
                    $user->id,
                    $validated['review_notes'] ?? 'Approved and deducted from the oldest batch first'
                );

                return [
                    'report' => $report->fresh($this->loadRelations()),
                    'log_id' => $firstLog->id,
                ];
            });

            if (($result['error'] ?? null) === 'not_found') {
                return response()->json([
                    'success' => false,
                    'message' => $result['message'],
                ], 404);
            }

            if (($result['error'] ?? null) === 'insufficient_stock') {
                return response()->json([
                    'success' => false,
                    'code' => 'insufficient_stock',
                    'message' => $result['message'],
                    'available' => $result['available'] ?? null,
                    'requested' => $result['requested'] ?? null,
                    'report' => isset($result['report']) ? $this->mapReport($result['report']) : null,
                ], 422);
            }

            if (isset($result['error'])) {
                return response()->json([
                    'success' => false,
                    'code' => $result['error'],
                    'message' => $result['message'],
                    'report' => isset($result['report']) ? $this->mapReport($result['report']) : null,
                ], 422);
            }

            return response()->json([
                'success' => true,
                'message' => 'Damage report approved and deducted from inventory.',
                'report' => $this->mapReport($result['report']),
                'inventory_log_id' => $result['log_id'],
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to approve damage report: ' . $e->getMessage(),
            ], 500);
        }
    }

    // Diri i-reject ang damage report.
    public function reject(Request $request, $id)
    {
        return $this->review($request, $id, DamageReport::STATUS_REJECTED);
    }

    // Diri usbon ang status sa report human sa review.
    private function review(Request $request, $id, string $nextStatus)
    {
        try {
            $validated = $request->validate([
                'review_notes' => 'nullable|string|max:2000',
            ]);

            $user = $request->user();
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized',
                ], 401);
            }

            // Approve now handles deduction itself.
            if ($nextStatus === DamageReport::STATUS_APPROVED) {
                return $this->approve($request, $id);
            }

            $report = DB::transaction(function () use ($id, $nextStatus, $validated, $user) {
                $report = DamageReport::with($this->loadRelations())->lockForUpdate()->find($id);

                if (!$report) {
                    return null;
                }

                if (!$report->isUnderReview()) {
                    return ['error' => 'Only reports under review can be approved or rejected.', 'report' => $report];
                }

                $from = $report->status;
                $report->status = $nextStatus;
                $report->reviewed_by = $user->id;
                $report->reviewed_at = now();
                $report->review_notes = $validated['review_notes'] ?? null;
                $report->save();

                $report->recordStatusChange(
                    $from,
                    $nextStatus,
                    $user->id,
                    $validated['review_notes'] ?? 'Report rejected'
                );

                return ['report' => $report->fresh($this->loadRelations())];
            });

            if ($report === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Damage report not found',
                ], 404);
            }

            if (isset($report['error'])) {
                return response()->json([
                    'success' => false,
                    'message' => $report['error'],
                    'report' => $this->mapReport($report['report']),
                ], 422);
            }

            return response()->json([
                'success' => true,
                'message' => 'Damage report rejected successfully.',
                'report' => $this->mapReport($report['report']),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to review damage report: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Kept for compatibility; approval now deducts automatically.
     */
    // Diri ibawas sa stock ang na-damage nga tambal.
    public function deduct(Request $request, $id)
    {
        return response()->json([
            'success' => false,
            'message' => 'Inventory is deducted automatically when a damage report is approved.',
        ], 422);
    }

    /**
     * Batches for a medicine that still have stock (for the report form).
     */
    // Diri kuhaon ang mga batch sa tambal para sa report.
    public function batches($medicineId)
    {
        try {
            $batches = Inventory::with('unit')
                ->where('medicine_id', $medicineId)
                ->where('quantity', '>', 0)
                ->orderBy('expiration_date')
                ->orderBy('created_at')
                ->get()
                ->map(function (Inventory $batch) {
                    $isVial = $batch->isVial();
                    $qty = $this->formatNumber($batch->quantity);
                    $vialDisplay = $isVial ? $this->displayWholeUnits($batch->quantity) : null;

                    return [
                        'id' => $batch->id,
                        'batch_number' => $batch->batch_number,
                        'quantity' => $qty,
                        'quantity_display' => $vialDisplay,
                        'unit' => $isVial ? 'vials' : ($batch->unit?->name ?? 'unit'),
                        'is_vial' => $isVial,
                        'expiration_date' => optional($batch->expiration_date)->format('Y-m-d'),
                        'is_expired' => $batch->isExpired(),
                    ];
                });

            return response()->json([
                'success' => true,
                'batches' => $batches,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch batches',
            ], 500);
        }
    }
}
