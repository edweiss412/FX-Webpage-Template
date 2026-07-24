# DQ Singleton Eyebrow Suppression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress the per-code eyebrow header row in published Sheet-warnings actionable groups when the group holds exactly one card and no bulk chip.

**Architecture:** Add a required `itemCount: number` to `ActiveWarningGroup`; `BulkIgnoreControls` renders the eyebrow row iff `bulk !== null || itemCount !== 1`; the single production build site threads `itemCount: g.items.length` (post-crew-filter). Grouping model untouched.

**Tech Stack:** React 19 client component, TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest + Testing Library (jsdom), existing Playwright layout gate untouched.

**Spec:** `docs/superpowers/specs/2026-07-24-dq-singleton-eyebrow-suppress-design.md` (APPROVED, adversarial R5). All §-references below are to that spec unless prefixed.

## Global Constraints

- Invariant 5: no raw §12.4 code in user-visible UI — eyebrow labels stay plain-language; tests keep `not.toContain(<CODE>)` assertions on kept rows.
- Invariant 6: one task per commit, conventional-commits style.
- Invariant 8: UI diff → impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) before cross-model review (Task 3).
- Anti-tautology scope (spec §4 preamble): applies to assertions ADDED/EDITED here; pre-existing pins referenced as verification keep their shape.
- Meta-test inventory: **none applies** — no Supabase call boundary, no admin-alert catalog row, no advisory lock (`pg_advisory*` untouched), no sentinel-hiding text, no new/edited mutation surface (render-only change; invariant-10 not triggered).
- No DB/migrations; validation-schema-parity untouched.
- Vitest does NOT typecheck (types stripped) — `pnpm typecheck` is a separate mandatory gate per task.

## File Structure

| File | Responsibility in this change |
| --- | --- |
| `components/admin/BulkIgnoreControls.tsx` | type field + suppression conditional (only render-affecting edit) |
| `components/admin/showpage/sectionWarningExtras.tsx` | thread `itemCount` at the single production constructor |
| `tests/components/admin/bulkIgnoreControls.test.tsx` | unit pins: new suppression/retention tests, fixture `itemCount`, inverted singleton pin, coverage transfer (data-gap label + invariant-5) |
| `tests/components/admin/showpage/sectionWarningControls.test.tsx` | integration pins through production build site |
| `tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx` | fixture `itemCount` only (bulk-eligible — behavior unchanged) |
| `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx` | fixture `itemCount` + honest placeholder cards for `UNKNOWN_SECTION_HEADER` (spec §3 e2e row) |
| `docs/superpowers/specs/data-quality/2026-07-17-dq-group-active-by-code.md` | one-line render-layer supersession note on the §46 singleton row |

---

### Task 1: Suppression conditional + itemCount threading + all pins

**Files:**
- Modify: `components/admin/BulkIgnoreControls.tsx:19-24` (type), `components/admin/BulkIgnoreControls.tsx:151-187` (render)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx:200-234` (final map)
- Test: `tests/components/admin/bulkIgnoreControls.test.tsx`
- Test: `tests/components/admin/showpage/sectionWarningControls.test.tsx:316-334`
- Modify: `tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx:16-28`
- Modify: `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx:44-64`

**Interfaces:**
- Produces: `ActiveWarningGroup.itemCount: number` (required) — the number of warning cards in the `cards` slot, post-crew-filter. Consumed by every constructor of the type; `BulkIgnoreControls` renders the eyebrow row iff `group.bulk !== null || group.itemCount !== 1`.

- [ ] **Step 1: Write the failing unit tests + update unit fixtures**

In `tests/components/admin/bulkIgnoreControls.test.tsx`:

(a) Add `itemCount` to every `ActiveWarningGroup` literal in the file (vitest strips types, so these run before the type exists; the count mirrors the fixture's card slot):
- `bulkGroup()` (line ~24): add `itemCount: 2,` after `label`.
- `singletonGroup()` (line ~39): add `itemCount: 1,` after `label`.
- The G4 `groupY` literal (line ~180): add `itemCount: 3,` after `label`.
- The label-null inline fixture (line ~105): add `itemCount: 2,` after `label: null`.
- The "singular clause" inline fixture (line ~359): add `itemCount: 1,` after `label`.

(b) Rewrite the grouped-render test ("every group renders an eyebrow…") — the singleton half inverts; the data-gap-label + invariant-5 coverage the singleton pin carried transfers to a NEW N=2 no-bulk fixture (spec §4.2):

```tsx
// N≥2 no-bulk: keeps the eyebrow - carries the data-gap-label + invariant-5
// coverage the suppressed singleton pin used to hold (spec 2026-07-24 §4.2).
const pluralNoBulkGroup = (): ActiveWarningGroup => ({
  code: "BLOCK_DISAPPEARED",
  label: "removed section",
  itemCount: 2,
  bulk: null,
  cards: <ul data-testid="cards-BLOCK_DISAPPEARED" />,
});

test("bulk-eligible and plural no-bulk groups keep the eyebrow; a lone singleton suppresses it (spec 2026-07-24 §2.1)", () => {
  render(
    <BulkIgnoreControls
      slug="rpas"
      groups={[bulkGroup(), pluralNoBulkGroup(), singletonGroup()]}
    />,
  );
  // Kept row 1: bulk-eligible - label + chip.
  expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").textContent).toBe(
    "Unrecognized row in sheet",
  );
  expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").textContent).not.toContain(
    "UNKNOWN_FIELD",
  );
  // Kept row 2: plural no-bulk - data-gap label path, invariant 5, no chip.
  expect(screen.getByTestId("dq-group-label-BLOCK_DISAPPEARED").textContent).toBe(
    "removed section",
  );
  expect(screen.getByTestId("dq-group-label-BLOCK_DISAPPEARED").textContent).not.toContain(
    "BLOCK_DISAPPEARED",
  );
  expect(screen.queryByTestId("dq-bulk-ignore-BLOCK_DISAPPEARED")).toBeNull();
  // Suppressed: singleton (itemCount 1, no bulk) - no eyebrow label, and no
  // bare header row either: the group's wrapper starts directly with the cards.
  expect(screen.queryByTestId("dq-group-label-BLOCK_DISAPPEARED_SOLO")).toBeNull();
  const solo = screen.getByTestId("dq-active-group-BLOCK_DISAPPEARED_SOLO");
  expect(solo.querySelector(".h-px")).toBeNull(); // no hairline row
  expect(within(solo).getByTestId("cards-BLOCK_DISAPPEARED_SOLO")).toBeTruthy(); // cards survive
  // cards slotted through on kept rows too
  expect(screen.getByTestId("cards-UNKNOWN_FIELD")).toBeTruthy();
  expect(screen.getByTestId("cards-BLOCK_DISAPPEARED")).toBeTruthy();
});
```

To keep the suppressed group distinguishable from the kept `BLOCK_DISAPPEARED` group in the same render, change `singletonGroup()` to use a distinct code string:

```tsx
// A singleton / non-ignorable group: itemCount 1, no bulk → row suppressed
// (spec 2026-07-24 §2.1). Distinct code so it can co-render with the plural
// BLOCK_DISAPPEARED fixture above.
const singletonGroup = (): ActiveWarningGroup => ({
  code: "BLOCK_DISAPPEARED_SOLO",
  label: "removed section",
  itemCount: 1,
  bulk: null,
  cards: <ul data-testid="cards-BLOCK_DISAPPEARED_SOLO" />,
});
```

(`code` is only a key/testid discriminator in this component — any string is type-legal.) Sweep the file for other uses of `singletonGroup` / `cards-BLOCK_DISAPPEARED` testids (line ~153 renders `[bulkGroup(), singletonGroup()]`) and update expectations there: that test asserts card slots render — keep it asserting `cards-BLOCK_DISAPPEARED_SOLO` presence (cards render even when the row is suppressed).

(c) Add the N=1-with-bulk retention test (spec §4.3):

```tsx
test("a group with one visible card but a live bulk chip keeps the eyebrow row (spec 2026-07-24 §2.1)", () => {
  render(
    <BulkIgnoreControls
      slug="rpas"
      groups={[
        {
          code: "FIELD_UNREADABLE",
          label: "Unreadable field",
          itemCount: 1, // one card left in the slot - the other moved under a crew row
          bulk: {
            code: "FIELD_UNREADABLE",
            label: "Unreadable field",
            items: [
              { code: "FIELD_UNREADABLE", rawSnippet: "Crew phone | ???" },
              { code: "FIELD_UNREADABLE", rawSnippet: "Hotel | ???" },
            ],
          },
          cards: <ul data-testid="cards-FIELD_UNREADABLE" />,
        },
      ]}
    />,
  );
  expect(screen.getByTestId("dq-group-label-FIELD_UNREADABLE").textContent).toBe(
    "Unreadable field",
  );
  expect(screen.getByTestId("dq-bulk-ignore-FIELD_UNREADABLE").textContent).toBe("Ignore all 2");
});
```

`within` is imported from `@testing-library/react` — extend the existing import if not present.

- [ ] **Step 2: Run the unit file — expect the new/changed tests to FAIL**

Run: `pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx`
Expected: FAIL — the suppression test finds `dq-group-label-BLOCK_DISAPPEARED_SOLO` present (eyebrow still renders); retention tests pass vacuously or fail on fixture drift. Failures must be the suppression assertions, not compile errors.

- [ ] **Step 3: Implement — type field + conditional**

In `components/admin/BulkIgnoreControls.tsx`, extend the type (after `bulk`):

```tsx
export type ActiveWarningGroup = {
  code: string;
  label: string | null;
  bulk: BulkIgnoreGroupWithLabel | null;
  /** Number of warning cards in the `cards` slot (post crew-filter). The eyebrow
   *  row is suppressed for a lone chip-less card - its title already carries the
   *  type (spec 2026-07-24-dq-singleton-eyebrow-suppress §2.1). */
  itemCount: number;
  cards: ReactNode;
};
```

In the `groups.map` body (before `return`), add the predicate and wrap the header row:

```tsx
        // spec 2026-07-24 §2.1: a lone chip-less card duplicates its own title in
        // the eyebrow - suppress the whole header row. Any group with a bulk chip
        // keeps the row (the chip rides it), as does any plural group.
        const showEyebrowRow = bulk !== null || group.itemCount !== 1;
```

and replace the unconditional header `<div className="flex items-center gap-2">…</div>` with:

```tsx
            {showEyebrowRow ? (
              <div className="flex items-center gap-2">
                {group.label ? (
                  <span
                    data-testid={`dq-group-label-${group.code}`}
                    className="min-w-0 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
                  >
                    {group.label}
                  </span>
                ) : null}
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                {bulk ? (
                  <>
                    <button
                      type="button"
                      data-testid={`dq-bulk-ignore-${group.code}`}
                      onClick={() => onGuardedClick(bulk)}
                      disabled={state.kind === "running"}
                      aria-busy={running}
                      aria-label={group.label ? `${chipText} · ${group.label}` : undefined}
                      className={armed ? ARMED_BTN : BTN}
                    >
                      {chipText}
                    </button>
                    {/* Persistent sr-only live region (always mounted - conditional mounting
                        drops the announcement). Kept as the chip's nextElementSibling. */}
                    <span role="status" className="sr-only">
                      {armed ? "Tap again to confirm." : ""}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
```

(The inner markup is byte-identical to today's `BulkIgnoreControls.tsx:157-187`; only the `showEyebrowRow` wrapper is new. The sr-only live region sits inside the row, which is only removable when `bulk === null` — no chip, no pending announcement, so no announcement is droppable.)

In `components/admin/showpage/sectionWarningExtras.tsx`, in the FINAL `.map` (the one producing `cards`, current lines 200-234), add after `bulk: g.bulk,`:

```tsx
        // spec 2026-07-24 §2.2: the number of cards actually in the slot -
        // post-crew-filter, so a partially-moved group counts only what renders here.
        itemCount: g.items.length,
```

- [ ] **Step 4: Run the unit file — expect PASS**

Run: `pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Update the integration pins (production build site)**

In `tests/components/admin/showpage/sectionWarningControls.test.tsx`, DQIGNORE-6 test (line ~316): the lone `UNKNOWN_ROLE_TOKEN` group's eyebrow is now suppressed; transfer its label/invariant-5 assertions to the kept `FIELD_UNREADABLE` row (spec §4.5). Replace the final block of that test:

```tsx
    // The bulk chip rides only the eligible group (2 distinct snippets); the lone role token has none.
    expect(crew.getByTestId("dq-bulk-ignore-FIELD_UNREADABLE").textContent).toBe("Ignore all 2");
    expect(crew.queryByTestId("dq-bulk-ignore-UNKNOWN_ROLE_TOKEN")).toBeNull();
    // spec 2026-07-24 §2.1: the lone UNKNOWN_ROLE_TOKEN group (1 card, no chip)
    // suppresses its eyebrow - the card renders alone; its title carries the type.
    expect(crew.queryByTestId("dq-group-label-UNKNOWN_ROLE_TOKEN")).toBeNull();
    // Eyebrow label on the KEPT row, scoped to its own testid (anti-tautology: the
    // cards also render copy) - plain-language bulkGroupLabel path, never the raw
    // §12.4 code (invariant 5). Coverage transferred from the suppressed pin.
    const eyebrow = crew.getByTestId("dq-group-label-FIELD_UNREADABLE");
    expect(eyebrow.textContent).toBe(messageFor("FIELD_UNREADABLE" as MessageCode).title);
    expect(eyebrow.textContent).not.toContain("FIELD_UNREADABLE");
```

(Keep the earlier assertions of that test — both `dq-active-group-*` wrappers and the two card lists still render.)

- [ ] **Step 6: Update the remaining constructors (typecheck-driven sweep)**

`tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx` `g()` (line ~16): add `itemCount: 2,` after `label`.

`tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx` (spec §3 e2e row): `FIELD_UNREADABLE` group gets `itemCount: 2,`; `UNKNOWN_SECTION_HEADER` gets honest plural cards + count:

```tsx
  {
    code: "UNKNOWN_SECTION_HEADER",
    label: MESSAGE_CATALOG.UNKNOWN_SECTION_HEADER.title,
    bulk: null,
    // Two placeholder cards keep this group's eyebrow rendering (visual plurality
    // in the harness) while honoring the itemCount contract - the layout spec
    // asserts nothing on this group (spec 2026-07-24 §3).
    itemCount: 2,
    cards: (
      <div>
        <div />
        <div />
      </div>
    ),
  },
```

Then run: `pnpm typecheck`
Expected: PASS. If it lists any other `ActiveWarningGroup` constructor, add an honest `itemCount` there too (the required field IS the sweep — spec §4.6).

- [ ] **Step 7: Run every affected suite + repo gates**

Run: `pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx tests/components/admin/showpage/sectionWarningControls.test.tsx tests/components/admin/showpage/crewWarningAttachment.test.tsx`
Expected: PASS — `crewWarningAttachment.test.tsx` UNMODIFIED (spec §4.7: its N=0/N=1-with-bulk chip pins must survive; a diff in that file is a plan violation).
Run: `pnpm eslint components/admin/BulkIgnoreControls.tsx components/admin/showpage/sectionWarningExtras.tsx` and `pnpm format:check` (scoped output ok).
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/admin/BulkIgnoreControls.tsx components/admin/showpage/sectionWarningExtras.tsx tests/components/admin/bulkIgnoreControls.test.tsx tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx tests/components/admin/showpage/sectionWarningControls.test.tsx tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx
git commit --no-verify -m "feat(admin): suppress per-code eyebrow for lone chip-less warning groups"
```

---

### Task 2: Spec supersession note + full local verification

**Files:**
- Modify: `docs/superpowers/specs/data-quality/2026-07-17-dq-group-active-by-code.md:46`

**Interfaces:**
- Consumes: Task 1's shipped behavior.
- Produces: cross-referenced spec trail; verified-green local gates.

- [ ] **Step 1: Append the supersession note to the §46 table row**

Edit line 46, appending to the cell text (single line, no restructure):

```
| A single active warning under a code | Still gets its own eyebrow group (one card). No chip unless ≥2 distinct contents. **Superseded at the render layer 2026-07-24:** the row's eyebrow is suppressed at N=1/no-chip — grouping model unchanged; see `docs/superpowers/specs/2026-07-24-dq-singleton-eyebrow-suppress-design.md` §1.1/§2.1. |
```

Do NOT run prettier over this spec file beyond the line edit.

- [ ] **Step 2: Run the full local gates**

Run: `pnpm test`
Expected: PASS (env-bound/e2e suites are excluded from `pnpm test` by config; registry suites under `tests/styles` + `tests/help` are included — do not scope this run).
Run: `pnpm typecheck && pnpm eslint . && pnpm format:check`
Expected: all clean. Check `$?` on the vitest run, not just the Tests line (uncaught-error exit-1 trap).

- [ ] **Step 3: Verify the layout gate still passes against the edited live entry**

Run: `pnpm exec playwright test tests/e2e/bulk-ignore-eyebrow.layout.spec.ts --no-deps 2>&1 | tail -5` (source `.env.local` per the standalone-playwright convention if the run complains about env; the spec measures only the `FIELD_UNREADABLE` group, which kept its eyebrow).
Expected: PASS. If the harness build chokes on the fixture edit, the failure is in this branch's diff — fix before commit.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/data-quality/2026-07-17-dq-group-active-by-code.md
git commit --no-verify -m "docs: mark DQIGNORE-6 singleton-eyebrow row superseded at render layer"
```

---

### Task 3: Impeccable dual-gate (invariant 8)

**Files:**
- None expected; fixes land here if the gates find P0/P1.

**Interfaces:**
- Consumes: the full Task-1 diff.
- Produces: gate dispositions for the close-out record (§12-style notes in the PR body — this feature has no milestone handoff doc).

- [ ] **Step 1: Run `/impeccable critique` on the affected diff** (canonical v3 setup gates: impeccable v3 context load → register reference read). Scope: `components/admin/BulkIgnoreControls.tsx`, `components/admin/showpage/sectionWarningExtras.tsx`.
- [ ] **Step 2: Run `/impeccable audit` on the same diff.**
- [ ] **Step 3: Fix P0/P1 findings or defer via `DEFERRED.md` entry; P2/P3 at discretion.** Re-run the affected gate after any fix. Commit any fixes as `fix(admin): …` (one commit).
- [ ] **Step 4: Record dispositions** for the PR body (findings + fixed/deferred each).

---

## Self-Review (run at authoring time — result)

1. **Spec coverage:** §2.1 predicate → Task 1 Step 3; §2.2 threading → Task 1 Step 3; §2.3 guard rows → covered by predicate + §4 tests (type-guaranteed rows need no runtime code per spec); §2.5 transition (instant) → no animation code, transition-audit fixture updated Task 1 Step 6; §3 table → every row has a task line (crewWarningAttachment = verify-unmodified, Task 1 Step 7); §4.1-4.7 tests → Task 1 Steps 1/5/6/7; supersession note → Task 2; impeccable → Task 3. No gaps.
2. **Placeholder scan:** no TBD/TODO/"similar to"; every code step shows code.
3. **Type consistency:** `itemCount: number` required, same name in type/build-site/fixtures; `showEyebrowRow` local only. Snippets checked against strict tsconfig: no indexed access added, no optional-property writes; `within` import called out.
4. **Pre-existing-failure baseline:** verify at merge-base if any Task 2 full-suite failure looks unrelated (`git stash` → rerun → compare) before attributing to this diff.
