"use client"

/**
 * The production board (§13.1).
 *
 * It LOOKS like a Kanban and BEHAVES like a pipeline. §8.4 forbids skipping
 * stages and §36 calls a free status dropdown an anti-pattern, so:
 *
 *   - cards advance only through explicit commands that hit the API;
 *   - dragging is accepted only onto the immediately-next column, and even
 *     then the server decides — a rejection snaps the card back and shows the
 *     real error code;
 *   - the arrow animation fires only after the server authorized the move, so
 *     motion on this screen always means "a legal transition happened".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LayoutGroup } from "motion/react"
import { toast } from "sonner"

import { FlowConnector, QCFork } from "@/components/board/flow-connector"
import { KpiStrip } from "@/components/board/kpi-strip"
import { ReworkTray } from "@/components/board/rework-tray"
import { StageColumn } from "@/components/board/stage-column"
import { useStream } from "@/components/layout/stream-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiRequestError } from "@/lib/api/client"
import {
  completeStage as apiComplete,
  failStage as apiFail,
  getKanban,
  startStage as apiStart,
  type KanbanResponse,
} from "@/lib/api/endpoints"
import { STAGE_STATUS, STAGE_TYPE, type StageType } from "@/lib/domain/enums"
import { STAGE_LABEL } from "@/lib/domain/labels"
import type { BatchCardView } from "@/lib/domain/types"
import { nextStage, STAGE_SEQUENCE } from "@/lib/domain/workflow"

export function FlowBoard() {
  const { revision, subscribe } = useStream()

  const [data, setData] = useState<KanbanResponse | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectedId, setRejectedId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<StageType | null>(null)
  const [draggingStage, setDraggingStage] = useState<StageType | null>(null)

  /** Rail index -> a counter that fires the handoff packet. */
  const [pulses, setPulses] = useState<Record<string, number>>({})

  const load = useCallback(() => {
    getKanban()
      .then(setData)
      .catch(() => {
        /* the next event will trigger another attempt */
      })
  }, [])

  useEffect(() => {
    load()
  }, [load, revision])

  // Local clock for the in-stage timers.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const pulseSeq = useRef(0)

  const bump = useCallback((key: string) => {
    pulseSeq.current += 1
    const value = pulseSeq.current
    setPulses((p) => ({ ...p, [key]: value }))
    // Let the packet finish, then clear so the same rail can fire again.
    setTimeout(() => {
      setPulses((p) => (p[key] === value ? { ...p, [key]: 0 } : p))
    }, 1100)
  }, [])

  /**
   * Fire the rail animation when the server reports a completed stage. Driven
   * from the event stream, not from the click handler, so the simulator's
   * moves animate exactly like a human's.
   */
  useEffect(
    () =>
      subscribe((event) => {
        if (event.event_type === "STAGE_COMPLETED" && event.stage) {
          bump(event.stage)
        }
        if (event.event_type === "REWORK_REQUIRED") {
          bump("QC_FAIL")
        }
      }),
    [subscribe, bump]
  )

  const columns = useMemo(() => data?.columns ?? [], [data])

  /** How many batches are actively running in a given stage. */
  const intensity = useMemo(() => {
    const map = new Map<StageType, number>()
    for (const col of columns) {
      const running = col.batches.filter((b) =>
        b.stages.some(
          (s) =>
            s.stage_type === col.stage && s.status === STAGE_STATUS.IN_PROGRESS
        )
      ).length
      map.set(col.stage, running)
    }
    return map
  }, [columns])

  const allBatches = useMemo(
    () => [...columns.flatMap((c) => c.batches), ...(data?.rework ?? [])],
    [columns, data]
  )

  function reject(batchId: string, error: unknown) {
    setRejectedId(batchId)
    setTimeout(() => setRejectedId(null), 600)

    if (error instanceof ApiRequestError) {
      toast.error(error.code, {
        description: error.message,
        // The raw code is the point: it shows the backend rejected this, and why.
        duration: 5000,
      })
    } else {
      toast.error("Không thực hiện được thao tác")
    }
  }

  async function runCommand(
    batch: BatchCardView,
    command: "start" | "complete"
  ) {
    setBusyId(batch.id)
    try {
      if (command === "start") {
        await apiStart(batch.batch_code, batch.current_stage)
      } else {
        await apiComplete(batch.batch_code, batch.current_stage)
      }
      load()
    } catch (e) {
      reject(batch.id, e)
    } finally {
      setBusyId(null)
    }
  }

  async function handleFail(batch: BatchCardView) {
    const reason = window.prompt(
      `Báo lỗi công đoạn ${STAGE_LABEL[batch.current_stage]} của ${batch.batch_code}.\nNguyên nhân:`,
      ""
    )
    if (reason === null) return

    setBusyId(batch.id)
    try {
      await apiFail(
        batch.batch_code,
        batch.current_stage,
        reason.trim() || "Không rõ nguyên nhân"
      )
      toast.warning("Đã ghi nhận sự cố", {
        description: `${batch.batch_code} chuyển sang BLOCKED, chờ quản lý xử lý.`,
      })
      load()
    } catch (e) {
      reject(batch.id, e)
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Drop handler. A drag onto the next column is a request to complete the
   * current stage and start the next — the server still validates both.
   */
  async function handleDrop(batchId: string, target: StageType) {
    const batch = allBatches.find((b) => b.id === batchId)
    if (!batch || target === batch.current_stage) return

    const expected = nextStage(batch.current_stage)
    if (target !== expected) {
      // Refuse locally with the same code the server would return, so the
      // rule is demonstrated without a pointless round trip.
      setRejectedId(batch.id)
      setTimeout(() => setRejectedId(null), 600)
      toast.error("PREVIOUS_STAGE_NOT_COMPLETED", {
        description: `Không được bỏ qua công đoạn. ${batch.batch_code} phải hoàn thành ${STAGE_LABEL[batch.current_stage]} trước khi sang ${STAGE_LABEL[target]}.`,
        duration: 5000,
      })
      return
    }

    setBusyId(batch.id)
    try {
      await apiComplete(batch.batch_code, batch.current_stage)
      load()
    } catch (e) {
      reject(batch.id, e)
    } finally {
      setBusyId(null)
    }
  }

  function dropHintFor(stage: StageType): "valid" | "invalid" | null {
    if (dragTarget !== stage || draggingStage === null) return null
    if (stage === draggingStage) return null
    return nextStage(draggingStage) === stage ? "valid" : "invalid"
  }

  if (!data) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-[13.5rem] shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      onDragEnd={() => {
        setDragTarget(null)
        setDraggingStage(null)
      }}
    >
      <KpiStrip summary={data.summary} />

      <LayoutGroup>
        <div
          className="flex items-start"
          onDragStart={(e) => {
            const id = (e.target as HTMLElement)?.getAttribute?.(
              "data-dragging-id"
            )
            const batch = allBatches.find((b) => b.id === id)
            setDraggingStage(batch?.current_stage ?? null)
          }}
        >
          {STAGE_SEQUENCE.map((stage, i) => {
            const column = columns.find((c) => c.stage === stage)
            const next = STAGE_SEQUENCE[i + 1]

            return (
              <div key={stage} className="flex items-stretch">
                <StageColumn
                  stage={stage}
                  batches={column?.batches ?? []}
                  now={now}
                  busyId={busyId}
                  rejectedId={rejectedId}
                  dropHint={dropHintFor(stage)}
                  onCommand={runCommand}
                  onFail={handleFail}
                  onDrop={handleDrop}
                  onDragOverStage={setDragTarget}
                />

                {next && stage === STAGE_TYPE.QUALITY_CHECK ? (
                  <QCFork
                    intensity={intensity.get(stage) ?? 0}
                    pulseKey={pulses[stage] || null}
                    failPulseKey={pulses["QC_FAIL"] || null}
                  />
                ) : next ? (
                  <FlowConnector
                    from={stage}
                    to={next}
                    intensity={intensity.get(stage) ?? 0}
                    pulseKey={pulses[stage] || null}
                  />
                ) : null}
              </div>
            )
          })}
        </div>

        <ReworkTray batches={data.rework} now={now} onResolved={load} />
      </LayoutGroup>
    </div>
  )
}
