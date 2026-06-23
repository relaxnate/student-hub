import { dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ─── Crash visibility ───────────────────────────────────────────────────────
// Packaged Windows Electron builds frequently don't surface console.log /
// console.error output at all — even for a real crash — because the main
// process executable is built with the Windows GUI subsystem and Chromium's
// own stdio redirection in release builds often disconnects it from any
// terminal that launched it. That means a startup failure can look
// EXACTLY like "the app does nothing" with zero visible evidence, even when
// double-clicking or running it from a terminal.
//
// To make any startup failure impossible to miss, this writes a plain-text
// log to the OS temp directory (no dependency on Electron's `app` module
// being ready or even functional) AND shows a native Win32/Cocoa/GTK error
// dialog via `dialog.showErrorBox`, which is NOT subject to the stdio issue
// above since it doesn't go through stdout/stderr at all.

export const CRASH_LOG_PATH = path.join(os.tmpdir(), 'student-hub-crash.log')

function write(entry: string): void {
  try {
    fs.appendFileSync(CRASH_LOG_PATH, entry)
  } catch {
    // Best effort only — if even the temp dir isn't writable, there's
    // nothing further we can do to persist this.
  }
  // Still attempt console output in case this IS running somewhere that can
  // see it (e.g. `npm run dev`, or a future debug build with a console).
  console.error(entry)
}

/** Append a non-fatal diagnostic line. No dialog — used for expected,
 *  non-error conditions we still want a record of (e.g. a legitimate
 *  second-instance launch quitting in favor of the first). */
export function logDebug(label: string): void {
  write(`\n[${new Date().toISOString()}] [info] ${label}\n`)
}

/** Log a fatal startup error to disk AND show a visible native dialog with
 *  the full error and where to find the log. */
export function logCrash(label: string, err: unknown): void {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
  write(`\n[${new Date().toISOString()}] [FATAL] ${label}\n${message}\n`)

  try {
    dialog.showErrorBox(
      'Student Hub failed to start',
      `${label}\n\n${message}\n\n` +
      `A full log was saved to:\n${CRASH_LOG_PATH}\n\n` +
      `Please share this file (or its contents) to get this fixed.`
    )
  } catch {
    // In extremely early-startup edge cases `dialog` itself may not be
    // usable yet — the log file on disk is the guaranteed fallback.
  }
}
