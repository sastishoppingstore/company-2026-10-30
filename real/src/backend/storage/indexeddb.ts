import { SCHEMA } from '../schema.ts'
import type { Row, Storage } from '../storage.ts'

const DB_NAME = 'rnaship-db'
const DB_VERSION = 1

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Browser persistence — a real IndexedDB database (not localStorage). */
export class IndexedDbStorage implements Storage {
  private db: IDBDatabase | null = null

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const table of SCHEMA) {
        if (!db.objectStoreNames.contains(table.name)) {
          db.createObjectStore(table.name, { keyPath: 'id' })
        }
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'key' })
      }
    }
    this.db = await promisify(request)
    return this.db
  }

  async init(): Promise<void> {
    await this.open()
  }

  private async tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open()
    const transaction = db.transaction(store, mode)
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    const request = fn(transaction.objectStore(store))
    const result = await promisify(request)
    await done
    return result
  }

  async all<T extends Row>(table: string): Promise<T[]> {
    return (await this.tx<T[]>(table, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)) ?? []
  }

  async get<T extends Row>(table: string, id: string): Promise<T | undefined> {
    return await this.tx<T | undefined>(table, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)
  }

  async insert<T extends Row>(table: string, row: T): Promise<T> {
    await this.tx(table, 'readwrite', (s) => s.put(row) as IDBRequest<IDBValidKey>)
    return row
  }

  async update<T extends Row>(table: string, id: string, patch: Partial<T>): Promise<T> {
    const current = await this.get<T>(table, id)
    const next = { ...(current ?? ({} as T)), ...patch, id } as T
    await this.tx(table, 'readwrite', (s) => s.put(next) as IDBRequest<IDBValidKey>)
    return next
  }

  async remove(table: string, id: string): Promise<void> {
    await this.tx(table, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
  }

  async find<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T | undefined> {
    return (await this.all<T>(table)).find(predicate)
  }

  async filter<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T[]> {
    return (await this.all<T>(table)).filter(predicate)
  }

  async count(table: string): Promise<number> {
    return (await this.all(table)).length
  }

  async putBlob(key: string, data: string): Promise<void> {
    await this.tx('blobs', 'readwrite', (s) => s.put({ key, data }) as IDBRequest<IDBValidKey>)
  }

  async getBlob(key: string): Promise<string | null> {
    const row = await this.tx<{ key: string; data: string } | undefined>(
      'blobs', 'readonly', (s) => s.get(key) as IDBRequest<{ key: string; data: string } | undefined>,
    )
    return row?.data ?? null
  }
}
