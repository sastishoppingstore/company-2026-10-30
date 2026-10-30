/**
 * Standalone API server.
 *
 * Runs the exact same domain core that powers the browser client
 * (`src/backend/api.ts`) against a real SQL database (node:sqlite). Point the
 * web/mobile clients at it by setting `VITE_API_BASE_URL=http://localhost:8787`.
 *
 *   npm run api            # http://localhost:8787/api/v1
 *   npm run build && npm run api   # also serves the built SPA from /dist
 */
import express from 'express'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { Api } from '../src/backend/api.ts'
import { SqliteStorage } from '../src/backend/storage/sqlite.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const port = Number(process.env.PORT ?? 8787)
const databaseFile = process.env.DATABASE_FILE ?? resolve(root, 'storage/rnaship.sqlite')

const storage = new SqliteStorage(databaseFile)
const api = new Api(storage, {
  appSecret: process.env.APP_SECRET ?? 'rna-ship-dev-secret-change-in-production',
  otpTestMode: process.env.OTP_TEST_MODE !== 'false',
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 600),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN ?? 45),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  emailTransport: process.env.MAIL_TRANSPORT ?? 'smtp://smtp.rnaship.test (sandbox log transport)',
  mailFrom: process.env.MAIL_FROM ?? 'no-reply@rnaship.test',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
})

await api.init()

const app = express()
app.use(express.json({ limit: '12mb' }))

app.use('/api/v1', async (req, res) => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null
  const response = await api.handle({
    method: req.method,
    path: req.path,
    query: req.query as Record<string, string | undefined>,
    body: req.body,
    token,
    origin: `${req.protocol}://${req.get('host') ?? ''}`,
    ip: req.ip ?? '127.0.0.1',
  })
  res.status(response.status).json(response.data)
})

const dist = resolve(root, 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(resolve(dist, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`RNA Ship API listening on http://localhost:${port}/api/v1`)
  console.log(`Database: ${databaseFile}`)
})
