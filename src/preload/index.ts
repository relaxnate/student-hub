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
  SyncProgress,
  WhatIfScore,
  GetPageByUrlPayload,
  SetWhatIfScorePayload,
  GradeRescueReport,
  UpdateState,
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

    // OAuth — for Google Classroom / Teams (requires app registration)
    startOAuth: (payload: StartOAuthPayload): Promise<IPCResult<Integration>> =>
      ipcRenderer.invoke(IPC.AUTH.START_OAUTH, payload),

    logout: (integrationId: string): Promise<IPCResult<null>> =>
      ipcRenderer.invoke(IPC.AUTH.LOGOUT, integrationId),

    getIntegrations: (): Promise<IPCResult<Integration[]>> =>
      ipcRenderer.invoke(IPC.AUTH.GET_INTEGRATIONS),
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

  // ─── Calendar ───────────────────────────────────────────────────────────
  calendar: {
    getRange: (payload: CalendarRangePayload): Promise<IPCResult<CalendarEvent[]>> =>
      ipcRenderer.invoke(IPC.CALENDAR.GET_RANGE, payload),
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
