<?php

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Appointment;
use App\Models\BookingStatusLog;
use App\Models\User;
use App\Models\Animal;
use App\Models\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "=== Database health check ===\n\n";

$tables = [
    'users', 'animals', 'bookings', 'booking_status_logs', 'booking_services',
    'booking_symptoms', 'booking_medicines', 'notifications', 'services',
];

foreach ($tables as $table) {
    if (Schema::hasTable($table)) {
        echo str_pad($table, 24) . DB::table($table)->count() . "\n";
    }
}

echo "\n--- Bookings by status ---\n";
foreach (Appointment::selectRaw('status, count(*) as c')->groupBy('status')->get() as $row) {
    echo "  {$row->status}: {$row->c}\n";
}

echo "\n--- Status logs by status ---\n";
foreach (BookingStatusLog::selectRaw('status, count(*) as c')->groupBy('status')->get() as $row) {
    echo "  {$row->status}: {$row->c}\n";
}

echo "\n--- Issues ---\n";

$orphanLogs = DB::table('booking_status_logs as l')
    ->leftJoin('bookings as b', 'b.id', '=', 'l.booking_id')
    ->whereNull('b.id')
    ->count();
echo "Orphan status logs (no booking): {$orphanLogs}\n";

$bookingsNoUser = Appointment::whereNotIn('user_id', User::pluck('id'))->count();
echo "Bookings with missing user: {$bookingsNoUser}\n";

$bookingsNoAnimal = Appointment::whereNotIn('animal_id', Animal::pluck('id'))->count();
echo "Bookings with missing animal: {$bookingsNoAnimal}\n";

$cancelledNoReason = Appointment::where('status', 'cancelled')->where(function ($q) {
    $q->whereNull('cancellation_reason')->orWhere('cancellation_reason', '');
})->count();
echo "Cancelled bookings without reason: {$cancelledNoReason}\n";

$duplicateCancelNotes = DB::table('booking_status_logs as l')
    ->join('bookings as b', 'b.id', '=', 'l.booking_id')
    ->where('l.status', 'cancelled')
    ->whereNotNull('l.notes')
    ->where('l.notes', '!=', '')
    ->whereColumn('l.notes', 'b.cancellation_reason')
    ->count();
echo "Duplicate cancel notes in logs: {$duplicateCancelNotes}\n";

$logsPerBooking = DB::table('booking_status_logs')
    ->select('booking_id', DB::raw('count(*) as c'))
    ->groupBy('booking_id')
    ->having('c', '>', 5)
    ->get();
echo "Bookings with >5 status logs: " . $logsPerBooking->count() . "\n";

$invalidLogUsers = DB::table('booking_status_logs as l')
    ->leftJoin('users as u', 'u.id', '=', 'l.changed_by_user_id')
    ->whereNotNull('l.changed_by_user_id')
    ->whereNull('u.id')
    ->count();
echo "Status logs with invalid user_id: {$invalidLogUsers}\n";

echo "\n--- Sample cancelled records ---\n";
foreach (Appointment::where('status', 'cancelled')->with('statusLogs')->limit(5)->get() as $apt) {
    echo "Booking #{$apt->id}: reason=" . ($apt->cancellation_reason ?: '(empty)') . "\n";
    foreach ($apt->statusLogs as $log) {
        echo "  log #{$log->id} {$log->status} by {$log->changed_by_name} (user {$log->changed_by_user_id}) notes=" . ($log->notes ?: '(empty)') . "\n";
    }
}
