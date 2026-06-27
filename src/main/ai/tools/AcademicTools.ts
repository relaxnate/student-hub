// Provider-agnostic tool schemas the AI can call to look up the student's real
// Canvas data (Phase 2). Passed to any provider that supports function calling;
// each maps to a thin wrapper over an existing repository in ToolExecutor.
import type { ToolDefinition } from '@shared/types/entities'

export const ACADEMIC_TOOLS: ToolDefinition[] = [
  {
    name: 'get_courses',
    description: 'Get all active courses with current grades and basic stats',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_assignments',
    description: 'Get assignments for a specific course, optionally including future ungraded ones',
    parameters: {
      type: 'object',
      properties: {
        courseId: { type: 'string', description: 'The course ID' },
        includeFuture: { type: 'boolean', description: 'Include upcoming ungraded assignments' },
        includeGraded: { type: 'boolean', description: 'Include already-graded assignments' },
      },
      required: ['courseId'],
    },
  },
  {
    name: 'get_grades',
    description: 'Get all grades for a specific course with point values and percentages',
    parameters: {
      type: 'object',
      properties: { courseId: { type: 'string', description: 'The course ID' } },
      required: ['courseId'],
    },
  },
  {
    name: 'get_gpa_summary',
    description: 'Get the calculated overall GPA across all courses using the same calculation as the GPA Calculator feature',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_upcoming_assignments',
    description: 'Get assignments due within a specific number of days across all courses',
    parameters: {
      type: 'object',
      properties: { withinDays: { type: 'number', description: 'Number of days to look ahead' } },
      required: ['withinDays'],
    },
  },
  {
    name: 'get_missing_assignments',
    description: 'Get all assignments that are past due and not submitted',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_modules',
    description: 'Get the modules and module items for a specific course',
    parameters: {
      type: 'object',
      properties: { courseId: { type: 'string', description: 'The course ID' } },
      required: ['courseId'],
    },
  },
  {
    name: 'calculate_needed_score',
    description: 'Calculate the score a student needs on remaining assignments to achieve a target grade in a course',
    parameters: {
      type: 'object',
      properties: {
        courseId: { type: 'string', description: 'The course ID' },
        targetGrade: { type: 'number', description: 'Target percentage grade (e.g. 90 for an A-)' },
      },
      required: ['courseId', 'targetGrade'],
    },
  },
  {
    name: 'propose_file_edit',
    description: 'Propose an edit to a file in the student vault or managed files folder. The student MUST approve before anything is written — this only proposes.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to edit — must be within allowed directories' },
        proposedContent: { type: 'string', description: 'The complete new content for the file' },
        reason: { type: 'string', description: 'Explanation of why this edit is being proposed' },
      },
      required: ['filePath', 'proposedContent', 'reason'],
    },
  },
]

/** Tools that write/modify/delete — they require explicit student approval. */
export const DESTRUCTIVE_TOOLS = new Set(['propose_file_edit'])

export function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.has(name)
}
