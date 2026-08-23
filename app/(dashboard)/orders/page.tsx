import type { Metadata } from "next"

import { Topbar } from "@/components/layout/topbar"
import { OrderList } from "@/components/orders/order-list"

export const metadata: Metadata = {
  title: "Đơn hàng",
}

export default function OrdersPage() {
  return (
    <>
      <Topbar title="Đơn hàng" />
      <OrderList />
    </>
  )
}
