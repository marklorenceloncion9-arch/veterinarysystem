<?php

namespace App\Console\Commands;

use App\Services\AppointmentClientNotificationService;
use Illuminate\Console\Command;

class SendTodayAppointmentRemindersCommand extends Command
{
    protected $signature = 'appointments:send-today-reminders';

    protected $description = 'Notify clients with approved clinic appointments or home services scheduled for today';

    // Diri ipadala ang pahinumdom sa appointment karong adlawa.
    public function handle(): int
    {
        $sent = AppointmentClientNotificationService::notifyTodayReminders();

        $this->info("Today's appointment reminders sent: {$sent}");

        return self::SUCCESS;
    }
}
