import crypto from 'crypto'
import { IntegrationAdapter } from '../base/IntegrationAdapter'
import type { OAuthConfig, TokenResponse } from '../base/IntegrationAdapter'
import { TokenExpiredError, APIError, NetworkError } from '../base/errors'
import type {
  Course, Module, ModuleItem, Assignment, AssignmentAttachment,
  AssignmentGroup, CourseFile, CoursePage, Quiz, Grade, CalendarEvent,
} from '@shared/types/entities'
import { parseIcs, type IcsEvent } from './icsParser'

// ─── Calendar-feed (ICS) integration ─────────────────────────────────────────
//
// The universal, no-approval, no-cost integration: the student pastes their
// personal calendar-feed URL (every major LMS — Canvas, Schoology, Blackboard,
// Brightspace — plus Google Calendar / Outlook exposes one) and we subscribe to
// it. On each sync we fetch the .ics over HTTP (no auth header — the secret is
// the unguessable URL itself), parse the VEVENTs, and map each to a lightweight
// ASSIGNMENT/deadline record so it flows into the dashboard, calendar, reminders,
// and the AI Helper's "what's due" — exactly like a real LMS assignment, just
// without grades/submission data (which ICS feeds don't carry).
//
// Why this shape: it reuses the existing token-connect plumbing (the feed URL is
// stored encrypted like a token), the SyncEngine's course→assignment flow, and
// every downstream view, with zero new schema. See the vault research doc
// "Integrations Expansion — Platform Research" for the full rationale.
//
// Limitations (by design): due dates + titles only — no grades, no submission
// status, no files. Read-only. The OAuth methods are intentionally unsupported;
// ICS connects via OAuthManager.connectCalendarFeed (a token-style flow).

interface FeedCache {
  fetchedAt: number
  events:    IcsEvent[]
  calName:   string | null
}

// Reuse a recent parse across the calls a single sync makes (fetchCourses, then
// per-course fetchAssignments) instead of downloading the feed several times.
const CACHE_TTL_MS = 2 * 60 * 1000
// Defensive cap so a pathological feed can't create tens of thousands of rows.
const MAX_EVENTS = 2000
const DEFAULT_COURSE_NAME = 'Calendar feed'

export class IcsCalendarAdapter extends IntegrationAdapter {
  readonly provider    = 'ics-calendar' as const
  readonly displayName = 'Calendar Feed'

  private cache: FeedCache | null = null

  // baseUrl carries the feed URL (the credential is also stored as the token, so
  // either is available); a friendly label is used for the connected-account name.
  constructor(feedUrl: string, private label?: string) {
    super(feedUrl)
  }

  // ─── OAuth (not used — ICS is a pasted feed URL) ───────────────────────────
  getOAuthConfig(): OAuthConfig {
    throw new Error('Calendar feeds use a pasted URL, not OAuth.')
  }
  async exchangeCodeForToken(): Promise<TokenResponse> {
    throw new Error('Calendar feeds use a pasted URL, not OAuth.')
  }
  async refreshAccessToken(): Promise<TokenResponse> {
    throw new Error('Calendar feeds use a pasted URL, not OAuth.')
  }

  // The feed URL is the credential — stored via setTokens()/TokenStore — with the
  // constructor baseUrl as a fallback (used when restored from base_url only).
  private get feedUrl(): string {
    return (this.accessToken || this.baseUrl || '').trim()
  }

  /** Short stable id derived from the feed URL, so all rows for one feed share it. */
  private get feedHash(): string {
    return crypto.createHash('sha1').update(this.feedUrl).digest('hex').slice(0, 10)
  }

  // ─── Fetch + parse (cached per short window) ───────────────────────────────
  private async loadFeed(force = false): Promise<FeedCache> {
    if (!force && this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache
    }
    const url = this.feedUrl
    if (!url) throw new TokenExpiredError()

    // Browsers/LMS often hand out the feed as webcal:// — that's just http(s).
    const httpUrl = url.replace(/^webcal:\/\//i, 'https://')

    let res: Response
    try {
      res = await fetch(httpUrl, {
        headers: { 'Accept': 'text/calendar, text/plain, */*' },
        redirect: 'follow',
      })
    } catch (cause) {
      throw new NetworkError(cause)
    }
    if (res.status === 401 || res.status === 403) throw new TokenExpiredError()
    if (!res.ok) throw new APIError(res.status, await res.text().catch(() => ''))

    const text = await res.text()
    const events = parseIcs(text)
    if (events === null) {
      throw new APIError(422, 'That URL did not return a calendar (no VCALENDAR found).')
    }

    // Newest first, capped — keeps the most relevant upcoming/recent deadlines.
    events.sort((a, b) => b.startMs - a.startMs)
    const capped = events.slice(0, MAX_EVENTS)
    const calNameMatch = /X-WR-CALNAME:(.+)/i.exec(text)
    const calName = calNameMatch ? calNameMatch[1].trim() : null

    this.cache = { fetchedAt: Date.now(), events: capped, calName }
    return this.cache
  }

  // ─── Profile (also the connect-time validation) ────────────────────────────
  async fetchUserProfile() {
    const feed = await this.loadFeed(true)
    const name = this.label?.trim() || feed.calName || DEFAULT_COURSE_NAME
    // Stable per-feed id so reconnecting the same URL updates rather than dupes.
    return { id: this.feedHash, name, email: null }
  }

  // ─── Courses: group events into synthetic "courses" ────────────────────────
  // Many LMS feeds tag each event with its course either as a trailing "[Course]"
  // in the SUMMARY (Canvas) or via CATEGORIES. We group by that so a multi-course
  // feed shows as multiple courses; otherwise everything lands in one feed course.
  async fetchCourses(): Promise<Course[]> {
    const feed = await this.loadFeed(true)
    const groups = this.groupByCourse(feed.events, feed.calName)
    const now = Date.now()
    return [...groups.entries()].map(([slug, g]) => ({
      id:            `ics-course-${this.feedHash}-${slug}`,
      integrationId: '',          // filled in by SyncEngine
      externalId:    slug,
      name:          g.name,
      courseCode:    null,
      description:   null,
      color:         null,
      term:          null,
      startDate:     null,
      endDate:       null,
      isActive:      true,        // a subscribed feed is always "current"
      currentScore:  null,        // ICS carries no grades
      currentGrade:  null,
      applyGroupWeights: false,
      syncedAt:      now,
    }))
  }

  // ─── Assignments: the events for one course group, as deadline records ──────
  async fetchAssignments(
    courseId: string, externalCourseId: string
  ): Promise<{ assignments: Assignment[]; attachments: AssignmentAttachment[] }> {
    const feed = await this.loadFeed()
    const groups = this.groupByCourse(feed.events, feed.calName)
    const group = groups.get(externalCourseId)
    const now = Date.now()

    const assignments: Assignment[] = (group?.events ?? []).map(ev => {
      const uidHash = crypto.createHash('sha1').update(ev.uid).digest('hex').slice(0, 12)
      return {
        id:               `ics-assignment-${this.feedHash}-${uidHash}`,
        courseId,
        externalId:       ev.uid,
        title:            ev.title,
        descriptionHtml:  null,
        descriptionPlain: ev.description,
        dueAt:            ev.startMs,
        unlockAt:         null,
        lockAt:           ev.endMs,
        pointsPossible:   null,
        gradingType:      'not_graded',  // keeps it out of GPA math (no score in ICS)
        submissionTypes:  ['none'],
        allowedExtensions: [],
        rubric:           null,
        isPublished:      true,
        isMuted:          false,
        position:         null,
        assignmentGroupId: null,
        syncedAt:         now,
      }
    })
    return { assignments, attachments: [] }
  }

  // ─── Everything else ICS doesn't provide ───────────────────────────────────
  async fetchModules(): Promise<Module[]> { return [] }
  async fetchModuleItems(): Promise<ModuleItem[]> { return [] }
  async fetchAssignmentGroups(): Promise<AssignmentGroup[]> { return [] }
  async fetchFiles(): Promise<CourseFile[]> { return [] }
  async fetchPages(): Promise<CoursePage[]> { return [] }
  async fetchQuizzes(): Promise<Quiz[]> { return [] }
  async fetchGrades(): Promise<Grade[]> { return [] }
  // Mapped to assignments (above) instead of calendar_events, so deadlines don't
  // appear twice on the calendar (which renders assignments AND events).
  async fetchCalendarEvents(): Promise<CalendarEvent[]> { return [] }

  // ─── Grouping helper ───────────────────────────────────────────────────────
  private groupByCourse(
    events: IcsEvent[], calName: string | null
  ): Map<string, { name: string; events: { uid: string; title: string; description: string | null; startMs: number; endMs: number | null }[] }> {
    const defaultName = calName || this.label?.trim() || DEFAULT_COURSE_NAME
    const map = new Map<string, { name: string; events: { uid: string; title: string; description: string | null; startMs: number; endMs: number | null }[] }>()

    for (const ev of events) {
      const { course, title } = splitCourse(ev.summary, ev.categories)
      const name = course ?? defaultName
      const slug = slugify(name)
      if (!map.has(slug)) map.set(slug, { name, events: [] })
      map.get(slug)!.events.push({
        uid: ev.uid, title, description: ev.description, startMs: ev.startMs, endMs: ev.endMs,
      })
    }
    // A feed with zero events still needs one course so the integration isn't empty.
    if (map.size === 0) map.set('all', { name: defaultName, events: [] })
    return map
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull the course out of a Canvas-style "Title [Course Name]" summary, or fall
 *  back to the first CATEGORIES value. Returns the cleaned title either way. */
function splitCourse(summary: string, categories: string[]): { course: string | null; title: string } {
  const m = /^(.*)\s\[([^\]]+)\]\s*$/.exec(summary)
  if (m && m[2].trim()) return { course: m[2].trim(), title: m[1].trim() || summary }
  if (categories.length > 0) return { course: categories[0], title: summary }
  return { course: null, title: summary }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'all'
}
