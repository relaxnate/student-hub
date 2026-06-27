// The "brain" of the built-in Student Hub AI — a deterministic, $0, offline
// assistant. It detects what the student is asking, pulls the answer from their
// REAL synced data (reusing the same ToolExecutor the LLM providers use, so the
// numbers always match the rest of the app) and/or the curated knowledge base,
// and composes a friendly, grounded reply. No network, no model, no cost.
//
// It deliberately does NOT try to be a general chatbot. For open-ended questions
// (essay help, explaining a concept) it says so and points the student at a full
// AI provider — being honest beats hallucinating.
import { executeTool } from '../tools/ToolExecutor'
import { CourseRepository } from '../../database/repositories'
import { computeCumulativeGpa } from '@shared/lib/gpa'
import { matchKnowledge } from './knowledgeBase'

const courseRepo = new CourseRepository()

interface ResolvedCourse { id: string; name: string }

export async function answerStudentQuestion(rawText: string): Promise<string> {
  const text = rawText.toLowerCase().trim()
  if (!text) return greeting()

  const course = resolveCourse(text)
  const target = extractTarget(text)

  // 1) "What do I need on the rest / to get an A in X"
  if (/(what|how much|grade).*(need|get|keep|score)|need (a|to|on)|to (get|keep|hit|earn) (a|an|my)/.test(text)
      && (/(need|get|keep|hit|earn|stay)/.test(text))) {
    if (/(gpa)/.test(text) === false && (target != null || /\b(a|b|c|d)\b/.test(text))) {
      if (!course) return needCoursePrompt('figure out the score you need')
      if (target == null) return `Which grade are you aiming for in **${course.name}** — e.g. "90%" or "an A"? Then I'll calculate the score you need on what's left.`
      const r = await tool('calculate_needed_score', { courseId: course.id, targetGrade: target })
      return wrap(r)
    }
  }

  // 2) Missing / overdue work
  if (/(missing|overdue|late work|didn'?t (turn|hand) in|haven'?t (done|submitted)|past due|zeros?)/.test(text)) {
    const r = await tool('get_missing_assignments', {})
    return wrap(r, `Here's what's missing or overdue — clearing zeros is the fastest way to lift an average:`)
  }

  // 3) Upcoming / due
  if (/(due|upcoming|this week|next week|today|tomorrow|coming up|deadlines?|what.*do i have)/.test(text)) {
    const days = /today|tonight/.test(text) ? 1 : /tomorrow/.test(text) ? 2 : /two weeks|2 weeks|next week/.test(text) ? 14 : 7
    const r = await tool('get_upcoming_assignments', { withinDays: days })
    return wrap(r)
  }

  // 4) GPA
  if (/\bgpa\b|grade point|cumulative/.test(text)) {
    const r = await tool('get_gpa_summary', {})
    return wrap(r, `Here's your GPA snapshot:`)
  }

  // 5) Lowest / hardest / struggling class
  if (/(lowest|worst|hardest|struggling|failing|behind|weakest|drag).*(class|course|grade|subject)|where am i (losing|struggling)/.test(text)) {
    return wrap(lowestCourseAdvice())
  }

  // 6) Specific course grade ("how am I doing in X", "my X grade")
  if (course && /(grade|doing|score|standing|how am i|how'?s my|where do i stand)/.test(text)) {
    const r = await tool('get_grades', { courseId: course.id })
    return wrap(r)
  }

  // 7) All grades / report card
  if (/(my grades|all my grades|report card|every class|all my classes|my classes|overview|how am i doing)/.test(text)) {
    const r = await tool('get_courses', {})
    return wrap(r, `Here's where every active class stands:`)
  }

  // 8) Study plan / focus / prioritize
  if (/(focus|prioriti|study plan|what should i (do|study|work)|where (do|should) i start|plan my)/.test(text)) {
    return await studyPlan()
  }

  // 9) Raising a grade (knowledge + their data)
  if (/(raise|improve|bring up|boost|get an a|do better|fix my grade)/.test(text)) {
    const kb = matchKnowledge('raise my grade')
    const missing = await tool('get_missing_assignments', {})
    const tip = course
      ? `\n\nFor **${course.name}** specifically, ask "what do I need to get an A in ${course.name}?" and I'll do the math.`
      : ''
    return `${kb[0]?.body ?? ''}\n\n${missing}${tip}`
  }

  // 10) Knowledge-base (policy/how-does-X-work) questions
  const kb = matchKnowledge(text)
  if (kb.length) {
    return kb.slice(0, 2).map(e => `**${e.title}**\n${e.body}`).join('\n\n')
  }

  // 11) Greetings / capabilities
  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening)|what'?s up)\b/.test(text) || /(what can you do|who are you|help|how do you work|what are you)/.test(text)) {
    return greeting()
  }

  // 12) Fallback — be honest about scope.
  return fallback()
}

// ─── Composition helpers ─────────────────────────────────────────────────────
async function tool(name: string, args: Record<string, unknown>): Promise<string> {
  const r = await executeTool(name, JSON.stringify(args))
  return r.content
}

function wrap(body: string, lead?: string): string {
  return lead ? `${lead}\n\n${body}` : body
}

async function studyPlan(): Promise<string> {
  const missing = await tool('get_missing_assignments', {})
  const upcoming = await tool('get_upcoming_assignments', { withinDays: 7 })
  const low = lowestCourseAdvice()
  return [
    `Here's a quick plan, highest-impact first:`,
    `**1. Clear missing work** (zeros hurt most)\n${missing}`,
    `**2. Stay ahead of what's due**\n${upcoming}`,
    `**3. Protect your lowest grade**\n${low}`,
  ].join('\n\n')
}

function lowestCourseAdvice(): string {
  const active = courseRepo.getActive().filter(c => c.currentScore != null)
  if (!active.length) return `I don't have grades for your active courses yet — try a sync first.`
  const sorted = [...active].sort((a, b) => (a.currentScore ?? 100) - (b.currentScore ?? 100))
  const lowest = sorted[0]
  const others = sorted.slice(1, 3).map(c => `${c.name} (${c.currentScore!.toFixed(1)}%)`).join(', ')
  return `Your lowest active grade right now is **${lowest.name}** at **${lowest.currentScore!.toFixed(1)}%** ` +
    `(${lowest.currentGrade ?? ''}). That's where extra effort moves your GPA the most.` +
    (others ? ` Next up: ${others}.` : '') +
    `\n\nAsk "what's missing in ${lowest.name}?" or "what do I need to get a B in ${lowest.name}?" and I'll dig in.`
}

function greeting(): string {
  const active = courseRepo.getActive()
  const gpa = computeCumulativeGpa(courseRepo.getAll())
  const ctx = active.length
    ? `I can see your ${active.length} active course${active.length === 1 ? '' : 's'}${gpa != null ? ` and your ${gpa.toFixed(2)} GPA` : ''}.`
    : `Once you sync a course platform I'll be able to see your classes and grades.`
  return `Hey! I'm the built-in **Student Hub assistant** — free, private, and instant (I run right here on your device, no internet or API key needed). ${ctx}

I'm great at questions about **your own data and school stuff**, like:
• "What's due this week?" · "What's missing?"
• "What's my GPA?" · "How am I doing in [class]?"
• "What do I need on the rest to get an A in [class]?"
• "How does credit recovery / grade replacement / weighted GPA work?"

For open-ended things (explaining a topic, writing help), switch to a full AI model in the gear menu — those are smarter but use the internet. What would you like to know?`
}

function fallback(): string {
  return `I'm the built-in, offline assistant, so I'm focused on **your academic data and school questions** rather than open-ended chat. Try:
• "What's due this week?" or "What's missing?"
• "What's my GPA?" or "How am I doing in [class]?"
• "What do I need to get an A in [class]?"
• "How does credit recovery / grade replacement / weighted GPA work?"

For broader questions (explaining a concept, brainstorming, writing), pick a full AI model from the gear menu — it's more capable but uses the internet/an API key.`
}

function needCoursePrompt(goal: string): string {
  const active = courseRepo.getActive()
  const names = active.slice(0, 6).map(c => c.name).join(', ')
  return `Which class? Tell me the course name and I'll ${goal}.` + (names ? ` Your active ones: ${names}.` : '')
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────
function resolveCourse(text: string): ResolvedCourse | null {
  const active = courseRepo.getActive()
  if (!active.length) return null
  // Best match: full name or code substring, else a distinctive word overlap.
  let best: { c: ResolvedCourse; score: number } | null = null
  for (const c of active) {
    const name = c.name.toLowerCase()
    const code = (c.courseCode ?? '').toLowerCase()
    let score = 0
    if (code && text.includes(code)) score = 100
    else if (text.includes(name)) score = 90
    else {
      const words = name.split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOPWORDS.has(w))
      const hits = words.filter(w => text.includes(w)).length
      if (hits) score = 40 + hits * 10
    }
    if (score && (!best || score > best.score)) best = { c: { id: c.id, name: c.name }, score }
  }
  return best?.c ?? null
}

const STOPWORDS = new Set(['class', 'course', 'period', 'honors', 'advanced', 'placement', 'general', 'intro', 'introduction'])

function extractTarget(text: string): number | null {
  const pct = text.match(/(\d{2,3})\s*%/) ?? text.match(/\b(\d{2,3})\b/)
  if (pct) {
    const n = parseInt(pct[1], 10)
    if (n >= 1 && n <= 100) return n
  }
  // Letter grades → conventional minimum percentage for that letter.
  const letter = text.match(/\b(?:an?\s+)?([abcd])(\+|-)?\b/)
  if (letter && /\b(get|keep|hit|earn|need|want|aiming|target|stay)\b/.test(text)) {
    const base: Record<string, number> = { a: 90, b: 80, c: 70, d: 60 }
    return base[letter[1]] ?? null
  }
  return null
}
