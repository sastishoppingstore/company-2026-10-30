/// Global configuration. Point [apiBaseUrl] at the Laravel API deployment.
///
///   flutter run --dart-define=API_BASE_URL=https://api.rnaship.test/api/v1
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000/api/v1', // Android emulator → host machine
  );

  static const otpTestMode = bool.fromEnvironment('OTP_TEST_MODE', defaultValue: true);

  /// How often the driver app posts a GPS fix while a job is active.
  static const locationInterval = Duration(seconds: 5);

  /// Fallback poll interval for the company tracking screen.
  static const trackingPollInterval = Duration(seconds: 10);
}
