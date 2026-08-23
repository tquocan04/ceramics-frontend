/**
 * One function per path in the AI service's openapi document.
 *
 * The surface is intentionally tiny — this service interprets language, it
 * never owns manufacturing state. Anything that writes goes through
 * lib/api/endpoints.ts instead.
 */

import { aiRequest } from "./client"
import {
  HealthResponseSchema,
  OrderAnalysisResponseSchema,
  OrderExtractionRequestSchema,
  type HealthResponse,
  type OrderAnalysisResponse,
} from "./schema"

/**
 * `GET /health` — which provider/model the process is configured against.
 *
 * Makes no provider call, so it stays green when the LLM is down. That is the
 * point: it separates "AI service dead" from "provider dead".
 */
export function getAIHealth(): Promise<HealthResponse> {
  return aiRequest(HealthResponseSchema, (http) =>
    http.get("/health", { timeout: 8_000 })
  )
}

/**
 * `POST /v1/orders/extract` — free-text Vietnamese in, typed order data out.
 *
 * Advisory only. Nothing is created until the manager confirms on the review
 * screen; this call writes nothing anywhere.
 */
export function extractOrder(
  description: string,
  options?: { language?: string; onRawResponse?: (raw: unknown) => void }
): Promise<OrderAnalysisResponse> {
  const body = OrderExtractionRequestSchema.parse({
    description,
    language: options?.language ?? "vi",
  })

  return aiRequest(
    OrderAnalysisResponseSchema,
    (http) => http.post("/v1/orders/extract", body),
    options?.onRawResponse
  )
}
