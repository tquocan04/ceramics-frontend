/**
 * Visual identity per stage: colour token, icon, and the Tailwind classes
 * derived from them.
 *
 * Colours live in app/globals.css as --stage-* tokens so they respond to the
 * theme. Class strings are written out in full rather than interpolated,
 * because Tailwind only sees literal class names at build time.
 */

import {
  Boxes,
  Flame,
  Hand,
  PaintbrushVertical,
  Package,
  ScanSearch,
  Sun,
  type LucideIcon,
} from "lucide-react"

import { STAGE_TYPE, type StageType } from "./enums"

export interface StageTheme {
  /** CSS custom property holding the stage colour. */
  cssVar: string
  icon: LucideIcon
  /** Solid text in the stage colour. */
  text: string
  /** Border in the stage colour. */
  border: string
  /** Left accent bar, used on active cards. */
  accent: string
  /** Low-alpha fill for column headers. */
  tint: string
  /** SVG stroke for the flow connector. */
  stroke: string
  /** Short mnemonic shown in the column index chip. */
  index: number
}

export const STAGE_THEME: Record<StageType, StageTheme> = {
  [STAGE_TYPE.FORMING]: {
    cssVar: "var(--stage-forming)",
    icon: Hand,
    text: "text-stage-forming",
    border: "border-stage-forming",
    accent: "bg-stage-forming",
    tint: "bg-stage-forming/10",
    stroke: "stroke-stage-forming",
    index: 1,
  },
  [STAGE_TYPE.DRYING]: {
    cssVar: "var(--stage-drying)",
    icon: Sun,
    text: "text-stage-drying",
    border: "border-stage-drying",
    accent: "bg-stage-drying",
    tint: "bg-stage-drying/10",
    stroke: "stroke-stage-drying",
    index: 2,
  },
  [STAGE_TYPE.DECORATING]: {
    cssVar: "var(--stage-decorating)",
    icon: PaintbrushVertical,
    text: "text-stage-decorating",
    border: "border-stage-decorating",
    accent: "bg-stage-decorating",
    tint: "bg-stage-decorating/10",
    stroke: "stroke-stage-decorating",
    index: 3,
  },
  [STAGE_TYPE.GLAZING]: {
    cssVar: "var(--stage-glazing)",
    icon: Boxes,
    text: "text-stage-glazing",
    border: "border-stage-glazing",
    accent: "bg-stage-glazing",
    tint: "bg-stage-glazing/10",
    stroke: "stroke-stage-glazing",
    index: 4,
  },
  [STAGE_TYPE.FIRING]: {
    cssVar: "var(--stage-firing)",
    icon: Flame,
    text: "text-stage-firing",
    border: "border-stage-firing",
    accent: "bg-stage-firing",
    tint: "bg-stage-firing/10",
    stroke: "stroke-stage-firing",
    index: 5,
  },
  [STAGE_TYPE.QUALITY_CHECK]: {
    cssVar: "var(--stage-qc)",
    icon: ScanSearch,
    text: "text-stage-qc",
    border: "border-stage-qc",
    accent: "bg-stage-qc",
    tint: "bg-stage-qc/10",
    stroke: "stroke-stage-qc",
    index: 6,
  },
  [STAGE_TYPE.PACKAGING]: {
    cssVar: "var(--stage-packaging)",
    icon: Package,
    text: "text-stage-packaging",
    border: "border-stage-packaging",
    accent: "bg-stage-packaging",
    tint: "bg-stage-packaging/10",
    stroke: "stroke-stage-packaging",
    index: 7,
  },
}

export const CIRCLED_DIGITS = ["①", "②", "③", "④", "⑤", "⑥", "⑦"] as const
