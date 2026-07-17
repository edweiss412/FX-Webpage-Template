# Withdraw G3 Re-scan Two-Tap Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the PR-#408 "G3" two-tap destructive-confirm guard from the "Re-scan this sheet" button, reverting it to a pure one-tap that matches the un-guarded Re-sync.

**Architecture:** Delete the armed-state morph (state, timer, guarded-click handler, inverted-amber className branch, confirm label, sr-only announcement) from `components/admin/RescanSheetButton.tsx`; `onClick` fires `handleClick` directly. Every test that double-tapped to fire converts to a single tap; the meta-test registry row that pinned the now-deleted inverted-amber literal is removed; the guard-tier ladder + parent spec are updated to record the withdrawal.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest + Testing Library (unit/integration), Playwright (e2e), Tailwind v4.

## Global Constraints

- **Spec is canonical:** `docs/superpowers/specs/2026-07-16-withdraw-rescan-guard.md`. This is a ratified amendment to `2026-07-16-destructive-confirm-pass.md` (invariant 7 — recorded, not silent).
- **TDD per task; commit per task**, conventional-commits (`<type>(<scope>): <summary>`). One task per commit; each commit leaves the affected suites green.
- **No raw error codes in UI** (invariant 5) — untouched here; `handleClick`/result copy unchanged.
- **UI quality gate** (invariant 8): the diff touches a UI surface (`components/**`, `DESIGN.md`) → `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`.
- **Destructive-confirm recipe contract:** withdrawal = **registry-row removal**, never matcher loosening, per the #408 `_metaDestructiveConfirm.test.ts` contract.
- **No em dashes in rendered UI copy** (DESIGN.md house rule) — not newly introduced here.

### Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/styles/_metaDestructiveConfirm.test.ts` — removes the `RescanSheetButton.tsx` registry row (the per-occurrence registry expects exactly one occurrence per row; deleting the literal without deleting the row fails the meta-test).
- **CREATES** no new meta-test.
- **Advisory-lock topology (`pg_advisory*`):** N/A — no lock surface touched (confirm-affordance removal only; the apply path `applyRescanDecisionUnderLock`/`computeRescanDecision` is not modified).
- **Layout-dimensions task:** N/A — no fixed-dimension parent → flex/grid child invariant is changed. The resting button keeps `self-start min-h-tap-min`; the removed armed morph had a border-compensation only to avoid a 2px shift *during the morph*, and with no morph there is no shift to compensate. The idle↔pending swap is instant and same-size (label text swap only).
- **Transition-audit:** folded into Task 1 — the T8 test in `step3ReviewModal.transitions.test.tsx` is the rescan transition-audit surface; it is updated to assert idle→pending is instant with no armed intermediate state (matching spec §3.2's one-pair inventory).

---

### Task 1: Remove the G3 armed guard from the component + all executable tests (atomic)

The component removal and every test that exercised the two-tap fire are mutually dependent — converting tests first fails against the still-armed component, and removing the component first fails the un-converted tests. They land in ONE commit so the suite stays green.

**Files:**
- Modify: `components/admin/RescanSheetButton.tsx` (remove armed morph; `onClick` → `() => void handleClick()`)
- Modify: `tests/components/admin/RescanSheetButton.test.tsx` (add regression test; convert 8 arm-then-fire setups; delete the G3 describe block)
- Modify: `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` (T8 drop armed assertion; §H N4 + §H compound(d) single-tap)
- Modify: `tests/components/admin/wizard/Step3ReviewModal.test.tsx` (footer overlay test single-tap)
- Modify: `tests/e2e/step3-review-modal.interactions.spec.ts` (§K14 + §K14-390px single-tap)
- Modify: `tests/styles/_metaDestructiveConfirm.test.ts` (remove the RescanSheetButton registry row)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RescanSheetButton` with two visual states only (idle, pending); `data-testid={rescan-sheet-button-${driveFileId}}` fires the POST on the FIRST click; the armed label `"Confirm re-scan: replaces this staged review"` no longer exists in any render path.

- [ ] **Step 1: Write the failing regression test** in `tests/components/admin/RescanSheetButton.test.tsx` — add inside the top-level `describe("RescanSheetButton — states + posted body", …)` block (place it after the existing posted-body test near line ~140; reuse that block's `fetch` stub pattern):

```tsx
test("one tap fires immediately — no armed intermediate state (guard withdrawn)", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ ok: true, status: "updated", needsReview: false, changed: false, demoted: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { getByTestId, queryByText } = render(
    <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />,
  );
  const btn = getByTestId(`rescan-sheet-button-${DFID}`);
  // A SINGLE click posts — not a second-tap fire.
  fireEvent.click(btn);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/onboarding/rescan-sheet",
    expect.objectContaining({ method: "POST" }),
  );
  // The withdrawn armed label never appears at any point.
  expect(queryByText("Confirm re-scan: replaces this staged review")).toBeNull();
});
```

(Use the file's existing `DFID`/`WSID` constants and `render`/`fireEvent`/`waitFor` imports — confirm their names at the top of the file and match them.)

- [ ] **Step 2: Run it — verify it FAILS**

Run: `cd /Users/ericweiss/FX-wt-withdraw-rescan-guard && pnpm vitest run tests/components/admin/RescanSheetButton.test.tsx -t "one tap fires immediately"`
Expected: FAIL — against the current two-tap component the first click only arms, so `fetchMock` is never called and `waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))` times out and throws. The test stops at that timeout (the `queryByText` label assertion below it is not reached). That single failure is sufficient proof the guard is still present.

- [ ] **Step 3: Remove the armed morph from `components/admin/RescanSheetButton.tsx`**

Delete `const ARM_REVERT_MS = 4_000;` (~line 86). Delete the G3 comment + `armed` state + `armTimerRef` + `clearArmTimer` + `useEffect(() => clearArmTimer, [])` + `onGuardedClick` (~lines 125–150). In the JSX, set `onClick={() => void handleClick()}`, collapse the button to the single resting className + label, and delete the standalone sr-only armed span. The button becomes exactly:

```tsx
<button
  type="button"
  ref={triggerRef}
  data-testid={`rescan-sheet-button-${driveFileId}`}
  onClick={() => void handleClick()}
  disabled={pending || disabled}
  aria-busy={pending}
  className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
>
  {pending ? "Re-scanning…" : "Re-scan this sheet"}
</button>
```

Delete the block immediately after the button:

```tsx
{/* Persistent sr-only live region … */}
<span role="status" className="sr-only">
  {armed ? "Tap again to confirm." : ""}
</span>
```

Leave `handleClick`, `RescanResponse`/`resultFor`/`PLAIN_COPY`/`lookupDougFacing`, `triggerRef`, the result overlay + dismiss button, and both `placement` variants untouched. If `useEffect` is now unused in the file, drop it from the React import; keep `useRef`/`useState`.

- [ ] **Step 4: Run the regression test — verify it PASSES**

Run: `pnpm vitest run tests/components/admin/RescanSheetButton.test.tsx -t "one tap fires immediately"`
Expected: PASS.

- [ ] **Step 5: Delete the G3 describe block + convert the 8 arm-then-fire setups** in `tests/components/admin/RescanSheetButton.test.tsx`

Delete the entire `describe("G3 two-tap guard — Re-scan this sheet", …)` block (from ~line 498 to its closing `});` near line ~648) — this removes the armed-className, overlay-armed, second-click-fires-once, disarm-before-fetch, unmount-clears-timer, and sr-only-announcement tests. Then in the 8 tests that currently fire the button with two clicks (the "first click arms, second click fires" comment sites at ~lines 78, 101, 123, 154, 182, 205, 221, 326), delete the FIRST of the two `fireEvent.click(...)` calls (and the comment) so a single click fires. Their remaining assertions (fetch called, posted body, result copy, `router.refresh`, overlay) are unchanged.

- [ ] **Step 6: Convert the Step-3 modal integration tests**

In `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`:
- **T8** (`§11 T8`, ~lines 405–430): remove the arm step and its assertion — delete the first `fireEvent.click(btn)` + the comment + the two lines asserting `aria-busy` stays `"false"` and `btn.textContent` equals `"Confirm re-scan: replaces this staged review"` (~lines 421–425). Keep the pre-click assertions (`aria-busy` false, label "Re-scan this sheet"), then a single `fireEvent.click(btn)` → the existing `waitFor(aria-busy === "true")` + `"Re-scanning…"` + the `no animation class` assertion. This becomes the idle→pending transition-audit.
- **§H N4** (~lines 715–717) and **§H compound (d)** (~lines 1006–1007): delete the first of each doubled `fireEvent.click(rescan-sheet-button-…)` pair.

In `tests/components/admin/wizard/Step3ReviewModal.test.tsx`:
- Footer-overlay test (~lines 587–590): delete the first of the doubled `fireEvent.click(within(footer).getByTestId(rescan-sheet-button-…))` pair. Leave the dirty-rescan CHIP / footer-presence tests (363/377/565/651/874/891) untouched — they do not tap the button.

In `tests/e2e/step3-review-modal.interactions.spec.ts`:
- §K14 (~lines 730–732) and §K14-at-390px (~lines 776–778): delete the first `.click()` of each doubled pair; keep the comment updated or removed.

- [ ] **Step 7: Remove the meta-test registry row** in `tests/styles/_metaDestructiveConfirm.test.ts` — delete the `R("components/admin/RescanSheetButton.tsx", 0, "morph", "rescan-sheet-button-* armed branch (G3 two-tap guard)")` entry (~lines 54–58). Do NOT touch the G1/G2/G4 rows or the matcher.

- [ ] **Step 8: Run the affected vitest suites — verify GREEN**

Run:
```
pnpm vitest run tests/components/admin/RescanSheetButton.test.tsx \
  tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx \
  tests/components/admin/wizard/Step3ReviewModal.test.tsx \
  tests/styles/_metaDestructiveConfirm.test.ts
```
Expected: all PASS. (These are the vitest suites; the e2e spec runs in Step 8b — it is NOT part of `pnpm vitest`/`pnpm test`.) Then confirm no orphan armed morph — both commands must return **zero** hits:
```
rg -n "Confirm re-scan: replaces this staged review" --glob '!docs/**'
rg -n "armed" components/admin/RescanSheetButton.tsx
```

- [ ] **Step 8b: Run the converted e2e spec — verify GREEN (so the commit is green-verified end-to-end)**

The e2e spec is edited in this same commit but is excluded from `pnpm test`; run it explicitly against its Playwright harness so Task 1's commit is not claimed green without proof:
```
pnpm test:e2e tests/e2e/step3-review-modal.interactions.spec.ts
```
Expected: the §K14 + §K14-at-390px specs PASS (single-tap now fires the overlay result). If the local Playwright harness cannot start (no browsers installed / no dev server), do NOT claim green from static inspection alone — install/boot the harness, or defer the commit's e2e proof explicitly and record it in the handoff so the CI Playwright job is the gating run. Also static-verify no two consecutive taps on the rescan testid remain (multiline-enabled `-U`, verified to match the pre-change doubles):
```
rg -U -n 'rescan-sheet-button-\$\{HARNESS_DFID\}[^\n]*\n\s*await page\.locator\(`\[data-testid="rescan-sheet-button-\$\{HARNESS_DFID\}' tests/e2e/step3-review-modal.interactions.spec.ts
```
Expected: zero hits after conversion.

- [ ] **Step 9: Commit**

```bash
git add components/admin/RescanSheetButton.tsx \
  tests/components/admin/RescanSheetButton.test.tsx \
  tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx \
  tests/components/admin/wizard/Step3ReviewModal.test.tsx \
  tests/e2e/step3-review-modal.interactions.spec.ts \
  tests/styles/_metaDestructiveConfirm.test.ts
git commit --no-verify -m "feat(admin): withdraw G3 re-scan two-tap guard — Re-scan is one-tap again"
```

---

### Task 2: Record the withdrawal in DESIGN.md and the parent spec (docs)

**Files:**
- Modify: `DESIGN.md` (§15 guard-tier ladder, ~line 412)
- Modify: `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md` (~lines 10, 45, 50)

- [ ] **Step 1: DESIGN.md §15 ladder** — in the tier-2 ("Two-tap confirm … + 3–4s auto-revert") enumeration (~line 412), remove `re-scan over staged work` from the list, and append a one-line breadcrumb sentence to that ladder item:

> _(Re-scan was withdrawn from this tier — it is content-aware and preserves ratified decisions on a clean refresh; see `docs/superpowers/specs/2026-07-16-withdraw-rescan-guard.md`.)_

- [ ] **Step 2: Parent spec WITHDRAWN annotations** in `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md` (do NOT delete history):
  - Line ~10 (the "Unguarded irreversible one-taps" inventory sentence): append `— NOTE: "Re-scan this sheet" was reverted to a permanent one-tap; the G3 guard added below was WITHDRAWN 2026-07-16 (see 2026-07-16-withdraw-rescan-guard.md).`
  - Line ~45 (the G3 table row): prefix the row's first cell with `WITHDRAWN (2026-07-16) —` and keep the rest for history.
  - Line ~50 (the "G3 applies in both placement variants" note): prefix `WITHDRAWN (2026-07-16): `.

- [ ] **Step 3: Verify no runtime coupling** — both edits are prose. Task 2 touches NO §12.4 catalog rows, so the x1 catalog-parity gate (`tests/cross-cutting/codes.test.ts`) is not in play; the destructive-confirm meta-test (`tests/styles/_metaDestructiveConfirm.test.ts`) scans `components/**` + `app/**`, not `DESIGN.md` prose. Confirm nothing regenerates off these docs:

Run: `rg -rn "2026-07-16-destructive-confirm-pass.md" --glob '!docs/**' --glob '!*.md'` (source/test references to the parent spec — expect none that parse its ladder line text) and, as the real gate, rely on the whole-diff `pnpm test` in the Verification section below. Expected: no source/test file parses DESIGN.md §15 prose or the parent spec's G3 row text (a grep returning only doc-to-doc references is fine).

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md
git commit --no-verify -m "docs(admin): record G3 re-scan guard withdrawal in ladder + parent spec"
```

---

## Verification (whole-diff, before cross-model review)

- [ ] `pnpm typecheck` — green (vitest strips types; typecheck is separate).
- [ ] `pnpm lint` — green (canonical-Tailwind lint errors are not caught by prettier).
- [ ] `pnpm format:check` — green (`--no-verify` bypasses the prettier hook).
- [ ] `pnpm test` — full suite green (scoped runs miss cross-file regressions; a page/component rebuild fans out to source-scanning registries).
- [ ] e2e: run the converted spec if the harness is available — `pnpm test:e2e tests/e2e/step3-review-modal.interactions.spec.ts` (or the repo's e2e command). If the e2e harness cannot run locally, static-verify no doubled `.click()` remains on the rescan testid and note it in the handoff.
- [ ] Invariant 8: `/impeccable critique` + `/impeccable audit` on the diff; P0/P1 fixed or `DEFERRED.md`.
- [ ] `rg -n "Confirm re-scan: replaces this staged review" --glob '!docs/**'` → zero hits.
- [ ] **No doubled taps on the rescan testid remain — all three forms present in the tree** (multiline `-U`; default ripgrep does NOT match `\n`; each pattern was verified to match the pre-change doubles, so each MUST return zero post-conversion):
  - `act`-wrapped pair (the 8 `RescanSheetButton.test.tsx` sites + `Step3ReviewModal.test.tsx` footer): `rg -U -n 'fireEvent\.click\([^\n]*rescan-sheet-button[^\n]*\);\n\s*await act\(async \(\) => \{\n\s*fireEvent\.click\([^\n]*rescan-sheet-button' tests/` → zero.
  - Adjacent `fireEvent.click` pair (`step3ReviewModal.transitions.test.tsx` §H N4 + compound(d)): `rg -U -n 'fireEvent\.click\([^\n]*rescan-sheet-button[^\n]*\);\s*\n\s*fireEvent\.click\([^\n]*rescan-sheet-button' tests/` → zero.
  - e2e consecutive locator-chain pair: `rg -U -n 'rescan-sheet-button-\$\{HARNESS_DFID\}[^\n]*\n\s*await page\.locator\(`\[data-testid="rescan-sheet-button-\$\{HARNESS_DFID\}' tests/e2e/step3-review-modal.interactions.spec.ts` → zero.
  - Because a leftover second tap lands on a now-`disabled={pending}` button and silently no-ops (the suite would still pass), these static checks — not the passing suite — are the proof that every double was converted.

## Self-Review (against the spec)

- **Spec coverage:** §2.1 → Task 1 Step 3; §2.2 → Task 1 Steps 1,5; §2.2b → Task 1 Step 6; §2.3 → Task 1 Step 7; §2.4 → Task 2 Step 1; §2.5 → Task 2 Step 2; §3 state model/§3.2 transition inventory → Task 1 Steps 3,6 (T8); §5 AC-1..6 → Task 1 + Verification. No gaps.
- **Placeholder scan:** none — every code step carries exact code/commands.
- **Type consistency:** component keeps `RescanSheetButtonProps` (`driveFileId`, `wizardSessionId`, `resultPlacement`, `disabled`) unchanged; no signature changes.
- **Anti-tautology:** the Task 1 Step 1 regression test asserts a single click POSTs AND the armed label is absent — it fails against a re-introduced guard, not merely "a function is called."
