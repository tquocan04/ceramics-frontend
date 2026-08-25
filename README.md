# Ceramics Pipeline — Frontend

Frontend for the ceramics manufacturing pipeline — a workflow orchestration system for a pottery
workshop. Orders arrive as free-form Vietnamese text, get parsed into structured production specs,
and once confirmed become a batch that moves through seven sequential stages with a quality-control
branch, a realtime event feed and Telegram-style alerts.

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
> git clone https://github.com/tquocan04/ceramics-frontend.git
> cd ceramics-frontend
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

No database, no API keys, nothing else to provision.

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

One variable, documented in `.env.example`:

```bash
# Empty  → use the built-in mock backend at app/api
# Set    → point every request at a real backend instead
NEXT_PUBLIC_API_BASE_URL=
```

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
- **Telegram failure rate** — 0% / 50% / 100%, to show that a failed notification never rolls back
  production state
- **Reset** — regenerate the seeded demo data

---

## Project layout

```
app/
  (dashboard)/          screens, sharing the sidebar + rail shell
  api/                  MOCK BACKEND — delete this when a real one exists
lib/
  domain/               enums, entities, state machine, QC + deadline rules — pure, no I/O
  api/                  typed HTTP client + one function per endpoint
  mock/                 in-memory store, services, event bus, simulator, fake analyzer
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
2. Delete `app/api/` and `lib/mock/`

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

`lib/mock/ai.ts` does **not** call a language model. It extracts fields with regexes and derives
estimates with fixed formulas, then serialises the result to a JSON string so that `JSON.parse` and
the schema validator downstream are genuinely exercised — which is why the AI failure modes are
real code paths rather than simulated states. To use a real provider, replace the body of
`callProvider()` and return its raw text; everything downstream already expects untrusted output.

---

## Stack

Next.js 16.3.2 (App Router) · React 19.2 · TypeScript · Tailwind CSS v4 ·
shadcn/ui on Base UI · Motion · Sonner · next-themes

A few Next 16 specifics worth knowing before editing: `params`/`searchParams` are Promises,
`error.tsx` takes `retry` (not `reset`), `fetch` is uncached by default, and Turbopack is the
default bundler. The version-specific docs are vendored at `node_modules/next/dist/docs/` — see
`AGENTS.md`.
