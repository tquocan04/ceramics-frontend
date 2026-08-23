"use client"

import { AnimatePresence } from "motion/react"
import type { ReactNode } from "react"

import { BatchCard } from "@/components/board/batch-card"
import { STAGE_STATUS, type StageType } from "@/lib/domain/enums"
import { STAGE_LABEL_SHORT } from "@/lib/domain/labels"
import { CIRCLED_DIGITS, STAGE_THEME } from "@/lib/domain/stage-theme"
import type { BatchCardView } from "@/lib/domain/types"
import { stageIndex } from "@/lib/domain/workflow"
import { cn } from "@/lib/utils"

interface Props {
  stage: StageType
  batches: BatchCardView[]
  now: number
  busyId: string | null
  rejectedId: string | null
  dropHint: "valid" | "invalid" | null
  onCommand: (batch: BatchCardView, command: "start" | "complete") => void
  onFail: (batch: BatchCardView) => void
  onDrop: (batchId: string, target: StageType) => void
  onDragOverStage: (target: StageType | null) => void
  footer?: ReactNode
}

export function StageColumn({
  stage,
  batches,
  now,
  busyId,
  rejectedId,
  dropHint,
  onCommand,
  onFail,
  onDrop,
  onDragOverStage,
  footer,
}: Props) {
  const theme = STAGE_THEME[stage]
  const Icon = theme.icon
  const running = batches.filter((b) =>
    b.stages.some(
      (s) => s.stage_type === stage && s.status === STAGE_STATUS.IN_PROGRESS
    )
  ).length

  return (
    <section
      className="flex w-[13.5rem] shrink-0 flex-col"
      onDragOver={(e) => {
        e.preventDefault()
        onDragOverStage(stage)
      }}
      onDragLeave={() => onDragOverStage(null)}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData("text/batch-id")
        onDragOverStage(null)
        if (id) onDrop(id, stage)
      }}
    >
      <header
        className={cn(
          "flex h-11 items-center gap-2 rounded-t-lg border border-b-0 px-2.5",
          theme.tint
        )}
      >
        <span className={cn("text-sm leading-none", theme.text)} aria-hidden="true">
          {CIRCLED_DIGITS[stageIndex(stage)]}
        </span>
        <Icon className={cn("size-3.5 shrink-0", theme.text)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] leading-tight font-medium">
            {STAGE_LABEL_SHORT[stage]}
          </div>
          <div className="text-muted-foreground truncate font-mono text-[9px] leading-tight">
            {stage}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
            batches.length > 0 ? cn(theme.text, "bg-background/60") : "text-muted-foreground"
          )}
          title={`${batches.length} mẻ · ${running} đang chạy`}
        >
          {batches.length}
        </span>
      </header>

      <div
        className={cn(
          "min-h-40 flex-1 space-y-2 rounded-b-lg border p-2 transition-colors",
          "bg-muted/25",
          dropHint === "valid" && "border-status-completed bg-status-completed/5",
          dropHint === "invalid" && "border-destructive bg-destructive/5"
        )}
      >
        <AnimatePresence mode="popLayout">
          {batches.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              now={now}
              busy={busyId === batch.id}
              rejected={rejectedId === batch.id}
              onCommand={onCommand}
              onFail={onFail}
            />
          ))}
        </AnimatePresence>

        {batches.length === 0 && (
          <p className="text-muted-foreground/60 py-6 text-center text-[11px]">
            Trống
          </p>
        )}

        {footer}
      </div>
    </section>
  )
}
