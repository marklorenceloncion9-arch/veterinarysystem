<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VhcRecord extends Model
{
    use HasFactory;

    protected $table = 'vhc_records';

    protected $fillable = [
        'vhc_client_id',
        'name',
        'age',
        'color',
        'contact_number',
        'purpose',
        'origin',
        'animals_origin',
        'destination',
        'slh',
        'issued_on',
        'valid_till',
        'or_number',
        'amount_paid',
        'issued_at',
        'inspected_by',
    ];

    protected $casts = [
        'issued_on' => 'date',
        'valid_till' => 'date',
        'amount_paid' => 'decimal:2',
    ];

    // Diri ang mga livestock sa VHC record.
    public function livestock()
    {
        return $this->hasMany(VhcLivestock::class, 'vhc_id');
    }

    // Diri ang client sa VHC record.
    public function client()
    {
        return $this->belongsTo(VhcClient::class, 'vhc_client_id');
    }
}
