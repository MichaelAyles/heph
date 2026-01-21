/**
 * PHAESTUS Graph Types
 *
 * Local type declarations for Cloudflare Workers types
 * used by the phaestus-graph when running in the browser context.
 */

/**
 * D1Database interface for Cloudflare D1
 * This is a minimal subset of the actual D1Database interface
 * sufficient for the phaestus-graph operations.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<D1Result>
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  dump(): Promise<ArrayBuffer>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run<T = unknown>(): Promise<D1Result<T>>
  all<T = unknown>(): Promise<D1Result<T>>
  raw<T = unknown>(options?: D1RawOptions): Promise<T[]>
}

export interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  error?: string
  meta: {
    changed_db: boolean
    changes: number
    duration: number
    last_row_id: number
    rows_read: number
    rows_written: number
    size_after: number
  }
}

export interface D1RawOptions {
  columnNames: boolean
}
