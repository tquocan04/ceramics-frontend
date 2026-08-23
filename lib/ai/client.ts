/**
 * The seam between this UI and the Ceramics AI Service.
 *
 * Two routes, one switch:
 *
 *   - Default: requests go to `/api/ai/*`, a thin same-origin proxy
 *     (app/api/ai/[...path]/route.ts). No CORS to configure and the internal
 *     API key stays server-side.
 *   - Set NEXT_PUBLIC_AI_SERVICE_URL and the browser talks to the service
 *     directly — handy while poking at a locally-running FastAPI, provided it
 *     has CORS enabled.
 *
 * This is deliberately a *separate* client from lib/api/client.ts. That one
 * speaks the §20 backend envelope; this one speaks the AI service's §28 error
 * codes. When the backend grows its own wrapper around the AI service, this
 * whole module is what gets deleted — not edited.
 */

import axios, { AxiosError, type AxiosInstance } from "axios"
import { z } from "zod"

import {
  AI_ERROR_CODE,
  ErrorResponseSchema,
  type AIErrorCode,
} from "./schema"

/** Empty means "go through the Next proxy" — see the module docstring. */
export const AI_DIRECT_BASE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? ""

export const AI_BASE_URL = AI_DIRECT_BASE_URL || "/api/ai"

/** Whether the browser is hitting the AI service without the proxy hop. */
export const AI_IS_DIRECT = AI_DIRECT_BASE_URL !== ""

/**
 * Generous by design: an LLM extraction legitimately takes 20s+ (the sample
 * response reports latency_ms 17001), so a default 0/none timeout would hang
 * forever and a short one would report AI_TIMEOUT on healthy requests.
 */
export const AI_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_AI_TIMEOUT_MS ?? 90_000
)

/** A rejection carrying an AI-service error code, ready for a toast. */
export class AIServiceError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly details?: Record<string, unknown> | null,
    /** Populated when the failure was ours: the response broke the schema. */
    readonly issues?: string[]
  ) {
    super(message)
    this.name = "AIServiceError"
  }
}

export const aiHttp: AxiosInstance = axios.create({
  baseURL: AI_BASE_URL,
  timeout: AI_TIMEOUT_MS,
  headers: { Accept: "application/json" },
})

/** Flatten a ZodError into one readable line per offending path. */
function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)"
    return `${path}: ${issue.message}`
  })
}

/**
 * Turn anything axios can throw into an `AIServiceError`.
 *
 * The distinction that matters to the operator is "the service answered and
 * said no" vs "the service was never reached" — the second is an ops problem,
 * the first is a prompt or provider problem, and the codes keep them apart.
 */
function normalizeError(error: unknown): AIServiceError {
  if (error instanceof AIServiceError) return error

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>
    const status = axiosError.response?.status ?? null

    // The service answered in its own envelope — trust its code verbatim.
    const envelope = ErrorResponseSchema.safeParse(axiosError.response?.data)
    if (envelope.success) {
      const { code, message, details } = envelope.data.error
      return new AIServiceError(code, message, status, details)
    }

    if (
      axiosError.code === "ECONNABORTED" ||
      axiosError.code === "ETIMEDOUT"
    ) {
      return new AIServiceError(
        AI_ERROR_CODE.AI_TIMEOUT,
        `AI service không phản hồi trong ${Math.round(AI_TIMEOUT_MS / 1000)}s.`,
        status
      )
    }

    if (status === null) {
      return new AIServiceError(
        AI_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
        `Không kết nối được AI service tại ${AI_BASE_URL}.`,
        null
      )
    }

    if (status === 401 || status === 403) {
      return new AIServiceError(
        AI_ERROR_CODE.UNAUTHORIZED,
        "Thiếu hoặc sai internal API key.",
        status
      )
    }

    if (status === 429) {
      return new AIServiceError(
        AI_ERROR_CODE.AI_RATE_LIMITED,
        "AI service đang bị giới hạn tốc độ.",
        status
      )
    }

    if (status === 504) {
      return new AIServiceError(
        AI_ERROR_CODE.AI_TIMEOUT,
        "Provider hết thời gian chờ.",
        status
      )
    }

    return new AIServiceError(
      AI_ERROR_CODE.AI_PROVIDER_ERROR,
      axiosError.message || `AI service trả về HTTP ${status}.`,
      status
    )
  }

  return new AIServiceError(
    AI_ERROR_CODE.INTERNAL_ERROR,
    error instanceof Error ? error.message : "Lỗi không xác định.",
    null
  )
}

/**
 * `request` + parse, as one step, because an unvalidated AI response has no
 * business existing as a value anywhere in this app.
 *
 * `onRawResponse` fires after the transport succeeded but before validation —
 * the review UI shows that raw payload when validation is what failed, which
 * is the only way to debug a schema breach.
 */
export async function aiRequest<S extends z.ZodType>(
  schema: S,
  send: (http: AxiosInstance) => Promise<{ data: unknown }>,
  onRawResponse?: (raw: unknown) => void
): Promise<z.infer<S>> {
  let raw: unknown
  try {
    const response = await send(aiHttp)
    raw = response.data
  } catch (error) {
    throw normalizeError(error)
  }

  onRawResponse?.(raw)

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new AIServiceError(
      AI_ERROR_CODE.AI_SCHEMA_VALIDATION_FAILED,
      "Phản hồi của AI service không khớp schema.",
      200,
      null,
      describeIssues(parsed.error)
    )
  }

  return parsed.data
}
