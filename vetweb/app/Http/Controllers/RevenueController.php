<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\PaymentType;
use App\Models\RevenueHistory;
use App\Models\PetRegistration;
use App\Models\VhcRecord;
use App\Models\AnimalType;
use App\Models\Species;
use App\Models\SpeciesVhcFeeHistory;
use App\Services\RegistrationFeeNotificationService;
use App\Services\VhcFeeService;
use Carbon\Carbon;

class RevenueController extends Controller
{
    /**
     * Get revenue data with monthly breakdown
     */
    // Diri ipakita ang revenue page.
    public function index(Request $request)
    {
        try {
            $year = $request->get('year', date('Y'));
            $paymentTypeId = $request->get('payment_type_id', 1); // Default to pet registration
            
            // Get the payment type
            $paymentType = PaymentType::findOrFail($paymentTypeId);
            
            // Get revenue history for this payment type
            $history = RevenueHistory::where('payment_type_id', $paymentTypeId)
                ->orderBy('effective_date')
                ->orderBy('id')
                ->get();

            // Get current registrations with revenue calculation
            $registrations = PetRegistration::whereYear('created_at', $year)
                ->with(['pet', 'paymentType'])
                ->get();

            $resolveFee = function ($date) use ($history, $paymentType) {
                return $this->resolveFeeFromHistory($history, $paymentType, Carbon::parse($date));
            };

            $feeChangeDates = $history
                ->map(fn ($entry) => Carbon::parse($entry->effective_date)->toDateString())
                ->unique()
                ->flip();

            $regsByDate = $registrations->groupBy(function ($reg) {
                return Carbon::parse($reg->created_at)->toDateString();
            });

            $dailyStats = [];
            $cursor = Carbon::create((int) $year, 1, 1)->startOfDay();
            $yearEnd = Carbon::create((int) $year, 12, 31)->startOfDay();

            while ($cursor->lte($yearEnd)) {
                $dateStr = $cursor->toDateString();
                $dayRegs = $regsByDate->get($dateStr, collect());
                $fee = $resolveFee($cursor);

                $dailyStats[$dateStr] = [
                    'date' => $dateStr,
                    'count' => $dayRegs->count(),
                    'fee' => $fee,
                    'total_revenue' => $dayRegs->sum(fn ($reg) => $resolveFee($reg->created_at)),
                    'fee_changed' => $feeChangeDates->has($dateStr),
                ];

                $cursor->addDay();
            }

            // Calculate monthly revenue
            $monthlyRevenue = [];
            $totalRevenue = 0;

            for ($month = 1; $month <= 12; $month++) {
                $monthStart = Carbon::create($year, $month, 1)->startOfMonth();
                $monthEnd = Carbon::create($year, $month, 1)->endOfMonth();

                $monthDays = collect($dailyStats)->filter(function ($day) use ($monthStart, $monthEnd) {
                    return $day['date'] >= $monthStart->toDateString()
                        && $day['date'] <= $monthEnd->toDateString();
                });

                $count = $monthDays->sum('count');
                $monthRevenue = $monthDays->sum('total_revenue');
                $feesInMonth = $monthDays
                    ->where('count', '>', 0)
                    ->pluck('fee')
                    ->unique()
                    ->values();

                $totalRevenue += $monthRevenue;

                $monthlyRevenue[] = [
                    'month' => $month,
                    'month_name' => $monthStart->format('F'),
                    'count' => $count,
                    'fee_per_registration' => $resolveFee($monthEnd),
                    'fee_varies' => $feesInMonth->count() > 1,
                    'fees_in_month' => $feesInMonth->all(),
                    'total_revenue' => $monthRevenue,
                    'year' => $year,
                ];
            }

            // Get all payment types for dropdown
            $paymentTypes = PaymentType::all();

            return response()->json([
                'success' => true,
                'year' => $year,
                'payment_type' => $paymentType,
                'payment_types' => $paymentTypes,
                'monthly_revenue' => $monthlyRevenue,
                'daily_stats' => $dailyStats,
                'total_revenue' => $totalRevenue,
                'history' => $history,
                'current_fee' => $this->getFeeForDate($paymentTypeId, now()),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch revenue data',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Resolve the fee for a date from already-loaded history rows.
     */
    // Diri pangitaon sa history ang bayad sa maong petsa.
    private function resolveFeeFromHistory($history, PaymentType $paymentType, Carbon $date): float
    {
        $dateStr = $date->toDateString();
        $applicable = null;

        foreach ($history as $entry) {
            $entryDate = Carbon::parse($entry->effective_date)->toDateString();
            if ($entryDate <= $dateStr) {
                $applicable = $entry;
            } else {
                break;
            }
        }

        if ($applicable) {
            return (float) $applicable->new_amount;
        }

        $first = $history->first();
        if ($first) {
            return (float) $first->old_amount;
        }

        return (float) ($paymentType->amount ?? 0);
    }

    /**
     * Get fee amount effective for a specific date
     */
    // Diri kuhaon ang bayad nga epektibo sa petsa.
    private function getFeeForDate($paymentTypeId, $date)
    {
        // Get the most recent fee change before or on this date
        $historyEntry = RevenueHistory::where('payment_type_id', $paymentTypeId)
            ->where('effective_date', '<=', $date)
            ->orderBy('effective_date', 'desc')
            ->orderBy('id', 'desc')
            ->first();
        
        if ($historyEntry) {
            return $historyEntry->new_amount;
        }
        
        // Check if there's any history AFTER this date
        // If so, use the old_amount from the earliest history as the baseline
        $futureHistory = RevenueHistory::where('payment_type_id', $paymentTypeId)
            ->where('effective_date', '>', $date)
            ->orderBy('effective_date', 'asc')
            ->first();
        
        if ($futureHistory) {
            // This date is before any changes, so use the original amount (old_amount of first change)
            return $futureHistory->old_amount;
        }
        
        // If no history at all, return current amount from payment type
        $paymentType = PaymentType::find($paymentTypeId);
        return $paymentType ? $paymentType->amount : 0;
    }

    /**
     * Update registration fee with history tracking
     */
    // Diri usbon ang bayad sa payment type.
    public function updateFee(Request $request)
    {
        try {
            $validated = $request->validate([
                'payment_type_id' => 'required|exists:payment_types,id',
                'new_amount' => 'required|numeric|min:0',
                'effective_date' => 'required|date',
                'reason' => 'nullable|string|max:500'
            ]);

            $paymentType = PaymentType::findOrFail($validated['payment_type_id']);
            $effectiveDate = Carbon::parse($validated['effective_date'])->startOfDay();
            $newAmount = (float) $validated['new_amount'];
            $oldAmount = $this->getFeeForDate($paymentType->id, $effectiveDate->copy()->subDay());

            $clientsNotified = 0;
            $existing = RevenueHistory::where('payment_type_id', $paymentType->id)
                ->whereDate('effective_date', $effectiveDate->toDateString())
                ->orderByDesc('id')
                ->first();

            $currentAmountOnDate = $existing
                ? (float) $existing->new_amount
                : $this->getFeeForDate($paymentType->id, $effectiveDate);

            if ($currentAmountOnDate != $newAmount) {
                if ($existing) {
                    $existing->update([
                        'old_amount' => $oldAmount,
                        'new_amount' => $newAmount,
                        'reason' => $validated['reason'] ?? 'Fee adjustment',
                        'changed_by' => auth()->id(),
                    ]);
                } else {
                    RevenueHistory::create([
                        'payment_type_id' => $paymentType->id,
                        'old_amount' => $oldAmount,
                        'new_amount' => $newAmount,
                        'effective_date' => $effectiveDate->toDateString(),
                        'reason' => $validated['reason'] ?? 'Fee adjustment',
                        'changed_by' => auth()->id(),
                    ]);
                }

                $paymentType->update([
                    'amount' => $this->getFeeForDate($paymentType->id, now()),
                ]);

                if ($paymentType->payment_type === 'pet_registration') {
                    $clientsNotified = RegistrationFeeNotificationService::notifyClients(
                        $oldAmount,
                        $newAmount,
                        $effectiveDate,
                        $validated['reason'] ?? null
                    );
                }
            }

            return response()->json([
                'success' => true,
                'message' => $clientsNotified > 0
                    ? "Registration fee updated successfully. {$clientsNotified} client(s) notified."
                    : 'Registration fee updated successfully',
                'old_amount' => $oldAmount,
                'new_amount' => $newAmount,
                'clients_notified' => $clientsNotified,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update registration fee',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get VHC revenue data with monthly breakdown and editable fee types.
     */
    // Diri ipakita ang kita gikan sa VHC.
    public function vhcRevenue(Request $request, VhcFeeService $vhcFeeService)
    {
        try {
            $year = (int) $request->get('year', date('Y'));

            $feeTypes = PaymentType::where('payment_type', 'vhc_certificate')->get();

            $feeHistory = RevenueHistory::whereIn('payment_type_id', $feeTypes->pluck('id'))
                ->with('paymentType')
                ->orderBy('effective_date', 'desc')
                ->orderBy('id', 'desc')
                ->get()
                ->groupBy('payment_type_id');

            $speciesGrouped = $vhcFeeService->getVhcSpeciesGrouped();
            $speciesFeeHistory = SpeciesVhcFeeHistory::with(['species.animalType'])
                ->orderBy('effective_date', 'desc')
                ->orderBy('id', 'desc')
                ->limit(100)
                ->get();

            $livestockTypeId = AnimalType::where('type_name', 'Livestock')->value('id');
            $poultryTypeId = AnimalType::where('type_name', 'Poultry')->value('id');

            $records = VhcRecord::whereYear('created_at', $year)
                ->with(['livestock.species.animalType'])
                ->get();

            $certificateType = $feeTypes->first();
            $certHistory = $certificateType
                ? RevenueHistory::where('payment_type_id', $certificateType->id)
                    ->orderBy('effective_date')
                    ->orderBy('id')
                    ->get()
                : collect();

            $feeChangeDates = $certHistory
                ->map(fn ($entry) => Carbon::parse($entry->effective_date)->toDateString())
                ->unique()
                ->flip();

            $recordsByDate = $records->groupBy(function ($record) {
                return Carbon::parse($record->created_at)->toDateString();
            });

            $dailyStats = [];
            $cursor = Carbon::create($year, 1, 1)->startOfDay();
            $yearEnd = Carbon::create($year, 12, 31)->startOfDay();

            while ($cursor->lte($yearEnd)) {
                $dateStr = $cursor->toDateString();
                $dayRecords = $recordsByDate->get($dateStr, collect());
                $livestockHeads = 0;
                $poultryHeads = 0;

                foreach ($dayRecords as $record) {
                    foreach ($record->livestock as $entry) {
                        $headCount = (int) ($entry->male_count ?? 0) + (int) ($entry->female_count ?? 0);
                        $typeId = $entry->species?->type_id;

                        if ($typeId === $livestockTypeId) {
                            $livestockHeads += $headCount;
                        } elseif ($typeId === $poultryTypeId) {
                            $poultryHeads += $headCount;
                        }
                    }
                }

                $dailyStats[$dateStr] = [
                    'date' => $dateStr,
                    'count' => $dayRecords->count(),
                    'livestock_heads' => $livestockHeads,
                    'poultry_heads' => $poultryHeads,
                    'total_revenue' => $dayRecords->sum(fn ($record) => (float) ($record->amount_paid ?? 0)),
                    'certificate_fee' => $certificateType
                        ? $this->resolveFeeFromHistory($certHistory, $certificateType, $cursor)
                        : 0,
                    'fee_changed' => $feeChangeDates->has($dateStr),
                ];

                $cursor->addDay();
            }

            $monthlyRevenue = [];
            $totalRevenue = 0;
            $totalCertificates = 0;
            $totalLivestockHeads = 0;
            $totalPoultryHeads = 0;

            for ($month = 1; $month <= 12; $month++) {
                $monthStart = Carbon::create($year, $month, 1)->startOfMonth();
                $monthEnd = Carbon::create($year, $month, 1)->endOfMonth();

                $monthDays = collect($dailyStats)->filter(function ($day) use ($monthStart, $monthEnd) {
                    return $day['date'] >= $monthStart->toDateString()
                        && $day['date'] <= $monthEnd->toDateString();
                });

                $count = $monthDays->sum('count');
                $monthRevenue = $monthDays->sum('total_revenue');
                $livestockHeads = $monthDays->sum('livestock_heads');
                $poultryHeads = $monthDays->sum('poultry_heads');

                $totalRevenue += $monthRevenue;
                $totalCertificates += $count;
                $totalLivestockHeads += $livestockHeads;
                $totalPoultryHeads += $poultryHeads;

                $monthlyRevenue[] = [
                    'month' => $month,
                    'month_name' => $monthStart->format('F'),
                    'count' => $count,
                    'livestock_heads' => $livestockHeads,
                    'poultry_heads' => $poultryHeads,
                    'total_revenue' => $monthRevenue,
                    'fees' => $vhcFeeService->getFees($monthEnd),
                    'year' => $year,
                ];
            }

            $currentFees = $vhcFeeService->getFees();

            return response()->json([
                'success' => true,
                'year' => $year,
                'monthly_revenue' => $monthlyRevenue,
                'daily_stats' => $dailyStats,
                'total_revenue' => $totalRevenue,
                'total_certificates' => $totalCertificates,
                'total_livestock_heads' => $totalLivestockHeads,
                'total_poultry_heads' => $totalPoultryHeads,
                'fee_types' => $feeTypes,
                'current_fees' => $currentFees,
                'fee_history' => $feeHistory,
                'species_fees' => $speciesGrouped,
                'species_fee_history' => $speciesFeeHistory,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch VHC revenue data',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update per-species VHC fee with history tracking.
     */
    // Diri usbon ang VHC nga bayad sa species.
    public function updateSpeciesFee(Request $request, VhcFeeService $vhcFeeService)
    {
        try {
            $validated = $request->validate([
                'species_id' => 'required|exists:species,id',
                'new_amount' => 'required|numeric|min:0',
                'effective_date' => 'nullable|date',
                'reason' => 'nullable|string|max:500',
            ]);

            $species = Species::with('animalType')->findOrFail($validated['species_id']);
            $effectiveDate = Carbon::parse($validated['effective_date'] ?? now())->startOfDay();
            $newAmount = (float) $validated['new_amount'];
            $oldAmount = $vhcFeeService->getSpeciesFee($species, null, $effectiveDate->copy()->subDay());

            $existing = SpeciesVhcFeeHistory::where('species_id', $species->id)
                ->whereDate('effective_date', $effectiveDate->toDateString())
                ->orderByDesc('id')
                ->first();

            $currentAmountOnDate = $existing
                ? (float) $existing->new_amount
                : $vhcFeeService->getSpeciesFee($species, null, $effectiveDate);

            if ($currentAmountOnDate != $newAmount) {
                if ($existing) {
                    $existing->update([
                        'old_amount' => $oldAmount,
                        'new_amount' => $newAmount,
                        'reason' => $validated['reason'] ?? 'Species fee adjustment',
                        'changed_by' => auth()->id(),
                    ]);
                } else {
                    SpeciesVhcFeeHistory::create([
                        'species_id' => $species->id,
                        'old_amount' => $oldAmount,
                        'new_amount' => $newAmount,
                        'effective_date' => $effectiveDate->toDateString(),
                        'reason' => $validated['reason'] ?? 'Species fee adjustment',
                        'changed_by' => auth()->id(),
                    ]);
                }

                $species->update([
                    'vhc_fee' => $vhcFeeService->getSpeciesFee($species->fresh('animalType'), null, now()),
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Species fee updated successfully',
                'species' => $species->fresh(['animalType']),
                'old_amount' => $oldAmount,
                'new_amount' => $newAmount,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update species fee',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get fee history for a payment type
     */
    // Diri kuhaon ang history sa bayad sa payment type.
    public function getHistory($paymentTypeId)
    {
        try {
            $history = RevenueHistory::where('payment_type_id', $paymentTypeId)
                ->with(['changedBy', 'paymentType'])
                ->orderBy('effective_date', 'desc')
                ->get();

            return response()->json([
                'success' => true,
                'history' => $history
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch fee history',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
