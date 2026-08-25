/**
 * Factory simulator.
 *
 * Advances batches on a timer so the board is visibly alive without anyone
 * clicking — which is what makes the flow animation demonstrable in a recorded
 * demo. It drives the same service functions a human would, so it can never
 * put the store into a state the state machine forbids.
 *
 * Server-side and process-local, started lazily on the first API request.
 */

import "server-only"

import {
  BATCH_STATUS,
  DEADLINE_RISK,
  EVENT_TYPE,
  QC_RESULT,
  STAGE_STATUS,
  STAGE_TYPE,
} from "@/lib/domain/enums"
import { DomainError } from "@/lib/domain/errors"
import { DEFECT_TYPE } from "@/lib/domain/enums"
import { deadlineRisk } from "@/lib/domain/deadline"
import { STAGE_LABEL } from "@/lib/domain/labels"

import { db, getStages } from "./db"
import { recordEvent } from "./events"
import {
  analyzeOrder,
  completeStage,
  confirmOrder,
  createOrder,
  failStage,
  listBatches,
  startStage,
  submitQC,
} from "./services"
import { EXAMPLE_ORDERS } from "./ai"

/**
 * Base tick interval at 1x speed. Halved in pace from the original 4s: a
 * transition every four seconds read as frantic on screen, and — now that
 * completions reach a real Telegram chat — produced more traffic than a human
 * can follow.
 */
const TICK_MS = 8000

/** Minimum dwell time before a running stage may finish, in ms. */
const MIN_DWELL_MS = 18000

/** Keep at least this many batches on the board by injecting new orders. */
const MIN_ACTIVE_BATCHES = 4

/**
 * Chance that a tick which could complete a stage instead fails it.
 *
 * Without this the simulator can never produce a sự cố on its own — QC defects
 * are random, but STAGE_FAILED only ever came from a human pressing the button
 * or from the seed. The alert path needs a source if it is to be demonstrable.
 */
const FAILURE_CHANCE = 0.03

/** Plausible workshop faults, for the generated sự cố. */
const FAILURE_REASONS = [
  "Nhiệt độ lò tụt dưới ngưỡng cho phép",
  "Men bị vón cục, không đạt độ mịn",
  "Mộc nứt trong quá trình sấy",
  "Khuôn tạo hình bị lệch trục",
  "Mất điện đột ngột giữa công đoạn",
  "Nguyên liệu đất sét không đạt độ ẩm yêu cầu",
]

const GLOBAL_KEY = Symbol.for("ceramics.mock.simulator")

interface SimState {
  timer: ReturnType<typeof setInterval> | null
  /** Batches already warned about their deadline, so we warn only once each. */
  warnedDeadlines: Set<string>
}

type GlobalWithSim = typeof globalThis & {
  [GLOBAL_KEY]?: SimState
}

const g = globalThis as GlobalWithSim
const state: SimState = (g[GLOBAL_KEY] ??= {
  timer: null,
  warnedDeadlines: new Set(),
})

function pick<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function dwellElapsed(startedAt: string | null, speed: number): boolean {
  if (!startedAt) return false
  const threshold = MIN_DWELL_MS / Math.max(0.25, speed)
  return Date.now() - new Date(startedAt).getTime() >= threshold
}

function tick(): void {
  if (!db.config.simulatorRunning) return

  const speed = db.config.simulatorSpeed

  try {
    topUpBoard()
  } catch {
    // Never let board top-up kill the loop.
  }

  try {
    sweepDeadlines()
  } catch {
    // Nor let the deadline sweep kill it.
  }

  const candidates = listBatches().filter(
    (b) =>
      b.status === BATCH_STATUS.PENDING || b.status === BATCH_STATUS.IN_PRODUCTION
  )

  // Prefer finishing work that has been running long enough; otherwise start
  // something that is waiting. One action per tick keeps the flow legible.
  const finishable = candidates.filter((b) => {
    const stages = getStages(b.id)
    const active = stages.find((s) => s.status === STAGE_STATUS.IN_PROGRESS)
    return active ? dwellElapsed(active.started_at, speed) : false
  })

  const startable = candidates.filter((b) => {
    const stages = getStages(b.id)
    const hasActive = stages.some((s) => s.status === STAGE_STATUS.IN_PROGRESS)
    return !hasActive
  })

  const batch = pick(finishable) ?? pick(startable)
  if (!batch) return

  const stages = getStages(batch.id)
  const active = stages.find((s) => s.status === STAGE_STATUS.IN_PROGRESS)

  try {
    if (active && dwellElapsed(active.started_at, speed)) {
      if (active.stage_type === STAGE_TYPE.QUALITY_CHECK) {
        runQC(batch.id, batch.quantity)
      } else if (Math.random() < FAILURE_CHANCE) {
        // The stage breaks instead of finishing: batch goes BLOCKED and a
        // CRITICAL alert goes out. QC has its own failure path already.
        failStage(batch.id, active.stage_type, pick(FAILURE_REASONS)!)
      } else {
        completeStage(batch.id, active.stage_type)
      }
      return
    }

    if (!active) {
      const next = [...stages]
        .sort((a, b) => a.sequence - b.sequence)
        .find((s) => s.status === STAGE_STATUS.PENDING)
      if (next) startStage(batch.id, next.stage_type)
    }
  } catch (e) {
    // A rejected transition is a legitimate outcome, not a crash. Anything
    // else would be a bug worth surfacing in the server log.
    if (!(e instanceof DomainError)) throw e
  }
}

/**
 * Emit DEADLINE_WARNING the first time a batch drifts off track.
 *
 * Deadline risk was previously derived for display only and never recorded, so
 * the event type existed without ever firing. Once per batch is the point —
 * a batch stays at risk for its whole remaining life, and re-announcing that
 * every tick is precisely the noise this change set exists to remove.
 */
function sweepDeadlines(): void {
  for (const batch of listBatches()) {
    if (
      batch.status !== BATCH_STATUS.PENDING &&
      batch.status !== BATCH_STATUS.IN_PRODUCTION
    ) {
      continue
    }
    if (state.warnedDeadlines.has(batch.id)) continue

    const risk = deadlineRisk(
      batch.deadline,
      batch.current_stage,
      Date.now(),
      batch.quantity
    )
    if (risk === DEADLINE_RISK.ON_TRACK) continue

    state.warnedDeadlines.add(batch.id)
    recordEvent({
      event_type: EVENT_TYPE.DEADLINE_WARNING,
      batch_id: batch.id,
      order_id: batch.order_id,
      stage: batch.current_stage,
      message:
        risk === DEADLINE_RISK.OVERDUE
          ? `Mẻ ${batch.batch_code} đã trễ hạn tại ${STAGE_LABEL[batch.current_stage]}`
          : `Mẻ ${batch.batch_code} có nguy cơ trễ hạn tại ${STAGE_LABEL[batch.current_stage]}`,
      metadata: { deadline_risk: risk, deadline: batch.deadline },
    })
  }
}

/**
 * Mostly-passing QC, with an occasional failure so the rework branch and the
 * critical alert fire on their own during a long demo.
 */
function runQC(batchId: string, quantity: number): void {
  const roll = Math.random()
  const rate = roll < 0.75 ? Math.random() * 0.04 : 0.06 + Math.random() * 0.12
  const defective = Math.max(0, Math.round(quantity * rate))
  const passed = quantity - defective

  const defects =
    defective === 0
      ? []
      : [
          {
            defect_type: DEFECT_TYPE.GLAZE_CRACK,
            quantity: Math.ceil(defective * 0.6),
            note: null,
          },
          {
            defect_type: DEFECT_TYPE.DEFORMATION,
            quantity: defective - Math.ceil(defective * 0.6),
            note: null,
          },
        ].filter((d) => d.quantity > 0)

  submitQC(batchId, {
    inspected_quantity: quantity,
    passed_quantity: passed,
    defective_quantity: defective,
    defects,
    result: defective / quantity <= 0.05 ? QC_RESULT.PASS : QC_RESULT.FAIL,
  })
}

/** Inject a fresh order when the board thins out, so the demo never empties. */
function topUpBoard(): void {
  const active = listBatches().filter(
    (b) =>
      b.status === BATCH_STATUS.PENDING || b.status === BATCH_STATUS.IN_PRODUCTION
  )
  if (active.length >= MIN_ACTIVE_BATCHES) return

  const description = EXAMPLE_ORDERS[
    Math.floor(Math.random() * EXAMPLE_ORDERS.length)
  ]
  const order = createOrder(description)
  const { analysis } = analyzeOrder(order.id)
  if (analysis.is_valid) confirmOrder(order.id)
}

/**
 * (Re)create the interval at the current speed.
 *
 * Speed used to scale only the dwell threshold while the tick stayed pinned at
 * 4s, which capped throughput at one transition per tick no matter what the
 * user picked — 0.5x did not actually halve anything. Scaling the interval too
 * makes the control mean what it says.
 */
function restartTimer(): void {
  if (state.timer) clearInterval(state.timer)

  const speed = Math.min(8, Math.max(0.25, db.config.simulatorSpeed))
  state.timer = setInterval(tick, Math.round(TICK_MS / speed))
  // Do not hold the process open on account of the demo loop.
  state.timer.unref?.()
}

export function ensureSimulator(): void {
  if (state.timer) return
  restartTimer()
}

export function setSimulator(running: boolean): void {
  db.config.simulatorRunning = running
}

export function setSimulatorSpeed(speed: number): void {
  db.config.simulatorSpeed = Math.min(8, Math.max(0.25, speed))
  if (state.timer) restartTimer()
}

export function stopSimulator(): void {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
}

/** Forget deadline warnings, so a reset demo can warn about them again. */
export function resetSimulatorMemory(): void {
  state.warnedDeadlines.clear()
}
