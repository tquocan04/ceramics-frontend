"use client"

/**
 * The animated rail between two stage columns.
 *
 * Three states, and the distinction matters for what the board communicates:
 *
 *   idle    — a thin, quiet line. Nothing is moving here.
 *   flowing — dashes stream toward the next stage, because work upstream is
 *             actually running. Intensity scales with how much.
 *   firing  — a bright packet runs the rail once, fired the moment a handoff
 *             is authorized by the server.
 *
 * The dash animation is a CSS keyframe rather than a JS loop: it runs on the
 * compositor and costs nothing even with seven rails on screen.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import type { StageType } from "@/lib/domain/enums"
import { STAGE_THEME } from "@/lib/domain/stage-theme"
import { cn } from "@/lib/utils"

interface Props {
  from: StageType
  to: StageType
  /** How many batches are actively running in the upstream column. */
  intensity: number
  /** Bumped when a handoff happens on this rail; fires the packet. */
  pulseKey: number | null
}

export function FlowConnector({ from, to, intensity, pulseKey }: Props) {
  const reduced = useReducedMotion()
  const fromTheme = STAGE_THEME[from]
  const toTheme = STAGE_THEME[to]

  const flowing = intensity > 0
  const gradientId = `flow-${from}-${to}`

  return (
    <div
      className="relative flex w-10 shrink-0 items-center self-stretch pt-11"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 24"
        preserveAspectRatio="none"
        className="h-6 w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={fromTheme.cssVar} />
            <stop offset="100%" stopColor={toTheme.cssVar} />
          </linearGradient>
        </defs>

        {/* Base rail — always present, so the pipeline reads as connected even
            when nothing is moving. */}
        <line
          x1="2"
          y1="12"
          x2="30"
          y2="12"
          stroke={`url(#${gradientId})`}
          strokeWidth={flowing ? 2 : 1.25}
          strokeLinecap="round"
          className={cn("transition-all", flowing ? "opacity-70" : "opacity-25")}
        />

        {/* Streaming dashes, only while upstream work is live. */}
        {flowing && !reduced && (
          <line
            x1="2"
            y1="12"
            x2="30"
            y2="12"
            stroke={`url(#${gradientId})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="3 5"
            className="animate-flow-dash"
            style={{
              opacity: Math.min(1, 0.45 + intensity * 0.25),
            }}
          />
        )}

        {/* Arrowhead */}
        <path
          d="M29 8.5 L35 12 L29 15.5 Z"
          fill={toTheme.cssVar}
          className={cn("transition-opacity", flowing ? "opacity-90" : "opacity-30")}
        />

        {/* The handoff packet: one bright dot travelling the rail. */}
        <AnimatePresence>
          {pulseKey !== null && !reduced && (
            <motion.circle
              key={pulseKey}
              r="3.5"
              cy="12"
              fill={toTheme.cssVar}
              initial={{ cx: 2, opacity: 0, scale: 0.4 }}
              animate={{ cx: 33, opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1, 0.6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 5px currentColor)" }}
            />
          )}
        </AnimatePresence>
      </svg>
    </div>
  )
}

/**
 * The fork after QC (§8.4 Rule 6): PASS continues to packaging, FAIL curves
 * away to the rework tray. Drawn as a real branch so the exception path is
 * visible on the board rather than implied.
 */
export function QCFork({
  intensity,
  pulseKey,
  failPulseKey,
}: {
  intensity: number
  pulseKey: number | null
  failPulseKey: number | null
}) {
  const reduced = useReducedMotion()
  const pass = STAGE_THEME.PACKAGING
  const flowing = intensity > 0

  return (
    <div
      className="relative flex w-10 shrink-0 items-start self-stretch pt-11"
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 90" preserveAspectRatio="none" className="h-24 w-full overflow-visible">
        {/* PASS — straight through to packaging */}
        <line
          x1="2"
          y1="12"
          x2="30"
          y2="12"
          stroke={pass.cssVar}
          strokeWidth={flowing ? 2 : 1.25}
          strokeLinecap="round"
          className={cn("transition-all", flowing ? "opacity-70" : "opacity-25")}
        />
        {flowing && !reduced && (
          <line
            x1="2"
            y1="12"
            x2="30"
            y2="12"
            stroke={pass.cssVar}
            strokeWidth="2"
            strokeDasharray="3 5"
            strokeLinecap="round"
            className="animate-flow-dash opacity-80"
          />
        )}
        <path d="M29 8.5 L35 12 L29 15.5 Z" fill={pass.cssVar} className={flowing ? "opacity-90" : "opacity-30"} />
        <text x="4" y="7" className="fill-stage-packaging text-[7px] font-medium">
          PASS
        </text>

        {/* FAIL — curves down and away toward the rework tray */}
        <path
          d="M8 14 C 8 44, 8 52, 20 62 L 20 78"
          fill="none"
          stroke="var(--status-rework)"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeDasharray="2 4"
          className="opacity-40"
        />
        <path
          d="M17 74 L20 80 L23 74 Z"
          fill="var(--status-rework)"
          className="opacity-50"
        />
        <text x="23" y="52" className="fill-status-rework text-[7px] font-medium">
          FAIL
        </text>

        <AnimatePresence>
          {pulseKey !== null && !reduced && (
            <motion.circle
              key={`pass-${pulseKey}`}
              r="3.5"
              cy="12"
              fill={pass.cssVar}
              initial={{ cx: 2, opacity: 0 }}
              animate={{ cx: 33, opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 5px currentColor)" }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {failPulseKey !== null && !reduced && (
            <motion.circle
              key={`fail-${failPulseKey}`}
              r="3.5"
              fill="var(--status-rework)"
              initial={{ opacity: 0, offsetDistance: "0%" }}
              animate={{ opacity: [0, 1, 1, 0], offsetDistance: "100%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: "easeInOut" }}
              style={{
                offsetPath: 'path("M8 14 C 8 44, 8 52, 20 62 L 20 78")',
                filter: "drop-shadow(0 0 5px currentColor)",
              }}
            />
          )}
        </AnimatePresence>
      </svg>
    </div>
  )
}
