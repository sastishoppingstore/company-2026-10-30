import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import '../models/models.dart';
import '../widgets/otp_field.dart';

/// Creates a delivery order for a registered shop and confirms it with the
/// company OTP that the API issues to the authorised contact.
class CreateOrderScreen extends StatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  final _formKey = GlobalKey<FormState>();

  List<Shop> _shops = const [];
  List<ShopReceiver> _receivers = const [];
  Shop? _shop;
  ShopReceiver? _receiver;

  final _pickup = TextEditingController(
      text: 'Unit 14, Survey 42, Baner MIDC, Baner Road, Pune 411045');
  final _items = TextEditingController(text: '1 sealed bag — assorted grocery assortment');
  final _quantity = TextEditingController(text: '1');
  final _weight = TextEditingController(text: '12');
  final _instructions = TextEditingController(
      text: 'Handle with care — glass jars inside the bag.');
  final _contactName = TextEditingController(text: 'Ananya Rao');
  final _contactPhone = TextEditingController(text: '+91 98765 40021');
  DateTime _requested = DateTime.now().add(const Duration(days: 1));
  String _priority = 'STANDARD';

  bool _busy = false;
  String? _error;
  String? _createdOrderId;
  String? _createdOrderCode;

  @override
  void initState() {
    super.initState();
    _loadShops();
  }

  @override
  void dispose() {
    for (final controller in [
      _pickup, _items, _quantity, _weight, _instructions, _contactName, _contactPhone
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadShops() async {
    final data = await context.read<Session>().api.get('/shops');
    setState(() {
      _shops = (data['data'] as List)
          .map((item) => Shop.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
    });

    final demo = _shops.where((shop) => shop.isDemo).firstOrNull;
    if (demo != null) await _selectShop(demo);
  }

  Future<void> _selectShop(Shop shop) async {
    final data = await context.read<Session>().api.get('/shops/${shop.id}');
    setState(() {
      _shop = shop;
      _receivers = (data['receivers'] as List)
          .map((item) => ShopReceiver.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
      _receiver = _receivers.where((r) => r.isPrimary).firstOrNull ?? _receivers.firstOrNull;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _shop == null || _receiver == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final data = await context.read<Session>().api.post('/orders', body: {
        'shop_id': _shop!.id,
        'receiver_id': _receiver!.id,
        'pickup_address': _pickup.text,
        'item_description': _items.text,
        'quantity': int.tryParse(_quantity.text) ?? 1,
        'weight_kg': double.tryParse(_weight.text),
        'special_instructions': _instructions.text,
        'priority': _priority,
        'requested_delivery_at': _requested.toIso8601String(),
        'authorized_contact_name': _contactName.text,
        'authorized_contact_phone': _contactPhone.text,
      });

      final order = Map<String, dynamic>.from(data['order'] as Map);
      setState(() {
        _createdOrderId = order['id'] as String;
        _createdOrderCode = order['order_code'] as String;
      });

      // Request the company confirmation OTP.
      await context.read<Session>().api.post('/orders/${order['id']}/submit');
    } on ApiException catch (error) {
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify(String code) async {
    try {
      await context.read<Session>().api.post('/orders/$_createdOrderId/confirm', body: {'otp': code});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Order $_createdOrderCode confirmed — drivers notified')),
      );
      Navigator.pop(context);
    } on ApiException catch (error) {
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();

    if (_createdOrderId != null) {
      return Scaffold(
        appBar: AppBar(title: Text('Confirm $_createdOrderCode')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'A confirmation OTP was sent to the authorised contact. Enter it to release the order to the driver network.',
            ),
            const SizedBox(height: 20),
            OtpField(onCompleted: _verify),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.science_outlined),
              label: const Text('Reveal demo code'),
              onPressed: () async {
                final code = await session.testCode(_createdOrderId!, 'order_confirmation');
                if (code != null && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Test mode code: $code')),
                  );
                }
              },
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('New delivery order')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _Label('Destination shop'),
            DropdownButtonFormField<String>(
              initialValue: _shop?.id,
              items: _shops
                  .map((shop) => DropdownMenuItem(
                        value: shop.id,
                        child: Text('${shop.name} · ${shop.code}',
                            overflow: TextOverflow.ellipsis),
                      ))
                  .toList(),
              onChanged: (value) {
                final shop = _shops.firstWhere((item) => item.id == value);
                _selectShop(shop);
              },
              validator: (value) => value == null ? 'Select a shop' : null,
            ),
            const SizedBox(height: 14),
            _Label('Registered receiver'),
            DropdownButtonFormField<String>(
              initialValue: _receiver?.id,
              items: _receivers
                  .map((receiver) => DropdownMenuItem(
                        value: receiver.id,
                        child: Text('${receiver.name} · ${receiver.phone}'),
                      ))
                  .toList(),
              onChanged: (value) => setState(
                  () => _receiver = _receivers.firstWhere((item) => item.id == value)),
              validator: (value) => value == null ? 'Select a receiver' : null,
            ),
            const SizedBox(height: 20),
            _Label('Pickup address'),
            TextFormField(
              controller: _pickup,
              maxLines: 2,
              validator: (value) =>
                  (value == null || value.length < 8) ? 'Enter a complete pickup address' : null,
              decoration: const InputDecoration(hintText: 'Warehouse / collection point'),
            ),
            const SizedBox(height: 14),
            _Label('Bag / item description'),
            TextFormField(
              controller: _items,
              maxLines: 2,
              validator: (value) =>
                  (value == null || value.length < 3) ? 'Describe the shipment' : null,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Label('Quantity'),
                      TextFormField(
                        controller: _quantity,
                        keyboardType: TextInputType.number,
                        validator: (value) =>
                            (int.tryParse(value ?? '') ?? 0) < 1 ? 'Min 1' : null,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Label('Weight (kg)'),
                      TextFormField(
                        controller: _weight,
                        keyboardType: TextInputType.number,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _Label('Special instructions'),
            TextFormField(controller: _instructions, maxLines: 2),
            const SizedBox(height: 14),
            _Label('Priority'),
            DropdownButtonFormField<String>(
              initialValue: _priority,
              items: const [
                DropdownMenuItem(value: 'STANDARD', child: Text('Standard')),
                DropdownMenuItem(value: 'EXPRESS', child: Text('Express')),
                DropdownMenuItem(value: 'CRITICAL', child: Text('Critical')),
              ],
              onChanged: (value) => setState(() => _priority = value ?? 'STANDARD'),
            ),
            const SizedBox(height: 14),
            _Label('Requested delivery'),
            OutlinedButton.icon(
              icon: const Icon(Icons.event),
              label: Text(_requested.toString().substring(0, 16)),
              onPressed: () async {
                final picked = await showDatePicker(
                  context: context,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 60)),
                  initialDate: _requested,
                );
                if (picked != null) setState(() => _requested = picked);
              },
            ),
            const SizedBox(height: 14),
            _Label('Authorised contact'),
            TextFormField(
              controller: _contactName,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: (value) =>
                  (value == null || value.length < 2) ? 'Enter the contact name' : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _contactPhone,
              decoration: const InputDecoration(labelText: 'Phone (OTP target)'),
              validator: (value) =>
                  (value == null || value.length < 8) ? 'Enter a reachable number' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Color(0xFFBE123C))),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0F2242),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Create order & send OTP'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(text,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF1B3255))),
    );
  }
}
