import { useEffect, useState } from 'react'
import { api } from '../../lib/ipc'
import type { Course, Assignment, Grade } from '@shared/types/entities'

// Shared dashboard data loader — one fetch of every course's assignments + grades,
// merged. Consumed by both the legacy widget dashboard and the new DashboardHome.

export interface DashboardData {
  courses:     Course[]
  assignments: (Assignment & { course?: Course; grade?: Grade })[]
  loading:     boolean
}

export function useDashboardData(isSyncing: boolean, showHistory: boolean): DashboardData {
  const [courses,     setCourses]     = useState<Course[]>([])
  const [assignments, setAssignments] = useState<(Assignment & { course?: Course; grade?: Grade })[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const cRes = await (showHistory ? api.courses.getAllIncludingInactive() : api.courses.getAll())
      if (!cRes.ok || cancelled) { setLoading(false); return }
      const courseList = cRes.data
      const courseMap  = new Map(courseList.map((c: Course) => [c.id, c]))
      if (!cancelled) setCourses(courseList)

      const all: (Assignment & { course?: Course; grade?: Grade })[] = []
      await Promise.all(courseList.map(async (c: Course) => {
        const [aRes, gRes] = await Promise.all([
          api.assignments.getByCourse(c.id),
          api.grades.getByCourse(c.id),
        ])
        if (cancelled) return
        const gMap = new Map((gRes.ok ? gRes.data : []).map((g: Grade) => [g.assignmentId, g]))
        if (aRes.ok) aRes.data.forEach((a: Assignment) => all.push({
          ...a,
          course: courseMap.get(a.courseId) as Course | undefined,
          grade:  gMap.get(a.id) as Grade | undefined,
        }))
      }))
      if (!cancelled) { setAssignments(all); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [isSyncing, showHistory])

  return { courses, assignments, loading }
}
