"use client"

/**
 * The full exception queue behind the board's "Xem thêm" link.
 *
 * Reads the same `rework` array the dock does, from the dashboard query, so
 * the two can never disagree about what is in the queue or in what order.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { LayoutGroup } from "motion/react"
import { Ban, Recycle } from "lucide-react"

import { ReworkCard, useUnblockBatch } from "@/components/batches/rework-card"
import { useStream } from "@/components/layout/stream-provider"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getKanban } from "@/lib/api/endpoints"
import { BATCH_STATUS, type BatchStatus } from "@/lib/domain/enums"
import { BATCH_STATUS_LABEL } from "@/lib/domain/labels"
import type { BatchCardView } from "@/lib/domain/types"

type Filter = "ALL" | BatchStatus

export function ReworkQueue() {
  const { revision } = useStream()

  const [batches, setBatches] = useState<BatchCardView[] | null>(null)
  const [filter, setFilter] = useState<Filter>("ALL")
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    getKanban()
      .then((r) => setBatches(r.rework))
      .catch(() => setBatches([]))
  }, [])

  useEffect(() => {
    load()
  }, [load, revision])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const { unblock, busyId } = useUnblockBatch(load)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of batches ?? []) map.set(b.status, (map.get(b.status) ?? 0) + 1)
    return map
  }, [batches])

  const visible = (batches ?? []).filter(
    (b) => filter === "ALL" || b.status === filter
  )

  const FILTERS: Array<{ value: Filter; label: string; count: number }> = [
    { value: "ALL", label: "Tất cả", count: batches?.length ?? 0 },
    {
      value: BATCH_STATUS.BLOCKED,
      label: BATCH_STATUS_LABEL.BLOCKED,
      count: counts.get(BATCH_STATUS.BLOCKED) ?? 0,
    },
    {
      value: BATCH_STATUS.REWORK_REQUIRED,
      label: BATCH_STATUS_LABEL.REWORK_REQUIRED,
      count: counts.get(BATCH_STATUS.REWORK_REQUIRED) ?? 0,
    },
  ]

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <p className="text-muted-foreground bg-muted/40 rounded-md border p-2.5 text-xs leading-relaxed">
        Mẻ có công đoạn <span className="font-mono">FAILED</span> hoặc{" "}
        <span className="font-mono">REWORK_REQUIRED</span>. Workflow không tiếp
        tục cho tới khi quản lý mở khoá — mở khoá đưa công đoạn về{" "}
        <span className="font-mono">PENDING</span> để chạy lại. Sắp xếp theo lần
        cập nhật mới nhất.
      </p>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="xs"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
            className="gap-1.5"
          >
            {f.value === BATCH_STATUS.BLOCKED && <Ban />}
            {f.value === BATCH_STATUS.REWORK_REQUIRED && <Recycle />}
            {f.label}
            <span className="font-mono text-[10px] opacity-70">{f.count}</span>
          </Button>
        ))}
      </div>

      {batches === null ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {batches.length === 0
            ? "Không có mẻ nào bị khoá. 🎉"
            : "Không có mẻ nào khớp bộ lọc."}
        </p>
      ) : (
        <LayoutGroup>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((batch) => (
              <ReworkCard
                key={batch.id}
                batch={batch}
                now={now}
                busy={busyId === batch.id}
                onUnblock={unblock}
                // No board on this screen to morph from, so no shared layoutId.
                withLayoutId={false}
              />
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
  )
}
