import { cookies } from "next/headers"

import { EventRail } from "@/components/events/event-rail"
import { AppSidebar } from "@/components/layout/sidebar"
import { ShellProvider } from "@/components/layout/shell-provider"
import { StreamProvider } from "@/components/layout/stream-provider"
import { SidebarProvider } from "@/components/ui/sidebar"

/**
 * The dashboard shell. A Server Component: only the pieces that genuinely need
 * interactivity (nav highlighting, the SSE connection, the event rail) are
 * Client Components, per the Next 16 server/client composition guidance.
 *
 * Two independent chrome providers: SidebarProvider owns the left nav (with its
 * own cookie persistence and Ctrl/Cmd+B shortcut), ShellProvider owns the right
 * event rail.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // cookies() is async in Next 16. Reading the state here rather than on the
  // client means a collapsed sidebar renders collapsed, with no flash.
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <StreamProvider>
      <ShellProvider>
        <SidebarProvider
          defaultOpen={defaultOpen}
          // SidebarProvider ships `min-h-svh w-full`. A viewport unit does not
          // subtract a classic scrollbar, which is exactly what produced the
          // document-level double scrollbar before — so pin it to the parent's
          // definite height instead and keep the shell non-scrolling.
          className="h-full min-h-0 overflow-hidden"
          style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
        >
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          <EventRail />
        </SidebarProvider>
      </ShellProvider>
    </StreamProvider>
  )
}
