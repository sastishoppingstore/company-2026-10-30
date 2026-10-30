# RNA Ship — Client Company Shipment App

Real-time shipment & delivery management for a client company shipping a bag of goods to a
registered shop (**RNA General Store**). Three front-ends — **Client Company**, **Driver** and
**Super Admin** — share one API, one order state machine, one OTP service and one audit trail.

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  Company app     │   │   Driver app     │   │  Super Admin app │
│  (this build)    │   │                  │   │                  │
└────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
          └──────────────────────┴──────────────────────┘
                              │  REST + WebSocket-style event bus
                    ┌─────────▼──────────┐
                    │   API core          │  auth · OTP · order state machine
                    │  (src/backend)      │  audit · proof storage · mail
                    └─────────┬──────────┘
                    ┌─────────▼──────────┐
                    │ SQL / IndexedDB     │
                    └────────────────────┘
```

## What works today (not a prototype)

* **Order lifecycle** — `DRAFT → PENDING_ASSIGNMENT → OFFERED → ACCEPTED → PICKED_UP → IN_TRANSIT →
  ARRIVED_AT_SHOP → OTP_VERIFIED → DELIVERED`, plus `CANCELLATION_REQUESTED`, `CANCELLED`,
  `DELIVERY_FAILED`, `RETURN_REQUIRED`, `ADMIN_REVIEW`.
* **Two separate, purpose-scoped OTPs** — company confirmation and shop delivery verification are
  HMAC-bound to `purpose | order | target | code`, so one code can never satisfy the other.
* **Rules enforced on the server** — a driver cannot cancel an accepted job; the company can cancel
  directly only *before* a driver accepts, and must request cancellation afterwards; the Super Admin
  approves/rejects and reassigns.
* **Live tracking** — the driver app posts real device GPS while the job is active; the company map
  polls and refreshes over a realtime event bus (`BroadcastChannel` in one browser, WebSocket-ready).
* **Proof of delivery** — receiver name + signature (canvas) + photo (camera/file), stored in
  protected storage and served only through an authorised endpoint or an expiring signed link.
* **Email** — the “order received” mail contains Order ID, shop name, delivery time and a secure proof
  link; identity images are never attached to email.
* **Isolation & audit** — every query is scoped to the authenticated company; every sensitive action is
  written to an audit log.

## Run it

```bash
npm install
npm run dev        # web client on :5173 (embedded API engine, IndexedDB persistence)
npm run build      # production build
npm test           # automated end-to-end API tests (Node test runner)
npm run api        # standalone REST API on :8787 backed by node:sqlite
```

Point any client at the standalone API with `VITE_API_BASE_URL=http://localhost:8787`.

Demo accounts (password `Password@123`):

| Role | Email | Sees |
| --- | --- | --- |
| Company admin | `admin@vantage.test` | Full company workspace, order creation, profile edit |
| Company user | `dispatcher@vantage.test` | Same workspace, read-only profile |
| Driver | `imran@drives.test` | Jobs, live trip, OTP handover, proof capture |
| Driver | `sandeep@drives.test` | Free driver (receives new offers) |
| Super Admin | `superadmin@rnaship.test` | Platform console: assignment, cancellations, audit, reports |

The demo shop **RNA General Store** (`RNA-001`, Shivaji Nagar, Pune) ships preloaded with two
registered receivers and a sample bag shipment.

## Layout

```
src/
  backend/            API core — storage port, crypto, OTP service, router, seed data
    storage/          IndexedDB (browser) · SQLite (node) · memory (fallback) adapters
  lib/                API client, domain types, formatting
  components/         UI kit, map, signature pad, photo capture, OTP input, timeline
  pages/              Company app · driver app · admin console · public proof page
  state/              Auth + toast providers
server/index.ts       Express host for the same API core (SQLite)
laravel/              Reference Laravel 10 + MySQL backend (migrations, controllers, mail, tests)
flutter/              Reference Flutter (Android-first) client
tests/api.test.ts     End-to-end API tests
docs/SETUP.md         Setup instructions for the web stack, Laravel API and Flutter app
```

## Security notes

* Passwords: PBKDF2-SHA256, 120k iterations, per-user salt.
* Sessions: 32-byte random token, only an HMAC of it is stored; 12 h expiry; revocable on logout.
* OTPs: HMAC-SHA256 hashes only (never the code), 10-minute expiry, 5-attempt cap, 45 s resend
  cooldown, 8/hour cap. The code is only surfaced by the explicitly flagged *demo test mode*.
* Proof files: never public; served through an authorised endpoint or an expiring HMAC-signed link.
* Company isolation: enforced in the API layer, not the UI; cross-company access returns `403`.
* Every login, order mutation, assignment, OTP issue and cancellation is written to `audit_logs`.

## Delivery email

Rendered by `src/backend/mailer.ts` (Laravel counterpart: `laravel/app/Mail/DeliveryReceivedMail.php`) —
Order ID, shop name, delivery time, receiver name and a signed proof link, with a clear notice that
identity images are not attached by default.
