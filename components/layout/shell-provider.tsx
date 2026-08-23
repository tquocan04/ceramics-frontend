"use client"

/**
 * Shell chrome state shared between the Topbar (rendered by each page) and the
 * dashboard layout that owns the event rail.
 *
 * Kept separate from StreamProvider, which is about the SSE connection.
 *
 * State is in-memory and resets on reload. Persisting it would mean reading
 * localStorage during render, which diverges from what the server rendered —
 * not worth a hydration workaround for a toggle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

interface ShellContextValue {
  railOpen: boolean
  toggleRail: () => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [railOpen, setRailOpen] = useState(true)

  const toggleRail = useCallback(() => setRailOpen((open) => !open), [])

  const value = useMemo(
    () => ({ railOpen, toggleRail }),
    [railOpen, toggleRail]
  )

  return <ShellContext value={value}>{children}</ShellContext>
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) {
    throw new Error("useShell must be used inside <ShellProvider>")
  }
  return ctx
}
