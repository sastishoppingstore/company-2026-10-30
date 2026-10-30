import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../models/models.dart';
import 'create_order_screen.dart';
import 'orders_screen.dart';
import 'order_detail_screen.dart';
import 'profile_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<ShipmentOrder> _orders = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<Session>().api.get('/orders', query: {'per_page': 50});
      setState(() {
        _orders = (data['data'] as List)
            .map((item) => ShipmentOrder.fromJson(Map<String, dynamic>.from(item as Map)))
            .toList();
        _loading = false;
      });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final active = _orders.where((order) => order.isActive).toList();
    final drafts = _orders.where((order) => order.status == 'DRAFT').toList();
    final delivered = _orders.where((order) => order.status == 'DELIVERED').length;

    return Scaffold(
      appBar: AppBar(
        title: Text(session.company?['name'] as String? ?? 'RNA Ship'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            ),
          ),
        ],
      ),
      floatingActionButton: session.isCompany
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CreateOrderScreen()),
              ),
              icon: const Icon(Icons.add),
              label: const Text('New delivery'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Shipment desk',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('${session.user?['name'] ?? ''} · ${session.company?['code'] ?? ''}',
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      Expanded(child: _Stat(label: 'Active', value: '${active.length}')),
                      const SizedBox(width: 12),
                      Expanded(child: _Stat(label: 'Awaiting OTP', value: '${drafts.length}')),
                      const SizedBox(width: 12),
                      Expanded(child: _Stat(label: 'Delivered', value: '$delivered')),
                    ],
                  ),
                  const SizedBox(height: 24),
                  if (active.isNotEmpty) ...[
                    Text('Live delivery',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 10),
                    ...active.map((order) => Card(
                          child: ListTile(
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => OrderDetailScreen(orderId: order.id),
                              ),
                            ),
                            title: Text(order.shopName,
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text('${order.orderCode} · ${order.status.replaceAll('_', ' ')}'),
                            trailing: const Icon(Icons.chevron_right),
                          ),
                        )),
                    const SizedBox(height: 18),
                  ],
                  Row(
                    children: [
                      Text('Recent orders',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const OrdersScreen()),
                        ),
                        child: const Text('View all'),
                      ),
                    ],
                  ),
                  ..._orders.take(8).map((order) => Card(
                        child: ListTile(
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => OrderDetailScreen(orderId: order.id),
                            ),
                          ),
                          title: Text(order.shopName),
                          subtitle: Text('${order.orderCode} · ${order.itemDescription}'),
                          trailing: Text(order.status.replaceAll('_', ' '),
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                        ),
                      )),
                ],
              ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: const TextStyle(fontSize: 10, letterSpacing: .8, color: Color(0xFF64748B))),
            const SizedBox(height: 6),
            Text(value,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF0F2242))),
          ],
        ),
      ),
    );
  }
}
