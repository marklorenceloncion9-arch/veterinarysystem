<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppointmentService extends Model
{
    use HasFactory;

    protected $table = 'booking_services';

    protected $fillable = [
        'booking_id',
        'service_type_id',
        'animal_id',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the appointment that owns this service.
     */
    // Diri ang appointment sa serbisyo.
    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class, 'booking_id');
    }

    /**
     * Animal this service row belongs to (nullable for legacy rows).
     */
    // Diri ang hayop nga gi-serbisyohan.
    public function animal(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    /**
     * Get the service.
     */
    // Diri ang serbisyo nga gi-book.
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_type_id', 'id');
    }

    /**
     * Get the service type (alias for service relationship).
     */
    // Diri ang type sa serbisyo.
    public function serviceType(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_type_id');
    }

    /**
     * Get the treatment type (legacy relationship for backward compatibility).
     */
    // Diri ang treatment type sa serbisyo.
    public function treatmentType(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'service_type_id');
    }
}
