/** §16.5 — GET /api/batches/:batchId/events */

import { handle } from "@/lib/mock/http"
import { getBatch, listEvents } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(() => {
    const batch = getBatch(id)
    return { events: listEvents(200, batch.id) }
  })
}
