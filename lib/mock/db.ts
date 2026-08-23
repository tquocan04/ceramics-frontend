/**
 * In-memory store standing in for the database.
 *
 * Pinned to globalThis so it survives Turbopack HMR in dev — otherwise every
 * edit would reset the demo mid-recording.
 *
 * Server-only. Never import this from a Client Component; go through
 * /api/* instead, which is the seam the real backend will replace.
 */

import "server-only"

import type {
  AIAnalysis,
  Notification,
  ProductionBatch,
  ProductionOrder,
  ProductionStage,
  QCDefect,
  QCReport,
  WorkflowEvent,
} from "@/lib/domain/types"

/** Failure modes the mock AI can be forced into, to demo §28 Scenario D. */
export type AIFailureMode =
  | "NONE"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_JSON"
  | "SCHEMA_INVALID"

export interface MockConfig {
  /** Forced AI failure for the next analysis. */
  aiFailureMode: AIFailureMode
  /** 0..1 — probability a Telegram send fails, for §28 Scenario E. */
  notificationFailureRate: number
  /** Whether the factory simulator is advancing batches. */
  simulatorRunning: boolean
  /** Simulator tick multiplier. */
  simulatorSpeed: number
  /**
   * Deliver notifications synchronously instead of on the next tick. Used
   * only while seeding, so the seeded outbox is settled before we backdate it.
   */
  syncNotifications: boolean
}

export interface Db {
  orders: Map<string, ProductionOrder>
  analyses: Map<string, AIAnalysis>
  batches: Map<string, ProductionBatch>
  /** batch_id -> stages, kept sorted by sequence */
  stages: Map<string, ProductionStage[]>
  /** batch_id -> QC reports, newest last */
  qcReports: Map<string, QCReport[]>
  /** qc_report_id -> defects */
  qcDefects: Map<string, QCDefect[]>
  /** Append-only, newest last (§12 immutable audit trail) */
  events: WorkflowEvent[]
  notifications: Notification[]
  counters: { order: number; batch: number; entity: number }
  config: MockConfig
  seeded: boolean
}

function createDb(): Db {
  return {
    orders: new Map(),
    analyses: new Map(),
    batches: new Map(),
    stages: new Map(),
    qcReports: new Map(),
    qcDefects: new Map(),
    events: [],
    notifications: [],
    counters: { order: 0, batch: 0, entity: 0 },
    config: {
      aiFailureMode: "NONE",
      notificationFailureRate: 0,
      simulatorRunning: true,
      simulatorSpeed: 1,
      syncNotifications: false,
    },
    seeded: false,
  }
}

const GLOBAL_KEY = Symbol.for("ceramics.mock.db")

type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: Db }

const g = globalThis as GlobalWithDb

export const db: Db = (g[GLOBAL_KEY] ??= createDb())

/** Wipes everything, including the seeded flag — used by POST /api/sim reset. */
export function resetDb(): void {
  const fresh = createDb()
  Object.assign(db, fresh)
}

/* ── Id helpers ───────────────────────────────────────────────────────── */

export function nextId(prefix: string): string {
  db.counters.entity += 1
  return `${prefix}_${db.counters.entity.toString().padStart(6, "0")}`
}

/** ORD-2026-001 */
export function nextOrderCode(now: Date): string {
  db.counters.order += 1
  return `ORD-${now.getFullYear()}-${db.counters.order.toString().padStart(3, "0")}`
}

/** GOM-0088 */
export function nextBatchCode(): string {
  db.counters.batch += 1
  return `GOM-${db.counters.batch.toString().padStart(4, "0")}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

/* ── Convenience accessors ────────────────────────────────────────────── */

export function getStages(batchId: string): ProductionStage[] {
  return db.stages.get(batchId) ?? []
}

export function getQCReports(batchId: string): QCReport[] {
  return db.qcReports.get(batchId) ?? []
}

export function getDefects(reportId: string): QCDefect[] {
  return db.qcDefects.get(reportId) ?? []
}
