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

- [ ] **Step 1: Write/adjust the tests (red)**

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

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx -t "kind-dot cluster"`
Expected: new 3 tests FAIL (no marker testid / no minus-bar); updated overflow test FAIL (no marker testid).

- [ ] **Step 3: Implement the marker refactor**

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

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx`
Expected: all kind-dot tests PASS (incl. the pre-existing #1 "3 distinct kinds" and the updated overflow test).

- [ ] **Step 5: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "fix(admin): non-color tell for destructive crew_removed kind dot (KINDDOT-1)"
```

---

### Task 2: DEFERRED.md + BACKLOG.md drift correction

**Files:**
- Modify: `DEFERRED.md` (KINDDOT-1, AUTOAPPLIED-COLLAPSE-1, AUTOAPPLIED-COLLAPSE-2, AUTOAPPLIED-REDESIGN-2 → resolved; add KINDDOT-DIM-1 N/A row)
- Modify: `BACKLOG.md` (`BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL` → SHIPPED)

- [ ] **Step 1: Mark KINDDOT-1 resolved** — append a `✅ RESOLVED 2026-07-17 (branch fix/autoapplied-kinddot-tell)` note citing the minus-bar (`RecentAutoAppliedStrip.tsx` `shown.map`) + the 3 new tests.
- [ ] **Step 2: Mark COLLAPSE-1, COLLAPSE-2, REDESIGN-2 RESOLVED-BY-SUPERSESSION** — each with the live-code citation from spec §8 (KindDotCluster :143; CollapsePanel height-morph :38-54 / strip :357; singleton-flatten test).
- [ ] **Step 3: Add KINDDOT-DIM-1 DEFERRED-AS-N/A row** — real-browser dimension assertion for the `size-2` minus-bar; CSS-literal dims, no stretch dependency; jsdom class-pin; cites DQ-1/OUX-1/REDESIGN-1 precedent.
- [ ] **Step 4: BACKLOG** — mark `BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL` SHIPPED.
- [ ] **Step 5: Commit**

```bash
git add DEFERRED.md BACKLOG.md
git commit --no-verify -m "docs(plan): mark KINDDOT-1 shipped; COLLAPSE-1/2 + REDESIGN-2 resolved-by-supersession"
```

---

### Task 3: Invariant-8 impeccable dual-gate + full suite

- [ ] **Step 1:** `/impeccable critique` + `/impeccable audit` on the `KindDotCluster` diff (setup gates: `context.mjs` → register reference). P0/P1 fixed-in-diff or DEFERRED.md entry. Record findings + dispositions in the spec/handoff.
- [ ] **Step 2:** `pnpm test` (full suite), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` before push (scoped gates miss regressions; `--no-verify` bypasses hooks).
- [ ] **Step 3:** whole-diff cross-model review to APPROVE → push → real CI green → `gh pr merge --merge`.

## Self-review

- Spec coverage: KINDDOT-1 (Task 1), drift correction + dim deferral (Task 2), dual-gate (Task 3). ✓
- Placeholder scan: none.
- Type consistency: marker testid string identical across both branches + tests; `bg-status-warn` literal matches `KIND_PILL.crew_removed.dot`. ✓
- Anti-tautology: tests extract within `[data-testid="auto-applied-kind-dots"]`, target marker shape/testid, derive counts from KIND_ORDER+MAX_DOTS, not the `KindPill` container. ✓
