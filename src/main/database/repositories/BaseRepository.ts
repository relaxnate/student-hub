import Database from 'better-sqlite3'
import { getDb } from '../index'

// T is the domain entity type (e.g. Course)
// R is the raw SQLite row type (snake_case column names)
export abstract class BaseRepository<T, R extends Record<string, unknown>> {
  protected get db(): Database.Database {
    return getDb()
  }

  protected abstract get tableName(): string

  // Subclasses translate between the DB row format and the domain entity
  protected abstract fromRow(row: R): T
  protected abstract toRow(entity: Partial<T>): Partial<R>

  protected findById(id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as R | undefined
    return row ? this.fromRow(row) : undefined
  }

  protected findAll(): T[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName}`)
      .all() as R[]
    return rows.map(r => this.fromRow(r))
  }

  protected findWhere(column: keyof R, value: unknown): T[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE ${String(column)} = ?`)
      .all(value) as R[]
    return rows.map(r => this.fromRow(r))
  }

  protected upsert(entity: T): void {
    const row = this.toRow(entity as Partial<T>)
    const keys = Object.keys(row)
    const placeholders = keys.map(() => '?').join(', ')
    const updates = keys.map(k => `${k} = excluded.${k}`).join(', ')

    this.db.prepare(`
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updates}
    `).run(...Object.values(row))
  }

  // Bulk upsert inside a transaction — critical for sync performance
  protected upsertMany(entities: T[]): void {
    if (entities.length === 0) return

    const upsertOne = this.db.transaction((entity: T) => {
      this.upsert(entity)
    })

    const upsertAll = this.db.transaction((items: T[]) => {
      for (const item of items) {
        upsertOne(item)
      }
    })

    upsertAll(entities)
  }

  protected deleteById(id: string): void {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id)
  }

  protected deleteWhere(column: keyof R, value: unknown): void {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${String(column)} = ?`).run(value)
  }

  protected count(column?: keyof R, value?: unknown): number {
    if (column && value !== undefined) {
      const result = this.db
        .prepare(`SELECT COUNT(*) as n FROM ${this.tableName} WHERE ${String(column)} = ?`)
        .get(value) as { n: number }
      return result.n
    }
    const result = this.db
      .prepare(`SELECT COUNT(*) as n FROM ${this.tableName}`)
      .get() as { n: number }
    return result.n
  }
}
