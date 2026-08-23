import type {
  BatchStatus,
  DeadlineRisk,
  OrderStatus,
  Priority,
  StageStatus,
} from "@/lib/domain/enums"
import {
  BATCH_STATUS_LABEL,
  DEADLINE_RISK_LABEL,
  ORDER_STATUS_LABEL,
  PRIORITY_LABEL,
  STAGE_STATUS_LABEL,
} from "@/lib/domain/labels"
import { cn } from "@/lib/utils"

/**
 * Status colouring, kept separate from the stage palette so a BLOCKED FIRING
 * card reads unambiguously: the stage says where it is, the status says how
 * it is doing.
 */

const BATCH_TONE: Record<BatchStatus, string> = {
  PENDING: "text-muted-foreground bg-muted",
  IN_PRODUCTION: "text-stage-decorating bg-stage-decorating/10",
  BLOCKED: "text-status-blocked bg-status-blocked/10",
  REWORK_REQUIRED: "text-status-rework bg-status-rework/10",
  COMPLETED: "text-status-completed bg-status-completed/10",
  CANCELLED: "text-muted-foreground bg-muted",
}

const STAGE_TONE: Record<StageStatus, string> = {
  PENDING: "text-muted-foreground bg-muted",
  IN_PROGRESS: "text-stage-drying bg-stage-drying/10",
  COMPLETED: "text-status-completed bg-status-completed/10",
  FAILED: "text-status-failed bg-status-failed/10",
  BLOCKED: "text-status-blocked bg-status-blocked/10",
  REWORK_REQUIRED: "text-status-rework bg-status-rework/10",
}

const ORDER_TONE: Record<OrderStatus, string> = {
  DRAFT: "text-muted-foreground bg-muted",
  AI_ANALYZING: "text-stage-decorating bg-stage-decorating/10",
  AI_ANALYSIS_FAILED: "text-status-failed bg-status-failed/10",
  PENDING_CONFIRMATION: "text-risk-at-risk bg-risk-at-risk/10",
  CONFIRMED: "text-stage-glazing bg-stage-glazing/10",
  IN_PRODUCTION: "text-stage-decorating bg-stage-decorating/10",
  COMPLETED: "text-status-completed bg-status-completed/10",
  CANCELLED: "text-muted-foreground bg-muted",
}

const RISK_TONE: Record<DeadlineRisk, string> = {
  ON_TRACK: "text-risk-on-track",
  AT_RISK: "text-risk-at-risk",
  OVERDUE: "text-risk-overdue",
}

const PRIORITY_TONE: Record<Priority, string> = {
  LOW: "text-muted-foreground",
  NORMAL: "text-muted-foreground",
  HIGH: "text-risk-at-risk",
  URGENT: "text-risk-overdue",
}

const base =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"

/** Shows the Vietnamese label with the raw enum code kept visible. */
export function BatchStatusChip({
  status,
  className,
}: {
  status: BatchStatus
  className?: string
}) {
  return (
    <span className={cn(base, BATCH_TONE[status], className)} title={BATCH_STATUS_LABEL[status]}>
      {status}
    </span>
  )
}

export function StageStatusChip({
  status,
  className,
}: {
  status: StageStatus
  className?: string
}) {
  return (
    <span className={cn(base, STAGE_TONE[status], className)} title={STAGE_STATUS_LABEL[status]}>
      {status}
    </span>
  )
}

export function OrderStatusChip({
  status,
  className,
}: {
  status: OrderStatus
  className?: string
}) {
  return (
    <span className={cn(base, ORDER_TONE[status], className)} title={ORDER_STATUS_LABEL[status]}>
      {status}
    </span>
  )
}

export function PriorityChip({
  priority,
  className,
}: {
  priority: Priority
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide",
        PRIORITY_TONE[priority],
        className
      )}
      title={`Priority: ${priority}`}
    >
      <span className="inline-block size-1.5 rounded-full bg-current" />
      {PRIORITY_LABEL[priority].toUpperCase()}
    </span>
  )
}

export function RiskText({
  risk,
  children,
  className,
}: {
  risk: DeadlineRisk
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(RISK_TONE[risk], className)}
      title={`${DEADLINE_RISK_LABEL[risk]} (${risk})`}
    >
      {children}
    </span>
  )
}
