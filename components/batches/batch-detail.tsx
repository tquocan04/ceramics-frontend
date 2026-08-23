"use client"

/**
 * §29 Screen 5 — batch detail: info, progress, stages, QC, activity log.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Play, ScanSearch, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { EventDot } from "@/components/events/event-dot"
import { QCForm } from "@/components/batches/qc-form"
import {
  BatchStatusChip,
  PriorityChip,
  RiskText,
} from "@/components/batches/status-chip"
import { LocalTime, StageTimeline } from "@/components/batches/stage-timeline"
import { useStream } from "@/components/layout/stream-provider"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiRequestError } from "@/lib/api/client"
import {
  completeStage,
  failStage,
  getBatch,
  resolveStage,
  startStage,
  type BatchDetail as BatchDetailData,
} from "@/lib/api/endpoints"
import {
  formatDeadlineDistance,
  formatElapsed,
} from "@/lib/domain/deadline"
import { BATCH_STATUS, STAGE_STATUS, STAGE_TYPE } from "@/lib/domain/enums"
import {
  DEFECT_TYPE_LABEL,
  STAGE_LABEL,
} from "@/lib/domain/labels"
import { formatRate } from "@/lib/domain/qc"
import { STAGE_THEME } from "@/lib/domain/stage-theme"
import { availableCommand, STAGE_COUNT } from "@/lib/domain/workflow"
import { cn } from "@/lib/utils"

export function BatchDetail({ batchId }: { batchId: string }) {
  const { revision } = useStream()
  const [data, setData] = useState<BatchDetailData | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getBatch(batchId)
      .then(setData)
      .catch(() => setData(null))
  }, [batchId])

  useEffect(() => {
    load()
  }, [load, revision])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!data) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_20rem]">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }

  const { batch, qc, events, order } = data
  const theme = STAGE_THEME[batch.current_stage]
  const currentStage = batch.stages.find(
    (s) => s.stage_type === batch.current_stage
  )

  const command = availableCommand(
    { batchStatus: batch.status, stages: batch.stages },
    batch.current_stage
  )
  const running = currentStage?.status === STAGE_STATUS.IN_PROGRESS
  const blocked =
    batch.status === BATCH_STATUS.BLOCKED ||
    batch.status === BATCH_STATUS.REWORK_REQUIRED

  const qcActive =
    batch.current_stage === STAGE_TYPE.QUALITY_CHECK &&
    currentStage?.status === STAGE_STATUS.IN_PROGRESS

  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await fn()
      if (success) toast.success(success)
      load()
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.code : "Thao tác thất bại", {
        description: e instanceof ApiRequestError ? e.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-4">
          {/* Header card */}
          <section className="bg-card rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-base font-semibold">
                {batch.batch_code}
              </h2>
              <BatchStatusChip status={batch.status} />
              <PriorityChip priority={batch.priority} />
              {order && (
                <Link
                  href={`/orders/${order.id}`}
                  className="text-muted-foreground hover:text-foreground ml-auto text-xs hover:underline"
                >
                  Đơn {order.order_code}
                </Link>
              )}
            </div>

            <p className="text-muted-foreground mt-1 text-sm">
              {batch.product_name} · {batch.quantity} sản phẩm
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Công đoạn hiện tại">
                <span className={cn("text-sm font-medium", theme.text)}>
                  {STAGE_LABEL[batch.current_stage]}
                </span>
                <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                  {batch.current_stage}
                </span>
              </Stat>
              <Stat label="Tiến độ">
                <span className="text-sm font-medium tabular-nums">
                  {batch.completed_count}/{STAGE_COUNT} công đoạn
                </span>
              </Stat>
              <Stat label="Deadline">
                <RiskText
                  risk={batch.deadline_risk}
                  className="text-sm font-medium tabular-nums"
                >
                  {formatDeadlineDistance(batch.deadline, now)}
                </RiskText>
                <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                  {batch.deadline_risk}
                </span>
              </Stat>
            </div>

            {/* Segmented progress */}
            <div className="mt-3 flex gap-1">
              {batch.stages
                .slice()
                .sort((a, b) => a.sequence - b.sequence)
                .map((s) => (
                  <span
                    key={s.id}
                    title={`${STAGE_LABEL[s.stage_type]} — ${s.status}`}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      s.status === STAGE_STATUS.COMPLETED
                        ? "bg-status-completed"
                        : s.status === STAGE_STATUS.IN_PROGRESS
                          ? cn(STAGE_THEME[s.stage_type].accent, "animate-breathe")
                          : s.status === STAGE_STATUS.FAILED
                            ? "bg-status-failed"
                            : s.status === STAGE_STATUS.REWORK_REQUIRED
                              ? "bg-status-rework"
                              : "bg-muted"
                    )}
                  />
                ))}
            </div>

            {/* Commands for the current stage */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {command === "start" && (
                <Button
                  size="sm"
                  disabled={busy}
                  className="gap-1.5"
                  onClick={() =>
                    run(
                      () => startStage(batch.batch_code, batch.current_stage),
                      `Đã bắt đầu ${STAGE_LABEL[batch.current_stage]}`
                    )
                  }
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Play />}
                  Bắt đầu {STAGE_LABEL[batch.current_stage]}
                </Button>
              )}

              {command === "complete" && !qcActive && (
                <Button
                  size="sm"
                  disabled={busy}
                  className="gap-1.5"
                  onClick={() =>
                    run(
                      () => completeStage(batch.batch_code, batch.current_stage),
                      `Đã hoàn thành ${STAGE_LABEL[batch.current_stage]}`
                    )
                  }
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  Hoàn thành {STAGE_LABEL[batch.current_stage]}
                </Button>
              )}

              {qcActive && (
                <p className="text-stage-qc flex items-center gap-1.5 text-xs">
                  <ScanSearch className="size-3.5" />
                  Công đoạn QC chỉ kết thúc qua báo cáo kiểm định (§8.4 Rule 6).
                </p>
              )}

              {running && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const reason = window.prompt("Nguyên nhân sự cố:", "")
                    if (reason === null) return
                    run(
                      () =>
                        failStage(
                          batch.batch_code,
                          batch.current_stage,
                          reason.trim() || "Không rõ nguyên nhân"
                        ),
                      "Đã ghi nhận sự cố"
                    )
                  }}
                >
                  Báo lỗi công đoạn
                </Button>
              )}

              {blocked && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="gap-1.5"
                  onClick={() => {
                    const stage =
                      batch.stages.find(
                        (s) =>
                          s.status === STAGE_STATUS.FAILED ||
                          s.status === STAGE_STATUS.REWORK_REQUIRED
                      )?.stage_type ?? batch.current_stage
                    run(
                      () => resolveStage(batch.batch_code, stage),
                      "Đã mở khoá công đoạn"
                    )
                  }}
                >
                  <Undo2 />
                  Mở khoá để làm lại
                </Button>
              )}

              {running && currentStage?.started_at && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  ⏱ {formatElapsed(currentStage.started_at, now)}
                </span>
              )}
            </div>
          </section>

          {/* Spec from the AI analysis */}
          <section className="bg-card rounded-lg border p-4">
            <h3 className="mb-2 text-xs font-medium">Thông số sản xuất</h3>
            <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              <SpecRow label="Họa tiết" value={batch.spec.extracted.decoration_pattern} />
              <SpecRow label="Loại men" value={batch.spec.extracted.glaze_type} />
              <SpecRow
                label="Chiều cao"
                value={batch.spec.extracted.height_cm}
                unit="cm"
              />
              <SpecRow
                label="Nhiệt độ nung"
                value={batch.spec.extracted.firing_temperature_c}
                unit="°C"
              />
              <SpecRow
                label="Đất sét (ước tính)"
                value={batch.spec.estimated.clay_kg}
                unit="kg"
                estimated
              />
              <SpecRow
                label="Men (ước tính)"
                value={batch.spec.estimated.glaze_kg}
                unit="kg"
                estimated
              />
              <SpecRow
                label="Thời gian nung (ước tính)"
                value={batch.spec.estimated.firing_duration_hours}
                unit="giờ"
                estimated
              />
            </dl>
          </section>

          {/* QC */}
          <section className="bg-card rounded-lg border p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium">
              <ScanSearch className="text-stage-qc size-3.5" />
              Kiểm định chất lượng
            </h3>

            {qcActive ? (
              <QCForm
                batchCode={batch.batch_code}
                quantity={batch.quantity}
                onSubmitted={load}
              />
            ) : qc.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Chưa có báo cáo QC. Biểu mẫu sẽ mở khi mẻ vào công đoạn{" "}
                {STAGE_LABEL[STAGE_TYPE.QUALITY_CHECK]}.
              </p>
            ) : null}

            {qc.length > 0 && (
              <ul className={cn("space-y-2", qcActive && "mt-4 border-t pt-3")}>
                {qc.map((report) => (
                  <li key={report.id} className="bg-muted/40 rounded-md border p-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          report.result === "PASS"
                            ? "text-risk-on-track"
                            : "text-status-rework"
                        )}
                      >
                        {report.result}
                      </span>
                      <span className="text-muted-foreground">
                        {report.passed_quantity}/{report.inspected_quantity} đạt
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {formatRate(report.defect_rate)} · {report.severity}
                      </span>
                      <span className="text-muted-foreground ml-auto text-[10px]">
                        <LocalTime iso={report.created_at} />
                      </span>
                    </div>
                    {report.defects.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {report.defects.map((d) => (
                          <li
                            key={d.id}
                            className="bg-background rounded border px-1.5 py-0.5 text-[10px]"
                            title={d.note ?? undefined}
                          >
                            {DEFECT_TYPE_LABEL[d.defect_type]}
                            <span className="text-muted-foreground ml-1 font-mono">
                              ×{d.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {report.note && (
                      <p className="text-muted-foreground mt-1 text-[11px]">
                        {report.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right column — stages + activity */}
        <div className="space-y-4">
          <section className="bg-card rounded-lg border p-4">
            <h3 className="mb-3 text-xs font-medium">Quy trình 7 công đoạn</h3>
            <StageTimeline stages={batch.stages} now={now} />
          </section>

          <section className="bg-card rounded-lg border p-4">
            <h3 className="mb-3 text-xs font-medium">
              Nhật ký hoạt động của mẻ
            </h3>
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="flex gap-2">
                  <EventDot type={event.event_type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {event.event_type}
                      </span>
                      <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
                        <LocalTime iso={event.created_at} />
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug">{event.message}</p>
                  </div>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-muted-foreground text-xs">
                  Chưa có sự kiện.
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function SpecRow({
  label,
  value,
  unit,
  estimated,
}: {
  label: string
  value: string | number | null
  unit?: string
  estimated?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1 last:border-b-0">
      <dt className="text-muted-foreground flex items-center gap-1">
        {label}
        {estimated && (
          <span className="text-muted-foreground/70 rounded border border-dashed px-1 text-[9px]">
            ước tính
          </span>
        )}
      </dt>
      <dd className="font-medium tabular-nums">
        {value === null || value === undefined ? (
          <span className="text-muted-foreground/60 font-mono">null</span>
        ) : (
          <>
            {value}
            {unit ? (
              <span className="text-muted-foreground ml-1 font-normal">
                {unit}
              </span>
            ) : null}
          </>
        )}
      </dd>
    </div>
  )
}
