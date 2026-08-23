/**
 * Same-origin proxy to the Ceramics AI Service.
 *
 * `/api/ai/health`            -> `${AI_SERVICE_URL}/health`
 * `/api/ai/v1/orders/extract` -> `${AI_SERVICE_URL}/v1/orders/extract`
 *
 * It exists for two reasons and no others: the browser then needs no CORS
 * grant from a FastAPI process nobody wants to reconfigure, and
 * `x-internal-api-key` never ships to the client.
 *
 * Note this is *not* part of the mock backend under app/api — it forwards to
 * a real process. When the backend grows its own wrapper around the AI
 * service, delete this directory and point NEXT_PUBLIC_API_BASE_URL at it.
 */

import { NextResponse } from "next/server"

import { AI_ERROR_CODE, type AIErrorCode } from "@/lib/ai/schema"

export const dynamic = "force-dynamic"

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "")

const INTERNAL_API_KEY = process.env.AI_INTERNAL_API_KEY ?? ""

/** Extraction is a real LLM call — the sample response reports 17s. */
const UPSTREAM_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 90_000)

type Ctx = { params: Promise<{ path: string[] }> }

function envelope(code: AIErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message, details: null } }, { status })
}

async function forward(request: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params
  const search = new URL(request.url).search
  const target = `${AI_SERVICE_URL}/${path.join("/")}${search}`

  const headers: Record<string, string> = { Accept: "application/json" }
  if (INTERNAL_API_KEY) headers["x-internal-api-key"] = INTERNAL_API_KEY

  let body: string | undefined
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text()
    if (body) headers["Content-Type"] = "application/json; charset=utf-8"
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    })

    // Pass the payload through untouched, status included: the AI service's
    // §28 envelope is already the shape lib/ai/client.ts knows how to read.
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError"

    return timedOut
      ? envelope(
          AI_ERROR_CODE.AI_TIMEOUT,
          `AI service không phản hồi trong ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s.`,
          504
        )
      : envelope(
          AI_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
          `Không kết nối được AI service tại ${AI_SERVICE_URL}.`,
          502
        )
  }
}

export const GET = forward
export const POST = forward
