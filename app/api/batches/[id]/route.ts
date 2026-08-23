/** §16.2 — GET /api/batches/:id */

import { handle } from "@/lib/mock/http"
import { getBatch, listEvents, listQC, toCardView } from "@/lib/mock/services"
import { db } from "@/lib/mock/db"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(() => {
    const batch = getBatch(id)
    return {
      batch: toCardView(batch, Date.now()),
      qc: listQC(batch.id),
      events: listEvents(100, batch.id),
      order: db.orders.get(batch.order_id) ?? null,
    }
  })
}
