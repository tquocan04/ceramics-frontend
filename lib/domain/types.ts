/**
 * The eight MVP entities of plan §15, plus the AI analysis payload shape
 * from §6.2 / §34 and the API error envelope from §20.
 *
 * Timestamps are ISO-8601 strings so everything is JSON-serializable and can
 * cross the HTTP boundary unchanged when the real backend replaces the mock.
 */

import type {
  BatchStatus,
  DeadlineRisk,
  DefectType,
  EventType,
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  Priority,
  QCResult,
  Role,
  Severity,
  StageStatus,
  StageType,
} from "./enums"

/** §5.2 */
export interface ProductionOrder {
  id: string
  order_code: string
  raw_description: string
  status: OrderStatus
  requested_deadline: string | null
  ai_analysis_id: string | null
  batch_id: string | null
  created_at: string
  updated_at: string
}

/**
 * §34 — the extracted/estimated split. `extracted` is what the customer
 * actually stated; `estimated` is what the model inferred. Keeping them apart
 * is what lets the review screen mark AI guesses as overridable.
 */
export interface AIExtractedData {
  product_name: string | null
  quantity: number | null
  height_cm: number | null
  width_cm: number | null
  decoration_pattern: string | null
  glaze_type: string | null
  firing_temperature_c: number | null
  deadline_days: number | null
}

export interface AIEstimatedData {
  clay_kg: number | null
  glaze_kg: number | null
  firing_duration_hours: number | null
}

export interface AIAnalysisResult {
  extracted: AIExtractedData
  estimated: AIEstimatedData
  priority: Priority | null
  priority_reason: string | null
  /** Character offsets into raw_description backing each extracted field. */
  provenance: Partial<Record<keyof AIExtractedData, [number, number]>>
}

/** §6 — persisted so an AI failure never loses the order (§6.6). */
export interface AIAnalysis {
  id: string
  order_id: string
  model: string
  prompt_version: string
  raw_response: string
  result: AIAnalysisResult | null
  is_valid: boolean
  validation_errors: string[]
  error_code: string | null
  attempt: number
  latency_ms: number
  created_at: string
}

/** §7.2 */
export interface ProductionBatch {
  id: string
  batch_code: string
  order_id: string
  product_name: string
  quantity: number
  current_stage: StageType
  status: BatchStatus
  priority: Priority
  deadline: string
  spec: AIAnalysisResult
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** §8.3 */
export interface ProductionStage {
  id: string
  batch_id: string
  stage_type: StageType
  sequence: number
  status: StageStatus
  started_at: string | null
  completed_at: string | null
  note: string | null
  metadata: Record<string, unknown>
  updated_at: string
}

/** §10.3 */
export interface QCReport {
  id: string
  batch_id: string
  inspected_quantity: number
  passed_quantity: number
  defective_quantity: number
  defect_rate: number
  severity: Severity
  result: QCResult
  note: string | null
  created_at: string
  updated_at: string
}

/** §10.3 */
export interface QCDefect {
  id: string
  qc_report_id: string
  defect_type: DefectType
  quantity: number
  note: string | null
}

/** §12.1 — immutable audit record. */
export interface WorkflowEvent {
  id: string
  batch_id: string | null
  order_id: string | null
  event_type: EventType
  stage: StageType | null
  message: string
  metadata: Record<string, unknown>
  created_by: Role
  created_at: string
}

/** §11.5 */
export interface Notification {
  id: string
  event_id: string
  channel: NotificationChannel
  status: NotificationStatus
  payload: string
  retry_count: number
  error_message: string | null
  sent_at: string | null
  created_at: string
}

/* ── Read models ──────────────────────────────────────────────────────── */

/** What a batch card needs, denormalized by the dashboard query (§16.6). */
export interface BatchCardView extends ProductionBatch {
  stages: ProductionStage[]
  completed_count: number
  deadline_risk: DeadlineRisk
  current_stage_started_at: string | null
  latest_qc: QCReport | null
}

/** §16.6 GET /api/dashboard/summary */
export interface DashboardSummary {
  in_production: number
  at_risk: number
  overdue: number
  blocked: number
  rework: number
  completed_today: number
  avg_defect_rate: number
  failed_notifications: number
}

/** §20 — one error envelope for every rejection, so the UI can show the code. */
export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
