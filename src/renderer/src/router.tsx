import React, { lazy, Suspense } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Spinner } from './components/ui/Badge'

const Welcome          = lazy(() => import('./pages/Welcome/Welcome'))
const Dashboard        = lazy(() => import('./pages/Dashboard/Dashboard'))
const Courses          = lazy(() => import('./pages/Courses/Courses'))
const CourseDetail     = lazy(() => import('./pages/Courses/CourseDetail'))
const Modules          = lazy(() => import('./pages/Modules/Modules'))
const Assignments      = lazy(() => import('./pages/Assignments/Assignments'))
const AssignmentDetail = lazy(() => import('./pages/Assignments/AssignmentDetail'))
const PageViewer       = lazy(() => import('./pages/Pages/PageViewer'))
const QuizDetail       = lazy(() => import('./pages/Quizzes/QuizDetail'))
const CurrentGrades    = lazy(() => import('./pages/Grades/CurrentGrades'))
const GpaCalculator    = lazy(() => import('./pages/Grades/GpaCalculator'))
const Simulator        = lazy(() => import('./pages/Simulator/Simulator'))
const Calendar         = lazy(() => import('./pages/Calendar/Calendar'))
const Files            = lazy(() => import('./pages/Files/Files'))
const GradeRescue      = lazy(() => import('./pages/GradeRescue/GradeRescue'))
const History          = lazy(() => import('./pages/History/History'))
const Settings         = lazy(() => import('./pages/Settings/Settings'))

export function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner size={20} /></div>}>
      {children}
    </Suspense>
  )
}

// The page routes (children of the AppShell layout). Exported so split-screen
// secondary panes can render the same pages in their own MemoryRouters without
// the AppShell chrome. See components/layout/SplitPane.tsx.
import type { RouteObject } from 'react-router-dom'

export const PAGE_ROUTES: RouteObject[] = [
  { index: true,                   element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard',             element: <LazyPage><Dashboard /></LazyPage> },
  { path: 'courses',               element: <LazyPage><Courses /></LazyPage> },
  { path: 'courses/:courseId',     element: <LazyPage><CourseDetail /></LazyPage> },
  { path: 'modules',               element: <LazyPage><Modules /></LazyPage> },
  { path: 'assignments',           element: <LazyPage><Assignments /></LazyPage> },
  { path: 'assignments/:id',       element: <LazyPage><AssignmentDetail /></LazyPage> },
  { path: 'pages/:courseId/:url',  element: <LazyPage><PageViewer /></LazyPage> },
  { path: 'quizzes/:id',           element: <LazyPage><QuizDetail /></LazyPage> },
  { path: 'grades',                element: <LazyPage><CurrentGrades /></LazyPage> },
  { path: 'grade-calculator',      element: <LazyPage><GpaCalculator /></LazyPage> },
  { path: 'calendar',              element: <LazyPage><Calendar /></LazyPage> },
  { path: 'files',                 element: <LazyPage><Files /></LazyPage> },
  { path: 'grade-rescue',          element: <LazyPage><GradeRescue /></LazyPage> },
  { path: 'simulator',             element: <LazyPage><Simulator /></LazyPage> },
  { path: 'history',               element: <LazyPage><History /></LazyPage> },
  { path: 'settings',              element: <LazyPage><Settings /></LazyPage> },
  { path: 'settings/integrations', element: <LazyPage><Settings /></LazyPage> },
]

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: PAGE_ROUTES,
  },
  { path: '/welcome', element: <LazyPage><Welcome /></LazyPage> },
])
