/**
 * Outbound Telegram adapter.
 *
 * The real send lives in the Express backend at POST /api/notifications/trigger.
 * That endpoint has no CORS headers, so it can only be reached from a server
 * context — which is exactly where this module runs. It is also unthrottled and
 * sends to Telegram *synchronously inside the request*, so pacing is our job:
 * Telegram drops group messages above roughly 20/min, and the simulator can
 * easily out-produce that.
 *
 * Everything here is fire-and-forget. §11.6 is explicit that a failed send must
 * never roll back production, so no caller ever awaits delivery — the queue
 * settles the Notification row afterwards and pushes an invalidate.
 */

import "server-only"

import { NOTIFICATION_STATUS } from "@/lib/domain/enums"

import { publish } from "./bus"
import { db, nowIso } from "./db"

export type TelegramLevel = "INFO" | "WARNING" | "CRITICAL"

export interface TelegramJob {
  notificationId: string
  title: string
  message: string
  level: TelegramLevel
}

/* ── Config ───────────────────────────────────────────────────────────── */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Where the Express backend lives. Its actual dev port is 5000, not 8080. */
const BASE_URL = process.env.BACKEND_API_BASE_URL ?? "http://localhost:5000"

/** ~17 msg/min, comfortably under Telegram's ~20/min per-group ceiling. */
const MIN_INTERVAL_MS = envInt("TELEGRAM_MIN_INTERVAL_MS", 3500)

/** Backpressure ceiling. Past this we start shedding routine messages. */
const QUEUE_MAX = envInt("TELEGRAM_QUEUE_MAX", 40)

/** The backend sets no timeout of its own, so we bring one. */
const TIMEOUT_MS = envInt("TELEGRAM_TIMEOUT_MS", 8000)

export function telegramEnabledByEnv(): boolean {
  return process.env.TELEGRAM_NOTIFY_ENABLED === "true"
}

export function telegramBaseUrl(): string {
  return BASE_URL
}

/* ── Queue state ──────────────────────────────────────────────────────── */

const GLOBAL_KEY = Symbol.for("ceramics.mock.telegram")

interface QueueState {
  queue: TelegramJob[]
  draining: boolean
  /** Epoch ms of the last completed send, for rate limiting across bursts. */
  lastSentAt: number
}

type GlobalWithQueue = typeof globalThis & { [GLOBAL_KEY]?: QueueState }

const g = globalThis as GlobalWithQueue

// Pinned to globalThis for the same reason db and bus are: Turbopack HMR would
// otherwise leave a second drain loop running against a stale queue.
const state: QueueState = (g[GLOBAL_KEY] ??= {
  queue: [],
  draining: false,
  lastSentAt: 0,
})

function isAlert(level: TelegramLevel): boolean {
  return level !== "INFO"
}

/**
 * Settle a notification row and let connected dashboards know. Tolerates a row
 * that has since been wiped by a demo reset.
 */
function settle(notificationId: string, ok: boolean, error?: string): void {
  const n = db.notifications.find((x) => x.id === notificationId)
  if (!n) return

  if (ok) {
    n.status = NOTIFICATION_STATUS.SENT
    n.sent_at = nowIso()
    n.error_message = null
  } else {
    n.status = NOTIFICATION_STATUS.FAILED
    n.error_message = error ?? "Gửi Telegram thất bại"
    n.retry_count += 1
  }

  publish({ kind: "invalidate", scope: "notifications" })
}

/**
 * Enqueue a message. Returns immediately — never await this from a workflow
 * command.
 *
 * Alerts jump ahead of queued routine traffic, because a sự cố sitting behind
 * twenty "stage completed" messages is a sự cố nobody reads in time.
 */
export function enqueueTelegram(job: TelegramJob): void {
  if (isAlert(job.level)) {
    const firstInfo = state.queue.findIndex((j) => !isAlert(j.level))
    if (firstInfo === -1) state.queue.push(job)
    else state.queue.splice(firstInfo, 0, job)
  } else {
    state.queue.push(job)
  }

  // Shed routine traffic under backpressure; never drop an alert.
  while (state.queue.length > QUEUE_MAX) {
    const victim = state.queue.findIndex((j) => !isAlert(j.level))
    if (victim === -1) break
    const [dropped] = state.queue.splice(victim, 1)
    settle(dropped.notificationId, false, "Bỏ qua do hàng đợi Telegram quá tải")
  }

  void drain()
}

export function clearTelegramQueue(): void {
  state.queue.length = 0
}

export function telegramQueueDepth(): number {
  return state.queue.length
}

/* ── Drain loop ───────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    // Never hold the process open for the demo pacer.
    ;(t as unknown as { unref?: () => void }).unref?.()
  })
}

async function drain(): Promise<void> {
  if (state.draining) return
  state.draining = true

  try {
    while (state.queue.length > 0) {
      // Pace against the last send rather than the last loop iteration. A queue
      // that keeps draining to empty would otherwise sidestep the limit
      // entirely: each new message would start a fresh drain and go out
      // immediately, however recently the previous one left.
      const since = Date.now() - state.lastSentAt
      if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since)

      const job = state.queue.shift()!
      const result = await deliver(job)
      state.lastSentAt = Date.now()
      settle(job.notificationId, result.ok, result.error)
    }
  } finally {
    state.draining = false
  }
}

interface TriggerResponse {
  success?: boolean
  notification?: {
    status?: string
    errorMessage?: string | null
  } | null
}

/**
 * One POST to the backend.
 *
 * A 200 does NOT mean Telegram accepted the message: the backend answers 200
 * with the outbox row, and that row can come back PENDING (bot token / chat id
 * missing on the backend) or FAILED (Telegram rejected it). The row status is
 * the real verdict, so that is what we read.
 */
async function deliver(job: TelegramJob): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE_URL}/api/notifications/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: job.title,
        message: job.message,
        level: job.level,
      }),
      signal: controller.signal,
      cache: "no-store",
    })

    const text = await response.text()
    const payload: TriggerResponse | null = text ? JSON.parse(text) : null

    if (!response.ok) {
      return { ok: false, error: `Backend trả về ${response.status}` }
    }

    const status = payload?.notification?.status
    if (payload?.success !== true || !payload.notification) {
      return { ok: false, error: "Backend không tạo được bản ghi thông báo" }
    }
    if (status === "SENT") return { ok: true }
    if (status === "PENDING") {
      return {
        ok: false,
        error: "Backend chưa cấu hình TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID",
      }
    }
    return {
      ok: false,
      error: payload.notification.errorMessage ?? "Telegram từ chối tin nhắn",
    }
  } catch (error) {
    return { ok: false, error: describeFetchError(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Turn a fetch rejection into something a manager reading the outbox can act on.
 *
 * Node reports every transport failure as a bare "fetch failed" and hides the
 * real reason — ECONNREFUSED, DNS, TLS — one level down in `cause`, which is
 * the difference between "the backend is not running" and "something is wrong".
 */
function describeFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `Backend không phản hồi trong ${TIMEOUT_MS}ms`
  }

  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code: unknown }).code)
        : null

    if (code === "ECONNREFUSED") {
      return `Không kết nối được backend tại ${BASE_URL} (backend chưa chạy?)`
    }
    return code ? `${error.message} (${code})` : error.message
  }

  return "Không kết nối được backend"
}
