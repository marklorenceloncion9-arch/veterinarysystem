<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DamageReport extends Model
{
    use HasFactory;

    public const STATUS_UNDER_REVIEW = 'under_review';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_DEDUCTED = 'deducted';

    protected $fillable = [
        'medicine_id',
        'inventory_id',
        'reported_by',
        'quantity',
        'reason',
        'evidence_image_urls',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
        'deducted_by',
        'deducted_at',
        'inventory_log_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
        'evidence_image_urls' => 'array',
        'reviewed_at' => 'datetime',
        'deducted_at' => 'datetime',
    ];

    // Diri ang tambal sa damage report.
    public function medicine()
    {
        return $this->belongsTo(Medicine::class);
    }

    // Diri ang batch sa inventory nga na-damage.
    public function inventory()
    {
        return $this->belongsTo(Inventory::class);
    }

    // Diri ang user nga nag-report sa damage.
    public function reporter()
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    // Diri ang user nga nag-review sa report.
    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    // Diri ang user nga nagbawas sa stock.
    public function deductedByUser()
    {
        return $this->belongsTo(User::class, 'deducted_by');
    }

    // Diri ang inventory log sa pagbawas.
    public function inventoryLog()
    {
        return $this->belongsTo(InventoryLog::class, 'inventory_log_id');
    }

    // Diri ang history sa status sa damage report.
    public function statusHistories()
    {
        return $this->hasMany(DamageReportStatusHistory::class)->orderBy('created_at')->orderBy('id');
    }

    // Diri susihon kung under review pa ang report.
    public function isUnderReview(): bool
    {
        return $this->status === self::STATUS_UNDER_REVIEW;
    }

    // Diri susihon kung approved na ang report.
    public function isApproved(): bool
    {
        return $this->status === self::STATUS_APPROVED;
    }

    // Diri susihon kung rejected ang report.
    public function isRejected(): bool
    {
        return $this->status === self::STATUS_REJECTED;
    }

    // Diri susihon kung nabawas na sa stock ang report.
    public function isDeducted(): bool
    {
        return $this->status === self::STATUS_DEDUCTED;
    }

    // Diri i-record ang pag-usab sa status sa report.
    public function recordStatusChange(?string $from, string $to, ?int $userId = null, ?string $note = null): void
    {
        $this->statusHistories()->create([
            'from_status' => $from,
            'to_status' => $to,
            'changed_by' => $userId,
            'note' => $note,
            'created_at' => now(),
        ]);
    }
}
