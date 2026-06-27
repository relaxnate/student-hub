import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  StartOAuthPayload,
  CalendarRangePayload,
  AppPreferences,
  SetPreferencesPayload,
  IPCResult,
  Integration,
  IntegrationProvider,
  Course,
  Module,
  ModuleItem,
  Assignment,
  AssignmentGroup,
  CourseFile,
  CoursePage,
  Quiz,
  Grade,
  CalendarEvent,
  Reminder,
  ReminderOccurrence,
  CreateReminderInput,
  WidgetLayout,
  WidgetInstance,
  UserWidgetAsset,
  SyncProgress,
  WhatIfScore,
  GetPageByUrlPayload,
  SetWhatIfScorePayload,
  GradeRescueReport,
  UpdateState,
  SimulationScenario,
  SimulationScore,
  CreateScenarioPayload,
  RenameScenarioPayload,
  SetSimulationScorePayload,
  AIProvider,
  AIConversation,
  AIMessage,
  AIUsage,
  UsageFraction,
  ModelInfo,
  StreamParams,
  StreamChunkEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  ToolCallEvent,
  ToolResultEvent,
  ApplyFileEditPayload,
  MascotSkin,
  PDFProposal,
  PDFConfirmPayload,
  PDFPickResult,
  PDFAnswerPayload,
  PDFVisionPayload,
  PDFVisionAnchor,
  PDFStampPayload,
} from '@shared/types/ipc'

// ─── The API surface exposed to the renderer ──────────────────────────────────
// Nothing beyond what is declared here can touch Node.js or Electron APIs.
// Keep this surface as narrow as possible.

const api = {
  // ─── Auth ───────────────────────────────────────────────────────────────
  auth: {
    // Personal Access Token — the student path, no admin setup required
    connectWithToken: (payload: {
      provider: IntegrationProvider
      baseUrl:  string
      token:    string
    }): Promise<IPCResult<Integration>> =>
      ipcRenderer.invoke(IPC.AUTH.CONNECT_WITH_TOKEN, payload),

    // Calendar feed (.ics) — universal "paste your feed URL" connect
    connectCalendarFeed: (payload: {
      feedUrl: string
      label?:  string
    }): Promise<IPCResult<Integration>> =>
      ipcRenderer.invoke(IPC.AUTH.CONNECT_CALENDAR_FEED, payload),

    // OAuth — for Google Classroom / Teams (requires app registration)
    startOAuth: (payload: StartOAuthPayload): Promise<IPCResult<Integration>> =>
      ipcRenderer.invoke(IPC.AUTH.START_OAUTH, payload),

    logout: (integrationId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AUTH.LOGOUT, integrationId),

    getIntegrations: (): Promise<IPCResult<Integration[]>> =>
      ipcRenderer.invoke(IPC.AUTH.GET_INTEGRATIONS),

    // Map of OAuth provider → whether it's configured (connectable) in this build.
    getOAuthStatus: (): Promise<IPCResult<Record<string, boolean>>> =>
      ipcRenderer.invoke(IPC.AUTH.OAUTH_STATUS),
  },

  // ─── Sync ───────────────────────────────────────────────────────────────
  sync: {
    startAll: (): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.SYNC.START_ALL),

    startIntegration: (integrationId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.SYNC.START_INTEGRATION, integrationId),

    getStatus: (integrationId: string): Promise<IPCResult<{ isSyncing: boolean }>> =>
      ipcRenderer.invoke(IPC.SYNC.GET_STATUS, integrationId),

    // Event subscriptions — return an unsubscribe function
    onProgress: (cb: (progress: SyncProgress) => void): (() => void) => {
      const handler = (_: unknown, p: SyncProgress) => cb(p)
      ipcRenderer.on(IPC.SYNC.PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.SYNC.PROGRESS, handler)
    },

    onComplete: (cb: (data: { integrationId: string }) => void): (() => void) => {
      const handler = (_: unknown, d: { integrationId: string }) => cb(d)
      ipcRenderer.on(IPC.SYNC.COMPLETE, handler)
      return () => ipcRenderer.removeListener(IPC.SYNC.COMPLETE, handler)
    },

    onError: (cb: (data: { integrationId: string; error: string }) => void): (() => void) => {
      const handler = (_: unknown, d: { integrationId: string; error: string }) => cb(d)
      ipcRenderer.on(IPC.SYNC.ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.SYNC.ERROR, handler)
    },
  },

  // ─── Courses ────────────────────────────────────────────────────────────
  courses: {
    getAll: (): Promise<IPCResult<Course[]>> =>
      ipcRenderer.invoke(IPC.COURSES.GET_ALL),

    // All courses across every synced semester -- for Grade & GPA Calculator
    getAllIncludingInactive: (): Promise<IPCResult<Course[]>> =>
      ipcRenderer.invoke(IPC.COURSES.GET_ALL_INCLUDING_INACTIVE),

    getById: (id: string): Promise<IPCResult<Course>> =>
      ipcRenderer.invoke(IPC.COURSES.GET_BY_ID, id),
  },

  // ─── Modules ────────────────────────────────────────────────────────────
  modules: {
    getByCourse: (courseId: string): Promise<IPCResult<Module[]>> =>
      ipcRenderer.invoke(IPC.MODULES.GET_BY_COURSE, courseId),

    getItems: (moduleId: string): Promise<IPCResult<ModuleItem[]>> =>
      ipcRenderer.invoke(IPC.MODULES.GET_ITEMS, moduleId),
  },

  // ─── Assignments ────────────────────────────────────────────────────────
  assignments: {
    getByCourse: (courseId: string): Promise<IPCResult<Assignment[]>> =>
      ipcRenderer.invoke(IPC.ASSIGNMENTS.GET_BY_COURSE, courseId),

    getById: (id: string): Promise<IPCResult<Assignment>> =>
      ipcRenderer.invoke(IPC.ASSIGNMENTS.GET_BY_ID, id),

    getUpcoming: (): Promise<IPCResult<Assignment[]>> =>
      ipcRenderer.invoke(IPC.ASSIGNMENTS.GET_UPCOMING),

    getOverdue: (): Promise<IPCResult<Assignment[]>> =>
      ipcRenderer.invoke(IPC.ASSIGNMENTS.GET_OVERDUE),
  },

  // ─── Grades ─────────────────────────────────────────────────────────────
  grades: {
    getByCourse: (courseId: string): Promise<IPCResult<Grade[]>> =>
      ipcRenderer.invoke(IPC.GRADES.GET_BY_COURSE, courseId),

    getByAssignment: (assignmentId: string): Promise<IPCResult<Grade | null>> =>
      ipcRenderer.invoke(IPC.GRADES.GET_BY_ASSIGNMENT, assignmentId),
  },

  // ─── Assignment Groups ──────────────────────────────────────────────────
  assignmentGroups: {
    getByCourse: (courseId: string): Promise<IPCResult<AssignmentGroup[]>> =>
      ipcRenderer.invoke(IPC.ASSIGNMENT_GROUPS.GET_BY_COURSE, courseId),
  },

  // ─── Pages ──────────────────────────────────────────────────────────────
  pages: {
    getByCourse: (courseId: string): Promise<IPCResult<CoursePage[]>> =>
      ipcRenderer.invoke(IPC.PAGES.GET_BY_COURSE, courseId),

    getById: (id: string): Promise<IPCResult<CoursePage>> =>
      ipcRenderer.invoke(IPC.PAGES.GET_BY_ID, id),

    getByUrl: (payload: GetPageByUrlPayload): Promise<IPCResult<CoursePage>> =>
      ipcRenderer.invoke(IPC.PAGES.GET_BY_URL, payload),
  },

  // ─── Quizzes ────────────────────────────────────────────────────────────
  quizzes: {
    getByCourse: (courseId: string): Promise<IPCResult<Quiz[]>> =>
      ipcRenderer.invoke(IPC.QUIZZES.GET_BY_COURSE, courseId),

    getById: (id: string): Promise<IPCResult<Quiz>> =>
      ipcRenderer.invoke(IPC.QUIZZES.GET_BY_ID, id),
  },

  // ─── What-If Scores (Grade & GPA Calculator) ───────────────────────────
  whatIf: {
    getAll: (): Promise<IPCResult<WhatIfScore[]>> =>
      ipcRenderer.invoke(IPC.WHATIF.GET_ALL),

    set: (payload: SetWhatIfScorePayload): Promise<IPCResult<WhatIfScore>> =>
      ipcRenderer.invoke(IPC.WHATIF.SET, payload),

    clearCourse: (courseId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.WHATIF.CLEAR_COURSE, courseId),

    clearAll: (): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.WHATIF.CLEAR_ALL),
  },

  // ─── Academic Outcome Simulator ──────────────────────────────────────────
  simulation: {
    getScenarios: (): Promise<IPCResult<SimulationScenario[]>> =>
      ipcRenderer.invoke(IPC.SIMULATION.GET_SCENARIOS),

    createScenario: (payload: CreateScenarioPayload): Promise<IPCResult<SimulationScenario>> =>
      ipcRenderer.invoke(IPC.SIMULATION.CREATE_SCENARIO, payload),

    deleteScenario: (id: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.SIMULATION.DELETE_SCENARIO, id),

    renameScenario: (payload: RenameScenarioPayload): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.SIMULATION.RENAME_SCENARIO, payload),

    getScores: (scenarioId: string): Promise<IPCResult<SimulationScore[]>> =>
      ipcRenderer.invoke(IPC.SIMULATION.GET_SCORES, scenarioId),

    setScore: (payload: SetSimulationScorePayload): Promise<IPCResult<SimulationScore>> =>
      ipcRenderer.invoke(IPC.SIMULATION.SET_SCORE, payload),

    clearScenario: (scenarioId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.SIMULATION.CLEAR_SCENARIO, scenarioId),
  },

  // ─── Calendar ───────────────────────────────────────────────────────────
  calendar: {
    getRange: (payload: CalendarRangePayload): Promise<IPCResult<CalendarEvent[]>> =>
      ipcRenderer.invoke(IPC.CALENDAR.GET_RANGE, payload),
  },

  // ─── Reminders (local user-created) ───────────────────────────────────────
  reminders: {
    getRange: (payload: { startDate: string; endDate: string }): Promise<IPCResult<ReminderOccurrence[]>> =>
      ipcRenderer.invoke(IPC.REMINDERS.GET_RANGE, payload),
    getAll: (): Promise<IPCResult<Reminder[]>> =>
      ipcRenderer.invoke(IPC.REMINDERS.GET_ALL),
    create: (input: CreateReminderInput): Promise<IPCResult<Reminder>> =>
      ipcRenderer.invoke(IPC.REMINDERS.CREATE, input),
    update: (payload: CreateReminderInput & { id: string }): Promise<IPCResult<Reminder>> =>
      ipcRenderer.invoke(IPC.REMINDERS.UPDATE, payload),
    delete: (id: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.REMINDERS.DELETE, id),
  },

  // ─── Dashboard widgets ────────────────────────────────────────────────────
  widgets: {
    getLayout: (): Promise<IPCResult<WidgetLayout>> =>
      ipcRenderer.invoke(IPC.WIDGETS.GET_LAYOUT),
    saveLayout: (patch: { mode?: WidgetLayout['mode']; layoutJson?: string }): Promise<IPCResult<WidgetLayout>> =>
      ipcRenderer.invoke(IPC.WIDGETS.SAVE_LAYOUT, patch),
    getInstances: (): Promise<IPCResult<WidgetInstance[]>> =>
      ipcRenderer.invoke(IPC.WIDGETS.GET_INSTANCES),
    saveInstance: (instance: WidgetInstance): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.WIDGETS.SAVE_INSTANCE, instance),
    removeInstance: (id: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.WIDGETS.REMOVE_INSTANCE, id),
    uploadAsset: (): Promise<IPCResult<UserWidgetAsset | null>> =>
      ipcRenderer.invoke(IPC.WIDGETS.UPLOAD_ASSET),
    getAssets: (): Promise<IPCResult<UserWidgetAsset[]>> =>
      ipcRenderer.invoke(IPC.WIDGETS.GET_ASSETS),
    deleteAsset: (id: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.WIDGETS.DELETE_ASSET, id),
  },

  // ─── OS notification events ───────────────────────────────────────────────
  notifications: {
    // Fires when the user clicks an OS notification; payload routes the UI.
    onNavigate: (cb: (payload: { route: string }) => void): (() => void) => {
      const handler = (_: unknown, p: unknown) => cb(p as { route: string })
      ipcRenderer.on(IPC.NOTIFICATIONS.NAVIGATE, handler)
      return () => ipcRenderer.removeListener(IPC.NOTIFICATIONS.NAVIGATE, handler)
    },
  },

  // ─── Files ──────────────────────────────────────────────────────────────
  files: {
    getByCourse: (courseId: string): Promise<IPCResult<CourseFile[]>> =>
      ipcRenderer.invoke(IPC.FILES.GET_BY_COURSE, courseId),

    open: (fileId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.FILES.OPEN, fileId),

    revealInExplorer: (fileId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.FILES.REVEAL_IN_EXPLORER, fileId),

    download: (fileId: string): Promise<IPCResult<{ localPath: string }>> =>
      ipcRenderer.invoke(IPC.FILES.DOWNLOAD, fileId),

    cancelDownload: (fileId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.FILES.CANCEL_DOWNLOAD, fileId),

    deleteLocal: (fileId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.FILES.DELETE_LOCAL, fileId),

    onDownloadProgress: (cb: (p: {
      fileId: string; received: number; total: number | null; done: boolean;
      localPath: string | null; error: string | null
    }) => void): (() => void) => {
      const handler = (_: unknown, p: unknown) => cb(p as Parameters<typeof cb>[0])
      ipcRenderer.on('files:download-progress', handler)
      return () => ipcRenderer.removeListener('files:download-progress', handler)
    },
  },

  // ─── Obsidian ────────────────────────────────────────────────────────────
  obsidian: {
    syncAll: (): Promise<IPCResult<{
      coursesExported: number; assignmentsExported: number; filesWritten: number; errors: string[]
    }>> =>
      ipcRenderer.invoke(IPC.OBSIDIAN.SYNC_ALL),

    syncCourse: (courseId: string): Promise<IPCResult<{ assignments: number; files: number }>> =>
      ipcRenderer.invoke(IPC.OBSIDIAN.SYNC_COURSE, courseId),

    chooseVaultPath: (): Promise<IPCResult<string | null>> =>
      ipcRenderer.invoke(IPC.OBSIDIAN.CHOOSE_VAULT_PATH),
  },

  // ─── AI Helper ────────────────────────────────────────────────────────────
  ai: {
    getProviders: (): Promise<IPCResult<AIProvider[]>> =>
      ipcRenderer.invoke(IPC.AI.GET_PROVIDERS),

    getModels: (provider: string): Promise<IPCResult<ModelInfo[]>> =>
      ipcRenderer.invoke(IPC.AI.GET_MODELS, provider),

    saveKey: (provider: string, key: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.SAVE_KEY, { provider, key }),

    deleteKey: (provider: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.DELETE_KEY, provider),

    validateKey: (provider: string, key: string): Promise<IPCResult<{ ok: boolean; error?: string }>> =>
      ipcRenderer.invoke(IPC.AI.VALIDATE_KEY, { provider, key }),

    startStream: (params: StreamParams): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.START_STREAM, params),

    cancelStream: (streamId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.CANCEL_STREAM, streamId),

    // Apply a proposed file edit (re-validated in main before writing).
    applyFileEdit: (payload: ApplyFileEditPayload): Promise<IPCResult<{ path: string }>> =>
      ipcRenderer.invoke(IPC.AI.APPLY_FILE_EDIT, payload),

    // Streaming event subscriptions — each returns an unsubscribe function.
    onStreamChunk: (cb: (data: StreamChunkEvent) => void): (() => void) => {
      const handler = (_: unknown, d: StreamChunkEvent) => cb(d)
      ipcRenderer.on(IPC.AI.STREAM_CHUNK, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_CHUNK, handler)
    },
    onStreamDone: (cb: (data: StreamDoneEvent) => void): (() => void) => {
      const handler = (_: unknown, d: StreamDoneEvent) => cb(d)
      ipcRenderer.on(IPC.AI.STREAM_DONE, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_DONE, handler)
    },
    onStreamError: (cb: (data: StreamErrorEvent) => void): (() => void) => {
      const handler = (_: unknown, d: StreamErrorEvent) => cb(d)
      ipcRenderer.on(IPC.AI.STREAM_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_ERROR, handler)
    },
    onToolCall: (cb: (data: ToolCallEvent) => void): (() => void) => {
      const handler = (_: unknown, d: ToolCallEvent) => cb(d)
      ipcRenderer.on(IPC.AI.STREAM_TOOL_CALL, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_TOOL_CALL, handler)
    },
    onToolResult: (cb: (data: ToolResultEvent) => void): (() => void) => {
      const handler = (_: unknown, d: ToolResultEvent) => cb(d)
      ipcRenderer.on(IPC.AI.STREAM_TOOL_RESULT, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_TOOL_RESULT, handler)
    },
    removeStreamListeners: (): void => {
      ipcRenderer.removeAllListeners(IPC.AI.STREAM_CHUNK)
      ipcRenderer.removeAllListeners(IPC.AI.STREAM_DONE)
      ipcRenderer.removeAllListeners(IPC.AI.STREAM_ERROR)
      ipcRenderer.removeAllListeners(IPC.AI.STREAM_TOOL_CALL)
      ipcRenderer.removeAllListeners(IPC.AI.STREAM_TOOL_RESULT)
    },

    getConversations: (): Promise<IPCResult<AIConversation[]>> =>
      ipcRenderer.invoke(IPC.AI.GET_CONVERSATIONS),

    getConversation: (id: string): Promise<IPCResult<AIConversation>> =>
      ipcRenderer.invoke(IPC.AI.GET_CONVERSATION, id),

    getMessages: (conversationId: string): Promise<IPCResult<AIMessage[]>> =>
      ipcRenderer.invoke(IPC.AI.GET_MESSAGES, conversationId),

    deleteConversation: (id: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.DELETE_CONVERSATION, id),

    deleteAllConversations: (): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.DELETE_ALL_CONVERSATIONS),

    archiveConversation: (id: string, archived: boolean): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.ARCHIVE_CONVERSATION, { id, archived }),

    getUsageFraction: (): Promise<IPCResult<UsageFraction>> =>
      ipcRenderer.invoke(IPC.AI.GET_USAGE_FRACTION),

    getUsageHistory: (provider?: string): Promise<IPCResult<AIUsage[]>> =>
      ipcRenderer.invoke(IPC.AI.GET_USAGE_HISTORY, provider),

    getPreferences: (): Promise<IPCResult<Record<string, string>>> =>
      ipcRenderer.invoke(IPC.AI.GET_AI_PREFERENCES),

    setPreference: (key: string, value: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AI.SET_AI_PREFERENCE, { key, value }),

    getSkins: (): Promise<IPCResult<MascotSkin[]>> =>
      ipcRenderer.invoke(IPC.AI.GET_SKINS),
  },

  // ─── PDF intelligence ──────────────────────────────────────────────────────
  pdf: {
    pick: (): Promise<IPCResult<PDFPickResult | null>> =>
      ipcRenderer.invoke(IPC.PDF.PICK),
    analyzeFillable: (payload: { filePath: string; mode: 'autofill' | 'help' }): Promise<IPCResult<PDFProposal>> =>
      ipcRenderer.invoke(IPC.PDF.ANALYZE_FILLABLE, payload),
    answer: (payload: PDFAnswerPayload): Promise<IPCResult<string[]>> =>
      ipcRenderer.invoke(IPC.PDF.ANSWER, payload),
    visionAnswer: (payload: PDFVisionPayload): Promise<IPCResult<PDFVisionAnchor[]>> =>
      ipcRenderer.invoke(IPC.PDF.VISION_ANSWER, payload),
    stamp: (payload: PDFStampPayload): Promise<IPCResult<{ path: string }>> =>
      ipcRenderer.invoke(IPC.PDF.STAMP, payload),
    confirmApply: (payload: PDFConfirmPayload): Promise<IPCResult<{ path: string }>> =>
      ipcRenderer.invoke(IPC.PDF.CONFIRM_APPLY, payload),
    open: (filePath: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.PDF.OPEN, filePath),
    reveal: (filePath: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.PDF.REVEAL, filePath),
  },

  // ─── Grade Rescue Mode ───────────────────────────────────────────────────
  gradeRescue: {
    getAll: (): Promise<IPCResult<GradeRescueReport[]>> =>
      ipcRenderer.invoke(IPC.GRADE_RESCUE.GET_ALL),
  },

  // ─── Academic Export Suite ───────────────────────────────────────────────
  export: {
    saveMarkdown: (payload: { filename: string; content: string }): Promise<IPCResult<string | null>> =>
      ipcRenderer.invoke(IPC.EXPORT.SAVE_MARKDOWN, payload),
    savePdf: (payload: { filename: string; html: string }): Promise<IPCResult<string | null>> =>
      ipcRenderer.invoke(IPC.EXPORT.SAVE_PDF, payload),
  },

  // ─── Auto-updater ─────────────────────────────────────────────────────────
  updater: {
    check:    (): Promise<IPCResult<null>>        => ipcRenderer.invoke(IPC.UPDATER.CHECK),
    download: (): Promise<IPCResult<null>>        => ipcRenderer.invoke(IPC.UPDATER.DOWNLOAD),
    install:  (): Promise<IPCResult<null>>        => ipcRenderer.invoke(IPC.UPDATER.INSTALL),
    getState: (): Promise<IPCResult<UpdateState>> => ipcRenderer.invoke(IPC.UPDATER.GET_STATE),

    // Subscribe to status changes; returns an unsubscribe fn.
    onStatus: (cb: (state: UpdateState) => void): (() => void) => {
      const handler = (_: unknown, s: UpdateState) => cb(s)
      ipcRenderer.on(IPC.UPDATER.STATUS, handler)
      return () => ipcRenderer.removeListener(IPC.UPDATER.STATUS, handler)
    },
  },

  // ─── App ────────────────────────────────────────────────────────────────
  app: {
    getVersion: (): Promise<IPCResult<string>> =>
      ipcRenderer.invoke(IPC.APP.GET_VERSION),

    openExternal: (url: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.APP.OPEN_EXTERNAL, url),

    getPreferences: (): Promise<IPCResult<AppPreferences>> =>
      ipcRenderer.invoke(IPC.APP.GET_PREFERENCES),

    setPreferences: (patch: SetPreferencesPayload): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.APP.SET_PREFERENCES, patch),

    chooseBackgroundImage: (): Promise<IPCResult<string | null>> =>
      ipcRenderer.invoke(IPC.APP.CHOOSE_BACKGROUND_IMAGE),

    chooseVaultPath: (): Promise<IPCResult<string | null>> =>
      ipcRenderer.invoke(IPC.APP.CHOOSE_VAULT_PATH),

    // Scales the entire Chromium viewport (correct Electron UI zoom, no layout breakage)
    setZoomFactor: (factor: number): void => webFrame.setZoomFactor(factor),

    minimize: (): void => ipcRenderer.send(IPC.APP.MINIMIZE_WINDOW),
    maximize: (): void => ipcRenderer.send(IPC.APP.MAXIMIZE_WINDOW),
    close:    (): void => ipcRenderer.send(IPC.APP.CLOSE_WINDOW),

    isMaximized: (): Promise<IPCResult<boolean>> =>
      ipcRenderer.invoke(IPC.APP.IS_MAXIMIZED),
  },
}

// Expose to renderer as window.api
contextBridge.exposeInMainWorld('api', api)

// TypeScript declaration for the renderer (consumed by src/preload/api.d.ts)
export type API = typeof api
