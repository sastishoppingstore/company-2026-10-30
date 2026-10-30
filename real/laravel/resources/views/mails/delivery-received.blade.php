@component('mail::message')
# Order {{ $order->order_code }} received at {{ $order->shop_name }}

Your shipment was handed over and verified by the delivery OTP.

| Detail | Value |
| --- | --- |
| Order ID | {{ $order->order_code }} |
| Shop | {{ $order->shop_name }} ({{ $order->shop_code }}) |
| Delivered at | {{ optional($order->delivered_at)->toDayDateTimeString() ?? 'just now' }} |
| Received by | {{ $order->receiver_name }} |
| Items | {{ $order->quantity }} × {{ $order->item_description }} |

@component('mail::button', ['url' => $proofUrl])
View delivery proof
@endcomponent

The link opens a signed, expiring proof page. Sign in to view the signature and delivery photograph.
Identity images are not attached to email by default.

Thanks,<br>
{{ config('app.name') }}
@endcomponent
