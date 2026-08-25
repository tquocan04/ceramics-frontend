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
  type DeadlineRisk,
  type EventType,
  type Role,
  type Severity,
  type StageType,
} from "@/lib/domain/enums"
import {
  BATCH_STATUS_LABEL,
  DEADLINE_RISK_LABEL,
  PRIORITY_LABEL,
  SEVERITY_LABEL,
  STAGE_LABEL,
} from "@/lib/domain/labels"
import { completedCount, nextStage, STAGE_COUNT } from "@/lib/domain/workflow"
import type { Notification, WorkflowEvent } from "@/lib/domain/types"

import { publish } from "./bus"
import { db, getStages, nextId, nowIso } from "./db"
import { enqueueTelegram, type TelegramLevel } from "./telegram"

export interface RecordEventInput {
  event_type: EventType
  batch_id?: string | null
  order_id?: string | null
  stage?: StageType | null
  message: string
  metadata?: Record<string, unknown>
  created_by?: Role
}

/**
 * Which events warrant an outbound message (§11.2).
 *
 * Deliberately narrow. Every event still lands in the audit log and the live
 * rail; this set only decides what is worth interrupting a manager's phone for.
 * BATCH_CREATED, STAGE_STARTED and the low-severity QC_WARNING were pulled out
 * because with several batches in flight they turn the chat into noise — a
 * batch would generate roughly eighteen messages on its way through the seven
 * công đoạn, and Telegram throttles a group at about twenty per minute.
 *
 * A critical QC failure deliberately sends twice (QC_CRITICAL then
 * REWORK_REQUIRED): the worst case should also be the loudest. A merely
 * out-of-threshold batch sends once, via REWORK_REQUIRED.
 */
const NOTIFIABLE: ReadonlySet<EventType> = new Set<EventType>([
  EVENT_TYPE.STAGE_COMPLETED,
  EVENT_TYPE.BATCH_COMPLETED,
  EVENT_TYPE.STAGE_FAILED,
  EVENT_TYPE.QC_CRITICAL,
  EVENT_TYPE.REWORK_REQUIRED,
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

/* ── Telegram message composition ─────────────────────────────────────── */

/**
 * Severity of the outbound message, which the backend turns into an icon and a
 * bold title (📢 INFO / ⚠️ WARNING / 🚨 CRITICAL).
 */
const TELEGRAM_LEVEL: Partial<Record<EventType, TelegramLevel>> = {
  [EVENT_TYPE.STAGE_COMPLETED]: "INFO",
  [EVENT_TYPE.BATCH_COMPLETED]: "INFO",
  [EVENT_TYPE.REWORK_REQUIRED]: "WARNING",
  [EVENT_TYPE.DEADLINE_WARNING]: "WARNING",
  [EVENT_TYPE.STAGE_FAILED]: "CRITICAL",
  [EVENT_TYPE.QC_CRITICAL]: "CRITICAL",
}

/**
 * Titles are fixed strings and must stay free of & < >.
 *
 * The backend escapes the title and THEN uppercases it, so an escaped `&amp;`
 * becomes `&AMP;` and Telegram's HTML parser rejects the whole message. The
 * body has no such problem — it is escaped after the fact, which is why the
 * stage label "Phơi/Sấy & Sửa mộc" is safe to interpolate below.
 */
const TELEGRAM_TITLE: Record<TelegramLevel, string> = {
  INFO: "Tiến độ sản xuất",
  WARNING: "Cảnh báo sản xuất",
  CRITICAL: "Sự cố sản xuất",
}

/**
 * "17:30 25/08" — short enough to sit inside a headline sentence.
 *
 * Built by hand rather than through toLocaleDateString: the vi-VN date pattern
 * varies by ICU build (some emit 25-08), and a timestamp that changes shape
 * depending on where the server runs is not worth the convenience.
 */
function shortTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** Manager call-to-action, in the plain-text emphasis Telegram will preserve. */
const MANAGER_CTA = ">> QUẢN LÝ CẦN KIỂM TRA VÀ XÁC NHẬN <<"

function joinLines(lines: Array<string | null>): string {
  return lines.filter((l) => l !== null).join("\n")
}

export interface TelegramMessage {
  title: string
  message: string
  level: TelegramLevel
}

/**
 * Render an event as the message body posted to the backend.
 *
 * Plain text and emoji only: the backend HTML-escapes the body before handing
 * it to Telegram, so any <b> we sent would arrive as literal angle brackets.
 * Emphasis therefore comes from emoji, capitals and layout.
 */
export function formatTelegram(event: WorkflowEvent): TelegramMessage {
  const level = TELEGRAM_LEVEL[event.event_type] ?? "INFO"
  const batch = event.batch_id ? db.batches.get(event.batch_id) : null
  const code = batch?.batch_code ?? event.batch_id ?? "—"
  const meta = event.metadata as Record<string, unknown>
  const at = shortTime(event.created_at)
  const stageLabel = event.stage ? STAGE_LABEL[event.stage] : "—"

  const product = batch?.product_name ?? "—"
  const quantity = batch?.quantity ?? "—"
  const priority = batch ? PRIORITY_LABEL[batch.priority].toUpperCase() : "—"

  let message: string

  switch (event.event_type) {
    case EVENT_TYPE.STAGE_COMPLETED: {
      const next = event.stage ? nextStage(event.stage) : null
      const done = batch ? completedCount(getStages(batch.id)) : 0
      const tail = next
        ? `và chuyển sang công đoạn "${STAGE_LABEL[next]}"`
        : "và kết thúc quy trình sản xuất"

      message = joinLines([
        `✅ Lô hàng ${code} đã hoàn thành công đoạn "${stageLabel}" ${tail} lúc ${at}.`,
        "",
        `Sản phẩm: ${product}`,
        `Số lượng: ${quantity} · Ưu tiên: ${priority}`,
        `Tiến độ: ${done}/${STAGE_COUNT} công đoạn`,
      ])
      break
    }

    case EVENT_TYPE.BATCH_COMPLETED: {
      const started = batch?.started_at ? new Date(batch.started_at) : null
      const elapsed = started
        ? `${Math.max(1, Math.round((Date.now() - started.getTime()) / 36e5))} giờ`
        : null

      message = joinLines([
        `🎉 Lô hàng ${code} đã hoàn tất toàn bộ quy trình sản xuất lúc ${at}.`,
        "",
        `Sản phẩm: ${product}`,
        `Số lượng: ${quantity} · Ưu tiên: ${priority}`,
        elapsed ? `Tổng thời gian: ${elapsed}` : null,
        "",
        "Lô hàng đã sẵn sàng để giao.",
      ])
      break
    }

    case EVENT_TYPE.STAGE_FAILED:
      message = joinLines([
        `🚨 SỰ CỐ — Lô hàng ${code} gặp sự cố tại công đoạn "${stageLabel}" lúc ${at}.`,
        "",
        `Sản phẩm: ${product} · SL: ${quantity}`,
        `Lý do: ${meta.reason ?? event.message}`,
        `Trạng thái lô: ${batch ? BATCH_STATUS_LABEL[batch.status].toUpperCase() : "—"}`,
        "",
        "Dây chuyền đã dừng tại công đoạn này.",
        MANAGER_CTA,
      ])
      break

    case EVENT_TYPE.QC_CRITICAL: {
      const severity = meta.severity as Severity | undefined
      message = joinLines([
        `🚨 QC NGHIÊM TRỌNG — Lô hàng ${code} không đạt kiểm định lúc ${at}.`,
        "",
        `Sản phẩm: ${product} · SL: ${quantity}`,
        `Số lượng lỗi: ${meta.defective_quantity ?? "—"}`,
        `Tỉ lệ lỗi: ${meta.defect_rate_label ?? "—"}`,
        `Mức độ: ${severity ? SEVERITY_LABEL[severity].toUpperCase() : "—"}`,
        "",
        MANAGER_CTA,
      ])
      break
    }

    case EVENT_TYPE.REWORK_REQUIRED: {
      const severity = meta.severity as Severity | undefined
      message = joinLines([
        `⚠️ CẦN LÀM LẠI — Lô hàng ${code} phải quay lại xử lý sau kiểm định lúc ${at}.`,
        "",
        `Sản phẩm: ${product} · SL: ${quantity}`,
        `Tỉ lệ lỗi: ${meta.defect_rate_label ?? "—"}`,
        `Mức độ: ${severity ? SEVERITY_LABEL[severity].toUpperCase() : "—"}`,
        "",
        MANAGER_CTA,
      ])
      break
    }

    case EVENT_TYPE.DEADLINE_WARNING: {
      const risk = meta.deadline_risk as DeadlineRisk | undefined
      message = joinLines([
        `⏰ CẢNH BÁO TIẾN ĐỘ — Lô hàng ${code} có nguy cơ trễ hạn, ghi nhận lúc ${at}.`,
        "",
        `Sản phẩm: ${product} · SL: ${quantity}`,
        `Hạn giao: ${batch ? shortTime(batch.deadline) : "—"}`,
        `Đánh giá: ${risk ? DEADLINE_RISK_LABEL[risk].toUpperCase() : "—"}`,
        `Công đoạn hiện tại: ${batch ? STAGE_LABEL[batch.current_stage] : "—"}`,
        "",
        MANAGER_CTA,
      ])
      break
    }

    default:
      message = `Lô hàng ${code} — ${event.message} (${at})`
  }

  // Batch code rides in the title so a glance at the chat list — where
  // Telegram shows the first line — already says which lô hàng moved. Codes are
  // [A-Z0-9-] only, so they survive the backend's escape-then-uppercase step.
  const title = batch
    ? `${TELEGRAM_TITLE[level]} [${batch.batch_code}]`
    : TELEGRAM_TITLE[level]

  return { title, message, level }
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
    void attemptSend(notification.id)
    return
  }

  // Deliver on the next tick so the workflow transaction is never blocked by
  // the transport, mirroring "after commit -> async notification" (§33).
  setTimeout(() => {
    void attemptSend(notification.id)
  }, 250)
}

/**
 * Whether this send should go out over the wire.
 *
 * `syncNotifications` is only ever true while seed.ts replays a shift's worth
 * of history, and that replay must never reach a real chat — thirty messages
 * on every dev-server boot. It doubles as the seeding guard here.
 */
function shouldSendForReal(): boolean {
  return db.config.telegramEnabled && !db.config.syncNotifications
}

/**
 * Attempt delivery for one outbox row.
 *
 * Returns as soon as the message is queued, not when it lands: the real verdict
 * arrives later over the invalidate channel. Nothing in the workflow may block
 * on the transport (§11.6).
 */
export async function attemptSend(
  notificationId: string
): Promise<Notification | null> {
  const n = db.notifications.find((x) => x.id === notificationId)
  if (!n) return null

  if (shouldSendForReal()) {
    const event = db.events.find((e) => e.id === n.event_id)
    if (!event) {
      n.status = NOTIFICATION_STATUS.FAILED
      n.error_message = "Không tìm thấy sự kiện gốc của thông báo"
      n.retry_count += 1
      publish({ kind: "invalidate", scope: "notifications" })
      return n
    }

    const { title, message, level } = formatTelegram(event)

    // Keep the outbox preview honest about what actually goes to Telegram.
    n.payload = message
    n.status = NOTIFICATION_STATUS.PENDING
    n.error_message = null

    enqueueTelegram({ notificationId: n.id, title, message, level })
    publish({ kind: "invalidate", scope: "notifications" })
    return n
  }

  // Mock transport — the §28 Scenario E failure dial only applies here.
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
export async function retryNotification(
  notificationId: string
): Promise<Notification | null> {
  const n = db.notifications.find((x) => x.id === notificationId)
  if (!n) return null

  n.status = NOTIFICATION_STATUS.PENDING
  publish({ kind: "invalidate", scope: "notifications" })

  return attemptSend(notificationId)
}
