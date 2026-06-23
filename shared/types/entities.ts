// ─── Integration / Auth ─────────────────────────────────────────────────────

export type IntegrationProvider =
  | 'canvas'
  | 'google-classroom'
  | 'microsoft-teams'
  | 'moodle'
  | 'blackboard'
  | 'schoology'
  | 'google-calendar'
  | 'outlook-calendar'

export interface Integration {
  id: string
  provider: IntegrationProvider
  displayName: string       // e.g. "Canvas — State University"
  baseUrl: string | null    // institution URL for Canvas/Moodle; null for hosted services
  userIdExternal: string | null
  userName: string | null
  userEmail: string | null
  connectedAt: number       // unix ms
  lastSyncedAt: number | null
  isActive: boolean
}

// ─── Course ─────────────────────────────────────────────────────────────────

export interface Course {
  id: string
  integrationId: string
  externalId: string
  name: string
  courseCode: string | null
  description: string | null
  color: string | null       // hex, assigned locally for visual identity
  term: string | null
  startDate: number | null   // unix ms
  endDate: number | null
  isActive: boolean
  // The LMS's own computed grade for this course (e.g. Canvas's
  // `computed_current_score` / `computed_current_grade` from the enrollment
  // object). This is the authoritative percentage shown on the LMS's own
  // grades page — it already accounts for weighted assignment groups,
  // dropped grades, and any other grading-scheme rules, which is why we
  // prefer it over re-deriving a percentage from raw assignment scores.
  currentScore: number | null
  currentGrade: string | null
  // Whether this course's final grade is computed from weighted assignment
  // groups (Canvas: apply_assignment_group_weights) rather than a flat
  // points ratio. Needed by the Grade & GPA Calculator to replicate Canvas's
  // own math when the student edits a hypothetical "what-if" score.
  applyGroupWeights: boolean
  syncedAt: number
}

// ─── Assignment Groups ────────────────────────────────────────────────────────
// Canvas groups assignments into categories ("Homework", "Tests", "Essays")
// and can weight each group's contribution to the final grade. Only relevant
// when the parent course has applyGroupWeights = true.

export interface AssignmentGroup {
  id: string
  courseId: string
  externalId: string
  name: string
  groupWeight: number   // percent, e.g. 20 for 20%
  position: number
  syncedAt: number
}

// ─── Module ─────────────────────────────────────────────────────────────────
// Modules are learning structures set by the instructor — NOT folders.
// Each module has an ordered list of items, and each item points to real content.

export interface Module {
  id: string
  courseId: string
  externalId: string
  name: string
  position: number
  description: string | null
  unlockAt: number | null
  isLocked: boolean
  completedRequirements: number
  totalRequirements: number
  syncedAt: number
}

export type ModuleItemType =
  | 'Assignment'
  | 'Quiz'
  | 'File'
  | 'Page'
  | 'Discussion'
  | 'ExternalUrl'
  | 'ExternalTool'
  | 'SubHeader'

export interface ModuleItem {
  id: string
  moduleId: string
  courseId: string
  externalId: string
  title: string
  type: ModuleItemType
  position: number
  // Resolves to the actual entity when type is Assignment / File / Page / Quiz.
  // Null for SubHeader and ExternalUrl items.
  contentId: string | null
  url: string | null         // for ExternalUrl items
  pageUrl: string | null     // for Page items — the Canvas page slug
  completionRequirement: CompletionRequirement | null
  isCompleted: boolean
  syncedAt: number
}

export interface CompletionRequirement {
  type: 'min_score' | 'must_submit' | 'must_view' | 'must_mark_done' | 'must_contribute'
  minScore?: number
}

// ─── Assignment ──────────────────────────────────────────────────────────────

export type GradingType =
  | 'points'
  | 'percent'
  | 'letter_grade'
  | 'gpa_scale'
  | 'pass_fail'
  | 'not_graded'

export type SubmissionType =
  | 'online_upload'
  | 'online_text_entry'
  | 'online_url'
  | 'media_recording'
  | 'student_annotation'
  | 'none'
  | 'not_graded'
  | 'on_paper'
  | 'external_tool'

export interface Assignment {
  id: string
  courseId: string
  externalId: string
  title: string
  descriptionHtml: string | null  // raw HTML from LMS
  descriptionPlain: string | null // stripped for search/preview
  dueAt: number | null            // unix ms
  unlockAt: number | null
  lockAt: number | null
  pointsPossible: number | null
  gradingType: GradingType
  submissionTypes: SubmissionType[]
  allowedExtensions: string[]
  rubric: RubricCriterion[] | null
  isPublished: boolean
  isMuted: boolean
  position: number | null
  // Which assignment group this belongs to — used to compute a
  // weighted course percentage. Null if the LMS doesn't report one.
  assignmentGroupId: string | null
  syncedAt: number
}

export interface RubricCriterion {
  id: string
  description: string
  longDescription: string | null
  points: number
  ratings: RubricRating[]
}

export interface RubricRating {
  id: string
  description: string
  longDescription: string | null
  points: number
}

export interface AssignmentAttachment {
  id: string
  assignmentId: string
  fileId: string | null     // links to File entity if downloaded
  url: string | null
  filename: string
  contentType: string | null
  size: number | null
}

// ─── File ───────────────────────────────────────────────────────────────────

export interface CourseFile {
  id: string
  courseId: string
  externalId: string
  filename: string
  displayName: string
  contentType: string
  size: number
  url: string | null         // LMS download URL (may expire)
  localPath: string | null   // path to locally cached copy
  folderPath: string         // folder path within course (e.g. "Week 3/Slides")
  isHidden: boolean
  isLocked: boolean
  createdAt: number | null
  updatedAt: number | null
  syncedAt: number
}

// ─── Page ───────────────────────────────────────────────────────────────────

export interface CoursePage {
  id: string
  courseId: string
  externalId: string
  title: string
  bodyHtml: string | null
  url: string              // Canvas slug, e.g. "week-3-introduction"
  isPublished: boolean
  editedAt: number | null
  syncedAt: number
}

// ─── Quiz ───────────────────────────────────────────────────────────────────

export type QuizType = 'practice_quiz' | 'assignment' | 'graded_survey' | 'survey'

export interface Quiz {
  id: string
  courseId: string
  externalId: string
  title: string
  description: string | null
  quizType: QuizType
  dueAt: number | null
  unlockAt: number | null
  lockAt: number | null
  timeLimitMinutes: number | null
  allowedAttempts: number | null   // -1 means unlimited
  pointsPossible: number | null
  isPublished: boolean
  htmlUrl: string | null   // deep link to open/take the quiz on the LMS's own site
  syncedAt: number
}

// ─── What-If Scores (Grade Calculator) ────────────────────────────────────────
// A purely local, never-synced hypothetical score for one assignment, used by
// the Grade & GPA Calculator's "what would my grade be if..." editing.

export interface WhatIfScore {
  assignmentId: string
  hypotheticalScore: number | null   // null clears the override, falling back to the real grade
  updatedAt: number
}

// ─── Grade ──────────────────────────────────────────────────────────────────

export type SubmissionState =
  | 'submitted'
  | 'graded'
  | 'pending_review'
  | 'unsubmitted'
  | 'excused'

export interface Grade {
  id: string
  assignmentId: string
  courseId: string
  externalId: string | null
  score: number | null
  pointsPossible: number | null
  grade: string | null            // letter grade or string ("A", "95%", "complete")
  enteredGrade: string | null     // what was actually entered before rounding
  submittedAt: number | null
  gradedAt: number | null
  isLate: boolean
  isMissing: boolean
  isExcused: boolean
  workflowState: SubmissionState
  submissionComments: SubmissionComment[]
  syncedAt: number
}

export interface SubmissionComment {
  id: string
  authorName: string
  comment: string
  createdAt: number
}

// ─── Calendar Event ──────────────────────────────────────────────────────────

export type CalendarEventType = 'event' | 'assignment'

export interface CalendarEvent {
  id: string
  integrationId: string
  courseId: string | null          // null for personal events
  externalId: string
  title: string
  description: string | null
  startAt: number
  endAt: number | null
  allDay: boolean
  eventType: CalendarEventType
  assignmentId: string | null      // populated when eventType === 'assignment'
  location: string | null
  syncedAt: number
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'running' | 'success' | 'error' | 'partial'

export interface SyncLog {
  id: string
  integrationId: string
  startedAt: number
  completedAt: number | null
  status: SyncStatus
  coursesSynced: number
  assignmentsSynced: number
  modulesSynced: number
  filesSynced: number
  errorMessage: string | null
}

export interface SyncProgress {
  integrationId: string
  provider: IntegrationProvider
  phase: 'courses' | 'modules' | 'assignments' | 'files' | 'grades' | 'calendar'
  courseId: string | null
  courseName: string | null
  itemsProcessed: number
  itemsTotal: number | null
}
