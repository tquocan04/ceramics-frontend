"use client"

/**
 * Owns the single SSE connection for the whole app.
 *
 * One EventSource shared by every screen, rather than one per component: the
 * board, the event rail and the connection badge all read from here.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { API_BASE } from "@/lib/api/client"
import { EVENT_STREAM_PATH } from "@/lib/api/endpoints"
import type { WorkflowEvent } from "@/lib/domain/types"

export type ConnectionState = "connecting" | "live" | "offline"
export type InvalidateScope = "batches" | "orders" | "notifications" | "all"

type StreamMessage =
  | { kind: "event"; event: WorkflowEvent }
  | { kind: "invalidate"; scope: InvalidateScope }
  | { kind: "ping"; at: string }

interface StreamContextValue {
  connection: ConnectionState
  /** Latest events, newest first, capped. */
  events: WorkflowEvent[]
  /** Increments whenever the server says a scope changed. */
  revision: number
  subscribe: (fn: (event: WorkflowEvent) => void) => () => void
}

const StreamContext = createContext<StreamContextValue | null>(null)

const MAX_EVENTS = 150

export function StreamProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [events, setEvents] = useState<WorkflowEvent[]>([])
  const [revision, setRevision] = useState(0)

  const listeners = useRef(new Set<(event: WorkflowEvent) => void>())

  const subscribe = useCallback((fn: (event: WorkflowEvent) => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  useEffect(() => {
    const source = new EventSource(`${API_BASE}${EVENT_STREAM_PATH}`)

    source.onopen = () => setConnection("live")

    source.onmessage = (e) => {
      setConnection("live")

      let message: StreamMessage
      try {
        message = JSON.parse(e.data) as StreamMessage
      } catch {
        return
      }

      if (message.kind === "event") {
        const event = message.event
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
        for (const fn of listeners.current) fn(event)
        // Every workflow event implies the board may have moved.
        setRevision((r) => r + 1)
      } else if (message.kind === "invalidate") {
        setRevision((r) => r + 1)
      }
    }

    source.onerror = () => {
      setConnection(
        source.readyState === EventSource.CLOSED ? "offline" : "connecting"
      )
    }

    return () => source.close()
  }, [])

  const value = useMemo(
    () => ({ connection, events, revision, subscribe }),
    [connection, events, revision, subscribe]
  )

  return <StreamContext value={value}>{children}</StreamContext>
}

export function useStream(): StreamContextValue {
  const ctx = useContext(StreamContext)
  if (!ctx) {
    throw new Error("useStream must be used inside <StreamProvider>")
  }
  return ctx
}
