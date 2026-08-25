/**
 * One function per endpoint in plan §16 — the complete API surface the UI uses.
 *
 * Keeping this list literal and exhaustive is what makes the backend swap a
 * mechanical exercise: these paths are the contract to implement.
 */

import type {
  DefectType,
  Priority,
  QCResult,
  StageType,
} from "@/lib/domain/enums"
import type {
  AIAnalysis,
  AIAnalysisResult,
  BatchCardView,
  DashboardSummary,
  Notification,
  ProductionBatch,
  ProductionOrder,
  ProductionStage,
  QCDefect,
  QCReport,
  WorkflowEvent,
} from "@/lib/domain/types"

import { api } from "./client"

/* ── Response shapes ──────────────────────────────────────────────────── */

export interface OrderDetail {
  order: ProductionOrder
  analysis: AIAnalysis | null
  batch: ProductionBatch | null
}

export interface BatchDetail {
  batch: BatchCardView
  qc: Array<QCReport & { defects: QCDefect[] }>
  events: WorkflowEvent[]
  order: ProductionOrder | null
}

export interface KanbanResponse {
  columns: Array<{ stage: StageType; batches: BatchCardView[] }>
  rework: BatchCardView[]
  summary: DashboardSummary
}

export interface StageCommandResult {
  batch: ProductionBatch
  stage: ProductionStage
}

export interface ConfirmResult {
  order: ProductionOrder
  batch: ProductionBatch
  stages: ProductionStage[]
}

export interface QCSubmitResult {
  report: QCReport
  defects: QCDefect[]
  batch: ProductionBatch
}

export interface SimConfig {
  aiFailureMode: "NONE" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_JSON" | "SCHEMA_INVALID"
  notificationFailureRate: number
  simulatorRunning: boolean
  simulatorSpeed: number
  /** Whether notifications really go to Telegram via the backend. */
  telegramEnabled: boolean
}

export interface QCSubmitInput {
  inspected_quantity: number
  passed_quantity: number
  defective_quantity: number
  defects: Array<{ defect_type: DefectType; quantity: number; note?: string | null }>
  result?: QCResult
  note?: string | null
}

/* ── §16.1 Orders ─────────────────────────────────────────────────────── */

export const listOrders = () =>
  api.get<{ orders: ProductionOrder[] }>("/api/orders")

export const getOrder = (id: string) => api.get<OrderDetail>(`/api/orders/${id}`)

export const createOrder = (raw_description: string) =>
  api.post<ProductionOrder>("/api/orders", { raw_description })

export const analyzeOrder = (id: string) =>
  api.post<{ order: ProductionOrder; analysis: AIAnalysis }>(
    `/api/orders/${id}/analyze`
  )

export const confirmOrder = (
  id: string,
  overrides?: { spec?: Partial<AIAnalysisResult>; priority?: Priority; deadline?: string }
) => api.post<ConfirmResult>(`/api/orders/${id}/confirm`, overrides ?? {})

export const cancelOrder = (id: string) =>
  api.post<ProductionOrder>(`/api/orders/${id}/cancel`)

/* ── §16.2 Batches ────────────────────────────────────────────────────── */

export const listBatches = () =>
  api.get<{ batches: BatchCardView[] }>("/api/batches")

export const getBatch = (id: string) => api.get<BatchDetail>(`/api/batches/${id}`)

/* ── §16.3 Stage commands ─────────────────────────────────────────────── */

export const startStage = (batchId: string, stage: StageType, note?: string) =>
  api.post<StageCommandResult>(
    `/api/batches/${batchId}/stages/${stage}/start`,
    { note }
  )

export const completeStage = (batchId: string, stage: StageType, note?: string) =>
  api.post<StageCommandResult>(
    `/api/batches/${batchId}/stages/${stage}/complete`,
    { note }
  )

export const failStage = (batchId: string, stage: StageType, reason: string) =>
  api.post<StageCommandResult>(
    `/api/batches/${batchId}/stages/${stage}/fail`,
    { reason }
  )

export const resolveStage = (batchId: string, stage: StageType, note?: string) =>
  api.post<StageCommandResult>(
    `/api/batches/${batchId}/stages/${stage}/resolve`,
    { note }
  )

/* ── §16.4 QC ─────────────────────────────────────────────────────────── */

export const listQC = (batchId: string) =>
  api.get<{ reports: Array<QCReport & { defects: QCDefect[] }> }>(
    `/api/batches/${batchId}/qc`
  )

export const submitQC = (batchId: string, input: QCSubmitInput) =>
  api.post<QCSubmitResult>(`/api/batches/${batchId}/qc`, input)

/* ── §16.5 Events ─────────────────────────────────────────────────────── */

export const listEvents = (limit = 200) =>
  api.get<{ events: WorkflowEvent[] }>(`/api/events?limit=${limit}`)

export const listBatchEvents = (batchId: string) =>
  api.get<{ events: WorkflowEvent[] }>(`/api/batches/${batchId}/events`)

/* ── §16.6 Dashboard ──────────────────────────────────────────────────── */

export const getSummary = () => api.get<DashboardSummary>("/api/dashboard/summary")

export const getKanban = () => api.get<KanbanResponse>("/api/dashboard/kanban")

/* ── Notifications (§11) ──────────────────────────────────────────────── */

export const listNotifications = () =>
  api.get<{ notifications: Notification[] }>("/api/notifications")

export const retryNotification = (id: string) =>
  api.post<Notification>(`/api/notifications/${id}/retry`)

/* ── Demo controls (not part of the §16 contract) ─────────────────────── */

export const getSimConfig = () => api.get<SimConfig>("/api/sim")

export const setSim = (body: Record<string, unknown>) =>
  api.post<SimConfig>("/api/sim", body)

/** §16.7 — the SSE endpoint the dashboard subscribes to. */
export const EVENT_STREAM_PATH = "/api/events/stream"
