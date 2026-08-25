"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import {
  FlaskConical,
  Gauge,
  Moon,
  Send,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Sun,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useShell } from "@/components/layout/shell-provider"
import { useStream } from "@/components/layout/stream-provider"
import { getSimConfig, setSim, type SimConfig } from "@/lib/api/endpoints"
import { cn } from "@/lib/utils"

const CONNECTION_COPY = {
  live: { label: "LIVE", className: "text-risk-on-track" },
  connecting: { label: "ĐANG KẾT NỐI", className: "text-risk-at-risk" },
  offline: { label: "MẤT KẾT NỐI", className: "text-risk-overdue" },
} as const

export function Topbar({ title }: { title: string }) {
  const { connection } = useStream()
  const copy = CONNECTION_COPY[connection]

  return (
    <header className="border-border bg-background/80 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur">
      {/* Left of the title, per the shadcn convention — keeps the right-hand
          cluster at its four buttons. Visible at every width, because below md
          the sidebar becomes a Sheet and this is the only way to open it. */}
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="h-4 shrink-0" />

      <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] font-medium tracking-wider",
            copy.className
          )}
          title="Trạng thái kết nối SSE tới /api/events/stream"
        >
          <span className="relative flex size-1.5">
            {connection === "live" && (
              <span className="bg-risk-on-track absolute inline-flex size-full animate-ping rounded-full opacity-75" />
            )}
            <span className="relative inline-flex size-1.5 rounded-full bg-current" />
          </span>
          {copy.label}
        </div>

        <SimulatorControls />
        <ThemeToggle />
        <RailToggle />
      </div>
    </header>
  )
}

/**
 * Fourth and last control. Gated to xl because the rail itself is `hidden
 * xl:flex` — below that there is nothing to toggle, and /events is the way to
 * the feed.
 */
function RailToggle() {
  const { railOpen, toggleRail } = useShell()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="hidden xl:inline-flex"
      onClick={toggleRail}
      title={
        railOpen ? "Ẩn bảng hoạt động realtime" : "Hiện bảng hoạt động realtime"
      }
    >
      {railOpen ? <PanelRightClose /> : <PanelRightOpen />}
      <span className="sr-only">Bật/tắt bảng hoạt động</span>
    </Button>
  )
}

function SimulatorControls() {
  const [config, setConfig] = useState<SimConfig | null>(null)

  useEffect(() => {
    getSimConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  async function send(body: Record<string, unknown>, message?: string) {
    try {
      setConfig(await setSim(body))
      if (message) toast.success(message)
    } catch {
      toast.error("Không đổi được cấu hình mô phỏng")
    }
  }

  const running = config?.simulatorRunning ?? false

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() =>
          send(
            { action: running ? "pause" : "play" },
            running ? "Đã tạm dừng mô phỏng" : "Mô phỏng đang chạy"
          )
        }
        title={running ? "Tạm dừng mô phỏng xưởng" : "Chạy mô phỏng xưởng"}
      >
        {running ? <Pause /> : <Play />}
        <span className="sr-only">Bật/tắt mô phỏng</span>
      </Button>

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon-sm" title="Bảng điều khiển demo">
              <FlaskConical />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 space-y-4">
          <div>
            <div className="text-sm font-medium">Bảng điều khiển demo</div>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Ép các nhánh lỗi trong §28 xảy ra ngay, thay vì phải chờ.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tốc độ mô phỏng</Label>
            <div className="flex gap-1">
              {[0.5, 1, 2, 4].map((speed) => (
                <Button
                  key={speed}
                  size="xs"
                  variant={config?.simulatorSpeed === speed ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => send({ action: "speed", speed })}
                >
                  {speed}×
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Chế độ lỗi AI (Scenario D)</Label>
            <Select
              value={config?.aiFailureMode ?? "NONE"}
              onValueChange={(mode) =>
                send({ action: "ai_failure", mode }, `AI failure mode: ${mode}`)
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">NONE — hoạt động bình thường</SelectItem>
                <SelectItem value="INVALID_JSON">INVALID_JSON</SelectItem>
                <SelectItem value="SCHEMA_INVALID">SCHEMA_INVALID</SelectItem>
                <SelectItem value="TIMEOUT">TIMEOUT</SelectItem>
                <SelectItem value="PROVIDER_ERROR">PROVIDER_ERROR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <Send className="size-3" />
                Gửi Telegram thật (qua backend)
              </Label>
              <Switch
                size="sm"
                checked={config?.telegramEnabled ?? false}
                onCheckedChange={(enabled) =>
                  send(
                    { action: "telegram", enabled },
                    enabled
                      ? "Đang gửi thật vào nhóm Telegram"
                      : "Đã chuyển về gửi mô phỏng"
                  )
                }
              />
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Khi bật, mỗi công đoạn hoàn thành và mỗi sự cố sẽ được đẩy vào
              nhóm Telegram thật qua{" "}
              <span className="font-mono">POST /api/notifications/trigger</span>{" "}
              của backend. Hàng đợi giới hạn ~1 tin mỗi 3,5 giây; cảnh báo được
              ưu tiên gửi trước.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Tỉ lệ lỗi gửi mô phỏng (Scenario E) —{" "}
              {Math.round((config?.notificationFailureRate ?? 0) * 100)}%
            </Label>
            <div className="flex gap-1">
              {[0, 0.5, 1].map((rate) => (
                <Button
                  key={rate}
                  size="xs"
                  variant={
                    config?.notificationFailureRate === rate ? "default" : "outline"
                  }
                  className="flex-1"
                  onClick={() => send({ action: "notify_failure", rate })}
                >
                  {rate * 100}%
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Chỉ áp dụng cho đường gửi mô phỏng, không ảnh hưởng khi bật gửi
              Telegram thật.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => send({ action: "reset" }, "Đã tạo lại dữ liệu demo")}
          >
            <RotateCcw />
            Reset dữ liệu demo
          </Button>

          <p className="text-muted-foreground flex items-start gap-1.5 text-[11px] leading-relaxed">
            <Gauge className="mt-0.5 size-3 shrink-0" />
            Bộ mô phỏng chạy các lệnh y hệt người dùng, nên không thể tạo ra
            trạng thái mà state machine cấm.
          </p>
        </PopoverContent>
      </Popover>
    </>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title="Đổi giao diện sáng/tối"
    >
      {/* Both icons are rendered and CSS picks one from the `dark` class that
          next-themes sets before hydration. No mounted flag, so no flash and
          no server/client markup divergence. */}
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
      <span className="sr-only">Đổi giao diện</span>
    </Button>
  )
}
