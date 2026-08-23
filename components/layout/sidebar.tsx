"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ClipboardList,
  LayoutGrid,
  Plus,
  Recycle,
  ScrollText,
  Send,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const NAV = [
  { href: "/board", label: "Bảng sản xuất", icon: LayoutGrid },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/rework", label: "Mẻ cần xử lý", icon: Recycle },
  { href: "/events", label: "Nhật ký sự kiện", icon: ScrollText },
  { href: "/notifications", label: "Thông báo", icon: Send },
] as const

/**
 * Collapses to an icon rail rather than disappearing, so navigation stays
 * reachable when the board wants the width. Every menu button carries a
 * `tooltip`, which shadcn reveals only while collapsed.
 *
 * Named AppSidebar because `Sidebar` is shadcn's primitive.
 */
export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Xưởng Gốm — Điều phối sản xuất"
              render={<Link href="/board" />}
            >
              <KilnMark />
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-semibold tracking-tight">
                  Xưởng Gốm
                </span>
                <span className="text-muted-foreground truncate text-[11px]">
                  Điều phối sản xuất
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Tạo đơn hàng"
                  // The one primary action, so it keeps a filled treatment and
                  // still reads as a button at 32px in the icon rail.
                  className="bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground active:bg-primary/85 active:text-primary-foreground"
                  render={<Link href="/orders/new" />}
                >
                  <Plus />
                  <span>Tạo đơn hàng</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Điều hướng</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href ||
                  (href !== "/board" && pathname.startsWith(href))

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={label}
                      render={<Link href={href} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="text-muted-foreground px-2 text-[11px] leading-relaxed group-data-[collapsible=icon]:hidden">
          Dữ liệu đang chạy trên{" "}
          <span className="text-foreground font-medium">mock API</span> nội bộ.
          Đổi <code className="text-[10px]">NEXT_PUBLIC_API_BASE_URL</code> để
          trỏ sang backend thật.
        </p>
      </SidebarFooter>

      {/* Drag/click edge for toggling, alongside the Topbar trigger. */}
      <SidebarRail />
    </Sidebar>
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
