<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class AppointmentChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $action;
    public ?array $appointment;

    /**
     * @param  'created'|'updated'|'cancelled'  $action
     */
    // Diri tipigan ang action ug data sa appointment nga nausab.
    public function __construct(string $action, ?array $appointment = null)
    {
        $this->action = $action;
        $this->appointment = $appointment;
    }

    // Diri ang private channel sa admin appointments.
    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('admin.appointments');
    }

    // Diri ang ngalan sa event nga appointment.changed.
    public function broadcastAs(): string
    {
        return 'appointment.changed';
    }

    // Diri ang data nga ipadala sa broadcast sa appointment.
    public function broadcastWith(): array
    {
        return [
            'action' => $this->action,
            'appointment' => $this->appointment,
            'timestamp' => now()->toIso8601String(),
        ];
    }
}
