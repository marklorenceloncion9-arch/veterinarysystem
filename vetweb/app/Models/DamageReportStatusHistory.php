<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DamageReportStatusHistory extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'damage_report_id',
        'from_status',
        'to_status',
        'changed_by',
        'note',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    // Diri ang damage report sa history.
    public function damageReport()
    {
        return $this->belongsTo(DamageReport::class);
    }

    // Diri ang user nga nag-usab sa status sa report.
    public function changedByUser()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
