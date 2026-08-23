/**
 * The Ceramics AI Service contract (openapi 3.1, `Ceramics AI Service` 0.1.0),
 * transcribed as Zod schemas.
 *
 * Why Zod and not plain interfaces: this is the one boundary where the payload
 * is produced by a language model. A `as OrderAnalysisResponse` cast would let
 * a hallucinated shape reach the UI and blow up three components later, with a
 * stack trace that says nothing about the real cause. Parsing here turns that
 * into one honest `AI_SCHEMA_VALIDATION_FAILED` at the seam — which is also
 * exactly what §6.5 says the pipeline must do.
 *
 * The output types are structurally identical to the frontend's own
 * `AIExtractedData` / `AIEstimatedData` / `AIAnalysisResult` (§34); the
 * `satisfies` assertions at the bottom of this file keep them that way.
 */

import { z } from "zod"

import { PRIORITY } from "@/lib/domain/enums"
import type {
  AIAnalysisResult,
  AIEstimatedData,
  AIExtractedData,
} from "@/lib/domain/types"

/* ── Leaf helpers ─────────────────────────────────────────────────────── */

/**
 * Every extracted/estimated field is `T | null` in the contract, and a model
 * that omits a key entirely means the same thing as one that sends `null`.
 * Defaulting the absent case keeps `extracted.width_cm` always readable.
 */
const nullableString = z.string().nullable().default(null)
const nullableNumber = z.number().nullable().default(null)
const nullableInt = z.number().int().nullable().default(null)

/** `[start, end)` character offsets into the original description. */
export const SpanSchema = z.tuple([z.number().int(), z.number().int()])

/* ── Enums ────────────────────────────────────────────────────────────── */

/** Derived from the domain enum so the two can never drift apart. */
export const PrioritySchema = z.enum(PRIORITY)

/** §28 — stable error codes. The first four match `ERROR_CODE` verbatim. */
export const AI_ERROR_CODE = {
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  AI_INVALID_JSON: "AI_INVALID_JSON",
  AI_SCHEMA_VALIDATION_FAILED: "AI_SCHEMA_VALIDATION_FAILED",
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  AI_NORMALIZATION_FAILED: "AI_NORMALIZATION_FAILED",
  AI_ESTIMATION_FAILED: "AI_ESTIMATION_FAILED",
  EMPTY_DESCRIPTION: "EMPTY_DESCRIPTION",
  DESCRIPTION_TOO_LONG: "DESCRIPTION_TOO_LONG",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const
export type AIErrorCode = (typeof AI_ERROR_CODE)[keyof typeof AI_ERROR_CODE]

export const AIErrorCodeSchema = z.enum(AI_ERROR_CODE)

/** §16 — non-fatal findings shown beside the field they concern. */
export const WARNING_CODE = {
  FIRING_TEMPERATURE_OUT_OF_RANGE: "FIRING_TEMPERATURE_OUT_OF_RANGE",
  QUANTITY_NOT_POSITIVE: "QUANTITY_NOT_POSITIVE",
  QUANTITY_IMPLAUSIBLE: "QUANTITY_IMPLAUSIBLE",
  DEADLINE_NOT_POSITIVE: "DEADLINE_NOT_POSITIVE",
  DEADLINE_IMPLAUSIBLE: "DEADLINE_IMPLAUSIBLE",
  DIMENSION_NOT_POSITIVE: "DIMENSION_NOT_POSITIVE",
  DIMENSION_IMPLAUSIBLE: "DIMENSION_IMPLAUSIBLE",
  AMBIGUOUS_QUANTITY: "AMBIGUOUS_QUANTITY",
  AMBIGUOUS_DEADLINE: "AMBIGUOUS_DEADLINE",
  AMBIGUOUS_DIMENSION: "AMBIGUOUS_DIMENSION",
  UNIT_CORRECTED: "UNIT_CORRECTED",
  EVIDENCE_NOT_FOUND: "EVIDENCE_NOT_FOUND",
  ESTIMATE_UNAVAILABLE: "ESTIMATE_UNAVAILABLE",
  AI_PRIORITY_OVERRIDDEN: "AI_PRIORITY_OVERRIDDEN",
} as const
export type WarningCode = (typeof WARNING_CODE)[keyof typeof WARNING_CODE]

export const WarningCodeSchema = z.enum(WARNING_CODE)

/* ── Request ──────────────────────────────────────────────────────────── */

export const OrderExtractionRequestSchema = z.object({
  description: z.string().min(1),
  language: z.string().default("vi"),
})
export type OrderExtractionRequest = z.input<
  typeof OrderExtractionRequestSchema
>

/* ── Response ─────────────────────────────────────────────────────────── */

export const ExtractedOrderSchema = z.object({
  product_name: nullableString,
  quantity: nullableInt,
  height_cm: nullableNumber,
  width_cm: nullableNumber,
  decoration_pattern: nullableString,
  glaze_type: nullableString,
  firing_temperature_c: nullableInt,
  deadline_days: nullableInt,
})

export const EstimatedOrderDataSchema = z.object({
  clay_kg: nullableNumber,
  glaze_kg: nullableNumber,
  firing_duration_hours: nullableNumber,
})

export const AnalysisWarningSchema = z.object({
  code: WarningCodeSchema,
  field: z.string().nullable().default(null),
  message: z.string(),
})
export type AnalysisWarning = z.infer<typeof AnalysisWarningSchema>

export const RequestMetadataSchema = z.object({
  latency_ms: z.number().int().default(0),
  attempts: z.number().int().default(1),
  usage: z.record(z.string(), z.number().int()).default({}),
})
export type RequestMetadata = z.infer<typeof RequestMetadataSchema>

export const OrderAnalysisResponseSchema = z.object({
  schema_version: z.string().default("1.0"),
  prompt_version: z.string(),
  provider: z.string(),
  model: z.string(),
  extracted: ExtractedOrderSchema,
  estimated: EstimatedOrderDataSchema,
  priority: PrioritySchema.nullable().default(null),
  priority_reason: z.string().nullable().default(null),
  /** Keyed by `ExtractedOrder` field name; only present for stated fields. */
  provenance: z.record(z.string(), SpanSchema).default({}),
  /** The literal substring backing each field — the model's own quote. */
  evidence: z.record(z.string(), z.string()).default({}),
  missing_fields: z.array(z.string()).default([]),
  warnings: z.array(AnalysisWarningSchema).default([]),
  metadata: RequestMetadataSchema.default({
    latency_ms: 0,
    attempts: 1,
    usage: {},
  }),
})
export type OrderAnalysisResponse = z.infer<typeof OrderAnalysisResponseSchema>

export const HealthResponseSchema = z.object({
  status: z.string().default("ok"),
  service: z.string(),
  version: z.string(),
  provider: z.string(),
  model: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: AIErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).nullable().default(null),
  }),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/* ── Bridge to the domain model (§34) ─────────────────────────────────── */

/**
 * `extracted` + `estimated` + `priority` + `priority_reason` + `provenance`
 * together *are* an `AIAnalysisResult`, so the review screen can consume an
 * AI-service response without a mapping layer.
 */
export function toAnalysisResult(
  response: OrderAnalysisResponse
): AIAnalysisResult {
  return {
    extracted: response.extracted,
    estimated: response.estimated,
    priority: response.priority,
    priority_reason: response.priority_reason,
    provenance: response.provenance as AIAnalysisResult["provenance"],
  }
}

/* Compile-time proof that the wire types still match the domain types: this
   stops compiling the moment either side gains, loses, or retypes a field. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

const _extractedMatchesDomain: Exact<
  z.infer<typeof ExtractedOrderSchema>,
  AIExtractedData
> = true
const _estimatedMatchesDomain: Exact<
  z.infer<typeof EstimatedOrderDataSchema>,
  AIEstimatedData
> = true

void _extractedMatchesDomain
void _estimatedMatchesDomain
