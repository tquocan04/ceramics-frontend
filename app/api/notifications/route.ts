/** Telegram outbox — not in §16, but needed to demo §11.6 / Scenario E. */

import { handle } from "@/lib/mock/http"
import { db } from "@/lib/mock/db"

export const dynamic = "force-dynamic"

export async function GET() {
  return handle(() => ({
    notifications: [...db.notifications].reverse().slice(0, 200),
  }))
}
