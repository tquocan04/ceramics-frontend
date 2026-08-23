"use client"

import Link from "next/link"
import {
  Ban,
  CircleAlert,
  Clock,
  Factory,
  Recycle,
  SendHorizontal,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardSummary } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

interface Tile {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: string
  href?: string
  hint?: string
}

export function KpiStrip({ summary }: { summary: DashboardSummary | null }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    )
  }

  const tiles: Tile[] = [
    {
      label: "Đang sản xuất",
      value: summary.in_production,
      icon: Factory,
      hint: "Batches with status IN_PRODUCTION",
    },
    {
      label: "Có rủi ro trễ",
      value: summary.at_risk,
      icon: Clock,
      tone: summary.at_risk > 0 ? "text-risk-at-risk" : undefined,
      hint: "AT_RISK — thời gian còn lại ít hơn thời gian ước tính cần thiết",
    },
    {
      label: "Trễ hạn",
      value: summary.overdue,
      icon: CircleAlert,
      tone: summary.overdue > 0 ? "text-risk-overdue" : undefined,
      hint: "OVERDUE — đã quá deadline",
    },
    {
      label: "Bị khoá",
      value: summary.blocked,
      icon: Ban,
      tone: summary.blocked > 0 ? "text-status-blocked" : undefined,
      hint: "BLOCKED — có công đoạn FAILED, chờ quản lý xử lý",
    },
    {
      label: "Cần làm lại",
      value: summary.rework,
      icon: Recycle,
      tone: summary.rework > 0 ? "text-status-rework" : undefined,
      hint: "REWORK_REQUIRED — QC không đạt",
    },
    {
      label: "Thông báo lỗi",
      value: summary.failed_notifications,
      icon: SendHorizontal,
      tone: summary.failed_notifications > 0 ? "text-status-failed" : undefined,
      href: "/notifications",
      hint: "Notification FAILED — không làm rollback nghiệp vụ (§11.6)",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => {
        const body = (
          <>
            <div className="flex items-center gap-1.5">
              <tile.icon
                className={cn("size-3.5", tile.tone ?? "text-muted-foreground")}
              />
              <span className="text-muted-foreground truncate text-[11px]">
                {tile.label}
              </span>
            </div>
            <div
              className={cn(
                "mt-1 text-xl font-semibold tabular-nums",
                tile.tone
              )}
            >
              {tile.value}
            </div>
          </>
        )

        const className = cn(
          "bg-card rounded-lg border p-2.5 transition-colors",
          tile.href && "hover:border-foreground/20"
        )

        return tile.href ? (
          <Link
            key={tile.label}
            href={tile.href}
            className={className}
            title={tile.hint}
          >
            {body}
          </Link>
        ) : (
          <div key={tile.label} className={className} title={tile.hint}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

export function DefectRateTile({ rate }: { rate: number }) {
  const pct = rate * 100
  const tone =
    pct > 15
      ? "text-status-blocked"
      : pct > 5
        ? "text-status-rework"
        : "text-risk-on-track"

  return (
    <div className="bg-card rounded-lg border p-2.5">
      <span className="text-muted-foreground text-[11px]">
        Defect rate trung bình
      </span>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>
        {pct.toFixed(1)}%
      </div>
    </div>
  )
}
