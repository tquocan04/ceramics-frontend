/** §16.1 — GET /api/orders, POST /api/orders */

import { handle, readJson } from "@/lib/mock/http"
import { createOrder, listOrders } from "@/lib/mock/services"

export const dynamic = "force-dynamic"

export async function GET() {
  return handle(() => ({ orders: listOrders() }))
}

interface CreateBody {
  raw_description?: string
  requested_deadline?: string | null
}

export async function POST(request: Request) {
  const body = await readJson<CreateBody>(request)
  return handle(() =>
    createOrder(body.raw_description ?? "", body.requested_deadline ?? null)
  )
}
