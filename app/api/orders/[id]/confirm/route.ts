/** §16.1 — POST /api/orders/:id/confirm (§19 transaction, §21 idempotent) */

import type { Priority } from "@/lib/domain/enums"
import type { AIAnalysisResult } from "@/lib/domain/types"
import { handle, readJson } from "@/lib/mock/http"
import { confirmOrder } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

interface ConfirmBody {
  spec?: Partial<AIAnalysisResult>
  priority?: Priority
  deadline?: string
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await readJson<ConfirmBody>(request)
  return handle(() => confirmOrder(id, body))
}
