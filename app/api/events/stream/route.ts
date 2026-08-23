/**
 * §13.4 / §16.7 — GET /api/events/stream
 *
 * Server-Sent Events. Chosen over WebSocket because the dashboard only needs
 * server -> client push, which is exactly what SSE gives for free.
 *
 * When the real backend arrives it exposes the same endpoint and the client
 * hook is unchanged.
 */

import { subscribe, type StreamMessage } from "@/lib/mock/bus"
import { bootstrap } from "@/lib/mock/http"

export const dynamic = "force-dynamic"

const HEARTBEAT_MS = 20000

export async function GET(request: Request) {
  bootstrap()

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const send = (message: StreamMessage) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode("data: " + JSON.stringify(message) + "\n\n")
          )
        } catch {
          closed = true
        }
      }

      // Tell the client immediately that the pipe is open.
      send({ kind: "ping", at: new Date().toISOString() })

      const unsubscribe = subscribe(send)
      const heartbeat = setInterval(() => {
        send({ kind: "ping", at: new Date().toISOString() })
      }, HEARTBEAT_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime.
        }
      }

      request.signal.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx and friends buffering the stream into uselessness.
      "X-Accel-Buffering": "no",
    },
  })
}
