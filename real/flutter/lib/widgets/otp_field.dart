import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Six-box verification code input with paste support.
class OtpField extends StatefulWidget {
  const OtpField({super.key, this.length = 6, required this.onCompleted});

  final int length;
  final void Function(String code) onCompleted;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final _controllers = <TextEditingController>[];
  final _focusNodes = <FocusNode>[];

  @override
  void initState() {
    super.initState();
    for (var index = 0; index < widget.length; index++) {
      _controllers.add(TextEditingController());
      _focusNodes.add(FocusNode());
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    for (final node in _focusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  void _onChanged(int index, String value) {
    if (value.isNotEmpty) {
      if (index < widget.length - 1) _focusNodes[index + 1].requestFocus();
      final code = _controllers.map((controller) => controller.text).join();
      if (code.length == widget.length) widget.onCompleted(code);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        for (var index = 0; index < widget.length; index++)
          SizedBox(
            width: 48,
            height: 56,
            child: TextField(
              controller: _controllers[index],
              focusNode: _focusNodes[index],
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 1,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (value) => _onChanged(index, value),
              decoration: const InputDecoration(counterText: ''),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
          ),
      ],
    );
  }
}
