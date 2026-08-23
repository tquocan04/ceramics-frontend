"use client"

/**
 * The live activity feed (§13.3).
 *
 * Seeded once over HTTP, then kept current purely from the SSE stream — so
 * what you see arriving is genuinely pushed, not polled.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Activity, ChevronRight } from "lucide-react"

import { EventDot, EVENT_IS_ALERT } from "@/components/events/event-dot"
import { useShell } from "@/components/layout/shell-provider"
import { useStream } from "@/components/layout/stream-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { listEvents } from "@/lib/api/endpoints"
import { EVENT_TYPE_LABEL } from "@/lib/domain/labels"
import type { WorkflowEvent } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

export function EventRail() {
  const { events: streamed, connection } = useStream()
  const { railOpen } = useShell()
  const [initial, setInitial] = useState<WorkflowEvent[] | null>(null)

  useEffect(() => {
    listEvents(60)
      .then((r) => setInitial(r.events))
      .catch(() => setInitial([]))
  }, [])

  // Streamed events are authoritative and newest-first; the initial fetch just
  // backfills history behind them.
  const events = useMemo(() => {
    const seen = new Set(streamed.map((e) => e.id))
    const backfill = (initial ?? []).filter((e) => !seen.has(e.id))
    return [...streamed, ...backfill].slice(0, 80)
  }, [streamed, initial])

  // Checked after every hook so the hook order stays stable. Staying mounted
  // is not an option worth paying for here — unmounting keeps the board from
  // reflowing against a hidden 320px column.
  if (!railOpen) return null

  return (
    <aside className="border-border bg-sidebar/40 hidden w-80 shrink-0 flex-col border-l xl:flex">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Activity className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">Hoạt động realtime</span>
        <Link
          href="/events"
          className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-xs"
        >
          Tất cả
          <ChevronRight className="size-3" />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {initial === null ? (
          <div className="space-y-3 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground p-4 text-xs">
            {connection === "offline"
              ? "Mất kết nối tới luồng sự kiện."
              : "Chưa có sự kiện nào."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </aside>
  )
}

function EventRow({ event }: { event: WorkflowEvent }) {
  const reduced = useReducedMotion()
  const alert = EVENT_IS_ALERT.has(event.event_type)

  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn(
        "hover:bg-accent/50 rounded-md px-2 py-1.5 transition-colors",
        alert && "bg-destructive/5"
      )}
    >
      <div className="flex gap-2">
        <EventDot type={event.event_type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
              <Time iso={event.created_at} />
            </span>
            <span
              className={cn(
                "truncate font-mono text-[10px] font-medium",
                alert ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {event.event_type}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-snug">
            {event.message}
          </p>
          <span className="sr-only">{EVENT_TYPE_LABEL[event.event_type]}</span>
        </div>
      </div>
    </motion.li>
  )
}

/**
 * The server cannot know the viewer's timezone, so its formatting will differ
 * from the client's. suppressHydrationWarning accepts that divergence for this
 * one text node rather than paying for a mounted flag and a second render.
 */
function Time({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })}
    </time>
  )
}
