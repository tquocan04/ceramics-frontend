"use client"

/**
 * §29 Screen 3 — AI review.
 *
 * The screen the whole AI-integration score rests on. Three things it must
 * make obvious:
 *
 *   1. What the customer actually said vs what the model inferred (§34) —
 *      hence the extracted/estimated split, and hovering a field highlights
 *      the exact span of source text it came from.
 *   2. That the output was validated, not trusted (§6.5) — hence the schema
 *      panel and the raw JSON toggle.
 *   3. That a failure is recoverable (§28 Scenario D) — hence the error state
 *      keeps the order and offers a retry.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { OrderStatusChip } from "@/components/batches/status-chip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiRequestError } from "@/lib/api/client"
import {
  analyzeOrder,
  cancelOrder,
  confirmOrder,
  getOrder,
  type OrderDetail,
} from "@/lib/api/endpoints"
import { PRIORITY, type Priority } from "@/lib/domain/enums"
import { PRIORITY_LABEL } from "@/lib/domain/labels"
import type {
  AIEstimatedData,
  AIExtractedData,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const EXTRACTED_FIELDS: Array<{
  key: keyof AIExtractedData
  label: string
  unit?: string
}> = [
  { key: "product_name", label: "Tên sản phẩm" },
  { key: "quantity", label: "Số lượng", unit: "sp" },
  { key: "height_cm", label: "Chiều cao", unit: "cm" },
  { key: "width_cm", label: "Chiều rộng", unit: "cm" },
  { key: "decoration_pattern", label: "Họa tiết" },
  { key: "glaze_type", label: "Loại men" },
  { key: "firing_temperature_c", label: "Nhiệt độ nung", unit: "°C" },
  { key: "deadline_days", label: "Thời hạn", unit: "ngày" },
]

const ESTIMATED_FIELDS: Array<{
  key: keyof AIEstimatedData
  label: string
  unit: string
}> = [
  { key: "clay_kg", label: "Đất sét ước tính", unit: "kg" },
  { key: "glaze_kg", label: "Men ước tính", unit: "kg" },
  { key: "firing_duration_hours", label: "Thời gian nung", unit: "giờ" },
]

export function AIReview({ orderId }: { orderId: string }) {
  const router = useRouter()

  const [data, setData] = useState<OrderDetail | null>(null)
  const [hovered, setHovered] = useState<keyof AIExtractedData | null>(null)
  const [overrides, setOverrides] = useState<Partial<AIEstimatedData>>({})
  const [priority, setPriority] = useState<Priority | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [busy, setBusy] = useState<"analyze" | "confirm" | "cancel" | null>(null)

  const load = useCallback(() => {
    getOrder(orderId)
      .then((d) => {
        setData(d)
        setPriority((p) => p ?? d.analysis?.result?.priority ?? PRIORITY.NORMAL)
      })
      .catch(() => setData(null))
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  if (!data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  const { order, analysis, batch } = data
  const result = analysis?.result ?? null

  async function retry() {
    setBusy("analyze")
    try {
      const r = await analyzeOrder(order.id)
      if (r.analysis.is_valid) {
        toast.success("AI phân tích thành công")
      } else {
        toast.error(r.analysis.error_code ?? "AI_ANALYSIS_FAILED")
      }
      load()
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.code : "Không phân tích được")
    } finally {
      setBusy(null)
    }
  }

  async function confirm() {
    setBusy("confirm")
    try {
      const r = await confirmOrder(order.id, {
        spec: Object.keys(overrides).length
          ? { estimated: { ...result!.estimated, ...overrides } }
          : undefined,
        priority: priority ?? undefined,
      })
      toast.success(`Đã tạo mẻ ${r.batch.batch_code}`, {
        description: `${r.stages.length} công đoạn được sinh tự động.`,
      })
      router.push(`/batches/${r.batch.batch_code}`)
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.code : "Không xác nhận được", {
        description: e instanceof ApiRequestError ? e.message : undefined,
      })
      setBusy(null)
    }
  }

  async function cancel() {
    setBusy("cancel")
    try {
      await cancelOrder(order.id)
      toast.success("Đã huỷ đơn hàng")
      load()
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.code : "Không huỷ được đơn")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{order.order_code}</span>
        <OrderStatusChip status={order.status} />
        {batch && (
          <Link
            href={`/batches/${batch.batch_code}`}
            className="text-stage-decorating ml-auto flex items-center gap-1 text-xs hover:underline"
          >
            Mẻ {batch.batch_code}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left — the original text, with provenance highlighting */}
        <section className="bg-card space-y-2 rounded-lg border p-3">
          <h3 className="text-xs font-medium">Mô tả gốc của khách hàng</h3>
          <p className="text-sm leading-relaxed">
            <Highlighted
              text={order.raw_description}
              span={hovered ? (result?.provenance?.[hovered] ?? null) : null}
            />
          </p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Di chuột lên một trường bên phải để thấy chính xác đoạn văn bản mà
            AI trích ra — trường nào không tô sáng nghĩa là AI tự suy luận.
          </p>
        </section>

        {/* Right — the structured result */}
        <section className="space-y-4">
          {analysis && !analysis.is_valid && (
            <FailurePanel
              code={analysis.error_code}
              errors={analysis.validation_errors}
              raw={analysis.raw_response}
              attempt={analysis.attempt}
            />
          )}

          {result && (
            <>
              <FieldGroup
                title="Trích xuất từ đơn hàng"
                caption="Khách hàng nêu rõ — không sửa"
                tone="solid"
              >
                {EXTRACTED_FIELDS.map((f) => {
                  const value = result.extracted[f.key]
                  return (
                    <FieldRow
                      key={f.key}
                      label={f.label}
                      onHover={() => setHovered(f.key)}
                      onLeave={() => setHovered(null)}
                      highlighted={hovered === f.key}
                    >
                      {value === null || value === undefined ? (
                        <span className="text-muted-foreground/60 font-mono text-xs">
                          null
                        </span>
                      ) : (
                        <span className="text-xs font-medium tabular-nums">
                          {String(value)}
                          {f.unit ? (
                            <span className="text-muted-foreground ml-1 font-normal">
                              {f.unit}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </FieldRow>
                  )
                })}
              </FieldGroup>

              <FieldGroup
                title="AI ước lượng"
                caption="Suy luận — có thể chỉnh sửa"
                tone="dashed"
              >
                {ESTIMATED_FIELDS.map((f) => (
                  <FieldRow key={f.key} label={f.label}>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        disabled={!!batch}
                        value={String(
                          overrides[f.key] ?? result.estimated[f.key] ?? ""
                        )}
                        onChange={(e) =>
                          setOverrides((o) => ({
                            ...o,
                            [f.key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }))
                        }
                        className="h-6 w-20 px-1.5 text-right text-xs tabular-nums"
                      />
                      <span className="text-muted-foreground w-8 text-[11px]">
                        {f.unit}
                      </span>
                    </div>
                  </FieldRow>
                ))}

                <FieldRow label="Priority">
                  <Select
                    value={priority ?? PRIORITY.NORMAL}
                    onValueChange={(v) => setPriority(v as Priority)}
                    disabled={!!batch}
                  >
                    <SelectTrigger size="sm" className="h-6 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PRIORITY).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_LABEL[p]} · {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </FieldGroup>

              {result.priority_reason && (
                <p className="text-muted-foreground bg-muted/40 rounded-md border p-2 text-[11px] leading-relaxed">
                  <span className="text-foreground font-medium">
                    Lý do đề xuất priority:{" "}
                  </span>
                  {result.priority_reason}
                  <br />
                  <span className="opacity-70">
                    Backend không tin tuyệt đối AI — bạn có thể ghi đè (§14).
                  </span>
                </p>
              )}

              <ValidationPanel extracted={result.extracted} />
            </>
          )}

          {analysis && (
            <div>
              <button
                type="button"
                onClick={() => setShowRaw((s) => !s)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px]"
              >
                <ChevronDown
                  className={cn("size-3 transition-transform", showRaw && "rotate-180")}
                />
                Raw response · {analysis.model} · {analysis.latency_ms}ms · attempt{" "}
                {analysis.attempt}
              </button>
              {showRaw && (
                <pre className="bg-muted/50 mt-2 max-h-64 overflow-auto rounded-md border p-2 font-mono text-[10px] leading-relaxed">
                  {analysis.raw_response || "(rỗng — provider không trả về gì)"}
                </pre>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {!batch && (
          <>
            <Button
              onClick={confirm}
              disabled={!result || !analysis?.is_valid || busy !== null}
              className="gap-2"
            >
              {busy === "confirm" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              Xác nhận & tạo mẻ sản xuất
            </Button>
            <Button
              variant="outline"
              onClick={retry}
              disabled={busy !== null}
              className="gap-2"
            >
              {busy === "analyze" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Phân tích lại
            </Button>
            <Button
              variant="ghost"
              onClick={cancel}
              disabled={busy !== null}
              className="text-muted-foreground hover:text-destructive gap-2"
            >
              <Ban />
              Huỷ đơn
            </Button>
          </>
        )}
        {batch && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Sparkles className="size-3.5" />
            Đơn đã được xác nhận và mẻ {batch.batch_code} đang chạy. Xác nhận lại
            sẽ không tạo mẻ thứ hai (§21).
          </p>
        )}
      </div>
    </div>
  )
}

/** Renders the description with one span highlighted. */
function Highlighted({
  text,
  span,
}: {
  text: string
  span: [number, number] | null
}) {
  if (!span) return <>{text}</>
  const [start, end] = span
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

function FieldGroup({
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

function FieldRow({
  label,
  children,
  onHover,
  onLeave,
  highlighted,
}: {
  label: string
  children: React.ReactNode
  onHover?: () => void
  onLeave?: () => void
  highlighted?: boolean
}) {
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "flex min-h-8 items-center justify-between gap-3 px-1 transition-colors",
        onHover && "hover:bg-accent/40 -mx-1 cursor-default rounded",
        highlighted && "bg-stage-decorating/10"
      )}
    >
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {children}
    </div>
  )
}

/** §22 — the checks the backend re-runs regardless of what the AI claimed. */
function ValidationPanel({ extracted }: { extracted: AIExtractedData }) {
  const checks = [
    {
      label: "quantity > 0",
      pass: (extracted.quantity ?? 0) > 0,
      actual: extracted.quantity,
    },
    {
      label: "deadline_days > 0",
      pass: extracted.deadline_days === null || extracted.deadline_days > 0,
      actual: extracted.deadline_days,
    },
    {
      label: "firing_temperature_c > 0",
      pass:
        extracted.firing_temperature_c === null ||
        extracted.firing_temperature_c > 0,
      actual: extracted.firing_temperature_c,
    },
    {
      label: "temperature trong khoảng 600–1450",
      pass:
        extracted.firing_temperature_c === null ||
        (extracted.firing_temperature_c >= 600 &&
          extracted.firing_temperature_c <= 1450),
      actual: extracted.firing_temperature_c,
    },
  ]

  return (
    <div className="bg-card rounded-lg border p-3">
      <h3 className="mb-2 text-xs font-medium">Kiểm tra schema (§22)</h3>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-[11px]">
            {c.pass ? (
              <Check className="text-status-completed size-3 shrink-0" />
            ) : (
              <AlertTriangle className="text-status-failed size-3 shrink-0" />
            )}
            <span className="font-mono">{c.label}</span>
            <span className="text-muted-foreground ml-auto tabular-nums">
              {c.actual === null || c.actual === undefined
                ? "null"
                : String(c.actual)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** §28 Scenario D — the order survives, and retry is one click away. */
function FailurePanel({
  code,
  errors,
  raw,
  attempt,
}: {
  code: string | null
  errors: string[]
  raw: string
  attempt: number
}) {
  return (
    <div className="border-status-failed/50 bg-status-failed/[0.05] rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="text-status-failed size-4 shrink-0" />
        <span className="text-status-failed font-mono text-xs font-semibold">
          {code ?? "AI_ANALYSIS_FAILED"}
        </span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          lần thử {attempt}
        </span>
      </div>

      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        AI không trả về dữ liệu dùng được. Đơn hàng vẫn được giữ nguyên — không
        có gì bị mất, và bạn có thể phân tích lại.
      </p>

      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i} className="text-status-failed font-mono text-[10px]">
              · {e}
            </li>
          ))}
        </ul>
      )}

      {raw && (
        <details className="mt-2">
          <summary className="text-muted-foreground cursor-pointer text-[10px]">
            Xem output thô mà AI trả về
          </summary>
          <pre className="bg-background/60 mt-1 max-h-40 overflow-auto rounded border p-2 font-mono text-[10px]">
            {raw}
          </pre>
        </details>
      )}
    </div>
  )
}
