import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/session.dart';

/// Live tracking view. Polls the tracking endpoint and redraws the map when the
/// driver posts a new GPS fix.
class TrackingScreen extends StatefulWidget {
  const TrackingScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  final MapController _map = MapController();

  LatLng? _driver;
  LatLng? _pickup;
  LatLng? _destination;
  List<LatLng> _trail = const [];
  String _gpsStatus = 'unavailable';
  String? _lastUpdate;
  String? _driverName;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(AppConfig.trackingPollInterval, (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<Session>().api.get('/orders/${widget.orderId}/track');
      final route = Map<String, dynamic>.from(data['route'] as Map);
      final location = data['location'] as Map?;
      final gps = Map<String, dynamic>.from(data['gps'] as Map);
      final driver = data['driver'] as Map?;

      setState(() {
        _pickup = LatLng((route['pickup'] as Map)['lat'] as double,
            (route['pickup'] as Map)['lng'] as double);
        _destination = LatLng((route['destination'] as Map)['lat'] as double,
            (route['destination'] as Map)['lng'] as double);
        if (location != null) {
          _driver = LatLng(location['lat'] as double, location['lng'] as double);
        }
        _trail = (data['trail'] as List)
            .map((item) => LatLng((item as Map)['lat'] as double, item['lng'] as double))
            .toList();
        _gpsStatus = gps['status'] as String;
        _lastUpdate = gps['last_update'] as String?;
        _driverName = driver?['name'] as String?;
      });
    } on ApiException {
      // Keep the last known position on screen.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live tracking')),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: _driver ?? _pickup ?? const LatLng(18.53, 73.83),
              initialZoom: 13,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'test.rnaship.app',
              ),
              if (_trail.length > 1)
                PolylineLayer(polylines: [
                  Polyline(points: _trail, color: const Color(0xFF2E6BFF), strokeWidth: 4),
                ]),
              MarkerLayer(markers: [
                if (_pickup != null)
                  Marker(
                    point: _pickup!,
                    width: 40,
                    height: 40,
                    child: const _Pin(color: Color(0xFF0F2242), icon: Icons.warehouse_outlined),
                  ),
                if (_destination != null)
                  Marker(
                    point: _destination!,
                    width: 40,
                    height: 40,
                    child: const _Pin(color: Color(0xFF2E6BFF), icon: Icons.storefront_outlined),
                  ),
                if (_driver != null)
                  Marker(
                    point: _driver!,
                    width: 44,
                    height: 44,
                    child: const _Pin(color: Color(0xFFF97316), icon: Icons.delivery_dining),
                  ),
              ]),
            ],
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _gpsStatus == 'live' ? Icons.gps_fixed : Icons.gps_not_fixed,
                          color: _gpsStatus == 'live' ? const Color(0xFF059669) : const Color(0xFFF59E0B),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _gpsStatus == 'live' ? 'GPS live' : 'Last known location',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text('${_driverName ?? 'Driver'} · last update ${_lastUpdate ?? '—'}',
                        style: const TextStyle(fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Pin extends StatelessWidget {
  const _Pin({required this.color, required this.icon});

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6)],
      ),
      child: Icon(icon, color: Colors.white, size: 18),
    );
  }
}
