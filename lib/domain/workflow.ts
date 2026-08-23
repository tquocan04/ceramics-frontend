/**
 * The workflow state machine — plan §8.4 Rules 1–6 and §9.
 *
 * PURE: no I/O, no ambient clock, no store access. It is imported by BOTH the
 * mock API (to enforce) and the UI (to decide which buttons are enabled). The
 * server always remains the authority — the client copy exists only to avoid
 * offering an action that is going to be rejected.
 */

import { DomainError, ERROR_CODE } from "./errors"
import {
  BATCH_STATUS,
  STAGE_STATUS,
  STAGE_TYPE,
  type BatchStatus,
  type StageStatus,
  type StageType,
} from "./enums"
import type { ProductionStage } from "./types"

/** §8.1 — the canonical order. Index in this array IS the sequence number. */
export const STAGE_SEQUENCE: readonly StageType[] = [
  STAGE_TYPE.FORMING,
  STAGE_TYPE.DRYING,
  STAGE_TYPE.DECORATING,
  STAGE_TYPE.GLAZING,
  STAGE_TYPE.FIRING,
  STAGE_TYPE.QUALITY_CHECK,
  STAGE_TYPE.PACKAGING,
] as const

export const STAGE_COUNT = STAGE_SEQUENCE.length

export function stageIndex(stage: StageType): number {
  return STAGE_SEQUENCE.indexOf(stage)
}

export function nextStage(stage: StageType): StageType | null {
  const i = stageIndex(stage)
  return i >= 0 && i < STAGE_COUNT - 1 ? STAGE_SEQUENCE[i + 1] : null
}

export function previousStage(stage: StageType): StageType | null {
  const i = stageIndex(stage)
  return i > 0 ? STAGE_SEQUENCE[i - 1] : null
}

/** Rule 3 exception: FORMING has no predecessor. */
export function isFirstStage(stage: StageType): boolean {
  return stageIndex(stage) === 0
}

export function isLastStage(stage: StageType): boolean {
  return stageIndex(stage) === STAGE_COUNT - 1
}

/* ── Guards ───────────────────────────────────────────────────────────── */

export interface GuardContext {
  batchStatus: BatchStatus
  stages: ProductionStage[]
}

function findStage(
  stages: ProductionStage[],
  stage: StageType
): ProductionStage | undefined {
  return stages.find((s) => s.stage_type === stage)
}

/**
 * A cancelled batch can never be operated on; a blocked batch must be
 * unblocked by a manager first (§8.4 Rule 5, §22).
 */
function assertBatchOperable(batchStatus: BatchStatus): void {
  if (batchStatus === BATCH_STATUS.CANCELLED) {
    throw new DomainError(ERROR_CODE.BATCH_CANCELLED, 409)
  }
  if (batchStatus === BATCH_STATUS.BLOCKED) {
    throw new DomainError(ERROR_CODE.BATCH_BLOCKED, 409)
  }
}

/**
 * §8.4 Rule 3 — start requires status == PENDING AND
 * previous_stage == COMPLETED, except for FORMING.
 * §8.4 Rule 2 — at most one IN_PROGRESS stage per batch.
 */
export function assertCanStart(ctx: GuardContext, stage: StageType): void {
  assertBatchOperable(ctx.batchStatus)

  const target = findStage(ctx.stages, stage)
  if (!target) throw new DomainError(ERROR_CODE.STAGE_NOT_FOUND, 404)

  if (target.status === STAGE_STATUS.IN_PROGRESS) {
    throw new DomainError(ERROR_CODE.STAGE_ALREADY_IN_PROGRESS, 409)
  }
  if (target.status === STAGE_STATUS.COMPLETED) {
    throw new DomainError(ERROR_CODE.STAGE_ALREADY_COMPLETED, 409)
  }
  // FAILED / BLOCKED / REWORK_REQUIRED are not directly startable either.
  if (target.status !== STAGE_STATUS.PENDING) {
    throw new DomainError(ERROR_CODE.INVALID_STAGE_TRANSITION, 409, {
      from: target.status,
      action: "start",
    })
  }

  // Rule 2 — only one active stage.
  const active = ctx.stages.find(
    (s) => s.status === STAGE_STATUS.IN_PROGRESS && s.stage_type !== stage
  )
  if (active) {
    throw new DomainError(ERROR_CODE.ANOTHER_STAGE_IN_PROGRESS, 409, {
      active_stage: active.stage_type,
    })
  }

  // Rule 1 + Rule 3 — no skipping.
  const prev = previousStage(stage)
  if (prev) {
    const prevStage = findStage(ctx.stages, prev)
    if (!prevStage || prevStage.status !== STAGE_STATUS.COMPLETED) {
      throw new DomainError(ERROR_CODE.PREVIOUS_STAGE_NOT_COMPLETED, 409, {
        previous_stage: prev,
        previous_status: prevStage?.status ?? null,
      })
    }
  }
}

/** §8.4 Rule 4 — complete requires status == IN_PROGRESS. */
export function assertCanComplete(ctx: GuardContext, stage: StageType): void {
  assertBatchOperable(ctx.batchStatus)

  const target = findStage(ctx.stages, stage)
  if (!target) throw new DomainError(ERROR_CODE.STAGE_NOT_FOUND, 404)

  if (target.status === STAGE_STATUS.COMPLETED) {
    throw new DomainError(ERROR_CODE.STAGE_ALREADY_COMPLETED, 409)
  }
  if (target.status !== STAGE_STATUS.IN_PROGRESS) {
    throw new DomainError(ERROR_CODE.STAGE_NOT_STARTED, 409, {
      current_status: target.status,
    })
  }
}

/** §8.4 Rule 5 — a running stage can be failed, which blocks the batch. */
export function assertCanFail(ctx: GuardContext, stage: StageType): void {
  if (ctx.batchStatus === BATCH_STATUS.CANCELLED) {
    throw new DomainError(ERROR_CODE.BATCH_CANCELLED, 409)
  }

  const target = findStage(ctx.stages, stage)
  if (!target) throw new DomainError(ERROR_CODE.STAGE_NOT_FOUND, 404)

  if (target.status !== STAGE_STATUS.IN_PROGRESS) {
    throw new DomainError(ERROR_CODE.STAGE_NOT_STARTED, 409, {
      current_status: target.status,
    })
  }
}

/* ── Non-throwing variants, for enabling/disabling UI controls ─────────── */

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string }

function attempt(fn: () => void): GuardResult {
  try {
    fn()
    return { ok: true }
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, code: e.code, message: e.message }
    }
    throw e
  }
}

export const canStart = (ctx: GuardContext, stage: StageType): GuardResult =>
  attempt(() => assertCanStart(ctx, stage))

export const canComplete = (ctx: GuardContext, stage: StageType): GuardResult =>
  attempt(() => assertCanComplete(ctx, stage))

export const canFail = (ctx: GuardContext, stage: StageType): GuardResult =>
  attempt(() => assertCanFail(ctx, stage))

/**
 * Which single command the board should offer for the current stage of a
 * batch. Returns null when nothing legal is available (blocked, cancelled,
 * finished).
 */
export function availableCommand(
  ctx: GuardContext,
  stage: StageType
): "start" | "complete" | null {
  if (canStart(ctx, stage).ok) return "start"
  if (canComplete(ctx, stage).ok) return "complete"
  return null
}

/* ── Derived state ────────────────────────────────────────────────────── */

export function completedCount(stages: ProductionStage[]): number {
  return stages.filter((s) => s.status === STAGE_STATUS.COMPLETED).length
}

/**
 * The stage a batch is sitting in, for board placement: the active one if any,
 * else the first not-yet-completed one, else the final stage.
 */
export function resolveCurrentStage(stages: ProductionStage[]): StageType {
  const active = stages.find((s) => s.status === STAGE_STATUS.IN_PROGRESS)
  if (active) return active.stage_type

  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence)
  const pending = ordered.find((s) => s.status !== STAGE_STATUS.COMPLETED)
  return pending?.stage_type ?? STAGE_SEQUENCE[STAGE_COUNT - 1]
}

/** Batch status implied by its stages — recomputed after every transition. */
export function deriveBatchStatus(
  stages: ProductionStage[],
  current: BatchStatus
): BatchStatus {
  if (current === BATCH_STATUS.CANCELLED) return current

  if (stages.some((s) => s.status === STAGE_STATUS.FAILED)) {
    return BATCH_STATUS.BLOCKED
  }
  if (stages.some((s) => s.status === STAGE_STATUS.REWORK_REQUIRED)) {
    return BATCH_STATUS.REWORK_REQUIRED
  }
  if (stages.every((s) => s.status === STAGE_STATUS.COMPLETED)) {
    return BATCH_STATUS.COMPLETED
  }
  if (
    stages.some(
      (s) =>
        s.status === STAGE_STATUS.IN_PROGRESS ||
        s.status === STAGE_STATUS.COMPLETED
    )
  ) {
    return BATCH_STATUS.IN_PRODUCTION
  }
  return BATCH_STATUS.PENDING
}

/** Freshly generated stage rows for a new batch (§19 Confirm Order). */
export function buildStages(
  batchId: string,
  now: string,
  makeId: (i: number) => string
): ProductionStage[] {
  return STAGE_SEQUENCE.map((stage_type, i) => ({
    id: makeId(i),
    batch_id: batchId,
    stage_type,
    sequence: i,
    status: STAGE_STATUS.PENDING as StageStatus,
    started_at: null,
    completed_at: null,
    note: null,
    metadata: {},
    updated_at: now,
  }))
}
