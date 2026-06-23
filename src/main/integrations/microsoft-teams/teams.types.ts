// Microsoft Graph API v1.0 Education endpoint types.
// Reference: https://learn.microsoft.com/en-us/graph/api/resources/education-overview

export interface MSEduClass {
  id:           string
  displayName:  string
  description?: string
  mailNickname: string
  externalId?:  string
  externalName?: string
  grade?:       string
  term?: {
    displayName: string
    startDate:   string   // YYYY-MM-DD
    endDate:     string
    externalId?: string
  }
  course?: {
    displayName:  string
    courseNumber: string
    description?: string
    subject?:     string
  }
  createdBy?: MSIdentitySet
}

export interface MSEduAssignment {
  id:              string
  displayName:     string
  status:          'draft' | 'published' | 'assigned'
  createdDateTime?: string
  lastModifiedDateTime?: string
  dueDateTime?:    string       // ISO 8601
  allowLateSubmissions?: boolean
  allowStudentsToAddResourcesToSubmission?: boolean
  assignedDateTime?: string
  classId:         string
  instructions?: {
    content:      string
    contentType:  'text' | 'html'
  }
  assignTo?: unknown            // educationAssignmentRecipient
  resources?: MSEduResource[]
  grading?: {
    '@odata.type': string
    maxPoints?:    number
  }
  rubric?: MSEduRubric
  webUrl?: string
}

export interface MSEduResource {
  id:              string
  distributeForStudentWork: boolean
  resource: {
    '@odata.type':  string
    displayName:    string
    createdDateTime?: string
    // For file resources:
    fileUrl?:       string
    // For link resources:
    link?:          string
  }
}

export interface MSEduSubmission {
  id:              string
  status:          'working' | 'submitted' | 'released' | 'returned'
  submittedDateTime?: string
  returnedDateTime?:  string
  resourcesFolderUrl?: string
  outcomes?: MSSubmissionOutcome[]
}

export interface MSSubmissionOutcome {
  '@odata.type': string
  id:            string
  // For points:
  points?: {
    '@odata.type': string
    points:        number
  }
  publishedPoints?: {
    points: number
  }
}

export interface MSEduRubric {
  id:          string
  displayName: string
  description?: { content: string }
  levels: Array<{ levelId: string; displayName: string; description?: { content: string } }>
  qualities: Array<{
    qualityId:    string
    displayName:  string
    description?: { content: string }
    criteria: Array<{ description: { content: string } }>
    weight?: number
  }>
}

export interface MSIdentitySet {
  application?: { id: string; displayName: string }
  device?:      { id: string; displayName: string }
  user?:        { id: string; displayName: string }
}

export interface MSUser {
  id:                string
  displayName:       string
  mail?:             string
  userPrincipalName: string
}

// Graph OData list response wrapper
export interface MSListResponse<T> {
  '@odata.context'?: string
  '@odata.nextLink'?: string
  value: T[]
}
