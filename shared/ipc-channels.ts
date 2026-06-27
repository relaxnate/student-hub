// Every IPC channel used in this application is defined here.
// Both the main process handlers and the preload bridge import from this file,
// so a rename here propagates to both sides automatically.

export const IPC = {
  // Auth
  AUTH: {
    START_OAUTH:          'auth:start-oauth',
    CONNECT_WITH_TOKEN:   'auth:connect-with-token',
    CONNECT_CALENDAR_FEED:'auth:connect-calendar-feed',
    OAUTH_CALLBACK:       'auth:oauth-callback',
    LOGOUT:               'auth:logout',
    GET_INTEGRATIONS:     'auth:get-integrations',
    // Which OAuth providers have a client ID configured in this build
    // (so the UI shows them as connectable vs "Coming soon").
    OAUTH_STATUS:         'auth:oauth-status',
  },

  // Sync
  SYNC: {
    START_ALL:            'sync:start-all',
    START_INTEGRATION:    'sync:start-integration',
    CANCEL:               'sync:cancel',
    GET_STATUS:           'sync:get-status',
    PROGRESS:             'sync:progress',
    COMPLETE:             'sync:complete',
    ERROR:                'sync:error',
  },

  // Courses
  COURSES: {
    // Active / current courses only -- used everywhere except the GPA Calculator
    GET_ALL:                    'courses:get-all',
    // Every synced course across all semesters -- used only by Grade & GPA Calculator
    GET_ALL_INCLUDING_INACTIVE: 'courses:get-all-including-inactive',
    GET_BY_ID:                  'courses:get-by-id',
  },

  // Modules
  MODULES: {
    GET_BY_COURSE:        'modules:get-by-course',
    GET_ITEMS:            'modules:get-items',
  },

  // Assignments
  ASSIGNMENTS: {
    GET_BY_COURSE:        'assignments:get-by-course',
    GET_BY_ID:            'assignments:get-by-id',
    GET_UPCOMING:         'assignments:get-upcoming',
    GET_OVERDUE:          'assignments:get-overdue',
  },

  // Grades
  GRADES: {
    GET_BY_COURSE:        'grades:get-by-course',
    GET_BY_ASSIGNMENT:    'grades:get-by-assignment',
  },

  // Assignment Groups
  ASSIGNMENT_GROUPS: {
    GET_BY_COURSE:        'assignment-groups:get-by-course',
  },

  // Pages
  PAGES: {
    GET_BY_COURSE:        'pages:get-by-course',
    GET_BY_ID:            'pages:get-by-id',
    GET_BY_URL:           'pages:get-by-url',
  },

  // Quizzes
  QUIZZES: {
    GET_BY_COURSE:        'quizzes:get-by-course',
    GET_BY_ID:            'quizzes:get-by-id',
  },

  // What-If Scores (Grade & GPA Calculator)
  WHATIF: {
    GET_ALL:              'whatif:get-all',
    SET:                  'whatif:set',
    CLEAR_COURSE:         'whatif:clear-course',
    CLEAR_ALL:            'whatif:clear-all',
  },

  // Academic Outcome Simulator (multi-scenario)
  SIMULATION: {
    GET_SCENARIOS:        'simulation:get-scenarios',
    CREATE_SCENARIO:      'simulation:create-scenario',
    DELETE_SCENARIO:      'simulation:delete-scenario',
    RENAME_SCENARIO:      'simulation:rename-scenario',
    GET_SCORES:           'simulation:get-scores',
    SET_SCORE:            'simulation:set-score',
    CLEAR_SCENARIO:       'simulation:clear-scenario',
  },

  // Files
  FILES: {
    GET_BY_COURSE:        'files:get-by-course',
    OPEN:                 'files:open',
    REVEAL_IN_EXPLORER:   'files:reveal',
    DOWNLOAD:             'files:download',
    CANCEL_DOWNLOAD:      'files:cancel-download',
    DELETE_LOCAL:         'files:delete-local',
  },

  // Obsidian
  OBSIDIAN: {
    SYNC_ALL:             'obsidian:sync-all',
    SYNC_COURSE:          'obsidian:sync-course',
    CHOOSE_VAULT_PATH:    'obsidian:choose-vault-path',
  },

  // Calendar
  CALENDAR: {
    GET_RANGE:            'calendar:get-range',
  },

  // Reminders (local user-created calendar reminders)
  REMINDERS: {
    GET_RANGE:            'reminders:get-range',   // by date window (YYYY-MM-DD strings)
    GET_ALL:              'reminders:get-all',
    CREATE:               'reminders:create',
    UPDATE:               'reminders:update',
    DELETE:               'reminders:delete',
  },

  // OS Notifications
  NOTIFICATIONS: {
    // main → renderer: a clicked OS notification asks the UI to navigate
    // (payload: { route: string }). Subscribed via api.notifications.onNavigate.
    NAVIGATE:             'notifications:navigate',
  },

  // Dashboard widget system (schema v6)
  WIDGETS: {
    GET_LAYOUT:           'widgets:get-layout',       // → WidgetLayout (creates default if absent)
    SAVE_LAYOUT:          'widgets:save-layout',      // { mode?, layoutJson? }
    GET_INSTANCES:        'widgets:get-instances',    // → WidgetInstance[]
    SAVE_INSTANCE:        'widgets:save-instance',    // WidgetInstance (upsert)
    REMOVE_INSTANCE:      'widgets:remove-instance',  // id
    UPLOAD_ASSET:         'widgets:upload-asset',     // opens file dialog, copies into userData → UserWidgetAsset
    GET_ASSETS:           'widgets:get-assets',       // → UserWidgetAsset[]
    DELETE_ASSET:         'widgets:delete-asset',     // id (also removes the copied file)
  },

  // AI Helper (multi-provider AI gateway, schema v7)
  AI: {
    // Provider / key management
    GET_PROVIDERS:            'ai:get-providers',
    GET_MODELS:               'ai:get-models',
    SAVE_KEY:                 'ai:save-key',
    DELETE_KEY:               'ai:delete-key',
    VALIDATE_KEY:             'ai:validate-key',

    // Chat streaming (renderer → main)
    START_STREAM:             'ai:start-stream',
    CANCEL_STREAM:            'ai:cancel-stream',
    APPLY_FILE_EDIT:          'ai:apply-file-edit',   // confirm + write a proposed file edit

    // Streaming events (main → renderer), keyed by streamId
    STREAM_CHUNK:             'ai:stream-chunk',
    STREAM_DONE:              'ai:stream-done',
    STREAM_ERROR:             'ai:stream-error',
    STREAM_TOOL_CALL:         'ai:stream-tool-call',
    STREAM_TOOL_RESULT:       'ai:stream-tool-result',

    // Conversations
    GET_CONVERSATIONS:        'ai:get-conversations',
    GET_CONVERSATION:         'ai:get-conversation',
    GET_MESSAGES:             'ai:get-messages',
    DELETE_CONVERSATION:      'ai:delete-conversation',
    DELETE_ALL_CONVERSATIONS: 'ai:delete-all-conversations',
    ARCHIVE_CONVERSATION:     'ai:archive-conversation',

    // Usage
    GET_USAGE_FRACTION:       'ai:get-usage-fraction',
    GET_USAGE_HISTORY:        'ai:get-usage-history',

    // Preferences
    GET_AI_PREFERENCES:       'ai:get-preferences',
    SET_AI_PREFERENCE:        'ai:set-preference',

    // Mascot
    GET_SKINS:                'ai:get-skins',
  },

  // PDF intelligence (AI Helper Phase 4)
  PDF: {
    ANALYZE:       'pdf:analyze',          // pick + detect + (fillable) AI-answer → proposal
    PICK:          'pdf:pick',             // pick a PDF, detect kind, return bytes (renderer analyses flat PDFs)
    ANALYZE_FILLABLE: 'pdf:analyze-fillable', // (filePath) → fillable field answers
    ANSWER:        'pdf:answer',           // (questions[]) → answers[] from the active AI provider
    VISION_ANSWER: 'pdf:vision-answer',    // (page image) → answers + anchor coords (scanned pages)
    STAMP:         'pdf:stamp',            // write stamped placements onto a flat PDF → NEW file
    CONFIRM_APPLY: 'pdf:confirm-apply',    // write the filled fillable-form PDF to a NEW file
    OPEN:          'pdf:open',             // open a saved output in the OS viewer
    REVEAL:        'pdf:reveal',           // reveal a saved output in the file explorer
  },

  // Grade Rescue Mode
  GRADE_RESCUE: {
    GET_ALL: 'grade-rescue:get-all',
  },

  // Academic Export Suite
  EXPORT: {
    SAVE_MARKDOWN: 'export:save-markdown',
    SAVE_PDF:      'export:save-pdf',
  },

  // Auto-updater
  UPDATER: {
    CHECK:     'updater:check',      // renderer → main: trigger a check
    DOWNLOAD:  'updater:download',   // renderer → main: start download
    INSTALL:   'updater:install',    // renderer → main: quit & install now
    GET_STATE: 'updater:get-state',  // renderer → main: read current state
    STATUS:    'updater:status',     // main → renderer: state changed (event)
  },

  // App / Window
  APP: {
    GET_VERSION:             'app:get-version',
    OPEN_EXTERNAL:           'app:open-external',
    SET_THEME:               'app:set-theme',
    GET_PREFERENCES:         'app:get-preferences',
    SET_PREFERENCES:         'app:set-preferences',
    MINIMIZE_WINDOW:         'app:minimize',
    MAXIMIZE_WINDOW:         'app:maximize',
    CLOSE_WINDOW:            'app:close',
    IS_MAXIMIZED:            'app:is-maximized',
    CHOOSE_BACKGROUND_IMAGE: 'app:choose-background-image',
    CHOOSE_VAULT_PATH:       'app:choose-vault-path',
  },
} as const

type LeafValues<T> = T extends string
  ? T
  : { [K in keyof T]: LeafValues<T[K]> }[keyof T]

export type IPCChannel = LeafValues<typeof IPC>
