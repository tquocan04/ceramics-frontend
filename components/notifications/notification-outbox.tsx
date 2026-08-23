"use client"

/**
 * The Telegram outbox (§11.5, §11.6).
 *
 * This screen exists to make one specific guarantee visible: a failed send
 * never rolls back production. A row sitting at FAILED next to a batch that
 * completed anyway is the proof, and the retry button is §28 Scenario E.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Send } from "lucide-react"
import { toast } from "sonner"

import { LocalTime } from "@/components/batches/stage-timeline"
import { useStream } from "@/components/layout/stream-provider"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiRequestError } from "@/lib/api/client"
import { listNotifications, retryNotification } from "@/lib/api/endpoints"
import {
  NOTIFICATION_STATUS,
  type NotificationStatus,
} from "@/lib/domain/enums"
import { NOTIFICATION_STATUS_LABEL } from "@/lib/domain/labels"
import type { Notification } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const TONE: Record<NotificationStatus, string> = {
  PENDING: "text-muted-foreground bg-muted",
  SENT: "text-risk-on-track bg-risk-on-track/10",
  FAILED: "text-status-failed bg-status-failed/10",
}

export function NotificationOutbox() {
  const { revision } = useStream()
  const [items, setItems] = useState<Notification[] | null>(null)
  const [filter, setFilter] = useState<NotificationStatus | "ALL">("ALL")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    listNotifications()
      .then((r) => setItems(r.notifications))
      .catch(() => setItems([]))
  }, [])

  useEffect(() => {
    load()
  }, [load, revision])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of items ?? []) map.set(n.status, (map.get(n.status) ?? 0) + 1)
    return map
  }, [items])

  const visible = (items ?? []).filter(
    (n) => filter === "ALL" || n.status === filter
  )

  async function retry(n: Notification) {
    setBusyId(n.id)
    try {
      const updated = await retryNotification(n.id)
      if (updated.status === NOTIFICATION_STATUS.SENT) {
        toast.success("Đã gửi lại thành công")
      } else {
        toast.error("Gửi lại vẫn thất bại", {
          description: updated.error_message ?? undefined,
        })
      }
      load()
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.code : "Không gửi lại được")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      <p className="text-muted-foreground bg-muted/40 rounded-md border p-2.5 text-xs leading-relaxed">
        Workflow tạo <span className="font-mono">WorkflowEvent</span> →{" "}
        <span className="font-mono">NotificationService</span> →{" "}
        <span className="font-mono">Telegram adapter</span>. Nếu gửi thất bại,
        công đoạn <span className="text-foreground font-medium">vẫn COMPLETED</span>{" "}
        và chỉ notification chuyển sang FAILED — không rollback nghiệp vụ sản
        xuất (§11.6).
      </p>

      <div className="flex flex-wrap items-center gap-1">
        {(["ALL", ...Object.values(NOTIFICATION_STATUS)] as const).map((s) => (
          <Button
            key={s}
            size="xs"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s as NotificationStatus | "ALL")}
            className="gap-1.5"
          >
            {s === "ALL" ? "Tất cả" : NOTIFICATION_STATUS_LABEL[s]}
            <span className="font-mono text-[10px] opacity-70">
              {s === "ALL" ? (items?.length ?? 0) : (counts.get(s) ?? 0)}
            </span>
          </Button>
        ))}
      </div>

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Không có thông báo nào.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => (
            <li
              key={n.id}
              className={cn(
                "bg-card rounded-lg border p-3",
                n.status === NOTIFICATION_STATUS.FAILED &&
                  "border-status-failed/40"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Send className="text-muted-foreground size-3.5" />
                <span className="font-mono text-[11px]">{n.channel}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
                    TONE[n.status]
                  )}
                  title={NOTIFICATION_STATUS_LABEL[n.status]}
                >
                  {n.status}
                </span>
                {n.retry_count > 0 && (
                  <span className="text-muted-foreground font-mono text-[10px]">
                    retry ×{n.retry_count}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto text-[10px]">
                  <LocalTime iso={n.created_at} />
                </span>
                {n.status === NOTIFICATION_STATUS.FAILED && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="gap-1"
                    disabled={busyId === n.id}
                    onClick={() => retry(n)}
                  >
                    {busyId === n.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    Gửi lại
                  </Button>
                )}
              </div>

              <pre className="bg-muted/40 mt-2 overflow-x-auto rounded border p-2 font-sans text-[11px] leading-relaxed whitespace-pre-wrap">
                {n.payload}
              </pre>

              {n.error_message && (
                <p className="text-status-failed mt-1.5 font-mono text-[10px]">
                  {n.error_message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
