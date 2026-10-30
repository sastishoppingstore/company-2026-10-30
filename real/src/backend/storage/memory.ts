import { TABLE_NAMES } from '../schema.ts'
import type { Row, Storage } from '../storage.ts'

/**
 * Last-resort in-memory store. Used only when IndexedDB is unavailable
 * (private browsing / blocked storage). Data is lost on reload, so the UI
 * surfaces a banner when this adapter is active.
 */
export class MemoryStorage implements Storage {
  private tables = new Map<string, Map<string, Row>>()
  private blobs = new Map<string, string>()

  async init(): Promise<void> {
    for (const name of TABLE_NAMES) this.tables.set(name, new Map())
  }

  private table(name: string): Map<string, Row> {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)!
  }

  async all<T extends Row>(table: string): Promise<T[]> {
    return Array.from(this.table(table).values()) as T[]
  }

  async get<T extends Row>(table: string, id: string): Promise<T | undefined> {
    return this.table(table).get(id) as T | undefined
  }

  async insert<T extends Row>(table: string, row: T): Promise<T> {
    this.table(table).set(row.id, row)
    return row
  }

  async update<T extends Row>(table: string, id: string, patch: Partial<T>): Promise<T> {
    const next = { ...(this.table(table).get(id) ?? {}), ...patch, id } as unknown as T
    this.table(table).set(id, next)
    return next
  }

  async remove(table: string, id: string): Promise<void> {
    this.table(table).delete(id)
  }

  async find<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T | undefined> {
    return (await this.all<T>(table)).find(predicate)
  }

  async filter<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T[]> {
    return (await this.all<T>(table)).filter(predicate)
  }

  async count(table: string): Promise<number> {
    return this.table(table).size
  }

  async putBlob(key: string, data: string): Promise<void> {
    this.blobs.set(key, data)
  }

  async getBlob(key: string): Promise<string | null> {
    return this.blobs.get(key) ?? null
  }
}
