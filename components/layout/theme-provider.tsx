"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ComponentProps } from "react"

/**
 * next-themes must be a Client Component, and per the Next 16 docs on
 * server/client composition it is rendered as deep as possible — it wraps
 * {children} inside <body>, not the whole document.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
