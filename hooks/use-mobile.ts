import * as React from "react"

const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * Rewritten from the shadcn default, which seeded its state with a synchronous
 * setState inside an effect — that trips react-hooks/set-state-in-effect and
 * costs an extra render. useSyncExternalStore is the built-in answer for
 * reading from a browser API like this, and it takes an explicit server
 * snapshot so SSR renders the desktop layout rather than `undefined`.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
