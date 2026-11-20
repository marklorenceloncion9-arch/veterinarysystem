<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InventoryLog extends Model
{
    use HasFactory;

    const REASON_STOCK_IN = 'stock_in';
    const REASON_RECEIVING = 'receiving';
    const REASON_USED = 'used';
    const REASON_DAMAGED = 'damaged';
    const REASON_EXPIRED = 'expired';

    const ENTRY_NEW = 'new';
    const ENTRY_RECEIVING = 'receiving';

    protected $table = 'inventory_logs';

    protected $fillable = [
        'medicine_id',
        'inventory_id',
        'booking_id',
        'animal_id',
        'change_qty',
        'type',
        'reason',
        'viewed_at',
    ];

    public $timestamps = true;
    const UPDATED_AT = null;

    protected $casts = [
        'change_qty' => 'decimal:2',
        'viewed_at' => 'datetime',
    ];

    protected $appends = [
        'is_read',
    ];

    // Diri susihon kung nabasa na ang log.
    public function getIsReadAttribute(): bool
    {
        return $this->viewed_at !== null;
    }

    // Diri markahan nga nabasa ang log.
    public function markAsRead(): bool
    {
        if ($this->viewed_at !== null) {
            return false;
        }

        $this->forceFill(['viewed_at' => now()])->save();

        return true;
    }

    // Diri ang tambal sa log.
    public function medicine()
    {
        return $this->belongsTo(Medicine::class);
    }

    // Diri ang inventory batch sa log.
    public function inventory()
    {
        return $this->belongsTo(Inventory::class);
    }

    // Diri ang booking sa log.
    public function booking()
    {
        return $this->belongsTo(Appointment::class, 'booking_id');
    }

    // Diri ang hayop sa log.
    public function animal()
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    // Diri ang damage report sa log.
    public function damageReport()
    {
        return $this->hasOne(DamageReport::class, 'inventory_log_id');
    }
}
