/** §16.1 — POST /api/orders/:id/analyze */

import { handle } from "@/lib/mock/http"
import { analyzeOrder } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  // An AI failure is a successful HTTP response describing a failed analysis
  // (§6.6) — the order must survive it, so this deliberately does not 4xx.
  return handle(() => analyzeOrder(id))
}
