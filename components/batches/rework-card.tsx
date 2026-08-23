"use client"

/**
 * The full-detail card for a batch that has left the happy path, plus the
 * unblock mutation both it and the board's compact dock tile share.
 *
 * Lifted out of ReworkTray so /rework and the dock use one mutation path and
 * one card design rather than two drifting copies.
 */

import { useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { Ban, Loader2, Recycle, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { PriorityChip, RiskText } from "@/components/batches/status-chip"
import { Button } from "@/components/ui/button"
import { ApiRequestError } from "@/lib/api/client"
import { resolveStage } from "@/lib/api/endpoints"
import { formatDeadlineDistance } from "@/lib/domain/deadline"
import { BATCH_STATUS, STAGE_STATUS } from "@/lib/domain/enums"
import { STAGE_LABEL } from "@/lib/domain/labels"
import type { BatchCardView } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** The stage holding the batch up — the one a manager has to clear. */
export function blockingStage(batch: BatchCardView) {
  return batch.stages.find(
    (s) =>
      s.status === STAGE_STATUS.FAILED ||
      s.status === STAGE_STATUS.REWORK_REQUIRED
  )
}

export function isBlocked(batch: BatchCardView) {
  return batch.status === BATCH_STATUS.BLOCKED
}

/**
 * Returns the stage to PENDING so the workflow can continue. The server still
 * validates the transition; a rejection surfaces its raw error code.
 */
export function useUnblockBatch(onResolved: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function unblock(batch: BatchCardView) {
    const stage = blockingStage(batch)?.stage_type ?? batch.current_stage

    setBusyId(batch.id)
    try {
      await resolveStage(batch.batch_code, stage)
      toast.success(`${batch.batch_code} đã được mở khoá`, {
        description: `${STAGE_LABEL[stage]} quay lại PENDING và có thể chạy lại.`,
      })
      onResolved()
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError ? e.code : "Không mở khoá được mẻ này",
        { description: e instanceof ApiRequestError ? e.message : undefined }
      )
    } finally {
      setBusyId(null)
    }
  }

  return { unblock, busyId }
}

interface Props {
  batch: BatchCardView
  now: number
  busy: boolean
  onUnblock: (batch: BatchCardView) => void
  /** Set on the board dock so the card morphs across from its column. */
  withLayoutId?: boolean
}

export function ReworkCard({
  batch,
  now,
  busy,
  onUnblock,
  withLayoutId = true,
}: Props) {
  const reduced = useReducedMotion()
  const blocked = isBlocked(batch)
  const failedStage = blockingStage(batch)

  return (
    <motion.div
      layoutId={reduced || !withLayoutId ? undefined : batch.id}
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "bg-card rounded-lg border p-2.5",
        blocked ? "border-status-blocked/50" : "border-status-rework/50"
      )}
    >
      <div className="flex items-center gap-2">
        {blocked ? (
          <Ban className="text-status-blocked size-3.5 shrink-0" />
        ) : (
          <Recycle className="text-status-rework size-3.5 shrink-0" />
        )}
        <Link
          href={`/batches/${batch.batch_code}`}
          className="font-mono text-xs font-semibold hover:underline"
        >
          {batch.batch_code}
        </Link>
        <PriorityChip priority={batch.priority} className="ml-auto" />
      </div>

      <p className="text-muted-foreground mt-1 truncate text-[11px]">
        {batch.product_name} · {batch.quantity} sp
      </p>

      <p
        className={cn(
          "mt-1.5 font-mono text-[10px]",
          blocked ? "text-status-blocked" : "text-status-rework"
        )}
      >
        {batch.status}
        {failedStage ? ` · ${failedStage.stage_type}` : ""}
      </p>

      {failedStage?.note && (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-[10px] leading-snug">
          {failedStage.note}
        </p>
      )}

      {batch.latest_qc && !blocked && (
        <p className="text-status-rework mt-1 text-[10px]">
          Defect rate {(batch.latest_qc.defect_rate * 100).toFixed(1)}% ·{" "}
          {batch.latest_qc.severity}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          className="gap-1"
          disabled={busy}
          onClick={() => onUnblock(batch)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Mở khoá
        </Button>
        <RiskText
          risk={batch.deadline_risk}
          className="ml-auto text-[10px] tabular-nums"
        >
          {formatDeadlineDistance(batch.deadline, now)}
        </RiskText>
      </div>
    </motion.div>
  )
}
