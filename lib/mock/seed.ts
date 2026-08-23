/**
 * Demo data.
 *
 * Batches are driven through the real service layer rather than hand-written
 * into the store, so every seeded batch has a legitimate history: its stages
 * were genuinely started and completed, and its events genuinely fired. That
 * keeps the seeded state reachable by the state machine — nothing on the board
 * exists in a configuration the rules would forbid.
 *
 * Afterwards timestamps are backdated so the activity feed reads like a shift
 * in progress rather than everything happening in the same millisecond.
 */

import "server-only"

import {
  DEFECT_TYPE,
  QC_RESULT,
  STAGE_TYPE,
  type StageType,
} from "@/lib/domain/enums"
import { STAGE_SEQUENCE, stageIndex } from "@/lib/domain/workflow"

import { db, getStages } from "./db"
import {
  analyzeOrder,
  completeStage,
  confirmOrder,
  createOrder,
  failStage,
  startStage,
  submitQC,
} from "./services"

const DAY = 864e5

interface SeedSpec {
  description: string
  /** Stage the batch should end up sitting in. */
  target: StageType
  /** Whether that target stage is left running. */
  running: boolean
  /** Deadline offset in days from now — negative means already overdue. */
  deadlineDays: number
  outcome?: "fail" | "rework"
}

const SPECS: SeedSpec[] = [
  {
    description:
      "Đơn 200 Bình gốm họa tiết sen men lam cao 35cm, yêu cầu nung nhiệt độ cao 1280°C, hoàn thành trong 10 ngày.",
    target: STAGE_TYPE.FIRING,
    running: true,
    deadlineDays: 6,
  },
  {
    description:
      "Cần 60 chén gốm men trắng họa tiết tre, cao 8cm, nung 1250 độ C, giao trong 21 ngày.",
    target: STAGE_TYPE.FORMING,
    running: true,
    deadlineDays: 19,
  },
  {
    description:
      "Làm 120 bát gốm men xanh họa tiết cúc, cao 12cm, nung 1240 độ C, hoàn thành trong 14 ngày.",
    target: STAGE_TYPE.DRYING,
    running: true,
    deadlineDays: 11,
  },
  {
    description:
      "Đặt 80 lọ gốm men rạn họa tiết mây, cao 22cm, nung 1220 độ, thời hạn 18 ngày.",
    target: STAGE_TYPE.DECORATING,
    running: true,
    deadlineDays: 9,
  },
  {
    description:
      "Gấp: 350 đĩa gốm men nâu họa tiết chim hạc cao 4cm, nung 1300°C, cần xong trong 7 ngày.",
    target: STAGE_TYPE.GLAZING,
    running: true,
    deadlineDays: 2,
  },
  {
    description:
      "Đơn 150 ấm gốm men lam họa tiết trúc cao 16cm, nung 1270 độ C, trong 12 ngày.",
    target: STAGE_TYPE.QUALITY_CHECK,
    running: true,
    deadlineDays: 4,
  },
  {
    description:
      "Cần 90 tách gốm men kem họa tiết hoa mai, cao 7cm, nung 1230 độ C, giao sau 16 ngày.",
    target: STAGE_TYPE.PACKAGING,
    running: true,
    deadlineDays: 8,
  },
  {
    description:
      "Đơn 240 bình gốm men ngọc họa tiết rồng cao 40cm, nung 1290°C, hoàn thành trong 9 ngày.",
    target: STAGE_TYPE.FORMING,
    running: false,
    deadlineDays: 9,
  },
  {
    description:
      "Đặt 110 bát gốm men lam họa tiết sóng nước cao 10cm, nung 1260 độ C, trong 11 ngày.",
    target: STAGE_TYPE.GLAZING,
    running: true,
    deadlineDays: 3,
    outcome: "fail",
  },
  {
    description:
      "Đơn 180 đĩa gốm men trắng họa tiết sen cao 5cm, nung 1245 độ C, hoàn thành trong 8 ngày.",
    target: STAGE_TYPE.QUALITY_CHECK,
    running: true,
    deadlineDays: -1,
    outcome: "rework",
  },
]

function advanceTo(
  batchId: string,
  target: StageType,
  running: boolean
): void {
  const targetIndex = stageIndex(target)

  for (let i = 0; i < targetIndex; i++) {
    const stage = STAGE_SEQUENCE[i]
    startStage(batchId, stage)
    if (stage === STAGE_TYPE.QUALITY_CHECK) {
      // The only legal way past QC is a passing report (§8.4 Rule 6).
      const batch = db.batches.get(batchId)!
      submitQC(batchId, {
        inspected_quantity: batch.quantity,
        passed_quantity: batch.quantity,
        defective_quantity: 0,
        defects: [],
        result: QC_RESULT.PASS,
      })
    } else {
      completeStage(batchId, stage)
    }
  }

  if (running) startStage(batchId, target)
}

/**
 * Spread the seeded history backwards over the last ~14 hours so the event
 * feed and the in-stage timers show plausible values.
 */
function backdate(): void {
  const now = Date.now()
  const span = 14 * 36e5
  const n = db.events.length
  if (n === 0) return

  db.events.forEach((event, i) => {
    // Oldest event ~14h ago, newest ~2 minutes ago.
    const t = now - span + (span - 12e4) * (i / Math.max(1, n - 1))
    event.created_at = new Date(t).toISOString()
  })

  const eventTime = new Map<string, string>()
  for (const e of db.events) {
    if (!e.batch_id || !e.stage) continue
    eventTime.set(`${e.batch_id}:${e.stage}:${e.event_type}`, e.created_at)
  }

  for (const batch of db.batches.values()) {
    for (const stage of getStages(batch.id)) {
      const started = eventTime.get(
        `${batch.id}:${stage.stage_type}:STAGE_STARTED`
      )
      const completed = eventTime.get(
        `${batch.id}:${stage.stage_type}:STAGE_COMPLETED`
      )
      if (started && stage.started_at) stage.started_at = started
      if (completed && stage.completed_at) stage.completed_at = completed
    }

    const created = db.events.find(
      (e) => e.batch_id === batch.id && e.event_type === "BATCH_CREATED"
    )
    if (created) batch.created_at = created.created_at
  }

  for (const n of db.notifications) {
    const event = db.events.find((e) => e.id === n.event_id)
    if (event) {
      n.created_at = event.created_at
      if (n.sent_at) n.sent_at = event.created_at
    }
  }
}

export function seedIfEmpty(): void {
  if (db.seeded) return
  db.seeded = true

  // Seed deterministically: no injected AI failures, no dropped notifications.
  const prevAi = db.config.aiFailureMode
  const prevNotify = db.config.notificationFailureRate
  db.config.aiFailureMode = "NONE"
  db.config.notificationFailureRate = 0
  db.config.syncNotifications = true

  try {
    for (const spec of SPECS) {
      const order = createOrder(spec.description)
      const { analysis } = analyzeOrder(order.id)
      if (!analysis.is_valid) continue

      const { batch } = confirmOrder(order.id, {
        deadline: new Date(Date.now() + spec.deadlineDays * DAY).toISOString(),
      })

      if (spec.outcome === "fail") {
        advanceTo(batch.id, spec.target, true)
        failStage(
          batch.id,
          spec.target,
          "Men bị vón cục, nghi do bể men lắng không đều"
        )
        continue
      }

      if (spec.outcome === "rework") {
        advanceTo(batch.id, spec.target, true)
        const defective = Math.round(batch.quantity * 0.09)
        submitQC(batch.id, {
          inspected_quantity: batch.quantity,
          passed_quantity: batch.quantity - defective,
          defective_quantity: defective,
          defects: [
            {
              defect_type: DEFECT_TYPE.GLAZE_CRACK,
              quantity: Math.round(defective * 0.6),
              note: "Nứt men ở phần miệng",
            },
            {
              defect_type: DEFECT_TYPE.DEFORMATION,
              quantity: defective - Math.round(defective * 0.6),
              note: null,
            },
          ],
        })
        continue
      }

      advanceTo(batch.id, spec.target, spec.running)
    }

    // A couple of failed sends so the notifications screen has something to
    // retry on load (§28 Scenario E).
    const sent = db.notifications.filter((n) => n.status === "SENT")
    for (const n of sent.slice(0, 2)) {
      n.status = "FAILED"
      n.error_message = "Telegram API request failed (mock)"
      n.sent_at = null
      n.retry_count = 1
    }

    backdate()
  } finally {
    db.config.aiFailureMode = prevAi
    db.config.notificationFailureRate = prevNotify
    db.config.syncNotifications = false
  }
}
