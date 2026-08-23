"use client"

/**
 * §29 Screen 2 — natural-language intake, wired to the real AI service.
 *
 * Submitting calls `POST /v1/orders/extract` directly (via the same-origin
 * proxy) and shows the response inline. Nothing is written: this screen is
 * where you find out what the model understood, before any order or batch
 * exists. Persisting is a separate, explicit second click.
 *
 * The pipeline is drawn as discrete steps rather than a spinner because
 * "call -> parse -> validate" is three distinct places the run can fail, and
 * each step here flips on a real event — not a timer.
 */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { AIExtractionResult } from "@/components/orders/ai-extraction-result"
import { AIServiceStatus } from "@/components/orders/ai-service-status"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AIServiceError } from "@/lib/ai/client"
import { extractOrder } from "@/lib/ai/endpoints"
import { AI_ERROR_MESSAGE_VI } from "@/lib/ai/labels"
import type { AIErrorCode, OrderAnalysisResponse } from "@/lib/ai/schema"
import { ApiRequestError } from "@/lib/api/client"
import { createOrder } from "@/lib/api/endpoints"
import { cn } from "@/lib/utils"

const EXAMPLES = [
  "Nhận đơn chế tác 300 bình gốm họa tiết tứ quý tùng cúc trúc mai phủ men lam với chiều cao đạt chuẩn 40cm, bắt buộc trải qua quy trình nung đạt ngưỡng nhiệt 1280°C và cam kết bàn giao đúng hạn trong 12 ngày tới.",
  "Đơn 200 Bình gốm họa tiết sen men lam cao 35cm, yêu cầu nung nhiệt độ cao 1280°C, hoàn thành trong 10 ngày.",
  "Cần 60 chén gốm men trắng họa tiết tre, cao 8cm, nung 1250 độ C, giao trong 21 ngày.",
  "Gấp: 350 đĩa gốm men nâu họa tiết chim hạc cao 4cm, nung 1300°C, cần xong trong 7 ngày.",
]

/** Each step completes on an actual event in `extractOrder`, not a timeout. */
const STEPS = [
  { key: "request", label: "POST /v1/orders/extract" },
  { key: "parse", label: "Nhận & parse JSON" },
  { key: "validate", label: "Validate schema bằng Zod" },
] as const

interface Failure {
  code: AIErrorCode | "UNKNOWN_ERROR"
  message: string
  status: number | null
  issues?: string[]
  raw?: unknown
}

export function NewOrderForm() {
  const router = useRouter()
  const reduced = useReducedMotion()

  const [description, setDescription] = useState("")
  const [step, setStep] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  /** The text that produced `result` — provenance offsets index into it. */
  const [analyzed, setAnalyzed] = useState("")
  const [result, setResult] = useState<OrderAnalysisResponse | null>(null)
  const [raw, setRaw] = useState<unknown>(null)
  const [failure, setFailure] = useState<Failure | null>(null)

  // An extraction runs for 10–20s; a static spinner over that reads as a hang.
  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - started), 100)
    return () => clearInterval(id)
  }, [busy])

  const rawRef = useRef<unknown>(null)

  async function analyze() {
    const text = description.trim()
    if (!text) {
      toast.error("EMPTY_DESCRIPTION", {
        description: AI_ERROR_MESSAGE_VI.EMPTY_DESCRIPTION,
      })
      return
    }

    setBusy(true)
    setElapsed(0)
    setResult(null)
    setFailure(null)
    setStep(0)
    rawRef.current = null

    try {
      const response = await extractOrder(text, {
        onRawResponse: (payload) => {
          // Transport and JSON parse are both done by the time this fires;
          // what remains is validation.
          rawRef.current = payload
          setRaw(payload)
          setStep(2)
        },
      })

      setStep(STEPS.length)
      setAnalyzed(text)
      setResult(response)

      const warnings = response.warnings.length
      toast.success("AI phân tích xong", {
        description: warnings
          ? `${warnings} cảnh báo cần xem lại trước khi xác nhận.`
          : `${response.model} · ${(response.metadata.latency_ms / 1000).toFixed(1)}s`,
      })
    } catch (error) {
      const failed: Failure =
        error instanceof AIServiceError
          ? {
              code: error.code,
              message: error.message,
              status: error.status,
              issues: error.issues,
              raw: rawRef.current,
            }
          : {
              code: "UNKNOWN_ERROR",
              message:
                error instanceof Error ? error.message : "Lỗi không xác định.",
              status: null,
            }

      setFailure(failed)
      setStep(-1)
      toast.error(failed.code, { description: failed.message })
    } finally {
      setBusy(false)
    }
  }

  /**
   * §6.6 — the description is persisted independently of the AI run, so an
   * extraction the manager likes is never at the mercy of a second AI call.
   */
  async function saveOrder() {
    setSaving(true)
    try {
      const order = await createOrder(analyzed)
      toast.success(`Đã lưu ${order.order_code}`, {
        description: "Mở màn hình xem lại để xác nhận và tạo mẻ sản xuất.",
      })
      router.push(`/orders/${order.id}`)
    } catch (error) {
      toast.error(
        error instanceof ApiRequestError ? error.code : "Không lưu được đơn hàng",
        { description: error instanceof ApiRequestError ? error.message : undefined }
      )
      setSaving(false)
    }
  }

  const locked = busy || saving

  return (
    <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 space-y-5 overflow-auto p-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          Mô tả đơn hàng bằng ngôn ngữ tự nhiên
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Nhập yêu cầu của khách như cách họ nói. AI sẽ bóc tách thành thông số
          kỹ thuật có cấu trúc, và bạn sẽ được xem lại trước khi bất cứ thứ gì
          được tạo — lần gọi này không ghi dữ liệu.
        </p>
      </div>

      <AIServiceStatus />

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={locked}
        rows={6}
        placeholder="Ví dụ: Đơn 200 Bình gốm họa tiết sen men lam cao 35cm, yêu cầu nung nhiệt độ cao 1280°C, hoàn thành trong 10 ngày."
        className="resize-none text-sm leading-relaxed"
      />

      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium">
          Hoặc dùng một ví dụ:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example, i) => (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => setDescription(example)}
              className="bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground max-w-full truncate rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50"
              title={example}
            >
              {example.slice(0, 46)}…
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={analyze} disabled={locked} className="gap-2">
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Phân tích với AI
        </Button>

        {result && !busy && (
          <Button
            variant="outline"
            onClick={saveOrder}
            disabled={locked}
            className="gap-2"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Lưu đơn & xem lại
          </Button>
        )}

        {!busy && !result && !failure && (
          <p className="text-muted-foreground text-xs">
            Đơn chỉ được lưu sau khi bạn xem kết quả — AI lỗi không tạo ra rác.
          </p>
        )}
      </div>

      {step >= 0 && (
        <div className="bg-card space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Wand2 className="text-stage-decorating size-3.5" />
            <span className="text-xs font-medium">Pipeline phân tích</span>
            {busy && (
              <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                {(elapsed / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <ol className="space-y-1.5">
            {STEPS.map((s, i) => {
              const done = step > i
              const active = step === i
              return (
                <li
                  key={s.key}
                  className={cn(
                    "flex items-center gap-2 text-xs transition-colors",
                    done
                      ? "text-status-completed"
                      : active
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  )}
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    {done ? (
                      <Check className="size-3.5" />
                    ) : active ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
                    )}
                  </span>
                  <span className="font-mono">{s.label}</span>
                  {active && !reduced && (
                    <motion.span
                      layoutId="step-underline"
                      className="bg-stage-decorating ml-1 h-px flex-1"
                    />
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {failure && (
        <FailurePanel failure={failure} onRetry={analyze} retrying={busy} />
      )}

      {result && (
        <AIExtractionResult
          description={analyzed}
          result={result}
          raw={raw ?? undefined}
        />
      )}
    </div>
  )
}

/**
 * §28 Scenario D — nothing was created, so nothing is lost. The text is still
 * in the textarea and retry is one click away.
 */
function FailurePanel({
  failure,
  onRetry,
  retrying,
}: {
  failure: Failure
  onRetry: () => void
  retrying: boolean
}) {
  const explanation =
    failure.code === "UNKNOWN_ERROR"
      ? null
      : AI_ERROR_MESSAGE_VI[failure.code as AIErrorCode]

  return (
    <div className="border-status-failed/50 bg-status-failed/[0.05] space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="text-status-failed size-4 shrink-0" />
        <span className="text-status-failed font-mono text-xs font-semibold">
          {failure.code}
        </span>
        {failure.status !== null && (
          <span className="text-muted-foreground text-[10px]">
            HTTP {failure.status}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
          className="ml-auto h-6 gap-1.5 text-[11px]"
        >
          {retrying ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          Thử lại
        </Button>
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {explanation ?? failure.message}
        {explanation && failure.message !== explanation && (
          <>
            <br />
            <span className="opacity-80">{failure.message}</span>
          </>
        )}
        <br />
        Không có gì được ghi lại — mô tả vẫn nằm nguyên trong ô nhập.
      </p>

      {failure.issues && failure.issues.length > 0 && (
        <div>
          <p className="text-status-failed text-[11px] font-medium">
            Các trường không khớp schema:
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {failure.issues.map((issue, i) => (
              <li key={i} className="text-status-failed font-mono text-[10px]">
                · {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failure.raw !== null && failure.raw !== undefined && (
        <details>
          <summary className="text-muted-foreground cursor-pointer text-[10px]">
            Xem payload thô mà AI service trả về
          </summary>
          <pre className="bg-background/60 mt-1 max-h-40 overflow-auto rounded border p-2 font-mono text-[10px]">
            {JSON.stringify(failure.raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
