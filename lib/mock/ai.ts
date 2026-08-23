/**
 * Mock LLM order analysis (§6, §34).
 *
 * Stands in for the real provider call. It deliberately reproduces the whole
 * pipeline rather than shortcutting to a typed object:
 *
 *     Raw description -> prompt -> "LLM" -> raw string -> JSON.parse
 *       -> schema validation -> AIAnalysis
 *
 * so the failure branches of §6.5 are real code paths, not simulated states.
 * `raw_response` is always persisted, including when it is unparseable — that
 * is what the review screen shows when analysis fails.
 */

import "server-only"

import { PRIORITY, type Priority } from "@/lib/domain/enums"
import { ERROR_CODE, type ErrorCode } from "@/lib/domain/errors"
import type {
  AIAnalysisResult,
  AIEstimatedData,
  AIExtractedData,
} from "@/lib/domain/types"

import { db, type AIFailureMode } from "./db"

export const AI_MODEL = "mock-ceramics-extractor"
export const PROMPT_VERSION = "v1"

/* ── Extraction ───────────────────────────────────────────────────────── */

type Span = [number, number]

interface Matched<T> {
  value: T | null
  span: Span | null
}

function matchNumber(text: string, re: RegExp): Matched<number> {
  const m = re.exec(text)
  if (!m || m.index === undefined) return { value: null, span: null }
  const raw = m[1]?.replace(",", ".")
  const value = raw ? Number(raw) : null
  if (value === null || Number.isNaN(value)) return { value: null, span: null }
  return { value, span: [m.index, m.index + m[0].length] }
}

function matchText(text: string, re: RegExp): Matched<string> {
  const m = re.exec(text)
  if (!m || m.index === undefined) return { value: null, span: null }
  const value = m[1]?.trim() ?? null
  if (!value) return { value: null, span: null }
  return { value, span: [m.index, m.index + m[0].length] }
}

/**
 * Heuristic Vietnamese order parsing. A real LLM replaces this wholesale; the
 * shape of what it returns is what matters for the rest of the system.
 */
function extract(description: string): {
  extracted: AIExtractedData
  provenance: AIAnalysisResult["provenance"]
} {
  const quantity = matchNumber(description, /(\d{1,6})\s*(?:cái|chiếc|sản phẩm|sp\b|bộ)?\s*(?:bình|chén|bát|đĩa|lọ|ấm|tách|gốm)/i)
  const productName = matchText(
    description,
    /\d+\s*(?:cái|chiếc|sản phẩm|sp\b|bộ)?\s*((?:bình|chén|bát|đĩa|lọ|ấm|tách)(?:\s+gốm|\s+sứ)?)/i
  )
  const height = matchNumber(description, /cao\s*(\d+(?:[.,]\d+)?)\s*cm/i)
  const width = matchNumber(description, /(?:rộng|đường kính)\s*(\d+(?:[.,]\d+)?)\s*cm/i)
  const pattern = matchText(description, /họa tiết\s+([\p{L}\s]+?)(?=\s+men|\s+cao|,|\.|$)/iu)
  const glaze = matchText(description, /(men\s+[\p{L}]+)/iu)
  const temperature = matchNumber(description, /(\d{3,4})\s*(?:°\s*C|độ\s*C|độ)/i)
  const deadlineDays = matchNumber(description, /(\d{1,3})\s*ngày/i)

  const extracted: AIExtractedData = {
    product_name: productName.value,
    quantity: quantity.value,
    height_cm: height.value,
    width_cm: width.value,
    decoration_pattern: pattern.value,
    glaze_type: glaze.value,
    firing_temperature_c: temperature.value,
    deadline_days: deadlineDays.value,
  }

  const provenance: AIAnalysisResult["provenance"] = {}
  const put = (k: keyof AIExtractedData, s: Span | null) => {
    if (s) provenance[k] = s
  }
  put("product_name", productName.span)
  put("quantity", quantity.span)
  put("height_cm", height.span)
  put("width_cm", width.span)
  put("decoration_pattern", pattern.span)
  put("glaze_type", glaze.span)
  put("firing_temperature_c", temperature.span)
  put("deadline_days", deadlineDays.span)

  return { extracted, provenance }
}

/**
 * §34 — values the customer never stated, marked as estimates so the review
 * screen can render them as overridable.
 */
function estimate(e: AIExtractedData): AIEstimatedData {
  const qty = e.quantity
  const height = e.height_cm ?? 30

  // ~0.9 kg of clay for a 35 cm vessel, scaled linearly by height.
  const clay = qty === null ? null : round1(qty * 0.9 * (height / 35))
  // Glaze runs roughly a fifteenth of clay mass.
  const glaze = clay === null ? null : round1(clay / 15)
  // Higher peak temperature means a longer ramp and soak.
  const temp = e.firing_temperature_c
  const firing = temp === null ? null : round1(8 + (temp - 1200) / 40)

  return {
    clay_kg: clay,
    glaze_kg: glaze,
    firing_duration_hours: firing,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** §14 — a recommendation the manager can override. */
function derivePriority(
  e: AIExtractedData
): { priority: Priority; reason: string } {
  const qty = e.quantity ?? 0
  const days = e.deadline_days ?? 30

  if (qty >= 300 || days <= 5) {
    return {
      priority: PRIORITY.URGENT,
      reason: `Số lượng ${qty} sản phẩm với deadline ${days} ngày — cần ưu tiên tối đa`,
    }
  }
  if (qty >= 150 && days <= 10) {
    return {
      priority: PRIORITY.HIGH,
      reason: `Số lượng ${qty} sản phẩm và deadline ${days} ngày`,
    }
  }
  if (qty > 0 && qty < 50 && days >= 14) {
    return {
      priority: PRIORITY.LOW,
      reason: `Số lượng nhỏ (${qty}) và thời gian rộng rãi (${days} ngày)`,
    }
  }
  return {
    priority: PRIORITY.NORMAL,
    reason: `Số lượng ${qty} sản phẩm, deadline ${days} ngày — trong khả năng đáp ứng`,
  }
}

/* ── The "provider call" ──────────────────────────────────────────────── */

export class AIProviderError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code)
    this.name = "AIProviderError"
  }
}

/**
 * Returns the raw string the "model" produced. Failure modes short-circuit
 * here, exactly where a real provider would fail.
 */
function callProvider(description: string, mode: AIFailureMode): string {
  if (mode === "TIMEOUT") throw new AIProviderError(ERROR_CODE.AI_TIMEOUT)
  if (mode === "PROVIDER_ERROR") {
    throw new AIProviderError(ERROR_CODE.AI_PROVIDER_ERROR)
  }

  if (mode === "INVALID_JSON") {
    // The classic failure: the model wraps JSON in prose and markdown.
    return [
      "Chắc chắn rồi! Đây là kết quả phân tích đơn hàng của bạn:",
      "```json",
      '{ "product": { "name": "Bình gốm", quantity: 200 } // thiếu ngoặc',
      "```",
    ].join("\n")
  }

  const { extracted, provenance } = extract(description)

  if (mode === "SCHEMA_INVALID") {
    // Parses fine, violates §22: quantity <= 0 and a nonsense temperature.
    return JSON.stringify(
      {
        extracted: {
          ...extracted,
          quantity: -5,
          firing_temperature_c: 0,
        },
        estimated: estimate(extracted),
        priority: "SUPER_URGENT",
        priority_reason: "hallucinated priority value",
        provenance,
      },
      null,
      2
    )
  }

  const { priority, reason } = derivePriority(extracted)

  return JSON.stringify(
    {
      extracted,
      estimated: estimate(extracted),
      priority,
      priority_reason: reason,
      provenance,
    },
    null,
    2
  )
}

/* ── Schema validation (§6.5, §22) ────────────────────────────────────── */

const VALID_PRIORITIES = new Set<string>(Object.values(PRIORITY))

export interface ValidationOutcome {
  valid: boolean
  errors: string[]
  result: AIAnalysisResult | null
  errorCode: ErrorCode | null
}

export function validateAIPayload(parsed: unknown): ValidationOutcome {
  const errors: string[] = []

  if (typeof parsed !== "object" || parsed === null) {
    return {
      valid: false,
      errors: ["Response is not a JSON object"],
      result: null,
      errorCode: ERROR_CODE.AI_SCHEMA_VALIDATION_FAILED,
    }
  }

  const p = parsed as Record<string, unknown>
  const extracted = p.extracted as Partial<AIExtractedData> | undefined
  const estimated = p.estimated as Partial<AIEstimatedData> | undefined

  if (!extracted || typeof extracted !== "object") {
    errors.push("Missing required object: extracted")
  }
  if (!estimated || typeof estimated !== "object") {
    errors.push("Missing required object: estimated")
  }

  if (extracted) {
    const q = extracted.quantity
    if (q === null || q === undefined) {
      errors.push("extracted.quantity is required")
    } else if (typeof q !== "number" || !Number.isFinite(q)) {
      errors.push("extracted.quantity must be a number")
    } else if (q <= 0) {
      errors.push(`extracted.quantity must be > 0 (got ${q})`)
    }

    const t = extracted.firing_temperature_c
    if (t !== null && t !== undefined) {
      if (typeof t !== "number" || !Number.isFinite(t)) {
        errors.push("extracted.firing_temperature_c must be a number")
      } else if (t <= 0) {
        errors.push(`extracted.firing_temperature_c must be > 0 (got ${t})`)
      } else if (t < 600 || t > 1450) {
        errors.push(
          `extracted.firing_temperature_c out of plausible range 600–1450 (got ${t})`
        )
      }
    }

    const d = extracted.deadline_days
    if (d !== null && d !== undefined) {
      if (typeof d !== "number" || !Number.isFinite(d)) {
        errors.push("extracted.deadline_days must be a number")
      } else if (d <= 0) {
        errors.push(`extracted.deadline_days must be > 0 (got ${d})`)
      }
    }
  }

  const priority = p.priority
  if (priority !== null && priority !== undefined) {
    if (typeof priority !== "string" || !VALID_PRIORITIES.has(priority)) {
      errors.push(
        `priority must be one of ${[...VALID_PRIORITIES].join(", ")} (got ${String(priority)})`
      )
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      result: null,
      errorCode: ERROR_CODE.AI_SCHEMA_VALIDATION_FAILED,
    }
  }

  return {
    valid: true,
    errors: [],
    result: {
      extracted: extracted as AIExtractedData,
      estimated: estimated as AIEstimatedData,
      priority: (priority as Priority) ?? null,
      priority_reason: (p.priority_reason as string | null) ?? null,
      provenance: (p.provenance as AIAnalysisResult["provenance"]) ?? {},
    },
    errorCode: null,
  }
}

/* ── Public entry point ───────────────────────────────────────────────── */

export interface AnalysisAttempt {
  raw_response: string
  result: AIAnalysisResult | null
  valid: boolean
  errors: string[]
  errorCode: ErrorCode | null
}

/**
 * One full analysis attempt. Never throws — every failure is returned as a
 * described outcome so the caller can persist it (§6.6: AI failure must not
 * lose the order).
 */
export function analyze(description: string): AnalysisAttempt {
  const mode = db.config.aiFailureMode

  let raw: string
  try {
    raw = callProvider(description, mode)
  } catch (e) {
    const code =
      e instanceof AIProviderError ? e.code : ERROR_CODE.AI_PROVIDER_ERROR
    return {
      raw_response: "",
      result: null,
      valid: false,
      errors: [code],
      errorCode: code,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      raw_response: raw,
      result: null,
      valid: false,
      errors: ["Response was not valid JSON"],
      errorCode: ERROR_CODE.AI_INVALID_JSON,
    }
  }

  const outcome = validateAIPayload(parsed)
  return {
    raw_response: raw,
    result: outcome.result,
    valid: outcome.valid,
    errors: outcome.errors,
    errorCode: outcome.errorCode,
  }
}

/** Example orders offered as one-click chips on the new-order screen. */
export const EXAMPLE_ORDERS: string[] = [
  "Đơn 200 Bình gốm họa tiết sen men lam cao 35cm, yêu cầu nung nhiệt độ cao 1280°C, hoàn thành trong 10 ngày.",
  "Cần 60 chén gốm men trắng họa tiết tre, cao 8cm, nung 1250 độ C, giao trong 21 ngày.",
  "Gấp: 350 đĩa gốm men nâu họa tiết chim hạc cao 4cm, nung 1300°C, cần xong trong 7 ngày.",
  "Làm 30 lọ gốm men rạn họa tiết mây, cao 22cm, nung 1220 độ, thời hạn 18 ngày.",
]
