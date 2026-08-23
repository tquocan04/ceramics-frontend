"use client"

/**
 * §29 Screen 2 — natural-language intake.
 *
 * The AI pipeline is shown as four discrete steps rather than a spinner,
 * because "prompt -> LLM -> parse -> validate" is exactly what §6.1 specifies
 * and each of those steps is a place the run can fail.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ApiRequestError } from "@/lib/api/client"
import { analyzeOrder, createOrder } from "@/lib/api/endpoints"
import { cn } from "@/lib/utils"

const EXAMPLES = [
  "Đơn 200 Bình gốm họa tiết sen men lam cao 35cm, yêu cầu nung nhiệt độ cao 1280°C, hoàn thành trong 10 ngày.",
  "Cần 60 chén gốm men trắng họa tiết tre, cao 8cm, nung 1250 độ C, giao trong 21 ngày.",
  "Gấp: 350 đĩa gốm men nâu họa tiết chim hạc cao 4cm, nung 1300°C, cần xong trong 7 ngày.",
]

const STEPS = [
  { key: "prompt", label: "Dựng prompt" },
  { key: "llm", label: "Gọi LLM" },
  { key: "parse", label: "Parse JSON" },
  { key: "validate", label: "Validate schema" },
] as const

export function NewOrderForm() {
  const router = useRouter()
  const reduced = useReducedMotion()

  const [description, setDescription] = useState("")
  const [step, setStep] = useState(-1)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const raw = description.trim()
    if (!raw) {
      toast.error("EMPTY_DESCRIPTION", {
        description: "Mô tả đơn hàng không được để trống.",
      })
      return
    }

    setBusy(true)
    try {
      const order = await createOrder(raw)

      // Walk the step indicator while the request is in flight. Purely
      // presentational — the server does all four regardless.
      for (let i = 0; i < STEPS.length; i++) {
        setStep(i)
        await new Promise((r) => setTimeout(r, 260))
      }

      const { analysis } = await analyzeOrder(order.id)
      setStep(STEPS.length)

      if (analysis.is_valid) {
        toast.success("AI phân tích xong", {
          description: `${order.order_code} sẵn sàng để xem lại và xác nhận.`,
        })
      } else {
        toast.error(analysis.error_code ?? "AI_ANALYSIS_FAILED", {
          description: "Đơn hàng vẫn được giữ lại — bạn có thể thử phân tích lại.",
        })
      }

      router.push(`/orders/${order.id}`)
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError ? e.code : "Không tạo được đơn hàng",
        { description: e instanceof ApiRequestError ? e.message : undefined }
      )
      setStep(-1)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 space-y-5 overflow-auto p-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          Mô tả đơn hàng bằng ngôn ngữ tự nhiên
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Nhập yêu cầu của khách như cách họ nói. AI sẽ bóc tách thành thông số
          kỹ thuật có cấu trúc, và bạn sẽ được xem lại trước khi mẻ sản xuất
          được tạo.
        </p>
      </div>

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy}
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
              disabled={busy}
              onClick={() => setDescription(example)}
              className="bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground max-w-full truncate rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50"
              title={example}
            >
              {example.slice(0, 46)}…
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Phân tích với AI
        </Button>
        {!busy && (
          <p className="text-muted-foreground text-xs">
            Đơn được lưu trước khi gọi AI — AI lỗi không làm mất đơn.
          </p>
        )}
      </div>

      {step >= 0 && (
        <div className="bg-card space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Wand2 className="text-stage-decorating size-3.5" />
            <span className="text-xs font-medium">Pipeline phân tích</span>
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
                  {s.label}
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
    </div>
  )
}
