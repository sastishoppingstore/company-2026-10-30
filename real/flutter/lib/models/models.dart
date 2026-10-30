/// Lightweight models mirroring the API payloads.
class ShipmentOrder {
  ShipmentOrder.fromJson(Map<String, dynamic> json)
      : id = json['id'] as String,
        orderCode = json['order_code'] as String? ?? '',
        companyId = json['company_id'] as String?,
        shopName = json['shop_name'] as String? ?? '',
        shopCode = json['shop_code'] as String? ?? '',
        status = json['status'] as String? ?? 'DRAFT',
        priority = json['priority'] as String? ?? 'STANDARD',
        pickupAddress = json['pickup_address'] as String? ?? '',
        destinationAddress = json['destination_address'] as String? ?? '',
        receiverName = json['receiver_name'] as String? ?? '',
        receiverPhone = json['receiver_phone'] as String? ?? '',
        itemDescription = json['item_description'] as String? ?? '',
        quantity = (json['quantity'] as num?)?.toInt() ?? 1,
        weightKg = (json['weight_kg'] as num?)?.toDouble(),
        specialInstructions = json['special_instructions'] as String? ?? '',
        requestedDeliveryAt = json['requested_delivery_at'] as String?,
        distanceKm = (json['distance_km'] as num?)?.toDouble() ?? 0,
        etaMinutes = (json['eta_minutes'] as num?)?.toInt() ?? 0,
        createdAt = json['created_at'] as String?;

  final String id;
  final String orderCode;
  final String? companyId;
  final String shopName;
  final String shopCode;
  final String status;
  final String priority;
  final String pickupAddress;
  final String destinationAddress;
  final String receiverName;
  final String receiverPhone;
  final String itemDescription;
  final int quantity;
  final double? weightKg;
  final String specialInstructions;
  final String? requestedDeliveryAt;
  final double distanceKm;
  final int etaMinutes;
  final String? createdAt;

  bool get isActive => const [
        'ACCEPTED',
        'PICKED_UP',
        'IN_TRANSIT',
        'ARRIVED_AT_SHOP',
        'OTP_VERIFIED',
      ].contains(status);

  bool get canCancelDirectly =>
      const ['DRAFT', 'PENDING_ASSIGNMENT', 'OFFERED'].contains(status);
}

class Shop {
  Shop.fromJson(Map<String, dynamic> json)
      : id = json['id'] as String,
        code = json['code'] as String? ?? '',
        name = json['name'] as String? ?? '',
        address = json['address'] as String? ?? '',
        city = json['city'] as String? ?? '',
        phone = json['phone'] as String? ?? '',
        lat = (json['lat'] as num?)?.toDouble() ?? 0,
        lng = (json['lng'] as num?)?.toDouble() ?? 0,
        isDemo = json['is_demo'] == true;

  final String id;
  final String code;
  final String name;
  final String address;
  final String city;
  final String phone;
  final double lat;
  final double lng;
  final bool isDemo;
}

class ShopReceiver {
  ShopReceiver.fromJson(Map<String, dynamic> json)
      : id = json['id'] as String,
        name = json['name'] as String? ?? '',
        phone = json['phone'] as String? ?? '',
        role = json['role'] as String? ?? 'Receiver',
        isPrimary = json['is_primary'] == true;

  final String id;
  final String name;
  final String phone;
  final String role;
  final bool isPrimary;
}

class OrderEvent {
  OrderEvent.fromJson(Map<String, dynamic> json)
      : id = json['id'] as String,
        type = json['type'] as String? ?? '',
        message = json['message'] as String? ?? '',
        actorName = json['actor_name'] as String? ?? '',
        createdAt = json['created_at'] as String?;

  final String id;
  final String type;
  final String message;
  final String actorName;
  final String? createdAt;
}

class DriverLocation {
  DriverLocation.fromJson(Map<String, dynamic> json)
      : lat = (json['lat'] as num?)?.toDouble() ?? 0,
        lng = (json['lng'] as num?)?.toDouble() ?? 0,
        recordedAt = json['recorded_at'] as String?;

  final double lat;
  final double lng;
  final String? recordedAt;
}
