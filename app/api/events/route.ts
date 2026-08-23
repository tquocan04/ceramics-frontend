/** §16.5 — GET /api/events */

import { handle } from "@/lib/mock/http"
import { listEvents } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit")
  const limit = Number(raw ?? 200)
  return handle(() => ({
    events: listEvents(Number.isFinite(limit) ? limit : 200),
  }))
}
