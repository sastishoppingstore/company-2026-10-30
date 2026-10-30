import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Eye, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { api, ApiClientError } from '../lib/api'
import { Button, Field } from './ui'
import { OtpInput } from './OtpInput'

export function OtpConfirm({
  orderId, purpose, target, onVerify, onResend, disabled, hint,
}: {
  orderId: string
  purpose: 'order_confirmation' | 'delivery_verification'
  target: string
  onVerify: (code: string) => Promise<void>
  onResend?: () => Promise<void>
  disabled?: boolean
  hint?: string
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [testCode, setTestCode] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const revealTestCode = useCallback(async () => {
    setTestBusy(true)
    try {
      const result = await api.get<{ code: string }>('/otp/test-code', { order_id: orderId, purpose })
      setTestCode(result.code)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not read the test code.')
    } finally {
      setTestBusy(false)
    }
  }, [orderId, purpose])

  const submit = async (value?: string) => {
    const finalCode = (value ?? code).trim()
    if (finalCode.length !== 6) {
      setError('Enter the 6-digit verification code.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onVerify(finalCode)
      setVerified(true)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Verification failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    setError(null)
    setLoading(true)
    try {
      await onResend?.()
      setCooldown(45)
      setTestCode(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not resend the code.')
    } finally {
      setLoading(false)
    }
  }

  if (verified) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <ShieldCheck size={18} className="text-emerald-600" />
        <div>
          <p className="text-[13px] font-bold text-emerald-800">Verification successful</p>
          <p className="text-[12px] text-emerald-700">This code is now consumed and cannot be replayed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
        <KeyRound size={17} className="mt-0.5 shrink-0 text-brand-600" />
        <div>
          <p className="text-[13px] font-bold text-navy-900">
            {purpose === 'order_confirmation' ? 'Company confirmation code' : 'Delivery verification code'}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
            A 6-digit code was sent to <span className="font-mono font-semibold text-navy-800">{target}</span>.
            {hint ? ` ${hint}` : ''}
          </p>
        </div>
      </div>

      <Field label="Verification code" error={error ?? undefined}>
        <OtpInput value={code} onChange={setCode} onComplete={(value) => void submit(value)} disabled={loading || disabled} />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void submit()} loading={loading} disabled={code.length !== 6 || disabled}>
          Verify code
        </Button>
        {onResend ? (
          <Button variant="secondary" icon={RefreshCw} onClick={() => void resend()} disabled={cooldown > 0 || loading}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-wide text-amber-800">Demo test mode</p>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-900/80">
              In this environment only, the active code can be revealed for testing. Production delivery uses the
              configured SMS/e-mail provider and never returns the code in an API response.
            </p>
            {testCode ? (
              <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 font-mono text-lg font-bold tracking-[0.3em] text-navy-900 ring-1 ring-amber-300">
                {testCode}
              </p>
            ) : null}
            <Button variant="soft" size="xs" icon={Eye} className="mt-2" loading={testBusy} onClick={() => void revealTestCode()}>
              {testCode ? 'Refresh test code' : 'Reveal test code'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
