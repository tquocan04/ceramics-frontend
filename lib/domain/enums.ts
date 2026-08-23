/**
 * Every enum in the system, transcribed verbatim from the project plan.
 * Modelled as const objects + union types so they are iterable at runtime
 * (for building UI lists) and exact at compile time.
 *
 * Refs: plan §5.3, §7.3, §8.1, §8.2, §10.4, §10.5, §11.2, §11.5, §14, §20
 */

/** §8.1 — the seven production stages, in workflow order. */
export const STAGE_TYPE = {
  FORMING: "FORMING",
  DRYING: "DRYING",
  DECORATING: "DECORATING",
  GLAZING: "GLAZING",
  FIRING: "FIRING",
  QUALITY_CHECK: "QUALITY_CHECK",
  PACKAGING: "PACKAGING",
} as const
export type StageType = (typeof STAGE_TYPE)[keyof typeof STAGE_TYPE]

/** §8.2 */
export const STAGE_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  REWORK_REQUIRED: "REWORK_REQUIRED",
} as const
export type StageStatus = (typeof STAGE_STATUS)[keyof typeof STAGE_STATUS]

/** §5.3 */
export const ORDER_STATUS = {
  DRAFT: "DRAFT",
  AI_ANALYZING: "AI_ANALYZING",
  AI_ANALYSIS_FAILED: "AI_ANALYSIS_FAILED",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  CONFIRMED: "CONFIRMED",
  IN_PRODUCTION: "IN_PRODUCTION",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

/** §7.3 */
export const BATCH_STATUS = {
  PENDING: "PENDING",
  IN_PRODUCTION: "IN_PRODUCTION",
  BLOCKED: "BLOCKED",
  REWORK_REQUIRED: "REWORK_REQUIRED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const
export type BatchStatus = (typeof BATCH_STATUS)[keyof typeof BATCH_STATUS]

/** §14 */
export const PRIORITY = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]

/** §10.4 */
export const QC_RESULT = {
  PASS: "PASS",
  FAIL: "FAIL",
  REWORK_REQUIRED: "REWORK_REQUIRED",
} as const
export type QCResult = (typeof QC_RESULT)[keyof typeof QC_RESULT]

/** §10.5 */
export const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const
export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]

/** §10.1 — defect taxonomy. */
export const DEFECT_TYPE = {
  GLAZE_CRACK: "GLAZE_CRACK",
  DEFORMATION: "DEFORMATION",
  WRONG_COLOR: "WRONG_COLOR",
  CHIPPED: "CHIPPED",
  UNDER_FIRED: "UNDER_FIRED",
  OTHER: "OTHER",
} as const
export type DefectType = (typeof DEFECT_TYPE)[keyof typeof DEFECT_TYPE]

/** §11.2 — events that warrant a notification, plus the audit-only ones. */
export const EVENT_TYPE = {
  ORDER_CREATED: "ORDER_CREATED",
  AI_ANALYSIS_STARTED: "AI_ANALYSIS_STARTED",
  AI_ANALYSIS_COMPLETED: "AI_ANALYSIS_COMPLETED",
  AI_ANALYSIS_FAILED: "AI_ANALYSIS_FAILED",
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  BATCH_CREATED: "BATCH_CREATED",
  STAGE_STARTED: "STAGE_STARTED",
  STAGE_COMPLETED: "STAGE_COMPLETED",
  STAGE_FAILED: "STAGE_FAILED",
  QC_SUBMITTED: "QC_SUBMITTED",
  QC_WARNING: "QC_WARNING",
  QC_CRITICAL: "QC_CRITICAL",
  REWORK_REQUIRED: "REWORK_REQUIRED",
  BATCH_COMPLETED: "BATCH_COMPLETED",
  DEADLINE_WARNING: "DEADLINE_WARNING",
  TRANSITION_REJECTED: "TRANSITION_REJECTED",
} as const
export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE]

/** §11.5 */
export const NOTIFICATION_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
} as const
export type NotificationStatus =
  (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS]

export const NOTIFICATION_CHANNEL = {
  TELEGRAM: "TELEGRAM",
  SLACK: "SLACK",
  ZALO: "ZALO",
} as const
export type NotificationChannel =
  (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL]

/** §35.5 — deadline risk, surfaced on every batch card. */
export const DEADLINE_RISK = {
  ON_TRACK: "ON_TRACK",
  AT_RISK: "AT_RISK",
  OVERDUE: "OVERDUE",
} as const
export type DeadlineRisk = (typeof DEADLINE_RISK)[keyof typeof DEADLINE_RISK]

/** Domain actor roles (§4). Kept at domain level only — no RBAC in the MVP. */
export const ROLE = {
  MANAGER: "MANAGER",
  WORKER: "WORKER",
  QC_OPERATOR: "QC_OPERATOR",
  SYSTEM: "SYSTEM",
} as const
export type Role = (typeof ROLE)[keyof typeof ROLE]
