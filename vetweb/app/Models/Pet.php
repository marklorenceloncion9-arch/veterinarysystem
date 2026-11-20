<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Pet extends Model
{
    use HasFactory;

    protected $table = 'animals';

    protected $fillable = [
        'user_id',
        'pet_name',
        'species_id',
        'breed_id',
        'sex',
        'color',
        'weight',
        'birthdate',
        'archived_at',
        'registration_status',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'weight' => 'decimal:2',
        'archived_at' => 'datetime',
    ];

    protected $appends = ['registration_status'];

    /**
     * Scope for active (non-archived) pets
     */
    // Diri i-filter ang mga pet nga dili archived.
    public function scopeActive($query)
    {
        return $query->whereNull('archived_at');
    }

    /**
     * Scope for archived pets
     */
    // Diri i-filter ang mga archived nga pet.
    public function scopeArchived($query)
    {
        return $query->whereNotNull('archived_at');
    }

    /**
     * Check if pet is archived
     */
    // Diri susihon kung archived ang pet.
    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /**
     * Get the user that owns the pet.
     */
    // Diri ang tag-iya nga user sa pet.
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the species of the pet.
     */
    // Diri ang species sa pet.
    public function species()
    {
        return $this->belongsTo(Species::class);
    }

    /**
     * Get the breed of the pet.
     */
    // Diri ang breed sa pet.
    public function breed()
    {
        return $this->belongsTo(Breed::class);
    }

    /**
     * Get the pet registrations for the pet.
     */
    // Diri ang mga registration sa pet.
    public function petRegistrations()
    {
        return $this->hasMany(PetRegistration::class, 'animal_id');
    }

    /**
     * Get the latest pet registration record.
     */
    // Diri ang pinakabag-o nga registration sa pet.
    public function latestPetRegistration()
    {
        return $this->hasOne(PetRegistration::class, 'animal_id')->latest();
    }

    /**
     * Get registration status based on pet_registrations.
     * Returns: 'registered', 'declined', or 'unregistered'
     */
    // Diri kuhaon ang registration status sa pet.
    public function getRegistrationStatusAttribute()
    {
        $latest = $this->petRegistrations()->latest()->first();
        
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
}
