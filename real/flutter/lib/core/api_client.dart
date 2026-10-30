import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'config.dart';

/// Thrown for any non-2xx API response. Mirrors the Laravel error contract:
/// `{ "message": "...", "errors": { "field": ["..."] } }`
class ApiException implements Exception {
  ApiException(this.statusCode, this.message, [this.errors = const {}]);

  final int statusCode;
  final String message;
  final Map<String, List<String>> errors;

  bool get isUnauthorised => statusCode == 401;
  bool get isRateLimited => statusCode == 429;

  String? firstError(String field) => errors[field]?.first;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? _token;

  void setToken(String? token) => _token = token;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, Map<String, dynamic>? query}) =>
      _send('POST', path, body: body, query: query);

  Future<dynamic> put(String path, {Object? body}) => _send('PUT', path, body: body);

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path').replace(
      queryParameters: query?.map((key, value) => MapEntry(key, '$value')),
    );

    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (_token != null) 'Authorization': 'Bearer $_token',
    };

    final response = switch (method) {
      'GET' => await _client.get(uri, headers: headers),
      'POST' => await _client.post(uri, headers: headers, body: jsonEncode(body ?? {})),
      'PUT' => await _client.put(uri, headers: headers, body: jsonEncode(body ?? {})),
      _ => throw ApiException(405, 'Unsupported method $method'),
    };

    final decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);

    if (response.statusCode >= 400) {
      final errors = <String, List<String>>{};
      final raw = decoded is Map ? decoded['errors'] : null;
      if (raw is Map) {
        raw.forEach((key, value) => errors['$key'] = List<String>.from(value as List));
      }
      throw ApiException(
        response.statusCode,
        (decoded is Map && decoded['message'] != null)
            ? decoded['message'].toString()
            : 'Request failed (${response.statusCode})',
        errors,
      );
    }

    return decoded;
  }

  /// Uploads a captured signature / photograph as a data URL.
  Future<dynamic> postProof(String path, Uint8List bytes, String mime) {
    final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
    return post(path, body: {'signature': dataUrl, 'photo': dataUrl});
  }
}
