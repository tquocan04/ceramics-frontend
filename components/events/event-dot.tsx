import type { EventType } from "@/lib/domain/enums"
import { cn } from "@/lib/utils"

/**
 * Severity colouring for events. Deliberately independent of the stage
 * palette: an event is read for what happened, not where it happened.
 */
export const EVENT_TONE: Record<EventType, string> = {
  ORDER_CREATED: "bg-muted-foreground",
  AI_ANALYSIS_STARTED: "bg-muted-foreground",
  AI_ANALYSIS_COMPLETED: "bg-stage-decorating",
  AI_ANALYSIS_FAILED: "bg-status-failed",
  ORDER_CONFIRMED: "bg-stage-decorating",
  ORDER_CANCELLED: "bg-muted-foreground",
  BATCH_CREATED: "bg-stage-decorating",
  STAGE_STARTED: "bg-stage-drying",
  STAGE_COMPLETED: "bg-status-completed",
  STAGE_FAILED: "bg-status-failed",
  QC_SUBMITTED: "bg-stage-qc",
  QC_WARNING: "bg-status-rework",
  QC_CRITICAL: "bg-status-blocked",
  REWORK_REQUIRED: "bg-status-rework",
  BATCH_COMPLETED: "bg-status-completed",
  DEADLINE_WARNING: "bg-risk-at-risk",
  TRANSITION_REJECTED: "bg-status-failed",
}

/** Events that deserve to stand out in a fast-scrolling feed. */
export const EVENT_IS_ALERT = new Set<EventType>([
  "STAGE_FAILED",
  "QC_CRITICAL",
  "QC_WARNING",
  "REWORK_REQUIRED",
  "AI_ANALYSIS_FAILED",
  "DEADLINE_WARNING",
])

export function EventDot({
  type,
  className,
}: {
  type: EventType
  className?: string
}) {
  return (
    <span
      className={cn(
        "mt-1.5 inline-block size-1.5 shrink-0 rounded-full",
        EVENT_TONE[type],
        className
      )}
      aria-hidden="true"
    />
  )
}
