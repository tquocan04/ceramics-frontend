import type { Metadata } from "next"

import { Topbar } from "@/components/layout/topbar"
import { NewOrderForm } from "@/components/orders/new-order-form"

export const metadata: Metadata = {
  title: "Tạo đơn hàng",
}

export default function NewOrderPage() {
  return (
    <>
      <Topbar title="Tạo đơn hàng mới" />
      <NewOrderForm />
    </>
  )
}
