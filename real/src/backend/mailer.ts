import type { Order } from '../lib/types.ts'

const BRAND = '#0B2140'
const ACCENT = '#1E6FFF'

function shell(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#F2F5FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5FA;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
  <tr><td style="background:${BRAND};padding:22px 28px;">
    <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.02em;">RNA<span style="color:#60A5FA;">SHIP</span></div>
    <div style="color:#93C5FD;font-size:12px;margin-top:2px;">Secure shipment &amp; delivery network</div>
  </td></tr>
  <tr><td style="padding:28px;">
    <h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;color:${BRAND};">${title}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">${preheader}</p>
    ${body}
    <p style="margin:24px 0 0;font-size:12px;color:#64748B;line-height:1.6;">
      This message was generated automatically by the RNA Ship platform. Delivery proof images and signatures are not attached to email by default — use the secure link below while signed in.
    </p>
  </td></tr>
  <tr><td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 28px;font-size:11px;color:#64748B;">
    &copy; ${new Date().getFullYear()} RNA Ship · Client company shipment desk · Do not reply to this email.
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:9px 0;color:#64748B;font-size:13px;width:42%;">${label}</td>
    <td style="padding:9px 0;color:#0F172A;font-size:14px;font-weight:600;">${value}</td>
  </tr>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">${label}</a>`
}

/** Delivery-received email. Contains Order ID, shop name, delivery time and a secure proof link. */
export function renderDeliveryReceivedEmail(order: Order, proofUrl: string, actor: string): string {
  const deliveredAt = order.delivered_at ? new Date(order.delivered_at).toUTCString() : 'just now'
  const body = `
    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px 16px;font-size:14px;color:#1E3A8A;font-weight:600;margin-bottom:20px;">
      Order ${order.order_code} was received at ${order.shop_name}.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${detailRow('Order ID', order.order_code)}
      ${detailRow('Shop', `${order.shop_name} (${order.shop_code})`)}
      ${detailRow('Delivered at', deliveredAt)}
      ${detailRow('Received by', order.receiver_name)}
      ${detailRow('Items', `${order.quantity} × ${order.item_description}`)}
      ${detailRow('Delivered by', actor)}
    </table>
    <div style="margin-top:22px;">${button(proofUrl, 'View delivery proof')}</div>
    <p style="margin:12px 0 0;font-size:12px;color:#64748B;">The link opens a signed, expiring proof page. Sign in to view the signature and delivery photograph.</p>`
  return shell(
    `Order ${order.order_code} received at ${order.shop_name}`,
    `Shipment to ${order.shop_name} was handed over and verified by delivery OTP.`,
    body,
  )
}

export function renderOrderCreatedEmail(order: Order, shopName: string): string {
  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${detailRow('Order ID', order.order_code)}
      ${detailRow('Destination shop', `${shopName} (${order.shop_code})`)}
      ${detailRow('Requested delivery', new Date(order.requested_delivery_at).toUTCString())}
      ${detailRow('Priority', order.priority)}
      ${detailRow('Authorized contact', `${order.authorized_contact_name} · ${order.authorized_contact_phone}`)}
    </table>
    <p style="margin:18px 0 0;font-size:13px;color:#475569;">A confirmation OTP has been sent to the authorized contact. Submit the order from the app to start the driver workflow.</p>`
  return shell(`Delivery order ${order.order_code} created`, 'Your shipment request has been drafted and is awaiting confirmation.', body)
}

export function renderCancellationEmail(order: Order, reason: string): string {
  const body = `
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px 16px;font-size:14px;color:#991B1B;font-weight:600;margin-bottom:20px;">
      Order ${order.order_code} was cancelled.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${detailRow('Order ID', order.order_code)}
      ${detailRow('Destination shop', `${order.shop_name} (${order.shop_code})`)}
      ${detailRow('Reason', reason || '—')}
    </table>`
  return shell(`Order ${order.order_code} cancelled`, 'The shipment request has been cancelled.', body)
}

export function renderOtpEmail(code: string, order: Order, purpose: 'order_confirmation' | 'delivery_verification'): string {
  const title = purpose === 'delivery_verification' ? 'Delivery verification code' : 'Order confirmation code'
  const body = `
    <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.6;">
      ${purpose === 'delivery_verification'
        ? 'The driver is at the shop and is waiting for this code to complete the handover of order'
        : 'Use this code to confirm and submit delivery order'}<strong>${order.order_code}</strong>.
    </p>
    <div style="background:#0B2140;border-radius:12px;padding:22px;text-align:center;">
      <div style="font-size:34px;font-weight:700;letter-spacing:.32em;color:#ffffff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</div>
      <div style="color:#93C5FD;font-size:12px;margin-top:8px;">Valid for a limited time · single use</div>
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#64748B;">Never share this code. RNA Ship staff will never ask you for it.</p>`
  return shell(title, `Your verification code for order ${order.order_code}.`, body)
}

export function renderResetPasswordEmail(resetLink: string, name: string): string {
  const body = `
    <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.6;">Hello ${name}, a password reset was requested for your RNA Ship account.</p>
    <div>${button(resetLink, 'Reset password')}</div>
    <p style="margin:16px 0 0;font-size:12px;color:#64748B;">This link expires in 60 minutes. If you did not request it, you can ignore this email.</p>`
  return shell('Reset your RNA Ship password', 'Use the secure link below to choose a new password.', body)
}
