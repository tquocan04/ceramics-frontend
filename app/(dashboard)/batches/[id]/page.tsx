import type { Metadata } from "next"

import { BatchDetail } from "@/components/batches/batch-detail"
import { Topbar } from "@/components/layout/topbar"

export const metadata: Metadata = {
  title: "Chi tiết mẻ sản xuất",
}

export default async function BatchDetailPage(
  props: PageProps<"/batches/[id]">
) {
  const { id } = await props.params
  return (
    <>
      <Topbar title={`Mẻ ${decodeURIComponent(id)}`} />
      <BatchDetail batchId={id} />
    </>
  )
}
