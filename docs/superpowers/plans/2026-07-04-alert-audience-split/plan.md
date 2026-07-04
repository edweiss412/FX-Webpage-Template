# Alert Audience Split + App-Health Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 42 admin-alert codes into `doug` (actionable, stays in the amber banner) and `health` (app/dev concerns) audiences, remove `health` codes from Doug's amber surfaces, and surface them through an escalating app-health indicator (nav + dashboard) with a Doug plain-language popover and a developer detail panel — so nothing goes dark.

**Architecture:** Catalog metadata (`audience`/`healthWeight`/`dougSummary`) is the single source; the existing `INFO_SEVERITY_CODES` exclusion pattern is extended to also exclude `HEALTH_CODES` from Doug surfaces (exclusion, not allowlist → unknown codes stay fail-visible). A bounded, exact `fetchHealthRollup()` (count-head probes + healthy-state short-circuit) drives the indicator; a dev-gated `resolveHealthAlertFormAction` plus guards on the three legacy resolve surfaces make health resolution developer-only at the product layer.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), Supabase (`admin_alerts` via `createSupabaseServerClient`), Tailwind v4 `@theme` tokens, Vitest, Playwright (real-browser layout/transition assertions), lucide-react icons.

## Global Constraints

- **No DB migration, no RLS change, no advisory locks.** `audience`/`healthWeight`/`dougSummary` are catalog metadata only.
- **Invariant 5:** no raw error-code strings in the DOM — all copy via `lib/messages/lookup.ts` / catalog.
- **Invariant 9:** every Supabase call destructures `{ data, error }`; infra faults surface as typed results; new reads registered in `tests/admin/_metaInfraContract.test.ts`; new `admin_alerts` reads registered in `tests/admin/_metaBoundedReads.test.ts`.
- **Exclusion, not allowlist:** Doug surfaces exclude `INFO_SEVERITY_CODES ∪ HEALTH_CODES`; unknown codes stay Doug-visible.
- **Health resolution is app-surface defense-in-depth, NOT a DB boundary** (deferred to `BL-HEALTH-RESOLVE-DB-LOCKDOWN`).
- **TDD per task; one conventional-commit per task** (`feat(...)`/`test(...)`/`chore(...)`), `--no-verify` (shared hook); run `pnpm typecheck` + `pnpm format:check` before any push.
- **UI-token discipline (invariant 8):** UI surfaces ship only after `/impeccable critique` AND `/impeccable audit` pass (Task 13), HIGH/CRITICAL fixed or DEFERRED.md'd, before the whole-diff Codex review.
- **Audience partition (verbatim from spec §3):** 16 doug / 26 health (16 degraded + 10 notice). Full lists in spec §3.1/§3.2 — copy them exactly.
- **Catalog copy edits (spec §7):** `WATCH_CHANNEL_ORPHANED`, `EMAIL_NOT_CONFIGURED`, `EMAIL_DELIVERY_FAILED` each require the §12.4 three-way lockstep (master spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`, same commit). Never `prettier --write` the master spec.

## Meta-test inventory (declared per AGENTS.md writing-plans additions)

- **CREATE** `tests/messages/_metaAlertAudienceContract.test.ts` — every `ADMIN_ALERTS_CODES` entry declares `audience`; health codes declare `healthWeight` + non-empty `dougSummary`; doug codes carry NEITHER; partition counts 16/26 and 16/10.
- **CREATE** `tests/admin/healthResolveGuard.test.ts` — the 3 legacy resolve surfaces reject `HEALTH_CODES`; `resolveHealthAlertFormAction` is the sole health-resolve entry point.
- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — register `fetchHealthRollup` (count-head contract) + the `HealthAlertsPanel` loader (array-shape contract).
- **EXTEND** `tests/admin/_metaBoundedReads.test.ts` — register `lib/admin/healthRollup.ts` (count-head) + the `HealthAlertsPanel` loader (`.range`).
- **EXTEND** `tests/log/_metaAdminOutcomeContract.test.ts` — register `resolveHealthAlertFormAction` reusing `ADMIN_ALERT_RESOLVED`.
- No advisory-lock topology (this plan touches no `pg_advisory*`).

## File structure

- `lib/messages/catalog.ts` — add 3 fields to `MessageCatalogEntry`; set them on 42 codes; reconcile 3 rows' copy.
- `lib/adminAlerts/audience.ts` (NEW) — `HEALTH_CODES`, `DEGRADED_HEALTH_CODES`, `NOTICE_HEALTH_CODES`, `DOUG_EXCLUDED_CODES` (= info ∪ health), `dougSummaryFor(code)`.
- `lib/admin/healthRollup.ts` (NEW) — `HealthStatus`, `HealthSummaryLine`, `fetchHealthRollup()`.
- `lib/admin/healthAlerts.ts` (NEW) — `loadHealthAlerts({ weight, page })` (the paginated dev panel loader).
- `components/admin/nav/AppHealthIndicator.tsx` (NEW) — nav dot; Doug `<button>`+popover vs dev `<Link>`.
- `components/admin/AppHealthPopover.tsx` (NEW) — Doug plain-language sheet/popover.
- `components/admin/AppHealthPanel.tsx` (NEW) — dashboard breakdown (own read).
- `components/admin/observability/HealthAlertsPanel.tsx` (NEW) — dev detail rows + action links + resolve.
- `components/admin/observability/HealthAlertResolveButton.tsx` (NEW) — client button bound to the Server Action.
- `app/admin/actions.ts` — add `resolveHealthAlertFormAction`; guard `resolveAdminAlertFormAction` against health codes.
- `app/api/admin/admin-alerts/[id]/resolve/route.ts`, `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` — reject health codes.
- `components/admin/nav/AdminNav.tsx`, `components/admin/nav/OnboardingTopBar.tsx`, `app/admin/layout.tsx` — thread rollup + render indicator.
- `app/admin/page.tsx`, `app/admin/observability/page.tsx` — render `AppHealthPanel` / `HealthAlertsPanel`.
- `app/globals.css` — `--color-status-degraded` (+ text) token.

---

### Task 0: Add the `status-degraded` (red) theme token

**Files:**
- Modify: `app/globals.css` (`@theme` block near `:82` + light/dark runtime blocks near `:254/:296/:331`)

**Interfaces:**
- Produces: Tailwind utility `bg-status-degraded` + `text-status-degraded-text` for the red (degraded) indicator state. `status-warn` = amber (notice), `status-positive` = green (ok), `status-idle` = neutral (unknown) already exist.

- [ ] **Step 1: Write the failing test** — `tests/design/statusDegradedToken.test.ts`

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// Guards the token exists so bg-status-degraded resolves (Tailwind v4 emits it
// only if the @theme var is declared). Mirrors the status-warn token shape.
describe("status-degraded token", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  test("declares --color-status-degraded + text in @theme", () => {
    expect(css).toMatch(/--color-status-degraded:\s*var\(--color-status-degraded-runtime\)/);
    expect(css).toMatch(/--color-status-degraded-text:\s*var\(--color-status-degraded-text-runtime\)/);
  });
  test("provides light + dark runtime values (a red hue, distinct from amber warn)", () => {
    // two runtime declarations (base/light + dark override) minimum
    const decls = css.match(/--color-status-degraded-runtime:\s*#[0-9a-fA-F]{6}/g) ?? [];
    expect(decls.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm vitest run tests/design/statusDegradedToken.test.ts` → FAIL (token absent).
- [ ] **Step 3: Implement** — in `app/globals.css`, add to the `@theme` block: `--color-status-degraded: var(--color-status-degraded-runtime); --color-status-degraded-text: var(--color-status-degraded-text-runtime);`. Add runtime values in the base/light block (`--color-status-degraded-runtime: #b3261e; --color-status-degraded-text-runtime: #ffffff;`) and dark block (`--color-status-degraded-runtime: #e5534b; --color-status-degraded-text-runtime: #1a1a1a;`). Match the existing runtime-var placement pattern.
- [ ] **Step 4: Run to verify PASS**. Also `pnpm typecheck`.
- [ ] **Step 5: Commit** — `chore(admin): add status-degraded red theme token for health indicator`

---

### Task 1: Catalog metadata fields + populate 42 codes + reconcile 3 copy rows + audience meta-test

**Files:**
- Modify: `lib/messages/catalog.ts` (`MessageCatalogEntry` at `:1-11`; the 42 admin-alert entries; `WATCH_CHANNEL_ORPHANED`, `EMAIL_NOT_CONFIGURED` `:1982`, `EMAIL_DELIVERY_FAILED` `:1968` copy)
- Modify: master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (the 3 reworded rows only)
- Create: `tests/messages/_metaAlertAudienceContract.test.ts`
- Run: `pnpm gen:spec-codes`

**Interfaces:**
- Produces: `MessageCatalogEntry.audience?: "doug" | "health"`, `.healthWeight?: "degraded" | "notice"`, `.dougSummary?: string | null`. All 42 `ADMIN_ALERTS_CODES` carry `audience`; the 26 health codes carry `healthWeight` + non-empty `dougSummary`; the 16 doug codes carry neither.

- [ ] **Step 0: Extract the canonical registry FIRST (plan-R6 finding 1 — the Step-1 test imports it, so it must exist before that test or the first failure is a module-resolution error, not the intended missing-metadata failure).** Create `tests/messages/adminAlertsRegistry.ts` exporting `export const ADMIN_ALERTS_CODES = [...] as const` (the 42 codes currently inline in `tests/messages/_metaAdminAlertCatalog.test.ts:57-100`) and refactor `_metaAdminAlertCatalog.test.ts` to IMPORT it; run `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts` → still PASS (pure refactor). Commit: `refactor(messages): extract ADMIN_ALERTS_CODES to a shared importable registry`.
- [ ] **Step 1: Write the failing meta-test** — `tests/messages/_metaAlertAudienceContract.test.ts` (imports the Step-0 registry):

```ts
import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

// The 42 admin-alert codes (spec §3; keep in sync with _metaAdminAlertCatalog ADMIN_ALERTS_CODES).
const DOUG = [
  "SHEET_UNAVAILABLE","DRIVE_FETCH_FAILED","PARSE_ERROR_LAST_GOOD","AMBIGUOUS_EMAIL_BINDING",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE","OPENING_REEL_PERMISSION_DENIED","OPENING_REEL_NOT_VIDEO",
  "REEL_DRIFTED","EMBEDDED_ASSET_DRIFTED","ASSET_RECOVERY_BYTES_EXCEEDED","SHOW_FIRST_PUBLISHED",
  "SHOW_UNPUBLISHED","LIVE_ROW_CONFLICT","PICKER_EPOCH_RESET","SYNC_STALLED","WATCH_CHANNEL_ORPHANED",
] as const;
const DEGRADED = [
  "PENDING_SNAPSHOT_PROMOTE_STUCK","PENDING_SNAPSHOT_ROLLBACK_STUCK","PENDING_SNAPSHOT_DELETE_STUCK",
  "WEBHOOK_TOKEN_INVALID","GITHUB_BOT_LOGIN_MISSING","REPORT_DUPLICATE_LIVE_MATCHES",
  "REPORT_OPEN_ORPHAN_LABEL","REPORT_LEASE_THRASHING","BRANCH_PROTECTION_DRIFT",
  "BRANCH_PROTECTION_MONITOR_AUTH_FAILED","EMAIL_NOT_CONFIGURED","EMAIL_DELIVERY_FAILED",
  "TILE_SERVER_RENDER_FAILED","TILE_PROJECTION_FETCH_FAILED","PICKER_BOOTSTRAP_RPC_FAILED",
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
] as const;
const NOTICE = [
  "PICKER_SELECTION_RACE","ASSET_RECOVERY_REVISION_DRIFT","ASSET_RECOVERY_DRIFT_COOLDOWN",
  "WIZARD_SESSION_SUPERSEDED_RACE","OAUTH_IDENTITY_CLAIMED","ROLE_FLAGS_NOTICE","CALLBACK_CLAIM_THREW",
  "REPORT_ORPHANED_LOST_LEASE","REPORT_LOOKUP_INCONCLUSIVE","STALE_ORPHAN_REPORT",
] as const;
const HEALTH = [...DEGRADED, ...NOTICE];
const cat = MESSAGE_CATALOG as Record<string, { audience?: string; healthWeight?: string; dougSummary?: string | null }>;

// Canonical registry — the SAME 42-code list the _metaAdminAlertCatalog registry pins.
// Extract `ADMIN_ALERTS_CODES` into an importable module (e.g.
// `tests/messages/adminAlertsRegistry.ts`) and have BOTH meta-tests import it, so the
// audience test enforces the FULL registered set, not a private copy (plan-R3 finding 2).
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";

describe("alert audience contract", () => {
  test("partition counts: 16 doug + 26 health = 42; 16 degraded + 10 notice", () => {
    expect(DOUG.length).toBe(16);
    expect(HEALTH.length).toBe(26);
    expect(DEGRADED.length).toBe(16);
    expect(NOTICE.length).toBe(10);
  });
  test("DOUG ∪ HEALTH is EXACTLY the canonical ADMIN_ALERTS_CODES registry (set-equality both ways)", () => {
    // A newly-registered admin-alert code with no audience metadata fails HERE (it is in
    // ADMIN_ALERTS_CODES but not in DOUG∪HEALTH), and a stale local entry fails too.
    expect(new Set([...DOUG, ...HEALTH])).toEqual(new Set(ADMIN_ALERTS_CODES));
  });
  test.each(ADMIN_ALERTS_CODES)("every registered code %s carries valid audience metadata", (c) => {
    expect(["doug", "health"]).toContain(cat[c]?.audience);
  });
  test.each(DOUG)("%s is audience:doug with NO healthWeight/dougSummary", (c) => {
    expect(cat[c]?.audience).toBe("doug");
    expect(cat[c]?.healthWeight).toBeUndefined();
    expect(cat[c]?.dougSummary == null).toBe(true);
  });
  test.each(HEALTH)("%s is audience:health with weight + non-empty dougSummary", (c) => {
    expect(cat[c]?.audience).toBe("health");
    expect(cat[c]?.healthWeight).toBe(DEGRADED.includes(c as never) ? "degraded" : "notice");
    expect((cat[c]?.dougSummary ?? "").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm vitest run tests/messages/_metaAlertAudienceContract.test.ts` → FAIL (fields absent).
- [ ] **Step 3: Implement.** (a) Add the 3 optional fields to `MessageCatalogEntry`. (b) On each of the 42 entries set `audience`; on the 26 health entries add `healthWeight` + a `dougSummary` (plain-language, reassuring, non-actionable — e.g. `WEBHOOK_TOKEN_INVALID` → `"A Google Drive push notification failed a security check. Instant updates keep working through the regular sync."`; write one per health code). (c) Reconcile the 3 copy rows per spec §7: `WATCH_CHANNEL_ORPHANED` (drop amber-urgency); `EMAIL_NOT_CONFIGURED` `followUp` → `"Eric → configure email env (provider key / sending address / site address) on the deployment"`, `dougFacing` drops the Doug instruction; `EMAIL_DELIVERY_FAILED` `followUp` → `"Eric → check provider key / verified sending domain"`. Mirror the §12.4 prose in the master spec for these 3, then `pnpm gen:spec-codes`.
- [ ] **Step 4: Run to verify PASS** — the new meta-test + `pnpm vitest run tests/messages/` (x1-catalog-parity, _metaAdminAlertCatalog, codes-coverage) + `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(messages): add alert audience/healthWeight/dougSummary + reconcile EMAIL_*/WATCH copy`

---

### Task 2: Audience code-set derivations + Doug-exclusion helper

**Files:**
- Create: `lib/adminAlerts/audience.ts`
- Create: `tests/adminAlerts/audience.test.ts`

**Interfaces:**
- Produces: `HEALTH_CODES: string[]`, `DEGRADED_HEALTH_CODES: string[]`, `NOTICE_HEALTH_CODES: string[]`, `DOUG_EXCLUDED_CODES: string[]` (= info-severity ∪ health), `dougSummaryFor(code: string): string | null`. All derived from `MESSAGE_CATALOG` at module load (mirrors `AlertBanner.tsx:71-73` `INFO_SEVERITY_CODES`).

- [ ] **Step 1: Failing test** — assert `HEALTH_CODES` contains `WEBHOOK_TOKEN_INVALID`, excludes `SHEET_UNAVAILABLE`; `DEGRADED_HEALTH_CODES` contains `EMAIL_NOT_CONFIGURED`, excludes `PICKER_SELECTION_RACE`; `DOUG_EXCLUDED_CODES` contains **`SHOW_FIRST_PUBLISHED`** (an **info-only, NON-health** code — this proves the info arm of the union is present; an impl that set `DOUG_EXCLUDED_CODES = HEALTH_CODES` and dropped info would FAIL here, plan-R4 finding 2) AND a health code (`WEBHOOK_TOKEN_INVALID`) but NOT `SHEET_UNAVAILABLE`; also assert `SHOW_FIRST_PUBLISHED ∉ HEALTH_CODES` (it is info, not health). `dougSummaryFor("WEBHOOK_TOKEN_INVALID")` is non-empty, `dougSummaryFor("SHEET_UNAVAILABLE")` is null, `dougSummaryFor("NOT_A_CODE")` is null.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — compute from `Object.values(MESSAGE_CATALOG)`: `HEALTH_CODES` = `audience==="health"`; degraded/notice by `healthWeight`; `DOUG_EXCLUDED_CODES` = union of `severity==="info"` codes and `HEALTH_CODES` (dedup); `dougSummaryFor` reads `MESSAGE_CATALOG[code]?.dougSummary ?? null`.
- [ ] **Step 4: Run → PASS** + typecheck.
- [ ] **Step 5: Commit** — `feat(admin-alerts): derive HEALTH_CODES + Doug-exclusion sets from catalog`

---

### Task 3: `fetchHealthRollup` (bounded, exact, short-circuit) + infra/bounded meta-test rows

**Files:**
- Create: `lib/admin/healthRollup.ts`
- Create: `tests/admin/healthRollup.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts`, `tests/admin/_metaBoundedReads.test.ts`

**Interfaces:**
- Produces: `type HealthSummaryLine = { text: string; count: number }`; `type HealthStatus = { kind:"ok" } | { kind:"notice"|"degraded"; count:number; summaries:HealthSummaryLine[]; overflowCount:number } | { kind:"infra_error" }`; `async function fetchHealthRollup(): Promise<HealthStatus>`; `const POPOVER_SUMMARY_CAP = 4`.
- Consumes: `createSupabaseServerClient` (`@/lib/supabase/server`); `HEALTH_CODES`/`DEGRADED_HEALTH_CODES`/`NOTICE_HEALTH_CODES`/`dougSummaryFor` (Task 2).

- [ ] **Step 1: Failing tests** (`tests/admin/healthRollup.test.ts`, mock the supabase client like `tests/admin/alertCount.test.ts`):
  - zero unresolved health rows → `{kind:"ok"}` (only the total head count issued — short-circuit).
  - ≥1 degraded row → `kind:"degraded"`, `count` = exact total.
  - only notice rows → `kind:"notice"`.
  - construction throw / returned `{error}` / non-number count → `{kind:"infra_error"}`; `data===null` on a head probe is NOT infra_error.
  - summaries: seed 3 rows of code A (dougSummary "X") + 1 of code B ("Y") → `summaries` has `{text:"X",count:3}` before `{text:"Y",count:1}` when both same weight, degraded-first when weights differ; `overflowCount` exact when >4 distinct summaries.
  - truncation-proof: a large `notice` volume + one degraded code still yields `kind:"degraded"` and the degraded summary present (per-code exact counts).
  - **uncataloged code (AC10, plan-R6 finding 3):** seeding an unresolved row with an uncataloged `code` (∉ `HEALTH_CODES`) leaves the rollup `{kind:"ok"}` (the row is not counted by any health head-count — the rollup only `.in("code", HEALTH_CODES)`), proving unknown codes are excluded from the health rollup (they remain fail-visible on Doug surfaces per Task 4).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per spec §6.1: (1) exact head count over `HEALTH_CODES` → `count`; if 0 return `{kind:"ok"}`. (2) exact head count over `DEGRADED_HEALTH_CODES` → `degradedCount`; kind = degraded if >0 else notice. (3) `Promise.all` of per-code exact head counts over `HEALTH_CODES` (each `.select("id",{count:"exact",head:true}).is("resolved_at",null).eq("code",c)`), map codes with count>0 → `dougSummaryFor`, dedupe by text summing counts, sort degraded-first then count desc, slice `POPOVER_SUMMARY_CAP`, `overflowCount` = distinctCount - shown. All `{data,error}` destructured; success on `typeof count === "number"`.
- [ ] **Step 4: Register meta rows** — add `fetchHealthRollup` to `_metaInfraContract` (count-head contract, mirror `fetchUnresolvedAlertCount:244`; `data:null` normal) and `lib/admin/healthRollup.ts` to `_metaBoundedReads` (all count-head).
- [ ] **Step 5: Run → PASS** (new test + both meta-tests) + typecheck. **Commit** — `feat(admin): bounded exact fetchHealthRollup + infra/bounded meta rows`

---

### Task 4: Exclude `HEALTH_CODES` from Doug surfaces (banner, bell count, per-show)

**Files:**
- Modify: `components/admin/AlertBanner.tsx` (`:71-73` `INFO_SEVERITY_CODES`, `:116-127` query), `lib/admin/alertCount.ts` (`:6-27`), `components/admin/PerShowAlertSection.tsx` (`:119-122`)
- Modify/Create tests: `tests/components/alertBanner.*`, `tests/admin/alertCount.test.ts`, `tests/components/perShowAlertSection.*`

**Interfaces:**
- Consumes: `DOUG_EXCLUDED_CODES` (= info ∪ health) for banner + count; `HEALTH_CODES` (health only) for the per-show section (Task 2).

> **Two different exclusion sets (plan-R2 finding 1).** The banner + bell count ALREADY
> exclude info-severity codes today, so they exclude `DOUG_EXCLUDED_CODES` (info ∪ health).
> `PerShowAlertSection` does NOT exclude info codes today (it shows all show-scoped
> unresolved rows, incl. `SHOW_FIRST_PUBLISHED`), so it must exclude **`HEALTH_CODES` ONLY**
> — adding an info exclusion there would newly drop `SHOW_FIRST_PUBLISHED`'s existing
> per-show affordance (a regression). Spec §5 surface table says per-show excludes
> `HEALTH_CODES`.

- [ ] **Step 1: Failing tests** — (a) `alertCount` excludes a seeded `WEBHOOK_TOKEN_INVALID` row AND a seeded `SHOW_FIRST_PUBLISHED` row (info stays excluded — plan-R4 finding 2) from the count, but still counts a `SHEET_UNAVAILABLE` row AND an uncataloged `TOTALLY_UNKNOWN_CODE` row (exclusion-not-allowlist, AC10). (b) `AlertBanner` does not render a top `WEBHOOK_TOKEN_INVALID` NOR a top `SHOW_FIRST_PUBLISHED` (info stays banner-excluded) but renders `SHEET_UNAVAILABLE`; a seeded uncataloged code still surfaces (counted/present) **but AC7/invariant-5: the raw code string `TOTALLY_UNKNOWN_CODE` does NOT appear in the DOM** — it degrades via the existing unknown-code guard (`AlertBanner.tsx:258` `isMessageCode` → null → safe degraded shell, no raw code). (c) `PerShowAlertSection` filters a show-scoped `TILE_PROJECTION_FETCH_FAILED` out but **still renders a show-scoped `SHOW_FIRST_PUBLISHED`** (info, NOT health — per-show does NOT exclude info) AND a `PARSE_ERROR_LAST_GOOD`; a show-scoped unknown code surfaces via the existing `safeDougFacingTemplate` null-fallback path **without leaking the raw code string** (AC7).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — banner (`AlertBanner.tsx`) + count (`alertCount.ts`): replace the `INFO_SEVERITY_CODES`-only exclusion with `DOUG_EXCLUDED_CODES` (info ∪ health). PerShowAlertSection (`PerShowAlertSection.tsx`): add a `.not("code","in", \`(${HEALTH_CODES.map(c=>`"${c}"`).join(",")})\`)` clause (HEALTH ONLY — do NOT exclude info there). Keep the empty-list guard on both. `SHOW_FIRST_PUBLISHED` stays banner-excluded (info) but per-show-visible (not health).
- [ ] **Step 4: Run → PASS** + `pnpm vitest run tests/components tests/admin` + typecheck.
- [ ] **Step 5: Commit** — `feat(admin): exclude health codes from Doug alert surfaces (exclusion, unknowns stay visible)`

---

### Task 5: `AppHealthIndicator` (nav dot) + `AppHealthPopover` (Doug) / dev deep-link

**Files:**
- Create: `components/admin/nav/AppHealthIndicator.tsx`, `components/admin/AppHealthPopover.tsx`
- Create: `tests/components/appHealthIndicator.test.tsx`

**Interfaces:**
- Consumes: `HealthStatus` (Task 3).
- Produces: `AppHealthIndicator({ rollup: HealthStatus; isDeveloper: boolean })`. Doug → `<button data-testid="app-health-indicator">` opening `AppHealthPopover`; dev → `<Link href="/admin/observability#health">`. Dot classes: `degraded`→`bg-status-degraded`, `notice`→`bg-status-warn`, `ok`→`bg-status-positive`, `infra_error`→`bg-status-idle`. Always paired with an `aria-label`/`title` naming the state (color-blind floor). `min-h-tap-min min-w-tap-min inline-flex items-center justify-center` (matches `NotifBell.tsx:34`). `data-testid` on the dot: `app-health-dot-{kind}`.

- [ ] **Step 1: Failing tests** (jsdom render): each kind renders the right dot testid + aria-label text ("System health: needs attention" for degraded/notice, "All systems normal" for ok, "System health status unknown" for infra_error); Doug renders a button, dev renders an anchor to `/admin/observability#health`; popover lists `summaries` lines + "+N more" when `overflowCount>0` + the exact closing line "No action needed from you — the developer can see this in system health." and never contains "notified".
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 2b: Write the real-browser layout assertion FAIL-FIRST (mandatory — fixed-height nav; fold of former Task 11).** `tests/e2e/appHealthIndicator.layout.spec.ts` (Playwright) or a chrome-devtools `evaluate_script` harness per `reference_standalone_realbrowser_layout_harness` (Tailwind CLI build + static HTML mounting `AppHealthIndicator` beside `NotifBell`). **Dimensional invariants (spec §8 verbatim):** nav action cluster → `AppHealthIndicator` is `inline-flex items-center justify-center min-h-tap-min min-w-tap-min` (44×44, vertically centered); indicator button → dot+icon `items-center gap-2`. Assert `getBoundingClientRect()` on `[data-testid="app-health-indicator"]` and `[data-testid="admin-notif-bell"]`: both height ≥44px, equal within 0.5px, both vertically centered within 0.5px. Jsdom NOT sufficient. Run → FAIL (component absent).
- [ ] **Step 2c: Write the transition-audit test FAIL-FIRST (mandatory — multi-state; fold of former Task 12).** `tests/components/appHealthIndicator.transitions.test.tsx`. **Transition inventory (spec §9 verbatim):** indicator states ok/notice/degraded/unknown — all 6 pairs INSTANT (no animation props on the dot across the 4 kinds); popover closed→open / open→closed use the sheet pattern's enter/exit and respect `prefers-reduced-motion` (`motion-reduce`); compound: changing `rollup` while the popover is open does not remount/mutate the open panel mid-flight. Run → FAIL.
- [ ] **Step 3: Implement** — `AppHealthIndicator` (client component; icon `Activity` from lucide). `AppHealthPopover` reuses the responsive sheet/popover pattern (`reference_responsive_modal_sheet_pattern`: bottom-sheet mobile / anchored desktop, `useDialogFocus` + scrim); title "System status"; body = `summaries.map(s => \`${s.text}\` + (s.count>1?` ×${s.count}`:""))`; overflow note; closing reassurance line; fallback line when summaries empty but count>0.
- [ ] **Step 4: Run → PASS** — jsdom behavior + real-browser layout + transition audit all green; + typecheck.
- [ ] **Step 5: Commit** — `feat(admin): AppHealthIndicator nav dot + popover (+ layout & transition gates)`

---

### Task 6: Thread the rollup into `AdminNav` + `OnboardingTopBar` (incl. onboarding chrome)

**Files:**
- Modify: `app/admin/layout.tsx` (`:145` Promise.all; compute `fetchHealthRollup()` + `isCurrentUserDeveloper()` BEFORE the `inOnboarding` branch at `:113-134`; pass to both bars at `:134` and `:163`), `components/admin/nav/AdminNav.tsx` (`:34-39` props, `:114` render), `components/admin/nav/OnboardingTopBar.tsx`
- Modify tests: `tests/admin/adminLayout.*` (or component tests for the two bars)

**Interfaces:**
- Consumes: `fetchHealthRollup` (Task 3), `isCurrentUserDeveloper` (`lib/auth/requireDeveloper.ts:258`), `AppHealthIndicator` (Task 5).

- [ ] **Step 1: Failing tests** — `AdminNav` renders `<AppHealthIndicator>` beside `<NotifBell>` given a rollup prop; `OnboardingTopBar` renders it too; with `inOnboarding===true` + a degraded rollup, the indicator appears (AC13).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — hoist `const [alertCount, needsAttentionCount, healthRollup, isDeveloper] = await Promise.all([...])` above the `inOnboarding` return (rollup short-circuits cheap); add `healthRollup`/`isDeveloper` props to `AdminNav` + `OnboardingTopBar`; render `<AppHealthIndicator rollup={healthRollup} isDeveloper={isDeveloper} />`.
- [ ] **Step 4: Run → PASS** + typecheck.
- [ ] **Step 5: Commit** — `feat(admin): render app-health indicator in admin nav + onboarding chrome`

---

### Task 7: `AppHealthPanel` on the dashboard (own pinned read)

**Files:**
- Create: `components/admin/AppHealthPanel.tsx`
- Modify: `app/admin/page.tsx` (render below `AlertBanner` in `DashboardWithHeader`, `:110-118`)
- Create test: `tests/components/appHealthPanel.test.tsx`

**Interfaces:**
- Consumes: `fetchHealthRollup` (Task 3), `isCurrentUserDeveloper`.
- Produces: `AppHealthPanel` (async server component) doing its OWN `fetchHealthRollup()` read; renders a `StatusIndicator`-style row: ok → "All systems normal" (positive), else the worst-active state + count; Doug → popover trigger, dev → "View details →" `/admin/observability#health`.

- [ ] **Step 1: Failing test** — `/admin` renders `data-testid="app-health-panel"` from a seeded degraded rollup (mock `fetchHealthRollup`); shows "All systems normal" on ok (AC12 first clause).
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: PASS** + typecheck.
- [ ] **Step 5: Commit** — `feat(admin): dashboard app-health panel (own rollup read)`

---

### Task 8: `HealthAlertsPanel` dev detail (partitioned paginated queries + rows + action links)

**Files:**
- Create: `lib/admin/healthAlerts.ts` (loader), `components/admin/observability/HealthAlertsPanel.tsx`
- Modify: `app/admin/observability/page.tsx` (render above `CronHealthHeader`, `:20` already `requireDeveloperIdentity()`), `tests/admin/_metaInfraContract.test.ts` + `tests/admin/_metaBoundedReads.test.ts` (register the loader — already declared Task 3 inventory; add here if not).
- Create tests: `tests/admin/healthAlerts.test.ts`, `tests/components/healthAlertsPanel.test.tsx`

**Interfaces:**
- Produces: `loadHealthAlerts({ weight: "degraded"|"notice", page: number }): Promise<{ kind:"ok"; rows: HealthAlertRow[]; hasMore: boolean } | { kind:"infra_error" }>` where `HealthAlertRow = { id; code; show_id; slug: string|null; context: Record<string,unknown>|null; occurrence_count; raised_at }`. Two partitioned queries (degraded set, notice set), each `.in("code", set).is("resolved_at",null).order("raised_at",{ascending:false}).range(page*SIZE, page*SIZE + SIZE)` — i.e. requests **`SIZE + 1` rows** (plan-R2 finding 2): `hasMore = data.length > SIZE`; return `rows = data.slice(0, SIZE)`. A bare `.range(page*SIZE,(page+1)*SIZE-1)` (exactly SIZE) CANNOT distinguish a full page from a larger partition, so the `+1` sentinel is REQUIRED. `HEALTH_PANEL_PAGE_SIZE = 50`. Selects `id, code, show_id, context, occurrence_count, raised_at, shows(slug)`.
- Consumes: `DEGRADED_HEALTH_CODES`/`NOTICE_HEALTH_CODES` (Task 2), `resolveAlertAction` (`lib/adminAlerts/alertActions.ts`), `messageFor`/`isMessageCode` (`lib/messages/lookup.ts`), `resolveHealthAlertFormAction` (Task 9 — wire the button in Task 9's step).

**UI pagination contract (plan-R3 finding 1 — loader `hasMore` is not enough; the extra rows must be REACHABLE + RESOLVABLE through the UI):** `HealthAlertsPanel` reads per-partition page indices from the observability page's `searchParams` (`?dpage=N` degraded, `?npage=N` notice — the page already `await`s `searchParams` at `page.tsx:16`). Each partition renders its page's rows; when `loadHealthAlerts(...).hasMore`, it renders a **"Load more" `<Link>`** to the same URL with the partition's page param incremented (preserving other params + the `#health` anchor). SSR-native (no client fetch). Page params default to 0; a non-numeric/negative param clamps to 0.

> **TDD ordering (plan-R4 finding 1):** Task 8 builds the panel + rows + action links +
> pagination and proves rows are **REACHABLE**. It does NOT render the Resolve control —
> `resolveHealthAlertFormAction` + `HealthAlertResolveButton` are introduced in Task 9,
> which then wires the button into these rows and proves **RESOLVABILITY** (incl. page 2).
> This keeps each task's tests satisfiable without forward-referencing unbuilt code.

- [ ] **Step 1: Failing tests** — (a) loader: array-shape typed read; returned/thrown error → `infra_error`; degraded query separate from notice; requests `SIZE+1`; **`hasMore` is true for exactly `PAGE_SIZE+1` rows and false for exactly `PAGE_SIZE` rows, in BOTH the degraded and notice partitions**, and `rows` is trimmed to `PAGE_SIZE`. (b) panel renders per-row lookup copy (no raw code), a `healthWeight` chip, a show link when `show_id`, `raised_at`, `occurrence_count`; renders `resolveAlertAction` link for each of the 6 action-link health codes (`PICKER_SELECTION_RACE`, `ROLE_FLAGS_NOTICE`, `WIZARD_SESSION_SUPERSEDED_RACE`, `REPORT_ORPHANED_LOST_LEASE`, `BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) given appropriate `context`/`slug`; degraded section renders before notice; with >PAGE_SIZE notices + an older degraded row, the degraded row is in the degraded section (reachable) (AC9 R13). (c) empty → "No open system-health alerts.". (d) **UI pagination REACHABILITY (plan-R3):** seeding `PAGE_SIZE+1` degraded rows renders a "Load more" link to `?dpage=1`; rendering the panel with `?dpage=1` shows the 51st degraded row (a `data-testid` row present); same for `?npage=1` with `PAGE_SIZE+1` notice rows; a non-numeric `dpage` clamps to page 0. (Resolvability of these rows is asserted in Task 9.)
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** the loader + panel (rows WITHOUT the resolve control yet) + wrapper `id="health"` + `data-testid="health-alerts-panel"` + per-partition "Load more" links. **Step 4: Register** loader in `_metaInfraContract` (array-shape) + `_metaBoundedReads` (`.range`) if not already. **Step 5: PASS** + typecheck.
- [ ] **Step 6: Commit** — `feat(admin): dev HealthAlertsPanel (partitioned paginated detail + action links)`

---

### Task 9: `resolveHealthAlertFormAction` (dev-gated, attributable, zero-row-safe) + outcome registry

**Files:**
- Modify: `app/admin/actions.ts` (add the action)
- Create: `components/admin/observability/HealthAlertResolveButton.tsx` (client button bound to the action; wire into `HealthAlertsPanel`)
- Modify: `tests/log/_metaAdminOutcomeContract.test.ts` (register), `tests/admin/_metaInfraContract.test.ts` producer note
- Create test: `tests/admin/resolveHealthAlert.test.ts`

**Interfaces:**
- Produces: `async function resolveHealthAlertFormAction(formData: FormData): Promise<void>` (reads `id`). Gates `requireDeveloperIdentity()`; fetches row `{code, show_id}` (`{data,error}`); rejects `code ∉ HEALTH_CODES` (throw/deny, no write); UPDATE `.update({resolved_at, resolved_by: devEmail}).eq("id",id).is("resolved_at",null).select("id")` → success only if `data.length===1`; on success awaits `logAdminOutcome({ code:"ADMIN_ALERT_RESOLVED", source:"app.admin.actions.resolveHealthAlert", actorEmail: devEmail, ...(showId ? { showId } : {}), extra:{ alertId: id } })` — matching the live `AdminOutcome` shape (`lib/log/logAdminOutcome.ts:8-21`: `source` is REQUIRED; there is NO `target` field; the alert id goes in `extra`, the show id in `showId`) — then `revalidatePath("/admin","layout")` + `revalidatePath("/admin/observability")`; zero-row / error / throw → no log, no revalidate (throw to boundary on error). Carries `// not-subject-to-meta: server action with no typed-result contract`.

- [ ] **Step 1: Failing tests** — non-developer → denied, `resolved_at` unchanged, no log (mock `requireDeveloperIdentity` throwing `forbidden`); developer + health id → row resolved, `resolved_by` set, one awaited `ADMIN_ALERT_RESOLVED` with actor; `code ∉ HEALTH_CODES` → rejected, no write; zero-row UPDATE (already resolved) → no log, no revalidate; UPDATE error → throws, no revalidate. **Wiring/resolvability (plan-R4 finding 1):** after wiring `HealthAlertResolveButton` into `HealthAlertsPanel` rows, a row on page 2 (`?dpage=1` with `PAGE_SIZE+1` degraded rows; and `?npage=1`) renders its Resolve control and a form submit invokes `resolveHealthAlertFormAction` with that row's id — proving page-2 rows are RESOLVABLE, not just reachable. **End-to-end resolution (AC11/AC12, plan-R6 finding 2):** (i) a developer resolves a **global** health row AND a **show-scoped** health row (e.g. `TILE_PROJECTION_FETCH_FAILED`) through the action; each drops out of both `fetchHealthRollup` (assert `kind` recomputes / count decrements) AND the `HealthAlertsPanel` after revalidation; (ii) assert the action calls **`revalidatePath("/admin","layout")` AND `revalidatePath("/admin/observability")`** via a mocked `revalidatePath` (spy) — resolving the LAST health alert flips the rollup to `{kind:"ok"}` so the nav dot returns green; (iii) a **real-browser** resolve flow (Playwright, reusing the `reference_step3_modal_realbrowser_harnesses` approach) clicks Resolve on `/admin/observability#health`, asserts the URL stays on `#health` (Server Action revalidate, no navigation), the row disappears, and the response is NOT raw JSON.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** the action + client button; wire button into `HealthAlertsPanel` rows (built in Task 8). **Step 4: Register** in `_metaAdminOutcomeContract` (reuse `ADMIN_ALERT_RESOLVED`). **Step 5: PASS** + typecheck.
- [ ] **Step 6: Commit** — `feat(admin): dev-gated resolveHealthAlertFormAction (attributable, zero-row-safe)`

---

### Task 10: Close the legacy resolve bypass (3 endpoints reject health codes) + guard meta-test

**Files:**
- Modify: `app/admin/actions.ts` (`resolveAdminAlertFormAction` — fetch row code, reject if `∈ HEALTH_CODES`), `app/api/admin/admin-alerts/[id]/resolve/route.ts` (add `a.code` to the SELECT `:103`, reject health), `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` (add `code` to select `:109`, reject health)
- Create: `tests/admin/healthResolveGuard.test.ts`

**Interfaces:**
- Consumes: `HEALTH_CODES` (Task 2).

- [ ] **Step 1: Failing tests** — direct-invoke each of the 3 legacy **product** surfaces on a health-code row (global + show-scoped) → rejected, `resolved_at` null; a `doug`-code row still resolves through each unchanged; a structural assertion that each surface references `HEALTH_CODES` in its reject path. **Auto-resolution still works (AC11b, plan-R8 finding — the guard must NOT be overbroad):** a test asserting the internal helper `resolveAdminAlert({ showId, code })` (`lib/adminAlerts/resolveAdminAlert.ts:11` — the PR #283 auto-resolution path) **still resolves a health-code row programmatically** (it is NOT one of the three guarded product surfaces). The structural guard wording is scoped to human/product entry points only. Documentation test: a raw direct `admin_alerts` UPDATE is NOT blocked at the DB (records the accepted escape hatch, `BL-HEALTH-RESOLVE-DB-LOCKDOWN`).
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** the three guards. **Step 3b: Add the BACKLOG entry NOW (plan-R5 finding 2 — the spec accepts the direct-PostgREST bypass ONLY because this tracks it, so it MUST land in the PR, not post-merge):** append `BL-HEALTH-RESOLVE-DB-LOCKDOWN` to `BACKLOG.md` (revoke direct `admin_alerts` UPDATE + route resolution through `SECURITY DEFINER` RPCs with `is_developer()` for health codes; cross-ref `BL-ADMIN-POSTGREST-DML-LOCKDOWN`). Use `printf` append (never `echo >>` — newline discipline) and verify. **Step 4: PASS** + run `tests/admin tests/messages` + typecheck.
- [ ] **Step 5: Commit** — `feat(admin): reject health codes on legacy resolve surfaces + BL-HEALTH-RESOLVE-DB-LOCKDOWN`

---

> **NOTE (plan-R5 finding 1):** the mandatory **layout-dimensions** and **transition-audit**
> tests are FOLDED INTO Task 5 (Steps 2b/2c) as FAIL-FIRST tests written before the component
> implementation — not standalone post-hoc tasks (which would pass first-run and violate
> fail-first TDD). Their exact spec §8 invariant list and §9 transition inventory live in
> Task 5.

### Task 11: Impeccable dual-gate (invariant 8) — UI surfaces

- [ ] Run `/impeccable critique` on the diff (all new components + globals.css token + nav/dashboard/observability changes).
- [ ] Run `/impeccable audit` on the same diff.
- [ ] Fix all HIGH/CRITICAL findings, or defer via `DEFERRED.md` entries. Record findings + dispositions in the plan's close-out notes.
- [ ] Commit any fixes: `fix(admin): impeccable dual-gate findings for app-health UI`

---

### Task 12: Whole-diff cross-model adversarial review (Codex)

- [ ] Fetch + rebase onto latest `origin/main`; re-diff (guard against stale-base phantom files).
- [ ] Run the codex-companion `adversarial-review --wait` (fresh-eyes, REVIEWER ONLY) on the whole implementation diff; iterate to APPROVE (no round budget). Triage findings via deferral discipline (land-now / DEFERRED.md / BACKLOG.md).

---

### Task 13: Verification + close-out

- [ ] `pnpm typecheck` + `pnpm format:check` (fix + `prettier --write` changed files if needed) + FULL `pnpm vitest run` green locally (call out any pre-existing failures verified at merge-base).
- [ ] Push branch; open PR; confirm **real CI green** (`gh pr checks <PR#> --watch`; mergeStateStatus CLEAN).
- [ ] `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] Confirm the `BL-HEALTH-RESOLVE-DB-LOCKDOWN` BACKLOG entry (committed in Task 10) is present in the merged diff.

## Self-review notes

- Spec coverage: AC1–AC14 map to Tasks 4 (AC1/AC2/AC10), 1 (AC6/AC14), 3+5+7 (AC3/AC4/AC4b/AC4c/AC12), 8 (AC9/action links/R13), 9+10 (AC11/AC11b), 6 (AC13), 5 (AC5 layout), 3 (AC8). §6.7 → Task 10. §7 copy → Task 1. Layout/transition gates → Task 5 (folded, fail-first).
- Type consistency: `HealthStatus`/`HealthSummaryLine` defined Task 3, consumed Tasks 5/6/7. `HealthAlertRow` defined Task 8, consumed Task 9's button wiring. `resolveHealthAlertFormAction` defined Task 9, wired into the Task-8 panel in Task 9.
- No placeholders: each task carries concrete test intent + implementation shape + exact paths/line anchors.
