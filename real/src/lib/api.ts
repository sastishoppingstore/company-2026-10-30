import { Api, defaultConfig } from '../backend/api'
import { IndexedDbStorage } from '../backend/storage/indexeddb'
import { MemoryStorage } from '../backend/storage/memory'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const TOKEN_KEY = 'rnaship.session.token'

export class ApiClientError extends Error {
  status: number
  errors: Record<string, string[]>

  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }

  /** Flattened field errors for inline form display. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(this.errors)) out[key] = value[0]
    return out
  }
}

export interface ApiEvent {
  type: string
  payload: any
}

const listeners = new Set<(event: ApiEvent) => void>()
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rnaship-realtime') : null

function dispatch(event: ApiEvent) {
  listeners.forEach((listener) => listener(event))
  channel?.postMessage(event)
}

if (channel) {
  channel.onmessage = (message: MessageEvent<ApiEvent>) => {
    listeners.forEach((listener) => listener(message.data))
  }
}

export function onApiEvent(handler: (event: ApiEvent) => void): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

let localApi: Api | null = null

async function getLocalApi(): Promise<Api> {
  if (!localApi) {
    let storage: IndexedDbStorage | MemoryStorage
    try {
      const indexed = new IndexedDbStorage()
      await indexed.init()
      storage = indexed
    } catch {
      console.warn('[rnaship] IndexedDB unavailable — falling back to an in-memory store for this session.')
      const memory = new MemoryStorage()
      await memory.init()
      storage = memory
    }
    const api = new Api(storage, { ...defaultConfig, otpTestMode: true }, (type, payload) => {
      dispatch({ type, payload })
    })
    await api.init()
    localApi = api
  }
  return localApi
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

export interface RequestOptions {
  body?: any
  query?: Record<string, string | number | undefined | null>
}

export async function request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') query[key] = String(value)
  }

  if (BASE_URL) {
    const url = new URL(`${BASE_URL}/api/v1${path}`)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const token = getToken()
    const response = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    if (!response.ok) {
      throw new ApiClientError(response.status, data.message ?? 'Request failed', data.errors ?? {})
    }
    return data as T
  }

  const api = await getLocalApi()
  const result = await api.handle({
    method,
    path,
    query,
    body: options.body ?? {},
    token: getToken(),
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    ip: '127.0.0.1',
  })
  if (result.status >= 400) {
    const payload = result.data ?? {}
    throw new ApiClientError(result.status, payload.message ?? 'Request failed', payload.errors ?? {})
  }
  return result.data as T
}

export const api = {
  get: <T = any>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query }),
  post: <T = any>(path: string, body?: any, query?: RequestOptions['query']) => request<T>('POST', path, { body, query }),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, { body }),
  delete: <T = any>(path: string) => request<T>('DELETE', path),
}
