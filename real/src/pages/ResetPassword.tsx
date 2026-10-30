import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { Button, Field, Input } from '../components/ui'

export function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [stage, setStage] = useState<'request' | 'reset'>(token ? 'reset' : 'request')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const requestReset = async (event: FormEvent) => {
    event.preventDefault()
    setError(null); setMessage(null); setFieldErrors({}); setLoading(true)
    try {
      const result = await api.post<{ message: string; debug_reset_token?: string }>('/auth/password/forgot', { email })
      setMessage(result.message)
      if (result.debug_reset_token) {
        setStage('reset')
        setTokenFromDebug(result.debug_reset_token)
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send the reset link.')
    } finally {
      setLoading(false)
    }
  }

  const [activeToken, setActiveToken] = useState(token)
  function setTokenFromDebug(value: string) {
    setActiveToken(value)
  }

  const submitReset = async (event: FormEvent) => {
    event.preventDefault()
    setError(null); setMessage(null); setFieldErrors({}); setLoading(true)
    try {
      await api.post('/auth/password/reset', { token: activeToken, password, password_confirmation: confirmation })
      setMessage('Password updated. Redirecting to sign in…')
      window.setTimeout(() => navigate('/login', { replace: true }), 1600)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
        setFieldErrors(err.fieldErrors())
      } else {
        setError('Could not reset the password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-950 text-[12px] font-extrabold text-white">RNA</span>
          <div>
            <p className="font-display text-base font-extrabold leading-none text-navy-900">RNA Ship</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Account recovery</p>
          </div>
        </div>

        <div className="rounded-2xl border border-hairline bg-white p-6 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-xl font-extrabold text-navy-900">
            {stage === 'reset' ? 'Choose a new password' : 'Reset your password'}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            {stage === 'reset'
              ? 'Enter the code from your reset email and pick a new password.'
              : 'Enter your work email and we will send a signed, expiring reset link.'}
          </p>

          {stage === 'request' ? (
            <form onSubmit={requestReset} className="mt-6 space-y-4">
              <Field label="Work email" required error={fieldErrors.email}>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
              </Field>
              {message ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                  <CheckCircle2 size={16} className="mt-px shrink-0" /> {message}
                </div>
              ) : null}
              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">{error}</div> : null}
              <Button type="submit" size="lg" className="w-full" loading={loading} icon={KeyRound}>Send reset link</Button>
            </form>
          ) : (
            <form onSubmit={submitReset} className="mt-6 space-y-4">
              <Field label="Reset token" required error={fieldErrors.token} hint="Test mode surfaces the token automatically after requesting a link.">
                <Input value={activeToken} onChange={(event) => setActiveToken(event.target.value)} className="font-mono text-xs" />
              </Field>
              <Field label="New password" required error={fieldErrors.password}>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </Field>
              <Field label="Confirm new password" required error={fieldErrors.password_confirmation}>
                <Input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </Field>
              {message ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
                  <CheckCircle2 size={16} className="mt-px shrink-0" /> {message}
                </div>
              ) : null}
              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">{error}</div> : null}
              <Button type="submit" size="lg" className="w-full" loading={loading}>Update password</Button>
            </form>
          )}

          <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
