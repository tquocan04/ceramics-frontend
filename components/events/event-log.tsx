"use client"

/**
 * §12 / §29 — the full audit trail, filterable.
 *
 * Backfilled once over HTTP, then kept current from the same SSE stream the
 * board uses, so this page and the rail never disagree.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { EventDot, EVENT_IS_ALERT } from "@/components/events/event-dot"
import { useStream } from "@/components/layout/stream-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { listEvents } from "@/lib/api/endpoints"
import { EVENT_TYPE_LABEL, ROLE_LABEL } from "@/lib/domain/labels"
import type { WorkflowEvent } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

type Group = "ALL" | "STAGE" | "QC" | "AI" | "ALERT"

const GROUPS: Array<{ value: Group; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "STAGE", label: "Công đoạn" },
  { value: "QC", label: "QC" },
  { value: "AI", label: "AI" },
  { value: "ALERT", label: "Cảnh báo" },
]

function inGroup(event: WorkflowEvent, group: Group): boolean {
  if (group === "ALL") return true
  if (group === "ALERT") return EVENT_IS_ALERT.has(event.event_type)
  if (group === "STAGE") return event.event_type.startsWith("STAGE_")
  if (group === "QC") return event.event_type.startsWith("QC_")
  if (group === "AI") return event.event_type.startsWith("AI_")
  return true
}

export function EventLog() {
  const { events: streamed, revision } = useStream()
  const [initial, setInitial] = useState<WorkflowEvent[] | null>(null)
  const [group, setGroup] = useState<Group>("ALL")
  const [query, setQuery] = useState("")

  const load = useCallback(() => {
    listEvents(300)
      .then((r) => setInitial(r.events))
      .catch(() => setInitial([]))
  }, [])

  useEffect(() => {
    load()
  }, [load, revision])

  const events = useMemo(() => {
    const seen = new Set(streamed.map((e) => e.id))
    const merged = [...streamed, ...(initial ?? []).filter((e) => !seen.has(e.id))]
    const q = query.trim().toLowerCase()

    return merged.filter((e) => {
      if (!inGroup(e, group)) return false
      if (!q) return true
      return (
        e.message.toLowerCase().includes(q) ||
        e.event_type.toLowerCase().includes(q)
      )
    })
  }, [streamed, initial, group, query])

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <Button
              key={g.value}
              size="xs"
              variant={group === g.value ? "default" : "outline"}
              onClick={() => setGroup(g.value)}
            >
              {g.label}
            </Button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lọc theo nội dung hoặc event_type…"
          className="h-8 max-w-xs text-sm"
        />
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {events.length} sự kiện
        </span>
      </div>

      {initial === null ? (
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {events.map((event) => {
            const alert = EVENT_IS_ALERT.has(event.event_type)
            return (
              <li
                key={event.id}
                className={cn(
                  "hover:bg-accent/40 flex gap-3 px-3 py-2 transition-colors",
                  alert && "bg-destructive/[0.04]"
                )}
              >
                <EventDot type={event.event_type} />

                <span className="text-muted-foreground w-32 shrink-0 font-mono text-[11px] tabular-nums">
                  <FullTime iso={event.created_at} />
                </span>

                <span
                  className={cn(
                    "w-44 shrink-0 font-mono text-[11px]",
                    alert ? "text-destructive font-medium" : "text-muted-foreground"
                  )}
                  title={EVENT_TYPE_LABEL[event.event_type]}
                >
                  {event.event_type}
                </span>

                <span className="min-w-0 flex-1 text-xs">{event.message}</span>

                {event.batch_id && (
                  <Link
                    href={`/batches/${event.batch_id}`}
                    className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-[10px] hover:underline"
                  >
                    batch
                  </Link>
                )}

                <span className="text-muted-foreground w-20 shrink-0 text-right text-[10px]">
                  {ROLE_LABEL[event.created_by]}
                </span>
              </li>
            )
          })}
          {events.length === 0 && (
            <li className="text-muted-foreground px-3 py-8 text-center text-sm">
              Không có sự kiện nào khớp bộ lọc.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** See the note in event-rail.tsx — timezone differs between server and client. */
function FullTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })}
    </time>
  )
}
