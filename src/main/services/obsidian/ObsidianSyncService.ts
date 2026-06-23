import fs from 'fs'
import path from 'path'
import { format } from 'date-fns'
import { getDb } from '../../database'
import {
  CourseRepository,
  ModuleRepository,
  ModuleItemRepository,
  AssignmentRepository,
  GradeRepository,
} from '../../database/repositories'
import type { Course, Module, ModuleItem, Assignment, Grade } from '@shared/types/entities'

const courseRepo  = new CourseRepository()
const moduleRepo  = new ModuleRepository()
const itemRepo    = new ModuleItemRepository()
const assignRepo  = new AssignmentRepository()
const gradeRepo   = new GradeRepository()

export interface ObsidianSyncResult {
  coursesExported:     number
  assignmentsExported: number
  filesWritten:        number
  errors:              string[]
}

/**
 * Syncs the entire local database to an Obsidian vault folder.
 *
 * Vault structure:
 *   {vault}/
 *     Student Hub/
 *       {Course Name}/
 *         _Course Overview.md
 *         Assignments/
 *           {Assignment Title}.md
 *         Modules/
 *           {Module Name}/
 *             _Module Overview.md
 *             (links to assignments in this module)
 */
export class ObsidianSyncService {
  async syncAll(vaultPath: string): Promise<ObsidianSyncResult> {
    const result: ObsidianSyncResult = {
      coursesExported: 0, assignmentsExported: 0, filesWritten: 0, errors: []
    }

    if (!fs.existsSync(vaultPath)) {
      result.errors.push(`Vault path does not exist: ${vaultPath}`)
      return result
    }

    const root = path.join(vaultPath, 'Student Hub')
    fs.mkdirSync(root, { recursive: true })

    const courses = courseRepo.getActive()

    for (const course of courses) {
      try {
        const n = await this.syncCourse(course, root)
        result.coursesExported++
        result.assignmentsExported += n.assignments
        result.filesWritten        += n.files
      } catch (err) {
        result.errors.push(`${course.name}: ${String(err)}`)
      }
    }

    // Write a vault index
    const index = this.buildVaultIndex(courses)
    writeFile(path.join(root, 'README.md'), index)
    result.filesWritten++

    return result
  }

  async syncCourse(
    course: Course,
    rootDir: string
  ): Promise<{ assignments: number; files: number }> {
    const courseDir = path.join(rootDir, sanitizePath(course.name))
    const assignDir = path.join(courseDir, 'Assignments')
    const modDir    = path.join(courseDir, 'Modules')

    fs.mkdirSync(assignDir, { recursive: true })
    fs.mkdirSync(modDir,    { recursive: true })

    let assignCount = 0, fileCount = 0

    // ── Course overview ────────────────────────────────────────────────────
    const gradeMap   = new Map(gradeRepo.getByCourse(course.id).map(g => [g.assignmentId, g]))
    const allAssigns = assignRepo.getByCourse(course.id)
    const overview   = this.buildCourseOverview(course, allAssigns, gradeMap)
    writeFile(path.join(courseDir, '_Course Overview.md'), overview)
    fileCount++

    // ── Assignments ────────────────────────────────────────────────────────
    for (const assignment of allAssigns) {
      const grade = gradeMap.get(assignment.id)
      const md    = this.buildAssignmentNote(assignment, course, grade)
      writeFile(path.join(assignDir, `${sanitizePath(assignment.title)}.md`), md)
      assignCount++
      fileCount++
    }

    // ── Modules ───────────────────────────────────────────────────────────
    const modules = moduleRepo.getByCourse(course.id)
    for (const mod of modules) {
      const modSubDir = path.join(modDir, sanitizePath(mod.name))
      fs.mkdirSync(modSubDir, { recursive: true })

      const items      = itemRepo.getByModule(mod.id)
      const modOverview = this.buildModuleOverview(mod, items, course)
      writeFile(path.join(modSubDir, '_Module Overview.md'), modOverview)
      fileCount++
    }

    return { assignments: assignCount, files: fileCount }
  }

  // ─── Markdown builders ────────────────────────────────────────────────────

  private buildVaultIndex(courses: Course[]): string {
    const lines = [
      '# Student Hub',
      '',
      `> Synced on ${format(new Date(), 'MMMM d, yyyy · h:mm a')}`,
      '',
      '## Courses',
      '',
    ]
    for (const c of courses) {
      lines.push(`- [[${sanitizePath(c.name)}/_Course Overview|${c.name}]]`)
    }
    return lines.join('\n')
  }

  private buildCourseOverview(
    course: Course,
    assignments: Assignment[],
    gradeMap: Map<string, Grade>
  ): string {
    const now     = Date.now()
    const graded  = assignments.filter(a => gradeMap.get(a.id)?.workflowState === 'graded')
    const overdue = assignments.filter(a => a.dueAt && a.dueAt < now && !gradeMap.has(a.id))
    const upcoming = assignments
      .filter(a => a.dueAt && a.dueAt > now)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
      .slice(0, 5)

    const earnedPts = graded.reduce((s, a) => s + (gradeMap.get(a.id)?.score ?? 0), 0)
    const totalPts  = graded.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)
    const pct       = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : null

    const lines = [
      `# ${course.name}`,
      '',
      '---',
      `**Code:** ${course.courseCode ?? '—'}`,
      `**Term:** ${course.term ?? '—'}`,
      `**Current grade:** ${pct != null ? `${pct}%` : 'No graded assignments yet'}`,
      '---',
      '',
    ]

    if (overdue.length > 0) {
      lines.push('## ⚠️ Overdue', '')
      for (const a of overdue) {
        lines.push(`- [[Assignments/${sanitizePath(a.title)}|${a.title}]]`)
      }
      lines.push('')
    }

    if (upcoming.length > 0) {
      lines.push('## 📅 Upcoming', '')
      for (const a of upcoming) {
        const due = a.dueAt ? format(new Date(a.dueAt), 'EEE MMM d · h:mm a') : 'No due date'
        lines.push(`- [[Assignments/${sanitizePath(a.title)}|${a.title}]] — ${due}`)
      }
      lines.push('')
    }

    lines.push('## All assignments', '')
    for (const a of assignments) {
      const g   = gradeMap.get(a.id)
      const due = a.dueAt ? format(new Date(a.dueAt), 'MMM d') : '—'
      const score = g?.workflowState === 'graded' && g.score != null
        ? ` · ${g.score}/${a.pointsPossible}`
        : ''
      lines.push(`- [[Assignments/${sanitizePath(a.title)}|${a.title}]] (${due})${score}`)
    }

    return lines.join('\n')
  }

  private buildAssignmentNote(
    assignment: Assignment,
    course: Course,
    grade?: Grade
  ): string {
    const lines: string[] = []

    // YAML front-matter — makes assignments queryable in Obsidian Dataview
    lines.push('---')
    lines.push(`title: "${escapeFrontMatter(assignment.title)}"`)
    lines.push(`course: "${escapeFrontMatter(course.name)}"`)
    lines.push(`due: ${assignment.dueAt ? format(new Date(assignment.dueAt), 'yyyy-MM-dd') : 'null'}`)
    lines.push(`points_possible: ${assignment.pointsPossible ?? 'null'}`)
    lines.push(`grading_type: ${assignment.gradingType}`)
    if (grade) {
      lines.push(`score: ${grade.score ?? 'null'}`)
      lines.push(`grade: ${grade.grade ?? 'null'}`)
      lines.push(`status: ${grade.workflowState}`)
    } else {
      lines.push(`status: unsubmitted`)
    }
    lines.push(`tags: [assignment, ${sanitizeTag(course.name)}]`)
    lines.push('---')
    lines.push('')

    lines.push(`# ${assignment.title}`)
    lines.push('')
    lines.push(`**Course:** [[_Course Overview|${course.name}]]`)

    if (assignment.dueAt) {
      lines.push(`**Due:** ${format(new Date(assignment.dueAt), 'EEEE, MMMM d, yyyy · h:mm a')}`)
    }
    if (assignment.pointsPossible != null) {
      lines.push(`**Points:** ${assignment.pointsPossible}`)
    }

    // Grade block
    if (grade?.workflowState === 'graded') {
      lines.push('')
      lines.push('## Grade')
      lines.push('')
      lines.push(`**Score:** ${grade.score ?? '—'} / ${assignment.pointsPossible ?? '—'}`)
      if (grade.grade) lines.push(`**Grade:** ${grade.grade}`)
      if (grade.isLate) lines.push('> 🕐 Submitted late')
      if (grade.submissionComments.length > 0) {
        lines.push('')
        lines.push('### Instructor feedback')
        for (const c of grade.submissionComments) {
          lines.push('')
          lines.push(`> **${c.authorName}**`)
          lines.push(`> ${c.comment.replace(/\n/g, '\n> ')}`)
        }
      }
    }

    // Instructions
    if (assignment.descriptionPlain) {
      lines.push('')
      lines.push('## Instructions')
      lines.push('')
      lines.push(htmlToMarkdown(assignment.descriptionHtml ?? assignment.descriptionPlain))
    }

    // Submission info
    if (assignment.submissionTypes.length > 0 && !assignment.submissionTypes.includes('none')) {
      lines.push('')
      lines.push('## Submission')
      lines.push('')
      lines.push(`Submit via: ${assignment.submissionTypes.map(t => t.replace(/_/g, ' ')).join(', ')}`)
      if (assignment.allowedExtensions.length > 0) {
        lines.push(`Accepted file types: ${assignment.allowedExtensions.map(e => `.${e}`).join(', ')}`)
      }
    }

    // Rubric
    if (assignment.rubric && assignment.rubric.length > 0) {
      lines.push('')
      lines.push('## Rubric')
      lines.push('')
      lines.push('| Criterion | Points |')
      lines.push('|-----------|--------|')
      for (const c of assignment.rubric) {
        lines.push(`| ${c.description} | ${c.points} |`)
      }
    }

    // Notes section for the student
    lines.push('')
    lines.push('## My Notes')
    lines.push('')
    lines.push('<!-- Add your notes here -->')

    return lines.join('\n')
  }

  private buildModuleOverview(
    module: Module,
    items: ModuleItem[],
    course: Course
  ): string {
    const lines = [
      `# ${module.name}`,
      '',
      `**Course:** [[../_Course Overview|${course.name}]]`,
      `**Items:** ${items.length}`,
      '',
      '## Contents',
      '',
    ]

    for (const item of items) {
      if (item.type === 'SubHeader') {
        lines.push(`### ${item.title}`)
        continue
      }
      const prefix = {
        Assignment:  '📝',
        Quiz:        '📋',
        File:        '📄',
        Page:        '📖',
        Discussion:  '💬',
        ExternalUrl: '🔗',
        ExternalTool:'🛠️',
      }[item.type] ?? '•'

      if (item.type === 'Assignment') {
        lines.push(`- ${prefix} [[../../Assignments/${sanitizePath(item.title)}|${item.title}]]`)
      } else if (item.type === 'ExternalUrl' && item.url) {
        lines.push(`- ${prefix} [${item.title}](${item.url})`)
      } else {
        lines.push(`- ${prefix} ${item.title}`)
      }
    }

    return lines.join('\n')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizePath(name: string): string {
  return name
    .replace(/[/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function sanitizeTag(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
}

function escapeFrontMatter(s: string): string {
  return s.replace(/"/g, '\\"')
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

/** Minimal HTML → Markdown converter for assignment descriptions. */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi,   (_, t) => `\n## ${stripTags(t)}\n`)
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi,     (_, t) => `**${stripTags(t)}**`)
    .replace(/<b[^>]*>(.*?)<\/b>/gi,               (_, t) => `**${stripTags(t)}**`)
    .replace(/<em[^>]*>(.*?)<\/em>/gi,             (_, t) => `*${stripTags(t)}*`)
    .replace(/<i[^>]*>(.*?)<\/i>/gi,               (_, t) => `*${stripTags(t)}*`)
    .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, url, t) => `[${stripTags(t)}](${url})`)
    .replace(/<li[^>]*>(.*?)<\/li>/gi,             (_, t) => `- ${stripTags(t)}`)
    .replace(/<br\s*\/?>/gi,                       '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi,              (_, t) => `\n${stripTags(t)}\n`)
    .replace(/<[^>]+>/g,                           '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}
