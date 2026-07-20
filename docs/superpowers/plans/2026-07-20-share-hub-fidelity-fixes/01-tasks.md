# Tasks — share-hub fidelity fixes

Every task is TDD: write the failing test, run it and SEE it fail for the stated reason,
implement minimally, run it green, commit. Snippets were typechecked against the repo's
strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) before dispatch.

Spec sections are authoritative; where this file and the spec disagree, the spec wins.

---

## Task 1 — Conditional elevation on the ShareHub root

**Spec:** §3.1, §3.2, §3.2b, §3.4
**Files:** `tests/components/admin/showpage/shareHub.test.tsx`,
`components/admin/showpage/ShareHub.tsx`

`components/admin/showpage/PublishedReviewModal.tsx` is **NOT** edited. Per the corrected
§3.1, `z-index: auto` establishes no stacking context, so the attention panel's `z-20`
already participates in the shared ancestor context and beats the hub's non-positioned
trigger buttons the moment the hub's own `z-30` is gone.

### Failing tests first

```tsx
it("elevates its root ONLY while open, so a closed hub cannot paint over the attention menu", () => {
  renderHub();
  const root = primary().parentElement as HTMLElement;
  expect(root.className).toContain("relative");
  expect(root.className).not.toContain("z-30");

  fireEvent.click(primary());
  expect(root.className).toContain("z-30");

  fireEvent.click(primary());
  expect(root.className).not.toContain("z-30");
});

it("keeps BOTH triggers non-positioned, which is what lets the z-20 menu win", () => {
  renderHub();
  // A `relative` here would re-create the defect in a subtler form: a positioned
  // trigger at z-auto paints above the menu's z-20 by tree order.
  for (const el of [primary(), kebab()]) {
    expect(el.className).not.toMatch(/\b(relative|absolute|fixed|sticky)\b/);
  }
});
```

**Failure modes caught:** the unconditional `z-30` (the shipped defect), and a future
`relative` on a trigger that would silently reintroduce it.

**Why class assertions here:** jsdom loads no CSS, so `toBeVisible()` is vacuous and paint
order is uncomputable. Real paint order is proved in Task 5.

### Implementation

`components/admin/showpage/ShareHub.tsx:221`:

```tsx
<div className={`relative flex items-center gap-2 ${open ? "z-30" : ""}`}>
```

### Must still pass, unchanged

`tests/components/admin/showpage/shareHub.test.tsx:158` ("keeps both triggers clickable
above the backdrop") — the backdrop is `z-20` INSIDE the now-conditionally-elevated root,
so its relationship to the triggers is unchanged. A failure there means the change is wrong.

**Commit:** `fix(admin): elevate the share hub only while its popover is open`

---

## Task 2 — Rotate idle row becomes a menu row

**Spec:** §4.1, §4.2, §4.4, §4.5, §4.6
**Files:** `tests/components/admin/showpage/shareHub.test.tsx`,
`app/admin/show/[slug]/RotateShareTokenButton.tsx`

`tests/components/RotateShareTokenButton.test.tsx`: every existing assertion must keep
passing untouched — §4.2 RETAINS rotate's `aria-label` + `aria-describedby` wiring, so a
red there means the implementation drifted. It gets exactly ONE addition (§7.2): render
with a non-default `rowLabel` and assert `aria-label` equals THAT string, which pins the
`aria-label={rowLabel}` binding and fails if someone re-hardcodes the literal.

### Step 0 — the shared assertion helper (ALREADY LANDED)

`tests/components/admin/showpage/_rowAssertions.ts` shipped with the round-3 repair commit,
not as part of this task, because it is the structural defense and had to be PROVEN before
being relied on. A throwaway probe verified all of it against real DOM:
`expectClasses` accepts `w-full` and rejects `sm:w-full`; `forbids: [NO_REST_BACKGROUND]`
accepts `hover:bg-surface-sunken` and rejects a bare `bg-surface-sunken` (the exact case
the withdrawn regex missed); `expectRowText` THROWS when the label is left outside the
button and THROWS on a surviving duplicate description, while passing the correct shape.
Lucide was confirmed to stamp `lucide-rotate-ccw` / `lucide-refresh-cw` identity classes
and to render `width`/`height` `"16"` for `size={16}`, so the icon-identity assertions are
real rather than aspirational. It is the structural defense for the class three consecutive
review rounds kept finding (assertion forms a wrong implementation can satisfy): rigor
lives in one reviewed module instead of being re-remembered per test. Every row assertion
in Tasks 2, 3, and 4 goes through it.

### Failing test first

ADD (do not replace) alongside the existing wiring test at
`tests/components/admin/showpage/shareHub.test.tsx:292`:

```tsx
import {
  expectClasses, expectNoDescriptionNode, expectRowText, NO_BORDER, NO_REST_BACKGROUND,
} from "./_rowAssertions";

const ROW_TOKENS = [
  "flex", "w-full", "items-center", "gap-2", "rounded-sm",
  "min-h-tap-min", "px-2", "py-2", "text-left",
  "hover:bg-surface-sunken", "transition-colors", "duration-fast",
  "focus-visible:outline-none", "focus-visible:ring-2", "focus-visible:ring-focus-ring",
] as const;

it("rotate idle state is ONE borderless full-width menu row", () => {
  renderHub({ published: true });
  fireEvent.click(primary());

  const rotate = screen.getByTestId("admin-rotate-share-token-button");
  expect(rotate.tagName).toBe("BUTTON");
  // `exactly`, not `has`: the spec prescribes this list completely, so an
  // overriding extra (sm:w-auto, items-start, px-0) must FAIL rather than ride
  // along beside the token it overrides.
  expectClasses(rotate, { exactly: ROW_TOKENS, forbids: [NO_BORDER, NO_REST_BACKGROUND] });

  // One call covers containment + exactness + uniqueness for BOTH strings
  // (spec §7.0). Uniqueness alone would miss a label left outside the button;
  // containment alone would miss a surviving duplicate.
  expectRowText(rotate, popover(), {
    label: "Rotate share link",
    description: "Old link stops working immediately",
  });

  // The column, its exact classes, and the [icon, column] row topology are all
  // asserted INSIDE expectRowText (§7.0) — including that label and description
  // are STACKED IN the column rather than being direct flex-row children of the
  // button, which would satisfy every per-element check while reading as one line.

  const icon = rotate.querySelector("svg")!;
  expect(icon.getAttribute("width")).toBe("16");
  expect(icon.getAttribute("height")).toBe("16");
  // `has` here, deliberately: lucide also stamps its own base `lucide` class,
  // so this list is NOT complete and `exactly` would be wrong.
  expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-rotate-ccw"] });

  // The OLD shape must be GONE, not merely joined by the new one.
  expect(within(popover()).queryByRole("button", { name: "Rotate" })).toBeNull();

  // §4.6 width chain link 1: the wrapper, not just the button.
  expectClasses(rotate.parentElement!, { has: ["w-full"] });
});
```

**Failure modes caught:** the split label + separate `Rotate` button; a bordered or
background-filled row; the description surviving only as an `aria-label` fragment rather
than visible text; a shrink-wrapped wrapper that makes `w-full` resolve short.

### Also failing first — the §4.5 whitespace guards

Bare truthiness for either prop passes every test above while violating §4.5, so both
guards need their own case. These go in `tests/components/RotateShareTokenButton.test.tsx`
(the only place `rowLabel` / `rowDescription` can be varied — ShareHub hardcodes them):

```tsx
it("GUARD whitespace-only rowDescription: no span, no aria-describedby", () => {
  render(
    <RotateShareTokenButton
      showId={SHOW_ID}
      slug={SLUG}
      compact
      rowLabel="Rotate share link"
      rowDescription="   "
    />,
  );
  const btn = screen.getByTestId("admin-rotate-share-token-button");
  // An empty described node is worse than none: SRs announce a blank description.
  expect(btn.textContent).toBe("Rotate share link");
  // Tag-agnostic structural absence (§7.0). A span COUNT is not enough: an
  // empty `<p id={descId} class="text-xs text-text-subtle">` survives it while
  // leaving the forbidden empty described node in the tree. This helper asserts
  // the column holds the label and nothing else, whatever tag the escape uses.
  expectNoDescriptionNode(btn, btn.closest("body")!, "Rotate share link");
});

it("GUARD whitespace-only rowLabel: no EMPTY aria-label", () => {
  render(
    <RotateShareTokenButton showId={SHOW_ID} slug={SLUG} compact rowLabel="   " />,
  );
  const btn = screen.getByTestId("admin-rotate-share-token-button");
  // ABSENT, not merely non-empty. `.not.toBe("")` would also pass the wrong
  // implementation `aria-label={rowLabel}`, which yields "   " — a whitespace
  // accessible name, which is what §4.2 forbids.
  expect(btn.getAttribute("aria-label")).toBeNull();
});

it("GUARD rowDescription absent: row renders, no described node", () => {
  render(
    <RotateShareTokenButton showId={SHOW_ID} slug={SLUG} compact rowLabel="Rotate share link" />,
  );
  const btn = screen.getByTestId("admin-rotate-share-token-button");
  expect(btn.textContent).toBe("Rotate share link");
  expectNoDescriptionNode(btn, btn.closest("body")!, "Rotate share link");
});
```

Note the second case exercises the §4.5 hybrid path (`compact && rowLabel` is truthy for
`"   "`, so the ROW renders and the trim-guard applies). A falsy `rowLabel` takes the
pre-existing non-row path and is out of scope.

### Implementation

`RotateShareTokenButton.tsx`, the `compact && rowLabel` **idle** branch only.

```tsx
const rowButton = (
  <button
    type="button"
    ref={triggerRef}
    onClick={onRotateClick}
    data-testid="admin-rotate-share-token-button"
    aria-label={rowLabel?.trim() ? rowLabel : undefined}
    aria-describedby={rowDescription?.trim() ? descId : undefined}
    className="flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
  >
    <RotateCcw aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
    <span className="flex min-w-0 flex-col">
      <span className="text-sm font-medium text-text-strong">{rowLabel}</span>
      {rowDescription?.trim() ? (
        <span id={descId} className="text-xs text-text-subtle">
          {rowDescription}
        </span>
      ) : null}
    </span>
  </button>
);
```

Idle return for the compact branch: `<div className="flex w-full flex-col gap-2">{rowButton}{banners}</div>`
(`py-3` dropped — the popover owns row spacing; `w-full` added per §4.6).

`aria-label` is **bound to `rowLabel`**, never re-hardcoded to a literal — §4.2: a caller
passing a different `rowLabel` would otherwise violate WCAG 2.5.3 silently. Both attributes
use `undefined` (not `null`) for the absent case; `exactOptionalPropertyTypes` rejects
`null` here, and an EMPTY `aria-label` is worse than none, hence the `.trim()` guards.

**Mode boundary (§4.4):** `labelHeader` is currently shared by the compact idle AND compact
confirm renders (`app/admin/show/[slug]/RotateShareTokenButton.tsx:201-211`, used again at
`:335`). The new row's internal label/description spans are **separate markup** — `labelHeader`
stays exactly as it is for the confirm branch. Do not refactor them into one helper; the
confirm render is ratified and must not shift.

**Do NOT touch:** the non-compact branch, the confirm branch, the busy-contract effect,
`triggerRef` placement (it stays on the idle button so the C5 focus restore lands on a
mounted node), or any testid. `descId` stays alive — it is the `aria-describedby` target.

**Commit:** `fix(admin): rotate share link renders as a popover menu row`

---

## Task 3 — Reset idle row becomes a menu row

**Spec:** §4.1, §4.2, §4.3, §4.4, §4.5, §4.6
**Files:** `tests/components/admin/showpage/shareHub.test.tsx`,
`tests/admin/pickerResetControl.test.tsx`,
`app/admin/show/[slug]/PickerResetControl.tsx`

### Failing test first

```tsx
it("reset idle state is ONE menu row, contributes no heading, and keeps its ring offset", () => {
  renderHub();
  fireEvent.click(primary());

  const reset = screen.getByTestId("picker-reset-all-button");
  expect(reset.tagName).toBe("BUTTON");
  expectClasses(reset, {
    exactly: [
      ...ROW_TOKENS,
      // reset-ONLY: the guard against silently homogenizing the two rows' focus
      // treatment, and against a disabled row lighting up on hover (§4.7).
      "focus-visible:ring-offset-2", "focus-visible:ring-offset-surface",
      "disabled:cursor-not-allowed", "disabled:opacity-60", "disabled:hover:bg-transparent",
    ],
    forbids: [NO_BORDER, NO_REST_BACKGROUND],
  });

  expectRowText(reset, popover(), {
    label: "Reset everyone's pick",
    description: "Make everyone pick their name again on their next visit.",
  });

  const icon = reset.querySelector("svg")!;
  expect(icon.getAttribute("width")).toBe("16");
  expect(icon.getAttribute("height")).toBe("16");
  // Identity, not just dimensions: a wrong glyph passes a size-only check.
  expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-refresh-cw"] });

  // §4.3: the PCR-1 (b) <h4> is deliberately gone; `Careful` <h3> still stands.
  expect(within(popover()).queryByRole("heading", { level: 4 })).toBeNull();
  expect(within(popover()).getByRole("heading", { level: 3, name: "Careful" })).toBeTruthy();
  expectClasses(reset.parentElement!, { has: ["w-full"] });
});

it("GUARD empty crew: reset row is disabled and its empty copy IS the described text", () => {
  renderHub({ pickerCrew: [] });
  fireEvent.click(primary());

  const reset = screen.getByTestId("picker-reset-all-button") as HTMLButtonElement;
  expect(reset.disabled).toBe(true);
  expectRowText(reset, popover(), {
    label: "Reset everyone's pick",
    description: "No crew to reset yet.",
  });
});
```

The `ring-offset` assertions are the concrete guard against silently homogenizing the two
rows' focus treatment (§4.1) — reset ships an offset pair that rotate does not.

Then `tests/admin/pickerResetControl.test.tsx:38`: replace the `getByRole("heading", …)`
assertion with one that the label is visible text inside the row button AND is the
button's `aria-label`. Every other assertion in that file stays byte-identical.

### Implementation

`PickerResetControl.tsx`, the `!inConfirm` branch: collapse the `<div className="min-w-0">`
heading block and the separate button into one row button of the Task 2 shape, with
`RefreshCw` (size 16, `shrink-0 text-text-subtle`), keeping `ref={triggerRef}`,
`onClick={enterConfirm}`, `disabled={!hasCrew}`, the testid, the `disabled:` pair, and
reset's ring-offset classes. The `<h4>` becomes a `<span className="text-sm font-medium text-text-strong">`.

Add the `aria-label` + `aria-describedby` pair (§4.2) — the component renders `descId`
today but never wires it (`app/admin/show/[slug]/PickerResetControl.tsx:217`); `descId`
must stay and now becomes the `aria-describedby` target on the button.

Root `<div data-testid="picker-reset-control">` becomes `flex w-full flex-col gap-2`
(`py-3` dropped, `w-full` added per §4.6).

`warningId` still wires the confirm row and MUST stay. The confirm branch, both banners,
and the `sr-only` live region are untouched.

**Also in this commit:** correct the stale doc comment at
`app/admin/show/[slug]/PickerResetControl.tsx:46-47` that names
`components/admin/wizard/step3ReviewSections.tsx` a consumer. It is not one — it carries
its own parallel implementation and only mentions this component in comments
(`:1263`, `:1284`). That stale line produced a BLOCKING false positive in spec review
(§4.3); fixing it is the structural defense against a repeat.

**Commit:** `fix(admin): reset everyone's pick renders as a popover menu row`

---

## Task 4 — Caret notch as a sibling of the popover

**Spec:** §5, §4.6
**Files:** `tests/components/admin/showpage/shareHub.test.tsx`,
`components/admin/showpage/ShareHub.tsx`

The popover's own classes are **unchanged** — no outer/inner split (§5 withdraws it).

### Failing test first

```tsx
it("renders a decorative caret OUTSIDE the popover, leaving the dialog's scroll intact", () => {
  renderHub();
  fireEvent.click(primary());

  const caret = screen.getByTestId("share-hub-caret");
  expect(caret.getAttribute("aria-hidden")).toBe("true");

  // §5: sibling, NOT a child — a child would be clipped by overflow-y-auto
  // and silently invisible.
  expect(popover().contains(caret)).toBe(false);

  // Two z-40 siblings: TREE ORDER decides paint order, not z-index. The caret
  // must follow the popover or the panel's top border cuts the notch.
  expect(
    popover().compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  // aria-hidden does not disable hit-testing; without this the caret would
  // intercept clicks in its overlap with the panel and any
  // panelRef.contains(target) check would read them as outside the dialog.
  expectClasses(caret, { has: ["pointer-events-none"] });

  // Siblinghood under the SAME positioned parent. Order + classes alone do not
  // prove it: a caret rendered outside the ShareHub root, as a sibling of the
  // ROOT rather than of the popover, satisfies every assertion above while
  // being positioned against the wrong ancestor.
  expect(caret.parentElement).toBe(popover().parentElement);
  expectClasses(caret.parentElement!, { has: ["relative"] });

  // The dialog still owns its own scrolling (the regression the withdrawn
  // outer/inner split would have caused). Token-exact per §7.0.1 — a
  // `.toContain` here would also pass for a variant-prefixed lookalike.
  expectClasses(popover(), { has: ["overflow-y-auto", "max-h-[min(70vh,32rem)]"] });

  fireEvent.click(primary());
  expect(screen.queryByTestId("share-hub-caret")).toBeNull();
});
```

**Failure modes caught:** a caret rendered inside the clipped scroller (invisible, and
invisible to every non-pixel test); the scroll container migrating off the focused dialog;
a caret that outlives the popover's open state.

### Implementation

In `ShareHub.tsx`, inside the same `{open && (…)}` region as the popover, as its sibling:

```tsx
<span
  aria-hidden="true"
  data-testid="share-hub-caret"
  className="pointer-events-none absolute top-full right-[17px] z-40 mt-1 size-2.5 rotate-45 border-l border-t border-border bg-surface"
/>
```

Both are positioned against the ShareHub root's `relative`. **Render the caret AFTER the
popover** — they share `z-40`, so tree order is what decides which paints on top (§5).

**Commit:** `feat(admin): caret notch on the share popover, anchored to the kebab`

---

## Task 5 — Real-browser z-order, dimensional invariants, caret

**Spec:** §7.3, §7.4
**Files:** `tests/e2e/published-review-modal.interactions.spec.ts`

Step 1 is to READ the layout spec's share-hub block (`tests/e2e/published-review-modal.layout.spec.ts:287-330`)
and confirm it is a static harness that clicks nothing. Both assertions here need an opened
popover, and T-HUB-ZORDER additionally needs an opened attention menu, so the hydrated
interactions spec is the only viable home. Confirm; do not assume.

### T-HUB-ZORDER

```ts
await page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`).click();
const menu = page.locator('[data-testid="published-show-review-attention-menu"]');
await expect(menu).toBeVisible();

const menuBox = await menu.boundingBox();
const hubBox = await page.locator('[data-testid="share-hub-primary"]').boundingBox();
if (!menuBox || !hubBox) throw new Error("menu and share-hub must both be laid out");

// PRECONDITION — fails loud, never skips.
const ix = Math.max(menuBox.x, hubBox.x);
const iy = Math.max(menuBox.y, hubBox.y);
const ir = Math.min(menuBox.x + menuBox.width, hubBox.x + hubBox.width);
const ib = Math.min(menuBox.y + menuBox.height, hubBox.y + hubBox.height);
expect(
  ir > ix && ib > iy,
  "attention menu and share-hub button must overlap for this test to mean anything",
).toBe(true);

const hit = await page.evaluate(
  ([x, y]: [number, number]) => {
    const el = document.elementFromPoint(x, y);
    return {
      inMenu: !!el?.closest('[data-testid="published-show-review-attention-menu"]'),
      inHub: !!el?.closest('[data-testid="share-hub-primary"]'),
    };
  },
  [(ix + ir) / 2, (iy + ib) / 2] as [number, number],
);
expect(hit.inMenu).toBe(true);
expect(hit.inHub).toBe(false);
```

A computed-style or class assertion would pass against a wrapper that is elevated but still
loses in paint order — which is the defect. Detach-safety: each rect resolves in the step
that uses it; the `evaluate` receives plain numbers, not element handles.

### Dimensional invariants (§7.4)

With the popover open, assert — all derived from measured rects, never hardcoded:

1. Both rows' widths equal the panel's content width (±0.5px), measured against the PANEL,
   so a missing `w-full` on either the wrapper or the button fails here.
2. Both rows `height >= 44`.
3. With a long-description fixture: row height > 44 AND the label's top is ≥8px below the
   row's top (the `py-2` decision).
4. Both leading icons resolve 16×16 and do not shrink when the label wraps.
5. `panel.scrollWidth <= panel.clientWidth` (no horizontal overflow of the 308px panel).
6. The `role="dialog"` element is the scroller and is the focused element on open.
7. Panel right edge === trigger-group right edge (±0.5px).

### Caret (§7.4.8)

Horizontal center within 0.5px of the kebab's; `width === height === 10` (±0.5px); rect
fully inside the viewport and `elementFromPoint` at its tip returns the caret or the panel
(not a node behind it — the clipped-invisible guard); its vertical box overlaps the panel's
top edge; resolved `background-color` equals the panel's and both drawn borders are
non-zero. Locator: `[data-testid="share-hub-caret"]`.

### Harness readiness

- **Boot:** the interactions spec's existing dev-server mechanism and config.
- **Readiness gate:** `settleDashboardAdminState` (never `networkidle` alone) before the
  first assertion.
- **Port:** `lsof` port 3000 first — a sibling worktree's dev server makes
  `reuseExistingServer` attach to the WRONG code. Use a scratch alt-port config if occupied.

**Commit:** `test(admin): pin share-hub z-order, row dimensions, and caret geometry`

---

## Task 6 — Full-suite sweep, registries, impeccable dual-gate

**Spec:** §7.5, invariant 8

1. `pnpm test` (full — a scoped run misses `tests/styles` and `tests/help`).
2. `pnpm typecheck` (vitest strips types; separate gate).
3. `pnpm lint` — the canonical-Tailwind rule must accept `size-2.5` and `right-[17px]`.
   If it rejects an arbitrary value, resolve it in DESIGN.md terms rather than suppressing.
4. `pnpm format:check`.
5. Re-run `tests/styles/_metaDestructiveConfirm.test.ts` and confirm no registry row or
   occurrence index shifted (the confirm-button literals are untouched).
6. Confirm no help-screenshot baseline captures the open share popover. If one does, the
   baseline must be regenerated from the pinned x64 Docker image with
   `--platform linux/amd64`, NEVER from this arm64 host. Record either way in the handoff.
   Also: if any verification step ran `pnpm screenshot:help`, restore committed WebPs via
   `git restore public/help/screenshots/`.
7. **Invariant 8 — impeccable dual-gate.** `/impeccable critique` AND `/impeccable audit`
   on the diff, with the canonical v3 setup gates (`context.mjs` load of PRODUCT.md +
   DESIGN.md → register reference read). P0/P1 findings fixed or explicitly deferred via a
   `DEFERRED.md` entry. Findings + dispositions recorded in the handoff.

**Commit:** `chore(admin): close out share-hub fidelity fixes (suite, registries, impeccable)`

---

## Fix-round regression budget

When a review round patches surface S for class C: (a) re-grep class C across S after the
patch, (b) confirm the relevant meta-test still passes, (c) note both in the round closure.

## Round-1 spec-review record (carried forward so it is not re-derived)

- **Confirmed and repaired:** the stacking analysis (a `z-auto` wrapper establishes no
  stacking context — the fix shrank to one line in one file); the accessible-name proposal
  (withdrawn; `aria-label` + `aria-describedby` retained); reset's dropped ring-offset pair;
  the `w-full` width chain through the component wrappers; the caret's outer/inner split
  (withdrawn for a sibling placement); row padding under wrap; the self-contradicting
  transition row; the guard table's degraded-branch condition and missing entrance frame;
  an incomplete numeric sweep; the mailto-rows-under-`Careful` DOM error.
- **Refuted with evidence:** `step3ReviewSections.tsx` is NOT a `PickerResetControl`
  consumer (BLOCKING finding #6). `grep -rn --include='*.tsx' '<PickerResetControl' app components`
  returns one hit, `components/admin/showpage/ShareHub.tsx:363`. The reviewer read a stale
  doc comment; that comment is corrected in Task 3 so it cannot mislead again.
