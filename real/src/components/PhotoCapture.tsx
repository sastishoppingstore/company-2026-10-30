import { useRef, useState } from 'react'
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react'
import { Button } from './ui'

async function compress(file: File, maxSize = 1200, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode the image.'))
    img.src = dataUrl
  })
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return dataUrl
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export function PhotoCapture({
  onChange, label = 'Delivery photograph',
}: { onChange: (dataUrl: string | null) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file?: File | null) => {
    if (!file) return
    try {
      setError(null)
      const dataUrl = await compress(file)
      setPreview(dataUrl)
      onChange(dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the image.')
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-navy-800">
          <Camera size={14} /> {label}
        </span>
        {preview ? (
          <Button type="button" variant="ghost" size="xs" icon={Trash2} onClick={() => { setPreview(null); onChange(null); if (inputRef.current) inputRef.current.value = '' }}>
            Remove
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => { void handleFile(event.target.files?.[0] ?? null) }}
      />
      {preview ? (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <img src={preview} alt="Delivery proof preview" className="h-44 w-full object-cover" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-navy-200 bg-navy-50/60 text-navy-600 transition hover:border-brand-400 hover:bg-brand-50"
        >
          <ImageIcon size={20} />
          <span className="text-[13px] font-semibold">Capture or upload photo</span>
          <span className="text-[11px] text-slate-500">JPEG · resized on device</span>
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  )
}
