/** §16.6 — GET /api/dashboard/summary */

import { handle } from "@/lib/mock/http"
import { dashboardSummary } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

export async function GET() {
  return handle(() => dashboardSummary())
}
