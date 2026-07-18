# Auto-applied kind-dot non-color tell (KINDDOT-1) — Implementation Plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit.

**Goal:** Give the destructive `crew_removed` marker in `KindDotCluster` a shape-distinct non-color tell (centered minus-bar), so it's distinguishable from the near-identical `crew_renamed` review hue for color-limited vision.

**Architecture:** Single-file view change in `components/admin/RecentAutoAppliedStrip.tsx` (`KindDotCluster` `shown.map`). No DB, no advisory-lock, no server action, no new file.

**Tech Stack:** React 19 / Next 16 RSC, Tailwind v4, Vitest + Testing Library (jsdom).

## Global Constraints

- Invariant 1 (TDD per task), 5 (no raw error codes — N/A, no user-facing codes here), 8 (impeccable dual-gate — UI surface). Conventional commits. Spec canonical: `docs/superpowers/specs/2026-07-17-autoapplied-kinddot-nonocolor-tell.md`.
- Tailwind v4 literal-class rule: dot/bar bg tokens stay literal (`bg-status-warn`), never `${token}` interpolation. (Marker bg for non-removed stays the existing `KIND_PILL[k].dot` literal map value.)

---

### Task 1: Minus-bar marker + shape-independent marker testid

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (`KindDotCluster` `shown.map`, ~:179-184)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

**Interfaces:**
- Consumes: `KIND_PILL`, `KIND_ORDER`, `MAX_DOTS`, `FALLBACK_PILL` (unchanged).
- Produces: each shown marker span carries `data-testid="auto-applied-kind-marker"`; `crew_removed` renders a minus-bar wrapper instead of a disc.

- [x] **Step 1: Write/adjust the tests (red)**

Add to `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (near the existing kind-dot block ~:252-320):

```tsx
it("kind-dot cluster: destructive crew_removed renders a minus-bar (non-color tell), not a disc", () => {
  render(
    <RecentAutoAppliedStrip data={groupData(["crew_removed", "crew_added"])} actions={noopActions()} />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  const markers = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markers.length).toBe(2);
  // the removed marker is the minus-bar wrapper: NOT a rounded-full disc itself,
  // and it contains an h-0.5 w-2 rounded-full bar
  const removedMarker = markers.find((m) => m.querySelector(".h-0\\.5.w-2"));
  expect(removedMarker).toBeTruthy();
  expect(removedMarker!.className).not.toContain("rounded-full");
  expect(removedMarker!.querySelector(".h-0\\.5.w-2.rounded-full")).toBeTruthy();
  // the non-removed (added) marker stays a filled disc
  const discs = markers.filter((m) => m.className.includes("size-2") && m.className.includes("rounded-full"));
  expect(discs.length).toBe(1);
});

it("kind-dot cluster: no crew_removed → all markers are filled discs, no minus-bar", () => {
  render(
    <RecentAutoAppliedStrip data={groupData(["crew_renamed", "crew_added"])} actions={noopActions()} />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  const markers = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markers.length).toBe(2);
  expect(markers.every((m) => m.className.includes("rounded-full"))).toBe(true);
  expect(cluster.querySelector(".h-0\\.5.w-2")).toBeNull();
});

it("kind-dot cluster: destructive minus-bar stays visible even with all 5 kinds (never in +N overflow)", () => {
  render(
    <RecentAutoAppliedStrip
      data={groupData(["crew_removed", "crew_renamed", "crew_added", "field_changed", "crew_email_changed"])}
      actions={noopActions()}
    />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  // 5 known kinds → 4 shown markers + "+1"; the removed marker (KIND_ORDER[0]) is among the shown
  const markers = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markers.length).toBe(4);
  expect(markers.some((m) => m.querySelector(".h-0\\.5.w-2"))).toBe(true);
  expect(cluster.textContent ?? "").toContain("+1");
  // aria-label still names Removed
  expect(cluster.getAttribute("aria-label") ?? "").toContain("Removed");
});
```

Update the **existing** overflow test (`kind-dot cluster: >4 distinct kinds → 4 dots + a +N overflow marker`, ~:295-316) to count by marker testid instead of `.rounded-full`:

```tsx
  const markerEls = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markerEls.length).toBe(4);
  expect(cluster.textContent ?? "").toContain("+2");
```

- [x] **Step 2: Run — verify fail**

Run: `npx vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx -t "kind-dot cluster"`
Expected: new 3 tests FAIL (no marker testid / no minus-bar); updated overflow test FAIL (no marker testid).

- [x] **Step 3: Implement the marker refactor**

Replace the `shown.map` body (`components/admin/RecentAutoAppliedStrip.tsx` ~:179-184):

```tsx
      {shown.map((k) =>
        k === "crew_removed" ? (
          // KINDDOT-1: destructive kind gets a shape-distinct non-color tell (a
          // minus-bar), so a color-limited operator can tell "Removed" from the
          // near-identical "Renamed" review hue at a glance. bg stays literal
          // (Tailwind v4 JIT scans literals). aria-hidden on the wrapper hides
          // the whole marker subtree; the aria-label channel is unchanged.
          <span
            key={k}
            aria-hidden="true"
            data-testid="auto-applied-kind-marker"
            className="flex size-2 items-center justify-center"
          >
            <span className="h-0.5 w-2 rounded-full bg-status-warn" />
          </span>
        ) : (
          <span
            key={k}
            aria-hidden="true"
            data-testid="auto-applied-kind-marker"
            className={`size-2 rounded-full ${KIND_PILL[k]?.dot ?? FALLBACK_PILL.dot}`}
          />
        ),
      )}
```

- [x] **Step 4: Run — verify pass**

Run: `npx vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx`
Expected: all kind-dot tests PASS (incl. the pre-existing #1 "3 distinct kinds" and the updated overflow test).

- [x] **Step 5: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "fix(admin): non-color tell for destructive crew_removed kind dot (KINDDOT-1)"
```

---

### Task 2: DEFERRED.md + BACKLOG.md drift correction

**Files:**
- Modify: `DEFERRED.md` (KINDDOT-1, AUTOAPPLIED-COLLAPSE-1, AUTOAPPLIED-COLLAPSE-2, AUTOAPPLIED-REDESIGN-2 → resolved; add KINDDOT-DIM-1 N/A row)
- Modify: `BACKLOG.md` (reconcile the three now-shipped rows the resolved DEFERRED twins reference: `BL-AUTOAPPLIED-SINGLETON-FLATTEN`, `BL-AUTOAPPLIED-COLLAPSED-KIND-HINT`, `BL-DISCLOSURE-FAMILY-HEIGHT-MORPH`). Note: `BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL` was never filed as a real row — KINDDOT-1 is closed directly in DEFERRED, no BACKLOG edit for it.

- [x] **Step 1: Mark KINDDOT-1 resolved** — append a `✅ RESOLVED 2026-07-17 (branch fix/autoapplied-kinddot-tell)` note citing the minus-bar (`RecentAutoAppliedStrip.tsx` `shown.map`) + the 3 new tests.
- [x] **Step 2: Mark COLLAPSE-1, COLLAPSE-2, REDESIGN-2 RESOLVED-BY-SUPERSESSION** — each with the live-code citation from spec §8 (KindDotCluster comment; CollapsePanel height-morph; singleton-flatten test).
- [x] **Step 3: Add KINDDOT-DIM-1 DEFERRED-AS-N/A row** — real-browser dimension assertion for the `size-2` minus-bar; CSS-literal dims, no stretch dependency; jsdom class-pin; cites DQ-1/OUX-1/REDESIGN-1 precedent.
- [x] **Step 4: BACKLOG reconcile** — `BL-AUTOAPPLIED-SINGLETON-FLATTEN`, `BL-AUTOAPPLIED-COLLAPSED-KIND-HINT`, `BL-DISCLOSURE-FAMILY-HEIGHT-MORPH` → `✅ RESOLVED-BY-SUPERSESSION` (their DEFERRED twins shipped: singleton flatten, KindDotCluster collapsed-header hint, CollapsePanel family height-morph). No `BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL` row exists — nothing to mark there.
- [x] **Step 5: Commit**

```bash
git add DEFERRED.md BACKLOG.md
git commit --no-verify -m "docs(plan): mark KINDDOT-1 shipped; COLLAPSE-1/2 + REDESIGN-2 resolved-by-supersession"
```

---

### Task 3: Invariant-8 impeccable dual-gate + full suite

- [x] **Step 1:** `/impeccable critique` + `/impeccable audit` on the `KindDotCluster` diff (setup gates: `context.mjs` → register `product`). **Recorded results (§12 below).**
- [x] **Step 2:** `pnpm test` (full suite), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` before push. typecheck/lint (0 errors, pre-existing warnings only)/format all clean; component suite 55/55; full suite green except the 2 pre-existing `tests/cross-cutting/pg-cron-coverage.test.ts` local-DB-pollution failures (orphan `fxav_cron_%` job in the shared local DB from concurrent worktrees — identical on `origin/main`'s own test version; zero relation to this view+docs diff; real CI fresh-DB is the arbiter).
- [ ] **Step 3 (pending release):** whole-diff cross-model review (Codex) — 3 rounds run, all code-clean (55/55, diff clean); R1/R2 doc-consistency fixes reconciled, R3 flagged only checklist bookkeeping (fixed here) → then push → real CI green → `gh pr merge --merge`. Not yet done at time of writing.

## 12. Invariant-8 impeccable dual-gate — results + dispositions

Ran on `git diff origin/main -- components/admin/RecentAutoAppliedStrip.tsx` (register **product**; `context.mjs` PRODUCT.md + DESIGN.md §1 loaded; independent-evaluator attestation).

- **Critique: PASS.** The minus-bar is the correct fix — directly realizes PRODUCT.md's "pair color with text or icon for any state signal" / "color-blind crew exist," and DESIGN.md §1.3's shape-channel direction. `crew_removed` (`bg-status-warn`) vs `crew_renamed` (`bg-status-review`) are near-identical amber hues; the minus glyph ("−" = removed) adds a genuine non-color channel. Box stays 8px → aligns with sibling discs, no reflow.
- **Audit: PASS.** a11y improved (adds a non-color channel; aria-hidden subtree + aria-label naming "Removed" intact — authoritative AT channel unaffected). Theming clean both modes (warn dot ≥3:1 light/dark). Responsive/perf clean. Dimensional: explicit CSS-literal dims, inner width == wrapper width, no overflow, no stretch dependency.
- **Findings:** no P0 / P1 / P2.
  - **P3 (critique) — shape-vocab consistency:** minus-bar is a third shape beyond §1.3's filled-disc/hollow-ring pair. **Disposition: fixed-in-diff** — added a §1.3 DESIGN.md note documenting the minus-bar shape channel + why the minus semantic beats a ring for "removed."
  - **P3 (critique) — `field_changed` + `crew_email_changed` share `bg-status-idle` dots:** pre-existing, both non-destructive neutral, disambiguated by aria-label + expanded `KindPill`. **Disposition: out of scope** (KINDDOT-1 scoped to the destructive kind).
  - **P3 (audit) — 2px bar salience:** contrast passes; an `h-[3px]` bump is optional. **Disposition: declined** — `h-0.5` (2px) is a design token; `h-[3px]` would be an untokenized arbitrary value, and the audit rated the 2px non-failure.

## Self-review

- Spec coverage: KINDDOT-1 (Task 1), drift correction + dim deferral (Task 2), dual-gate (Task 3). ✓
- Placeholder scan: none.
- Type consistency: marker testid string identical across both branches + tests; `bg-status-warn` literal matches `KIND_PILL.crew_removed.dot`. ✓
- Anti-tautology: tests extract within `[data-testid="auto-applied-kind-dots"]`, target marker shape/testid, derive counts from KIND_ORDER+MAX_DOTS, not the `KindPill` container. ✓
