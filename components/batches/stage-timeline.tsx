"use client"

/**
 * §13.2 — the vertical stage stepper.
 *
 * Every row shows the raw stage code and status alongside the Vietnamese
 * label, so the state machine is legible while demoing.
 */

import { Check, Circle, CircleDot, Ban, Recycle, X } from "lucide-react"

import { StageStatusChip } from "@/components/batches/status-chip"
import { formatElapsed } from "@/lib/domain/deadline"
import { STAGE_STATUS, type StageStatus } from "@/lib/domain/enums"
import { STAGE_LABEL } from "@/lib/domain/labels"
import { CIRCLED_DIGITS, STAGE_THEME } from "@/lib/domain/stage-theme"
import type { ProductionStage } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const ICON: Record<StageStatus, typeof Check> = {
  PENDING: Circle,
  IN_PROGRESS: CircleDot,
  COMPLETED: Check,
  FAILED: X,
  BLOCKED: Ban,
  REWORK_REQUIRED: Recycle,
}

export function StageTimeline({
  stages,
  now,
}: {
  stages: ProductionStage[]
  now: number
}) {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence)

  return (
    <ol className="space-y-0">
      {ordered.map((stage, i) => {
        const theme = STAGE_THEME[stage.stage_type]
        const Icon = ICON[stage.status]
        const done = stage.status === STAGE_STATUS.COMPLETED
        const running = stage.status === STAGE_STATUS.IN_PROGRESS
        const bad =
          stage.status === STAGE_STATUS.FAILED ||
          stage.status === STAGE_STATUS.BLOCKED ||
          stage.status === STAGE_STATUS.REWORK_REQUIRED
        const last = i === ordered.length - 1

        return (
          <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector spine */}
            {!last && (
              <span
                className={cn(
                  "absolute top-6 bottom-0 left-[11px] w-px",
                  done ? "bg-status-completed/40" : "bg-border"
                )}
                aria-hidden="true"
              />
            )}

            <span
              className={cn(
                "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2",
                done && "border-status-completed bg-status-completed/15 text-status-completed",
                running && cn(theme.border, theme.tint, theme.text, "animate-breathe"),
                bad && "border-status-failed bg-status-failed/15 text-status-failed",
                !done && !running && !bad && "border-border bg-background text-muted-foreground"
              )}
            >
              <Icon className="size-3" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn("text-xs", theme.text)} aria-hidden="true">
                  {CIRCLED_DIGITS[stage.sequence]}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    !done && !running && !bad && "text-muted-foreground"
                  )}
                >
                  {STAGE_LABEL[stage.stage_type]}
                </span>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {stage.stage_type}
                </span>
                <StageStatusChip status={stage.status} className="ml-auto" />
              </div>

              <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                {stage.started_at && (
                  <span>
                    Bắt đầu <LocalTime iso={stage.started_at} />
                  </span>
                )}
                {stage.completed_at && (
                  <span>
                    Xong <LocalTime iso={stage.completed_at} />
                  </span>
                )}
                {stage.started_at && (
                  <span className="tabular-nums">
                    {stage.completed_at
                      ? `Mất ${formatElapsed(stage.started_at, new Date(stage.completed_at).getTime())}`
                      : running
                        ? `Đang chạy ${formatElapsed(stage.started_at, now)}`
                        : null}
                  </span>
                )}
              </div>

              {stage.note && (
                <p
                  className={cn(
                    "mt-1 text-[11px] leading-snug",
                    bad ? "text-status-failed" : "text-muted-foreground"
                  )}
                >
                  {stage.note}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Client-only formatting; the server cannot know the viewer's timezone. */
export function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </time>
  )
}
