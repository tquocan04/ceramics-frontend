"use client"

/**
 * §10 / §29 Screen 5 — the QC form.
 *
 * The arithmetic rule from §22 (passed + defective == inspected) is checked
 * live so the operator sees the mismatch before submitting, and the defect
 * rate is shown against the 5% threshold as it is typed. The server re-runs
 * exactly the same validation — this is convenience, not the enforcement.
 */

import { useMemo, useState } from "react"
import { Loader2, Plus, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiRequestError } from "@/lib/api/client"
import { submitQC } from "@/lib/api/endpoints"
import { DEFECT_TYPE, QC_RESULT, type DefectType, type QCResult } from "@/lib/domain/enums"
import { DEFECT_TYPE_LABEL, QC_RESULT_LABEL } from "@/lib/domain/labels"
import {
  DEFECT_RATE_PASS_THRESHOLD,
  formatRate,
  recommendedResult,
  severityFor,
} from "@/lib/domain/qc"
import { cn } from "@/lib/utils"

interface DefectRow {
  id: number
  defect_type: DefectType
  quantity: string
  note: string
}

export function QCForm({
  batchCode,
  quantity,
  onSubmitted,
}: {
  batchCode: string
  quantity: number
  onSubmitted: () => void
}) {
  const [inspected, setInspected] = useState(String(quantity))
  const [defective, setDefective] = useState("0")
  const [note, setNote] = useState("")
  const [override, setOverride] = useState<QCResult | "AUTO">("AUTO")
  const [rows, setRows] = useState<DefectRow[]>([])
  const [busy, setBusy] = useState(false)
  const [nextId, setNextId] = useState(1)

  const inspectedN = Number(inspected) || 0
  const defectiveN = Number(defective) || 0
  const passedN = inspectedN - defectiveN

  const declared = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)

  const rate = inspectedN > 0 ? defectiveN / inspectedN : 0
  const severity = severityFor(rate)
  const recommended = recommendedResult(rate)

  const errors = useMemo(() => {
    const list: string[] = []
    if (inspectedN <= 0) list.push("inspected_quantity phải lớn hơn 0")
    if (defectiveN < 0) list.push("defective_quantity không được âm")
    if (passedN < 0)
      list.push("passed_quantity âm — số lỗi lớn hơn số kiểm tra")
    if (rows.length > 0 && declared !== defectiveN)
      list.push(
        `Tổng số lỗi khai báo (${declared}) phải bằng defective_quantity (${defectiveN})`
      )
    return list
  }, [inspectedN, defectiveN, passedN, rows.length, declared])

  async function submit() {
    if (errors.length > 0) return

    setBusy(true)
    try {
      const r = await submitQC(batchCode, {
        inspected_quantity: inspectedN,
        passed_quantity: passedN,
        defective_quantity: defectiveN,
        defects: rows
          .filter((row) => Number(row.quantity) > 0)
          .map((row) => ({
            defect_type: row.defect_type,
            quantity: Number(row.quantity),
            note: row.note || null,
          })),
        result: override === "AUTO" ? undefined : override,
        note: note || null,
      })

      if (r.report.result === QC_RESULT.PASS) {
        toast.success(`QC đạt — ${formatRate(r.report.defect_rate)}`, {
          description: "Mẻ chuyển sang công đoạn Đóng gói.",
        })
      } else {
        toast.error(`QC không đạt — ${formatRate(r.report.defect_rate)}`, {
          description: `Mẻ chuyển sang ${r.batch.status}. Đã gửi cảnh báo.`,
        })
      }
      onSubmitted()
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.code : "Không gửi được QC", {
        description: e instanceof ApiRequestError ? e.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Đã kiểm tra" code="inspected_quantity">
          <Input
            type="number"
            value={inspected}
            onChange={(e) => setInspected(e.target.value)}
            className="h-8 text-sm tabular-nums"
          />
        </Field>
        <Field label="Số lỗi" code="defective_quantity">
          <Input
            type="number"
            value={defective}
            onChange={(e) => setDefective(e.target.value)}
            className="h-8 text-sm tabular-nums"
          />
        </Field>
        <Field label="Đạt" code="passed_quantity (tự tính)">
          <div
            className={cn(
              "flex h-8 items-center rounded-md border px-2.5 text-sm tabular-nums",
              passedN < 0 ? "border-destructive text-destructive" : "bg-muted/40"
            )}
          >
            {passedN}
          </div>
        </Field>
      </div>

      {/* Defect rate meter against the threshold */}
      <div className="bg-card rounded-lg border p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-[11px]">
            Defect rate — ngưỡng đạt ≤ {formatRate(DEFECT_RATE_PASS_THRESHOLD)}
          </span>
          <span
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              rate <= DEFECT_RATE_PASS_THRESHOLD
                ? "text-risk-on-track"
                : "text-status-rework"
            )}
          >
            {formatRate(rate)}
          </span>
        </div>

        <div className="bg-muted relative mt-2 h-2 overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              rate <= DEFECT_RATE_PASS_THRESHOLD
                ? "bg-risk-on-track"
                : "bg-status-rework"
            )}
            style={{ width: `${Math.min(100, rate * 100 * 4)}%` }}
          />
          {/* Threshold marker at 5%, on a 25% full-scale axis */}
          <span
            className="bg-foreground/60 absolute inset-y-0 w-px"
            style={{ left: `${DEFECT_RATE_PASS_THRESHOLD * 100 * 4}%` }}
            title={`Ngưỡng ${formatRate(DEFECT_RATE_PASS_THRESHOLD)}`}
          />
        </div>

        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[10px]">
          <span>
            Severity: <span className="font-mono">{severity}</span>
          </span>
          <span className="ml-auto">
            Hệ thống đề xuất: <span className="font-mono">{recommended}</span>
          </span>
        </div>
      </div>

      {/* Defect breakdown */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Phân loại lỗi</Label>
          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
            {declared}/{defectiveN}
          </span>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto gap-1"
            onClick={() => {
              setRows((r) => [
                ...r,
                {
                  id: nextId,
                  defect_type: DEFECT_TYPE.GLAZE_CRACK,
                  quantity: "",
                  note: "",
                },
              ])
              setNextId((n) => n + 1)
            }}
          >
            <Plus />
            Thêm loại lỗi
          </Button>
        </div>

        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <Select
              value={row.defect_type}
              onValueChange={(v) =>
                setRows((rs) =>
                  rs.map((r) =>
                    r.id === row.id ? { ...r, defect_type: v as DefectType } : r
                  )
                )
              }
            >
              <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(DEFECT_TYPE).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEFECT_TYPE_LABEL[d]} · {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={row.quantity}
              placeholder="SL"
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((r) =>
                    r.id === row.id ? { ...r, quantity: e.target.value } : r
                  )
                )
              }
              className="h-8 w-20 text-sm tabular-nums"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Kết luận</Label>
          <Select
            value={override}
            onValueChange={(v) => setOverride(v as QCResult | "AUTO")}
          >
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO">
                Tự động theo ngưỡng ({recommended})
              </SelectItem>
              {Object.values(QC_RESULT).map((r) => (
                <SelectItem key={r} value={r}>
                  {QC_RESULT_LABEL[r]} · {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ghi chú</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={1}
            className="min-h-8 resize-none text-sm"
            placeholder="Tuỳ chọn…"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="border-destructive/40 bg-destructive/5 space-y-0.5 rounded-md border p-2">
          {errors.map((e) => (
            <li
              key={e}
              className="text-destructive flex items-center gap-1.5 text-[11px]"
            >
              <TriangleAlert className="size-3 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}

      <Button
        onClick={submit}
        disabled={busy || errors.length > 0}
        className="w-full gap-2"
      >
        {busy && <Loader2 className="animate-spin" />}
        Nộp báo cáo QC
      </Button>
    </div>
  )
}

function Field({
  label,
  code,
  children,
}: {
  label: string
  code: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      <p className="text-muted-foreground font-mono text-[9px]">{code}</p>
    </div>
  )
}
