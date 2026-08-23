"use client"

import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { AlertTriangle, Loader2, Play, Check, TriangleAlert } from "lucide-react"

import {
  PriorityChip,
  RiskText,
} from "@/components/batches/status-chip"
import { Button } from "@/components/ui/button"
import {
  formatDeadlineDistance,
  formatElapsed,
} from "@/lib/domain/deadline"
import { BATCH_STATUS, STAGE_STATUS } from "@/lib/domain/enums"
import { STAGE_THEME } from "@/lib/domain/stage-theme"
import type { BatchCardView } from "@/lib/domain/types"
import {
  availableCommand,
  STAGE_COUNT,
  STAGE_SEQUENCE,
} from "@/lib/domain/workflow"
import { cn } from "@/lib/utils"

interface Props {
  batch: BatchCardView
  now: number
  busy?: boolean
  onCommand: (batch: BatchCardView, command: "start" | "complete") => void
  onFail: (batch: BatchCardView) => void
  /** Set while the server is rejecting a drag, to play the shake. */
  rejected?: boolean
  draggable?: boolean
}

export function BatchCard({
  batch,
  now,
  busy,
  onCommand,
  onFail,
  rejected,
  draggable = true,
}: Props) {
  const router = useRouter()
  const reduced = useReducedMotion()

  const theme = STAGE_THEME[batch.current_stage]
  const stage = batch.stages.find((s) => s.stage_type === batch.current_stage)
  const status = stage?.status ?? STAGE_STATUS.PENDING

  const running = status === STAGE_STATUS.IN_PROGRESS
  const failed =
    status === STAGE_STATUS.FAILED || batch.status === BATCH_STATUS.BLOCKED
  const rework =
    status === STAGE_STATUS.REWORK_REQUIRED ||
    batch.status === BATCH_STATUS.REWORK_REQUIRED

  const command = availableCommand(
    { batchStatus: batch.status, stages: batch.stages },
    batch.current_stage
  )

  return (
    <motion.article
      // layoutId is what makes the card physically travel between columns when
      // the server moves it — the animation is the proof of a legal transition.
      layoutId={reduced ? undefined : batch.id}
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      data-dragging-id={draggable ? batch.id : undefined}
      draggable={draggable}
      onDragStart={(e) => {
        const ev = e as unknown as React.DragEvent
        ev.dataTransfer?.setData("text/batch-id", batch.id)
        ev.dataTransfer?.setData("text/plain", batch.batch_code)
      }}
      onClick={() => router.push(`/batches/${batch.batch_code}`)}
      className={cn(
        "group bg-card relative cursor-pointer overflow-hidden rounded-lg border p-2.5 text-left shadow-xs",
        "hover:border-foreground/20 transition-colors",
        failed && "border-status-failed/50 bg-status-failed/[0.04]",
        rework && !failed && "border-status-rework/50 bg-status-rework/[0.04]",
        rejected && "animate-shake border-destructive"
      )}
    >
      {/* Left accent bar carries the stage colour; it breathes while running. */}
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          failed
            ? "bg-status-failed"
            : rework
              ? "bg-status-rework"
              : theme.accent,
          running && !failed && !rework && "animate-breathe"
        )}
        aria-hidden="true"
      />

      <div className="flex items-start gap-2 pl-1.5">
        <span className="font-mono text-xs font-semibold tracking-tight">
          {batch.batch_code}
        </span>
        <PriorityChip priority={batch.priority} className="ml-auto shrink-0" />
      </div>

      <p className="text-muted-foreground mt-1 truncate pl-1.5 text-xs">
        {batch.product_name} · {batch.quantity} sp
      </p>

      <ProgressSegments
        completed={batch.completed_count}
        currentIndex={STAGE_SEQUENCE.indexOf(batch.current_stage)}
        running={running}
      />

      <div className="text-muted-foreground mt-1.5 flex items-center gap-2 pl-1.5 text-[10px]">
        {running && stage?.started_at ? (
          <span className="tabular-nums">
            ⏱ {formatElapsed(stage.started_at, now)}
          </span>
        ) : (
          <span className="font-mono">{status}</span>
        )}
        <RiskText risk={batch.deadline_risk} className="ml-auto tabular-nums">
          {formatDeadlineDistance(batch.deadline, now)}
        </RiskText>
      </div>

      {failed && stage?.note && (
        <p className="text-status-failed mt-1.5 flex items-start gap-1 pl-1.5 text-[10px] leading-snug">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          <span className="line-clamp-2">{stage.note}</span>
        </p>
      )}

      {rework && batch.latest_qc && (
        <p className="text-status-rework mt-1.5 flex items-center gap-1 pl-1.5 text-[10px]">
          <TriangleAlert className="size-3 shrink-0" />
          Defect rate {(batch.latest_qc.defect_rate * 100).toFixed(1)}%
        </p>
      )}

      {/* Only legal commands are offered; the guard is the same pure module the
          server enforces with, so a disabled button means a real rejection. */}
      {(command || running) && (
        <div
          className="mt-2 flex gap-1 pl-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {command === "start" && (
            <Button
              size="xs"
              variant="outline"
              className="flex-1 gap-1"
              disabled={busy}
              onClick={() => onCommand(batch, "start")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Play />}
              Bắt đầu
            </Button>
          )}
          {command === "complete" && (
            <Button
              size="xs"
              variant="outline"
              className="flex-1 gap-1"
              disabled={busy}
              onClick={() => onCommand(batch, "complete")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Hoàn thành
            </Button>
          )}
          {running && (
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => onFail(batch)}
            >
              Báo lỗi
            </Button>
          )}
        </div>
      )}
    </motion.article>
  )
}

/** Seven segments — one per stage — so progress is readable at a glance. */
function ProgressSegments({
  completed,
  currentIndex,
  running,
}: {
  completed: number
  currentIndex: number
  running: boolean
}) {
  return (
    <div className="mt-2 flex items-center gap-2 pl-1.5">
      <div className="flex flex-1 gap-0.5">
        {Array.from({ length: STAGE_COUNT }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < completed
                ? "bg-status-completed"
                : i === currentIndex && running
                  ? cn(STAGE_THEME[STAGE_SEQUENCE[i]].accent, "animate-breathe")
                  : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
        {completed}/{STAGE_COUNT}
      </span>
    </div>
  )
}
