"use client"

/**
 * Next 16.3 renamed the error-boundary prop: `retry` re-fetches and re-renders
 * the children, where the older `reset` only cleared the error state.
 */

import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-8">
      <div className="max-w-md space-y-3 text-center">
        <h2 className="text-base font-semibold">Có lỗi xảy ra</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {error.message || "Không tải được dữ liệu."}
        </p>
        {error.digest && (
          <p className="text-muted-foreground font-mono text-[10px]">
            digest: {error.digest}
          </p>
        )}
        <Button onClick={() => retry()} className="gap-2">
          <RefreshCw />
          Thử lại
        </Button>
      </div>
    </div>
  )
}
