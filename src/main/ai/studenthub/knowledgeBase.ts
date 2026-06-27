// Curated academic knowledge base for the built-in Student Hub AI.
//
// This is the "school smarts" the assistant uses to answer policy/how-does-X-work
// questions (grading scales, GPA, retakes, credit recovery, etc.) WITHOUT calling
// any paid model. Each entry is matched by keyword and rendered as a concise,
// friendly explanation.
//
// IMPORTANT — accuracy posture: grading/retake rules VARY by school and district,
// so every entry explains the common/standard case and then tells the student to
// confirm specifics in their own course syllabus / student handbook. We never
// assert a specific school's policy as fact.
//
// v1 content is authored from well-established, stable academic knowledge. It is
// structured to be extended with cited sources later (see vault Session 016 — the
// WebSearch quota was exhausted mid-research; grounding citations are queued).

export interface KnowledgeEntry {
  id: string
  /** Lowercased keywords/phrases; a match on any flags this entry as relevant. */
  keywords: string[]
  title: string
  body: string
}

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: 'gpa-basics',
    keywords: ['how is gpa calculated', 'what is gpa', 'gpa calculated', 'calculate gpa', 'gpa work', 'grade point average', 'how does gpa'],
    title: 'How GPA is calculated',
    body:
`GPA (grade point average) converts each course's letter grade to grade points and averages them.

• **Unweighted GPA** uses a 4.0 scale: A = 4.0, B = 3.0, C = 2.0, D = 1.0, F = 0.0 (with +/- variants in between at many schools). Every class counts the same.
• **Cumulative GPA** averages those points across all your courses (sometimes weighted by credit hours).
• Student Hub shows an **equal-weight cumulative GPA on a 4.0 scale** across your synced courses, so it's a clean apples-to-apples number — your school's official transcript GPA may differ if it weights by credits or uses honors/AP bumps.`,
  },
  {
    id: 'weighted-gpa',
    keywords: ['weighted gpa', 'honors', 'ap class', 'ap classes', 'advanced placement', 'ib ', 'dual enrollment', '5.0 scale', 'weighted vs unweighted', 'gpa boost'],
    title: 'Weighted GPA (Honors / AP / IB)',
    body:
`Many high schools use a **weighted GPA** that gives harder courses a bump:

• Standard course: A = 4.0
• Honors course: A often = 4.5
• AP / IB / dual-enrollment: A often = 5.0

So weighted GPAs can exceed 4.0. The exact bump (and whether your school applies it) varies — check your handbook. **Unweighted** GPA ignores course rigor (A = 4.0 everywhere); colleges often recalculate to their own scale, so don't panic about small differences between systems.`,
  },
  {
    id: 'letter-scale',
    keywords: ['grading scale', 'letter grade', 'what grade is', 'percent to letter', 'what letter', 'a b c d f', '90 percent', 'grade cutoff', 'grade scale'],
    title: 'Letter-grade scales',
    body:
`The most common US scale:

• A = 90–100%   • B = 80–89%   • C = 70–79%   • D = 60–69%   • F = below 60%

Many schools add +/- bands (e.g., A− = 90–92, B+ = 87–89) and some use a stricter "7-point" scale (A = 93–100). Your course's syllabus is the source of truth — Student Hub shows the percentage and the letter your LMS reports so they always match what your teacher sees.`,
  },
  {
    id: 'retake-assignment',
    keywords: ['retake', 'redo', 'resubmit', 'redo an assignment', 'retake a test', 'retake quiz', 'second attempt', 'make up', 'makeup', 'corrections', 'test corrections'],
    title: 'Retaking / redoing assignments & tests',
    body:
`Whether you can redo work depends on your teacher's policy — common options:

• **Resubmission**: fix and resubmit before a deadline (common for projects/essays).
• **Test corrections**: earn back a portion of lost points by correcting wrong answers.
• **Retakes**: a fresh attempt, sometimes capped (e.g., the max you can earn is 80%, or it replaces the old score, or they average).
• **Quiz "highest attempt"**: some LMS quizzes keep your best of multiple attempts.

Ask your teacher directly, and check the syllabus for caps and deadlines. If you tell me which course, I can show you which assignments are still hurting your grade the most to prioritize.`,
  },
  {
    id: 'credit-recovery',
    keywords: ['credit recovery', 'recover credit', 'failed a class', 'failed the class', 'retake the course', 'retake a class', 'summer school', 'make up credit', 'graduation requirement', 'didnt pass'],
    title: 'Credit recovery (failing/retaking a course)',
    body:
`If you fail a course you usually need to **recover the credit** to stay on track to graduate. Common paths:

• **Summer school** or a credit-recovery program (often a condensed/online version of the course).
• **Repeating the course** the next term.
• **Online/credit-recovery platforms** (e.g., Edgenuity, APEX) some districts use.

How the failing grade affects your GPA varies (see "grade replacement"). Talk to your **school counselor** early — they manage credit recovery and graduation requirements and can map the fastest route. I can't see counselor info, but I can show your current grades so you know which classes are at risk.`,
  },
  {
    id: 'grade-replacement',
    keywords: ['grade replacement', 'replace my grade', 'replace the grade', 'forgiveness', 'grade forgiveness', 'retake replace gpa', 'does retaking replace', 'expunge', 'remove a grade'],
    title: 'Grade replacement / forgiveness',
    body:
`Some schools have **grade forgiveness / replacement**: when you retake a course, the new grade replaces the old one in your GPA (the old grade may stay on the transcript but stop counting).

Important caveats that vary by district:
• It may only apply to **failed** courses (D/F), not to bump a C to an A.
• There's often a **limit** on how many courses you can replace.
• The original attempt may still appear on the transcript.

This is exactly the kind of rule to confirm with your **counselor or student handbook** — policies differ a lot. If retaking would replace a low grade, it can meaningfully raise your GPA.`,
  },
  {
    id: 'late-work',
    keywords: ['late work', 'late penalty', 'turn in late', 'submit late', 'missing assignment', 'zero', 'no late', 'deduction', 'past due', 'overdue'],
    title: 'Late & missing work',
    body:
`Late policies are teacher-specific, but common patterns are:

• A **flat penalty** (e.g., −10% per day late).
• A **late cutoff** after which work isn't accepted.
• A **"no zero" floor** (some schools set a minimum like 50% for attempted work).

A missing assignment usually counts as a **0**, which hurts your average far more than a low score — so turning in *something* is almost always worth it. Tell me a course and I'll list your missing/overdue work so you can knock out the highest-impact ones first.`,
  },
  {
    id: 'finals-weight',
    keywords: ['final exam', 'finals', 'exam weight', 'final worth', 'how much is the final', 'semester exam', 'exam exemption', 'exempt the final', 'midterm'],
    title: 'Final exams & exam weight',
    body:
`Final/semester exams are often weighted heavily — commonly **10–20% of the semester grade** (sometimes a separate exam grade). Some schools let you **exempt** a final if you have a high enough grade and good attendance.

Because the final is a big chunk, it's usually the highest-leverage thing to study. If you tell me your current grade in a course and what the final is worth, I can estimate the grade you'd need on it to hit a target — or use the "what do I need" question for any course.`,
  },
  {
    id: 'raise-grade',
    keywords: ['raise my grade', 'improve my grade', 'bring up my grade', 'boost my grade', 'how do i get an a', 'extra credit', 'study tips', 'do better'],
    title: 'Raising a grade',
    body:
`Practical ways to raise a grade, roughly in order of impact:

1. **Clear missing work** — zeros sink averages fastest; turning them in is the biggest single lever.
2. **Target heavy categories** — tests/projects usually outweigh homework; check if your course uses weighted categories.
3. **Redo/correct** where allowed (see retakes).
4. **Ask about extra credit** and upcoming high-point assignments.
5. **Front-load the final** if it's weighted.

Tell me a course and I'll pull your missing work and the score you'd need on what's left to reach your target.`,
  },
  {
    id: 'class-rank',
    keywords: ['class rank', 'valedictorian', 'percentile', 'ranked', 'top 10 percent'],
    title: 'Class rank',
    body:
`Class rank orders students by GPA (usually **weighted** GPA). Some schools report an exact rank, others only **deciles/percentiles** (e.g., "top 10%"), and a growing number have dropped rank entirely. Rank isn't in your synced LMS data, so I can't compute it — your counselor or transcript portal has the official number.`,
  },
]

/** Return entries whose keywords appear in the (already lowercased) text. */
export function matchKnowledge(text: string): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(e => e.keywords.some(k => text.includes(k)))
}
