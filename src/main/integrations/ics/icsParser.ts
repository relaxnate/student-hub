// A small, dependency-free iCalendar (RFC 5545) parser — just enough to pull
// the assignment/quiz/exam DUE DATES out of a student's personal LMS calendar
// feed (Canvas, Schoology, Blackboard, Brightspace, Google, Outlook all expose
// one). We deliberately support only the subset we need (VEVENT + the common
// date forms); anything we don't recognise is ignored rather than throwing, so
// one odd line never breaks the whole feed.
//
// No native modules, no network — pure string work. The fetch happens in the
// adapter (main process) and the raw text is handed here.

export interface IcsEvent {
  uid: string
  summary: string
  description: string | null
  location: string | null
  url: string | null
  categories: string[]
  /** Event start in unix ms. For all-day events this is local midnight. */
  startMs: number
  /** Event end in unix ms, when present. */
  endMs: number | null
  /** True for VALUE=DATE (all-day) events — no specific time of day. */
  allDay: boolean
}

/**
 * Parse an .ics document into a flat list of events. Returns `null` only when
 * the text isn't a calendar at all (no VCALENDAR), so callers can give a clear
 * "that doesn't look like a calendar feed" error. A valid-but-empty calendar
 * returns `[]`.
 */
export function parseIcs(raw: string): IcsEvent[] | null {
  if (!/BEGIN:VCALENDAR/i.test(raw)) return null

  const lines = unfold(raw)
  const events: IcsEvent[] = []
  let cur: Partial<RawEvent> | null = null

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper.startsWith('BEGIN:VEVENT')) { cur = {}; continue }
    if (upper.startsWith('END:VEVENT')) {
      if (cur) { const ev = finalize(cur); if (ev) events.push(ev) }
      cur = null
      continue
    }
    if (!cur) continue

    const parsed = parseLine(line)
    if (!parsed) continue
    const { name, params, value } = parsed

    switch (name) {
      case 'UID':         cur.uid = value; break
      case 'SUMMARY':     cur.summary = unescapeText(value); break
      case 'DESCRIPTION': cur.description = unescapeText(value); break
      case 'LOCATION':    cur.location = unescapeText(value); break
      case 'URL':         cur.url = value.trim(); break
      case 'CATEGORIES':  cur.categories = unescapeText(value).split(',').map(s => s.trim()).filter(Boolean); break
      case 'DTSTART':     { const d = parseIcsDate(value, params); if (d) cur.start = d; break }
      case 'DTEND':       { const d = parseIcsDate(value, params); if (d) cur.end = d; break }
      default: break
    }
  }

  return events
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface RawEvent {
  uid?: string
  summary?: string
  description?: string
  location?: string
  url?: string
  categories?: string[]
  start?: { ms: number; allDay: boolean }
  end?: { ms: number; allDay: boolean }
}

function finalize(cur: Partial<RawEvent>): IcsEvent | null {
  // An event with no start time is useless as a deadline — skip it.
  if (!cur.start) return null
  return {
    uid:         cur.uid?.trim() || `ics-${cur.start.ms}-${(cur.summary ?? '').slice(0, 40)}`,
    summary:     cur.summary?.trim() || 'Untitled',
    description: cur.description ?? null,
    location:    cur.location ?? null,
    url:         cur.url ?? null,
    categories:  cur.categories ?? [],
    startMs:     cur.start.ms,
    endMs:       cur.end?.ms ?? null,
    allDay:      cur.start.allDay,
  }
}

/**
 * Unfold per RFC 5545 §3.1: a CRLF (or LF) immediately followed by a space or
 * tab is a line continuation. We also tolerate lone CRs.
 */
function unfold(raw: string): string[] {
  const physical = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const logical: string[] = []
  for (const line of physical) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && logical.length > 0) {
      logical[logical.length - 1] += line.slice(1)
    } else {
      logical.push(line)
    }
  }
  return logical
}

interface ParsedLine { name: string; params: Record<string, string>; value: string }

/**
 * Split "NAME;PARAM=val;PARAM2=val:VALUE" into its pieces. The value starts at
 * the first colon that isn't inside a quoted parameter value.
 */
function parseLine(line: string): ParsedLine | null {
  let colon = -1
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuote = !inQuote
    else if (ch === ':' && !inQuote) { colon = i; break }
  }
  if (colon === -1) return null

  const head  = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segments = head.split(';')
  const name = segments[0].toUpperCase()
  const params: Record<string, string> = {}
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i].indexOf('=')
    if (eq === -1) continue
    params[segments[i].slice(0, eq).toUpperCase()] = segments[i].slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

/**
 * Parse an iCal date/date-time value into unix ms.
 *  - `20260315`               → all-day (VALUE=DATE), interpreted as local midnight.
 *  - `20260315T140000Z`       → UTC instant.
 *  - `20260315T140000`        → floating / TZID local time. We don't ship a full
 *    timezone database, so a TZID time is interpreted in the machine's local
 *    zone — an acceptable approximation for "when is this due" (and most Canvas
 *    feeds emit UTC `Z` times anyway).
 * Returns null for anything unparseable.
 */
function parseIcsDate(value: string, params: Record<string, string>): { ms: number; allDay: boolean } | null {
  const v = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v)
    if (!m) return null
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    return Number.isNaN(ms) ? null : { ms, allDay: true }
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v)
  if (!dt) return null
  const [, y, mo, d, h, mi, s, z] = dt
  const ms = z === 'Z'
    ? Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
    : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime()
  return Number.isNaN(ms) ? null : { ms, allDay: false }
}

/** Reverse RFC 5545 text escaping (\n \, \; \\). */
function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}
