// window.api is injected by the preload script via contextBridge.
// This module re-exports it with a helper that unwraps IPCResult<T>
// and throws on error — so callers get clean data or a thrown Error.

import type { API } from '../../preload/index'

declare global {
  interface Window {
    api: API
  }
}

export const api = window.api

/**
 * Unwrap an IPCResult. Throws an Error if `ok` is false.
 * Use this when you want to `await` a result directly.
 *
 * @example
 * const courses = await unwrap(api.courses.getAll())
 */
export async function unwrap<T>(promise: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const result = await promise
  if (!result.ok) {
    throw new Error(result.error ?? 'Unknown IPC error')
  }
  return result.data as T
}
