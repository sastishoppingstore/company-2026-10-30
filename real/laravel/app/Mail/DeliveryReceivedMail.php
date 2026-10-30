<?php

namespace App\Mail;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class DeliveryReceivedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Order $order, public string $proofUrl) {}

    public function build(): self
    {
        return $this->subject("Order {$this->order->order_code} received at {$this->order->shop_name}")
            ->markdown('mails.delivery-received', [
                'order' => $this->order,
                'proofUrl' => $this->proofUrl,
            ]);
    }
}
