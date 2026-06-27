// Canonical GPA conversion now lives in @shared/lib/gpa so BOTH the renderer and
// the main-process AI tools share one implementation (Session 014). This file
// re-exports it unchanged so every existing renderer import path keeps working.
export * from '@shared/lib/gpa'
