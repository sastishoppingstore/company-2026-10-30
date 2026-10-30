import { useEffect, useRef } from 'react'

export function OtpInput({
  value, onChange, onComplete, disabled, length = 6,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  length?: number
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const setAt = (index: number, char: string) => {
    const clean = char.replace(/\D/g, '')
    if (!clean) return
    const next = value.padEnd(length, ' ').split('')
    next[index] = clean[0]
    const joined = next.join('').trimEnd()
    onChange(joined)
    if (index < length - 1) inputs.current[index + 1]?.focus()
    if (joined.length === length) onComplete?.(joined)
  }

  const handleKey = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (value[index]) {
        const next = value.split('')
        next[index] = ''
        onChange(next.join('').trimEnd())
      } else if (index > 0) {
        const next = value.split('')
        next[index - 1] = ''
        onChange(next.join('').trimEnd())
        inputs.current[index - 1]?.focus()
      }
    }
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus()
    if (event.key === 'ArrowRight' && index < length - 1) inputs.current[index + 1]?.focus()
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!text) return
    onChange(text)
    if (text.length === length) onComplete?.(text)
    else inputs.current[text.length]?.focus()
  }

  return (
    <div className="flex gap-2 sm:gap-2.5">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(element) => { inputs.current[index] = element }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          disabled={disabled}
          value={value[index] ?? ''}
          onChange={(event) => setAt(index, event.target.value)}
          onKeyDown={(event) => handleKey(index, event)}
          onPaste={handlePaste}
          aria-label={`Digit ${index + 1}`}
          className="h-14 w-full min-w-0 rounded-xl border border-hairline bg-white text-center font-mono text-xl font-bold text-navy-900 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50"
        />
      ))}
    </div>
  )
}
