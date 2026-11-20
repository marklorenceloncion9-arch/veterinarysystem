<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Service extends Model
{
    use HasFactory;

    protected $table = 'services';

    protected $fillable = [
        'type_name',
        'description',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get all services as an array for dropdowns
     */
    // Diri kuhaon ang tanang type sa serbisyo.
    public static function getAllTypes()
    {
        return self::all()->pluck('type_name', 'id');
    }

    /**
     * Get service ID by name
     */
    // Diri kuhaon ang ID sa serbisyo base sa ngalan.
    public static function getIdByName(string $name): ?int
    {
        $service = self::where('type_name', $name)->first();
        return $service ? $service->id : null;
    }

    /**
     * Get appointments for this service.
     */
    // Diri ang mga appointment sa serbisyo.
    public function appointments(): BelongsToMany
    {
        return $this->belongsToMany(Appointment::class, 'booking_services', 'service_type_id', 'booking_id')
            ->withTimestamps();
    }
}
