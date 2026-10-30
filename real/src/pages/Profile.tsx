import { useEffect, useState } from 'react'
import { Building2, KeyRound, Lock, Save, ShieldCheck, UserCog } from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import type { Company } from '../lib/types'
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Skeleton, useToast } from '../components/ui'

export function Profile() {
  const { user, company, refresh } = useAuth()
  const { push } = useToast()
  const [form, setForm] = useState({
    name: company?.name ?? '', phone: company?.phone ?? '', address: company?.address ?? '',
    city: company?.city ?? '', email: company?.email ?? '', gst_number: company?.gst_number ?? '',
  })
  const [stats, setStats] = useState({ total: 0, delivered: 0, active: 0, cancelled: 0 })
  const [passwords, setPasswords] = useState({ current_password: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name, phone: company.phone, address: company.address,
        city: company.city, email: company.email, gst_number: company.gst_number,
      })
    }
  }, [company])

  useEffect(() => {
    api.get<{ stats: typeof stats }>('/profile').then((result) => setStats(result.stats)).catch(() => undefined)
  }, [])

  const isAdmin = user?.role === 'company_admin'

  const saveCompany = async () => {
    setSaving(true)
    setErrors({})
    try {
      await api.put('/profile', form)
      push({ tone: 'success', title: 'Company profile updated', message: 'The change is recorded in the audit trail.' })
      await refresh()
    } catch (err) {
      if (err instanceof ApiClientError) setErrors(err.fieldErrors())
      push({ tone: 'danger', title: 'Could not save', message: err instanceof Error ? err.message : 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    setPasswordSaving(true)
    setErrors({})
    try {
      await api.put('/profile/password', passwords)
      setPasswords({ current_password: '', password: '' })
      push({ tone: 'success', title: 'Password changed', message: 'Use the new password the next time you sign in.' })
    } catch (err) {
      if (err instanceof ApiClientError) setErrors(err.fieldErrors())
      push({ tone: 'danger', title: 'Could not change password', message: err instanceof Error ? err.message : 'Please try again.' })
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Company profile &amp; settings</h1>
        <p className="mt-1 text-sm text-slate-500">Organisation details, account security and delivery statistics.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader icon={Building2} title="Company details" subtitle={isAdmin ? 'Visible on every order, email and proof record' : 'Only a company administrator can edit these details'} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Company name" required error={errors.name}>
                <Input value={form.name} disabled={!isAdmin} invalid={Boolean(errors.name)} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </Field>
              <Field label="Company code" hint="Assigned by the platform">
                <Input value={company?.code ?? ''} disabled />
              </Field>
              <Field label="Contact phone" required error={errors.phone}>
                <Input value={form.phone} disabled={!isAdmin} invalid={Boolean(errors.phone)} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </Field>
              <Field label="Operations email" required error={errors.email}>
                <Input type="email" value={form.email} disabled={!isAdmin} invalid={Boolean(errors.email)} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
              </Field>
              <Field label="Registered address" required error={errors.address} className="sm:col-span-2">
                <Input value={form.address} disabled={!isAdmin} invalid={Boolean(errors.address)} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
              </Field>
              <Field label="City" required error={errors.city}>
                <Input value={form.city} disabled={!isAdmin} invalid={Boolean(errors.city)} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} />
              </Field>
              <Field label="GST / tax number" error={errors.gst_number}>
                <Input value={form.gst_number} disabled={!isAdmin} invalid={Boolean(errors.gst_number)} onChange={(event) => setForm((prev) => ({ ...prev, gst_number: event.target.value }))} />
              </Field>
            </div>
            {isAdmin ? (
              <div className="flex justify-end border-t border-hairline bg-slate-50/60 px-5 py-3.5">
                <Button icon={Save} loading={saving} onClick={() => void saveCompany()}>Save changes</Button>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader icon={KeyRound} title="Change password" subtitle="Passwords are stored as PBKDF2-SHA256 hashes" />
            <div className="space-y-4 p-5">
              {errors.current_password ? <Alert tone="danger">{errors.current_password}</Alert> : null}
              {errors.password ? <Alert tone="danger">{errors.password}</Alert> : null}
              <Field label="Current password" required>
                <Input type="password" value={passwords.current_password} onChange={(event) => setPasswords((prev) => ({ ...prev, current_password: event.target.value }))} />
              </Field>
              <Field label="New password" required hint="Minimum 8 characters.">
                <Input type="password" value={passwords.password} onChange={(event) => setPasswords((prev) => ({ ...prev, password: event.target.value }))} />
              </Field>
              <div className="flex justify-end">
                <Button variant="accent" loading={passwordSaving} onClick={() => void changePassword()}>Update password</Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={UserCog} title="Signed-in user" />
            <div className="space-y-3 p-5 text-[13px]">
              <Row label="Name" value={user?.name ?? '—'} />
              <Row label="Email" value={user?.email ?? '—'} mono />
              <Row label="Phone" value={user?.phone ?? '—'} mono />
              <Row label="Role" value={user?.role?.replace(/_/g, ' ') ?? '—'} />
              <Row label="Company" value={company?.name ?? 'Platform'} />
              <Row label="Last sign-in" value={user?.last_login_at ? new Date(user.last_login_at).toLocaleString('en-IN') : 'This session'} />
            </div>
          </Card>

          <Card>
            <CardHeader icon={ShieldCheck} title="Delivery statistics" />
            <div className="grid grid-cols-2 gap-3 p-5">
              {[
                { label: 'Total orders', value: stats.total },
                { label: 'Delivered', value: stats.delivered },
                { label: 'Active', value: stats.active },
                { label: 'Cancelled', value: stats.cancelled },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-hairline px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="mt-0.5 text-xl font-extrabold text-navy-900">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader icon={Lock} title="Data isolation" />
            <div className="p-5">
              <p className="text-[12.5px] leading-relaxed text-slate-600">
                Every query is scoped to your company id on the server. Orders, receivers, proof files and notifications from
                other companies are never returned to your session, even if you know their identifiers.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="info">Company scoped</Badge>
                <Badge tone="success">Audit logged</Badge>
                <Badge tone="neutral">Token auth</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`text-right font-semibold text-navy-900 ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</span>
    </div>
  )
}
