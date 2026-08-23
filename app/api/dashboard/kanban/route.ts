/** §16.6 — GET /api/dashboard/kanban */

import { handle } from "@/lib/mock/http"
import { dashboardKanban, dashboardSummary } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

export async function GET() {
  return handle(() => ({
    ...dashboardKanban(),
    summary: dashboardSummary(),
  }))
}
