<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Appointment extends Model
{
    use HasFactory;

    protected $table = 'bookings';

    protected $fillable = [
        'user_id',
        'animal_id',
        'booked_animals',
        'service_type_id',
        'booking_date',
        'booking_time',
        'duration_minutes',
        'status',
        'notes',
        'cancellation_reason',
        'administered_by',
        'booking_type',
        'meeting_latitude',
        'meeting_longitude',
        'meeting_place_photo_url',
        'is_bitten',
        'bite_details',
    ];

    protected $casts = [
        'booking_date' => 'date',
        'booking_time' => 'string',
        'booking_type' => 'string',
        'meeting_latitude' => 'float',
        'meeting_longitude' => 'float',
        'is_bitten' => 'boolean',
        'booked_animals' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $resolvedAnimalsOverride = null;

    /**
     * Whether this booking is a Home Services (door-to-door) visit rather than
     * a clinic appointment or walk-in.
     */
    // Diri susihon kung home service ang appointment.
    public function isHomeService(): bool
    {
        return $this->booking_type === 'home_service';
    }

    /**
     * Get the user who booked the appointment.
     */
    // Diri ang client nga tag-iya sa appointment.
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Fieldmen assigned to this Home Service visit.
     */
    // Diri ang mga fieldman nga assigned sa appointment.
    public function assignedFieldmen(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'booking_fieldmen', 'booking_id', 'fieldman_id')
            ->withTimestamps();
    }

    // Diri susihon kung assigned ang fieldman sa appointment.
    public function isAssignedToFieldman(?int $fieldmanId): bool
    {
        if ($fieldmanId === null) {
            return false;
        }

        if ($this->relationLoaded('assignedFieldmen')) {
            return $this->assignedFieldmen->contains(fn (User $user) => (int) $user->id === (int) $fieldmanId);
        }

        return $this->assignedFieldmen()->where('users.id', $fieldmanId)->exists();
    }

    /**
     * Get the primary animal for this appointment (backward compatibility).
     */
    // Diri ang hayop sa appointment.
    public function animal(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    /**
     * Get the primary pet for this appointment (backward compatibility).
     */
    // Diri ang pet sa appointment.
    public function pet(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    /**
     * All booked animals are stored on bookings.booked_animals (JSON).
     */
    // Diri kuhaon ang mga hayop nga gi-book ug ilang status.
    public function bookedAnimalEntries(): array
    {
        $entries = $this->booked_animals;
        if (is_string($entries)) {
            $entries = json_decode($entries, true);
        }

        if (is_array($entries) && $entries !== []) {
            return array_values(array_map(function ($entry) {
                return [
                    'animal_id' => (int) ($entry['animal_id'] ?? $entry['id'] ?? 0),
                    'status' => $entry['status'] ?? 'pending',
                    'cancellation_reason' => $entry['cancellation_reason'] ?? null,
                    'administered_by' => $entry['administered_by'] ?? null,
                ];
            }, $entries));
        }

        if ($this->animal_id) {
            $status = match ($this->status) {
                'cancelled' => 'cancelled',
                'approved', 'processing', 'ongoing', 'completed' => 'approved',
                default => 'pending',
            };

            return [[
                'animal_id' => (int) $this->animal_id,
                'status' => $status,
                'cancellation_reason' => $this->status === 'cancelled' ? $this->cancellation_reason : null,
                'administered_by' => null,
            ]];
        }

        return [];
    }

    // Diri i-sync ang mga ID sa hayop nga gi-book.
    public function syncBookedAnimalIds(array $petIds, string $status = 'pending'): void
    {
        $entries = [];
        foreach (array_values(array_unique(array_map('intval', $petIds))) as $petId) {
            if ($petId <= 0) {
                continue;
            }
            $entries[] = [
                'animal_id' => $petId,
                'status' => $status,
                'cancellation_reason' => null,
                'administered_by' => null,
            ];
        }

        $this->forceFill([
            'booked_animals' => $entries,
            'animal_id' => $entries[0]['animal_id'] ?? $this->animal_id,
        ])->save();
        $this->clearResolvedAnimals();
    }

    // Diri i-save ang lista sa hayop nga gi-book.
    public function setBookedAnimalEntries(array $entries): void
    {
        $normalized = [];
        foreach ($entries as $entry) {
            $animalId = (int) ($entry['animal_id'] ?? 0);
            if ($animalId <= 0) {
                continue;
            }
            $normalized[] = [
                'animal_id' => $animalId,
                'status' => $entry['status'] ?? 'pending',
                'cancellation_reason' => $entry['cancellation_reason'] ?? null,
                'administered_by' => $entry['administered_by'] ?? null,
            ];
        }

        $this->forceFill([
            'booked_animals' => array_values($normalized),
            'animal_id' => $normalized[0]['animal_id'] ?? $this->animal_id,
        ])->save();
        $this->clearResolvedAnimals();
    }

    // Diri papason ang cached nga lista sa hayop.
    public function clearResolvedAnimals(): void
    {
        $this->resolvedAnimalsOverride = null;
    }

    // Diri ibutang ang cached nga lista sa hayop.
    public function setResolvedAnimals($animals): void
    {
        $this->resolvedAnimalsOverride = collect($animals)->filter()->values();
    }

    /**
     * Resolve all booked animals, falling back to the primary animal_id.
     */
    // Diri kuhaon ang mga hayop nga gi-book sa appointment.
    public function resolvedAnimals()
    {
        if ($this->resolvedAnimalsOverride !== null) {
            return $this->resolvedAnimalsOverride;
        }

        $entries = $this->bookedAnimalEntries();
        $ids = collect($entries)->pluck('animal_id')->filter()->unique()->values();
        if ($ids->isEmpty()) {
            $fallback = $this->animal ? collect([$this->attachAnimalBookingPivot($this->animal, [
                'status' => $this->status === 'cancelled' ? 'cancelled' : 'pending',
                'cancellation_reason' => $this->cancellation_reason,
            ])]) : collect();
            $this->resolvedAnimalsOverride = $fallback;

            return $fallback;
        }

        $lookup = Animal::with(['species', 'breed'])->whereIn('id', $ids)->get()->keyBy('id');
        $resolved = $this->mapEntriesToAnimals($entries, $lookup);
        $this->resolvedAnimalsOverride = $resolved;

        return $resolved;
    }

    // Diri i-load dungan ang mga hayop sa daghang appointment.
    public static function hydrateBookedAnimals($appointments): void
    {
        $appointments = collect($appointments);
        $ids = $appointments
            ->flatMap(fn (self $appointment) => collect($appointment->bookedAnimalEntries())->pluck('animal_id'))
            ->filter()
            ->unique()
            ->values();

        $lookup = $ids->isEmpty()
            ? collect()
            : Animal::with(['species', 'breed'])->whereIn('id', $ids)->get()->keyBy('id');

        $appointments->each(function (self $appointment) use ($lookup) {
            $appointment->setResolvedAnimals(
                $appointment->mapEntriesToAnimals($appointment->bookedAnimalEntries(), $lookup)
            );
        });
    }

    // Diri itugma ang booking entries sa mga hayop.
    private function mapEntriesToAnimals(array $entries, $lookup)
    {
        return collect($entries)->map(function ($entry) use ($lookup) {
            $base = $lookup->get((int) ($entry['animal_id'] ?? 0));
            if (!$base) {
                return null;
            }
            $animal = clone $base;

            return $this->attachAnimalBookingPivot($animal, $entry);
        })->filter()->values();
    }

    // Diri idikit ang booking status sa hayop.
    private function attachAnimalBookingPivot(Animal $animal, array $entry): Animal
    {
        $animal->setRelation('pivot', (object) [
            'status' => $entry['status'] ?? 'pending',
            'cancellation_reason' => $entry['cancellation_reason'] ?? null,
            'administered_by' => $entry['administered_by'] ?? null,
        ]);

        return $animal;
    }

    /**
     * Human-readable pet name(s) for notifications and labels.
     */
    // Diri himuon ang label sa mga ngalan sa hayop.
    public function petNamesLabel(string $fallback = 'your pet'): string
    {
        $names = $this->resolvedAnimals()->pluck('pet_name')->filter()->values();

        if ($names->isEmpty()) {
            return $this->animal?->pet_name ?? $fallback;
        }

        if ($names->count() === 1) {
            return $names->first();
        }

        if ($names->count() === 2) {
            return $names->implode(' and ');
        }

        return $names->slice(0, -1)->implode(', ') . ', and ' . $names->last();
    }

    /**
     * Get the service (legacy single relationship).
     */
    // Diri ang treatment type sa appointment.
    public function treatmentType(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'treatment_type_id');
    }

    /**
     * Get the service (new relationship).
     */
    // Diri ang main nga serbisyo sa appointment.
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_type_id');
    }

    /**
     * Get all services for this appointment.
     */
    // Diri ang tanang treatment type sa appointment.
    public function treatmentTypes(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'booking_services', 'booking_id', 'service_type_id')
            ->withPivot('animal_id')
            ->withTimestamps();
    }

    /**
     * Get all services for this appointment (new relationship).
     */
    // Diri ang tanang serbisyo sa appointment.
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'booking_services', 'booking_id', 'service_type_id')
            ->withPivot('animal_id')
            ->withTimestamps();
    }

    /**
     * Raw booking_services rows (one per animal + service).
     */
    // Diri ang serbisyo sa matag hayop sa booking.
    public function bookingServices(): HasMany
    {
        return $this->hasMany(AppointmentService::class, 'booking_id');
    }

    /**
     * Get medicines actually administered for this booking.
     */
    // Diri ang mga tambal nga gigamit sa booking.
    public function bookingMedicines(): HasMany
    {
        return $this->hasMany(BookingMedicine::class, 'booking_id');
    }

    // Diri ang mga tambal nga paliton sa gawas.
    public function outsidePurchaseItems(): HasMany
    {
        return $this->hasMany(OutsidePurchaseItem::class, 'booking_id');
    }

    // Diri kuhaon ang mga hayop nga pwede tambalan.
    public function treatableAnimalIds(): array
    {
        $ids = collect($this->bookedAnimalEntries())
            ->filter(fn ($entry) => ($entry['status'] ?? 'pending') !== 'cancelled')
            ->map(fn ($entry) => (int) ($entry['animal_id'] ?? 0))
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids === [] && $this->animal_id) {
            return [(int) $this->animal_id];
        }

        return $ids;
    }

    // Diri ibutang kinsa ang nagtambal sa hayop.
    public function setAnimalAdministeredBy(int $animalId, string $administeredBy): void
    {
        $entries = $this->bookedAnimalEntries();
        $found = false;

        foreach ($entries as &$entry) {
            if ((int) ($entry['animal_id'] ?? 0) !== $animalId) {
                continue;
            }
            $entry['administered_by'] = $administeredBy;
            $found = true;
            break;
        }
        unset($entry);

        if (!$found && $animalId > 0) {
            $entries[] = [
                'animal_id' => $animalId,
                'status' => $this->status === 'cancelled' ? 'cancelled' : 'approved',
                'cancellation_reason' => null,
                'administered_by' => $administeredBy,
            ];
        }

        $this->setBookedAnimalEntries($entries);
    }

    /**
     * Get symptoms associated with this booking.
     */
    // Diri ang mga sintomas sa appointment.
    public function symptoms(): BelongsToMany
    {
        return $this->belongsToMany(Symptom::class, 'booking_symptoms', 'booking_id')
            ->withPivot('days_count', 'notes')
            ->withTimestamps();
    }

    /**
     * Status change history for this booking.
     */
    // Diri ang history sa status sa appointment.
    public function statusLogs(): HasMany
    {
        return $this->hasMany(BookingStatusLog::class, 'booking_id')->orderBy('changed_at');
    }
}
