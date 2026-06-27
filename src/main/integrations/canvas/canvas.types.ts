// Canvas REST API v1 response types.
// Reference: https://canvas.instructure.com/doc/api/
// These are the raw shapes returned by Canvas before normalisation.

export interface CanvasCourse {
  id: number
  // Canvas omits name/course_code (and almost every other field) for courses the
  // student can't currently see — e.g. when access_restricted_by_date is true the
  // object is essentially just { id, access_restricted_by_date }. Typed optional
  // so the normalizer is forced to handle the missing-name case.
  name?: string | null
  course_code?: string | null
  // True when the course is hidden because the term/course access dates haven't
  // opened yet (or have closed). Such courses carry no usable data → skip them.
  access_restricted_by_date?: boolean
  workflow_state: 'unpublished' | 'available' | 'completed' | 'deleted'
  account_id: number
  start_at: string | null      // ISO 8601
  end_at: string | null
  // When true, the course's own start_at/end_at govern access — so a passed
  // end_at genuinely means the course is over for the student. When false,
  // end_at is informational only and shouldn't be used to hide the course.
  restrict_enrollments_to_course_dates?: boolean
  enrollments?: CanvasEnrollment[]
  term?: CanvasTerm
  syllabus_body?: string | null
  public_description?: string | null
  default_view?: string
  hide_final_grades?: boolean
  // Whether the course's final grade is computed from weighted assignment
  // groups rather than a flat points ratio. Returned directly on the course
  // object by Canvas (no extra include[] needed).
  apply_assignment_group_weights?: boolean
}

export interface CanvasEnrollment {
  type: string
  role: string
  enrollment_state: string
  // Some Canvas instances expose an enrollment-level completion flag and the
  // section's own date window; both are stronger signals than enrollment_state
  // for school districts that leave concluded enrollments marked 'active'.
  enrollment_term_id?: number
  completed_at?: string | null
  computed_current_score?: number | null
  computed_final_score?: number | null
  computed_current_grade?: string | null
  computed_final_grade?: string | null
  // ── Multiple Grading Periods (MGP) ──────────────────────────────────────
  // K-12 districts almost always enable grading periods (quarters/semesters).
  // When MGP is on, the student's Canvas gradebook DEFAULTS to the CURRENT
  // grading period's grade, not the whole-course total — so to match what the
  // student actually sees we must prefer these *period* scores when present.
  // Populated only when the course request includes
  // include[]=current_grading_period_scores.
  current_grading_period_id?: number | null
  current_grading_period_title?: string | null
  current_period_computed_current_score?: number | null
  current_period_computed_final_score?: number | null
  current_period_computed_current_grade?: string | null
  current_period_computed_final_grade?: string | null
  // True when the course lets students view an all-grading-periods total. When
  // false (common in K-12), the student can ONLY see the current period grade.
  totals_for_all_grading_periods_option?: boolean
}

export interface CanvasTerm {
  id: number
  name: string
  start_at: string | null
  end_at: string | null
}

// Canvas groups assignments into categories ("Homework", "Tests") that can
// each carry a weight toward the course's final grade.
export interface CanvasAssignmentGroup {
  id: number
  name: string
  position: number
  group_weight: number   // percent, e.g. 20 for 20%
}

export interface CanvasModule {
  id: number
  name: string
  position: number
  unlock_at: string | null
  require_sequential_progress: boolean
  publish_final_grade: boolean
  prerequisite_module_ids: number[]
  state: 'locked' | 'unlocked' | 'started' | 'completed'
  completed_at: string | null
  items_count: number
  items_url: string
  items?: CanvasModuleItem[]
}

export interface CanvasModuleItem {
  id: number
  module_id: number
  position: number
  title: string
  indent: number
  type: 'Assignment' | 'Quiz' | 'File' | 'Page' | 'Discussion' | 'ExternalUrl' | 'ExternalTool' | 'SubHeader'
  content_id?: number
  html_url?: string
  url?: string              // API URL for the content
  page_url?: string         // For Page items — the slug
  external_url?: string     // For ExternalUrl items
  new_tab?: boolean
  completion_requirement?: {
    type: 'must_view' | 'must_submit' | 'must_contribute' | 'min_score' | 'must_mark_done'
    min_score?: number
    completed?: boolean
  }
  content_details?: {
    points_possible?: number
    due_at?: string | null
    unlock_at?: string | null
    lock_at?: string | null
  }
  mastery_paths?: unknown
}

export interface CanvasAssignment {
  id: number
  course_id: number
  name: string
  description: string | null          // HTML
  created_at: string
  updated_at: string
  due_at: string | null               // ISO 8601
  lock_at: string | null
  unlock_at: string | null
  points_possible: number | null
  grading_type: string
  submission_types: string[]
  allowed_extensions: string[]
  has_submitted_submissions: boolean
  muted: boolean
  published: boolean
  position: number
  assignment_group_id?: number
  rubric?: CanvasRubricCriterion[]
  rubric_settings?: {
    id: number
    title: string
    points_possible: number
    free_form_criterion_comments: boolean
  }
  submission?: CanvasSubmission
  // Attachments (files attached to the assignment instructions)
  attachments?: CanvasFile[]
}

export interface CanvasRubricCriterion {
  id: string
  description: string
  long_description: string
  points: number
  criterion_use_range: boolean
  ratings: Array<{
    id: string
    description: string
    long_description: string
    points: number
    criterion_id: string
  }>
}

export interface CanvasSubmission {
  id: number
  assignment_id: number
  user_id: number
  submitted_at: string | null
  graded_at: string | null
  score: number | null
  grade: string | null
  entered_grade: string | null
  entered_score: number | null
  late: boolean
  missing: boolean
  excused: boolean | null
  workflow_state: string
  submission_comments?: Array<{
    id: number
    author_name: string
    comment: string
    created_at: string
  }>
  // Present when the request includes `include[]=assignment` — used by the
  // dedicated /students/submissions endpoint, which doesn't otherwise expose
  // points_possible on the submission row itself.
  assignment?: {
    points_possible: number | null
  }
}

export interface CanvasFile {
  id: number
  folder_id: number
  display_name: string
  filename: string
  'content-type': string
  size: number
  url: string
  created_at: string
  updated_at: string
  unlock_at: string | null
  locked: boolean
  hidden: boolean
  lock_at: string | null
  hidden_for_user?: boolean
  thumbnail_url?: string | null
  modified_at?: string
  mime_class?: string
}

export interface CanvasFolder {
  id: number
  name: string
  full_name: string       // e.g. "course files/Week 3/Slides"
  context_id: number
  context_type: string
  parent_folder_id: number | null
  position: number | null
  created_at: string
  updated_at: string
  locked: boolean
  hidden: boolean
  folders_url: string
  files_url: string
  files_count: number
  folders_count: number
}

export interface CanvasPage {
  url: string
  title: string
  created_at: string
  updated_at: string
  hide_from_students: boolean
  editing_roles: string
  last_edited_by?: unknown
  body: string | null     // HTML
  published: boolean
  front_page: boolean
  locked_for_user?: boolean
  page_id?: number        // Not always present
}

export interface CanvasQuiz {
  id: number
  title: string
  html_url: string
  mobile_url: string
  description: string | null
  quiz_type: 'practice_quiz' | 'assignment' | 'graded_survey' | 'survey'
  time_limit: number | null           // minutes
  timer_autosubmit_disabled?: boolean
  shuffle_answers: boolean
  show_correct_answers: boolean
  scoring_policy: string
  allowed_attempts: number            // -1 = unlimited
  one_question_at_a_time: boolean
  question_count: number
  points_possible: number
  cant_go_back: boolean
  access_code: string | null
  ip_filter: string | null
  due_at: string | null
  lock_at: string | null
  unlock_at: string | null
  published: boolean
  unpublishable: boolean
  locked_for_user?: boolean
}
