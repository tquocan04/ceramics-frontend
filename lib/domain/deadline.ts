/**
 * Deadline risk (§14, §35.5).
 *
 * The plan proposes: deadline_remaining < estimated_remaining_time →
 * DEADLINE_WARNING. We express that as a three-way risk so the board can show
 * ON_TRACK / AT_RISK / OVERDUE per batch.
 *
 * Pure functions taking an explicit `now` so they are deterministic and safe
 * to call during render on both server and client.
 */

import { DEADLINE_RISK, type DeadlineRisk, type StageType } from "./enums"
import { STAGE_SEQUENCE, stageIndex } from "./workflow"

/**
 * Nominal hours each stage occupies. Rough workshop figures — enough to make
 * the risk calculation meaningful for the demo, and the obvious thing to
 * replace with real per-batch estimates from the AI spec later.
 */
export const STAGE_DURATION_HOURS: Record<StageType, number> = {
  FORMING: 8,
  DRYING: 36,
  DECORATING: 12,
  GLAZING: 6,
  FIRING: 10,
  QUALITY_CHECK: 3,
  PACKAGING: 4,
}

export const TOTAL_PIPELINE_HOURS = STAGE_SEQUENCE.reduce(
  (sum, s) => sum + STAGE_DURATION_HOURS[s],
  0
)

/**
 * The stage durations above are quoted for a nominal 100-piece batch. Real
 * throughput scales with batch size, so a 350-piece order genuinely occupies
 * the workshop longer than a 60-piece one — without this the risk indicator
 * would read the same for both.
 */
export function quantityFactor(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 1
  return quantity / 100
}

/** Estimated hours still needed, counting the current stage as unfinished. */
export function estimatedRemainingHours(
  currentStage: StageType,
  quantity = 100
): number {
  const from = stageIndex(currentStage)
  const stages = from < 0 ? STAGE_SEQUENCE : STAGE_SEQUENCE.slice(from)
  const base = stages.reduce((sum, s) => sum + STAGE_DURATION_HOURS[s], 0)
  return base * quantityFactor(quantity)
}

export function hoursUntil(deadlineIso: string, nowMs: number): number {
  return (new Date(deadlineIso).getTime() - nowMs) / 36e5
}

/**
 * OVERDUE  — the deadline has passed.
 * AT_RISK  — less slack remaining than the pipeline still needs (§14).
 * ON_TRACK — otherwise.
 */
export function deadlineRisk(
  deadlineIso: string,
  currentStage: StageType,
  nowMs: number,
  quantity = 100
): DeadlineRisk {
  const remaining = hoursUntil(deadlineIso, nowMs)
  if (remaining <= 0) return DEADLINE_RISK.OVERDUE

  const needed = estimatedRemainingHours(currentStage, quantity)
  return remaining < needed ? DEADLINE_RISK.AT_RISK : DEADLINE_RISK.ON_TRACK
}

/** "Còn 3 ngày" / "Trễ 5 giờ" — compact deadline copy for the batch card. */
export function formatDeadlineDistance(
  deadlineIso: string,
  nowMs: number
): string {
  const hours = hoursUntil(deadlineIso, nowMs)
  const abs = Math.abs(hours)
  const prefix = hours < 0 ? "Trễ" : "Còn"

  if (abs < 1) return `${prefix} ${Math.round(abs * 60)} phút`
  if (abs < 48) return `${prefix} ${Math.round(abs)} giờ`
  return `${prefix} ${Math.round(abs / 24)} ngày`
}

/** "2h 14m" — time spent in the current stage. */
export function formatElapsed(sinceIso: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - new Date(sinceIso).getTime())
  const totalMinutes = Math.floor(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m.toString().padStart(2, "0")}m`
}

export const RISK_CLASS: Record<DeadlineRisk, string> = {
  ON_TRACK: "text-risk-on-track",
  AT_RISK: "text-risk-at-risk",
  OVERDUE: "text-risk-overdue",
}
