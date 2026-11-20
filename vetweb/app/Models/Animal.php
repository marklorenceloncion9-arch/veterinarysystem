<?php

namespace App\Models;

use App\Support\VaccinationSchedule;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Animal extends Model
{
    use HasFactory;

    protected $table = 'animals';

    protected $fillable = [
        'user_id',
        'pet_name',
        'identification_number',
        'species_id',
        'breed_id',
        'sex',
        'color',
        'pet_photo_url',
        'markings',
        'markings_photo_url',
        'weight',
        'birthdate',
        'archived_at',
        'registration_status',
        // Reproductive Status
        'reproductive_status',
        'weeks_months',
        // Diet
        'diet',
        'diet_other',
        // Deworming History
        'dewormed',
        'last_deworming_date',
        'dewormer_name',
        // Vaccination History
        'rabies_vaccine',
        'rabies_last_vaccination',
        'rabies_dose_type',
        'dhppl_vaccine',
        'dhppl_last_vaccination',
        'dhppl_dose_type',
        'other_vaccine_name',
        'other_vaccine_last_vaccination',
        'other_vaccine_dose_type',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'weight' => 'decimal:2',
        'archived_at' => 'datetime',
        'last_deworming_date' => 'date',
        'rabies_last_vaccination' => 'date',
        'dhppl_last_vaccination' => 'date',
        'other_vaccine_last_vaccination' => 'date',
    ];

    protected $appends = [
        'registration_status',
        'rabies_valid_until',
        'dhppl_valid_until',
        'other_vaccine_valid_until',
    ];

    // Diri limpyohan ang clinical details matag save sa hayop.
    protected static function booted(): void
    {
        static::saving(function (self $animal) {
            $animal->clearUnusedClinicalDetails();
            $animal->applyVaccinationDurations();
        });
    }

    /**
     * Drop dates and follow-up fields that only apply when the parent answer is Yes.
     */
    // Diri papason ang clinical fields nga dili na kinahanglan.
    public function clearUnusedClinicalDetails(): void
    {
        if ($this->dewormed !== 'yes') {
            $this->last_deworming_date = null;
            $this->dewormer_name = null;
        }

        if ($this->rabies_vaccine !== 'yes') {
            $this->rabies_last_vaccination = null;
            $this->rabies_dose_type = null;
        }

        if ($this->dhppl_vaccine !== 'yes') {
            $this->dhppl_last_vaccination = null;
            $this->dhppl_dose_type = null;
        }

        if (! in_array($this->reproductive_status, ['pregnant', 'nursing'], true)) {
            $this->weeks_months = null;
        }

        if ($this->diet !== 'others') {
            $this->diet_other = null;
        }

        if (! filled($this->other_vaccine_name)) {
            $this->other_vaccine_last_vaccination = null;
            $this->other_vaccine_dose_type = null;
        }
    }

    // Diri i-set ang 1 year sa unang vaccination ug 3 years sa booster.
    public function applyVaccinationDurations(): void
    {
        $this->assignVaccineDose('rabies_last_vaccination', 'rabies_dose_type', $this->rabies_vaccine === 'yes');
        $this->assignVaccineDose('dhppl_last_vaccination', 'dhppl_dose_type', $this->dhppl_vaccine === 'yes');
        $this->assignVaccineDose('other_vaccine_last_vaccination', 'other_vaccine_dose_type', filled($this->other_vaccine_name));
    }

    public function getRabiesValidUntilAttribute(): ?string
    {
        return VaccinationSchedule::validUntil($this->rabies_last_vaccination, $this->rabies_dose_type);
    }

    public function getDhpplValidUntilAttribute(): ?string
    {
        return VaccinationSchedule::validUntil($this->dhppl_last_vaccination, $this->dhppl_dose_type);
    }

    public function getOtherVaccineValidUntilAttribute(): ?string
    {
        return VaccinationSchedule::validUntil($this->other_vaccine_last_vaccination, $this->other_vaccine_dose_type);
    }

    private function assignVaccineDose(string $dateAttribute, string $doseAttribute, bool $active): void
    {
        if (! $active) {
            $this->{$doseAttribute} = null;
            return;
        }

        $this->{$doseAttribute} = VaccinationSchedule::resolveDose(
            $this->{$dateAttribute},
            $this->getOriginal($dateAttribute),
            $this->{$doseAttribute},
            $this->getOriginal($doseAttribute),
            $this->isDirty($doseAttribute)
        );
    }

    /**
     * Scope for active (non-archived) animals
     */
    // Diri i-filter ang mga hayop nga dili archived.
    public function scopeActive($query)
    {
        return $query->whereNull('archived_at');
    }

    /**
     * Pets still waiting for registration. Livestock and poultry are exempt,
     * and a declined registration is not pending.
     */
    // Diri i-filter ang mga hayop nga pending ang registration.
    public function scopePendingRegistration($query)
    {
        return $query->active()
            ->where(function ($query) {
                $query->whereNull('animals.species_id')
                    ->orWhereNotIn('animals.species_id', function ($species) {
                        $species->select('species.id')
                            ->from('species')
                            ->join('animal_types', 'animal_types.id', '=', 'species.type_id')
                            ->whereIn('animal_types.type_name', ['Livestock', 'Poultry']);
                    });
            })
            ->whereRaw("
                COALESCE((
                    SELECT pet_registrations.status
                    FROM pet_registrations
                    WHERE pet_registrations.animal_id = animals.id
                    ORDER BY pet_registrations.created_at DESC, pet_registrations.id DESC
                    LIMIT 1
                ), 'pending') NOT IN ('paid', 'cancelled')
            ");
    }

    /**
     * Scope for archived animals
     */
    // Diri i-filter ang mga archived nga hayop.
    public function scopeArchived($query)
    {
        return $query->whereNotNull('archived_at');
    }

    /**
     * Check if animal is archived
     */
    // Diri susihon kung archived ang hayop.
    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /**
     * Get the user that owns the animal.
     */
    // Diri ang tag-iya nga user sa hayop.
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the species of the animal.
     */
    // Diri ang species sa hayop.
    public function species()
    {
        return $this->belongsTo(Species::class);
    }

    /**
     * Get the breed of the animal.
     */
    // Diri ang breed sa hayop.
    public function breed()
    {
        return $this->belongsTo(Breed::class);
    }

    /**
     * Get the animal registrations for the animal.
     */
    // Diri ang mga registration sa hayop.
    public function animalRegistrations()
    {
        return $this->hasMany(AnimalRegistration::class, 'animal_id');
    }

    /**
     * Get the pet registrations for the animal (backward compatibility).
     */
    // Diri ang mga pet registration sa hayop.
    public function petRegistrations()
    {
        return $this->hasMany(PetRegistration::class, 'animal_id');
    }

    /**
     * Get the latest animal registration record.
     */
    // Diri ang pinakabag-o nga registration sa hayop.
    public function latestAnimalRegistration()
    {
        return $this->hasOne(AnimalRegistration::class, 'animal_id')->latest();
    }

    /**
     * Get the latest pet registration record (backward compatibility).
     */
    // Diri ang pinakabag-o nga pet registration.
    public function latestPetRegistration()
    {
        return $this->hasOne(PetRegistration::class, 'animal_id')->latest();
    }

    // Diri ang mga tambal nga gihatag sa hayop sa booking.
    public function bookingMedicines()
    {
        return $this->hasMany(BookingMedicine::class, 'animal_id');
    }

    /**
     * Get registration status based on the latest pet registration.
     * Returns: 'registered', 'declined', 'unregistered', or 'exempt'
     * Livestock and Poultry animals are exempt from registration.
     */
    // Diri kuhaon ang registration status sa hayop.
    public function getRegistrationStatusAttribute()
    {
        if ($this->isExemptFromRegistration()) {
            return 'exempt';
        }

        $latest = $this->relationLoaded('animalRegistrations')
            ? $this->animalRegistrations->sortByDesc('created_at')->first()
            : $this->animalRegistrations()->latest()->first();

        if (!$latest) {
            return 'unregistered';
        }

        return match($latest->status) {
            'paid' => 'registered',
            'cancelled' => 'declined',
            'pending' => 'unregistered',
            default => 'unregistered',
        };
    }

    /**
     * Generate a unique animal identification number on registration.
     * Format: ES-YYYY-00001
     */
    // Diri himuon ang bag-ong ID number sa hayop.
    public static function generateIdentificationNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "ES-{$year}-";

        $lastNumber = static::whereNotNull('identification_number')
            ->where('identification_number', 'like', $prefix . '%')
            ->orderByDesc('identification_number')
            ->value('identification_number');

        $sequence = $lastNumber
            ? ((int) substr($lastNumber, strlen($prefix))) + 1
            : 1;

        return $prefix . str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Assign an identification number if the animal does not already have one.
     */
    // Diri hatagan og ID number ang hayop.
    public function assignIdentificationNumber(): string
    {
        if ($this->identification_number) {
            return $this->identification_number;
        }

        $this->forceFill([
            'identification_number' => static::generateIdentificationNumber(),
        ])->save();

        return $this->identification_number;
    }

    // Diri susihon kung livestock o poultry nga dili na i-register.
    public function isExemptFromRegistration(): bool
    {
        if ($this->species && $this->species->animalType) {
            return in_array($this->species->animalType->type_name, ['Livestock', 'Poultry'], true);
        }

        return false;
    }
}
