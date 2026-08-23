"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ClipboardList,
  LayoutGrid,
  Plus,
  ScrollText,
  Send,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/board", label: "Bảng sản xuất", icon: LayoutGrid },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/events", label: "Nhật ký sự kiện", icon: ScrollText },
  { href: "/notifications", label: "Thông báo", icon: Send },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <KilnMark />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight">
            Xưởng Gốm
          </div>
          <div className="text-muted-foreground truncate text-[11px]">
            Điều phối sản xuất
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Button
          render={<Link href="/orders/new" />}
          // Base UI needs telling that the rendered element is an anchor, not
          // a native <button>.
          nativeButton={false}
          size="sm"
          className="w-full justify-start gap-2"
        >
          <Plus />
          Tạo đơn hàng
        </Button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/board" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="text-muted-foreground border-sidebar-border border-t px-4 py-3 text-[11px] leading-relaxed">
        Dữ liệu đang chạy trên{" "}
        <span className="text-foreground font-medium">mock API</span> nội bộ.
        Đổi <code className="text-[10px]">NEXT_PUBLIC_API_BASE_URL</code> để trỏ
        sang backend thật.
      </div>
    </aside>
  )
}

/** A small kiln/vessel mark, so the shell has an identity without an asset. */
function KilnMark() {
  return (
    <div className="bg-stage-firing/15 ring-stage-firing/30 grid size-8 shrink-0 place-items-center rounded-md ring-1">
      <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden="true">
        <path
          d="M9 3h6l-1 3.2a6.5 6.5 0 0 1 4 6c0 3.9-3.1 6.8-7 6.8s-7-2.9-7-6.8a6.5 6.5 0 0 1 4-6L7 3z"
          className="fill-stage-firing/25 stroke-stage-firing"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 10.5c1.6 1.2 2.2 2.3 1.8 3.4-.3.9-1 1.4-1.8 1.4s-1.5-.5-1.8-1.4c-.4-1.1.2-2.2 1.8-3.4z"
          className="fill-stage-firing"
        />
      </svg>
    </div>
  )
}
