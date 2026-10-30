// Storage port. The API core never talks to a database directly, which keeps
// the exact same business rules testable against SQLite (node) and usable
// against IndexedDB (browser).

export type Row = Record<string, any>

export interface Storage {
  /** Create schema if missing and apply seed data when the database is empty. */
  init(): Promise<void>
  all<T extends Row>(table: string): Promise<T[]>
  get<T extends Row>(table: string, id: string): Promise<T | undefined>
  insert<T extends Row>(table: string, row: T): Promise<T>
  update<T extends Row>(table: string, id: string, patch: Partial<T>): Promise<T>
  remove(table: string, id: string): Promise<void>
  find<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T | undefined>
  filter<T extends Row>(table: string, predicate: (row: T) => boolean): Promise<T[]>
  count(table: string): Promise<number>
  /** Raw payload storage (signature / photo blobs). */
  putBlob(key: string, data: string): Promise<void>
  getBlob(key: string): Promise<string | null>
}
