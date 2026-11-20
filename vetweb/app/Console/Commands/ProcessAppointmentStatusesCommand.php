<?php

namespace App\Console\Commands;

use App\Services\AppointmentStatusService;
use Illuminate\Console\Command;

class ProcessAppointmentStatusesCommand extends Command
{
    protected $signature = 'appointments:process-status';

    protected $description = 'Cancel approved clinical appointments whose scheduled date has already passed';

    // Diri i-cancel ang approved nga clinical appointment nga milabay na ang adlaw.
    public function handle(): int
    {
        $results = AppointmentStatusService::runScheduledUpdates();

        if ($results['cancelled'] > 0) {
            $this->info("Auto-cancelled {$results['cancelled']} approved clinical appointment(s) past their scheduled date.");
        } else {
            $this->info('No approved clinical appointments were past their scheduled date.');
        }

        return self::SUCCESS;
    }
}
