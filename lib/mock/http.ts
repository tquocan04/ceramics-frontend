/**
 * Shared plumbing for the mock route handlers.
 *
 * Every rejection is returned in the single ApiError envelope from §20 so the
 * UI can display the raw error code beside a Vietnamese explanation — which is
 * what makes the invalid-transition demo (§28 Scenario B) legible.
 */

import "server-only"

import { DomainError } from "@/lib/domain/errors"
import type { ApiError } from "@/lib/domain/types"

import { seedIfEmpty } from "./seed"
import { ensureSimulator } from "./simulator"

/** Called at the top of every handler: seed on first hit, start the loop. */
export function bootstrap(): void {
  seedIfEmpty()
  ensureSimulator()
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data, { status })
}

export function fail(error: unknown): Response {
  if (error instanceof DomainError) {
    const body: ApiError = {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }
    return Response.json(body, { status: error.status })
  }

  console.error("[mock-api] unhandled error", error)
  const body: ApiError = {
    error: {
      code: "INTERNAL_ERROR",
      message: "Lỗi hệ thống không xác định.",
    },
  }
  return Response.json(body, { status: 500 })
}

/** Wraps a handler body so no route needs its own try/catch. */
export async function handle(fn: () => unknown | Promise<unknown>): Promise<Response> {
  bootstrap()
  try {
    return ok(await fn())
  } catch (error) {
    return fail(error)
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return {} as T
  }
}
