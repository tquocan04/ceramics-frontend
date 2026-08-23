/** §16.1 — POST /api/orders/:id/cancel */

import { handle } from "@/lib/mock/http"
import { cancelOrder } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(() => cancelOrder(id))
}
