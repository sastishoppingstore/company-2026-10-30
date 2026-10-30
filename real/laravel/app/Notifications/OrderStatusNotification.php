<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class OrderStatusNotification extends Notification
{
    use Queueable;

    public function __construct(public Order $order, public string $type, public array $payload = []) {}

    public function via(object $notifiable): array
    {
        $channels = ['database'];

        if (config('rna.fcm.enabled') && method_exists($notifiable, 'fcm_token')) {
            $channels[] = 'fcm';
        }

        return $channels;
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->type,
            'title' => $this->payload['title'] ?? "Order {$this->order->order_code} updated",
            'body' => $this->payload['body'] ?? "Status: {$this->order->status}",
            'data' => [
                'order_id' => $this->order->id,
                'order_code' => $this->order->order_code,
                'status' => $this->order->status,
            ],
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Order {$this->order->order_code} · {$this->order->shop_name}")
            ->line($this->payload['body'] ?? "Status: {$this->order->status}")
            ->action('View order', url("/orders/{$this->order->id}"));
    }
}
