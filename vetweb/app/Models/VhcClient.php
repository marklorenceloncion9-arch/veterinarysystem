<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VhcClient extends Model
{
    protected $fillable = [
        'name',
        'contact_number',
    ];

    // Diri ang mga VHC certificate sa client.
    public function certificates(): HasMany
    {
        return $this->hasMany(VhcRecord::class, 'vhc_client_id');
    }
}
