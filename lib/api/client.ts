/**
 * The seam between this UI and whatever serves the API.
 *
 * Today that is the mock route handlers under app/api. When the real backend
 * is ready, set NEXT_PUBLIC_API_BASE_URL to its origin and delete app/api —
 * nothing in the UI changes, because every call goes through here.
 *
 * Errors arrive in the §20 envelope, so a rejected transition surfaces its
 * real code (PREVIOUS_STAGE_NOT_COMPLETED, ...) rather than a generic message.
 */

import type { ApiError } from "@/lib/domain/types"

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? ""

/** A rejection carrying the backend error code, for display in a toast. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

async function request<T>(
  path: string,
  // Omit before re-adding: intersecting with RequestInit would collapse `body`
  // back to BodyInit and reject the plain objects callers pass.
  init?: Omit<RequestInit, "body"> & { body?: unknown }
): Promise<T> {
  const { body, ...rest } = init ?? {}

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined
        ? { "Content-Type": "application/json; charset=utf-8" }
        : {}),
      ...rest.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Reads must never come from a stale cache — Next 16 does not cache fetch
    // by default, but proxies in front of a real backend might.
    cache: "no-store",
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const envelope = payload as ApiError | null
    const err = envelope?.error
    throw new ApiRequestError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? `Yêu cầu thất bại (${response.status})`,
      response.status,
      err?.details
    )
  }

  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
}
