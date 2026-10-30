import { DatabaseSync } from 'node:sqlite'
import { SCHEMA, columnType } from '../schema.ts'
import type { Row, Storage } from '../storage.ts'

const SQL_TYPE: Record<string, string> = {
  text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', json: 'TEXT',
}

function encode(value: unknown, type: string): unknown {
  if (value === undefined || value === null) return null
  if (type === 'json') return JSON.stringify(value)
  if (type === 'bool') return value ? 1 : 0
  return value
}

function decode(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null
  if (type === 'json') {
    try { return JSON.parse(String(value)) } catch { return null }
  }
  if (type === 'bool') return Number(value) === 1
  return value
}

/** Real SQL persistence (node:sqlite) — used by the Express API server and the test-suite. */
export class SqliteStorage implements Storage {
  private db: DatabaseSync

  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
  }

  async init(): Promise<void> {
    for (const table of SCHEMA) {
      const cols = Object.entries(table.columns)
        .map(([name, type]) => `"${name}" ${SQL_TYPE[type]}`)
        .join(', ')
      this.db.exec(`CREATE TABLE IF NOT EXISTS "${table.name}" (${cols})`)
    }
    this.db.exec('CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, data TEXT)')
  }

  async all<T extends Row>(table: string): Promise<T[]> {
    const rows = this.db.prepare(`SELECT * FROM "${table}"`).all() as Row[]
    const def = SCHEMA.find((t) => t.name === table)
    return rows.map((r) => decodeRow(r, def?.columns ?? {})) as T[]
  }

  async get<T extends Row>(table: string, id: string): Promise<T | undefined> {
    const row = this.db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Row | undefined
    if (!row) return undefined
    const def = SCHEMA.find((t) => t.name === table)
    return decodeRow(row, def?.columns ?? {}) as T
  }

  async insert<T extends Row>(table: string, row: T): Promise<T> {
    const def = SCHEMA.find((t) => t.name === table)
    const columns = Object.keys(row).filter((c) => (def?.columns ?? {})[c])
    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    const values = columns.map((c) => encode(row[c], (def?.columns ?? {})[c] ?? columnType(table, c)))
    this.db.prepare(sql).run(...(values as any[]))
    return row
  }

  async update<T extends Row>(table: string, id: string, patch: Partial<T>): Promise<T> {
    const def = SCHEMA.find((t) => t.name === table)
    const columns = Object.keys(patch).filter((c) => (def?.columns ?? {})[c])
    if (columns.length) {
      const sql = `UPDATE "${table}" SET ${columns.map((c) => `"${c}" = ?`).join(', ')} WHERE id = ?`
      const values = columns.map((c) => encode(patch[c], (def?.columns ?? {})[c]))
      this.db.prepare(sql).run(...(values as any[]), id)
    }
    const updated = await this.get<T>(table, id)
    if (!updated) throw new Error(`Row ${id} not found in ${table}`)
    return updated
  }

  async remove(table: string, id: string): Promise<void> {
    this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id)
  }

  async find<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T | undefined> {
    return (await this.all<T>(table)).find(predicate)
  }

  async filter<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T[]> {
    return (await this.all<T>(table)).filter(predicate)
  }

  async count(table: string): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as { c: number }
    return Number(row.c)
  }

  async putBlob(key: string, data: string): Promise<void> {
    this.db.prepare('INSERT INTO blobs (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(key, data)
  }

  async getBlob(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT data FROM blobs WHERE key = ?').get(key) as { data: string } | undefined
    return row ? row.data : null
  }
}

function decodeRow(row: Row, columns: Record<string, string>): Row {
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] = decode(value, columns[key] ?? 'text')
  }
  return out
}
