"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Plus, Search } from "lucide-react"

import { OrderStatusChip } from "@/components/batches/status-chip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useStream } from "@/components/layout/stream-provider"
import { listOrders } from "@/lib/api/endpoints"
import { ORDER_STATUS, type OrderStatus } from "@/lib/domain/enums"
import { ORDER_STATUS_LABEL } from "@/lib/domain/labels"
import type { ProductionOrder } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const FILTERS: Array<{ value: OrderStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: ORDER_STATUS.DRAFT, label: "Nháp" },
  { value: ORDER_STATUS.PENDING_CONFIRMATION, label: "Chờ xác nhận" },
  { value: ORDER_STATUS.AI_ANALYSIS_FAILED, label: "AI lỗi" },
  { value: ORDER_STATUS.IN_PRODUCTION, label: "Đang sản xuất" },
  { value: ORDER_STATUS.COMPLETED, label: "Hoàn thành" },
]

export function OrderList() {
  const { revision } = useStream()
  const [orders, setOrders] = useState<ProductionOrder[] | null>(null)
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL")
  const [query, setQuery] = useState("")

  const load = useCallback(() => {
    listOrders()
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]))
  }, [])

  useEffect(() => {
    load()
  }, [load, revision])

  const visible = useMemo(() => {
    if (!orders) return []
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter !== "ALL" && o.status !== filter) return false
      if (!q) return true
      return (
        o.order_code.toLowerCase().includes(q) ||
        o.raw_description.toLowerCase().includes(q)
      )
    })
  }, [orders, filter, query])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders ?? []) {
      map.set(o.status, (map.get(o.status) ?? 0) + 1)
    }
    return map
  }, [orders])

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo mã đơn hoặc mô tả…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button render={<Link href="/orders/new" />} nativeButton={false} size="sm" className="gap-1.5">
          <Plus />
          Tạo đơn hàng
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count =
            f.value === "ALL" ? (orders?.length ?? 0) : (counts.get(f.value) ?? 0)
          return (
            <Button
              key={f.value}
              size="xs"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
              className="gap-1.5"
            >
              {f.label}
              <span className="font-mono text-[10px] opacity-70">{count}</span>
            </Button>
          )
        })}
      </div>

      {orders === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Không có đơn hàng nào khớp bộ lọc.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className={cn(
                  "bg-card hover:border-foreground/20 group flex items-center gap-3 rounded-lg border p-3 transition-colors"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">
                      {order.order_code}
                    </span>
                    <OrderStatusChip status={order.status} />
                    <span className="text-muted-foreground text-[11px]">
                      {ORDER_STATUS_LABEL[order.status]}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                    {order.raw_description}
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
