<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class OtpNotification extends Notification
{
    use Queueable;

    public function __construct(public string $code, public string $purpose, public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your RNA Ship verification code')
            ->line($this->purpose === 'delivery_verification'
                ? "The driver is at {$this->order->shop_name} and is waiting for this code to complete the handover."
                : "Use this code to confirm and submit delivery order {$this->order->order_code}.")
            ->line($this->code)
            ->line('This code is valid for a limited time and can be used only once.');
    }
}
