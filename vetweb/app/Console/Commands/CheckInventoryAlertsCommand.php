<?php

namespace App\Console\Commands;

use App\Services\InventoryAlertNotificationService;
use Illuminate\Console\Command;

class CheckInventoryAlertsCommand extends Command
{
    protected $signature = 'inventory:check-alerts';

    protected $description = 'Scan inventory and notify budget officers about expired, expiring, low, and out-of-stock items';

    // Diri i-scan ang inventory ug pahibaw-on ang budget officer.
    public function handle(): int
    {
        $sent = InventoryAlertNotificationService::scanAll();

        $this->info("Inventory alert scan complete. {$sent} notification(s) sent.");

        return self::SUCCESS;
    }
}
