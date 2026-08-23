import type { Metadata } from "next"

import { FlowBoard } from "@/components/board/flow-board"
import { Topbar } from "@/components/layout/topbar"

export const metadata: Metadata = {
  title: "Bảng sản xuất",
}

export default function BoardPage() {
  return (
    <>
      <Topbar title="Bảng sản xuất — 7 công đoạn" />
      <FlowBoard />
    </>
  )
}
