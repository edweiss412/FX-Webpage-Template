# Observability Phase 3 — Sentry + client-error capture — Design

**Status:** spec (autonomous-ship). **Date:** 2026-06-30. **Arc:** centralized observability.
**Prior:** Phase 1 = `lib/log` + `app_events` (PR #187); Phase 2 = `/admin/observability` timeline + cron run-summary (PR #193).
**Implementer routing:** UI surfaces (error-boundary fallback screens) are **Opus + impeccable v3 dual-gate**; the rest (Sentry config, endpoint, reporter) is Opus in the same worktree.

---

## 0. Decisions (ratified — do not relitigate)

- **0.1 "Both" capture.** Sentry captures **all** client + server errors (its SDK auto-instruments). Additionally, a thin in-house **app_events mirror** surfaces a *bounded* subset on the Phase 2 `/admin/observability` page. (User decision.)
- **0.2 Mirror scope = boundary crashes ONLY.** Only React error-boundary trips mirror into `app_events`. `window.onerror` / `unhandledrejection` go to **Sentry only** (Sentry dedups/samples; mirroring them would flood the timeline). (User decision.)
- **0.3 No DB migration.** `app_events` (Phase 1, `supabase/migrations/20260629000002_app_events.sql`) is reused as-is. No new columns/tables.
- **0.4 Errors-first Sentry.** Replay, profiling, performance tracing, and Sentry "logs" are **deferred** (sample rates default `0`, env-overridable). This phase ships error capture. Rationale: bundle size, crew PII (replay), and YAGNI for a small operator team.
- **0.5 Fail-open logging.** The mirror is best-effort: it must NEVER break an error boundary or throw into render. A mirror failure degrades silently (Sentry still has the error).
- **0.6 DSN-unset ⇒ no-op.** When the Sentry DSN env is empty/unset, the SDK sends nothing (Sentry's documented behavior: empty DSN ⇒ all `Capture*` are no-ops) and we set `enabled: Boolean(dsn)` explicitly. `next build` with no `SENTRY_*` MUST succeed (local + CI).

---

## 1. Architecture

```
                                  ┌─ Sentry SDK (auto) ──────────────► Sentry dashboard
 browser error ── error boundary ─┤
                                  └─ reportClientError() ─POST─► /api/observe/client-error ─ lib/log.error ─► app_events ─► /admin/observability
 window.onerror / unhandledrejection ── Sentry SDK only ───────► Sentry dashboard
 server / RSC / route / edge error ── instrumentation.onRequestError ─► Sentry dashboard   (already also lib/log where wired in P1)
```

**Two independent paths.** Sentry is configured once (SDK init + `withSentryConfig`) and captures everything automatically. The mirror is a separate, optional, best-effort bridge: error boundaries call a client reporter, which POSTs to a server endpoint, which writes via `lib/log` (the only thing that may touch `app_events`, server-side, service-role). The mirror works **regardless of whether Sentry is configured** — they share no code.

---

## 2. Sentry wiring (`@sentry/nextjs ^10.51.0`, already pinned — `package.json`)

New files (none exist today — confirmed: no `instrumentation.ts`, `instrumentation-client.ts`, `sentry.*.config.*`):

- **`sentry.server.config.ts`** / **`sentry.edge.config.ts`** (repo root): `Sentry.init({ dsn: process.env.SENTRY_DSN, enabled: Boolean(process.env.SENTRY_DSN), environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0) })`. No replay/profiling integrations.
- **`instrumentation.ts`** (root): `export async function register()` imports `./sentry.server.config` when `process.env.NEXT_RUNTIME === "nodejs"`, `./sentry.edge.config` when `=== "edge"`; `export const onRequestError = Sentry.captureRequestError`. (Confirmed shape from Sentry v10 docs.)
- **`instrumentation-client.ts`** (root): `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN), environment, tracesSampleRate: 0 })`; `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart`. No replay.
- **`next.config.ts`** (currently exports `withMDX(nextConfig)` at line 76): wrap as `export default withSentryConfig(withMDX(nextConfig), { org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, silent: !process.env.CI, authToken: process.env.SENTRY_AUTH_TOKEN, telemetry: false })`. The `withSentryConfig` is the OUTER wrapper around the existing `withMDX` result (sandwich order preserved). Webpack/Turbopack auto-instrumentation left at defaults.

**Env vars** (add to `.env.local.example`; `SENTRY_DSN` already present at line 29):
| var | scope | required? | effect when unset |
|---|---|---|---|
| `SENTRY_DSN` | server | no | server/edge SDK no-op |
| `NEXT_PUBLIC_SENTRY_DSN` | client (build-inlined) | no | client SDK no-op |
| `SENTRY_AUTH_TOKEN` | build | no | source-map upload skipped (warn, no fail) |
| `SENTRY_ORG` / `SENTRY_PROJECT` | build | no | upload skipped |
| `SENTRY_TRACES_SAMPLE_RATE` | server | no (default 0) | errors-only |

**No `lib/env` validation module** exists (only `lib/env/pickerCookieSigningKey.ts`, a module-load throw-gate). Phase 3 does **not** add hard env validation — all Sentry vars are optional (no-op when unset). Do NOT add a throw-on-unset gate (would break local/CI builds).

---

## 3. The mirror endpoint — `app/api/observe/client-error/route.ts` (NEW)

- **Method:** `export async function POST(req: Request)`. Wrap the body in `runWithRequestContext({ requestId: deriveRequestId(req.headers) }, …)` (mirrors `app/api/report/route.ts:209-213`).
- **Auth-chain classification:** register in `lib/audit/trustDomains.ts` `PROTECTED_ROUTES` with **`chain: "public"`** (sibling of `app/api/drive/webhook/route.ts`, `app/api/auth/google/start/route.ts`). It is callable from unauthenticated crew pages (share-token) AND authed admin pages; it performs no privileged action — it validates, then writes a single best-effort log row server-side. **Required** or `tests/cross-cutting/auth-chain-audit.test.ts:25-32` fails ("not classified in TRUST_DOMAINS").
- **Payload (validated, all caps enforced server-side):**
  ```ts
  { area: "crew" | "admin" | "root";   // required, enum
    message: string;                    // required, cap 1000 chars
    stack?: string;                     // cap 8000 chars
    componentStack?: string;            // cap 8000 chars
    digest?: string;                    // cap 200 chars (Next error digest)
    url?: string }                      // cap 2000 chars
  ```
  Invalid/oversized/malformed JSON ⇒ **400 `{ ok: false }`** (no detail). Unknown `area` ⇒ 400.
- **Write:** `log.error(message.slice(0,1000), { source: \`client.${area}\`, context: { stack, componentStack, digest, url } })`. **No `code:`** (so the §12.4 / x2 / codes scanners are untouched — code-less error logs persist by level alone, `lib/log/logger.ts:21-25`). `level=error` ⇒ always persists to `app_events` (`persist.ts:13-22`). `source` ∈ {`client.crew`, `client.admin`, `client.root`} — filterable on the Phase 2 page.
- **Response:** success ⇒ **202 `{ ok: true }`** (accepted, best-effort). The endpoint NEVER returns 5xx to the browser: any internal failure is swallowed + the route returns 202 (the lib/log sink itself already swallows + degrades to console — `persist.ts:6-9`).
- **Flood control (defense in depth; client dedup is PRIMARY per §4):**
  1. **Client-side dedup** (primary) — see §4.
  2. **Payload size caps** (above).
  3. **Best-effort per-instance fixed-window counter** keyed by `area` (e.g., ≤ 20 accepted/instance/60s; excess ⇒ 202 but dropped, logged once). Explicitly acknowledged WEAK in serverless (per-instance memory, not shared) — it is a backstop, not the guarantee. The guarantee is "boundary crashes are bounded + client-deduped" (§0.2/§4). **No DB-backed rate-limiter** (none exists; a read+write per client error would defeat best-effort).

---

## 4. Client reporter — `lib/observe/reportClientError.ts` (NEW, client-safe)

- **No server imports** (no `lib/supabase`, no `lib/log`, no `server-only`). Pure browser module.
- **API:** `reportClientError(input: { error: unknown; area: "crew"|"admin"|"root"; componentStack?: string; digest?: string }): void`.
- **Dedup (primary flood control):** module-level `Set<string>` of error signatures `\`${area}|${message}|${stackHead}\`` (first ~200 chars of stack). Each unique signature is reported **once per page session**. A render-loop firing the same boundary repeatedly ⇒ exactly one POST.
- **Transport:** `fetch("/api/observe/client-error", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(payload), keepalive: true })`. `keepalive` so an in-progress navigation/unmount doesn't drop it.
- **Fail-open:** wrapped in try/catch; a thrown/rejected fetch is swallowed (`.catch(() => {})`). MUST NOT throw — it is called from `useEffect` inside an error boundary; throwing there would re-crash. No `await` in the caller.
- **`area` derivation:** the caller (each boundary) passes its area literally.

---

## 5. Error boundaries

Each boundary's `useEffect` does TWO independent best-effort things: `Sentry.captureException(error)` and `reportClientError({ error, area, componentStack?, digest: error.digest })`. Order-independent; neither awaited; neither may throw.

### 5.1 `app/global-error.tsx` (NEW — root, currently absent)
- `"use client"`. Props `{ error: Error & { digest?: string }; reset: () => void }`. MUST render its own `<html><body>` (Next requirement — global-error replaces the root layout).
- `useEffect` ⇒ `Sentry.captureException(error)` + `reportClientError({ error, area: "root", digest })`.
- Fallback UI: minimal full-page, mobile-first, DESIGN tokens only. Copy via `getRequiredDougFacing("PAGE_RENDER_FAILED")` (from `@/lib/messages/lookup`, the pattern the admin boundaries use) (new §12.4 code — see §7). A **"Reload"** button (`onClick={() => reset()}`).

### 5.2 Crew boundary — `app/show/[slug]/[shareToken]/error.tsx` (NEW — crew route has NO boundary today)
- `"use client"`, `{ error, reset }`. `useEffect` ⇒ captureException + `reportClientError({ area: "crew", … })`.
- Fallback UI: crew-styled (matches the crew page's mobile-first design), DESIGN tokens. Copy via `getRequiredDougFacing("PAGE_RENDER_FAILED")` (from `@/lib/messages/lookup`, the pattern the admin boundaries use) (plain-language — this IS a crew-facing surface, the plain-language mandate applies). "Try again" → `reset()`.

### 5.3 Admin boundaries (EXISTING — `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/error.tsx`)
- Today: each `console.error(...)` + renders `ADMIN_ROUTE_LOAD_FAILED` (existing §12.4 code). 
- Change: REPLACE the bare `console.error` with `useEffect` ⇒ `Sentry.captureException(error)` + `reportClientError({ error, area: "admin", digest })`. **Keep** the existing `ADMIN_ROUTE_LOAD_FAILED` copy + `reset()` UI unchanged (no visual change — these already passed impeccable in their milestones; only the effect body changes).

---

## 6. Scope / non-goals (disagreement-loop preempt — cite when challenged)

- **Replay / profiling / tracing / Sentry-logs:** deferred (§0.4). Sample rates `0`, env-overridable. NOT a gap.
- **`window.onerror` / `unhandledrejection` → app_events:** intentionally Sentry-only (§0.2, user-ratified). NOT a gap.
- **DB-backed rate-limiter:** intentionally not built (§3); client dedup is the guarantee. NOT a gap.
- **Hard env validation (throw-on-unset):** intentionally absent (§2); Sentry vars are optional/no-op. Adding a throw would break builds. NOT a gap.
- **RSC/server `lib/log` ⇄ Sentry double-write:** server errors go to Sentry (`onRequestError`); they do NOT also mirror to app_events here (P1 already logs server infra where wired). The mirror is for CLIENT boundary crashes only. NOT a gap.
- **Tunnel route (ad-blocker bypass):** out of scope.

---

## 7. §12.4 catalog: ONE new code — `PAGE_RENDER_FAILED`

The global + crew fallbacks render crew-facing copy ⇒ invariant 5 requires it flow through `lib/messages/lookup`. Reuse is not possible (`ADMIN_ROUTE_LOAD_FAILED` is admin-scoped copy). Introduce ONE code used by `global-error.tsx` + the crew boundary.

- **`PAGE_RENDER_FAILED`** — Doug-facing plain copy, e.g. *"This page ran into a problem. Try reloading — if it keeps happening, let the office know."* (final wording in the catalog).
- **Three-way lockstep (same commit, per project rule):** (a) master spec §12.4 prose (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`); (b) `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`; (c) `lib/messages/catalog.ts` row. Then the downstream gates: `x1-catalog-parity`, `x2-no-raw-codes` (the boundaries render the *copy*, never the raw code), `pnpm gen:internal-code-enums`, help `_families` if applicable. Run the FULL suite before push (per `feedback_new_12_4_code_full_ci_touchpoints`).
- The admin boundaries keep `ADMIN_ROUTE_LOAD_FAILED` (no new code for them).

---

## 8. Build-vs-runtime gate (MANDATORY explicitness)

| gate | moment | proof (test shape) |
|---|---|---|
| Sentry SDK init no-op | **runtime** | unit test: with DSN unset, the config module sets `enabled: false` (and `Boolean(undefined) === false`); a structural test asserts every `Sentry.init` call passes `enabled: Boolean(<dsn>)`. |
| Source-map upload | **build** | `withSentryConfig` receives `authToken: process.env.SENTRY_AUTH_TOKEN` (undefined ⇒ upload skipped, warn-not-fail). Verified by `next build` with `SENTRY_*` UNSET succeeding (the canonical CI build path). |
| `next build` safety | **build** | a build with no `SENTRY_*` set produces a working artifact; the Sentry SDK is present but inert at runtime. (CI already runs `pnpm build` with no Sentry secrets — this is the real proof; do not rely solely on local.) |

The canonical `next build` must not require any `SENTRY_*` (per `feedback_build_gated_routes_never_fallback_target` sibling discipline + M3 build-vs-runtime lesson).

---

## 9. Guard conditions (per-prop)

- `error` (boundary prop): always an `Error`-shaped object; `error.digest` may be `undefined` ⇒ omit from payload (exactOptional). `error.message` may be empty ⇒ reporter sends `"(no message)"`.
- `reset` (boundary prop): always a function; button calls it directly.
- mirror payload `area`: enum-validated server-side; client always passes a literal.
- `message`/`stack` null/empty/oversized ⇒ §3 caps + fallback strings.
- `NEXT_PUBLIC_SENTRY_DSN` undefined ⇒ client SDK inert; `reportClientError` still works (independent path).
- reporter called during SSR (no `window`) ⇒ boundaries are `"use client"` + the effect runs only client-side; the reporter additionally guards `typeof fetch !== "undefined"`.

## 10. Dimensional invariants (fallback UIs)

The global + crew fallbacks are simple centered single-column layouts (icon/heading/body/button) — no fixed-height parent with flex children, so no `items-stretch`-class invariant applies. The spec states this explicitly so the plan's layout task is "centered column, full-viewport min-height, tap-min button" rather than a `getBoundingClientRect` parity harness. The **button** is the only interactive control ⇒ `min-h-tap-min` (44px). No `auto-rows-fr` grid.

## 11. Transition inventory

The fallback screens have a SINGLE visual state (error shown). No mode toggles, no list-length changes, no conditional sub-states ⇒ **no animations; instant render**. (Stated explicitly to satisfy the transition-audit discipline: every boundary is "instant — no animation needed".)

---

## 12. Meta-test inventory

- **Auth-chain registry (EXTEND):** add `app/api/observe/client-error/route.ts` → `PROTECTED_ROUTES` (`chain:"public"`); `auth-chain-audit` pins it.
- **§12.4 catalog parity (EXTEND):** `PAGE_RENDER_FAILED` lands in §12.4 prose + catalog + generated codes; `x1-catalog-parity` pins the three-way match.
- **Sentry no-op gate (NEW small structural test):** assert each `Sentry.init` site uses `enabled: Boolean(<dsn-env>)` so a future edit can't accidentally enable Sentry with an empty DSN. (Grep-shape over `sentry.*.config.ts` + `instrumentation-client.ts`.)
- **Supabase call-boundary (`_metaInfraContract`):** **N/A** — the endpoint writes via `lib/log` (already-covered sink), performs no direct Supabase call. Declared, not forgotten.

---

## 13. Test plan (TDD per task — concrete failure modes)

1. **reporter dedup** — same signature twice ⇒ one `fetch`; different signatures ⇒ two. Catches: a render loop flooding the endpoint.
2. **reporter fail-open** — `fetch` rejects ⇒ `reportClientError` does not throw. Catches: a boundary re-crash.
3. **reporter payload shape** — builds `{area, message, stack, digest}`, caps applied client-side too. Catches: oversized POST.
4. **endpoint validation** — missing/bad `area`, oversized message, malformed JSON ⇒ 400; valid ⇒ 202 + exactly one `log.error` with `source:"client.<area>"`, no `code`. Catches: unvalidated writes / a §12.4-tripping code.
5. **endpoint fail-open** — `log.error` throws ⇒ route still 202 (never 5xx to browser).
6. **endpoint rate backstop** — N+1 calls in-window ⇒ the (N+1)th is dropped (still 202). Catches: the weak-but-present backstop regressing to nothing.
7. **auth-chain** — the route is classified `public`; audit passes (negative-control: remove the registry row ⇒ audit fails).
8. **Sentry config no-op gate** — structural: every init passes `enabled: Boolean(dsn)`; with DSN unset, `enabled===false`. Negative-control: hardcode `enabled:true` ⇒ test fails.
9. **boundary effects** — render each boundary with a thrown error ⇒ `Sentry.captureException` mock called once AND `reportClientError` mock called once with the right `area`; the fallback renders `getRequiredDougFacing("PAGE_RENDER_FAILED")` (from `@/lib/messages/lookup`, the pattern the admin boundaries use) (crew/global) or `ADMIN_ROUTE_LOAD_FAILED` (admin). Catches: a boundary that captures but doesn't mirror (or vice-versa), or renders a raw code.
10. **build-vs-runtime** — see §8 (the real proof is CI `next build` with no `SENTRY_*`).
11. **catalog parity** — `PAGE_RENDER_FAILED` three-way lockstep (x1).
12. **UI fallback layout** — the button is ≥44px; the layout is a centered full-viewport column (jsdom computed-style or a light real-browser assert; per §10 no parity harness needed).

Anti-tautology: boundary tests assert the MOCKED `captureException`/`reportClientError` were called (the behavior under test), and separately that the rendered DOM contains the catalog COPY (cloned tree, sibling-stripped per the project rule) — never asserting the raw code string.

---

## 14. Self-consistency / numeric sweep

- New files: `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`, `app/global-error.tsx`, `app/show/[slug]/[shareToken]/error.tsx`, `app/api/observe/client-error/route.ts`, `lib/observe/reportClientError.ts` = **8 new files**. Edited: `next.config.ts`, 3 admin `error.tsx`, `.env.local.example`, `lib/audit/trustDomains.ts`, master spec §12.4 + catalog + generated codes = **8 edits**.
- ONE new §12.4 code (`PAGE_RENDER_FAILED`). THREE `client.*` sources (crew/admin/root). ZERO migrations. ZERO advisory-lock surfaces.
- `source` values appear in exactly two places: the endpoint write (§3) and the Phase 2 page's free-form source filter (no enum to extend).
