import { EventRail } from "@/components/events/event-rail"
import { Sidebar } from "@/components/layout/sidebar"
import { StreamProvider } from "@/components/layout/stream-provider"

/**
 * The dashboard shell. A Server Component: only the pieces that genuinely need
 * interactivity (nav highlighting, the SSE connection, the event rail) are
 * Client Components, per the Next 16 server/client composition guidance.
 */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <StreamProvider>
      <div className="flex h-svh overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        <EventRail />
      </div>
    </StreamProvider>
  )
}
