"use client"

/**
 * Renders one `POST /v1/orders/extract` response, as-is.
 *
 * This is the AI-service test surface: nothing here is persisted, nothing is
 * editable. It shows what the model returned and — just as importantly — what
 * backs each value, so the reviewer can tell a quoted fact from an inference:
 *
 *   - hovering a field highlights the exact `provenance` span in the source
 *   - `evidence` prints the quote the model claims it read
 *   - `missing_fields` and `warnings` get the same weight as the values
 *   - the raw JSON stays one click away
 */

import { useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  Info,
  Quote,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  ESTIMATED_FIELDS,
  EXTRACTED_FIELDS,
  WARNING_MESSAGE_VI,
  fieldLabel,
  isBlockingWarning,
} from "@/lib/ai/labels"
import type { OrderAnalysisResponse } from "@/lib/ai/schema"
import type { Priority } from "@/lib/domain/enums"
import { PRIORITY_LABEL } from "@/lib/domain/labels"
import { cn } from "@/lib/utils"

const PRIORITY_TONE: Record<Priority, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-stage-forming/15 text-stage-forming",
  HIGH: "bg-status-blocked/15 text-status-blocked",
  URGENT: "bg-status-failed/15 text-status-failed",
}

export function AIExtractionResult({
  description,
  result,
  raw,
}: {
  description: string
  result: OrderAnalysisResponse
  /** The untouched payload, so the JSON panel shows the wire bytes. */
  raw?: unknown
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const span = hovered ? (result.provenance[hovered] ?? null) : null
  const tokens = result.metadata.usage

  return (
    <div className="space-y-4">
      {/* Which model actually answered — the first thing to check when the
          output looks wrong. */}
      <div className="bg-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-[11px]">
        <Badge variant="secondary" className="font-mono">
          {result.provider}
        </Badge>
        <span className="font-mono font-medium">{result.model}</span>
        <span className="text-muted-foreground">
          prompt {result.prompt_version} · schema {result.schema_version}
        </span>
        <span className="text-muted-foreground ml-auto tabular-nums">
          {(result.metadata.latency_ms / 1000).toFixed(1)}s · attempt{" "}
          {result.metadata.attempts}
          {tokens.input_tokens !== undefined && (
            <>
              {" · "}
              {tokens.input_tokens} in / {tokens.output_tokens ?? 0} out
            </>
          )}
        </span>
      </div>

      {result.priority && (
        <div className="bg-card flex flex-wrap items-start gap-2 rounded-lg border p-3">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-semibold",
              PRIORITY_TONE[result.priority]
            )}
          >
            {PRIORITY_LABEL[result.priority]} · {result.priority}
          </span>
          {result.priority_reason && (
            <p className="text-muted-foreground min-w-48 flex-1 text-[11px] leading-relaxed">
              {result.priority_reason}
              <br />
              <span className="opacity-70">
                Đề xuất của AI — backend vẫn áp quy tắc riêng khi xác nhận (§14).
              </span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-card space-y-2 self-start rounded-lg border p-3">
          <h3 className="text-xs font-medium">Mô tả đã gửi</h3>
          <p className="text-sm leading-relaxed">
            <Highlighted text={description} span={span} />
          </p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Di chuột lên một trường bên phải để thấy đúng đoạn văn bản mà AI
            trích ra. Trường không tô sáng nghĩa là AI tự suy luận.
          </p>
        </section>

        <section className="space-y-4">
          <Panel title="Trích xuất" caption="Khách hàng nêu rõ" tone="solid">
            {EXTRACTED_FIELDS.map((f) => (
              <Row
                key={f.key}
                label={f.label}
                value={result.extracted[f.key]}
                unit={f.unit}
                evidence={result.evidence[f.key]}
                hasSpan={result.provenance[f.key] !== undefined}
                highlighted={hovered === f.key}
                onHover={() => setHovered(f.key)}
                onLeave={() => setHovered(null)}
              />
            ))}
          </Panel>

          <Panel
            title="AI ước lượng"
            caption="Suy luận — chỉnh được khi xác nhận"
            tone="dashed"
          >
            {ESTIMATED_FIELDS.map((f) => (
              <Row
                key={f.key}
                label={f.label}
                value={result.estimated[f.key]}
                unit={f.unit}
              />
            ))}
          </Panel>

          {result.missing_fields.length > 0 && (
            <div className="bg-muted/40 rounded-lg border border-dashed p-3">
              <div className="flex items-center gap-1.5">
                <Info className="text-muted-foreground size-3.5" />
                <h3 className="text-xs font-medium">
                  Không có trong mô tả ({result.missing_fields.length})
                </h3>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {result.missing_fields.map((field) => (
                  <span
                    key={field}
                    className="bg-background text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]"
                    title={field}
                  >
                    {fieldLabel(field)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {result.warnings.length > 0 && (
        <div className="bg-card space-y-1.5 rounded-lg border p-3">
          <h3 className="text-xs font-medium">
            Cảnh báo ({result.warnings.length})
          </h3>
          <p className="text-muted-foreground text-[11px]">
            Không làm hỏng kết quả — người duyệt quyết định có bỏ qua hay không
            (§16).
          </p>
          <ul className="space-y-1 pt-1">
            {result.warnings.map((w, i) => {
              const blocking = isBlockingWarning(w.code)
              return (
                <li key={`${w.code}-${i}`} className="flex items-start gap-2">
                  {blocking ? (
                    <AlertTriangle className="text-status-failed mt-0.5 size-3 shrink-0" />
                  ) : (
                    <CircleAlert className="text-status-blocked mt-0.5 size-3 shrink-0" />
                  )}
                  <div className="min-w-0 text-[11px] leading-relaxed">
                    <span
                      className={cn(
                        "font-mono",
                        blocking ? "text-status-failed" : "text-status-blocked"
                      )}
                    >
                      {w.code}
                    </span>
                    {w.field && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {fieldLabel(w.field)}
                      </span>
                    )}
                    <br />
                    <span>{w.message || WARNING_MESSAGE_VI[w.code]}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowRaw((s) => !s)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px]"
        >
          <ChevronDown
            className={cn("size-3 transition-transform", showRaw && "rotate-180")}
          />
          Raw JSON
          <Check className="text-status-completed size-3" />
          đã qua Zod validate
        </button>
        {showRaw && (
          <pre className="bg-muted/50 mt-2 max-h-80 overflow-auto rounded-md border p-2 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(raw ?? result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

/** Renders the description with one provenance span marked. */
function Highlighted({
  text,
  span,
}: {
  text: string
  span: [number, number] | null
}) {
  if (!span) return <>{text}</>
  const [start, end] = span
  // A model can return offsets that do not line up with the string it was
  // handed; slicing on them blindly would quietly highlight the wrong words.
  if (start < 0 || end > text.length || start >= end) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-stage-decorating/25 text-foreground rounded px-0.5">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  )
}

function Panel({
  title,
  caption,
  tone,
  children,
}: {
  title: string
  caption: string
  tone: "solid" | "dashed"
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg border p-3",
        tone === "dashed" && "border-dashed"
      )}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-medium">{title}</h3>
        <span className="text-muted-foreground text-[10px]">{caption}</span>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  unit,
  evidence,
  hasSpan,
  highlighted,
  onHover,
  onLeave,
}: {
  label: string
  value: string | number | null
  unit?: string
  evidence?: string
  hasSpan?: boolean
  highlighted?: boolean
  onHover?: () => void
  onLeave?: () => void
}) {
  const empty = value === null || value === undefined || value === ""

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "flex min-h-8 flex-col justify-center gap-0.5 px-1 py-1 transition-colors",
        hasSpan && "hover:bg-accent/40 -mx-1 cursor-default rounded",
        highlighted && "bg-stage-decorating/10"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[11px]">{label}</span>
        {empty ? (
          <span className="text-muted-foreground/60 font-mono text-xs">null</span>
        ) : (
          <span className="text-right text-xs font-medium tabular-nums">
            {String(value)}
            {unit && (
              <span className="text-muted-foreground ml-1 font-normal">
                {unit}
              </span>
            )}
          </span>
        )}
      </div>
      {evidence && (
        <span className="text-muted-foreground/80 flex items-start gap-1 text-[10px] leading-snug italic">
          <Quote className="mt-px size-2.5 shrink-0" />
          {evidence}
        </span>
      )}
    </div>
  )
}
