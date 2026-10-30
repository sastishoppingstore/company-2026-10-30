import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/session.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const RnaShipApp());
}

class RnaShipApp extends StatelessWidget {
  const RnaShipApp({super.key});

  @override
  Widget build(BuildContext context) {
    final api = ApiClient();

    return ChangeNotifierProvider<Session>(
      create: (_) => Session(api),
      child: MaterialApp(
        title: 'RNA Ship',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF2E6BFF),
            primary: const Color(0xFF0F2242),
            secondary: const Color(0xFF2E6BFF),
          ),
          scaffoldBackgroundColor: const Color(0xFFF4F7FB),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFF0F2242),
            foregroundColor: Colors.white,
            elevation: 0,
            centerTitle: false,
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE3E9F2)),
            ),
          ),
          cardTheme: CardTheme(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: Color(0xFFE3E9F2)),
            ),
          ),
        ),
        home: const _Gate(),
      ),
    );
  }
}

class _Gate extends StatelessWidget {
  const _Gate();

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();

    if (!session.isRestored) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return session.isAuthenticated ? const DashboardScreen() : const LoginScreen();
  }
}
