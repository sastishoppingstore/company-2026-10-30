import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:signature/signature.dart';

/// Captures the receiver's signature and returns PNG bytes.
class SignatureCapture extends StatefulWidget {
  const SignatureCapture({super.key, required this.onCaptured});

  final void Function(Uint8List? bytes) onCaptured;

  @override
  State<SignatureCapture> createState() => _SignatureCaptureState();
}

class _SignatureCaptureState extends State<SignatureCapture> {
  late final SignatureController _controller;

  @override
  void initState() {
    super.initState();
    _controller = SignatureController(
      penStrokeWidth: 2.5,
      penColor: const Color(0xFF0F2242),
      exportBackgroundColor: Colors.white,
      onDrawStart: () => widget.onCaptured(null),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('Receiver signature',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const Spacer(),
            TextButton(
              onPressed: () {
                _controller.clear();
                widget.onCaptured(null);
              },
              child: const Text('Clear'),
            ),
          ],
        ),
        Container(
          height: 180,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE3E9F2)),
            borderRadius: BorderRadius.circular(12),
            color: Colors.white,
          ),
          clipBehavior: Clip.antiAlias,
          child: Signature(
            controller: _controller,
            backgroundColor: Colors.white,
            height: 180,
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Capture signature'),
          onPressed: () async {
            final bytes = await _controller.toPngBytes();
            widget.onCaptured(bytes);
          },
        ),
      ],
    );
  }
}
