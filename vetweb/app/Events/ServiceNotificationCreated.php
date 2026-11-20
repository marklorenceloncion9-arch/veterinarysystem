<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ServiceNotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $userId;
    public string $title;
    public string $message;
    public array $payload;
    public string $notificationType;

    /**
     * Create a new event instance.
     */
    // Diri tipigan ang user ug detalye sa bag-ong notification.
    public function __construct(
        int $userId,
        string $title,
        string $message,
        array $payload = [],
        string $notificationType = 'service_schedule'
    ) {
        $this->userId = $userId;
        $this->title = $title;
        $this->message = $message;
        $this->payload = $payload;
        $this->notificationType = $notificationType;
    }

    /**
     * The private channel this event should broadcast on.
     */
    // Diri ang private channel sa user nga pahibaw-on.
    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('App.Models.User.' . $this->userId);
    }

    /**
     * The event name clients listen for (with a leading dot in Echo).
     */
    // Diri ang ngalan sa event nga notification.created.
    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    /**
     * The payload delivered to subscribers.
     */
    // Diri ang data sa notification nga ipadala sa user.
    public function broadcastWith(): array
    {
        return [
            'type' => $this->notificationType,
            'title' => $this->title,
            'message' => $this->message,
            'data' => $this->payload,
            'created_at' => now()->toIso8601String(),
        ];
    }
}
