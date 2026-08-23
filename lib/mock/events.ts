/**
 * Event publishing and the notification pipeline.
 *
 * §11.4 is explicit that the workflow must NOT call Telegram directly:
 *
 *     WorkflowService -> Create Event -> NotificationService -> Telegram Adapter
 *
 * and §11.6 that a failed send must never roll back production state. Both are
 * enforced here: `recordEvent` persists the event and returns; delivery is
 * dispatched afterwards and every failure is swallowed into a FAILED
 * notification row.
 */

import "server-only"

import {
  EVENT_TYPE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  ROLE,
  type EventType,
  type Role,
  type StageType,
} from "@/lib/domain/enums"
import { STAGE_LABEL } from "@/lib/domain/labels"
import { nextStage } from "@/lib/domain/workflow"
import type { Notification, WorkflowEvent } from "@/lib/domain/types"

import { publish } from "./bus"
import { db, nextId, nowIso } from "./db"

export interface RecordEventInput {
  event_type: EventType
  batch_id?: string | null
  order_id?: string | null
  stage?: StageType | null
  message: string
  metadata?: Record<string, unknown>
  created_by?: Role
}

/** Which events warrant an outbound message (§11.2). */
const NOTIFIABLE: ReadonlySet<EventType> = new Set<EventType>([
  EVENT_TYPE.BATCH_CREATED,
  EVENT_TYPE.STAGE_STARTED,
  EVENT_TYPE.STAGE_COMPLETED,
  EVENT_TYPE.STAGE_FAILED,
  EVENT_TYPE.QC_WARNING,
  EVENT_TYPE.QC_CRITICAL,
  EVENT_TYPE.REWORK_REQUIRED,
  EVENT_TYPE.BATCH_COMPLETED,
  EVENT_TYPE.DEADLINE_WARNING,
])

/**
 * Persist an immutable event (§12), push it to connected dashboards, then
 * dispatch a notification if the type warrants one. Never throws.
 */
export function recordEvent(input: RecordEventInput): WorkflowEvent {
  const event: WorkflowEvent = {
    id: nextId("evt"),
    batch_id: input.batch_id ?? null,
    order_id: input.order_id ?? null,
    event_type: input.event_type,
    stage: input.stage ?? null,
    message: input.message,
    metadata: input.metadata ?? {},
    created_by: input.created_by ?? ROLE.SYSTEM,
    created_at: nowIso(),
  }

  db.events.push(event)
  publish({ kind: "event", event })

  if (NOTIFIABLE.has(event.event_type)) {
    dispatchNotification(event)
  }

  return event
}

/* ── Telegram adapter (mocked) ────────────────────────────────────────── */

/**
 * §11.3 message templates. Kept close to the plan text so the Telegram output
 * in the demo matches the spec.
 */
export function formatMessage(event: WorkflowEvent): string {
  const batch = event.batch_id ? db.batches.get(event.batch_id) : null
  const code = batch?.batch_code ?? event.batch_id ?? "—"
  const meta = event.metadata as Record<string, unknown>

  switch (event.event_type) {
    case EVENT_TYPE.BATCH_CREATED:
      return [
        `🆕 Mẻ ${code} đã được tạo`,
        "",
        `Sản phẩm: ${batch?.product_name ?? "—"}`,
        `Số lượng: ${batch?.quantity ?? "—"}`,
        `Priority: ${batch?.priority ?? "—"}`,
      ].join("\n")

    case EVENT_TYPE.STAGE_STARTED: {
      if (event.stage === "FIRING") {
        const temp = batch?.spec.extracted.firing_temperature_c
        const hours = batch?.spec.estimated.firing_duration_hours
        return [
          `🔥 Mẻ ${code} đã vào lò`,
          "",
          `Nhiệt độ: ${temp ?? "—"}°C`,
          `Thời gian dự kiến: ${hours ?? "—"} giờ`,
        ].join("\n")
      }
      return [
        `▶️ Mẻ ${code}`,
        "",
        `Bắt đầu: ${event.stage ? STAGE_LABEL[event.stage] : "—"}`,
      ].join("\n")
    }

    case EVENT_TYPE.STAGE_COMPLETED: {
      const next = event.stage ? nextStage(event.stage) : null
      return [
        `✅ Mẻ ${code}`,
        "",
        `Đã hoàn thành: ${event.stage ? STAGE_LABEL[event.stage] : "—"}`,
        `Công đoạn tiếp theo: ${next ? STAGE_LABEL[next] : "—"}`,
        "",
        `Số lượng: ${batch?.quantity ?? "—"}`,
        `Priority: ${batch?.priority ?? "—"}`,
      ].join("\n")
    }

    case EVENT_TYPE.STAGE_FAILED:
      return [
        `⛔ Mẻ ${code} gặp sự cố`,
        "",
        `Công đoạn: ${event.stage ? STAGE_LABEL[event.stage] : "—"}`,
        `Lý do: ${meta.reason ?? event.message}`,
        "",
        "Yêu cầu quản lý xử lý.",
      ].join("\n")

    case EVENT_TYPE.QC_WARNING:
    case EVENT_TYPE.QC_CRITICAL: {
      const icon = event.event_type === EVENT_TYPE.QC_CRITICAL ? "🔴" : "🟠"
      return [
        `${icon} CẢNH BÁO QC`,
        "",
        `Mẻ: ${code}`,
        `Phát hiện: ${meta.defective_quantity ?? "—"} sản phẩm lỗi`,
        `Defect rate: ${meta.defect_rate_label ?? "—"}`,
        "",
        "Yêu cầu quản lý kiểm tra.",
      ].join("\n")
    }

    case EVENT_TYPE.REWORK_REQUIRED:
      return [
        `♻️ Mẻ ${code} cần làm lại`,
        "",
        `Defect rate: ${meta.defect_rate_label ?? "—"}`,
        `Mức độ: ${meta.severity ?? "—"}`,
      ].join("\n")

    case EVENT_TYPE.BATCH_COMPLETED:
      return [
        `🎉 Mẻ ${code} đã hoàn thành`,
        "",
        `Sản phẩm: ${batch?.product_name ?? "—"}`,
        `Số lượng: ${batch?.quantity ?? "—"}`,
      ].join("\n")

    case EVENT_TYPE.DEADLINE_WARNING:
      return [
        `⏰ Cảnh báo deadline — Mẻ ${code}`,
        "",
        `${event.message}`,
      ].join("\n")

    default:
      return `${code} — ${event.message}`
  }
}

/**
 * Simulates the Telegram send. Deliberately fire-and-forget: production state
 * is already committed by the time this runs (§11.6, §19).
 */
function dispatchNotification(event: WorkflowEvent): void {
  const notification: Notification = {
    id: nextId("ntf"),
    event_id: event.id,
    channel: NOTIFICATION_CHANNEL.TELEGRAM,
    status: NOTIFICATION_STATUS.PENDING,
    payload: formatMessage(event),
    retry_count: 0,
    error_message: null,
    sent_at: null,
    created_at: nowIso(),
  }

  db.notifications.push(notification)

  if (db.config.syncNotifications) {
    attemptSend(notification.id)
    return
  }

  // Deliver on the next tick so the workflow transaction is never blocked by
  // the transport, mirroring "after commit -> async notification" (§33).
  setTimeout(() => {
    attemptSend(notification.id)
  }, 250)
}

export function attemptSend(notificationId: string): Notification | null {
  const n = db.notifications.find((x) => x.id === notificationId)
  if (!n) return null

  const failed = Math.random() < db.config.notificationFailureRate

  if (failed) {
    n.status = NOTIFICATION_STATUS.FAILED
    n.error_message = "Telegram API request failed (mock)"
    n.retry_count += 1
  } else {
    n.status = NOTIFICATION_STATUS.SENT
    n.sent_at = nowIso()
    n.error_message = null
  }

  publish({ kind: "invalidate", scope: "notifications" })
  return n
}

/** Manual retry from the notifications screen (§11.6). */
export function retryNotification(notificationId: string): Notification | null {
  const n = db.notifications.find((x) => x.id === notificationId)
  if (!n) return null

  n.status = NOTIFICATION_STATUS.PENDING
  publish({ kind: "invalidate", scope: "notifications" })

  return attemptSend(notificationId)
}
