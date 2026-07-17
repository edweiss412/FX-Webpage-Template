# CASP2-4 StatusStrip Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the two-adjacent-orange in the admin StatusStrip with a control/signal divider, complete the alert-badge focus ring, and reconcile the CASP2-4 deferral docs — all without touching the global `--color-status-live` token.

**Architecture:** Pure presentational change to one client component (`components/admin/showpage/StatusStrip.tsx`) plus two doc updates. Item 3 (focus-ring) is a one-utility append. Item 2 (divider) adds a second `hidden h-5 w-px sm:block` divider between the toggle cluster and the first status signal, gated on a single `hasSignal` boolean so its condition can't drift from the elements it separates. No DB, no server actions, no advisory locks, no migrations, no new error codes.

**Tech Stack:** Next.js 16 client component, Tailwind v4, Vitest + Testing Library (unit), Playwright (real-browser §8.10 geometry).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. One task per commit, conventional-commits style.
- **UI is Opus-owned; invariant 8 impeccable dual-gate** (`/impeccable critique` + `/impeccable audit`) runs on the diff before adversarial review; P0/P1 fixed or `DEFERRED.md`-deferred.
- **No token change** — `app/globals.css` MUST NOT appear in the diff (AC-5). The DESIGN.md `live = accent + ping` decision stands.
- **No raw error codes in UI** (invariant 5) — N/A here (no error surface added).
- Divider recipe is copied verbatim from the existing title divider (`StatusStrip.tsx:126`): `hidden h-5 w-px shrink-0 bg-border sm:block`, `aria-hidden="true"`.
- `ring-offset` recipe copied verbatim from the switch (`PublishedToggle.tsx:228`): `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.

## Meta-test inventory

**None created or extended.** No structural registry applies: the change adds no auth helper, no Supabase call boundary, no DB write, no admin-alert code, no tile sentinel, no `pg_advisory*` surface, no mutation surface (the alert badge is an `<a href="#overview">`, not a mutating handler/action), and no inline email normalization. Verified: no `tests/**/_meta*` file references `StatusStrip` (grep). Advisory-lock holder topology: N/A (no `pg_advisory*` touched).

## Regression surfaces to run (not just `pnpm test`)

E2e layout/transition specs reference the strip and are **excluded from `pnpm test`** (env-bound/e2e exclusion) but run in real CI. The desktop divider adds width between the toggle and signals, so these MUST be run and reconciled:
- `tests/e2e/statusStripToggleLayout.spec.ts` (§8.10 — the one we extend)
- `tests/e2e/showPageLayout.spec.ts`
- `tests/e2e/admin-layout-dimensions.spec.ts`
- `tests/e2e/admin-lifecycle-layout.spec.ts`
- `tests/e2e/admin-lifecycle-transitions.spec.ts`

If any asserts a hard-coded x-position/width for a strip element right of the toggle, update it to reflect the new divider (the divider is `display:none` below `sm`, so 390px assertions must not change).

---

### Task 1: Alert-badge focus-ring offset (Item 3)

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx:159` (alert-badge className)
- Test: `tests/components/admin/showpage/statusStrip.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (className-only change).

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe("alert badge", ...)` block in `tests/components/admin/showpage/statusStrip.test.tsx`:

```tsx
it("completes the focus ring with an offset, matching the publish switch", () => {
  renderStrip({ alertCount: 2 });
  const badge = screen.getByTestId("strip-alert-badge");
  expect(badge.className).toContain("focus-visible:ring-offset-2");
  expect(badge.className).toContain("focus-visible:ring-offset-surface");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx -t "completes the focus ring"`
Expected: FAIL — className lacks `focus-visible:ring-offset-2`.

- [ ] **Step 3: Write minimal implementation**

In `components/admin/showpage/StatusStrip.tsx`, the alert-badge `<a>` className currently ends:
`... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"`.
Append the two offset utilities so it reads:
`... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"`.
Change nothing else on the badge (hit-area `before:-inset-y-3`, hover, colors unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx -t "completes the focus ring"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/showpage/StatusStrip.tsx tests/components/admin/showpage/statusStrip.test.tsx
git commit --no-verify -m "fix(admin): complete strip alert-badge focus ring with offset (CASP2-4 item 3)"
```

---

### Task 2: Control divider between toggle and signals (Item 2, approach A)

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (compute `hasSignal`; render new divider between the archived/toggle block at `:117-137` and the live-badge block at `:139`)
- Test (unit): `tests/components/admin/showpage/statusStrip.test.tsx`
- Test (real-browser): `tests/e2e/statusStripToggleLayout.spec.ts`

**Interfaces:**
- Consumes: existing props `archived`, `isLive`, `alertCount`, and the locally-derived `sync`/`syncLabel` (`StatusStrip.tsx:91-97`).
- Produces: a new decorative element `data-testid="strip-control-divider"`.

- [ ] **Step 1: Write the failing unit tests**

Add a new `describe("control divider (CASP2-4)", ...)` block to `tests/components/admin/showpage/statusStrip.test.tsx`:

```tsx
describe("control divider (CASP2-4)", () => {
  it("renders the divider when the ONLY signal is isLive (isolates the isLive disjunct)", () => {
    // baseProps sets lastSyncedAt: SYNCED_12M — null it and zero alerts so ONLY isLive drives hasSignal.
    renderStrip({ isLive: true, lastSyncedAt: null, alertCount: 0 });
    expect(screen.getByTestId("strip-control-divider")).toBeTruthy();
  });

  it("renders the divider when the only signal is an alert", () => {
    renderStrip({ isLive: false, lastSyncedAt: null, alertCount: 1 });
    expect(screen.getByTestId("strip-control-divider")).toBeTruthy();
  });

  it("omits the divider when the show has no signal (not live, never synced, no alerts)", () => {
    renderStrip({ isLive: false, lastSyncedAt: null, alertCount: 0 });
    expect(screen.queryByTestId("strip-control-divider")).toBeNull();
  });

  it("omits the divider when archived, even if a sync signal would render", () => {
    renderStrip({ archived: true, lastSyncedAt: SYNCED_12M, alertCount: 3 });
    expect(screen.queryByTestId("strip-control-divider")).toBeNull();
  });

  it("carries the responsive-suppression + decorative recipe", () => {
    renderStrip({ isLive: true, lastSyncedAt: null, alertCount: 0 });
    const divider = screen.getByTestId("strip-control-divider");
    expect(divider.className).toContain("hidden");
    expect(divider.className).toContain("sm:block");
    expect(divider.getAttribute("aria-hidden")).toBe("true");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx -t "control divider"`
Expected: FAIL — `strip-control-divider` not in the DOM.

- [ ] **Step 3: Write minimal implementation**

In `components/admin/showpage/StatusStrip.tsx`, after the `copyUrl` derivation (`:99-101`) add:

```tsx
// CASP2-4 (item 2, approach A): a control/signal divider so the ON switch (bg-accent)
// and the Live-now dot (bg-status-live = accent, same hue) stop reading as one orange
// smear. Renders iff there is a toggle to separate (¬archived) AND ≥1 signal follows.
// The three disjuncts are exactly the render conditions of the live/sync/alert elements
// below, so the divider appears iff a signal renders beside the toggle. `hidden sm:block`
// matches the title divider — no vertical divider on the wrapped 390px mobile row.
const hasSignal = isLive || (syncLabel != null && sync != null) || alertCount > 0;
const showControlDivider = !archived && hasSignal;
```

Then, between the `archived ? (...) : (...)` block's closing (`:137`, the end of the `!archived` fragment) and the live-badge block (`:139`), insert:

```tsx
{showControlDivider ? (
  <span
    aria-hidden="true"
    data-testid="strip-control-divider"
    className="hidden h-5 w-px shrink-0 bg-border sm:block"
  />
) : null}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS (all control-divider tests + the pre-existing suite green).

- [ ] **Step 5: Extend the real-browser §8.10 geometry gate**

jsdom cannot evaluate `hidden sm:block` or real layout. In `tests/e2e/statusStripToggleLayout.spec.ts`, inside the `describe("CASP-2 inline toggle strip — 390px geometry (spec §8.10)", ...)` block (`:148`), add both a ≥sm and a 390px assertion. Match the harness's existing prop-driving pattern (read the file's helper for how it mounts a published+live strip; drive `isLive:true`, a token present, `lastSyncedAt` set). Skeleton:

```ts
test("§8.10c control divider separates toggle from signals at ≥sm, absent at 390px", async ({ page }) => {
  // Mount published + live + synced (harness helper). Then:
  await page.setViewportSize({ width: 800, height: 900 });
  const divAt800 = await page.getByTestId("strip-control-divider").boundingBox();
  const toggle = await page.getByTestId("strip-publish-toggle").boundingBox();
  const live = await page.getByTestId("strip-live-badge").boundingBox();
  expect(divAt800).not.toBeNull();
  expect(divAt800!.width).toBeGreaterThan(0);
  expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(divAt800!.x + 0.5);
  expect(divAt800!.x + divAt800!.width).toBeLessThanOrEqual(live!.x + 0.5);

  await page.setViewportSize({ width: 390, height: 900 });
  const divAt390 = await page.getByTestId("strip-control-divider").boundingBox();
  // `hidden` → display:none → no box, or a zero-width box.
  expect(divAt390 === null || divAt390.width === 0).toBe(true);
});
```

Read `tests/e2e/_statusStripToggleHarness.tsx` first and adapt the mount to whatever helper the existing §8.10 tests use — do NOT invent a mounting API. If the harness doesn't expose `strip-live-badge`/`strip-publish-toggle` at the needed state, drive props through the same channel the existing tests use.

- [ ] **Step 6: Run the extended e2e gate + the strip-adjacent layout specs**

Run:
```bash
pnpm exec playwright test tests/e2e/statusStripToggleLayout.spec.ts
pnpm exec playwright test tests/e2e/showPageLayout.spec.ts tests/e2e/admin-layout-dimensions.spec.ts tests/e2e/admin-lifecycle-layout.spec.ts tests/e2e/admin-lifecycle-transitions.spec.ts
```
Expected: PASS. If a strip-adjacent spec asserts a hard x-position/width for an element right of the toggle, reconcile it to the new divider (390px assertions must be unaffected — divider is `display:none` there). Commit any such reconciliation as part of this task with a note in the message.

- [ ] **Step 7: Commit**

```bash
git add components/admin/showpage/StatusStrip.tsx tests/components/admin/showpage/statusStrip.test.tsx tests/e2e/statusStripToggleLayout.spec.ts
# plus any reconciled e2e layout spec
git commit --no-verify -m "feat(admin): control/signal divider in status strip (CASP2-4 item 2)"
```

---

### Task 3: Reconcile CASP2-4 deferral docs

**Files:**
- Modify: `BACKLOG.md` (add the `BL-CASP2-STRIP-POLISH` row)
- Modify: `DEFERRED.md:623` (mark items 2+3 RESOLVED)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the backlog row**

Append a `BL-CASP2-STRIP-POLISH` entry to `BACKLOG.md` (match the file's existing `BL-*` row format — read a neighbor row first). Content, scoped to item 1 only:

> **`BL-CASP2-STRIP-POLISH`** (P3) — StatusStrip finalize-popover persistent overlay. The calm finalize banner in the inline `PublishedToggle` persists for the whole finalize window (a transient server state) and deliberately shares the `POPOVER_POSITION` mechanism with the error skin. WAI, not a defect; bundle on a future strip pass if the finalize UX is revisited. Items 2 (two-orange → control divider) and 3 (alert-badge focus-ring offset) of CASP2-4 shipped on branch `feat/casp2-strip-polish` (2026-07-17). Origin: DEFERRED.md CASP2-4.

- [ ] **Step 2: Update DEFERRED.md CASP2-4**

Edit the CASP2-4 bullet (`DEFERRED.md:623`) to mark items 2+3 resolved: prepend the item-2/item-3 resolution note (`✅ RESOLVED (2026-07-17, branch feat/casp2-strip-polish)` — control divider separates the ON switch from the Live dot without touching `--color-status-live`; alert-badge focus ring completed with `ring-offset-2 ring-offset-surface`), and note item 1 (finalize overlay) remains the sole open residual, now tracked as `BL-CASP2-STRIP-POLISH` in BACKLOG.md. Do NOT run prettier on DEFERRED.md if it risks reflowing unrelated rows (edit the single bullet surgically).

- [ ] **Step 3: Commit**

```bash
git add BACKLOG.md DEFERRED.md
git commit --no-verify -m "docs: mark CASP2-4 items 2+3 resolved; file BL-CASP2-STRIP-POLISH (item 1)"
```

---

### Task 4: Close-out — impeccable dual-gate + full suite

**Files:** none (verification only; any P0/P1 fix loops back to Task 1/2).

- [ ] **Step 1: Impeccable dual-gate on the diff** (invariant 8). Run `/impeccable critique` AND `/impeccable audit` on the StatusStrip diff with the canonical v3 setup (context.mjs load of PRODUCT.md + DESIGN.md → register reference read). Fix P0/P1 or defer via `DEFERRED.md`. Record findings + dispositions for the handoff.
- [ ] **Step 2: Typecheck + lint + format** (memory: these bypass `--no-verify`): `pnpm typecheck && pnpm lint && pnpm format:check`. Fix any failure.
- [ ] **Step 3: Full unit suite** (scoped gates miss regressions): `pnpm test`. Expected: green (or only pre-existing failures confirmed at merge-base).
- [ ] **Step 4: Confirm no token drift** (AC-5): `git diff origin/main --stat -- app/globals.css` returns empty.

---

## Self-Review

**Spec coverage:**
- §3 divider → Task 2. §4 focus ring → Task 1. §9.1 unit tests → Tasks 1+2. §9.2 real-browser → Task 2 Step 5. §12 docs → Task 3. AC-5 token-drift → Task 4 Step 4. AC-6 impeccable + adversarial → Task 4 Step 1 + Stage 4. All spec sections mapped.

**Placeholder scan:** the e2e Step 5 skeleton intentionally defers the exact mount call to the harness read — this is a real instruction ("read `_statusStripToggleHarness.tsx`, adapt to its helper"), not a TODO, because inventing a mount API would be worse than reading the one that exists. All other steps carry literal code.

**Type consistency:** `hasSignal` / `showControlDivider` are booleans used only within `StatusStrip`. `strip-control-divider` testid is identical across the impl, all unit tests, and the e2e test. `syncLabel`/`sync` names match `StatusStrip.tsx:91-97`.

**Anti-tautology:** the divider tests assert the *condition* (present with isLive-only, present with alert-only, absent with no signal, absent when archived) — a guard that dropped a disjunct or the `!archived` factor fails at least one. The isLive-only test explicitly nulls `lastSyncedAt` so the sync signal can't mask a missing `isLive` disjunct (Codex spec-review R1 MEDIUM).
