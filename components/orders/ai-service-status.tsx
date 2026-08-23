"use client"

/**
 * `GET /health` as a one-line chip.
 *
 * Worth its own component because the health endpoint makes no provider call:
 * green here means the AI service process is up, and nothing more. When an
 * extraction then fails with AI_PROVIDER_ERROR, this chip is what tells you
 * the problem is the LLM behind the service rather than the service itself.
 */

import { useEffect, useState } from "react"
import { Loader2, Plug, PlugZap } from "lucide-react"

import { AIServiceError, AI_BASE_URL, AI_IS_DIRECT } from "@/lib/ai/client"
import { getAIHealth } from "@/lib/ai/endpoints"
import type { HealthResponse } from "@/lib/ai/schema"
import { cn } from "@/lib/utils"

type State =
  | { kind: "loading" }
  | { kind: "up"; health: HealthResponse }
  | { kind: "down"; code: string; message: string }

export function AIServiceStatus({ className }: { className?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false

    getAIHealth()
      .then((health) => {
        if (!cancelled) setState({ kind: "up", health })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          kind: "down",
          code: error instanceof AIServiceError ? error.code : "UNKNOWN_ERROR",
          message: error instanceof Error ? error.message : "Không rõ nguyên nhân.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const route = AI_IS_DIRECT ? `trực tiếp ${AI_BASE_URL}` : `proxy ${AI_BASE_URL}`

  return (
    <div
      className={cn(
        "bg-card flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[11px]",
        className
      )}
    >
      {state.kind === "loading" && (
        <>
          <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
          <span className="text-muted-foreground">Đang kiểm tra AI service…</span>
        </>
      )}

      {state.kind === "up" && (
        <>
          <PlugZap className="text-status-completed size-3.5" />
          <span className="font-medium">
            {state.health.service} v{state.health.version}
          </span>
          <span className="text-muted-foreground font-mono">
            {state.health.provider} · {state.health.model}
          </span>
        </>
      )}

      {state.kind === "down" && (
        <>
          <Plug className="text-status-failed size-3.5" />
          <span className="text-status-failed font-mono">{state.code}</span>
          <span className="text-muted-foreground">{state.message}</span>
        </>
      )}

      <span className="text-muted-foreground/70 ml-auto">{route}</span>
    </div>
  )
}
