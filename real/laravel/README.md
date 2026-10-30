# RNA Ship — Laravel API (reference implementation)

Production-grade backend for the RNA Ship delivery platform, implementing exactly the same
contract as the embedded API core that powers the deployed web client.

## Install

```bash
composer install
cp .env.example .env
php artisan key:generate
# .env → DB_CONNECTION=mysql, DB_DATABASE=rnaship, DB_USERNAME=..., DB_PASSWORD=...
php artisan migrate --seed
php artisan serve
```

## Highlights

* **Token auth** (`auth:sanctum`) with company-scoped authorisation.
* **Company isolation** — `Order::forCompany()` + `Order::isVisibleTo()`; cross-company access is `403`.
* **Purpose-scoped OTPs** (`App\Services\OtpService`) — HMAC over `purpose|order|target|code`,
  configurable TTL, attempt cap, resend cooldown and hourly rate limit. Codes are never returned
  by the API (except the explicitly flagged test-mode endpoint).
* **Order state machine** (`App\Services\OrderWorkflow`) — every transition is validated, recorded
  in `order_events` and written to `audit_logs`.
* **Cancellation rules** — company may cancel directly only before acceptance; afterwards it is a
  request; the Super Admin approves/rejects and reassigns. Drivers can never cancel (409).
* **Protected proof storage** — private `proofs` disk, served only through an authorised controller
  or an expiring signed link.
* **Notifications** — database + FCM push + e-mail; `DeliveryReceivedMail` renders Order ID, shop
  name, delivery time and the secure proof link (identity images are never attached).
* **Tests** — `tests/Feature/DeliveryFlowTest.php` covers the full lifecycle, isolation and the
  cancellation rules.

## Map of the code

| Concern | File |
| --- | --- |
| Schema | `database/migrations/2024_01_01_000001_create_shipment_tables.php` |
| Seed data (RNA General Store demo) | `database/seeders/DatabaseSeeder.php` |
| Routes | `routes/api.php` |
| OTP engine | `app/Services/OtpService.php` |
| State machine | `app/Services/OrderWorkflow.php` |
| Company isolation | `app/Models/Concerns/BelongsToCompany.php`, `Order::isVisibleTo()` |
| Validation | `app/Http/Requests/StoreOrderRequest.php`, `VerifyOtpRequest.php` |
| Controllers | `app/Http/Controllers/Api/*` |
| Notifications | `app/Notifications/*` |
| E-mail template | `app/Mail/DeliveryReceivedMail.php`, `resources/views/mails/delivery-received.blade.php` |
