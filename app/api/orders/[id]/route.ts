/** §16.1 — GET /api/orders/:id (order + its latest AI analysis) */

import { handle } from "@/lib/mock/http"
import { getAnalysis, getOrder } from "@/lib/mock/services"
import { db } from "@/lib/mock/db"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(() => {
    const order = getOrder(id)
    const analysis = getAnalysis(order.id)
    const batch = order.batch_id ? db.batches.get(order.batch_id) ?? null : null
    return { order, analysis, batch }
  })
}
