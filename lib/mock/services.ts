/**
 * Service layer for the mock backend — the boundaries of §18.
 *
 * Each exported function is one business command. They enforce the state
 * machine via lib/domain/workflow (the server is the authority, §9), emit a
 * WorkflowEvent for every meaningful change (§12), and are idempotent where
 * §21 requires it.
 *
 * Transaction boundaries (§19) are trivially satisfied here because the store
 * is synchronous and single-threaded: each function mutates and then records
 * events; nothing awaits mid-write.
 */

import "server-only"

import {
  BATCH_STATUS,
  EVENT_TYPE,
  ORDER_STATUS,
  PRIORITY,
  QC_RESULT,
  ROLE,
  SEVERITY,
  STAGE_STATUS,
  STAGE_TYPE,
  type Priority,
  type QCResult,
  type Role,
  type StageType,
} from "@/lib/domain/enums"
import { DomainError, ERROR_CODE } from "@/lib/domain/errors"
import { STAGE_LABEL } from "@/lib/domain/labels"
import {
  DEFECT_RATE_CRITICAL_THRESHOLD,
  evaluateQC,
  formatRate,
  type QCInput,
} from "@/lib/domain/qc"
import {
  assertCanComplete,
  assertCanFail,
  assertCanStart,
  buildStages,
  completedCount,
  deriveBatchStatus,
  nextStage,
  resolveCurrentStage,
  STAGE_SEQUENCE,
} from "@/lib/domain/workflow"
import { deadlineRisk } from "@/lib/domain/deadline"
import type {
  AIAnalysis,
  AIAnalysisResult,
  BatchCardView,
  DashboardSummary,
  ProductionBatch,
  ProductionOrder,
  ProductionStage,
  QCDefect,
  QCReport,
} from "@/lib/domain/types"

import { AI_MODEL, PROMPT_VERSION, analyze } from "./ai"
import { publish } from "./bus"
import {
  db,
  getQCReports,
  getStages,
  nextBatchCode,
  nextId,
  nextOrderCode,
  nowIso,
} from "./db"
import { recordEvent } from "./events"

/* ── Orders (§5) ──────────────────────────────────────────────────────── */

export function createOrder(
  rawDescription: string,
  requestedDeadline?: string | null
): ProductionOrder {
  const description = rawDescription.trim()
  if (!description) {
    throw new DomainError(ERROR_CODE.EMPTY_DESCRIPTION, 422)
  }

  const now = new Date()
  const iso = now.toISOString()

  const order: ProductionOrder = {
    id: nextId("ord"),
    order_code: nextOrderCode(now),
    raw_description: description,
    status: ORDER_STATUS.DRAFT,
    requested_deadline: requestedDeadline ?? null,
    ai_analysis_id: null,
    batch_id: null,
    created_at: iso,
    updated_at: iso,
  }

  db.orders.set(order.id, order)

  recordEvent({
    event_type: EVENT_TYPE.ORDER_CREATED,
    order_id: order.id,
    message: `Đơn hàng ${order.order_code} được tạo`,
    created_by: ROLE.MANAGER,
  })
  publish({ kind: "invalidate", scope: "orders" })

  return order
}

export function getOrder(id: string): ProductionOrder {
  const order = db.orders.get(id) ?? findOrderByCode(id)
  if (!order) throw new DomainError(ERROR_CODE.ORDER_NOT_FOUND, 404)
  return order
}

function findOrderByCode(code: string): ProductionOrder | undefined {
  for (const o of db.orders.values()) {
    if (o.order_code === code) return o
  }
  return undefined
}

export function listOrders(): ProductionOrder[] {
  return [...db.orders.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )
}

/**
 * §6 — run the AI pipeline and persist the attempt whatever the outcome.
 * The order survives every failure mode (§6.6).
 */
export function analyzeOrder(orderId: string): {
  order: ProductionOrder
  analysis: AIAnalysis
} {
  const order = getOrder(orderId)

  if (order.status === ORDER_STATUS.CONFIRMED || order.batch_id) {
    throw new DomainError(ERROR_CODE.ORDER_ALREADY_CONFIRMED, 409)
  }
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new DomainError(ERROR_CODE.ORDER_CANNOT_BE_CANCELLED, 409)
  }

  order.status = ORDER_STATUS.AI_ANALYZING
  order.updated_at = nowIso()

  recordEvent({
    event_type: EVENT_TYPE.AI_ANALYSIS_STARTED,
    order_id: order.id,
    message: `Bắt đầu phân tích AI cho ${order.order_code}`,
  })

  const started = Date.now()
  const attempt = analyze(order.raw_description)
  const priorAttempts = [...db.analyses.values()].filter(
    (a) => a.order_id === order.id
  ).length

  const analysis: AIAnalysis = {
    id: nextId("aia"),
    order_id: order.id,
    model: AI_MODEL,
    prompt_version: PROMPT_VERSION,
    raw_response: attempt.raw_response,
    result: attempt.result,
    is_valid: attempt.valid,
    validation_errors: attempt.errors,
    error_code: attempt.errorCode,
    attempt: priorAttempts + 1,
    latency_ms: Date.now() - started,
    created_at: nowIso(),
  }

  db.analyses.set(analysis.id, analysis)
  order.ai_analysis_id = analysis.id
  order.status = attempt.valid
    ? ORDER_STATUS.PENDING_CONFIRMATION
    : ORDER_STATUS.AI_ANALYSIS_FAILED
  order.updated_at = nowIso()

  recordEvent({
    event_type: attempt.valid
      ? EVENT_TYPE.AI_ANALYSIS_COMPLETED
      : EVENT_TYPE.AI_ANALYSIS_FAILED,
    order_id: order.id,
    message: attempt.valid
      ? `AI phân tích thành công (${analysis.latency_ms}ms)`
      : `AI phân tích thất bại: ${attempt.errorCode}`,
    metadata: {
      error_code: attempt.errorCode,
      validation_errors: attempt.errors,
      attempt: analysis.attempt,
    },
  })
  publish({ kind: "invalidate", scope: "orders" })

  return { order, analysis }
}

export function getAnalysis(orderId: string): AIAnalysis | null {
  const order = getOrder(orderId)
  if (!order.ai_analysis_id) return null
  return db.analyses.get(order.ai_analysis_id) ?? null
}

/**
 * §19 Confirm Order — one atomic unit:
 *   order -> CONFIRMED, create batch, create 7 stages, BATCH_CREATED event.
 * Idempotent per §21: confirming twice must not create two batches.
 */
export function confirmOrder(
  orderId: string,
  overrides?: {
    spec?: Partial<AIAnalysisResult>
    priority?: Priority
    deadline?: string
  }
): { order: ProductionOrder; batch: ProductionBatch; stages: ProductionStage[] } {
  const order = getOrder(orderId)

  // §21 idempotency — return the existing batch rather than creating another.
  if (order.batch_id) {
    const existing = db.batches.get(order.batch_id)
    if (existing) {
      return { order, batch: existing, stages: getStages(existing.id) }
    }
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new DomainError(ERROR_CODE.ORDER_CANNOT_BE_CANCELLED, 409)
  }

  const analysis = getAnalysis(order.id)
  if (!analysis || !analysis.result || !analysis.is_valid) {
    throw new DomainError(ERROR_CODE.ORDER_NOT_ANALYZED, 409)
  }

  // The manager may override anything the AI estimated (§14).
  const spec: AIAnalysisResult = {
    ...analysis.result,
    ...overrides?.spec,
    extracted: { ...analysis.result.extracted, ...overrides?.spec?.extracted },
    estimated: { ...analysis.result.estimated, ...overrides?.spec?.estimated },
  }

  const quantity = spec.extracted.quantity
  if (quantity === null || quantity <= 0) {
    throw new DomainError(ERROR_CODE.VALIDATION_FAILED, 422, {
      field: "quantity",
    })
  }

  const iso = nowIso()
  const deadlineDays = spec.extracted.deadline_days ?? 14
  const deadline =
    overrides?.deadline ??
    order.requested_deadline ??
    new Date(Date.now() + deadlineDays * 864e5).toISOString()

  const batch: ProductionBatch = {
    id: nextId("bat"),
    batch_code: nextBatchCode(),
    order_id: order.id,
    product_name: spec.extracted.product_name ?? "Sản phẩm gốm",
    quantity,
    current_stage: STAGE_TYPE.FORMING,
    status: BATCH_STATUS.PENDING,
    priority: overrides?.priority ?? spec.priority ?? PRIORITY.NORMAL,
    deadline,
    spec,
    started_at: null,
    completed_at: null,
    created_at: iso,
    updated_at: iso,
  }

  const stages = buildStages(batch.id, iso, (i) => nextId(`stg${i}`))

  db.batches.set(batch.id, batch)
  db.stages.set(batch.id, stages)

  order.status = ORDER_STATUS.IN_PRODUCTION
  order.batch_id = batch.id
  order.updated_at = iso

  recordEvent({
    event_type: EVENT_TYPE.ORDER_CONFIRMED,
    order_id: order.id,
    batch_id: batch.id,
    message: `Đơn ${order.order_code} đã được xác nhận`,
    created_by: ROLE.MANAGER,
  })
  recordEvent({
    event_type: EVENT_TYPE.BATCH_CREATED,
    batch_id: batch.id,
    order_id: order.id,
    message: `Mẻ ${batch.batch_code} được tạo với ${STAGE_SEQUENCE.length} công đoạn`,
    metadata: { stage_count: STAGE_SEQUENCE.length, quantity },
  })
  publish({ kind: "invalidate", scope: "all" })

  return { order, batch, stages }
}

export function cancelOrder(orderId: string): ProductionOrder {
  const order = getOrder(orderId)

  const cancellable: string[] = [
    ORDER_STATUS.DRAFT,
    ORDER_STATUS.AI_ANALYZING,
    ORDER_STATUS.AI_ANALYSIS_FAILED,
    ORDER_STATUS.PENDING_CONFIRMATION,
  ]
  if (!cancellable.includes(order.status)) {
    throw new DomainError(ERROR_CODE.ORDER_CANNOT_BE_CANCELLED, 409, {
      status: order.status,
    })
  }

  order.status = ORDER_STATUS.CANCELLED
  order.updated_at = nowIso()

  recordEvent({
    event_type: EVENT_TYPE.ORDER_CANCELLED,
    order_id: order.id,
    message: `Đơn ${order.order_code} đã bị huỷ`,
    created_by: ROLE.MANAGER,
  })
  publish({ kind: "invalidate", scope: "orders" })

  return order
}

/* ── Batches ──────────────────────────────────────────────────────────── */

export function getBatch(idOrCode: string): ProductionBatch {
  const batch = db.batches.get(idOrCode) ?? findBatchByCode(idOrCode)
  if (!batch) throw new DomainError(ERROR_CODE.BATCH_NOT_FOUND, 404)
  return batch
}

function findBatchByCode(code: string): ProductionBatch | undefined {
  for (const b of db.batches.values()) {
    if (b.batch_code === code) return b
  }
  return undefined
}

export function listBatches(): ProductionBatch[] {
  return [...db.batches.values()].sort((a, b) =>
    a.batch_code.localeCompare(b.batch_code)
  )
}

/** Denormalized view used by the board and batch cards. */
export function toCardView(batch: ProductionBatch, nowMs: number): BatchCardView {
  const stages = getStages(batch.id)
  const active = stages.find((s) => s.status === STAGE_STATUS.IN_PROGRESS)
  const reports = getQCReports(batch.id)

  return {
    ...batch,
    stages,
    completed_count: completedCount(stages),
    deadline_risk: deadlineRisk(
      batch.deadline,
      batch.current_stage,
      nowMs,
      batch.quantity
    ),
    current_stage_started_at: active?.started_at ?? null,
    latest_qc: reports.length ? reports[reports.length - 1] : null,
  }
}

export function listBatchViews(nowMs = Date.now()): BatchCardView[] {
  return listBatches().map((b) => toCardView(b, nowMs))
}

/* ── Workflow commands (§8) ───────────────────────────────────────────── */

interface CommandOptions {
  note?: string | null
  actor?: Role
}

function ctxFor(batch: ProductionBatch) {
  return { batchStatus: batch.status, stages: getStages(batch.id) }
}

function syncBatch(batch: ProductionBatch): void {
  const stages = getStages(batch.id)
  batch.status = deriveBatchStatus(stages, batch.status)
  batch.current_stage = resolveCurrentStage(stages)
  batch.updated_at = nowIso()

  if (batch.status === BATCH_STATUS.COMPLETED && !batch.completed_at) {
    batch.completed_at = nowIso()
    const order = db.orders.get(batch.order_id)
    if (order) {
      order.status = ORDER_STATUS.COMPLETED
      order.updated_at = nowIso()
    }
  }
}

export function startStage(
  batchIdOrCode: string,
  stage: StageType,
  options: CommandOptions = {}
): { batch: ProductionBatch; stage: ProductionStage } {
  const batch = getBatch(batchIdOrCode)
  const stages = getStages(batch.id)

  assertCanStart(ctxFor(batch), stage)

  const target = stages.find((s) => s.stage_type === stage)!
  const iso = nowIso()

  target.status = STAGE_STATUS.IN_PROGRESS
  target.started_at = iso
  target.updated_at = iso
  if (options.note) target.note = options.note

  if (!batch.started_at) batch.started_at = iso
  syncBatch(batch)

  recordEvent({
    event_type: EVENT_TYPE.STAGE_STARTED,
    batch_id: batch.id,
    order_id: batch.order_id,
    stage,
    message: `${STAGE_LABEL[stage]} bắt đầu`,
    metadata: { note: options.note ?? null },
    created_by: options.actor ?? ROLE.WORKER,
  })
  publish({ kind: "invalidate", scope: "batches" })

  return { batch, stage: target }
}

export function completeStage(
  batchIdOrCode: string,
  stage: StageType,
  options: CommandOptions = {}
): { batch: ProductionBatch; stage: ProductionStage } {
  const batch = getBatch(batchIdOrCode)
  const stages = getStages(batch.id)
  const target = stages.find((s) => s.stage_type === stage)

  // §21 idempotency — a double-click returns the existing state, not an error.
  if (target && target.status === STAGE_STATUS.COMPLETED) {
    return { batch, stage: target }
  }

  // §8.4 Rule 6 — QC leaves this stage only through a QC report.
  if (stage === STAGE_TYPE.QUALITY_CHECK) {
    const reports = getQCReports(batch.id)
    const passed = reports.some((r) => r.result === QC_RESULT.PASS)
    if (!passed) {
      throw new DomainError(ERROR_CODE.QC_REPORT_REQUIRED, 409)
    }
  }

  assertCanComplete(ctxFor(batch), stage)

  const confirmed = stages.find((s) => s.stage_type === stage)!
  const iso = nowIso()

  confirmed.status = STAGE_STATUS.COMPLETED
  confirmed.completed_at = iso
  confirmed.updated_at = iso
  if (options.note) confirmed.note = options.note

  syncBatch(batch)

  const next = nextStage(stage)
  recordEvent({
    event_type: EVENT_TYPE.STAGE_COMPLETED,
    batch_id: batch.id,
    order_id: batch.order_id,
    stage,
    message: `${STAGE_LABEL[stage]} hoàn thành`,
    metadata: { next_stage: next, note: options.note ?? null },
    created_by: options.actor ?? ROLE.WORKER,
  })

  if (batch.status === BATCH_STATUS.COMPLETED) {
    recordEvent({
      event_type: EVENT_TYPE.BATCH_COMPLETED,
      batch_id: batch.id,
      order_id: batch.order_id,
      message: `Mẻ ${batch.batch_code} đã hoàn thành toàn bộ quy trình`,
    })
  }

  publish({ kind: "invalidate", scope: "batches" })
  return { batch, stage: confirmed }
}

/** §8.4 Rule 5 — stage FAILED, batch BLOCKED, manager must intervene. */
export function failStage(
  batchIdOrCode: string,
  stage: StageType,
  reason: string,
  options: CommandOptions = {}
): { batch: ProductionBatch; stage: ProductionStage } {
  const batch = getBatch(batchIdOrCode)

  assertCanFail(ctxFor(batch), stage)

  const stages = getStages(batch.id)
  const target = stages.find((s) => s.stage_type === stage)!
  const iso = nowIso()

  target.status = STAGE_STATUS.FAILED
  target.note = reason
  target.updated_at = iso

  syncBatch(batch)

  recordEvent({
    event_type: EVENT_TYPE.STAGE_FAILED,
    batch_id: batch.id,
    order_id: batch.order_id,
    stage,
    message: `${STAGE_LABEL[stage]} gặp sự cố: ${reason}`,
    metadata: { reason },
    created_by: options.actor ?? ROLE.WORKER,
  })
  publish({ kind: "invalidate", scope: "batches" })

  return { batch, stage: target }
}

/**
 * Manager unblocks a failed stage, returning it to PENDING so it can be run
 * again. Not in the plan's must-have list, but without it a BLOCKED batch is a
 * dead end and the demo cannot recover.
 */
export function resolveStage(
  batchIdOrCode: string,
  stage: StageType,
  note?: string
): { batch: ProductionBatch; stage: ProductionStage } {
  const batch = getBatch(batchIdOrCode)
  const stages = getStages(batch.id)
  const target = stages.find((s) => s.stage_type === stage)
  if (!target) throw new DomainError(ERROR_CODE.STAGE_NOT_FOUND, 404)

  if (
    target.status !== STAGE_STATUS.FAILED &&
    target.status !== STAGE_STATUS.REWORK_REQUIRED
  ) {
    throw new DomainError(ERROR_CODE.INVALID_STAGE_TRANSITION, 409, {
      from: target.status,
      action: "resolve",
    })
  }

  const iso = nowIso()
  target.status = STAGE_STATUS.PENDING
  target.started_at = null
  target.completed_at = null
  target.note = note ?? target.note
  target.updated_at = iso

  batch.status = BATCH_STATUS.IN_PRODUCTION
  syncBatch(batch)

  recordEvent({
    event_type: EVENT_TYPE.STAGE_STARTED,
    batch_id: batch.id,
    order_id: batch.order_id,
    stage,
    message: `${STAGE_LABEL[stage]} được mở khoá để làm lại`,
    metadata: { note: note ?? null },
    created_by: ROLE.MANAGER,
  })
  publish({ kind: "invalidate", scope: "batches" })

  return { batch, stage: target }
}

/* ── QC (§10) ─────────────────────────────────────────────────────────── */

export function submitQC(
  batchIdOrCode: string,
  input: QCInput & { result?: QCResult; note?: string | null }
): { report: QCReport; defects: QCDefect[]; batch: ProductionBatch } {
  const batch = getBatch(batchIdOrCode)
  const stages = getStages(batch.id)
  const qcStage = stages.find((s) => s.stage_type === STAGE_TYPE.QUALITY_CHECK)!

  if (qcStage.status !== STAGE_STATUS.IN_PROGRESS) {
    throw new DomainError(ERROR_CODE.QC_STAGE_NOT_ACTIVE, 409, {
      current_status: qcStage.status,
    })
  }

  const existing = getQCReports(batch.id)
  if (existing.some((r) => r.result === QC_RESULT.PASS)) {
    throw new DomainError(ERROR_CODE.QC_ALREADY_SUBMITTED, 409)
  }

  // Throws INVALID_QC_QUANTITY / DEFECT_QUANTITY_MISMATCH per §22.
  const outcome = evaluateQC(input, input.result)
  const iso = nowIso()

  const report: QCReport = {
    id: nextId("qcr"),
    batch_id: batch.id,
    inspected_quantity: input.inspected_quantity,
    passed_quantity: input.passed_quantity,
    defective_quantity: input.defective_quantity,
    defect_rate: outcome.defect_rate,
    severity: outcome.severity,
    result: outcome.result,
    note: input.note ?? null,
    created_at: iso,
    updated_at: iso,
  }

  const defects: QCDefect[] = input.defects.map((d) => ({
    id: nextId("qcd"),
    qc_report_id: report.id,
    defect_type: d.defect_type,
    quantity: d.quantity,
    note: d.note ?? null,
  }))

  db.qcReports.set(batch.id, [...existing, report])
  db.qcDefects.set(report.id, defects)

  const rateLabel = formatRate(outcome.defect_rate)

  recordEvent({
    event_type: EVENT_TYPE.QC_SUBMITTED,
    batch_id: batch.id,
    order_id: batch.order_id,
    stage: STAGE_TYPE.QUALITY_CHECK,
    message: `Báo cáo QC: ${outcome.result} — defect rate ${rateLabel}`,
    metadata: {
      defect_rate: outcome.defect_rate,
      defect_rate_label: rateLabel,
      defective_quantity: input.defective_quantity,
      severity: outcome.severity,
      overridden: outcome.overridden,
    },
    created_by: ROLE.QC_OPERATOR,
  })

  if (outcome.result === QC_RESULT.PASS) {
    // §8.4 Rule 6 PASS branch — QC completes, PACKAGING unlocks.
    qcStage.status = STAGE_STATUS.COMPLETED
    qcStage.completed_at = iso
    qcStage.updated_at = iso
    syncBatch(batch)

    recordEvent({
      event_type: EVENT_TYPE.STAGE_COMPLETED,
      batch_id: batch.id,
      order_id: batch.order_id,
      stage: STAGE_TYPE.QUALITY_CHECK,
      message: `${STAGE_LABEL[STAGE_TYPE.QUALITY_CHECK]} hoàn thành — đạt`,
      metadata: { next_stage: STAGE_TYPE.PACKAGING },
      created_by: ROLE.QC_OPERATOR,
    })

    // A passing batch can still carry enough defects to be worth flagging.
    if (outcome.defect_rate > 0) {
      recordEvent({
        event_type: EVENT_TYPE.QC_WARNING,
        batch_id: batch.id,
        order_id: batch.order_id,
        stage: STAGE_TYPE.QUALITY_CHECK,
        message: `Có ${input.defective_quantity} sản phẩm lỗi (${rateLabel}) nhưng vẫn trong ngưỡng cho phép`,
        metadata: {
          defect_rate: outcome.defect_rate,
          defect_rate_label: rateLabel,
          defective_quantity: input.defective_quantity,
        },
      })
    }
  } else {
    // FAIL / REWORK branch — batch leaves the happy path (§8.4 Rule 6).
    qcStage.status = STAGE_STATUS.REWORK_REQUIRED
    qcStage.updated_at = iso
    batch.status = BATCH_STATUS.REWORK_REQUIRED
    batch.current_stage = STAGE_TYPE.QUALITY_CHECK
    batch.updated_at = iso

    const critical =
      outcome.severity === SEVERITY.CRITICAL ||
      outcome.defect_rate > DEFECT_RATE_CRITICAL_THRESHOLD

    recordEvent({
      event_type: critical ? EVENT_TYPE.QC_CRITICAL : EVENT_TYPE.QC_WARNING,
      batch_id: batch.id,
      order_id: batch.order_id,
      stage: STAGE_TYPE.QUALITY_CHECK,
      message: `Phát hiện ${input.defective_quantity} sản phẩm lỗi — defect rate ${rateLabel}`,
      metadata: {
        defect_rate: outcome.defect_rate,
        defect_rate_label: rateLabel,
        defective_quantity: input.defective_quantity,
        severity: outcome.severity,
      },
    })

    recordEvent({
      event_type: EVENT_TYPE.REWORK_REQUIRED,
      batch_id: batch.id,
      order_id: batch.order_id,
      stage: STAGE_TYPE.QUALITY_CHECK,
      message: `Mẻ ${batch.batch_code} cần làm lại`,
      metadata: {
        defect_rate_label: rateLabel,
        severity: outcome.severity,
      },
    })
  }

  publish({ kind: "invalidate", scope: "all" })
  return { report, defects, batch }
}

export function listQC(batchIdOrCode: string): Array<QCReport & { defects: QCDefect[] }> {
  const batch = getBatch(batchIdOrCode)
  return getQCReports(batch.id).map((r) => ({
    ...r,
    defects: db.qcDefects.get(r.id) ?? [],
  }))
}

/* ── Dashboard queries (§16.6) ────────────────────────────────────────── */

export function dashboardSummary(nowMs = Date.now()): DashboardSummary {
  const views = listBatchViews(nowMs)
  const startOfDay = new Date(nowMs)
  startOfDay.setHours(0, 0, 0, 0)

  const rates = views
    .map((v) => v.latest_qc?.defect_rate)
    .filter((r): r is number => typeof r === "number")

  return {
    in_production: views.filter((v) => v.status === BATCH_STATUS.IN_PRODUCTION)
      .length,
    at_risk: views.filter(
      (v) => v.deadline_risk === "AT_RISK" && v.status !== BATCH_STATUS.COMPLETED
    ).length,
    overdue: views.filter(
      (v) => v.deadline_risk === "OVERDUE" && v.status !== BATCH_STATUS.COMPLETED
    ).length,
    blocked: views.filter((v) => v.status === BATCH_STATUS.BLOCKED).length,
    rework: views.filter((v) => v.status === BATCH_STATUS.REWORK_REQUIRED).length,
    completed_today: views.filter(
      (v) => v.completed_at && new Date(v.completed_at) >= startOfDay
    ).length,
    avg_defect_rate: rates.length
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : 0,
    failed_notifications: db.notifications.filter((n) => n.status === "FAILED")
      .length,
  }
}

export interface KanbanColumn {
  stage: StageType
  batches: BatchCardView[]
}

export function dashboardKanban(nowMs = Date.now()): {
  columns: KanbanColumn[]
  rework: BatchCardView[]
} {
  const views = listBatchViews(nowMs)

  const rework = views.filter(
    (v) =>
      v.status === BATCH_STATUS.BLOCKED || v.status === BATCH_STATUS.REWORK_REQUIRED
  )
  const reworkIds = new Set(rework.map((v) => v.id))

  const active = views.filter(
    (v) =>
      !reworkIds.has(v.id) &&
      v.status !== BATCH_STATUS.CANCELLED &&
      v.status !== BATCH_STATUS.COMPLETED
  )

  const columns: KanbanColumn[] = STAGE_SEQUENCE.map((stage) => ({
    stage,
    batches: active.filter((v) => v.current_stage === stage),
  }))

  return { columns, rework }
}

export function listEvents(limit = 200, batchId?: string) {
  const source = batchId
    ? db.events.filter((e) => e.batch_id === batchId)
    : db.events
  return source.slice(-limit).reverse()
}
