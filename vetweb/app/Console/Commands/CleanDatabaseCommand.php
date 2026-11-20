<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\BookingStatusLog;
use App\Services\AppointmentStatusLogService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CleanDatabaseCommand extends Command
{
    protected $signature = 'db:clean-bookings {--dry-run : Preview changes without writing}';

    protected $description = 'Clean booking and status-log data: remove duplicate cancel notes, fix owner attribution, normalize empty values';

    // Diri padaganon ang tanang paglimpyo sa booking ug status log.
    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->warn('Dry run only — no changes will be saved.');
        }

        $stats = [
            'cancel_notes_cleared' => 0,
            'empty_reasons_normalized' => 0,
            'owner_cancel_logs_fixed' => 0,
            'invalid_staff_names_fixed' => 0,
            'orphan_logs_removed' => 0,
        ];

        DB::transaction(function () use ($dryRun, &$stats) {
            $stats['cancel_notes_cleared'] = $this->clearRedundantCancellationNotes($dryRun);
            $stats['empty_reasons_normalized'] = $this->normalizeEmptyCancellationReasons($dryRun);
            $stats['owner_cancel_logs_fixed'] = $this->fixOwnerCancellationAttribution($dryRun);
            $stats['invalid_staff_names_fixed'] = $this->normalizeLegacyStaffNames($dryRun);
            $stats['orphan_logs_removed'] = $this->removeOrphanStatusLogs($dryRun);
        });

        $this->newLine();
        $this->info('Database cleanup complete' . ($dryRun ? ' (preview)' : '') . ':');
        foreach ($stats as $key => $count) {
            $this->line('  ' . str_replace('_', ' ', $key) . ': ' . $count);
        }

        $this->newLine();
        $this->table(
            ['Table', 'Rows'],
            [
                ['bookings', Appointment::count()],
                ['booking_status_logs', BookingStatusLog::count()],
                ['cancelled bookings', Appointment::where('status', 'cancelled')->count()],
            ]
        );

        return self::SUCCESS;
    }

    // Diri papason ang doble nga cancel notes sa log.
    private function clearRedundantCancellationNotes(bool $dryRun): int
    {
        $logs = BookingStatusLog::query()
            ->where('status', 'cancelled')
            ->whereNotNull('notes')
            ->where('notes', '!=', '')
            ->get();

        $count = 0;

        foreach ($logs as $log) {
            $booking = Appointment::find($log->booking_id);
            if (!$booking) {
                continue;
            }

            if (trim((string) $log->notes) === trim((string) $booking->cancellation_reason)) {
                $count++;
                if (!$dryRun) {
                    $log->update(['notes' => null]);
                }
            }
        }

        return $count;
    }

    // Diri himuong null ang mga walay sulod nga cancel reason.
    private function normalizeEmptyCancellationReasons(bool $dryRun): int
    {
        $bookings = Appointment::query()
            ->where('status', 'cancelled')
            ->where(function ($query) {
                $query->whereNull('cancellation_reason')->orWhere('cancellation_reason', '');
            })
            ->get();

        $count = 0;

        foreach ($bookings as $booking) {
            $reason = BookingStatusLog::query()
                ->where('booking_id', $booking->id)
                ->where('status', 'cancelled')
                ->whereNotNull('notes')
                ->where('notes', '!=', '')
                ->value('notes');

            if (!$reason) {
                continue;
            }

            $count++;
            if (!$dryRun) {
                $booking->update(['cancellation_reason' => trim($reason)]);
            }
        }

        return $count;
    }

    // Diri ayuhon kinsa ang tinuod nga nag-cancel nga tag-iya.
    private function fixOwnerCancellationAttribution(bool $dryRun): int
    {
        $logs = BookingStatusLog::query()
            ->where('status', 'cancelled')
            ->whereNull('changed_by_user_id')
            ->get();

        $count = 0;

        foreach ($logs as $log) {
            $booking = Appointment::find($log->booking_id);
            if (!$booking?->user_id) {
                continue;
            }

            if (AppointmentStatusLogService::isStaffInitiatedCancellationReason($booking->cancellation_reason)) {
                continue;
            }

            $reason = strtolower(trim((string) ($booking->cancellation_reason ?? $log->notes)));
            $isClinicCancellation = $reason !== ''
                && (
                    str_contains($reason, 'the clinic is unavailable')
                    || str_contains($reason, 'please book a new appointment')
                );

            if ($isClinicCancellation || strcasecmp((string) $log->changed_by_name, 'Clinic') === 0) {
                continue;
            }

            $ownerName = AppointmentStatusLogService::resolveActorName(null, $booking->user_id);

            $count++;
            if (!$dryRun) {
                $log->update([
                    'changed_by_user_id' => $booking->user_id,
                    'changed_by_name' => $ownerName,
                    'notes' => null,
                ]);
            }
        }

        return $count;
    }

    // Diri usbon ang daan nga pangalan sa staff sa mga log.
    private function normalizeLegacyStaffNames(bool $dryRun): int
    {
        $logs = BookingStatusLog::query()
            ->whereIn('changed_by_name', ['Staff', 'System'])
            ->whereNull('changed_by_user_id')
            ->where('status', '!=', 'pending')
            ->get();

        $count = 0;

        foreach ($logs as $log) {
            $count++;
            if (!$dryRun) {
                $log->update(['changed_by_name' => 'Data Manager']);
            }
        }

        return $count;
    }

    // Diri papason ang status log nga wala nay booking.
    private function removeOrphanStatusLogs(bool $dryRun): int
    {
        $orphanIds = DB::table('booking_status_logs as l')
            ->leftJoin('bookings as b', 'b.id', '=', 'l.booking_id')
            ->whereNull('b.id')
            ->pluck('l.id');

        if ($orphanIds->isEmpty()) {
            return 0;
        }

        if (!$dryRun) {
            BookingStatusLog::whereIn('id', $orphanIds)->delete();
        }

        return $orphanIds->count();
    }
}
