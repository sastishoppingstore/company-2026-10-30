# RNA Ship — Flutter client (reference implementation)

Android-first mobile client for the RNA Ship delivery platform. It talks to exactly the same
API as the web client (and the driver / Super Admin apps).

## Run

```bash
flutter pub get
flutter run -d <android-device> --dart-define=API_BASE_URL=https://api.rnaship.test/api/v1
```

Add the location permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

## What is implemented

| Screen | File |
| --- | --- |
| Sign in / session | `lib/screens/login_screen.dart`, `lib/core/session.dart` |
| Company dashboard | `lib/screens/dashboard_screen.dart` |
| Create order wizard + OTP confirmation | `lib/screens/create_order_screen.dart` |
| Order history, search, filters | `lib/screens/orders_screen.dart` |
| Order details, timeline, cancellation | `lib/screens/order_detail_screen.dart` |
| Live tracking map (OpenStreetMap) | `lib/screens/tracking_screen.dart` |
| Delivery proof viewer | `lib/screens/proof_screen.dart` |
| Company profile & password | `lib/screens/profile_screen.dart` |
| OTP widget / signature capture | `lib/widgets/otp_field.dart`, `lib/widgets/signature_pad.dart` |
| HTTP + auth client | `lib/core/api_client.dart` |

The driver companion screens (offer acceptance, live trip, arrival, delivery-OTP verification and
proof capture) follow the same structure and call the driver endpoints
(`/driver/jobs/*`, `/driver/orders/*/location`, `/driver/orders/*/deliver`).
