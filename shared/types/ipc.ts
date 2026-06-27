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
  Reminder,
  ReminderOccurrence,
  CreateReminderInput,
  WidgetLayout,
  WidgetInstance,
  UserWidgetAsset,
  SyncProgress,
  SyncLog,
  WhatIfScore,
  SimulationScenario,
  SimulationScore,
  AIProvider,
  AIProviderId,
  AIModel,
  AIMessage,
  AIConversation,
  AIUsage,
  UsageFraction,
  ChatMessage,
  ContentPart,
  ChatChunk,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ModelInfo,
  MascotSkin,
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

export interface ConnectCalendarFeedPayload {
  feedUrl: string        // the student's personal .ics/webcal feed URL
  label?:  string        // optional friendly name for the connected account
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
// Overall navigation form (Phase 3 nav-type system). Orthogonal to sidebarMode
// (which only sizes the vertical sidebar). standard = full vertical sidebar;
// rail = icon-only vertical rail with hover flyout labels; dock = horizontal top
// bar (no vertical sidebar); palette = ultra-slim launcher rail, ⌘K-driven nav.
export type NavType        = 'standard' | 'rail' | 'dock' | 'palette'

// Browser-style tab (Phase 4). Persisted via app preferences (keys `tabs` /
// `activeTabId`), like workspace profiles — no DB table needed.
export interface AppTab {
  id:    string
  route: string   // hash route this tab is showing, e.g. '/courses'
  title: string   // display label, derived from the route
}

// ── Per-component surface styling (glass / translucency) ──
// Each named surface can be styled independently: keep the default token, paint
// a solid custom colour, or go translucent "glass" (semi-transparent tint +
// backdrop blur) which reveals the user's background image/colour behind it.
export type SurfaceId   = 'sidebar' | 'tabs' | 'titlebar' | 'content' | 'card'
export type SurfaceMode = 'default' | 'solid' | 'glass'

export interface SurfaceStyle {
  mode:    SurfaceMode
  color:   string   // hex tint; '' = the surface's built-in colour
  opacity: number   // 0–100 translucency (used by solid alpha + glass)
  blur:    number   // px backdrop blur (glass only)
}

export type SurfaceStyles = Record<SurfaceId, SurfaceStyle>
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
  // Custom drag-resized sidebar width in px. null = use the preset for the
  // current sidebarMode (compact/standard/expanded). Ignored in compact mode.
  sidebarWidth:       number | null
  // Overall navigation form. Only applies to the standard vertical sidebar when
  // 'standard'; rail/dock/palette restructure navigation (see NavType).
  navType:            NavType
  // Browser-style tab bar (Phase 4). Opt-in; off = single-view navigation.
  tabsEnabled:        boolean
  // Per-component glass/translucency + colour customization (one entry per surface).
  surfaces:           SurfaceStyles

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
  Reminder,
  ReminderOccurrence,
  CreateReminderInput,
  WidgetLayout,
  WidgetInstance,
  UserWidgetAsset,
  SyncProgress,
  SyncLog,
  WhatIfScore,
  SimulationScenario,
  SimulationScore,
  AIProvider,
  AIProviderId,
  AIModel,
  AIMessage,
  AIConversation,
  AIUsage,
  UsageFraction,
  ChatMessage,
  ContentPart,
  ChatChunk,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ModelInfo,
  MascotSkin,
}

// ─── AI Helper IPC payloads / streaming events ──────────────────────────────
// Streaming uses START_STREAM (invoke, returns an ack) + main→renderer events
// keyed by streamId so multiple concurrent streams never mix.

export interface StreamParams {
  streamId:        string
  provider:        string
  model:           string
  messages:        ChatMessage[]
  conversationId?: string        // append to an existing conversation, else a new one is created
  tools?:          ToolDefinition[]
  systemPrompt?:   string
  maxTokens?:      number
  temperature?:    number
}

export interface StreamChunkEvent {
  streamId: string
  delta:    string
}

export interface StreamDoneEvent {
  streamId:       string
  conversationId: string
  messageId:      string
  content:        string
  usage?:         { inputTokens: number; outputTokens: number }
}

export interface StreamErrorEvent {
  streamId: string
  error:    string
  code?:    'free_tier_limit' | 'rate_limit' | 'no_key' | 'vision_unsupported' | 'network' | 'unknown'
}

// A proposed (not-yet-applied) file edit from the propose_file_edit tool.
export interface ProposedFileEdit {
  filePath:        string   // validated absolute path
  proposedContent: string
  reason:          string
}

// Tool activity surfaced to the chat UI. status 'running' = a read-only tool is
// executing; 'proposed' = a destructive edit awaiting the student's Apply.
export interface ToolCallEvent {
  streamId: string
  id:       string
  name:     string
  status:   'running' | 'proposed'
  proposal?: ProposedFileEdit
}

export interface ToolResultEvent {
  streamId: string
  id:       string
  name:     string
  content:  string   // short result preview for the card
}

export interface SaveKeyPayload     { provider: string; key: string }
export interface ValidateKeyPayload { provider: string; key: string }
export interface SetAIPreferencePayload { key: string; value: string }
export interface ApplyFileEditPayload { filePath: string; proposedContent: string }

// ─── PDF intelligence (Phase 4 — experimental) ──────────────────────────────
export type PDFKind = 'fillable' | 'flat' | 'unknown'

export interface PDFFieldAnswer {
  name:     string   // AcroForm field name
  question: string   // best-known label/prompt for the field
  answer:   string   // AI-generated answer
  type:     string   // text | checkbox | radio | dropdown
}

// One stamped answer on a flat/scanned PDF, in PDF user space (origin bottom-left,
// y-up — the same space pdf-lib draws in). `y` is the text baseline.
export interface PDFPlacement {
  page:      number    // 0-based
  x:         number    // points from the left edge
  y:         number    // points from the bottom edge (baseline)
  text:      string
  size:      number    // target font size in points (main shrinks to fit maxWidth)
  maxWidth?: number    // if set, the answer is shrunk/truncated to fit this width
}

// A proposed, NOT-yet-written PDF fill. Rendered as an action card; only
// pdf:confirm-apply / pdf:stamp writes (to outputPath — never the original).
export interface PDFProposal {
  filePath:    string          // original (read-only)
  outputPath:  string          // where the filled copy will be written
  fileName:    string
  kind:        PDFKind
  fieldCount:  number
  answers:     PDFFieldAnswer[]
  experimental: true
  note?:       string          // e.g. why flat/vision is unavailable
  // Flat/scanned positional path (computed in the renderer from the PDF text
  // layer, or via a vision model for scanned pages):
  placements?: PDFPlacement[]
  previews?:   string[]         // per-page PNG data-URLs with answer overlays drawn on
  detection?:  'textlayer' | 'vision' | 'mixed'
  mode?:       'autofill' | 'help'
}

export interface PDFAnalyzePayload { mode: 'autofill' | 'help' }
export interface PDFConfirmPayload { proposal: PDFProposal }

// Pick a PDF (main shows the dialog), detect its kind, and return the raw bytes
// (base64) so the renderer can analyse the text layer / render previews.
export interface PDFPickResult {
  filePath:   string
  fileName:   string
  kind:       PDFKind
  base64:     string          // raw PDF bytes for renderer-side pdfjs
  outputPath: string          // suggested managed-files output path
}

// Renderer → main: answer a batch of extracted questions with the active AI
// provider. Returns answers aligned by index to `questions`.
export interface PDFAnswerPayload { questions: string[]; courseContext?: string }

// Renderer → main: answer a scanned page from its rendered image (vision model),
// returning answers + normalized 0..1000 anchor coords for placement.
export interface PDFVisionPayload { imageDataUrl: string; courseContext?: string }
export interface PDFVisionAnchor { question: string; answer: string; x: number; y: number }

// Renderer → main: stamp computed placements onto a flat PDF → new file.
export interface PDFStampPayload { filePath: string; outputPath: string; placements: PDFPlacement[] }

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
  = 'dashboard' | 'courses' | 'modules' | 'assignments' | 'ai-helper' | 'grades'
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

export type DashboardView = 'focused' | 'widgets'

export interface WorkspaceProfile {
  id:             string
  name:           string
  icon:           string
  widgets:        WidgetConfig[]
  sidebarItems:   SidebarItemConfig[]
  sidebarSections:SidebarSection[]
  pagePrefs:      PagePreferences
  dashboardShowHistoryCourses: boolean
  // Which dashboard surface to show in the new (non-legacy) UI: the focused
  // fixed layout, or the customizable react-grid-layout widget canvas (Phase 2).
  dashboardView:  DashboardView
  createdAt:      number
  updatedAt:      number
}

export interface WorkspaceState {
  profiles:  WorkspaceProfile[]
  activeId:  string
}
