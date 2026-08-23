/**
 * Demo control surface. Not part of the §16 contract — it exists so the
 * failure scenarios of §28 can be triggered on camera rather than waited for.
 */

import { handle, readJson } from "@/lib/mock/http"
import { db, resetDb, type AIFailureMode } from "@/lib/mock/db"
import { setSimulator, setSimulatorSpeed } from "@/lib/mock/simulator"
import { seedIfEmpty } from "@/lib/mock/seed"
import { publish } from "@/lib/mock/bus"

export const dynamic = "force-dynamic"

interface SimBody {
  action?: "play" | "pause" | "speed" | "reset" | "ai_failure" | "notify_failure"
  speed?: number
  mode?: AIFailureMode
  rate?: number
}

export async function GET() {
  return handle(() => db.config)
}

export async function POST(request: Request) {
  const body = await readJson<SimBody>(request)
  return handle(() => {
    switch (body.action) {
      case "play":
        setSimulator(true)
        break
      case "pause":
        setSimulator(false)
        break
      case "speed":
        setSimulatorSpeed(Number(body.speed ?? 1))
        break
      case "ai_failure":
        db.config.aiFailureMode = body.mode ?? "NONE"
        break
      case "notify_failure":
        db.config.notificationFailureRate = Math.min(
          1,
          Math.max(0, Number(body.rate ?? 0))
        )
        break
      case "reset":
        resetDb()
        seedIfEmpty()
        publish({ kind: "invalidate", scope: "all" })
        break
    }
    return db.config
  })
}
