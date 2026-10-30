# Setup instructions

## 1. Web client + embedded API (what is deployed)

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm test           # automated API tests
```

The browser client ships with an **API core** (`src/backend/api.ts`) that runs the production domain
rules in-page and persists to **IndexedDB** (a real database — `localStorage` is used only for the
session token). No server is required for the demo.

## 2. Standalone REST API (SQLite)

```bash
npm run api
# http://localhost:8787/api/v1
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `DATABASE_FILE` | `storage/rnaship.sqlite` | SQL database file |
| `APP_SECRET` | dev value | HMAC secret for tokens/OTPs — **change in production** |
| `OTP_TEST_MODE` | `true` | set `false` to disable the demo code reveal |
| `OTP_TTL_SECONDS` | `600` | OTP lifetime |
| `OTP_MAX_ATTEMPTS` | `5` | wrong-code attempts per issued code |
| `OTP_RESEND_COOLDOWN` | `45` | seconds between resends |
| `SESSION_TTL_HOURS` | `12` | session lifetime |
| `MAIL_TRANSPORT` | sandbox log transport | SMTP DSN / provider |
| `MAIL_FROM` | `no-reply@rnaship.test` | sender |
| `PUBLIC_BASE_URL` | `http://localhost:8787` | base used inside proof links |

Point the client at it:

```bash
VITE_API_BASE_URL=http://localhost:8787 npm run dev
```

The client automatically switches to HTTP mode when `VITE_API_BASE_URL` is set — the same request
code path is used in both modes.

## 3. Laravel API (MySQL) — reference implementation

`laravel/` contains a Laravel 10 API that implements the identical contract.

```bash
cd laravel
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan test            # feature tests for the delivery flow
php artisan serve           # http://localhost:8000/api/v1
```

MySQL schema (migrations in `laravel/database/migrations`): `companies`, `users`, `shops`,
`shop_receivers`, `vehicles`, `orders`, `order_events`, `otps`, `notifications`, `emails`,
`audit_logs`, `locations`, `delivery_proofs`, `driver_issues`, `sessions`, `password_resets`.

## 4. Flutter client (Android-first) — reference implementation

`flutter/` contains the mobile client sources.

```bash
cd flutter
flutter pub get
flutter run -d <android-device>
```

Configure the API base URL in `flutter/lib/core/config.dart` and add
`android/app/src/main/AndroidManifest.xml` permissions:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

## 5. API contract (identical in all three clients)

Base path `/api/v1`. Bearer token authentication.

| Method | Endpoint | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{email,password}` → `{token,user,company}` |
| POST | `/auth/logout` | revokes the session |
| GET | `/auth/me` | current session |
| POST | `/auth/password/forgot` · `/auth/password/reset` · `/auth/password/change` | recovery |
| GET | `/shops` · `/shops/{id}` | directory + registered receivers |
| POST | `/orders` | creates a `DRAFT` order (server-generated Order ID) |
| GET | `/orders` | search, status/priority/shop/date filters, pagination |
| GET | `/orders/{id}` · `/timeline` · `/track` · `/proof` | order detail, events, GPS, proof |
| POST | `/orders/{id}/submit` | issues the **company** OTP |
| POST | `/orders/{id}/confirm` | verifies the company OTP → drivers notified |
| POST | `/orders/{id}/cancel` | direct cancel (only before a driver accepts) |
| POST | `/orders/{id}/cancellation-request` | company request after acceptance |
| GET | `/otp/test-code` | **demo test mode only** — reveals the active code |
| GET | `/notifications` · `/emails` | in-app/SMS feed + email delivery status |
| GET/PUT | `/profile` | company profile and statistics |
| GET | `/driver/jobs` | offers + active job + history |
| POST | `/driver/jobs/{id}/accept` · `/decline` | offer handling |
| POST | `/driver/orders/{id}/pickup` · `/start-trip` · `/arrive` | job progression |
| POST | `/driver/orders/{id}/location` | live GPS ping |
| POST | `/driver/orders/{id}/verify-otp` | verifies the **delivery** OTP |
| POST | `/driver/orders/{id}/deliver` | `{receiver_name,signature,photo}` → `DELIVERED` |
| POST | `/driver/orders/{id}/report-issue` | driver issue → `ADMIN_REVIEW` |
| POST | `/driver/orders/{id}/cancel` | always refused — drivers may not cancel |
| GET | `/admin/orders` · `/drivers` · `/audit-logs` · `/reports/summary` | platform console |
| POST | `/admin/orders/{id}/assign` · `/cancellation/approve` · `/cancellation/reject` | admin actions |
| GET | `/public/proof/{orderId}?token=` | signed, expiring proof page |

Errors follow the Laravel shape: `{ "message": "...", "errors": { "field": ["..."] } }` with
`401` unauthenticated, `403` forbidden, `404` not found, `409` invalid state transition,
`422` validation, `429` rate limited.
