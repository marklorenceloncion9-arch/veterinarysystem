<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Barangay;
use App\Models\PetRegistration;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardActivityController extends Controller
{
    private const BOOKING_TYPES = ['appointment', 'home_service', 'walk_in'];

    /**
     * Numbers for the dashboard activity panel, for a From/Till range: a total,
     * a breakdown (for the donut) and the top 5 animals for registered animals
     * and each kind of service. Bookings count only when completed. A blank
     * From or Till leaves that side of the range open.
     */
    // Diri kuhaon ang total, breakdown ug top 5 sa gipili nga petsa.
    public function show(Request $request)
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'till' => ['nullable', 'date_format:Y-m-d'],
            'service_id' => ['nullable', 'integer', 'exists:services,id'],
            'barangay_id' => ['nullable', 'integer', 'exists:barangays,id'],
        ]);

        $fromInput = $validated['from'] ?? null;
        $tillInput = $validated['till'] ?? null;

        if ($fromInput && $tillInput && $fromInput > $tillInput) {
            [$fromInput, $tillInput] = [$tillInput, $fromInput];
        }

        $start = $fromInput ? Carbon::createFromFormat('Y-m-d', $fromInput)->startOfDay() : null;
        $end = $tillInput ? Carbon::createFromFormat('Y-m-d', $tillInput)->endOfDay() : null;
        $serviceId = isset($validated['service_id']) ? (int) $validated['service_id'] : null;
        $barangayId = isset($validated['barangay_id']) ? (int) $validated['barangay_id'] : null;

        $bookingTotals = $this->bookingTotals($start, $end, $serviceId, $barangayId);

        $types = [
            'registered' => [
                'total' => $this->registeredTotal($start, $end, $barangayId),
                'breakdown' => $this->registeredBreakdown($start, $end, $barangayId),
                'top' => $this->topRegisteredAnimals($start, $end, $barangayId),
            ],
        ];

        foreach (self::BOOKING_TYPES as $type) {
            $types[$type] = [
                'total' => (int) ($bookingTotals[$type] ?? 0),
                'breakdown' => $this->bookingBreakdown($type, $start, $end, $serviceId, $barangayId),
                'top' => $this->topAnimals($type, $start, $end, $serviceId, $barangayId),
            ];
        }

        return response()->json([
            'success' => true,
            'from' => $start?->toDateString(),
            'till' => $end?->toDateString(),
            'types' => $types,
            'services' => Service::query()
                ->orderBy('type_name')
                ->get(['id', 'type_name'])
                ->map(fn ($service) => ['id' => $service->id, 'name' => $service->type_name])
                ->values(),
            'barangays' => Barangay::query()
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn ($barangay) => ['id' => $barangay->id, 'name' => $barangay->name])
                ->values(),
        ]);
    }

    // Diri i-filter ang column. Kung walay From o Till, abli ang maong kilid.
    private function constrainDate($query, string $column, ?string $from, ?string $to)
    {
        if ($from !== null && $to !== null) {
            $query->whereBetween($column, [$from, $to]);
        } elseif ($from !== null) {
            $query->where($column, '>=', $from);
        } elseif ($to !== null) {
            $query->where($column, '<=', $to);
        }

        return $query;
    }

    // Diri ihapon ang completed nga booking matag klase.
    private function bookingTotals(?Carbon $start, ?Carbon $end, ?int $serviceId, ?int $barangayId): array
    {
        $query = Appointment::query()
            ->whereIn('booking_type', self::BOOKING_TYPES);

        $this->constrainDate($query, 'booking_date', $start?->toDateString(), $end?->toDateString());

        return $query
            ->where('status', 'completed')
            ->when($serviceId, fn ($query) => $query->whereExists(function ($exists) use ($serviceId) {
                $exists->select(DB::raw(1))
                    ->from('booking_services')
                    ->whereColumn('booking_services.booking_id', 'bookings.id')
                    ->where('booking_services.service_type_id', $serviceId);
            }))
            ->when($barangayId, fn ($query) => $query->whereHas('user', fn ($user) => $user->where('barangay_id', $barangayId)))
            ->select('booking_type', DB::raw('COUNT(*) as total'))
            ->groupBy('booking_type')
            ->pluck('total', 'booking_type')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    /**
     * Animals that count as registered in the range: a paid registration in
     * that range, or an exempt animal (livestock / poultry) added in that range.
     */
    // Diri ang basehan sa mga hayop nga giisip nga registered sa gipili nga petsa.
    private function registeredBase(?Carbon $start, ?Carbon $end)
    {
        $from = $start?->toDateTimeString();
        $to = $end?->toDateTimeString();

        return DB::table('animals')
            ->whereNull('animals.archived_at')
            ->where(function ($query) use ($from, $to) {
                $query->whereExists(function ($exists) use ($from, $to) {
                    $exists->select(DB::raw(1))
                        ->from('pet_registrations')
                        ->whereColumn('pet_registrations.animal_id', 'animals.id')
                        ->where('pet_registrations.status', 'paid');
                    $this->constrainDate($exists, 'pet_registrations.paid_at', $from, $to);
                })->orWhere(function ($exempt) use ($from, $to) {
                    $this->constrainDate($exempt, 'animals.created_at', $from, $to)
                        ->whereIn('animals.species_id', function ($species) {
                            $species->select('species.id')
                                ->from('species')
                                ->join('animal_types', 'animal_types.id', '=', 'species.type_id')
                                ->whereIn('animal_types.type_name', ['Livestock', 'Poultry']);
                        });
                });
            });
    }

    // Diri ihapon ang mga hayop nga na-register sa gipili nga petsa (naay bayad o exempt).
    private function registeredTotal(?Carbon $start, ?Carbon $end, ?int $barangayId): int
    {
        return $this->registeredBase($start, $end)
            ->when($barangayId, fn ($query) => $query->join('users as owners', 'owners.id', '=', 'animals.user_id')
                ->where('owners.barangay_id', $barangayId))
            ->count();
    }

    // Diri ihapon ang booking matag serbisyo para sa donut.
    private function bookingBreakdown(string $type, ?Carbon $start, ?Carbon $end, ?int $serviceId, ?int $barangayId): array
    {
        $query = DB::table('booking_services')
            ->join('bookings', 'bookings.id', '=', 'booking_services.booking_id')
            ->join('services', 'services.id', '=', 'booking_services.service_type_id')
            ->when($barangayId, fn ($query) => $query->join('users as owners', 'owners.id', '=', 'bookings.user_id')
                ->where('owners.barangay_id', $barangayId))
            ->where('bookings.booking_type', $type)
            ->where('bookings.status', 'completed');

        $this->constrainDate($query, 'bookings.booking_date', $start?->toDateString(), $end?->toDateString());

        return $query
            ->when($serviceId, fn ($query) => $query->where('booking_services.service_type_id', $serviceId))
            ->select('services.type_name as name', DB::raw('COUNT(DISTINCT bookings.id) as count'))
            ->groupBy('services.id', 'services.type_name')
            ->orderByDesc('count')
            ->orderBy('services.type_name')
            ->limit(8)
            ->get()
            ->map(fn ($row) => ['name' => (string) $row->name, 'count' => (int) $row->count])
            ->all();
    }

    // Diri ihapon ang bag-ong registration matag species para sa donut.
    private function registeredBreakdown(?Carbon $start, ?Carbon $end, ?int $barangayId): array
    {
        return $this->registeredBase($start, $end)
            ->leftJoin('species', 'species.id', '=', 'animals.species_id')
            ->when($barangayId, fn ($query) => $query->join('users as owners', 'owners.id', '=', 'animals.user_id')
                ->where('owners.barangay_id', $barangayId))
            ->select(DB::raw("COALESCE(species.species_name, 'Unknown') as name"), DB::raw('COUNT(*) as count'))
            ->groupBy('species.id', 'species.species_name')
            ->orderByDesc('count')
            ->orderBy('name')
            ->limit(8)
            ->get()
            ->map(fn ($row) => ['name' => (string) $row->name, 'count' => (int) $row->count])
            ->all();
    }

    // Diri kuhaon ang top 5 nga hayop nga pinakadaghan og booking sa usa ka klase.
    private function topAnimals(string $type, ?Carbon $start, ?Carbon $end, ?int $serviceId, ?int $barangayId): array
    {
        $query = DB::table('booking_services')
            ->join('bookings', 'bookings.id', '=', 'booking_services.booking_id')
            ->join('animals', 'animals.id', '=', 'booking_services.animal_id')
            ->where('bookings.booking_type', $type)
            ->where('bookings.status', 'completed');

        $this->constrainDate($query, 'bookings.booking_date', $start?->toDateString(), $end?->toDateString());

        return $this->animalRows(
            $query
                ->when($serviceId, fn ($query) => $query->where('booking_services.service_type_id', $serviceId))
                ->selectRaw('COUNT(DISTINCT bookings.id) as visits')
                ->orderByDesc('visits'),
            $barangayId
        );
    }

    // Diri kuhaon ang 5 ka hayop nga bag-ong na-register sa gipili nga petsa.
    private function topRegisteredAnimals(?Carbon $start, ?Carbon $end, ?int $barangayId): array
    {
        $from = $start?->toDateTimeString();
        $to = $end?->toDateTimeString();
        $window = '1 = 1';
        $bindings = [];

        if ($from && $to) {
            $window = 'pet_registrations.paid_at BETWEEN ? AND ?';
            $bindings = [$from, $to];
        } elseif ($from) {
            $window = 'pet_registrations.paid_at >= ?';
            $bindings = [$from];
        } elseif ($to) {
            $window = 'pet_registrations.paid_at <= ?';
            $bindings = [$to];
        }

        return $this->animalRows(
            $this->registeredBase($start, $end)
                ->selectRaw('1 as visits')
                ->orderByRaw(
                    "COALESCE((
                        SELECT MAX(pet_registrations.paid_at)
                        FROM pet_registrations
                        WHERE pet_registrations.animal_id = animals.id
                            AND pet_registrations.status = 'paid'
                            AND {$window}
                    ), animals.created_at) DESC",
                    $bindings
                ),
            $barangayId
        );
    }

    // Diri idugang ang species ug tag-iya sa hayop, i-filter sa barangay, unya kuhaon ang 5.
    private function animalRows($query, ?int $barangayId): array
    {
        return $query
            ->leftJoin('species', 'species.id', '=', 'animals.species_id')
            ->leftJoin('users', 'users.id', '=', 'animals.user_id')
            ->when($barangayId, fn ($builder) => $builder->where('users.barangay_id', $barangayId))
            ->addSelect([
                'animals.id',
                'animals.pet_name',
                'species.species_name',
                'users.firstname',
                'users.lastname',
                'users.name as user_name',
            ])
            ->groupBy('animals.id', 'animals.pet_name', 'species.species_name', 'users.firstname', 'users.lastname', 'users.name')
            ->orderBy('animals.pet_name')
            ->limit(5)
            ->get()
            ->map(function ($row) {
                $last = trim((string) $row->lastname);
                $first = trim((string) $row->firstname);
                $owner = $last && $first ? "{$last}, {$first}" : ($last ?: $first ?: ($row->user_name ?: 'Unknown owner'));

                return [
                    'id' => (int) $row->id,
                    'pet' => (string) ($row->pet_name ?: 'Unnamed'),
                    'species' => $row->species_name ?: 'Unknown species',
                    'owner' => $owner,
                    'count' => (int) $row->visits,
                ];
            })
            ->all();
    }
}
