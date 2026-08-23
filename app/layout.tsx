import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import { ThemeProvider } from "@/components/layout/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

import "./globals.css"

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-sans" })

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Xưởng Gốm — Điều phối sản xuất",
    template: "%s · Xưởng Gốm",
  },
  description:
    "Hệ thống điều phối và giám sát quy trình sản xuất gốm: phân tích đơn hàng bằng AI, workflow 7 công đoạn, kiểm định chất lượng và cảnh báo realtime.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", inter.variable, geistMono.variable)}
    >
      {/* A definite height plus overflow-hidden makes the document itself
          incapable of scrolling: the viewport is the frame, and scrolling
          happens inside the panes. Safe while every route lives in the
          dashboard shell — revisit if a scrolling page is added outside it. */}
      <body className="bg-background text-foreground h-full overflow-hidden font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
