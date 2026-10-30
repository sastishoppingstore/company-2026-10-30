import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, Mail, MailCheck, MailWarning, MessageSquare, Radio, RefreshCw, Send, Smartphone } from 'lucide-react'
import { api } from '../lib/api'
import { onApiEvent } from '../lib/api'
import { formatDateTime, relativeTime } from '../lib/format'
import type { AppNotification, EmailRecord } from '../lib/types'
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Skeleton, useToast } from '../components/ui'

type Tab = 'in_app' | 'email'

export function Notifications() {
  const { push } = useToast()
  const [tab, setTab] = useState<Tab>('in_app')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [emails, setEmails] = useState<EmailRecord[]>([])
  const [transport, setTransport] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<EmailRecord | null>(null)

  const load = useCallback(async () => {
    try {
      const [notificationResult, emailResult] = await Promise.all([
        api.get<{ data: AppNotification[] }>('/notifications'),
        api.get<{ data: EmailRecord[]; transport: string }>('/emails'),
      ])
      setNotifications(notificationResult.data)
      setEmails(emailResult.data)
      setTransport(emailResult.transport)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const off = onApiEvent(() => { void load() })
    return off
  }, [load])

  const markAll = async () => {
    await api.post('/notifications/read-all')
    push({ tone: 'success', title: 'Notifications cleared', message: 'All notifications marked as read.' })
    void load()
  }

  const markOne = async (id: string) => {
    await api.post(`/notifications/${id}/read`)
    void load()
  }

  const resend = async (email: EmailRecord) => {
    try {
      await api.post(`/emails/${email.id}/resend`)
      push({ tone: 'success', title: 'Email re-queued', message: `Re-delivery scheduled for ${email.to_email}.` })
      void load()
    } catch {
      push({ tone: 'danger', title: 'Could not resend', message: 'Please try again.' })
    }
  }

  const unread = notifications.filter((notification) => !notification.read_at).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            In-app alerts, SMS outbox entries and the email delivery status for your company.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={() => void load()}>Refresh</Button>
          {unread > 0 ? <Button variant="ghost" icon={CheckCheck} onClick={() => void markAll()}>Mark all read</Button> : null}
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-hairline bg-white p-1">
        {([
          { id: 'in_app' as Tab, label: `In-app & SMS (${notifications.length})` },
          { id: 'email' as Tab, label: `Email (${emails.length})` },
        ]).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-[13px] font-bold transition ${tab === item.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-navy-50 hover:text-navy-800'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
      ) : tab === 'in_app' ? (
        <Card>
          <CardHeader icon={Bell} title="Activity feed" subtitle={unread ? `${unread} unread` : 'Everything is read'} />
          {notifications.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications yet" description="Order events and OTP deliveries will show up here." />
          ) : (
            <ul className="divide-y divide-hairline">
              {notifications.map((notification) => (
                <li key={notification.id} className={`flex gap-3 px-5 py-4 transition ${notification.read_at ? '' : 'bg-brand-50/30'}`}>
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    notification.channel === 'sms' ? 'bg-amber-50 text-amber-600'
                      : notification.channel === 'email' ? 'bg-indigo-50 text-indigo-600'
                        : notification.channel === 'push' ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-brand-50 text-brand-600'
                  }`}>
                    {notification.channel === 'sms' ? <Smartphone size={15} />
                      : notification.channel === 'email' ? <Mail size={15} />
                        : notification.channel === 'push' ? <Radio size={15} />
                          : <MessageSquare size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-bold text-navy-900">{notification.title}</p>
                      <Badge tone={notification.read_at ? 'neutral' : 'info'}>{notification.channel}</Badge>
                      {!notification.read_at ? <Badge tone="warning">new</Badge> : null}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{notification.body}</p>
                    <p className="mt-1.5 text-[11px] text-slate-400">{formatDateTime(notification.created_at)} · {relativeTime(notification.created_at)}</p>
                  </div>
                  {!notification.read_at ? (
                    <Button size="xs" variant="ghost" onClick={() => void markOne(notification.id)}>Mark read</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader icon={MailCheck} title="Email delivery status" subtitle={transport ? `Transport: ${transport}` : undefined} />
          {emails.length === 0 ? (
            <EmptyState icon={Mail} title="No emails sent yet" description="Delivery confirmations and order updates are sent by email." />
          ) : (
            <ul className="divide-y divide-hairline">
              {emails.map((email) => (
                <li key={email.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${email.status === 'sent' ? 'bg-emerald-50 text-emerald-600' : email.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                    {email.status === 'sent' ? <MailCheck size={15} /> : email.status === 'failed' ? <MailWarning size={15} /> : <Send size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-navy-900">{email.subject}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
                      to {email.to_name} · <span className="font-mono">{email.to_email}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(email.created_at)}{email.sent_at ? ` · delivered ${formatDateTime(email.sent_at)}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={email.status === 'sent' ? 'success' : email.status === 'failed' ? 'danger' : 'warning'}>
                      {email.status}
                    </Badge>
                    <Button size="xs" variant="secondary" onClick={() => setPreview(email)}>View</Button>
                    <Button size="xs" variant="ghost" icon={RefreshCw} onClick={() => void resend(email)}>Resend</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.subject ?? ''}
        subtitle={preview ? `To ${preview.to_name} · ${preview.to_email}` : ''}
        size="lg"
      >
        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
              <Badge tone="success">{preview.status}</Badge>
              <span className="font-mono">{preview.provider}</span>
              {preview.secure_link ? <span className="truncate font-mono text-[10.5px]">link: {preview.secure_link}</span> : null}
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              className="h-[420px] w-full rounded-xl border border-hairline bg-white"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
