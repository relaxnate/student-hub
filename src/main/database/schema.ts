// Every table definition lives here. Schema changes require a new migration
// added to the MIGRATIONS map in ./index.ts. The schema version is stored in
// the SQLite user_version pragma.
//
// IMPORTANT — why table creation and index creation are two separate SQL
// blocks instead of one: `CREATE TABLE IF NOT EXISTS` is a no-op against an
// existing database, so when a new column is added to a table definition
// here, an existing installation's table does NOT get that column just by
// re-running this SQL — it only gets added via an explicit ALTER TABLE in a
// migration (see ./index.ts). If a CREATE INDEX referencing that new column
// ran in the same exec() call as the table definitions, it would execute
// before the migration ever got a chance to run and fail with
// "no such column" on any pre-existing database. Indexes are therefore
// created in a separate pass, after migrations have run, so every column
// they reference is guaranteed to exist by then — regardless of whether the
// install is brand new or upgrading from an older schema version.

export const CURRENT_SCHEMA_VERSION = 8

// AI Helper subsystem — provider keys, usage metering, conversations, messages,
// and AI preferences (schema v7). Standalone const so the v7 migration in
// ./index.ts can re-run the identical idempotent DDL on an existing database.
// Provider API keys are stored ENCRYPTED (safeStorage, same mechanism as Canvas
// tokens — see AIKeyService); the plaintext key is never written here.
export const AI_TABLES_SQL = `
-- ─── AI Provider Keys ──────────────────────────────────────────────────────────
-- One row per BYOK provider the user has connected. 'encrypted_key' is a
-- safeStorage-encrypted, base64-encoded API key (NEVER plaintext, NEVER sent to
-- the renderer). The built-in free tier needs no row (it uses Student Hub's own
-- funded key inside the adapter).
CREATE TABLE IF NOT EXISTS ai_provider_keys (
  provider         TEXT    PRIMARY KEY,
  encrypted_key    TEXT    NOT NULL,
  display_label    TEXT,
  added_at         INTEGER NOT NULL,
  validated_at     INTEGER,
  is_valid         INTEGER NOT NULL DEFAULT 0
);

-- ─── AI Usage ──────────────────────────────────────────────────────────────────
-- Per (provider, model, day) usage rollup. 'date_key' is a local 'YYYY-MM-DD'
-- string; the free-tier daily request cap and the BYOK budget meter both read
-- from here.
CREATE TABLE IF NOT EXISTS ai_usage (
  id               TEXT    PRIMARY KEY,
  provider         TEXT    NOT NULL,
  model            TEXT    NOT NULL,
  date_key         TEXT    NOT NULL,
  tokens_in        INTEGER NOT NULL DEFAULT 0,
  tokens_out       INTEGER NOT NULL DEFAULT 0,
  request_count    INTEGER NOT NULL DEFAULT 0,
  estimated_cost   REAL    NOT NULL DEFAULT 0,
  updated_at       INTEGER NOT NULL
);

-- ─── AI Conversations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id               TEXT    PRIMARY KEY,
  title            TEXT,
  provider         TEXT    NOT NULL,
  model            TEXT    NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  message_count    INTEGER NOT NULL DEFAULT 0,
  is_archived      INTEGER NOT NULL DEFAULT 0
);

-- ─── AI Messages ───────────────────────────────────────────────────────────────
-- Indexed on conversation_id (see CREATE_INDEXES_SQL) for fast history loads.
CREATE TABLE IF NOT EXISTS ai_messages (
  id               TEXT    PRIMARY KEY,
  conversation_id  TEXT    NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
  content          TEXT    NOT NULL,
  tool_calls       TEXT,
  tool_results     TEXT,
  tokens_used      INTEGER,
  created_at       INTEGER NOT NULL
);

-- ─── AI Preferences ────────────────────────────────────────────────────────────
-- Small KV store for AI Helper settings (active_provider, active_model,
-- byok_monthly_token_budget, mascot_skin, mascot_enabled, chat_font_size, …).
CREATE TABLE IF NOT EXISTS ai_preferences (
  key              TEXT    PRIMARY KEY,
  value            TEXT    NOT NULL,
  updated_at       INTEGER NOT NULL
);
`

// Dashboard widget system — dual-mode (grid/free) layouts, widget instances, and
// user-uploaded image assets (schema v6). Standalone const so the v6 migration in
// ./index.ts can re-run the identical idempotent DDL on an existing database.
export const WIDGET_TABLES_SQL = `
-- ─── Widget Layouts ────────────────────────────────────────────────────────────
-- One row per dashboard layout (currently a single 'default' layout). Stores the
-- active mode and the serialized react-grid-layout array for grid mode.
CREATE TABLE IF NOT EXISTS widget_layouts (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL DEFAULT 'grid' CHECK (mode IN ('grid','free')),
  layout_json TEXT NOT NULL DEFAULT '[]',
  updated_at  INTEGER NOT NULL
);

-- ─── Widget Instances ──────────────────────────────────────────────────────────
-- Each widget placed on a layout. pos_x/pos_y are GRID coordinates in grid mode
-- and PERCENT-of-canvas in free mode (so free layouts survive window resizes);
-- width/height are grid spans (grid) or pixels (free). config_json is the
-- per-instance widget configuration.
CREATE TABLE IF NOT EXISTS widget_instances (
  id          TEXT PRIMARY KEY,
  layout_id   TEXT NOT NULL REFERENCES widget_layouts(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title       TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  pos_x       REAL NOT NULL DEFAULT 0,
  pos_y       REAL NOT NULL DEFAULT 0,
  width       INTEGER NOT NULL DEFAULT 4,
  height      INTEGER NOT NULL DEFAULT 4,
  is_locked   INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- ─── User Widget Assets ────────────────────────────────────────────────────────
-- References to images the user uploads for the CustomImageWidget. file_path is
-- ALWAYS within app.getPath('userData')/widget-assets/ — never an absolute path
-- outside userData, and the file content itself is never stored in the DB.
CREATE TABLE IF NOT EXISTS user_widget_assets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  file_type  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`

// Calendar reminders + OS-notification scheduling (schema v5). Standalone const
// so the v5 migration in ./index.ts can re-run the exact same DDL on an existing
// database (idempotent IF NOT EXISTS) without duplicating/drifting definitions.
export const REMINDER_TABLES_SQL = `
-- ─── Reminders ─────────────────────────────────────────────────────────────────
-- User-created calendar reminders. Entirely local (never synced to any LMS).
-- 'date' is an ISO calendar date (YYYY-MM-DD), 'time' is a local HH:MM or NULL
-- for an all-day reminder. 'reminder_minutes_before' is how long before the
-- event the OS notification should fire. 'repeat' drives recurrence. The optional
-- course_id / assignment_id let a reminder be attached to synced Canvas data;
-- they are intentionally NOT foreign keys (a reminder must survive the deletion /
-- re-sync of the course or assignment it references).
CREATE TABLE IF NOT EXISTS reminders (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL,
  date                    TEXT NOT NULL,           -- 'YYYY-MM-DD' (local)
  time                    TEXT,                    -- 'HH:MM' local, or NULL = all-day
  reminder_minutes_before INTEGER NOT NULL DEFAULT 15,
  color                   TEXT NOT NULL DEFAULT '#6366f1',
  repeat                  TEXT NOT NULL DEFAULT 'none',  -- none|daily|weekly|monthly
  course_id               TEXT,
  assignment_id           TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

-- ─── Scheduled Notifications ───────────────────────────────────────────────────
-- The durable record of WHEN a reminder's OS notification is due to fire, so the
-- main process can recover pending notifications after a restart and avoid
-- firing the same one twice. One row per (reminder, occurrence-fire-time).
-- 'scheduled_at' is a unix-ms wall-clock instant; 'fired_at' is set once shown.
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id            TEXT PRIMARY KEY,
  reminder_id   TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  scheduled_at  INTEGER NOT NULL,
  fired_at      INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE(reminder_id, scheduled_at)
);
`

// Academic Outcome Simulator tables (schema v4). Defined as a standalone const
// so the migration in ./index.ts can re-run the exact same DDL on an existing
// database without duplicating/drifting the table definitions.
export const SIMULATION_TABLES_SQL = `
-- ─── Simulation Scenarios ──────────────────────────────────────────────────────
-- A named "what-if" scenario (e.g. "Best Case") in the Academic Outcome
-- Simulator. Entirely separate from the single-scenario what_if_scores table so
-- the Grade & GPA Calculator is never affected.
CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- ─── Simulation Scores ─────────────────────────────────────────────────────────
-- One hypothetical score per (scenario, assignment). Cascades on scenario or
-- assignment deletion.
CREATE TABLE IF NOT EXISTS simulation_scores (
  id                 TEXT PRIMARY KEY,
  scenario_id        TEXT NOT NULL REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
  assignment_id      TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  hypothetical_score REAL,
  created_at         INTEGER NOT NULL,
  UNIQUE(scenario_id, assignment_id)
);
`

export const CREATE_TABLES_SQL = `
-- ─── Integrations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id                     TEXT PRIMARY KEY,
  provider               TEXT NOT NULL,
  base_url               TEXT,
  access_token_encrypted TEXT,          -- encrypted with safeStorage
  refresh_token_encrypted TEXT,
  token_expires_at       INTEGER,
  user_id_external       TEXT,
  user_name              TEXT,
  user_email             TEXT,
  connected_at           INTEGER NOT NULL,
  last_synced_at         INTEGER,
  is_active              INTEGER NOT NULL DEFAULT 1
);

-- ─── Courses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id             TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id    TEXT NOT NULL,
  name           TEXT NOT NULL,
  course_code    TEXT,
  description    TEXT,
  color          TEXT,
  term           TEXT,
  start_date     INTEGER,
  end_date       INTEGER,
  is_active      INTEGER NOT NULL DEFAULT 1,
  current_score  REAL,    -- LMS-computed grade percentage (e.g. Canvas computed_current_score)
  current_grade  TEXT,    -- LMS-computed letter/grade-scheme label
  apply_group_weights INTEGER NOT NULL DEFAULT 0,  -- whether assignment-group weighting applies (Canvas: apply_assignment_group_weights)
  synced_at      INTEGER NOT NULL,
  UNIQUE(integration_id, external_id)
);

-- ─── Modules ─────────────────────────────────────────────────────────────────
-- Modules are the instructor-defined learning structures inside a course.
-- They are NOT the same as folders. Preserve position and hierarchy exactly.
CREATE TABLE IF NOT EXISTS modules (
  id                       TEXT PRIMARY KEY,
  course_id                TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id              TEXT NOT NULL,
  name                     TEXT NOT NULL,
  position                 INTEGER NOT NULL DEFAULT 0,
  description              TEXT,
  unlock_at                INTEGER,
  is_locked                INTEGER NOT NULL DEFAULT 0,
  completed_requirements   INTEGER NOT NULL DEFAULT 0,
  total_requirements       INTEGER NOT NULL DEFAULT 0,
  synced_at                INTEGER NOT NULL,
  UNIQUE(course_id, external_id)
);

-- ─── Module Items ─────────────────────────────────────────────────────────────
-- Each row is one ordered entry inside a module.
-- 'type' determines which entity content_id references.
CREATE TABLE IF NOT EXISTS module_items (
  id                      TEXT PRIMARY KEY,
  module_id               TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  course_id               TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id             TEXT NOT NULL,
  title                   TEXT NOT NULL,
  type                    TEXT NOT NULL, -- Assignment|Quiz|File|Page|Discussion|ExternalUrl|ExternalTool|SubHeader
  position                INTEGER NOT NULL DEFAULT 0,
  content_id              TEXT,          -- references assignment/file/page/quiz id
  url                     TEXT,          -- for ExternalUrl items
  page_url                TEXT,          -- for Page items
  completion_requirement  TEXT,          -- JSON blob
  is_completed            INTEGER NOT NULL DEFAULT 0,
  synced_at               INTEGER NOT NULL,
  UNIQUE(module_id, external_id)
);

-- ─── Assignments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id         TEXT NOT NULL,
  title               TEXT NOT NULL,
  description_html    TEXT,
  description_plain   TEXT,
  due_at              INTEGER,
  unlock_at           INTEGER,
  lock_at             INTEGER,
  points_possible     REAL,
  grading_type        TEXT NOT NULL DEFAULT 'points',
  submission_types    TEXT NOT NULL DEFAULT '[]',   -- JSON array
  allowed_extensions  TEXT NOT NULL DEFAULT '[]',   -- JSON array
  rubric              TEXT,                          -- JSON array of RubricCriterion
  has_rubric          INTEGER NOT NULL DEFAULT 0,
  is_published        INTEGER NOT NULL DEFAULT 1,
  is_muted            INTEGER NOT NULL DEFAULT 0,
  position            INTEGER,
  assignment_group_id TEXT REFERENCES assignment_groups(id) ON DELETE SET NULL,
  synced_at           INTEGER NOT NULL,
  UNIQUE(course_id, external_id)
);

-- ─── Assignment Groups ─────────────────────────────────────────────────────────
-- Canvas weights a course's final grade by assignment group (e.g. "Homework" 20%,
-- "Tests" 50%) rather than a flat points ratio when apply_group_weights is set
-- on the course. Needed to compute an accurate what-if/GPA-calculator percentage.
CREATE TABLE IF NOT EXISTS assignment_groups (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  group_weight  REAL NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  synced_at     INTEGER NOT NULL,
  UNIQUE(course_id, external_id)
);

-- ─── Assignment Attachments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_attachments (
  id           TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
  url          TEXT,
  filename     TEXT NOT NULL,
  content_type TEXT,
  size         INTEGER,
  synced_at    INTEGER NOT NULL
);

-- ─── Files ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
  filename     TEXT NOT NULL,
  display_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL DEFAULT 0,
  url          TEXT,
  local_path   TEXT,
  folder_path  TEXT NOT NULL DEFAULT '/',
  is_hidden    INTEGER NOT NULL DEFAULT 0,
  is_locked    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER,
  updated_at   INTEGER,
  synced_at    INTEGER NOT NULL,
  UNIQUE(course_id, external_id)
);

-- ─── Pages ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
  title        TEXT NOT NULL,
  body_html    TEXT,
  url          TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  edited_at    INTEGER,
  synced_at    INTEGER NOT NULL,
  UNIQUE(course_id, external_id)
);

-- ─── Quizzes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id      TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  quiz_type        TEXT NOT NULL DEFAULT 'assignment',
  due_at           INTEGER,
  unlock_at        INTEGER,
  lock_at          INTEGER,
  time_limit       INTEGER,
  allowed_attempts INTEGER,
  points_possible  REAL,
  is_published     INTEGER NOT NULL DEFAULT 1,
  html_url         TEXT,    -- deep link to open/take the quiz in Canvas
  synced_at        INTEGER NOT NULL,
  UNIQUE(course_id, external_id)
);

-- ─── Grades ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grades (
  id               TEXT PRIMARY KEY,
  assignment_id    TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  external_id      TEXT,
  score            REAL,
  points_possible  REAL,
  grade            TEXT,
  entered_grade    TEXT,
  submitted_at     INTEGER,
  graded_at        INTEGER,
  is_late          INTEGER NOT NULL DEFAULT 0,
  is_missing       INTEGER NOT NULL DEFAULT 0,
  is_excused       INTEGER NOT NULL DEFAULT 0,
  workflow_state   TEXT NOT NULL DEFAULT 'unsubmitted',
  submission_comments TEXT NOT NULL DEFAULT '[]',   -- JSON array
  synced_at        INTEGER NOT NULL,
  UNIQUE(assignment_id)
);

-- ─── Calendar Events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id             TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  course_id      TEXT REFERENCES courses(id) ON DELETE CASCADE,
  external_id    TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  start_at       INTEGER NOT NULL,
  end_at         INTEGER,
  all_day        INTEGER NOT NULL DEFAULT 0,
  event_type     TEXT NOT NULL DEFAULT 'event',
  assignment_id  TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  location       TEXT,
  synced_at      INTEGER NOT NULL,
  UNIQUE(integration_id, external_id)
);

-- ─── Sync Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id                  TEXT PRIMARY KEY,
  integration_id      TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  started_at          INTEGER NOT NULL,
  completed_at        INTEGER,
  status              TEXT NOT NULL DEFAULT 'running',
  courses_synced      INTEGER NOT NULL DEFAULT 0,
  assignments_synced  INTEGER NOT NULL DEFAULT 0,
  modules_synced      INTEGER NOT NULL DEFAULT 0,
  files_synced        INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT
);

-- ─── App Preferences ─────────────────────────────────────────────────────────
-- Single-row KV store for user preferences
CREATE TABLE IF NOT EXISTS preferences (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ─── What-If Scores (Grade Calculator) ─────────────────────────────────────────
-- Local-only hypothetical scores entered in the Grade & GPA Calculator. These are
-- NEVER sent to the LMS — purely a local scratchpad for "what would my grade be
-- if I scored X on this" scenarios. One row per assignment; a NULL score clears
-- back to using the real synced grade.
CREATE TABLE IF NOT EXISTS what_if_scores (
  assignment_id      TEXT PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
  hypothetical_score REAL,
  updated_at         INTEGER NOT NULL
);
${SIMULATION_TABLES_SQL}
${REMINDER_TABLES_SQL}
${WIDGET_TABLES_SQL}
${AI_TABLES_SQL}
`

// All indexes, run AFTER migrations (see ./index.ts initDb) so that every
// column referenced below is guaranteed to exist, whether this is a brand
// new database or one that's been upgraded from an older schema version.
export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_courses_integration_id ON courses(integration_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_active      ON courses(is_active);

CREATE INDEX IF NOT EXISTS idx_modules_course_id ON modules(course_id);
CREATE INDEX IF NOT EXISTS idx_modules_position  ON modules(course_id, position);

CREATE INDEX IF NOT EXISTS idx_module_items_module_id   ON module_items(module_id);
CREATE INDEX IF NOT EXISTS idx_module_items_course_id   ON module_items(course_id);
CREATE INDEX IF NOT EXISTS idx_module_items_content_id  ON module_items(content_id);

CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_at    ON assignments(due_at);
CREATE INDEX IF NOT EXISTS idx_assignments_group_id  ON assignments(assignment_group_id);

CREATE INDEX IF NOT EXISTS idx_assignment_groups_course_id ON assignment_groups(course_id);

CREATE INDEX IF NOT EXISTS idx_attachments_assignment_id ON assignment_attachments(assignment_id);

CREATE INDEX IF NOT EXISTS idx_files_course_id ON files(course_id);

CREATE INDEX IF NOT EXISTS idx_pages_course_id ON pages(course_id);

CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON quizzes(course_id);

CREATE INDEX IF NOT EXISTS idx_grades_course_id     ON grades(course_id);
CREATE INDEX IF NOT EXISTS idx_grades_assignment_id ON grades(assignment_id);

CREATE INDEX IF NOT EXISTS idx_calendar_start_at ON calendar_events(start_at);

CREATE INDEX IF NOT EXISTS idx_simulation_scores_scenario   ON simulation_scores(scenario_id);
CREATE INDEX IF NOT EXISTS idx_simulation_scores_assignment ON simulation_scores(assignment_id);

CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(date);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_reminder  ON scheduled_notifications(reminder_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled ON scheduled_notifications(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_widget_instances_layout ON widget_instances(layout_id);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_date   ON ai_usage(provider, date_key);
`
