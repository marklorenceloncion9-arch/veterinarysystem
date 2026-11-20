<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SpeciesVhcFeeHistory extends Model
{
    protected $table = 'species_vhc_fee_history';

    protected $fillable = [
        'species_id',
        'old_amount',
        'new_amount',
        'effective_date',
        'reason',
        'changed_by',
    ];

    protected $casts = [
        'old_amount' => 'decimal:2',
        'new_amount' => 'decimal:2',
        'effective_date' => 'date',
    ];

    // Diri ang species sa VHC fee history.
    public function species(): BelongsTo
    {
        return $this->belongsTo(Species::class);
    }

    // Diri ang user nga nag-usab sa VHC fee.
    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
