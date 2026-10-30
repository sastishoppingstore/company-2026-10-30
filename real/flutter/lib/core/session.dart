import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Holds the bearer token plus the signed-in user and company.
class Session extends ChangeNotifier {
  Session(this.api) {
    _restore();
  }

  final ApiClient api;

  String? _token;
  Map<String, dynamic>? _user;
  Map<String, dynamic>? _company;
  bool _restored = false;

  String? get token => _token;
  Map<String, dynamic>? get user => _user;
  Map<String, dynamic>? get company => _company;
  bool get isAuthenticated => _token != null;
  bool get isRestored => _restored;
  String get role => (_user?['role'] as String?) ?? 'company_user';

  bool get isCompany => role == 'company_admin' || role == 'company_user';
  bool get isDriver => role == 'driver';
  bool get isAdmin => role == 'admin';

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
    if (_token != null) {
      api.setToken(_token);
      try {
        final data = await api.get('/auth/me');
        _user = Map<String, dynamic>.from(data['user'] as Map);
        _company = data['company'] == null ? null : Map<String, dynamic>.from(data['company'] as Map);
      } catch (_) {
        await signOut();
      }
    }
    _restored = true;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    final data = await api.post('/auth/login', body: {'email': email, 'password': password});
    _token = data['token'] as String;
    api.setToken(_token);
    _user = Map<String, dynamic>.from(data['user'] as Map);
    _company = data['company'] == null ? null : Map<String, dynamic>.from(data['company'] as Map);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', _token!);
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // The session may already be gone; always clear locally.
    }
    _token = null;
    _user = null;
    _company = null;
    api.setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    notifyListeners();
  }

  /// Reads the active code in the explicitly flagged demo test mode.
  Future<String?> testCode(String orderId, String purpose) async {
    try {
      final data = await api.get('/otp/test-code', query: {
        'order_id': orderId,
        'purpose': purpose,
      });
      return data['code'] as String?;
    } catch (_) {
      return null;
    }
  }

  @visibleForTesting
  String encodeUser() => jsonEncode(_user);
}
