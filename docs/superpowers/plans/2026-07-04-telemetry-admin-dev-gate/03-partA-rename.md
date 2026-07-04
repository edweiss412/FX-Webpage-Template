# Phase P2 — Part-A Rename (Tasks 7–10)

Part A is a MOVE + RENAME + access-gate-inventory change with **zero data/render-logic change** — the page keeps its `requireDeveloperIdentity()` gate. Two independent, separable commits (component/type rename; redirect; structural test) bracket ONE large **atomic** route-rename commit. The route move is atomic because relocating the route file simultaneously breaks `build-artifact-gate`, the `PROTECTED_ROUTES` classification scan, the `auth-chain-audit` regression pin, the `developerGatingContract` registry, and every route-referencing test — none can be split into a separate green commit. Per spec §2.1a, the `/admin/dev` gate inventory is a mandatory full-sweep unit ("do not fix piecemeal").

**Pre-draft grep the implementer MUST run first (spec §2.1a completeness basis):** `git grep -n "admin/dev" -- ':!docs/**' ':!app/admin/dev/**'` (spec cites 175 matches) — reconcile every match against the §2.1a items 1–8 (functional-break vs accurate-comment vs incidental). A match not accounted for is a spec gap to ESCALATE, not silently fix.

---

### Task 7: Component dir + type file rename + all importers + component-internal tokens

Implements spec §2.2, §2.3b (component scope). Self-contained: the route pages stay at their current paths and just import the renamed deps, so nothing else goes red. **Do NOT rename the `observe` namespace** — only its IMPORT of the renamed type updates (spec §1, §2.2).

**Files (git mv + import updates):**
- `components/admin/observability/` → `components/admin/telemetry/` (9 files: AutoRefreshControl, ContextDetail, CronHealthHeader, CronRunSummaryCard, EventFilters, EventLevelBadge, EventRow, EventTimeline, cronHealthStatus). Component export names unchanged (none contain "observability").
- `lib/admin/observabilityTypes.ts` → `lib/admin/telemetryTypes.ts` (exported symbols `parseAppEventFilters`, `AppEventFilters`, etc. keep their names).
- `tests/components/observability/` → `tests/components/telemetry/` (10 test files; update component import paths).
- Update EVERY importer of `@/components/admin/observability/*` and `@/lib/admin/observabilityTypes` tree-wide. Verified importer set (`git grep -l`): the two route pages (`app/admin/observability/page.tsx`, `app/admin/dev/observability-dim/page.tsx`), all 9 components, `lib/admin/loadAppEvents.ts`, `lib/admin/loadCronHealth.ts`, and the **observe-CLI files that import the renamed type** (spec §2.2 — a mechanical cross-boundary fix, NOT an `observe`-namespace rename): `lib/observe/query/cronHealth.ts:10`, `lib/observe/query/events.ts:9`, `scripts/observe.ts:19`, `scripts/observe/args.ts:3`, `scripts/observe/collect.ts:2`, `scripts/observe/format.ts:2`, `tests/observe/collect.test.ts:57`, the stale-name comment in `lib/observe/query/types.ts:2`, and `tests/admin/parseAppEventFilters.test.ts`. Re-grep to confirm none missed.

- [ ] **Step 1: git mv the dirs/files** (preserves history) and update all import paths above. Rename the localStorage key `fxav.observability.autorefresh` → `fxav.telemetry.autorefresh` (`components/admin/telemetry/AutoRefreshControl.tsx:7`) — a deliberate one-time autorefresh-pref reset for an internal admin tool (spec §2.3b; alternatively keep the legacy key with an inline `// legacy-compat key` comment — must be a DELIBERATE, commented decision). Rename any `observability-*` `data-testid` that lives in a component (grep `components/admin/telemetry` for `observability`).
- [ ] **Step 2: Verify** — `git grep -n "components/admin/observability"` → 0; `git grep -n "observabilityTypes"` → 0; `git grep -n "fxav.observability"` → 0 (unless the commented legacy-compat path was chosen). `pnpm typecheck` clean. Run the moved component tests: `pnpm vitest run tests/components/telemetry/ tests/admin/parseAppEventFilters.test.ts tests/observe/` → green.
- [ ] **Step 3: Commit**

```bash
git add -A
git commit --no-verify -m "refactor(admin): rename observability components + type to telemetry (importers incl observe CLI)"
```

---

### Task 8: Route relocation + comprehensive §2.1a `/admin/dev` prod-route gate inventory (ONE atomic commit)

Implements spec §2.1, §2.1a, §2.3, §2.3a, §2.5, §2.6. **The route page keeps `requireDeveloperIdentity()` as its first statement — zero gate/render change.** This is the atomic "move the route and update every reference + every gate that assumed all of `/admin/dev/**` is dev-only-build-gated" commit.

**A. git mv the two route files (+ testids):**
- `app/admin/observability/page.tsx` → `app/admin/dev/telemetry/page.tsx` (prod-available; NOT added to the disable-list). Keep `requireDeveloperIdentity()` first-statement.
- `app/admin/dev/observability-dim/page.tsx` → `app/admin/dev/telemetry-dim/page.tsx` (stays build-disabled). Rename its `data-testid="observability-dim-harness"` (`:110`) → `telemetry-dim-harness`.

**B. §2.1a comprehensive gate inventory (all 8 items, atomically):**
1. **`scripts/with-admin-dev-flag.mjs` disable list (`:44-55`)** — change `"app/admin/dev/observability-dim/page.tsx"` (`:55`) → `"app/admin/dev/telemetry-dim/page.tsx"`. Do NOT add `telemetry/page.tsx` (⇒ prod-available). Update the adjacent comment (`:52-54`).
2. **`app/globals.css:20`** — the `@source not "../app/admin/dev";` excludes the whole tree from Tailwind scanning, so the prod telemetry page would ship with NO CSS for its classes. Fix: add `@source "../app/admin/dev/telemetry";` (Tailwind v4 include after the parent `@source not`). Verify the include re-adds the subtree by building and confirming a telemetry-only class is generated; if `not`+include does not compose in v4, instead narrow the exclusion to the specific dev-only paths (`@source not "../app/admin/dev/page.tsx"`, `.../actions.ts`, `.../source-link-dim`, `.../telemetry-dim`). (Codex R3 HIGH.)
3. **`tests/admin/build-artifact-gate.test.ts` (`:101`, `:120`, `:131`)** — EXPECT `/admin/dev/telemetry` PRESENT in the prod (flag-unset) artifact while `/admin/dev` (panel), `/admin/dev/source-link-dim`, `/admin/dev/telemetry-dim` stay ABSENT: (`:101`) the route-dir absence assertion becomes "telemetry dir EXISTS, the dev-only trio dirs do NOT"; (`:120`) exclude `/admin/dev/telemetry` from the `startsWith("/admin/dev")` app-paths-manifest "should be empty" filter; (`:131`) change the routes-manifest `includes("/admin/dev")===false` to permit the telemetry path (assert the dev-only trio absent). The flag=true control test (`:137`) is unaffected.
4. **`tests/cross-cutting/no-raw-codes-audit.ts:319`** `.filter((path) => !path.startsWith("app/admin/dev/"))` — narrow so `app/admin/dev/telemetry/**` IS crawled (prod user-facing) while the dev-only paths stay excluded (e.g. add `|| path.startsWith("app/admin/dev/telemetry/")`). (invariant-5 coverage.)
5. **e2e `a[href*='/admin/dev']` count-zero assertions** — `tests/e2e/admin-phase2-surfaces.spec.ts:35` (the `assertNoAdminDevLinks` helper) AND `tests/e2e/onboarding-wizard-step1.spec.ts:71`: narrow the predicate to allow `/admin/dev/telemetry` while still forbidding `/admin/dev`, `/admin/dev/source-link-dim`, `/admin/dev/telemetry-dim`. Verify each spec's viewer identity — if it signs in as a NON-developer the telemetry nav item is server-side absent (count stays 0), but narrow the predicate regardless so it can't accidentally pass/fail on the exception.
6. **`tests/e2e/admin-banner.spec.ts:14,379`** — confirm the PreviewBanner-absence rule applies equally to `/admin/dev/telemetry`; if the spec navigates only to `/admin/dev` (404 in prod) it is unaffected — confirm and add a telemetry case only if the banner-absence contract should cover it.
7. **Comment/prose carve-outs** (BLANKET-absence claims only) — `playwright.config.ts` (`:10,13,99,194,196,225,267,291`), `tests/e2e/admin-dev.spec.ts` (`:15-18,60-62,84-86,99-101`), `.github/workflows/dev-gate-e2e.yml:4-8`: add a one-line carve-out that the dev PANEL + `source-link-dim` + `telemetry-dim` remain 404 in prod while `/admin/dev/telemetry` is the deliberate prod-available exception. **Leave incidental accurate comments** that describe the dev panel (per spec §2.1a.7 list: `components/admin/PreviewBanner.tsx:17`, `DevToolsRow.tsx:8`, `lib/audit/trustDomains.ts:49,52`, and the enumerated test comments) unchanged.
8. **`tests/auth/developerGatingContract.test.ts:110`** `observability-dim` registry row → `telemetry-dim` (file path `app/admin/dev/telemetry-dim/page.tsx`); AND the `observability-page` row (`:116-117`) file path → `app/admin/dev/telemetry/page.tsx` (keep `gate:"requireDeveloperIdentity"`; update `id` to `telemetry-page`).

**C. Path references (atomic with the move):**
- **`lib/audit/trustDomains.ts` PROTECTED_ROUTES** — `app/admin/observability/page.tsx` (`:41`) → `app/admin/dev/telemetry/page.tsx`; `app/admin/dev/observability-dim/page.tsx` (`:53`) → `app/admin/dev/telemetry-dim/page.tsx`. Both keep `chain:["requireDeveloper"]`. Update the adjacent comments.
- **`tests/cross-cutting/auth-chain-audit.test.ts:31-37`** DEVELOPER_ROUTES pin — `app/admin/dev/observability-dim/page.tsx` (`:34`) → `app/admin/dev/telemetry-dim/page.tsx`; `app/admin/observability/page.tsx` (`:35`) → `app/admin/dev/telemetry/page.tsx`. (The `arrayContaining` full-registry pin at `:13-19` lists only picker/API surfaces — no change; but its `classification-only` scan at `:12` stays green ONLY because PROTECTED_ROUTES was renamed in lockstep here.)
- **Nav** (`components/admin/nav/navConfig.ts`): id union member (`:5`) `"observability"` → `"telemetry"`; entry `id` (`:41`) → `"telemetry"`, `label` (`:42`) `"Activity"` → `"Telemetry"`, `short` (`:43`) `"Activity"` → `"Telemetry"`, `href` (`:44`) `/admin/observability` → `/admin/dev/telemetry`; `developerOnly:true` STAYS; the `Activity` lucide icon STAYS; the active-state logic (`:67-72` `inObservability` / `id === "observability"`) → `inTelemetry` matching `/admin/dev/telemetry`. `AdminNav.tsx`: verify no hardcoded `"observability"` string remains.
- **Settings Diagnostics link** (`app/admin/settings/page.tsx`): `href` (`:300`) → `/admin/dev/telemetry`; `data-testid` (`:301`) `admin-settings-observability-link` → `admin-settings-telemetry-link`; copy "Activity" (`:278-309` — the section prose + link label) → "Telemetry".

**D. Route-referencing test renames (atomic — these import/assert the old path):**
- `tests/admin/observability-requires-developer.test.ts` → `telemetry-requires-developer.test.ts` (update imported page path to `app/admin/dev/telemetry/page.tsx`).
- `tests/admin/observabilityRouteAudit.test.ts` → `telemetryRouteAudit.test.ts` (update the asserted PROTECTED_ROUTES path `:9`, the settings-links path `:17`, and the harness path `:24` to their new values).
- `tests/app/admin/observabilityPage.test.tsx` → `telemetryPage.test.tsx`.
- `tests/e2e/observability-layout.spec.ts` → `telemetry-layout.spec.ts` (update the route URL to `/admin/dev/telemetry`) AND update the ROOT Playwright `testMatch` regex `playwright.config.ts:66` (`observability-layout` → `telemetry-layout`) — else the desktop project silently stops running the renamed real-browser layout spec (Codex R5 MED). (`tests/e2e/standalone.config.ts:22-23` testMatch contains NO observability entry — no change; verified.)

- [ ] **Step 1: Do the full sweep (A–D)** in one working set. This is a MOVE — the page body (its `requireDeveloperIdentity()` gate + render) is unchanged.
- [ ] **Step 2: Verify — grep-zero (spec §2.3b RENAME-SURFACE greps; NOT a blanket `git grep observability`):**
  - `git grep -n "admin/observability"` → 0
  - `git grep -n "observability-dim"` → 0
  - `git grep -n "observability-layout"` → 0
  - `git grep -n "admin-settings-observability-link"` → 0
  - `git grep -n 'id: "observability"\|"observability"' components/admin/nav/navConfig.ts` → 0
  - Residual scan `git grep -n "observability" -- app/admin/ components/admin/telemetry` shows only intentional generic-word comments (update those that NAME the renamed feature to "Telemetry"; a bare monitoring-concept usage may stay). **Do NOT** touch the `observe` namespace or the ~58 generic "observability" uses in `lib/log/persist.ts`, `lib/cron/withCronRunSummary.ts`, `lib/sync/applyParseResult.ts`, crew/callback/test-seam code (spec §2.3b).
- [ ] **Step 3: Run the gate suites** — `pnpm vitest run tests/admin/build-artifact-gate.test.ts tests/cross-cutting/auth-chain-audit.test.ts tests/auth/developerGatingContract.test.ts tests/admin/telemetryRouteAudit.test.ts tests/admin/telemetry-requires-developer.test.ts tests/app/admin/telemetryPage.test.tsx tests/cross-cutting/no-raw-codes.test.ts` → green. Spot-check the prod artifact: `ADMIN_DEV_PANEL_ENABLED` unset `pnpm build` → confirm `.next` contains `/admin/dev/telemetry` and NOT the dev-only trio (build-artifact-gate encodes this; a manual confirm is cheap given Codex R1+R3 burned three rounds on this vector). `pnpm typecheck` + `pnpm format:check` clean.
- [ ] **Step 4: Commit**

```bash
git add -A
git commit --no-verify -m "feat(routing): relocate /admin/observability → /admin/dev/telemetry (prod-available, dev-gated) + full /admin/dev gate inventory"
```

---

### Task 9: Old-bookmark redirect (`next.config` + config test)

Implements spec §2.4. Separable — additive; no Task-8 test depends on it.

**Files:** Modify `next.config.ts`; Create `tests/config/observabilityRedirect.test.ts`.

- [ ] **Step 1: Write the failing config test** — `tests/config/observabilityRedirect.test.ts`, mirroring `tests/config/rootRedirect.test.ts:17-25`. Concrete failure mode: a dropped/retargeted/`permanent`-flipped redirect silently 404s every old `/admin/observability` bookmark.

```ts
import { describe, expect, test } from "vitest";
import nextConfig from "@/next.config";

describe("old observability bookmark redirect", () => {
  test('redirects() includes { source: "/admin/observability", destination: "/admin/dev/telemetry", permanent: true }', async () => {
    expect(typeof nextConfig.redirects).toBe("function");
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: "/admin/observability",
        destination: "/admin/dev/telemetry",
        permanent: true,
      }),
    );
  });
});
```

Run `pnpm vitest run tests/config/observabilityRedirect.test.ts` → FAIL (redirect not present).
- [ ] **Step 2: Add the redirect** to `next.config.ts` `redirects()` (`:46-63`, alongside the existing root + `/admin/ignored-sheets` entries): `{ source: "/admin/observability", destination: "/admin/dev/telemetry", permanent: true }`. `permanent:true` (308) is correct — this URL shape is settled (unlike the young `/` front door which is `permanent:false`). The redirect is unauthenticated → the destination page's `requireDeveloperIdentity()` enforces access (matches the `/ → /auth/sign-in` pattern).
- [ ] **Step 3: Run to green** — re-run → PASS.
- [ ] **Step 4: Commit**

```bash
git add next.config.ts tests/config/observabilityRedirect.test.ts
git commit --no-verify -m "feat(routing): permanent redirect /admin/observability → /admin/dev/telemetry"
```

---

### Task 10: `dev-route-prod-classification` structural defense (CREATE)

Implements spec §2.1a STRUCTURAL DEFENSE (AGENTS.md same-vector calibration — ship the structural guard in THIS milestone). Closes the "prod-under-`/admin/dev` whack-a-mole" class at CI time so a future prod-under-`/admin/dev` route must consciously update the allowlist.

**Files:** Create `tests/admin/dev-route-prod-classification.test.ts`.

- [ ] **Step 1: Write the test.** It reads `scripts/with-admin-dev-flag.mjs`'s disable list (the dev-only set — parse the `FILES` array) and a hardcoded `const PROD_AVAILABLE_DEV_ROUTES = ["app/admin/dev/telemetry"];` allowlist, then walks the top-level route dirs under `app/admin/dev/*` and asserts EVERY one is classified as EITHER dev-only (its `page.tsx` is in the disable list, including nested harness dirs like `source-link-dim`/`telemetry-dim`) OR prod-available (in the allowlist) — failing if a new `app/admin/dev/*` route dir appears unclassified. Concrete failure mode: a future dev adds `app/admin/dev/foo/page.tsx` and forgets to either build-gate it (disable list) or consciously allowlist it → this fails, forcing the §2.1a gate-inventory decision. Anti-tautology: derive the walked set from the real filesystem (`readdirSync("app/admin/dev")`), not a hardcoded list; assert the CURRENT tree classifies cleanly (telemetry ∈ allowlist; dev panel + source-link-dim + telemetry-dim ∈ dev-only).
- [ ] **Step 2: Prove it bites** — temporarily add a throwaway `app/admin/dev/__unclassified_probe__/page.tsx` (or simulate by removing `telemetry` from the allowlist) → run `pnpm vitest run tests/admin/dev-route-prod-classification.test.ts` → FAIL (unclassified route). Remove the probe / restore the allowlist → PASS. Note the bite in the commit body.
- [ ] **Step 3: Commit**

```bash
git add tests/admin/dev-route-prod-classification.test.ts
git commit --no-verify -m "test(admin): pin prod-vs-dev-only classification of every /admin/dev/* route"
```
