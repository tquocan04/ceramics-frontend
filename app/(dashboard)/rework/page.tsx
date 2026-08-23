import type { Metadata } from "next"

import { ReworkQueue } from "@/components/batches/rework-queue"
import { Topbar } from "@/components/layout/topbar"

export const metadata: Metadata = {
  title: "Mẻ cần xử lý",
}

export default function ReworkPage() {
  return (
    <>
      <Topbar title="Khay REWORK / BLOCKED" />
      <ReworkQueue />
    </>
  )
}
