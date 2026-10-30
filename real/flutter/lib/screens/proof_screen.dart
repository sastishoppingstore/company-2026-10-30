import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/session.dart';

/// Shows the captured signature and delivery photograph for a delivered order.
class ProofScreen extends StatefulWidget {
  const ProofScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<ProofScreen> createState() => _ProofScreenState();
}

class _ProofScreenState extends State<ProofScreen> {
  List<Map<String, dynamic>> _files = const [];
  String _secureLink = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<Session>().api.get('/orders/${widget.orderId}/proof');
      setState(() {
        _files = (data['files'] as List)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _secureLink = data['secure_link'] as String? ?? '';
        _loading = false;
      });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _image(String? dataUrl) {
    if (dataUrl == null || dataUrl.isEmpty) {
      return const Text('Not captured', style: TextStyle(color: Colors.white70));
    }
    final bytes = base64Decode(dataUrl.split(',').last);
    return Image.memory(bytes, fit: BoxFit.contain);
  }

  @override
  Widget build(BuildContext context) {
    final signature = _files.where((file) => file['kind'] == 'signature').firstOrNull;
    final photo = _files.where((file) => file['kind'] == 'delivery_photo').firstOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('Delivery proof')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  color: const Color(0xFF0F2242),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Verified handover',
                            style: TextStyle(
                                color: Color(0xFF93B6FF),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.2)),
                        const SizedBox(height: 6),
                        Text('Signature',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        Container(
                          height: 150,
                          color: Colors.white,
                          padding: const EdgeInsets.all(8),
                          child: _image(signature?['data_url'] as String?),
                        ),
                        const SizedBox(height: 16),
                        Text('Delivery photograph',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 10),
                        Container(
                          height: 220,
                          color: Colors.white,
                          padding: const EdgeInsets.all(8),
                          child: _image(photo?['data_url'] as String?),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.link),
                    title: const Text('Secure proof link'),
                    subtitle: Text(_secureLink,
                        maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11)),
                  ),
                ),
              ],
            ),
    );
  }
}
