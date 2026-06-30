# Observability Phase 4 — console.* migration + no-console rule — Design

**Status:** spec (autonomous-ship). **Date:** 2026-06-30. **Arc:** centralized observability (FINAL phase).
**Prior:** P1 `lib/log`+`app_events` (#187); P2 `/admin/observability` (#193); P3 Sentry + client-error mirror (#203).
**Implementer:** Opus. **No impeccable gate** — zero visual/DOM change (console→log swaps).

---

## 0. Decisions (ratified — do not relitigate)

- **0.1 Server `console.*` → `lib/log`.** Every runtime SERVER call site (app/api, server `app/` routes/pages/actions, `lib/` server modules, SERVER components) becomes `log.{error,warn,info}` with a `source`. (User chose "B".)
- **0.2 Client `console.*` → a thin `clientLog` bridge** that reuses P3's `/api/observe/client-error` endpoint (generalized to a `source`+`level` payload). `ShowRealtimeBridge.tsx` (the only substantial client cluster, 15 sites) routes its `warn`/`info` here. (User decision — surface client warnings on the diagnostics page.)
- **0.3 `TileErrorBoundary.tsx` (client React error boundary) → P3's `captureBoundaryError`** (Sentry + app_events mirror), not a bare `console.error`.
- **0.4 Level-gating for `clientLog`.** `clientLog` POSTs to the mirror ONLY for `warn`/`error` (which persist); `info`/`debug` are **console-only** (no POST) — so verbose client tracing never floods `app_events`. Server `lib/log` keeps its existing persist threshold (error/warn always; info only with a code).
- **0.5 `no-console` lint rule** (`error`) across `app/`, `lib/`, `components/`. EXEMPT: `scripts/**`, `tests/**`, and `lib/log/persist.ts` (the sink's OWN fallback — logging from inside the sink loops). A structural meta-test pins the exemption set.
- **0.6 No DB migration. No new §12.4 codes** (all infra logging — `code`-less, exactly P1's pattern). No advisory-lock surface.
- **0.7 Fail-open / non-interference.** Logging never changes control flow. `clientLog` (like `reportClientError`) never throws into render and swallows transport failures.

---

## 1. Architecture

```
SERVER console.error/warn/log/info  ──►  log.{error,warn,info}(msg, { source, …fields })  ──► app_events (P1 sink)
CLIENT (ShowRealtimeBridge) console.warn/info ─► clientLog(level, source, msg, ctx?)
        ├─ warn|error ─POST─► /api/observe/client-error ─ log.{level}(source) ─► app_events ─► /admin/observability
        └─ info|debug ─► console only (no POST)
CLIENT TileErrorBoundary console.error ──► captureBoundaryError(error, area)  ─► Sentry + mirror (P3)
EXEMPT: scripts/**, tests/**, lib/log/persist.ts (sink fallback)            ─► console stays
```

---

## 2. Server migration (~50 sites → `lib/log`)

**Mapping:** `console.error→log.error`, `console.warn→log.warn`, `console.log|info→log.info`. The message string stays (minus any leading `[bracket]` prefix, which becomes the source); structured args fold into the fields object (top-level, NOT under `context:` — `lib/log/logger.ts` RESERVED = `{source,code,showId,driveFileId,requestId,actorHash,error,persist}`, everything else spreads into `app_events.context`). An `Error` object goes in the reserved `error` field. **No `code:`** (infra).

**`source` convention:** derive from the existing `[bracket]` prefix when present (`[agenda-extract]`→`agenda.extract`, `[agenda-enrich]`→`sync.enrichAgenda`, `[hotels]`→`parser.hotels`, `[AlertBanner]`→`admin.alertBanner`); otherwise from the file path (route/module). Per-file source table:

| file | sites | source |
|---|---|---|
| `app/auth/callback/route.ts` | 4 | `auth.callback` |
| `app/auth/sign-out/route.ts` | 2 | `auth.signOut` |
| `app/admin/actions.ts` | 1 | `admin.actions` |
| `app/admin/show/[slug]/page.tsx` | 8 | `admin.show` |
| `app/api/auth/picker-bootstrap/route.ts` | 2 | `api.auth.pickerBootstrap` |
| `app/api/admin/show/staged/[stagedId]/apply/route.ts` | 1 | `api.admin.staged.apply` |
| `app/api/admin/staged/[fileId]/apply/route.ts` | 4 | `api.admin.staged.apply` |
| `app/api/admin/staged/[fileId]/discard/route.ts` | 3 | `api.admin.staged.discard` |
| `app/api/admin/sync/[slug]/route.ts` | 3 | `api.admin.sync` |
| `app/api/admin/onboarding/manifest/.../ignore/route.ts` | 1 | `api.admin.onboarding.ignore` |
| `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` | 1 | `api.admin.onboarding.retry` |
| `app/api/admin/onboarding/finalize-cas/route.ts` | 1 | `api.admin.onboarding.finalizeCas` |
| `app/api/admin/onboarding/reap-stale-sessions/route.ts` | 1 | `api.admin.onboarding.reap` |
| `app/api/admin/onboarding/finalize/route.ts` | 2 | `api.admin.onboarding.finalize` |
| `app/api/admin/onboarding/staged/.../apply/route.ts` | 2 | `api.admin.onboarding.staged.apply` |
| `app/api/admin/onboarding/staged/.../unapprove/route.ts` | 1 | `api.admin.onboarding.staged.unapprove` |
| `app/api/admin/onboarding/staged/.../discard/route.ts` | 1 | `api.admin.onboarding.staged.discard` |
| `app/api/admin/onboarding/staged/.../approve/route.ts` | 1 | `api.admin.onboarding.staged.approve` |
| `app/api/admin/onboarding/extract-agenda/.../route.ts` | 2 | `api.admin.onboarding.extractAgenda` |
| `app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts` | 1 | `api.admin.ignoredSheets.unignore` |
| `app/api/realtime/subscriber-token/route.ts` | 1 | `api.realtime.subscriberToken` |
| `lib/auth/picker/selectIdentity.ts` | 1 | `auth.picker.selectIdentity` |
| `lib/parser/blocks/hotels.ts` | 1 | `parser.hotels` |
| `lib/agenda/extractAgendaSchedule.ts` | 4 | `agenda.extract` |
| `lib/sync/enrichAgenda.ts` | 4 | `sync.enrichAgenda` |
| `app/show/[slug]/[shareToken]/_CrewShell.tsx` (server) | 1 | `crew.shell` |
| `components/admin/AlertBanner.tsx` (server) | 4 | `admin.alertBanner` |
| `components/crew/WrappedSection.tsx` (server) | 2 | `crew.wrappedSection` |
| `components/crew/RightNowHero.tsx` (server) | 1 | `crew.rightNowHero` |
| `components/right-now/RightNowCard.tsx` (server) | 1 | `crew.rightNowCard` |
| `components/shared/TileServerFallback.tsx` (server) | 2 | `crew.tileServerFallback` |

**Request context:** API routes already wrap in `runWithRequestContext` (P1/P3); `log.*` inside them auto-attaches `requestId`. Server components/actions have no ALS context → `requestId` is `null` (graceful, P1 §). Do NOT add ALS where it doesn't exist. **Guard:** a site that currently `console.error`s an `Error` object passes it via `{ error }` (serialized by `lib/log/serializeError`), not string-concatenated.

---

## 3. Client log bridge — `lib/observe/clientLog.ts` (NEW) + endpoint generalization

### 3.1 Endpoint generalization — `app/api/observe/client-error/route.ts` (P3, edited)
P3's payload was `{ area: crew|admin|root, message, stack?, … }` → wrote `source: client.${area}`, level `error`. Generalize to a `source`+`level` shape that BOTH paths build:
- New payload: `{ source: string, level?: "warn" | "error", message, stack?, componentStack?, digest?, url? }`.
- **`source` validation = a FINITE allowlist** (NOT an open regex — an unbounded source keyed into the rate-limit Map would let an attacker mint unlimited keys and bypass the per-key cap): `ALLOWED_SOURCES = {"client.crew","client.admin","client.root","client.tile","client.realtime"}`. `source` not in the set ⇒ **400**. (A future client source = one more entry in this registered table — the same finiteness `area` gave P3.) `level` defaults `error`; only `warn`/`error` accepted (both persist) — any other (incl. `info`/`debug`) ⇒ 400.
- Write: `log[level](message.slice(0,1000), { source, stack, componentStack, digest, url })` (top-level fields). All other P3 guards unchanged (same-origin OR, reject structural-invalid → 400, truncate oversized → 202, `safeLog` fail-open). The **rate backstop + dedup now key by `source`** (P3 keyed by `area`) — `allow(source, now)` + the "logged once" rate-cap warn keyed per-source; otherwise identical.
- **`reportClientError` / `captureBoundaryError` (P3) updated** to send `{ source: \`client.${area}\`, level: "error", … }` instead of `{ area }`. (P3 tests updated to the new shape — same behavior, new field names.)

### 3.2 `clientLog(level, source, message, context?)` — `lib/observe/clientLog.ts` (NEW, client-safe)
- `level: "warn" | "error" | "info" | "debug"`; `source: string` (a `client.*` literal in `ALLOWED_SOURCES`); `message: string`; `context?: Record<string,unknown>`.
- ALWAYS `console[level](message, context)` (browser dev keeps the full structured detail).
- **`context` is CONSOLE-ONLY — NOT mirrored.** The POST payload is `{ source, level, message }` only (no `context` field). The `message` must be self-describing for the diagnostics page; arbitrary client objects are never serialized/capped/sanitized over the wire (size + PII safety). If a realtime warning's structured 2nd arg holds something operator-relevant (a status/reason), fold the salient bit INTO the `message` string at the call site; the rest stays browser-console.
- **Only `warn`/`error` additionally POST** to `/api/observe/client-error` (level-gated, §0.4); `info`/`debug` are console-only.
- The POST path is the EXACT P3 `reportClientError` mechanism (per-signature dedup, message cap, `keepalive`, `try/catch` swallow — never throws). Factor the shared transport (`lib/observe/clientErrorTransport.ts` or an exported helper) so `reportClientError`, `captureBoundaryError`'s reporter, and `clientLog` build the SAME `{source,level,message,…}` payload and don't duplicate the dedup/cap/fetch.
- `ShowRealtimeBridge.tsx`: each `console.warn(msg, ctx?)`→`clientLog("warn","client.realtime", msg, ctx?)`, the one `console.info`→`clientLog("info","client.realtime", …)` (console-only, no POST). Dedup + the endpoint rate-cap bound a noisy realtime session to a few distinct `client.realtime` rows.

---

## 4. `TileErrorBoundary.tsx` → `captureBoundaryError`

The shared tile error boundary's `console.error(error, info.componentStack)` (`TileErrorBoundary.tsx:48`, with `info.componentStack` available at `:44`) becomes `captureBoundaryError(error, "tile", { componentStack: info.componentStack })`.
- **Add `"tile"`** to `captureBoundaryError`'s `area` enum (now `"crew"|"admin"|"root"|"tile"`) AND `"client.tile"` to the endpoint `ALLOWED_SOURCES` (§3.1).
- **`captureBoundaryError` gains an optional 3rd param** `extra?: { componentStack?: string }` so the class boundary's `componentStack` flows through (it forwards to `reportClientError`, which already supports `componentStack` at `reportClientError.ts:19`). The route-level `error.tsx` boundaries (P3) call `(error, area)` with no extra — unchanged. This surfaces tile crashes (+ the component stack) to Sentry + the diagnostics page (the gap P3 left — it wired only route-level `error.tsx`, not this class boundary).

---

## 5. `no-console` lint rule + exemptions (`eslint.config.mjs`)

- Add `"no-console": "error"` to the **main rules block** (`eslint.config.mjs:53`, the `files: ["**/*.{ts,tsx,…}"]` block).
- Add an **override block** EXEMPTING the non-runtime + sanctioned-console surfaces:
  ```js
  { files: ["scripts/**", "tests/**", "lib/log/logger.ts", "lib/log/persist.ts", "lib/observe/clientLog.ts"],
    rules: { "no-console": "off" } }
  ```
  Why each:
  - `scripts/` = CLI/tooling (no `app_events` sink); `tests/` = test debugging.
  - **`lib/log/logger.ts`** = the default sink's OWN `console[record.level]` output (`logger.ts:65`) — `lib/log` IS the logging facility; console is its dev output channel.
  - `lib/log/persist.ts` = the sink's degradation fallback (`persist.ts:25,28`) — the ONE place raw console is correct, running when `app_events` itself is unwritable.
  - `lib/observe/clientLog.ts` = the sanctioned client console wrapper (it ALWAYS calls `console[level]`).
- **Verified:** `eslint-config-next` does NOT preset `no-console` (grep of `node_modules/eslint-config-next/` is empty), so `"no-console":"error"` is a clean addition (no override-conflict). Verify `pnpm lint` flags a planted `console.log` in `app/` as an ERROR after the change.

---

## 6. Scope / non-goals (disagreement-loop preempt)

- **Client `info`/`debug` stay console-only** (§0.4) — not mirrored. NOT a gap (avoids flooding; they're trace-level).
- **`scripts/` + `tests/` keep console** — they don't run in the Next runtime / have no `app_events` sink. NOT a gap.
- **`lib/log/persist.ts` keeps its 2 `console.error` fallbacks** — the sink's last-resort when `app_events` write fails (can't log to itself). Sanctioned + exempt.
- **No new §12.4 codes / no migration / no advisory locks.**
- **No isomorphic log module** (Option C rejected) — `clientLog` + the P3 endpoint is the client path.
- **ALS not added to server components** — they log with `requestId: null` (graceful).

---

## 7. Guard conditions

- A migrated `console.error("x", err)` where `err` is an `Error` ⇒ `log.error("x", { source, error: err })` (reserved `error` field → serialized). A non-Error 2nd arg ⇒ a named context field.
- `clientLog` with no `window`/`fetch` (SSR) ⇒ the POST path guards `typeof fetch !== "undefined"` (P3 reporter already does); `console[level]` always runs.
- Endpoint: unknown `level`, malformed `source`, or (existing) bad payload ⇒ 400; oversized ⇒ truncate+202.
- A server site inside a tight loop (e.g. per-row) keeps its current call cardinality — migration is 1:1, no added throttling (server `app_events` writes are already best-effort + the call sites are unchanged in frequency).

## 8. §12.4 / catalog: NONE

No new codes. All migrated logs are infra (`code`-less). `x2-no-raw-codes` is unaffected (no codes rendered). `correlation-seeding` (P1/P3 ALS test) is unaffected (no route handler ALS topology changes — the API routes already wrap; we only swap the log call inside).

## 9. Build / runtime gates: N/A

No env gate, no build-time decision. `pnpm build` behavior unchanged.

## 10. Meta-test inventory

- **`no-console` exemption registry (NEW structural test):** `tests/cross-cutting/no-console-exemptions.test.ts` — asserts the eslint override `files` list is EXACTLY `["scripts/**","tests/**","lib/log/logger.ts","lib/log/persist.ts","lib/observe/clientLog.ts"]` (so a future edit can't silently widen the exemption), and that NO runtime `console.*` remains in `app/`+`lib/`+`components/` OUTSIDE those 5 exemptions (a grep walk — the same guarantee the lint rule gives, pinned at the test layer too). Negative-control: planting a `console.log` in a non-exempt `lib/foo.ts` fails it.
- **Supabase call-boundary (`_metaInfraContract`):** N/A — migration adds no new Supabase call site (the server logs flow through the already-covered `lib/log` sink).
- **Advisory-lock topology:** N/A — no `pg_advisory*` surface.
- **§12.4 catalog parity / x2:** N/A — no codes.

## 11. Self-consistency / numeric sweep

- **Runtime `console.*` migration set:** ~50 server (→ `lib/log`) + **client = 15 `ShowRealtimeBridge` (→ `clientLog`) + 1 `TileErrorBoundary` (→ `captureBoundaryError`) = 16**. Exempt (console stays): `scripts/**`, `tests/**`, `lib/log/logger.ts`, `lib/log/persist.ts`.
- **New files:** `lib/observe/clientLog.ts` + `lib/observe/clientErrorTransport.ts` (the shared payload/transport helper) = 2. **Edited infra:** `app/api/observe/client-error/route.ts` (finite-allowlist source + level + rate-key-by-source), `lib/observe/reportClientError.ts` + `lib/observe/captureBoundaryError.ts` (new `{source,level}` payload + `"tile"` area + componentStack param), `eslint.config.mjs` (rule + 5-file exemption). Plus ~30 migrated source files. Plus the P3 endpoint/reporter test files updated for the new payload shape.
- ZERO migrations, ZERO §12.4 codes, ZERO advisory-lock surfaces, ZERO visual change.

## 12. Test plan (TDD)

1. **clientLog** — `warn`/`error` → `console[level](message, context)` AND one POST whose body is EXACTLY `{source,level,message}` (assert NO `context`/extra keys mirrored); `info`/`debug` → `console` only, NO POST; rejected fetch never throws; dedup per signature. (jsdom; mock fetch.)
2. **endpoint generalized** — valid `{source:"client.realtime",level:"warn",message}` → 202 + `log.warn` with that source; `source` NOT in `ALLOWED_SOURCES` (`"evil"`, `"client.foo"`, `"client.realtime.x"`) → 400; `level:"info"`/`"debug"` → 400; oversized → truncate+202; same-origin/fail-open guards hold; **rate-cap keyed by source** (21st same-source call dropped + one warn). Re-run the P3 endpoint tests adapted to the new `{source,level}` shape.
3. **reportClientError/captureBoundaryError** — now send `{source:"client.crew",level:"error"}` (P3 tests updated, same behavior); `captureBoundaryError(error,"tile",{componentStack})` → POST `source:"client.tile"` + `componentStack` forwarded.
4. **TileErrorBoundary** — a thrown child → `captureBoundaryError` called once with `(error,"tile",{componentStack: <the React componentStack>})`; the fallback UI unchanged (assert it still renders, no visual change).
5. **server migration spot-tests** — for a representative migrated route (e.g. `api.admin.sync`), the error path calls `log.error` with the right `source` + the `Error` in the reserved field (mock `@/lib/log`); behavior/HTTP unchanged.
6. **no-console rule** — `pnpm lint` ERRORs on a planted `app/` `console.log`; does NOT flag `scripts/`/`tests/`/`persist.ts`/`clientLog.ts`.
7. **no-console exemption meta-test** (§10) — exact exemption set + no-stray-console grep walk + negative control.

Anti-tautology: the server spot-tests assert the migrated call reaches `log.<level>` with the exact `source` (not just "log was called"); the meta-test plants a real stray console to prove it fails.
