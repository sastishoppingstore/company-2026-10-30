import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/session.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  String? _message;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    try {
      await context.read<Session>().api.put('/profile/password', body: {
        'current_password': _current.text,
        'password': _next.text,
      });
      setState(() {
        _message = 'Password updated.';
        _current.clear();
        _next.clear();
      });
    } on ApiException catch (error) {
      setState(() => _message = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final company = session.company ?? const {};

    return Scaffold(
      appBar: AppBar(title: const Text('Company profile & settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(company['name'] as String? ?? 'Company',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text('Code: ${company['code'] ?? '—'}'),
                  Text('City: ${company['city'] ?? '—'}'),
                  Text('GST: ${company['gst_number'] ?? '—'}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Change password',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          TextField(
            controller: _current,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Current password'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _next,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password (min 8 characters)'),
          ),
          if (_message != null) ...[
            const SizedBox(height: 10),
            Text(_message!, style: const TextStyle(fontSize: 12)),
          ],
          const SizedBox(height: 14),
          FilledButton(
            onPressed: _changePassword,
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0F2242)),
            child: const Text('Update password'),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            onPressed: () async {
              await session.signOut();
              if (context.mounted) Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }
}
