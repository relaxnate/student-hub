// Every IPC channel used in this application is defined here.
// Both the main process handlers and the preload bridge import from this file,
// so a rename here propagates to both sides automatically.

export const IPC = {
  // Auth
  AUTH: {
    START_OAUTH:          'auth:start-oauth',
    CONNECT_WITH_TOKEN:   'auth:connect-with-token',
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
