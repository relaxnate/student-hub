import type {
  Integration,
  IntegrationProvider,
  Course,
  Module,
  ModuleItem,
  Assignment,
  AssignmentAttachment,
  AssignmentGroup,
  CourseFile,
  CoursePage,
  Quiz,
  Grade,
  CalendarEvent,
  SyncProgress,
  SyncLog,
  WhatIfScore,
  SimulationScenario,
  SimulationScore,
} from './entities'

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface StartOAuthPayload {
  provider: IntegrationProvider
  baseUrl?: string
}

export interface ConnectWithTokenPayload {
  provider: IntegrationProvider
  baseUrl:  string       // institution URL for Canvas/Moodle
  token:    string       // Personal Access Token
}

export type StartOAuthResult =
  | { success: true; integration: Integration }
  | { success: false; error: string }

export type LogoutResult =
  | { success: true }
  | { success: false; error: string }

// ─── Sync ───────────────────────────────────────────────────────────────────

export interface StartIntegrationSyncPayload {
  integrationId: string
}

export type SyncResult =
  | { success: true; log: SyncLog }
  | { success: false; error: string }

// ─── Modules ────────────────────────────────────────────────────────────────

export interface ModulesWithItems {
  module: Module
  items: ModuleItem[]
}

// ─── Calendar ───────────────────────────────────────────────────────────────

export interface CalendarRangePayload {
  startMs: number
  endMs: number
}

// ─── Pages ──────────────────────────────────────────────────────────────────

export interface GetPageByUrlPayload {
  courseId: string
  url: string
}

// ─── What-If Scores ──────────────────────────────────────────────────────────

export interface SetWhatIfScorePayload {
  assignmentId: string
  hypotheticalScore: number | null
}

// ─── Academic Outcome Simulator ────────────────────────────────────────────────

export interface CreateScenarioPayload {
  name: string
  color: string
}

export interface RenameScenarioPayload {
  id: string
  name: string
}

export interface SetSimulationScorePayload {
  scenarioId: string
  assignmentId: string
  hypotheticalScore: number | null
}

// ─── Preferences ────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light' | 'system'

// ─── Appearance / Personalization ─────────────────────────────────────────────
// The visual-identity layer applied by the renderer's appearance engine
// (src/renderer/src/lib/appearance.ts). Stored as one nested object under the
// `appearance` preference key. Grows phase-by-phase; older saves are merged over
// DEFAULT_APPEARANCE on read so missing fields fall back to defaults.

export type ThemeMode      = 'light' | 'dark' | 'oled' | 'system'
export type CornerStyle    = 'sharp' | 'rounded' | 'extra'
export type FontFamily     = 'system' | 'sans' | 'mono' | 'dyslexic'
export type ContrastLevel  = 'normal' | 'increased' | 'high'
export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'
export type LineSpacing    = 'normal' | 'relaxed' | 'loose'
export type MotionLevel    = 'smooth' | 'standard' | 'snappy' | 'reduced'
export type SidebarMode    = 'compact' | 'standard' | 'expanded'
export type DensityMode      = 'comfortable' | 'balanced' | 'compact'
export type EffectsPreset    = 'minimal' | 'balanced' | 'modern' | 'glass' | 'performance'
export type WorkspaceMode    = 'default' | 'study' | 'planner' | 'exam' | 'minimal'
export type DashboardPanelId = 'stats' | 'overdue' | 'upcoming' | 'courses' | 'grades'

export interface DashboardPanel {
  id:      DashboardPanelId
  visible: boolean
  order:   number
}
export type BackgroundType = 'none' | 'image' | 'solid' | 'gradient'
export type BackgroundScaling = 'fill' | 'fit' | 'stretch' | 'center' | 'crop'

export interface BackgroundSettings {
  type:            BackgroundType
  image:           string | null   // data-URL
  color:           string          // solid hex
  gradientFrom:    string
  gradientTo:      string
  gradientAngle:   number          // degrees
  scaling:         BackgroundScaling
  blur:            number          // px (0–40)
  brightness:      number          // % (0–200, 100 = normal)
  contrast:        number          // % (0–200)
  saturation:      number          // % (0–200)
  opacity:         number          // % (0–100) of the background layer
  overlayOpacity:  number          // % (0–100) black dimming overlay
  adaptiveReadability: boolean     // extra scrim behind content for legibility
}

export interface AppearanceSettings {
  // ── Theme & accent (Phase 1) ──
  themeMode:       ThemeMode
  accentPrimary:   string   // hex; '' = built-in indigo ramp (pixel-identical default)
  accentSecondary: string   // hex; drives focus rings, text selection, scrollbar hover
  cornerStyle:     CornerStyle
  fontFamily:      FontFamily
  fontScale:       number   // text rem multiplier, ~0.85–1.4
  uiScale:         number   // whole-UI zoom, ~0.8–1.3

  // ── Status colors (Phase 2) — '' = built-in default ramp ──
  statusSuccess:      string  // → green tokens
  statusWarning:      string  // → amber tokens
  statusError:        string  // → red tokens
  statusNotification: string  // → blue tokens

  // ── Accessibility (Phase 2) ──
  contrast:           ContrastLevel
  reduceTransparency: boolean
  colorblind:         ColorblindMode
  lineSpacing:        LineSpacing

  // ── Motion (Phase 3) ──
  motionLevel:        MotionLevel
  disableAnimations:  boolean

  // ── Layout (Phase 4) ──
  sidebarMode:        SidebarMode

  // ── Density (Phase 5) ──
  density:            DensityMode

  // ── Effects (Phase 7) ──
  effectsPreset:      EffectsPreset

  // ── Dashboard panels (Phase 8) ──
  dashboardPanels:    DashboardPanel[]

  // ── Workspace mode (Phase 9) ──
  workspaceMode:      WorkspaceMode

  // ── Background (Phase 6) ──
  background:         BackgroundSettings
}

export interface AppPreferences {
  theme:                    'dark' | 'light' | 'system'
  obsidianVaultPath:        string | null
  notificationsEnabled:     boolean
  notificationAdvanceHours: number
  syncIntervalMinutes:      number
  launchAtStartup:          boolean
  customBackground:         string | null
  backgroundOpacity:        number
  // When false (default): only current/active courses appear in Courses,
  // Modules, Assignments, Grades, and Files tabs. Grade & GPA Calc is
  // unaffected and always shows all history. Dashboard has its own toggle
  // controlled from the Edit Layout button.
  showHistoryCourses:       boolean
  appearance:               AppearanceSettings
  workspaceProfiles:        WorkspaceProfile[]
  workspaceActiveId:        string
}

export type SetPreferencesPayload = Partial<AppPreferences>

// ─── Auto-updater ─────────────────────────────────────────────────────────────

export type UpdateStatus =
  | 'idle'          // nothing happening / not yet checked
  | 'checking'      // querying the release feed
  | 'available'     // a newer version exists (download may auto-start)
  | 'not-available' // already on the latest version
  | 'downloading'   // pulling the update package
  | 'downloaded'    // staged and ready to install on restart
  | 'error'         // check/download failed

export interface UpdateState {
  status:       UpdateStatus
  version:      string | null   // the version that's available/downloaded
  releaseNotes: string | null   // plain-text/HTML notes from the release
  percent:      number          // 0–100 download progress
  error:        string | null
}

// ─── Grade Rescue Mode ───────────────────────────────────────────────────────

export type RescueRiskLevel = 'safe' | 'warning' | 'critical' | 'insufficient_data'

export interface RescueAction {
  assignmentId:   string
  assignmentName: string
  category:       string   // assignment group name, or "General"
  pointsPossible: number
  gradeImpact:    number   // max percentage points added to final grade (at 100%)
  urgency:        'overdue' | 'soon' | 'upcoming'
  impactScore:    number   // computed ranking value (higher = prioritise first)
}

export interface GradeRescueReport {
  courseId:              string
  courseName:            string
  riskLevel:             RescueRiskLevel
  currentGrade:          number | null   // 0–100, based on graded assignments
  projectedPessimistic:  number | null   // if every remaining assignment scores 0
  projectedOptimistic:   number | null   // if every remaining assignment scores 100%
  minScoreToPass:        number | null   // avg% needed on remaining work to reach 60%
  minScoreForC:          number | null   // avg% needed to reach 70%
  minScoreForB:          number | null   // avg% needed to reach 80%
  topActions:            RescueAction[]  // top 3 by impactScore
  totalUnsubmitted:      number
  totalMissing:          number          // unsubmitted AND past due
  insufficientDataReason: string | null
}

// ─── Generic result wrapper ──────────────────────────────────────────────────
// All IPC invoke calls return this shape so the renderer can handle errors uniformly.

export type IPCResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string }

// ─── Re-export entity types so renderers only need one import path ────────────
export type {
  Integration,
  IntegrationProvider,
  Course,
  Module,
  ModuleItem,
  Assignment,
  AssignmentAttachment,
  AssignmentGroup,
  CourseFile,
  CoursePage,
  Quiz,
  Grade,
  CalendarEvent,
  SyncProgress,
  SyncLog,
  WhatIfScore,
  SimulationScenario,
  SimulationScore,
}

// Appearance types are exported at their declaration site above.

// ─── Workspace & Layout ───────────────────────────────────────────────────────

export type WidgetType
  = 'stats' | 'upcoming' | 'overdue' | 'courses' | 'grades' | 'calendar' | 'grade-rescue' | 'gpa'
export type WidgetSize = 'small' | 'medium' | 'large' | 'full'

export interface WidgetConfig {
  id:        string
  type:      WidgetType
  size:      WidgetSize
  visible:   boolean
  collapsed: boolean
  pinned:    boolean
  order:     number
}

export type NavItemId
  = 'dashboard' | 'courses' | 'modules' | 'assignments' | 'grades'
  | 'grade-calculator' | 'grade-rescue' | 'simulator' | 'calendar' | 'files' | 'history'

export interface SidebarItemConfig {
  id:        NavItemId
  label:     string
  visible:   boolean
  order:     number
  sectionId: string | null
}

export interface SidebarSection {
  id:        string
  label:     string
  order:     number
  collapsed: boolean
}

export type CoursesLayout     = 'cards' | 'list' | 'table'
export type CoursesSortBy     = 'name' | 'grade-high' | 'grade-low' | 'recent'
export type AssignmentsLayout = 'list' | 'board' | 'priority'
export type AssignmentsSortBy = 'due-date' | 'course' | 'points' | 'completion'
export type ModulesLayout     = 'lms' | 'flat' | 'type'
export type GradesLayout      = 'overview' | 'table' | 'analytics'

export interface PagePreferences {
  coursesLayout:     CoursesLayout
  coursesSortBy:     CoursesSortBy
  assignmentsLayout: AssignmentsLayout
  assignmentsSortBy: AssignmentsSortBy
  modulesLayout:     ModulesLayout
  gradesLayout:      GradesLayout
}

export interface WorkspaceProfile {
  id:             string
  name:           string
  icon:           string
  widgets:        WidgetConfig[]
  sidebarItems:   SidebarItemConfig[]
  sidebarSections:SidebarSection[]
  pagePrefs:      PagePreferences
  dashboardShowHistoryCourses: boolean
  createdAt:      number
  updatedAt:      number
}

export interface WorkspaceState {
  profiles:  WorkspaceProfile[]
  activeId:  string
}
