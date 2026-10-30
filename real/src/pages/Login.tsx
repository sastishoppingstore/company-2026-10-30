import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Boxes, KeyRound, Loader2, MapPinned, Radio, ShieldCheck, Truck,
} from 'lucide-react'
import { useAuth } from '../state/AuthContext'
import { ApiClientError } from '../lib/api'
import { Button, Field, Input } from '../components/ui'

const DEMO_ACCOUNTS = [
  { label: 'Company admin', email: 'admin@vantage.test', hint: 'Vantage Trading Co.' },
  { label: 'Company user', email: 'dispatcher@vantage.test', hint: 'Vantage Trading Co.' },
  { label: 'Driver', email: 'imran@drives.test', hint: 'Driver app' },
  { label: 'Super Admin', email: 'superadmin@rnaship.test', hint: 'Platform console' },
]

export function Login() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@vantage.test')
  const [password, setPassword] = useState('Password@123')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  if (status === 'authenticated') return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
        setFieldErrors(err.fieldErrors())
      } else {
        setError('Unable to sign in right now. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------------------------------- brand panel */}
      <section className="relative hidden overflow-hidden bg-navy-950 px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-[0.35]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-brand-500/15 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-sm font-extrabold text-white shadow-[0_10px_26px_-10px_rgba(46,107,255,0.9)]">
              RNA
            </span>
            <div>
              <p className="font-display text-lg font-extrabold leading-none text-white">RNA Ship</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-navy-300">Shipment desk</p>
            </div>
          </div>

          <h1 className="mt-14 max-w-lg font-display text-[40px] font-extrabold leading-[1.08] text-white">
            Every bag delivered. <span className="text-brand-400">Proven.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-navy-200">
            Create a delivery, track the driver live, and capture proof of receipt — all from one secure workspace for your company.
          </p>

          <div className="mt-10 grid max-w-md gap-3">
            {[
              { icon: Radio, title: 'Live driver telemetry', text: 'GPS sharing while the job is active, with staleness warnings.' },
              { icon: KeyRound, title: 'Purpose-scoped OTPs', text: 'Company confirmation and shop receipt are verified separately.' },
              { icon: ShieldCheck, title: 'Audited, isolated data', text: 'Company-level isolation with a full audit trail.' },
            ].map((feature) => (
              <div key={feature.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-300">
                  <feature.icon size={16} />
                </span>
                <div>
                  <p className="text-[13px] font-bold text-white">{feature.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-navy-300">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-6 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
          <span className="flex items-center gap-1.5"><Truck size={13} /> 3 drivers online</span>
          <span className="flex items-center gap-1.5"><MapPinned size={13} /> RNA General Store</span>
          <span className="flex items-center gap-1.5"><Boxes size={13} /> 1 bag in transit</span>
        </div>
      </section>

      {/* ------------------------------------------------------------- form */}
      <section className="flex items-center justify-center bg-canvas px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-950 text-[12px] font-extrabold text-white">RNA</span>
            <div>
              <p className="font-display text-base font-extrabold leading-none text-navy-900">RNA Ship</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Shipment desk</p>
            </div>
          </div>

          <h2 className="font-display text-[26px] font-extrabold text-navy-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">Access your company shipment workspace.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Work email" required error={fieldErrors.email}>
              <Input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                invalid={Boolean(fieldErrors.email)}
              />
            </Field>
            <Field label="Password" required error={fieldErrors.password}>
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                invalid={Boolean(fieldErrors.password)}
              />
            </Field>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={loading} icon={loading ? undefined : ArrowRight}>
              Sign in
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-[13px]">
            <Link to="/reset-password" className="font-semibold text-brand-600 hover:text-brand-700">
              Forgot password?
            </Link>
            <span className="text-slate-400">Token-based session · 12h</span>
          </div>

          <div className="mt-8 rounded-2xl border border-hairline bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-bold text-navy-900">Demo accounts</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Test mode
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => { setEmail(account.email); setPassword('Password@123'); setError(null) }}
                  className="rounded-xl border border-hairline px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/60"
                >
                  <p className="text-[12px] font-bold text-navy-900">{account.label}</p>
                  <p className="truncate font-mono text-[10px] text-slate-500">{account.email}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{account.hint}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Password for all demo accounts: <span className="font-mono font-semibold text-navy-700">Password@123</span>. The driver and Super Admin accounts open the companion apps that share this same API.
            </p>
          </div>

          {loading ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-slate-500">
              <Loader2 size={13} className="animate-spin" /> Contacting API…
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
