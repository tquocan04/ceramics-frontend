import { EventRail } from "@/components/events/event-rail"
import { Sidebar } from "@/components/layout/sidebar"
import { ShellProvider } from "@/components/layout/shell-provider"
import { StreamProvider } from "@/components/layout/stream-provider"

/**
 * The dashboard shell. A Server Component: only the pieces that genuinely need
 * interactivity (nav highlighting, the SSE connection, the event rail) are
 * Client Components, per the Next 16 server/client composition guidance.
 */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <StreamProvider>
      {/* ShellProvider sits inside, so both the Topbar each page renders and
          the rail itself can read the collapse state. */}
      <ShellProvider>
        {/* h-full, not h-svh: a percentage of body's definite height can never
            exceed its parent, where a viewport unit does not subtract a classic
            scrollbar and ends up fighting one. */}
        <div className="flex h-full overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          <EventRail />
        </div>
      </ShellProvider>
    </StreamProvider>
  )
}
