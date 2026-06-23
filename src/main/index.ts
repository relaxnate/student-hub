import { app } from 'electron'
import { logCrash } from './crash-logger'

// ─── Bulletproof entry point ──────────────────────────────────────────────────
// This file does almost nothing on purpose. Its only job is to register
// global crash handlers BEFORE anything else in the app's module graph gets
// a chance to run, then load the real application (./app) inside a
// try/catch. That guarantees that even a failure during module loading
// itself — e.g. a native module like better-sqlite3 failing to load — gets
// caught and reported through a visible dialog + log file, instead of the
// process exiting silently with zero evidence of what happened (which is
// exactly what packaged Windows builds tend to do by default).

process.on('uncaughtException', (err) => {
  logCrash('Uncaught exception', err)
  try { app.exit(1) } catch { process.exit(1) }
})

process.on('unhandledRejection', (err) => {
  logCrash('Unhandled promise rejection', err)
})

;(async () => {
  try {
    await import('./app')
  } catch (err) {
    logCrash(
      'Failed to load the application (this usually means a required file or ' +
      'native module — e.g. better-sqlite3 — could not be found or loaded)',
      err
    )
    try {
      await app.whenReady()
    } finally {
      app.exit(1)
    }
  }
})()
