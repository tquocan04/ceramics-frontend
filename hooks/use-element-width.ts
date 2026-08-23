"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Observes an element's content-box width.
 *
 * The first measurement is taken inside the ResizeObserver callback rather than
 * the effect body — the observer fires immediately on observe, so we get the
 * width just as early while staying clear of react-hooks/set-state-in-effect.
 *
 * Returns 0 until measured; callers should render a sensible default for that
 * first frame.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const next = entry.contentRect.width
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
