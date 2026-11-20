<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Zone extends Model
{
    /**
     * Natural sort: "Zone 2" before "Zone 10", and "Zone 1-A" before "Zone 2".
     */
    public const NATURAL_ORDER = "CAST(REGEXP_SUBSTR(name, '[0-9]+') AS UNSIGNED), name";

    protected $fillable = [
        'barangay_id',
        'name',
    ];

    /**
     * Get the barangay this zone belongs to.
     */
    // Diri ang barangay sa zone.
    public function barangay()
    {
        return $this->belongsTo(Barangay::class);
    }
}
