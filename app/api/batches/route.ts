/** §16.2 — GET /api/batches */

import { handle } from "@/lib/mock/http"
import { listBatchViews } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

export async function GET() {
  return handle(() => ({ batches: listBatchViews() }))
}
