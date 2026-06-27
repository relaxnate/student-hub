import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL, CURRENT_SCHEMA_VERSION, SIMULATION_TABLES_SQL, REMINDER_TABLES_SQL, WIDGET_TABLES_SQL, AI_TABLES_SQL } from './schema'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return _db
}

export function initDb(): Database.Database {
  const userDataPath = app.getPath('userData')
  const dbDir = path.join(userDataPath, 'data')
  const dbPath = path.join(dbDir, 'student-hub.db')

  // Ensure the data directory exists
  fs.mkdirSync(dbDir, { recursive: true })

  const db = new Database(dbPath)

  // Enable WAL mode — significantly better read performance with concurrent access
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -32000')   // 32MB page cache

  // Create any tables that don't exist yet (idempotent — CREATE TABLE IF NOT
  // EXISTS throughout). Note this does NOT add new columns to tables that
  // already exist on an upgraded install — that's what the migrations below
  // are for.
  db.exec(CREATE_TABLES_SQL)

  // Run any pending migrations — adds columns/tables introduced in newer
  // schema versions to a pre-existing database via ALTER TABLE.
  runMigrations(db)

  // Only now create indexes. This MUST run after migrations: an index on a
  // column that was just added by a migration (e.g. assignments.assignment_group_id)
  // would fail with "no such column" if it ran before the migration that adds
  // that column to a pre-existing assignments table.
  db.exec(CREATE_INDEXES_SQL)

  _db = db

  console.log(`[DB] Initialized at ${dbPath}`)
  return db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
    console.log('[DB] Closed')
  }
}

// ─── Migration runner ────────────────────────────────────────────────────────
// Migrations are incremental SQL functions keyed by schema version number.
// Each migration runs exactly once, guarded by the user_version pragma.

type MigrationFn = (db: Database.Database) => void

const MIGRATIONS: Record<number, MigrationFn> = {
  // Version 1 is the initial schema — no migration needed, handled by CREATE_TABLES_SQL above.
  // v2: add LMS-computed grade columns to courses (CREATE TABLE IF NOT EXISTS in
  // CREATE_TABLES_SQL only handles brand-new installs — existing DBs need an explicit ALTER).
  2: (db) => {
    const cols = db.prepare(`PRAGMA table_info(courses)`).all() as { name: string }[]
    const names = new Set(cols.map(c => c.name))
    if (!names.has('current_score')) db.exec('ALTER TABLE courses ADD COLUMN current_score REAL')
    if (!names.has('current_grade')) db.exec('ALTER TABLE courses ADD COLUMN current_grade TEXT')
  },
  // v3: assignment groups, what-if scores, weighted-grade support.
  // The two new tables (assignment_groups, what_if_scores) are handled by
  // CREATE_TABLES_SQL's CREATE TABLE IF NOT EXISTS on fresh installs. For existing
  // databases we only need to ADD the new columns to courses, assignments, quizzes.
  3: (db) => {
    const colNames = (table: string) =>
      new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name))

    const courseNames = colNames('courses')
    if (!courseNames.has('apply_group_weights')) {
      db.exec(`ALTER TABLE courses ADD COLUMN apply_group_weights INTEGER NOT NULL DEFAULT 0`)
    }

    const assignNames = colNames('assignments')
    if (!assignNames.has('assignment_group_id')) {
      // FK constraint omitted in ALTER TABLE — SQLite silently ignores FK
      // clauses in ALTER TABLE anyway; enforcement happens at DML time.
      db.exec(`ALTER TABLE assignments ADD COLUMN assignment_group_id TEXT`)
    }

    const quizCols = colNames('quizzes')
    if (!quizCols.has('html_url')) {
      db.exec(`ALTER TABLE quizzes ADD COLUMN html_url TEXT`)
    }
    // assignment_groups and what_if_scores are new tables — created by CREATE_TABLES_SQL IF NOT EXISTS
  },
  // v4: Academic Outcome Simulator. Two new tables (simulation_scenarios,
  // simulation_scores) — no column changes to existing tables. CREATE_TABLES_SQL
  // already creates them on fresh installs; we re-run the identical DDL here
  // (idempotent, IF NOT EXISTS) so an upgrading database also gets them, mirroring
  // how v3 introduced its new tables. Indexes are added by CREATE_INDEXES_SQL.
  4: (db) => {
    db.exec(SIMULATION_TABLES_SQL)
  },
  // v5: Calendar reminders + OS-notification scheduling. Two new tables
  // (reminders, scheduled_notifications) — no column changes to existing tables.
  // CREATE_TABLES_SQL already creates them on fresh installs; re-run the identical
  // idempotent DDL here so an upgrading database also gets them. Indexes added by
  // CREATE_INDEXES_SQL after migrations.
  5: (db) => {
    db.exec(REMINDER_TABLES_SQL)
  },
  // v6: Dashboard widget system. Three new tables (widget_layouts,
  // widget_instances, user_widget_assets) — no column changes to existing tables.
  // Idempotent IF NOT EXISTS DDL re-run for upgrading databases; indexes added by
  // CREATE_INDEXES_SQL after migrations.
  6: (db) => {
    db.exec(WIDGET_TABLES_SQL)
  },
  // v7: AI Helper subsystem. Five new tables (ai_provider_keys, ai_usage,
  // ai_conversations, ai_messages, ai_preferences) — no column changes to
  // existing tables. Idempotent IF NOT EXISTS DDL re-run for upgrading
  // databases; indexes added by CREATE_INDEXES_SQL after migrations.
  7: (db) => {
    db.exec(AI_TABLES_SQL)
  },
  // v8: AI Helper chat management — adds an archive flag to conversations so users
  // can archive chats for later (vs. delete). New column on an existing table, so
  // an explicit ALTER for upgrading databases (CREATE_TABLES_SQL already includes
  // it for fresh installs). Guarded so re-runs don't fail if the column exists.
  8: (db) => {
    const cols = db.prepare(`PRAGMA table_info(ai_conversations)`).all() as { name: string }[]
    if (!cols.some(c => c.name === 'is_archived')) {
      db.exec(`ALTER TABLE ai_conversations ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`)
    }
  },
}

function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  if (currentVersion >= CURRENT_SCHEMA_VERSION) return

  // Run migrations sequentially from currentVersion + 1 up to CURRENT_SCHEMA_VERSION
  const runInTransaction = db.transaction((from: number, to: number) => {
    for (let v = from + 1; v <= to; v++) {
      const migration = MIGRATIONS[v]
      if (migration) {
        console.log(`[DB] Running migration to version ${v}`)
        migration(db)
      }
    }
    db.pragma(`user_version = ${to}`)
  })

  runInTransaction(currentVersion, CURRENT_SCHEMA_VERSION)
  console.log(`[DB] Schema is at version ${CURRENT_SCHEMA_VERSION}`)
}
