<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServicesInfo extends Model
{
    use HasFactory;

    protected $table = 'services_info';

    protected $fillable = [
        'booking_id',
        'animal_id',
        'treatment_type_id',
        'complaint_id',
        'administered_by',
        'notes',
        'treatment_date',
    ];

    protected $casts = [
        'treatment_date' => 'date',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the appointment.
     */
    // Diri ang appointment sa service info.
    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class, 'booking_id');
    }

    /**
     * Get the animal.
     */
    // Diri ang hayop sa service info.
    public function animal(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    /**
     * Get the pet (backward compatibility).
     */
    // Diri ang pet sa service info.
    public function pet(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    /**
     * Get the service (formerly treatment type).
     */
    // Diri ang treatment type sa service info.
    public function treatmentType(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'treatment_type_id');
    }

    /**
     * Get the service (new relationship).
     */
    // Diri ang serbisyo sa service info.
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'treatment_type_id');
    }

    /**
     * Get the complaint (if linked).
     */
    // Diri ang complaint sa service info.
    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }
}
