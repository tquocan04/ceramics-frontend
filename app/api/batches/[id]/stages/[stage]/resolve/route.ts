/** §16.3 — POST /api/batches/:batchId/stages/:stage/resolve */

import { STAGE_TYPE, type StageType } from "@/lib/domain/enums"
import { DomainError, ERROR_CODE } from "@/lib/domain/errors"
import { handle, readJson } from "@/lib/mock/http"
import { resolveStage } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string; stage: string }> }

function parseStage(value: string): StageType {
  const upper = value.toUpperCase()
  if (upper in STAGE_TYPE) return upper as StageType
  throw new DomainError(ERROR_CODE.STAGE_NOT_FOUND, 404, { stage: value })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id, stage } = await ctx.params
  const body = await readJson<{ note?: string | null }>(request)
  return handle(() => resolveStage(id, parseStage(stage), body.note ?? undefined))
}
