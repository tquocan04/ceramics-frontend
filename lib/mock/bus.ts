/**
 * Process-local pub/sub feeding the SSE endpoint (§13.4).
 *
 * Stands in for whatever the real backend uses to push realtime updates. The
 * client never talks to this directly — it subscribes to /api/events/stream.
 */

import "server-only"

import type { WorkflowEvent } from "@/lib/domain/types"

/** What a connected dashboard receives over SSE. */
export type StreamMessage =
  | { kind: "event"; event: WorkflowEvent }
  | { kind: "invalidate"; scope: "batches" | "orders" | "notifications" | "all" }
  | { kind: "ping"; at: string }

type Subscriber = (message: StreamMessage) => void

const GLOBAL_KEY = Symbol.for("ceramics.mock.bus")

type GlobalWithBus = typeof globalThis & { [GLOBAL_KEY]?: Set<Subscriber> }

const g = globalThis as GlobalWithBus

const subscribers: Set<Subscriber> = (g[GLOBAL_KEY] ??= new Set())

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function publish(message: StreamMessage): void {
  for (const fn of subscribers) {
    try {
      fn(message)
    } catch {
      // A dead connection must never break the business transaction.
      subscribers.delete(fn)
    }
  }
}

export function subscriberCount(): number {
  return subscribers.size
}
