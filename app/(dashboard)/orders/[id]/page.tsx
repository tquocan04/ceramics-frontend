import type { Metadata } from "next"

import { Topbar } from "@/components/layout/topbar"
import { AIReview } from "@/components/orders/ai-review"

export const metadata: Metadata = {
  title: "Xem lại kết quả AI",
}

export default async function OrderDetailPage(
  props: PageProps<"/orders/[id]">
) {
  // params is a Promise in Next 16 — synchronous access was removed.
  const { id } = await props.params
  return (
    <>
      <Topbar title="Xem lại kết quả AI" />
      <AIReview orderId={id} />
    </>
  )
}
