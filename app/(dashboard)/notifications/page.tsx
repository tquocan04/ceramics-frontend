import type { Metadata } from "next"

import { Topbar } from "@/components/layout/topbar"
import { NotificationOutbox } from "@/components/notifications/notification-outbox"

export const metadata: Metadata = {
  title: "Thông báo",
}

export default function NotificationsPage() {
  return (
    <>
      <Topbar title="Thông báo Telegram" />
      <NotificationOutbox />
    </>
  )
}
