// Minimal Server-Sent Events parser for Node's web-stream `Response.body`
// (available on Node 18+ / Electron 28). Used by every OpenAI-compatible adapter
// (OpenRouter / OpenAI / Groq / FreeTier) and adapted by Anthropic/Google.
//
// Yields the raw payload string after each `data: ` line. The caller JSON-parses
// and interprets it. `[DONE]` (OpenAI's terminator) is filtered out — iteration
// simply ends. Honours an AbortSignal by stopping iteration.

export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by a blank line; lines within an event are
      // split by \n. We process line-by-line and emit each `data:` payload.
      let nlIndex: number
      while ((nlIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIndex).replace(/\r$/, '')
        buffer = buffer.slice(nlIndex + 1)

        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '' || payload === '[DONE]') continue
        yield payload
      }
    }
    // Flush any trailing buffered data line (no terminating newline).
    const tail = buffer.trim()
    if (tail.startsWith('data:')) {
      const payload = tail.slice(5).trim()
      if (payload && payload !== '[DONE]') yield payload
    }
  } finally {
    try { await reader.cancel() } catch { /* already closed */ }
  }
}

/**
 * Anthropic & Google emit `event:`/`data:` pairs; for those we still only need
 * the `data:` JSON payloads, so the same parser works. This re-export documents
 * that intent at call sites.
 */
export const parseEventStream = parseSSEStream
