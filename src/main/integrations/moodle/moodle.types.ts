// Moodle Web Services REST API response shapes (the subset Student Hub reads).
// All timestamps are unix SECONDS (multiply by 1000 for ms). Reference:
// https://docs.moodle.org/dev/Web_service_API_functions

export interface MoodleSiteInfo {
  sitename: string
  username: string
  firstname: string
  lastname: string
  fullname: string
  userid: number
  siteurl: string
}

// core_enrol_get_users_courses
export interface MoodleCourse {
  id: number
  shortname: string
  fullname: string
  summary?: string
  startdate?: number   // seconds
  enddate?: number     // seconds (0 = no end)
  visible?: number
}

// core_course_get_contents → sections, each with course modules
export interface MoodleSection {
  id: number
  name: string
  visible?: number
  modules?: MoodleModule[]
}
export interface MoodleModule {
  id: number          // course module id (cmid)
  name: string
  modname: string     // 'assign' | 'quiz' | 'resource' | 'page' | 'url' | 'forum' | 'label' | ...
  instance?: number   // the module instance id (e.g. the assignment id for modname 'assign')
  url?: string
}

// mod_assign_get_assignments
export interface MoodleAssignmentsResponse {
  courses: { id: number; fullname: string; assignments: MoodleAssignment[] }[]
}
export interface MoodleAssignment {
  id: number          // assignment instance id
  cmid: number        // course module id
  course: number
  name: string
  intro: string       // HTML
  duedate: number     // seconds (0 = none)
  allowsubmissionsfromdate: number
  cutoffdate: number
  grade: number       // max points; NEGATIVE = a scale (not points)
}

// gradereport_user_get_grade_items
export interface MoodleGradeItemsResponse {
  usergrades: {
    courseid: number
    userid: number
    gradeitems: MoodleGradeItem[]
  }[]
}
export interface MoodleGradeItem {
  id: number
  itemname: string | null
  itemtype: string            // 'mod' | 'course' | 'category' | ...
  itemmodule: string | null   // 'assign' | 'quiz' | ... (when itemtype === 'mod')
  iteminstance: number | null // the module instance id (matches MoodleAssignment.id for 'assign')
  cmid: number | null
  graderaw: number | null     // the raw numeric grade (null = ungraded)
  gradeformatted?: string | null
  grademax: number | null
  grademin: number | null
  gradedatesubmitted: number | null
  gradedategraded: number | null
}

// Moodle returns errors as HTTP 200 with this shape (not an HTTP error status).
export interface MoodleException {
  exception: string
  errorcode: string
  message: string
}
