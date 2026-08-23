"use client"

/**
 * The exception dock: batches that have left the happy path (§8.4 Rule 5 and
 * Rule 6). Keeping them visible below the board rather than hidden in a filter
 * is deliberate — a blocked batch is the thing a manager most needs to see.
 *
 * A fixed 5x2 grid of compact tiles, newest first. Ten slots is the whole dock:
 * it never scrolls and never changes height, so a pile-up can never eat the
 * board. Anything past ten lives on /rework.
 */

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Ban, Loader2, Recycle, Undo2 } from "lucide-react"

import {
  blockingStage,
  isBlocked,
  useUnblockBatch,
} from "@/components/batches/rework-card"
import { PriorityChip, RiskText } from "@/components/batches/status-chip"
import { Button } from "@/components/ui/button"
import { formatDeadlineDistance } from "@/lib/domain/deadline"
import type { BatchCardView } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** 5 columns x 2 rows. */
const VISIBLE = 10

export function ReworkTray({
  batches,
  now,
  onResolved,
}: {
  batches: BatchCardView[]
  now: number
  onResolved: () => void
}) {
  const { unblock, busyId } = useUnblockBatch(onResolved)

  const empty = batches.length === 0
  const visible = batches.slice(0, VISIBLE)
  const hidden = batches.length - visible.length

  return (
    // Pinned bottom dock, outside the Kanban scroller so it never drifts with
    // the board. Collapses to just this header when nothing is blocked.
    <section className="bg-background shrink-0 border-t px-4 py-2.5">
      <div className={cn("flex items-center gap-2", !empty && "mb-2")}>
        <Recycle
          className={cn(
            "size-3.5",
            empty ? "text-muted-foreground" : "text-status-rework"
          )}
        />
        <h2 className="text-xs font-medium">Khay REWORK / BLOCKED</h2>
        <span className="text-muted-foreground font-mono text-[10px]">
          {empty ? "trống · 0" : batches.length}
        </span>
        <p className="text-muted-foreground ml-2 hidden text-[11px] sm:block">
          Nhánh ngoại lệ — cần quản lý xử lý trước khi workflow tiếp tục.
        </p>

        {!empty && (
          <Link
            href="/rework"
            className="text-muted-foreground hover:text-foreground ml-auto flex shrink-0 items-center gap-1 text-[11px] hover:underline"
          >
            Xem thêm
            {hidden > 0 && (
              <span className="font-mono">(+{hidden})</span>
            )}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      {!empty && (
        <div className="border-status-rework/30 bg-status-rework/[0.03] rounded-lg border border-dashed p-2">
          <div className="grid grid-cols-5 gap-2">
            <AnimatePresence mode="popLayout">
              {visible.map((batch) => (
                <ReworkTile
                  key={batch.id}
                  batch={batch}
                  now={now}
                  busy={busyId === batch.id}
                  onUnblock={unblock}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Compact tile — four lines, legible down to ~130px so five fit across even at
 * 1280px with the event rail open. The failure note becomes the tooltip; full
 * detail lives on /rework and the batch page.
 */
function ReworkTile({
  batch,
  now,
  busy,
  onUnblock,
}: {
  batch: BatchCardView
  now: number
  busy: boolean
  onUnblock: (batch: BatchCardView) => void
}) {
  const reduced = useReducedMotion()
  const blocked = isBlocked(batch)
  const failedStage = blockingStage(batch)

  const detail = [
    batch.status,
    failedStage?.stage_type,
    !blocked && batch.latest_qc
      ? `${(batch.latest_qc.defect_rate * 100).toFixed(1)}%`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <motion.div
      // Same layoutId as the board card, so a batch failing on the board
      // morphs straight into this tile.
      layoutId={reduced ? undefined : batch.id}
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      title={failedStage?.note ?? undefined}
      className={cn(
        "bg-card min-w-0 rounded-lg border p-2",
        blocked ? "border-status-blocked/50" : "border-status-rework/50"
      )}
    >
      <div className="flex items-center gap-1.5">
        {blocked ? (
          <Ban className="text-status-blocked size-3 shrink-0" />
        ) : (
          <Recycle className="text-status-rework size-3 shrink-0" />
        )}
        <Link
          href={`/batches/${batch.batch_code}`}
          className="truncate font-mono text-[11px] font-semibold hover:underline"
        >
          {batch.batch_code}
        </Link>
        <PriorityChip
          priority={batch.priority}
          className="ml-auto shrink-0 [&>span]:size-1"
        />
      </div>

      <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
        {batch.product_name} · {batch.quantity} sp
      </p>

      <p
        className={cn(
          "mt-0.5 truncate font-mono text-[9px]",
          blocked ? "text-status-blocked" : "text-status-rework"
        )}
      >
        {detail}
      </p>

      <div className="mt-1.5 flex items-center gap-1">
        <RiskText
          risk={batch.deadline_risk}
          className="truncate text-[10px] tabular-nums"
        >
          {formatDeadlineDistance(batch.deadline, now)}
        </RiskText>
        <Button
          size="icon-xs"
          variant="outline"
          className="ml-auto shrink-0"
          disabled={busy}
          title="Mở khoá để làm lại"
          onClick={() => onUnblock(batch)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
          <span className="sr-only">Mở khoá</span>
        </Button>
      </div>
    </motion.div>
  )
}
