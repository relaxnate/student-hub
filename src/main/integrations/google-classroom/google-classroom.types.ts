// Google Classroom API v1 response types.
// Reference: https://developers.google.com/classroom/reference/rest

export interface GCourse {
  id: string
  name: string
  section?: string
  descriptionHeading?: string
  description?: string
  room?: string
  ownerId: string
  courseState: 'ACTIVE' | 'ARCHIVED' | 'PROVISIONED' | 'DECLINED' | 'SUSPENDED'
  alternateLink: string
  teacherGroupEmail?: string
  courseGroupEmail?: string
  calendarId?: string
  creationTime?: string
  updateTime?: string
}

export interface GTopic {
  courseId: string
  topicId: string
  name: string
  updateTime: string
}

export type GCourseWorkType = 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION'
export type GCourseWorkState = 'PUBLISHED' | 'DRAFT' | 'DELETED'

export interface GDriveFile {
  id: string
  title: string
  alternateLink: string
  thumbnailUrl?: string
}

export interface GLink {
  url: string
  title?: string
  thumbnailUrl?: string
}

export interface GYouTubeVideo {
  id: string
  title?: string
  alternateLink: string
  thumbnailUrl?: string
}

export interface GMaterial {
  driveFile?:    { driveFile: GDriveFile; shareMode?: string }
  youtubeVideo?: GYouTubeVideo
  link?:         GLink
  form?:         { formUrl: string; title?: string; thumbnailUrl?: string }
}

export interface GDate {
  year:  number
  month: number
  day:   number
}

export interface GTimeOfDay {
  hours:   number
  minutes: number
  seconds: number
  nanos:   number
}

export interface GCourseWork {
  courseId:    string
  id:          string
  title:       string
  description?: string
  materials?:  GMaterial[]
  state:       GCourseWorkState
  alternateLink: string
  creationTime?: string
  updateTime?:  string
  dueDate?:    GDate
  dueTime?:    GTimeOfDay
  scheduledTime?: string
  maxPoints?:  number
  workType:    GCourseWorkType
  assigneeMode?: string
  topicId?:    string
  // Grading-related
  gradeCategory?: { id: string; name: string; weight?: number }
}

export type GSubmissionState = 'SUBMISSION_STATE_UNSPECIFIED' | 'NEW' | 'CREATED' |
  'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT'

export interface GStudentSubmission {
  courseId:      string
  courseWorkId:  string
  id:            string
  userId:        string
  creationTime?: string
  updateTime?:   string
  state:         GSubmissionState
  late?:         boolean
  draftGrade?:   number
  assignedGrade?: number
  alternateLink: string
  courseWorkType: GCourseWorkType
  submissionHistory?: Array<{
    gradeHistory?: { grade?: number; maxPoints?: number; gradeTimestamp?: string }
    stateHistory?: { state: GSubmissionState; stateTimestamp?: string }
  }>
}

export interface GUserProfile {
  id:   string
  name: { givenName: string; familyName: string; fullName: string }
  emailAddress: string
  photoUrl?: string
}
