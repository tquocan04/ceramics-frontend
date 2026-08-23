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
  QC_RESULT,
  STAGE_STATUS,
  STAGE_TYPE,
} from "@/lib/domain/enums"
import { DomainError } from "@/lib/domain/errors"
import { DEFECT_TYPE } from "@/lib/domain/enums"

import { db, getStages } from "./db"
import {
  analyzeOrder,
  completeStage,
  confirmOrder,
  createOrder,
  listBatches,
  startStage,
  submitQC,
} from "./services"
import { EXAMPLE_ORDERS } from "./ai"

const TICK_MS = 4000

/** Minimum dwell time before a running stage may finish, in ms. */
const MIN_DWELL_MS = 9000

/** Keep at least this many batches on the board by injecting new orders. */
const MIN_ACTIVE_BATCHES = 6

const GLOBAL_KEY = Symbol.for("ceramics.mock.simulator")

type GlobalWithSim = typeof globalThis & {
  [GLOBAL_KEY]?: { timer: ReturnType<typeof setInterval> | null }
}

const g = globalThis as GlobalWithSim
const state = (g[GLOBAL_KEY] ??= { timer: null })

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

export function ensureSimulator(): void {
  if (state.timer) return
  state.timer = setInterval(tick, TICK_MS)
  // Do not hold the process open on account of the demo loop.
  state.timer.unref?.()
}

export function setSimulator(running: boolean): void {
  db.config.simulatorRunning = running
}

export function setSimulatorSpeed(speed: number): void {
  db.config.simulatorSpeed = Math.min(8, Math.max(0.25, speed))
}

export function stopSimulator(): void {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
}
