import type { Metadata } from "next"

import { EventLog } from "@/components/events/event-log"
import { Topbar } from "@/components/layout/topbar"

export const metadata: Metadata = {
  title: "Nhật ký sự kiện",
}

export default function EventsPage() {
  return (
    <>
      <Topbar title="Nhật ký sự kiện" />
      <EventLog />
    </>
  )
}
