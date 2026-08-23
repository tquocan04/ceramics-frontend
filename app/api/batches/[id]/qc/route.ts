/** §16.4 — GET and POST /api/batches/:batchId/qc */

import type { DefectType, QCResult } from "@/lib/domain/enums"
import { handle, readJson } from "@/lib/mock/http"
import { listQC, submitQC } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

interface QCBody {
  inspected_quantity: number
  passed_quantity: number
  defective_quantity: number
  defects?: Array<{
    defect_type: DefectType
    quantity: number
    note?: string | null
  }>
  result?: QCResult
  note?: string | null
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(() => ({ reports: listQC(id) }))
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await readJson<QCBody>(request)
  return handle(() =>
    submitQC(id, {
      inspected_quantity: Number(body.inspected_quantity),
      passed_quantity: Number(body.passed_quantity),
      defective_quantity: Number(body.defective_quantity),
      defects: (body.defects ?? []).map((d) => ({
        defect_type: d.defect_type,
        quantity: Number(d.quantity),
        note: d.note ?? null,
      })),
      result: body.result,
      note: body.note ?? null,
    })
  )
}
