<?php

namespace App\Notifications;

use App\Mail\DeliveryReceivedMail;
use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class DeliveryReceivedNotification extends Notification
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'delivery_received',
            'title' => "Order {$this->order->order_code} received at {$this->order->shop_name}",
            'body' => 'Delivered and verified. Proof of delivery is available.',
            'data' => ['order_id' => $this->order->id, 'order_code' => $this->order->order_code],
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Order {$this->order->order_code} received at {$this->order->shop_name}")
            ->markdown('mails.delivery-received', [
                'order' => $this->order,
                'proofUrl' => url("/proof/{$this->order->id}?token={$this->order->proof_token}"),
            ]);
    }
}
