# SectionFlagCallout Preview Demotion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demote `SectionFlagCallout` (Step-3 review wizard) to a pure preview by removing its two mounted controls, making `WarningsBreakdown` the sole actionable site and structurally resolving `DEFERRED.md` §USE-RAW-FULL-LIST-1.

**Architecture:** Pure UI removal. Strip the `UseRawControlBoundary` + `RoleRecognizeControlBoundary` mounts from `SectionFlagCallout`; drop the plumbing (props, chrome fields, provider assignments) that fed only those mounts. `WarningsBreakdown` is untouched — it already mounts both controls per in-scope row from `SectionData`, not from chrome. No DB, no advisory lock, no server-action change.

**Tech Stack:** Next.js 16, React, TypeScript (exactOptionalPropertyTypes), Vitest + @testing-library/react (JSDOM), Playwright (e2e), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-17-use-raw-callout-preview-demotion.md` (Codex-APPROVED, 3 rounds).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task** (invariant 6), conventional-commits: `<type>(<scope>): <summary>`. Scope `crew-page` or `admin`. One task per commit. Use `--no-verify` (shared lint-staged hook belongs to the main checkout).
- **Invariant 5** (no raw error codes in UI): unchanged — `reviewWarningTitle` still hardens titles; the removed `role-recognize` control's `conflict`/`stale` copy is unaffected (lives in `WarningsBreakdown`).
- **Invariant 8** (impeccable dual-gate): UI surface (`components/**`) — `/impeccable critique` + `/impeccable audit` run on the diff before the whole-diff cross-model review; P0/P1 fixed or `DEFERRED.md`-deferred.
- **KEEP** the `"callout"` value in `WarningControlSite` (`components/admin/warningControlSite.ts:8`) — deliberate (spec §2). Do not remove it.
- **KEEP** `findUseRawDecision` (`step3ReviewSections.tsx:514`) — `WarningsBreakdown:2439` still calls it.
- Env-bound + e2e tests are excluded from `pnpm test`; run e2e explicitly (Task 4).

## Meta-test inventory

- **Creates:** none.
- **Extends:** `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` — the §4.6 dual-site pin, retargeted to the single-actionable-site contract (Task 1).
- **N/A (declared):** advisory-lock topology (no `pg_advisory*`), Supabase call-boundary meta-test, `admin_alerts` catalog, §12.4 codes, no-inline-email — none touched.

## Advisory-lock holder topology

N/A — the diff touches no `pg_advisory*` surface (render-only removal).

## Layout-dimensions task

N/A — `SectionFlagCallout` is a `flex flex-col` text block with no fixed-height/width parent constraining flex/grid children (spec §9). No `getBoundingClientRect` task required.

## File structure

- `components/admin/wizard/step3ReviewSections.tsx` — remove the 2 callout mounts + callout props + caller spread + `Step3SectionChrome` fields (Tasks 1–2).
- `components/admin/review/ShowReviewSurface.tsx` — remove the 2 chrome-provider assignments that fed the removed chrome fields (Task 2).
- `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` — rework the two callout tests into the two-fixture removal proof; fix `localCalloutHost` fixture (Tasks 1–2).
- Other callout tests (component + e2e) — sweep (Task 4).
- `DEFERRED.md`, `DEFERRED-archive.md`, `BACKLOG.md` — bookkeeping (Task 5).

---

### Task 1: Callout removal proof (two fixtures) + strip the two mounts

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`SectionFlagCallout` `:532-647`, `ModalSectionChrome` caller `:762-773`)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (`:294-321`, `:369-408`)

**Interfaces:**
- Produces: `SectionFlagCallout` with narrowed props `{ dfid, sectionId, entries, onJump, variant }` — no `useRawDecisions`, no `wizardSessionId`. The callout renders **no** `use-raw-control-callout` / `role-recognize-*-callout` testids.
- Consumes: existing fixtures `roomSplitWarning` (`:59`, `ROOM_HEADER_SPLIT_AMBIGUOUS`), `roleWarning` (`:75`, `UNKNOWN_ROLE_TOKEN`), `localCalloutHost` (`:372`), `renderBreakdown`.

- [ ] **Step 1: Rework the role-token callout test (`:294-321`) into the role-recognize removal proof**

Replace the existing `:294-321` test body (the callout role-recognize panel-expand test) with an assertion that the callout renders **no** role-recognize control for a `roleWarning`, while the list still does. Use the existing local callout host pattern (the describe at `:265-322` already builds a callout via chrome context with `calloutEntries`). Concretely, the reworked test:

```tsx
test("callout renders NO role-recognize control (demoted to preview); list still does", () => {
  const w = roleWarning("SLED DRIVER"); // UNKNOWN_ROLE_TOKEN, nonblank roleToken
  // callout host (chrome context carries calloutEntries; wizardSessionId present)
  const callout = render(calloutHost([{ warning: w, index: 0 }]));
  const box = callout.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
  expect(within(box).queryByTestId("role-recognize-trigger-callout")).toBeNull();
  expect(within(box).queryByTestId("role-recognize-panel-callout")).toBeNull();
  cleanup();
  // list host — the sole actionable site keeps the control
  const list = renderBreakdown([w], { decisions: [] });
  const row = list.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
  expect(within(row).getByTestId("role-recognize-trigger-list")).toBeTruthy();
});
```

(Reuse the `calloutHost` helper already defined at `:265-292`; if it hardcodes a use-raw fixture, parameterize it or use `localCalloutHost` from `:372`. Keep whichever host mounts the callout via `Step3SectionChromeContext` with `calloutEntries`.)

- [ ] **Step 2: Rework the use-raw callout test (`:369-408`, `:405`) into the use-raw removal proof**

Invert the callout assertion at `:405`:

```tsx
// was: expect(within(box).getByTestId("use-raw-control-callout")).toBeTruthy();
expect(within(box).queryByTestId("use-raw-control-callout")).toBeNull();
```

Keep the list assertions (`:399-400`) unchanged (list still mounts `use-raw-control-callout`'s sibling `use-raw-control-list`). Leave the `localCalloutHost` chrome fields (`wizardSessionId`, `useRawDecisions`) in place for now — Task 2 removes them once the `Step3SectionChrome` type drops them.

- [ ] **Step 3: Run the reworked tests — verify they FAIL (RED)**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-callout-preview-demotion && pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx -t "callout"`
Expected: FAIL — the current callout still mounts both controls, so `queryByTestId(...-callout)` returns a node (not null).

- [ ] **Step 4: Strip the two mounts + callout props (minimal impl)**

In `SectionFlagCallout` (`step3ReviewSections.tsx`):
- Delete the `UseRawControlBoundary` mount block (`:607-619`, incl. its `{wizardSessionId ? (...) : null}` guard and the `§8` comment).
- Delete the `RoleRecognizeControlBoundary` mount block (`:620-631`, incl. its guard and the `§8.1` comment).
- Delete the `useRawDecisions` + `wizardSessionId` params from the destructure (`:538-539`) and the type (`:551-552`), plus the `spec 2026-07-10 §8/§9a` doc comment (`:548-550`).
- Delete the `decisionFor` local (`:557-558`) — it called `findUseRawDecision` only for the removed use-raw mount. (`findUseRawDecision` itself stays — do NOT delete the exported function.)

In the `ModalSectionChrome` → `SectionFlagCallout` caller (`:762-773`):
- Delete the two conditional spreads that pass `chrome.useRawDecisions` (`:766-768`) and `chrome.wizardSessionId` (`:769-771`).

The callout body now renders per entry: `EntryIcon` + title + `(fieldLabel)` + the "View details" jump button (`:591-606`), plus the judgment lead (`:577-584`) and "+N more" overflow (`:636-644`).

- [ ] **Step 5: Run the reworked tests — verify they PASS (GREEN)**

Run: `pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx -t "callout"`
Expected: PASS — callout renders no `-callout` controls; list still mounts `-list` controls.

- [ ] **Step 6: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "feat(crew-page): demote SectionFlagCallout controls to preview (USE-RAW-FULL-LIST-1)

Strip UseRawControlBoundary + RoleRecognizeControlBoundary from the callout so
WarningsBreakdown is the sole actionable site; two-fixture removal proof
(room-split → no use-raw-control-callout; role-token → no role-recognize-*-callout),
each still mounting on the list."
```

---

### Task 2: Orphan chrome-field cleanup (type + provider + fixture)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`Step3SectionChrome` type `:483-492`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (chrome provider `:822-828`)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (`localCalloutHost` `:383-384`)

**Interfaces:**
- Consumes: Task 1's narrowed `SectionFlagCallout` (no longer reads chrome `useRawDecisions`/`wizardSessionId`).
- Produces: `Step3SectionChrome` without `useRawDecisions`/`wizardSessionId` fields. `data.useRawDecisions` / `data.wizardSessionId` on `SectionData` are **retained** (WarningsBreakdown reads them via the `render: (s) => ...` closure at `:3719-3720`).

- [ ] **Step 1: Confirm the chrome fields are now orphaned (grep, RED-by-typecheck setup)**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-callout-preview-demotion && grep -n "chrome.useRawDecisions\|chrome.wizardSessionId" components/admin/wizard/step3ReviewSections.tsx`
Expected: no matches (Task 1 removed the only consumers at the old `:766-771`). This confirms the fields are safe to delete.

- [ ] **Step 2: Delete the chrome-type fields**

In `Step3SectionChrome` (`step3ReviewSections.tsx`), delete the `useRawDecisions?: UseRawDecision[]` + `wizardSessionId?: string` fields (`:491-492`) and their doc comment (`:483-490`).

- [ ] **Step 3: Delete the chrome-provider assignments**

In `ShowReviewSurface.tsx`, delete from the `Step3SectionChromeContext.Provider` value:
- `useRawDecisions: data.useRawDecisions,` (`:824`) and its comment (`:822-823`).
- `...(isStaged(data) ? { wizardSessionId: data.wizardSessionId } : {}),` (`:828`) and its comment (`:825-827`).

**KEEP** the `calloutEntries`/`onJumpToWarning` spread (`:838-840`) and its `isStaged(data)` gate — the preview still needs entries + the jump callback, and stays staged-only (spec §5.3).

- [ ] **Step 4: Fix the `localCalloutHost` fixture**

In `warningsBreakdownControls.test.tsx`, delete `wizardSessionId: WSID,` and `useRawDecisions: [],` from the `localCalloutHost` chrome value (`:383-384`) — those fields no longer exist on `Step3SectionChrome`, so the fixture won't typecheck otherwise. (The callout preview no longer needs them.)

- [ ] **Step 5: Typecheck + run the callout suite — verify GREEN**

Run: `pnpm typecheck && pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx`
Expected: typecheck clean (no orphan-field references); the whole file's tests pass (incl. the `:324-368` list/list duplicate-token tests, unchanged).

- [ ] **Step 6: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx components/admin/review/ShowReviewSurface.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "refactor(admin): drop orphaned callout chrome fields (useRawDecisions/wizardSessionId)

SectionFlagCallout no longer consumes them; SectionData still carries them for
WarningsBreakdown. Fixture cleanup for localCalloutHost."
```

---

### Task 3: Transition-audit confirmation (SectionFlagCallout is static preview)

**Files:**
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (add one assertion) OR reuse `step3ReviewModal.transitions.test.tsx` (Task 4 sweep decides placement)

**Interfaces:**
- Consumes: Task 1's preview-only `SectionFlagCallout`.

Per the spec §8 transition inventory + the project transition-audit rule: `SectionFlagCallout` after removal has only **deliberate static, instant** conditionals (judgment lead `:577`, overflow `:636`) and **no** `AnimatePresence` / animated conditional mount (the removed control boundaries owned their own transitions).

- [ ] **Step 1: Write the audit assertion (RED if a control mount lingers)**

Add to the callout describe block:

```tsx
test("callout preview has no AnimatePresence / animated mount (static instant only)", () => {
  const w = roleWarning("SLED DRIVER");
  const callout = render(calloutHost([{ warning: w, index: 0 }]));
  const box = callout.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
  // No mounted control subtrees (they owned the only animations in the callout).
  expect(within(box).queryByTestId("role-recognize-trigger-callout")).toBeNull();
  expect(within(box).queryByTestId("use-raw-control-callout")).toBeNull();
  // Static preview affordances remain: title + View details jump.
  expect(within(box).getByText(/View details/)).toBeTruthy();
});
```

- [ ] **Step 2: Run — verify PASS (GREEN, controls already removed by Task 1)**

Run: `pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx -t "AnimatePresence"`
Expected: PASS.

- [ ] **Step 3: Grep-confirm no `AnimatePresence` / `motion.` inside SectionFlagCallout**

Run: `sed -n '532,647p' components/admin/wizard/step3ReviewSections.tsx | grep -n "AnimatePresence\|motion\.\|animate-\[" || echo "NONE — static preview confirmed"`
Expected: `NONE — static preview confirmed`.

- [ ] **Step 4: Commit**

```bash
git add tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "test(crew-page): transition-audit — callout preview is static/instant, no animated mount"
```

---

### Task 4: Sweep remaining callout tests (component + e2e)

**Files:**
- Inspect/modify as needed: `tests/components/admin/wizard/step3ReviewSections.test.tsx`, `rawUnrecognizedCallout.test.tsx`, `Step3ReviewModal.test.tsx`, `step3ReviewModal.transitions.test.tsx`, `tests/components/admin/review/publishedNoStagedTraffic.test.tsx`
- Inspect/modify as needed: `tests/e2e/step3-review-modal.interactions.spec.ts:615`, `tests/e2e/step3-review-modal.layout.spec.ts:421`

**Interfaces:** none produced; this is a regression sweep.

- [ ] **Step 1: Enumerate every callout-control assertion**

Run:
```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-callout-preview-demotion
grep -rn "use-raw-control-callout\|role-recognize-.*-callout\|flag-callout.*button\|flag-callout\b" tests/components tests/e2e
```
For each hit, classify: (a) asserts a callout **control** → must invert to expect-absent or move to the list; (b) merely renders the callout / targets the "View details" jump or the container → no change.

- [ ] **Step 2: Update any component test that asserts callout controls**

Apply the same inversion as Task 1 (expect `queryByTestId("...-callout")` null for control testids). If a test's whole premise was "callout is actionable," retarget it to the list or delete if now redundant with Task 1's proof. Show the exact edit per file inline in the commit.

- [ ] **Step 3: Check the two e2e specs for button-index/count shift**

`step3-review-modal.layout.spec.ts:421` targets `flag-callout button` (the FIRST callout button). Before demotion the callout had control buttons ahead of / alongside "View details"; after demotion the first `button` is "View details" (or the judgment lead has none). Read both specs around the cited lines; if either asserts a specific button count, index, or a control-button label, update it to the preview reality. If they only click the container / "View details", leave unchanged.

- [ ] **Step 4: Run the component sweep suite**

Run: `pnpm vitest run tests/components/admin/wizard tests/components/admin/review`
Expected: PASS (all callout assertions reflect preview-only).

- [ ] **Step 5: Run the two e2e specs (env-bound — run explicitly)**

Run: `pnpm test:e2e tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/step3-review-modal.layout.spec.ts` (or the repo's canonical e2e invocation — check `package.json` scripts; if a dev server / seeded DB is required, follow `AGENTS.md` e2e setup).
Expected: PASS. If the e2e harness is unavailable in this environment, note it and rely on real CI (Stage 4) to run them — but attempt locally first.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit --no-verify -m "test: sweep callout-control assertions to preview-only (component + e2e)"
```

---

### Task 5: Impeccable dual-gate (invariant 8)

**Files:** the working diff (UI surface under `components/**`).

Not a TDD task — the invariant-8 UI-evaluation gate. Runs BEFORE the whole-diff cross-model review (Stage 4).

- [ ] **Step 1: `/impeccable critique` on the diff**

Run the canonical v3 setup gates first (`context.mjs` context load: PRODUCT.md + DESIGN.md → register reference read `brand.md`/`product.md`), then `/impeccable critique` scoped to the `SectionFlagCallout` preview diff. This is a **removal** — the critique lens is "does the preview still read as a coherent, scannable warning affordance without the controls?"

- [ ] **Step 2: `/impeccable audit` on the diff**

Run `/impeccable audit` on the same diff.

- [ ] **Step 3: Triage findings**

Fix P0/P1 findings, or defer via a `DEFERRED.md` entry with a concrete trigger. Record findings + dispositions for the handoff doc §12. P2/P3 may be deferred.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit --no-verify -m "fix(crew-page): impeccable critique/audit findings on callout preview"
```
(Skip if no fixes needed — note "no P0/P1 findings" in the handoff.)

---

### Task 6: Docs bookkeeping (DEFERRED → archive, BACKLOG resolved)

**Files:**
- Modify: `DEFERRED.md` (remove §USE-RAW-FULL-LIST-1, `:31-38`)
- Modify: `DEFERRED-archive.md` (add the resolved entry)
- Modify: `BACKLOG.md` (`BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`, `:71-75` → RESOLVED)

Not a TDD task — bookkeeping (invariant-7 deferral discipline).

- [ ] **Step 1: Move the DEFERRED entry to the archive**

Cut the full `## Wizard use-raw full-list controls (2026-07-16)` + `### USE-RAW-FULL-LIST-1` block from `DEFERRED.md` (`:31-38`). Add it to `DEFERRED-archive.md` with a resolution note: `**RESOLVED** 2026-07-17 — demoted callout to preview (branch feat/use-raw-callout-preview-demotion, spec docs/superpowers/specs/2026-07-17-use-raw-callout-preview-demotion.md); WarningsBreakdown is now the sole actionable site, divergence structurally eliminated.` (Sibling USE-RAW-FULL-LIST-2/-3 already resolved — no action.)

- [ ] **Step 2: Mark the BACKLOG twin RESOLVED**

Prepend to `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION` (`BACKLOG.md:71`): `**Status:** ✅ RESOLVED — `feat/use-raw-callout-preview-demotion` (2026-07-17; spec `docs/superpowers/specs/2026-07-17-use-raw-callout-preview-demotion.md`). Callout demoted to preview; controls live only in WarningsBreakdown.` (Match the existing resolved-entry format, e.g. `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y:79`.)

- [ ] **Step 3: Prettier the docs (never the master spec)**

Run: `pnpm prettier --write DEFERRED.md DEFERRED-archive.md BACKLOG.md`
(These are plain docs, not the master spec — prettier is fine here.)

- [ ] **Step 4: Commit**

```bash
git add DEFERRED.md DEFERRED-archive.md BACKLOG.md
git commit --no-verify -m "docs(plan): resolve USE-RAW-FULL-LIST-1 + BL twin (callout preview demotion)"
```

---

### Task 7: Full pre-push verification

**Files:** none (verification gate).

Not a TDD task — the pre-push green-≠-green gate (memory: scoped gates miss regressions).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS (no regressions from the removal / orphan cleanup).

- [ ] **Step 2: Typecheck (vitest strips types)**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Lint (canonical Tailwind) + format check**

Run: `pnpm lint && pnpm format:check`
Expected: clean.

- [ ] **Step 4: Confirm the divergence is structurally gone (final grep)**

Run: `sed -n '532,647p' components/admin/wizard/step3ReviewSections.tsx | grep -n "UseRawControlBoundary\|RoleRecognizeControlBoundary" || echo "NONE — callout is preview-only"`
Expected: `NONE — callout is preview-only`.

---

## Self-Review

- **Spec coverage:** §3 render-after (Task 1 body) ✓; §4 orphan chain 4.1–4.6 (Tasks 1–2) ✓; §11 two-fixture proof (Tasks 1, 3) + sweep incl. e2e (Task 4) ✓; §8 transition-audit (Task 3) ✓; §13 bookkeeping (Task 6) ✓; §15 invariant-8 (Task 5) ✓. No gaps.
- **Placeholder scan:** every code step shows concrete edits/asserts. No TBD/TODO.
- **Type consistency:** `SectionFlagCallout` props narrowed identically in Tasks 1–2; `findUseRawDecision` explicitly retained; `data.useRawDecisions`/`wizardSessionId` retained on `SectionData`, only chrome-level fields dropped.
- **KEEP list honored:** `"callout"` enum, `findUseRawDecision`, `calloutEntries`/`onJumpToWarning`, `SectionData` decision props — all explicitly preserved.
