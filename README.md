# Hệ Thống Điều Phối & Giám Sát Quy Trình Sản Xuất Xưởng Gốm

Frontend for the ceramics manufacturing pipeline — a workflow orchestration system for a pottery
workshop. Orders arrive as free-form Vietnamese text, get parsed into structured production specs,
and once confirmed become a batch that moves through seven sequential stages with a quality-control
branch, a realtime event feed, and alerts that go to a real Telegram group once the backend is
wired up.

```
Đơn hàng (ngôn ngữ tự nhiên)
        ↓  phân tích + validate schema
Xem lại / Xác nhận
        ↓
Mẻ sản xuất  →  FORMING → DRYING → DECORATING → GLAZING → FIRING → QUALITY_CHECK ─┬─ PASS → PACKAGING → COMPLETED
                                                                                  └─ FAIL → REWORK / BLOCKED
```

> [!IMPORTANT]
> **Working branch — `demo/ceremic-manifacture-automation-pipeline`.**
>
> All application code lives on that branch. `main` carries this README and the original
> scaffold only, so cloning and staying on `main` will **not** give you a runnable app.
>
> ```bash
> git clone https://github.com/quanpham8899/de-tai-2-frontend.git
> cd de-tai-2-frontend
> git switch demo/ceremic-manifacture-automation-pipeline
> ```
>
> Every instruction below assumes you are on that branch.

> **This repo currently ships its own mock backend.** Every screen talks HTTP to route handlers
> under `app/api/*` backed by an in-memory store. See [Backend integration](#backend-integration)
> — swapping in a real service is one environment variable.

---

## Requirements

| | Version | Why |
|---|---|---|
| **Node.js** | **≥ 20.9.0** | required by Next.js 16 (`next` declares `engines.node`) |
| **Yarn** | **4.14.1** | pinned in `package.json` via `packageManager`; enabled through Corepack |

No database to provision. Two **optional** companion services unlock the two features the mock
backend cannot fake, and everything else runs without them:

| Service | Needed for | Without it |
|---|---|---|
| **Ceramics AI Service** (FastAPI, `:8000`) | `/orders/new` — the real LLM extraction | the intake screen reports `AI_UNAVAILABLE`; the rest of the app is unaffected |
| **Express backend** (`:5000`) | real Telegram sends — it owns the bot token | notifications stay on the built-in simulated transport |

See [Environment](#environment) and [Telegram notifications](#telegram-notifications).

### Enabling Yarn 4 with Corepack

Corepack ships with Node but is disabled by default. Enable it once per machine:

```bash
corepack enable
```

That is the whole setup. You do **not** need `npm i -g yarn`, and you should not install Yarn
globally — Corepack reads the `packageManager` field in `package.json` and transparently runs
**exactly** Yarn 4.14.1 in this directory, whatever other projects use.

Verify from inside the project:

```bash
node -v   # v20.9.0 or newer
yarn -v   # 4.14.1
```

<details>
<summary>Troubleshooting</summary>

- **`yarn -v` prints 1.22.x** — a globally installed Yarn 1 is shadowing Corepack. Remove it
  (`npm rm -g yarn`) or run `corepack prepare yarn@4.14.1 --activate`.
- **`corepack: command not found`** — your Node build omits it; install with `npm i -g corepack`.
- **Corepack refuses to download** — run `corepack enable --install-directory` somewhere on your
  `PATH`, or set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in CI.
- **Corepack missing on a newer Node** — it is not guaranteed to stay bundled in every
  distribution; `npm i -g corepack` restores it.

</details>

This project uses Yarn's `node-modules` linker (set in `.yarnrc.yml`), not Plug'n'Play — so
`node_modules/` exists and tooling behaves conventionally.

---

## Install and run

```bash
corepack enable          # once per machine
yarn install             # install dependencies
cp .env.example .env.local
yarn dev                 # http://localhost:3000
```

The copied `.env.local` needs no edits to get a running board — every variable has a working
default or is off by design. Edit it when you want the real AI service or real Telegram sends;
both are described under [Environment](#environment).

The app redirects `/` to `/board`. On first request the mock backend **seeds itself** with ten
batches spread across all seven stages — including one `BLOCKED` and one `REWORK_REQUIRED` — and
starts a simulator that advances work every few seconds, so the board is alive without you
clicking anything.

### Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Dev server on port 3000 (Turbopack — the default in Next 16) |
| `yarn build` | Production build |
| `yarn start` | Serve the production build (run `yarn build` first) |
| `yarn lint` | ESLint across the project |
| `npx tsc --noEmit` | Type-check without emitting |

### Environment

Start from the template — every variable is documented inline there too:

```bash
cp .env.example .env.local
```

Nothing is mandatory: with an untouched file the app runs entirely on the mock backend. Each block
below buys you one more real integration.

**Backend (workflow API).**

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | *(empty)* | Empty → every request goes to the mock route handlers in `app/api`. Set it (e.g. `http://localhost:5000`) and the same requests go to the real service instead. See [Backend integration](#backend-integration). |

> Note the port: the Express backend listens on **5000** in dev, not 8080.

**AI service (order intake).** `/orders/new` calls a real FastAPI service; the browser never talks
to it directly, it goes through the same-origin proxy at `app/api/ai/[...path]`.

| Variable | Default | What it does |
|---|---|---|
| `AI_SERVICE_URL` | `http://localhost:8000` | Where the proxy forwards. **Server-side only.** |
| `AI_INTERNAL_API_KEY` | *(empty)* | Sent upstream as `x-internal-api-key`. Server-side only, so it never reaches the browser — that is the whole reason the proxy exists. Leave empty if the service does not require it. |
| `AI_TIMEOUT_MS` | `90000` | Upstream timeout. An extraction is a real LLM call (the reference response reports `latency_ms` 17001), so keep it generous — a short value reports `AI_TIMEOUT` on healthy requests. |
| `NEXT_PUBLIC_AI_SERVICE_URL` | *(empty)* | Debugging escape hatch: set it and the browser bypasses the proxy and calls the service directly. Needs CORS enabled on the FastAPI side, and the internal key is then **not** sent. Leave empty in normal use. |
| `NEXT_PUBLIC_AI_TIMEOUT_MS` | `90000` | Client-side axios timeout in `lib/ai/client.ts`. Rarely worth changing; raise it alongside `AI_TIMEOUT_MS` if your provider is slow. |

The badge on `/orders/new` polls `GET /health` and tells you which of the two routes is live and
which provider/model the service is configured against.

**Telegram.** Full walkthrough in [Telegram notifications](#telegram-notifications).

| Variable | Default | What it does |
|---|---|---|
| `TELEGRAM_NOTIFY_ENABLED` | `false` | Master switch, **off on purpose**. `true` points a running simulation at a real group chat, so it has to be a deliberate act. Also flippable at runtime from the demo panel. |
| `BACKEND_API_BASE_URL` | `http://localhost:5000` | Where the Express backend listens. The frontend posts to `{BACKEND_API_BASE_URL}/api/notifications/trigger`. |
| `TELEGRAM_MIN_INTERVAL_MS` | `3500` | Pacing. Telegram throttles a group at roughly 20 msg/min; 3500 ms leaves headroom at about 17/min. |
| `TELEGRAM_QUEUE_MAX` | `40` | Backpressure ceiling. Past this the oldest *routine* message is dropped and marked `FAILED` in the outbox. Warnings and critical alerts are never dropped. |
| `TELEGRAM_TIMEOUT_MS` | `8000` | Our timeout on the backend call. The backend applies none of its own to the Telegram request. |

**No bot token here.** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` belong to the **Express
backend's** `.env`, never to this frontend — see below.

---

## Screens

| Route | Purpose |
|---|---|
| `/board` | Production board — 7 stage columns with animated flow, KPI strip, pinned REWORK dock |
| `/orders` | Order list, filterable by status |
| `/orders/new` | Natural-language intake + analysis |
| `/orders/[id]` | Review screen: original text ↔ extracted/estimated fields, schema checks, confirm |
| `/batches/[id]` | Batch detail: stage timeline, stage commands, QC form, activity log |
| `/rework` | Full exception queue (`BLOCKED` / `REWORK_REQUIRED`) |
| `/events` | Complete event log |
| `/notifications` | Telegram outbox with retry |

**Board interactions.** Cards advance only through explicit commands — the board looks like a
Kanban but behaves like a pipeline, because the workflow rules forbid skipping stages. Dragging a
card onto the *immediately next* column is accepted; anything else snaps back with the real error
code (`PREVIOUS_STAGE_NOT_COMPLETED`). The arrow only animates after the server authorises a move.

**Chrome.** The left sidebar collapses to an icon rail (trigger at the far left of the header, or
`Ctrl`/`Cmd`+`B`; the state persists in a cookie). The right-hand realtime rail toggles from the
last header button.

---

## Demo controls

The flask icon in the header opens a panel that forces the failure branches to happen on demand
rather than waiting for them:

- **Simulator** — play/pause, speed 0.5×–4×
- **AI failure mode** — `INVALID_JSON`, `SCHEMA_INVALID`, `TIMEOUT`, `PROVIDER_ERROR`
- **Gửi Telegram thật** — the runtime equivalent of `TELEGRAM_NOTIFY_ENABLED`, so you can point the
  demo at a real group chat and back without restarting the dev server
- **Tỉ lệ lỗi gửi mô phỏng** — 0% / 50% / 100%, to show that a failed notification never rolls back
  production state. Applies to the **simulated** transport only; it has no effect while real sends
  are on, because then the verdict comes from Telegram
- **Reset** — regenerate the seeded demo data (also clears the pending Telegram queue)

---

## Telegram notifications

This frontend never talks to Telegram. It posts a composed message to the Express backend, which
owns the bot token and makes the actual call:

```
simulator / workflow event
        ↓  §11.2 filter — only the events worth a phone buzz
outbox row (PENDING)  ──▶  paced queue (lib/mock/telegram.ts, server-only)
        ↓  POST {BACKEND_API_BASE_URL}/api/notifications/trigger
Express backend  ──▶  Telegram group
        ↓  row status comes back
outbox row settles SENT / FAILED  ──SSE──▶  /notifications
```

That `trigger` endpoint sends no CORS headers, which is exactly why the call is made from a Next
server context and never from the browser.

### Setup, in order

1. **Create the bot.** Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → keep the token.
2. **Add the bot to your group** and send one message there so the group shows up in updates.
3. **Get the chat id.** Open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[].message.chat.id`. A group id
   is **negative** (`-1001234567890`) — the leading `-` is part of it, do not drop it.
4. **Put both on the *backend*,** in the Express project's `.env`:

   ```bash
   TELEGRAM_BOT_TOKEN=123456789:AA...
   TELEGRAM_CHAT_ID=-1001234567890
   ```

5. **Start the backend** and confirm it is on the port you expect (dev default `5000`).
6. **Configure this frontend,** in `.env.local`:

   ```bash
   BACKEND_API_BASE_URL=http://localhost:5000
   TELEGRAM_NOTIFY_ENABLED=true
   ```

7. **Restart `yarn dev`.** Or leave `TELEGRAM_NOTIFY_ENABLED=false` and flip the
   **Gửi Telegram thật** switch in the demo panel when you want the chat to light up.

Watch `/notifications` while the simulator runs: rows go `PENDING` → `SENT`, roughly one every
3.5 s.

### What actually gets sent

Deliberately narrow — every event still lands in the audit log and the live rail; this set only
decides what is worth interrupting a manager's phone for. `BATCH_CREATED`, `STAGE_STARTED` and the
low-severity `QC_WARNING` are excluded on purpose: one batch would otherwise generate ~18 messages
crossing the seven công đoạn, and a group is throttled at ~20/min.

| Event | Level | Backend renders |
|---|---|---|
| `STAGE_COMPLETED` | `INFO` | 📢 |
| `BATCH_COMPLETED` | `INFO` | 📢 |
| `REWORK_REQUIRED` | `WARNING` | ⚠️ |
| `DEADLINE_WARNING` | `WARNING` | ⚠️ — fires once per batch, not once per tick |
| `STAGE_FAILED` | `CRITICAL` | 🚨 |
| `QC_CRITICAL` | `CRITICAL` | 🚨 |

Alerts jump the queue ahead of routine traffic: a sự cố sitting behind twenty "stage completed"
messages is a sự cố nobody reads in time. A critical QC failure sends twice on purpose
(`QC_CRITICAL` then `REWORK_REQUIRED`) — the worst case should also be the loudest.

Message bodies are plain text and emoji only. The backend HTML-escapes the body, so any `<b>` we
sent would arrive as literal angle brackets; emphasis comes from emoji, capitals and layout.
Titles must stay free of `&`, `<`, `>` — the backend escapes *then* uppercases, which would turn
`&amp;` into `&AMP;` and get the whole message rejected by Telegram's parser.

### Seeding never reaches the chat

On first boot the mock seeds a shift's worth of history. That replay is explicitly excluded from
real sends, so booting the dev server with the switch on does **not** dump thirty backdated
messages into your group.

### Troubleshooting

A `200` from the backend does not mean Telegram accepted anything — the backend answers `200` with
the outbox row, and that row is the real verdict. The error text on a `FAILED` row in
`/notifications` tells you which side broke:

| Error message on the row | Meaning |
|---|---|
| `Backend chưa cấu hình TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID` | The backend accepted the request but has no credentials — step 4 above. |
| `Không kết nối được backend tại … (backend chưa chạy?)` | `ECONNREFUSED` — the backend is not running, or `BACKEND_API_BASE_URL` points at the wrong port. |
| `Backend không phản hồi trong 8000ms` | Timed out; raise `TELEGRAM_TIMEOUT_MS` or look at the backend. |
| `Backend trả về 4xx/5xx` | The backend rejected the payload. |
| `Bỏ qua do hàng đợi Telegram quá tải` | More than `TELEGRAM_QUEUE_MAX` queued; a routine message was shed. Slow the simulator or raise the ceiling. |
| `Telegram từ chối tin nhắn` | Telegram itself refused — usually a wrong chat id, or the bot was never added to the group. |

Every failed row has a **retry** button. With real sends on, retry answers "queued", not "sent" —
the verdict arrives over the stream a moment later and re-renders the list.

Nothing here can roll back production state (§11.6): no workflow command ever awaits delivery.

---

## Project layout

```
app/
  (dashboard)/          screens, sharing the sidebar + rail shell
  api/                  MOCK BACKEND — delete this when a real one exists
    ai/[...path]/       …except this: a live proxy to the AI service (keeps the key server-side)
lib/
  domain/               enums, entities, state machine, QC + deadline rules — pure, no I/O
  api/                  typed HTTP client + one function per endpoint (§20 envelope)
  ai/                   separate client for the Ceramics AI Service (§28 error codes)
  mock/                 in-memory store, services, event bus, simulator, fake analyzer
    telegram.ts         server-only paced outbound queue → Express backend → Telegram
components/
  board/  batches/  orders/  events/  notifications/  layout/  ui/
hooks/
```

`lib/domain/workflow.ts` is the heart of it: the stage sequence and the transition guards, as a
pure module with no I/O. It is imported by **both** the mock API (to enforce) and the UI (to decide
which buttons are enabled) — the server always remains the authority, and the client copy exists
only so the interface never offers an action that is going to be rejected.

---

## Backend integration

Every request goes through `lib/api/client.ts`, so there is exactly one seam:

```
UI ──fetch──▶ /api/*  (mock route handlers, in-memory store)
   ◀──SSE───  /api/events/stream
```

To switch:

1. Set `NEXT_PUBLIC_API_BASE_URL=https://your-backend` in `.env.local`
2. Delete `app/api/` and `lib/mock/` — **except `app/api/ai/`**, which is not part of the mock
   backend. It is a live proxy to the AI service and stays until the backend grows its own wrapper
   around that service (at which point delete `app/api/ai/` and `lib/ai/` together, and point
   `NEXT_PUBLIC_API_BASE_URL` at the backend instead).

No UI code changes — the mock implements the same endpoints a real service must:

```http
GET  /api/orders                                    POST /api/orders
GET  /api/orders/:id                                POST /api/orders/:id/analyze
POST /api/orders/:id/confirm                        POST /api/orders/:id/cancel

GET  /api/batches                                   GET  /api/batches/:id
POST /api/batches/:id/stages/:stage/start
POST /api/batches/:id/stages/:stage/complete
POST /api/batches/:id/stages/:stage/fail
POST /api/batches/:id/stages/:stage/resolve

GET  /api/batches/:id/qc                            POST /api/batches/:id/qc
GET  /api/batches/:id/events                        GET  /api/events
GET  /api/dashboard/summary                         GET  /api/dashboard/kanban
GET  /api/notifications                             POST /api/notifications/:id/retry

GET  /api/events/stream                             # Server-Sent Events
```

Rejections use a single envelope, which is what lets the UI surface the raw code:

```json
{ "error": { "code": "PREVIOUS_STAGE_NOT_COMPLETED", "message": "…", "details": { } } }
```

`/api/sim` is a demo-only control surface and is **not** part of the contract.

### Note on the analyzer

There are **two** analyzers, and the difference matters when reading the code:

- **`/orders/new` calls the real service.** `lib/ai/endpoints.ts` → the proxy at `app/api/ai/*` →
  `POST /v1/orders/extract` on the FastAPI process. Its response is parsed with zod against the
  service's own schema, and rejections carry the §28 error codes (`AI_TIMEOUT`, `AI_INVALID_JSON`,
  `AI_SCHEMA_INVALID`, `AI_PROVIDER_ERROR`, `AI_UNAVAILABLE`) straight through to the toast. This
  client is deliberately separate from `lib/api/client.ts`: that one speaks the §20 backend
  envelope, this one speaks §28.
- **`lib/mock/ai.ts` does not call a language model.** It backs the simulator's injected orders and
  the demo panel's AI failure modes: fields by regex, estimates by fixed formula, serialised to a
  JSON string so `JSON.parse` and the schema validator downstream are genuinely exercised — which
  is why those failure modes are real code paths rather than simulated states.

---

## Stack

Next.js 16.3.2 (App Router) · React 19.2 · TypeScript · Tailwind CSS v4 ·
shadcn/ui on Base UI · Motion · Sonner · next-themes

A few Next 16 specifics worth knowing before editing: `params`/`searchParams` are Promises,
`error.tsx` takes `retry` (not `reset`), `fetch` is uncached by default, and Turbopack is the
default bundler. The version-specific docs are vendored at `node_modules/next/dist/docs/` — see
`AGENTS.md`.
