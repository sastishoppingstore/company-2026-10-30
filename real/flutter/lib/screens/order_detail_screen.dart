import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../models/models.dart';
import 'proof_screen.dart';
import 'tracking_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Map<String, dynamic>? _order;
  List<OrderEvent> _events = const [];
  Map<String, dynamic> _permissions = const {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<Session>().api.get('/orders/${widget.orderId}');
      setState(() {
        _order = Map<String, dynamic>.from(data['order'] as Map);
        _events = (data['events'] as List)
            .map((item) => OrderEvent.fromJson(Map<String, dynamic>.from(item as Map)))
            .toList();
        _permissions = Map<String, dynamic>.from(data['permissions'] as Map);
        _loading = false;
      });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancel({required bool request}) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(request ? 'Request cancellation' : 'Cancel this order'),
        content: const TextField(
          maxLines: 3,
          decoration: InputDecoration(hintText: 'Reason (required)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
          FilledButton(
            onPressed: () {
              final value = context
                  .findRenderObject()!
                  .toString();
              Navigator.pop(context, value);
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (reason == null || reason.trim().length < 4) return;

    try {
      await context.read<Session>().api.post(
        '/orders/${widget.orderId}/${request ? 'cancellation-request' : 'cancel'}',
        body: {'reason': reason.trim()},
      );
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Order')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final order = ShipmentOrder.fromJson(_order!);

    return Scaffold(
      appBar: AppBar(title: Text(order.orderCode)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(order.shopName,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('${order.shopCode} · ${order.status.replaceAll('_', ' ')}'),
                  const Divider(height: 24),
                  _Row('Destination', order.destinationAddress),
                  _Row('Pickup', order.pickupAddress),
                  _Row('Receiver', '${order.receiverName} · ${order.receiverPhone}'),
                  _Row('Contents', '${order.quantity} × ${order.itemDescription}'),
                  _Row('Distance', '${order.distanceKm} km · ~${order.etaMinutes} min'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              if (order.isActive)
                FilledButton.icon(
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Track live'),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => TrackingScreen(orderId: widget.orderId)),
                  ),
                ),
              if (order.status == 'DELIVERED')
                OutlinedButton.icon(
                  icon: const Icon(Icons.verified_outlined),
                  label: const Text('Delivery proof'),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => ProofScreen(orderId: widget.orderId)),
                  ),
                ),
              if (_permissions['can_cancel'] == true)
                OutlinedButton.icon(
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text('Cancel order'),
                  onPressed: () => _cancel(request: false),
                ),
              if (_permissions['can_request_cancellation'] == true)
                OutlinedButton.icon(
                  icon: const Icon(Icons.shield_outlined),
                  label: const Text('Request cancellation'),
                  onPressed: () => _cancel(request: true),
                ),
            ],
          ),
          const SizedBox(height: 20),
          Text('Timeline',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                for (final event in _events)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.circle, size: 10, color: Color(0xFF2E6BFF)),
                    title: Text(event.message, style: const TextStyle(fontSize: 13)),
                    subtitle: Text('${event.actorName} · ${event.createdAt ?? ''}',
                        style: const TextStyle(fontSize: 11)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label,
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
