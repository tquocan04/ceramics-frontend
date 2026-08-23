/**
 * Quality control rules — plan §10 and §22.
 *
 * The plan offers a choice (§10.6): auto-decide from the defect rate, or let
 * the operator choose and use the rate only for alerting. We do BOTH: the
 * system computes a recommendation and the operator may override it, and the
 * override is recorded. That keeps the business rule visible without pretending
 * a hardcoded 5% threshold is universal truth.
 */

import { DomainError, ERROR_CODE } from "./errors"
import { QC_RESULT, SEVERITY, type QCResult, type Severity } from "./enums"
import type { QCDefect } from "./types"

/** §10.6 — the MVP threshold. */
export const DEFECT_RATE_PASS_THRESHOLD = 0.05

/** Above this, the alert is escalated to QC_CRITICAL rather than QC_WARNING. */
export const DEFECT_RATE_CRITICAL_THRESHOLD = 0.15

export interface QCInput {
  inspected_quantity: number
  passed_quantity: number
  defective_quantity: number
  defects: Array<Pick<QCDefect, "defect_type" | "quantity" | "note">>
}

/** §22 — validation rules for a QC submission. */
export function assertValidQCInput(input: QCInput): void {
  const { inspected_quantity, passed_quantity, defective_quantity } = input

  if (
    !Number.isFinite(inspected_quantity) ||
    !Number.isFinite(passed_quantity) ||
    !Number.isFinite(defective_quantity) ||
    inspected_quantity < 0 ||
    passed_quantity < 0 ||
    defective_quantity < 0
  ) {
    throw new DomainError(ERROR_CODE.INVALID_QC_QUANTITY, 422)
  }

  if (inspected_quantity === 0) {
    throw new DomainError(ERROR_CODE.INVALID_QC_QUANTITY, 422, {
      reason: "inspected_quantity must be greater than 0",
    })
  }

  if (passed_quantity + defective_quantity !== inspected_quantity) {
    throw new DomainError(ERROR_CODE.INVALID_QC_QUANTITY, 422, {
      passed_quantity,
      defective_quantity,
      inspected_quantity,
    })
  }

  const declared = input.defects.reduce((sum, d) => sum + d.quantity, 0)
  if (input.defects.length > 0 && declared !== defective_quantity) {
    throw new DomainError(ERROR_CODE.DEFECT_QUANTITY_MISMATCH, 422, {
      declared,
      defective_quantity,
    })
  }
}

export function defectRate(input: QCInput): number {
  if (input.inspected_quantity === 0) return 0
  return input.defective_quantity / input.inspected_quantity
}

export function severityFor(rate: number): Severity {
  if (rate === 0) return SEVERITY.LOW
  if (rate <= DEFECT_RATE_PASS_THRESHOLD) return SEVERITY.LOW
  if (rate <= 0.1) return SEVERITY.MEDIUM
  if (rate <= DEFECT_RATE_CRITICAL_THRESHOLD) return SEVERITY.HIGH
  return SEVERITY.CRITICAL
}

/** What the system recommends before any operator override (§10.6). */
export function recommendedResult(rate: number): QCResult {
  return rate <= DEFECT_RATE_PASS_THRESHOLD
    ? QC_RESULT.PASS
    : QC_RESULT.REWORK_REQUIRED
}

export interface QCOutcome {
  defect_rate: number
  severity: Severity
  recommended: QCResult
  result: QCResult
  overridden: boolean
}

export function evaluateQC(input: QCInput, chosen?: QCResult): QCOutcome {
  assertValidQCInput(input)

  const rate = defectRate(input)
  const recommended = recommendedResult(rate)
  const result = chosen ?? recommended

  return {
    defect_rate: rate,
    severity: severityFor(rate),
    recommended,
    result,
    overridden: chosen !== undefined && chosen !== recommended,
  }
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export const SEVERITY_CLASS: Record<Severity, string> = {
  LOW: "text-risk-on-track",
  MEDIUM: "text-risk-at-risk",
  HIGH: "text-status-failed",
  CRITICAL: "text-status-blocked",
}
