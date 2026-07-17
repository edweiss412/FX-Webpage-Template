# Warning-control site scoping (a11y) + non-blocking copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each mounted use-raw / recognize-role control a caller-declared `site` so its `data-testid`s are unique per render site, kind/token-qualify the two controls' accessible names, and requalify the wizard "informational / don't block publishing" copy line above the now-consequential controls.

**Architecture:** Add an optional `WarningControlSite` union threaded `mount → boundary → shared control`. Absent = today's output for testids (byte-identical); present = a `-${site}` suffix on every leaf testid via one `tid()` helper per control. Accessible-name qualification (use-raw radiogroup by `resolution.parsed.kind`; recognize-role trigger by `roleToken`) is independent of `site` and always applies. Copy is a one-line string + JSDoc edit; the two resolved deferrals + prior-spec quotes are synced in a docs-only task.

**Tech Stack:** Next.js 16 (React client components, `"use client"`), TypeScript (`exactOptionalPropertyTypes`), Vitest + Testing Library (jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-17-use-raw-control-site-a11y-copy.md` (adversarial-approved, 3 rounds).

## Global Constraints

- **UI surface (invariant 8):** touches `components/**` → Opus-only; `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`-deferred (Task 7).
- **No raw error codes in UI (invariant 5):** unchanged — every added string is static English; no `code` renders.
- **`exactOptionalPropertyTypes`:** `site?:` is present-or-ABSENT, never `undefined`. Forward with a spread guard or a value that is genuinely `WarningControlSite | undefined` at a param typed `site?: WarningControlSite` (a passed `undefined` is allowed for a `?:` FUNCTION parameter; only object-literal properties must be omitted). Boundaries forward `site={props.site}` (param position — fine).
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`), `--no-verify` (shared hooks live in the main checkout).
- **WCAG 2.5.3 label-in-name:** any `aria-label` on an element with visible text contains that visible text as a substring.
- **Meta-test inventory:** none created or extended (no Supabase boundary, admin-alert code, advisory lock, sentinel-hiding, or email-normalization surface). Declared: none applies.
- **N/A tasks (declared):** no layout-dimensions task (no fixed-dimension parent / flex-grid dimension relationship changes); no transition-audit task (no new visual state or animation — the control state machines are untouched).

---

### Task 1: `WarningControlSite` type + `UseRawControl` site-scoping & kind-aria

**Files:**
- Create: `components/admin/warningControlSite.ts`
- Modify: `components/admin/UseRawControl.tsx` (props type ~`:349-359`; guard-state `<p>`s `:392`,`:403`; active root `:445`; radiogroup `:447-448`; leaf testids `:456,462,486,491,514,520,534,541`)
- Test: `tests/components/UseRawControl.test.tsx`

**Interfaces:**
- Produces: `export type WarningControlSite = "callout" | "list" | "showpage"` (from the new module). `UseRawControl` gains prop `site?: WarningControlSite`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests** — append to `tests/components/UseRawControl.test.tsx`.

Add fixtures for the two other kinds + a test-LOCAL expected-label map (NOT imported from source — anti-tautology) and a sweep helper:

```tsx
// hotels + dates resolvable fixtures (mirror roomsResolution shape)
const hotelsResolution: Extract<UseRawResolution, { resolvable: true }> = {
  resolvable: true,
  contentHash: "content-hash-hotels-1",
  parsed: { kind: "hotels", names: ["Ada Lovelace", "Alan Turing"], confirmationNo: "CN-9" },
  replacement: { kind: "hotels", names: ["Ada Lovelace Alan Turing CN-9"], confirmationNo: null },
};
const datesResolution: Extract<UseRawResolution, { resolvable: true }> = {
  resolvable: true,
  contentHash: "content-hash-dates-1",
  parsed: { kind: "dates", dates: { travelIn: "2026-05-01", set: null, showDays: ["2026-05-02"], travelOut: null } },
  replacement: { kind: "dates", dmyDates: { travelIn: "2026-01-05", set: null, showDays: ["2026-02-05"], travelOut: null } },
};

// Expected radiogroup label per kind — defined HERE so a source regression is caught.
const EXPECTED_RADIOGROUP_LABEL: Record<"rooms" | "hotels" | "dates", string> = {
  rooms: "Which reading crew pages use for the room split",
  hotels: "Which reading crew pages use for the hotel guest split",
  dates: "Which reading crew pages use for the show dates",
};

function assertAllTestidsSuffixed(root: ParentNode, suffix: string) {
  const nodes = Array.from(root.querySelectorAll("[data-testid]"));
  expect(nodes.length).toBeGreaterThan(0);
  for (const n of nodes) expect(n.getAttribute("data-testid")!.endsWith(`-${suffix}`)).toBe(true);
}
function assertNoTestidSuffixed(root: ParentNode, suffix: string) {
  for (const n of Array.from(root.querySelectorAll("[data-testid]")))
    expect(n.getAttribute("data-testid")!.endsWith(`-${suffix}`)).toBe(false);
}

describe("UseRawControl — site scoping (spec 2026-07-17 §6.1)", () => {
  const noop = () => {};
  it("site present: EVERY leaf testid is suffixed across the leaf-bearing states", () => {
    // (a) transform-active → control + both toggles + parsed + raw
    const a = render(<UseRawControl warning={warning()} decision={undefined} site="list" onToggle={noop} />);
    assertAllTestidsSuffixed(a.container, "list");
    expect(a.queryByTestId("use-raw-control")).toBeNull();
    expect(a.queryByTestId("use-raw-toggle-off")).toBeNull();
    cleanup();
    // (b) apply-pending → adds use-raw-pending-note
    const b = render(
      <UseRawControl warning={warning()} decision={decision({ preference: "raw", applied: false })} site="list" onToggle={noop} />,
    );
    assertAllTestidsSuffixed(b.container, "list");
    expect(b.getByTestId("use-raw-pending-note-list")).toBeTruthy();
    cleanup();
    // (c) post-failed-toggle → adds use-raw-error + use-raw-retry
    const c = render(
      <UseRawControl warning={warning()} decision={undefined} site="list" onToggle={() => { throw new Error("x"); }} />,
    );
    fireEvent.click(c.getByTestId("use-raw-toggle-on-list"));
    return waitFor(() => {
      expect(c.getByTestId("use-raw-error-list")).toBeTruthy();
      expect(c.getByTestId("use-raw-retry-list")).toBeTruthy();
      assertAllTestidsSuffixed(c.container, "list");
    });
  });

  it("site absent: NO testid is suffixed (bare, byte-identical)", () => {
    const q = render(<UseRawControl warning={warning()} decision={undefined} onToggle={noop} />);
    assertNoTestidSuffixed(q.container, "list");
    expect(q.getByTestId("use-raw-control")).toBeTruthy();
    expect(q.getByTestId("use-raw-toggle-off")).toBeTruthy();
  });

  it("guard-state <p> also carries the suffix (legacy-unavailable)", () => {
    const q = render(<UseRawControl warning={legacyWarning()} decision={undefined} site="callout" onToggle={noop} />);
    expect(q.getByTestId("use-raw-control-callout")).toBeTruthy();
  });
});

describe("UseRawControl — radiogroup accessible name is kind-qualified (spec §6.2)", () => {
  const noop = () => {};
  it.each([
    ["rooms", roomsResolution],
    ["hotels", hotelsResolution],
    ["dates", datesResolution],
  ] as const)("%s → kind-specific aria-label", (kind, resolution) => {
    const code =
      kind === "rooms" ? "ROOM_HEADER_SPLIT_AMBIGUOUS"
      : kind === "hotels" ? "HOTEL_GUEST_SPLIT_AMBIGUOUS" : "DATE_ORDER_SUGGESTS_DMY";
    const q = render(<UseRawControl warning={{ code, resolution }} decision={undefined} onToggle={noop} />);
    const group = q.container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute("aria-label")).toBe(EXPECTED_RADIOGROUP_LABEL[kind]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/UseRawControl.test.tsx`
Expected: FAIL — new module import unresolved / testids not suffixed / aria-label is the old generic string.

- [ ] **Step 3: Create the type module**

`components/admin/warningControlSite.ts`:
```ts
/**
 * The render SITE a warning control is mounted at (spec 2026-07-17
 * §4). Orthogonal to `surface` (which picks the server action): one
 * surface (wizard) hosts two sites (`callout` preview + full `list`).
 * Threaded mount → boundary → shared control to disambiguate the leaf
 * testids of a warning that renders at more than one site.
 */
export type WarningControlSite = "callout" | "list" | "showpage";
```

- [ ] **Step 4: Thread `site` + `tid()` + kind-aria through `UseRawControl`**

In `components/admin/UseRawControl.tsx`:

Add the import:
```ts
import type { WarningControlSite } from "@/components/admin/warningControlSite";
```
Add the prop (in the destructured props object + its type):
```ts
export function UseRawControl({
  warning,
  decision,
  onToggle,
  site,
}: {
  warning: Pick<ParseWarning, "code" | "resolution">;
  decision: UseRawDecision | undefined;
  onToggle: (useRaw: boolean) => Promise<void> | void;
  /** spec 2026-07-17 §4: the render site; absent → bare testids. */
  site?: WarningControlSite;
}) {
```
Immediately after the `useState`/`useRef` block (before `const state = ...`), add the helper:
```ts
  const tid = (base: string) => (site ? `${base}-${site}` : base);
```
Replace every `data-testid="..."` string literal in this component with `data-testid={tid("...")}`, and every `buttonTestId="use-raw-toggle-off"` / `="use-raw-toggle-on"` with `buttonTestId={tid("use-raw-toggle-off")}` / `{tid("use-raw-toggle-on")}`. Affected: `use-raw-control` (×3: `:392`,`:403`,`:445`), `use-raw-parsed` (`:462`), `use-raw-raw` (`:491`), `use-raw-pending-note` (`:514`,`:520`), `use-raw-error` (`:534`), `use-raw-retry` (`:541`), and the two `buttonTestId` props (`:456`,`:486`).

After the resolvable narrowing (`const resolution = warning.resolution as Extract<...>;`, ~`:410`), add:
```ts
  const radiogroupLabel =
    resolution.parsed.kind === "rooms"
      ? "Which reading crew pages use for the room split"
      : resolution.parsed.kind === "hotels"
        ? "Which reading crew pages use for the hotel guest split"
        : "Which reading crew pages use for the show dates";
```
Replace the radiogroup's `aria-label="Which reading crew pages use"` (`:448`) with `aria-label={radiogroupLabel}`.

- [ ] **Step 5: Run — verify PASS**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/UseRawControl.test.tsx`
Expected: PASS (all prior + new tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y
git add components/admin/warningControlSite.ts components/admin/UseRawControl.tsx tests/components/UseRawControl.test.tsx
git commit --no-verify -m "feat(admin): site-scope UseRawControl testids + kind-qualify radiogroup aria (USE-RAW-FULL-LIST-2)"
```

---

### Task 2: `RoleRecognizeControl` site-scoping & token-aria

**Files:**
- Modify: `components/admin/RoleRecognizeControl.tsx` (props `:84-95`; all `role-recognize-*` testids `:170,173,190,202,221,237,239,251,253,272,289,309,318,329,339`; collapsed trigger `:171-181`)
- Modify: `components/admin/roleRecognizeCopy.ts` (add `triggerAriaLabel`)
- Test: `tests/components/RoleRecognizeControl.test.tsx`

**Interfaces:**
- Consumes: `WarningControlSite` (Task 1).
- Produces: `RoleRecognizeControl` gains `site?: WarningControlSite`; `roleRecognizeCopy` gains `export const triggerAriaLabel: (token: string) => string`.

- [ ] **Step 1: Write the failing tests** — append to `tests/components/RoleRecognizeControl.test.tsx`.

```tsx
import { WarningControlSite } from "@/components/admin/warningControlSite"; // type-only use in casts if needed

function allTestidsSuffixed(root: ParentNode, suffix: string) {
  const nodes = Array.from(root.querySelectorAll("[data-testid]"));
  expect(nodes.length).toBeGreaterThan(0);
  for (const n of nodes) expect(n.getAttribute("data-testid")!.endsWith(`-${suffix}`)).toBe(true);
}

describe("RoleRecognizeControl — site scoping (spec 2026-07-17 §7.1)", () => {
  const onSave = vi.fn().mockResolvedValue({ kind: "saved", state: "applied", grants: ["A1"] });
  it("site present: every leaf testid suffixed across phases", async () => {
    const q = render(<RoleRecognizeControl roleToken="SLED DRIVER" site="showpage" onSave={onSave} />);
    allTestidsSuffixed(q.container, "showpage");                 // collapsed
    fireEvent.click(q.getByTestId("role-recognize-trigger-showpage"));
    allTestidsSuffixed(q.container, "showpage");                 // panel/idle
    fireEvent.click(q.getByTestId("role-recognize-check-A1-showpage"));
    fireEvent.click(q.getByTestId("role-recognize-save-showpage"));
    await waitFor(() => expect(q.getByTestId("role-recognize-saved-showpage")).toBeTruthy());
    allTestidsSuffixed(q.container, "showpage");                 // saved
  });
  it("site absent: bare testids (byte-identical)", () => {
    const q = render(<RoleRecognizeControl roleToken="SLED DRIVER" onSave={onSave} />);
    expect(q.getByTestId("role-recognize-control")).toBeTruthy();
    expect(q.getByTestId("role-recognize-trigger")).toBeTruthy();
  });
});

describe("RoleRecognizeControl — trigger accessible name (spec §7.2, WCAG 2.5.3)", () => {
  it("aria-label contains the token AND the rendered visible label", () => {
    const onSave = vi.fn();
    const q = render(<RoleRecognizeControl roleToken="SLED DRIVER" onSave={onSave} />);
    const trigger = q.getByTestId("role-recognize-trigger");
    // Rendered visible text with the aria-hidden chevron removed — derived from the
    // DOM (NOT COPY.TRIGGER_LABEL) so a future visible-text change without an
    // aria-label change is caught (label-in-name).
    const clone = trigger.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[aria-hidden='true']").forEach((el) => el.remove());
    const visible = clone.textContent!.trim();
    const aria = trigger.getAttribute("aria-label")!;
    expect(visible.length).toBeGreaterThan(0);
    expect(aria).toContain(visible);
    expect(aria).toContain("SLED DRIVER");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/RoleRecognizeControl.test.tsx`
Expected: FAIL — suffixed testids not found / trigger has no `aria-label`.

- [ ] **Step 3: Add the copy helper**

In `components/admin/roleRecognizeCopy.ts`, after `TRIGGER_LABEL`:
```ts
/** Trigger accessible name: qualifies the visible label with the role token
 *  (spec 2026-07-17 §7.2). Contains TRIGGER_LABEL verbatim (WCAG 2.5.3). */
export const triggerAriaLabel = (token: string) => `${TRIGGER_LABEL}: “${token}”`;
```

- [ ] **Step 4: Thread `site` + `tid()` + trigger aria through `RoleRecognizeControl`**

In `components/admin/RoleRecognizeControl.tsx`:

Add import:
```ts
import type { WarningControlSite } from "@/components/admin/warningControlSite";
```
Add the prop:
```ts
export function RoleRecognizeControl({
  roleToken,
  onSave,
  site,
}: {
  roleToken: string | undefined;
  onSave: (grants: GrantableFlag[], mode: RoleRecognizeSaveMode) => Promise<RoleRecognizeSaveOutcome>;
  /** spec 2026-07-17 §4: render site; absent → bare testids. */
  site?: WarningControlSite;
}) {
```
After `const token = (roleToken ?? "").trim();` and its early return (`:117-118`), add:
```ts
  const tid = (base: string) => (site ? `${base}-${site}` : base);
```
Replace every `data-testid="..."` literal with `data-testid={tid("...")}` — including the templated one `data-testid={`role-recognize-check-${flag}`}` → `data-testid={tid(`role-recognize-check-${flag}`)}` (`:272`) and the FINANCIALS one (`:289`), and the stale/conflict ternary (`:239`).

In the collapsed trigger button (`:171-181`), add an `aria-label`:
```tsx
        <button
          type="button"
          data-testid={tid("role-recognize-trigger")}
          aria-label={COPY.triggerAriaLabel(token)}
          onClick={expand}
          className={outlineBtn}
        >
```

- [ ] **Step 5: Run — verify PASS**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/RoleRecognizeControl.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y
git add components/admin/RoleRecognizeControl.tsx components/admin/roleRecognizeCopy.ts tests/components/RoleRecognizeControl.test.tsx
git commit --no-verify -m "feat(admin): site-scope RoleRecognizeControl testids + token-qualify trigger aria (USE-RAW-FULL-LIST-2)"
```

---

### Task 3: Thread `site` through both boundaries + wire wizard mounts + migrate wizard test

**Files:**
- Modify: `components/admin/UseRawControlBoundary.tsx` (props `:42-49`; render `:81`)
- Modify: `components/admin/RoleRecognizeControlBoundary.tsx` (props `:41-46`; render `:75`)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (callout mounts `:611`,`:623`; list mounts `:2429`,`:2438`)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`

**Interfaces:**
- Consumes: `WarningControlSite`; the two controls' `site` prop (Tasks 1–2).
- Produces: both boundaries gain `site?: WarningControlSite` (forwarded to the control). Wizard callout mounts pass `site="callout"`; list mounts pass `site="list"`.

- [ ] **Step 1: Migrate the wizard test + add the failing cross-site test.**

In `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`:

(a) In every test that renders via the LIST harness (`renderBreakdown` / `q` — describes at lines ~147, ~230, ~324, ~343, ~355), suffix the queried leaf testids with `-list`. Example edits:
```tsx
// :160-161
const hasUseRaw = within(row).queryAllByTestId("use-raw-control-list").length;
const hasRole = within(row).queryAllByTestId("role-recognize-control-list").length;
// :187-188
expect(q.queryAllByTestId("use-raw-control-list")).toHaveLength(0);
expect(q.queryAllByTestId("role-recognize-control-list")).toHaveLength(0);
// :198,:201,:230,:233 use-raw-control → use-raw-control-list
// :243-244,:332-334,:337-338,:347,:349,:352,:361-362 role-recognize-* → *-list
```
(b) In the CALLOUT describe (`:264-322`), suffix the callout-scoped queries with `-callout`:
```tsx
// :301-302,:315
fireEvent.click(within(callout).getAllByTestId("role-recognize-trigger-callout")[0]!);
expect(within(callout).getAllByTestId("role-recognize-panel-callout")).toHaveLength(1);
const panels = within(calloutAfter).getAllByTestId("role-recognize-panel-callout");
```
(The `wizard-step3-card-${DFID}-warning-${i}` row testids and `-section-crew-flag-callout` are emitted by `step3ReviewSections.tsx` itself, NOT the controls — leave them unchanged.)

(c) Add a new cross-site distinctness test (the concrete failure the finding names):
```tsx
describe("cross-site testid distinctness (spec 2026-07-17 §10.3)", () => {
  test("one warning rendered at callout + list yields distinct, non-colliding control testids", () => {
    const w = roomsUseRawWarning(); // an in-scope ROOM_HEADER_SPLIT_AMBIGUOUS fixture used elsewhere in this file
    // list host
    const list = renderBreakdown([w], { decisions: [] });
    const row = list.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    expect(within(row).getByTestId("use-raw-control-list")).toBeTruthy();
    expect(within(row).queryByTestId("use-raw-control-callout")).toBeNull();
    cleanup();
    // callout host
    const callout = render(calloutHost([{ warning: w, index: 0 }]));
    const box = callout.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    expect(within(box).getByTestId("use-raw-control-callout")).toBeTruthy();
    expect(within(box).queryByTestId("use-raw-control-list")).toBeNull();
  });
});
```
(If a `roomsUseRawWarning` fixture does not already exist in the file, add one mirroring the existing `roleWarning` helper but with `code: "ROOM_HEADER_SPLIT_AMBIGUOUS"` and a resolvable `resolution`; `chromeValue` already passes `useRawDecisions: []`.)

- [ ] **Step 2: Run — verify FAIL**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx`
Expected: FAIL — the suffixed testids don't exist yet (mounts still pass no `site`).

- [ ] **Step 3: Add `site` to both boundaries**

`components/admin/UseRawControlBoundary.tsx` — import the type, add the prop, forward it:
```ts
import type { WarningControlSite } from "@/components/admin/warningControlSite";
// props object:
    warning: ParseWarning;
    decision: UseRawDecision | undefined;
    /** spec 2026-07-17 §8: render site, forwarded to the control. */
    site?: WarningControlSite;
// render:
  return <UseRawControl warning={warning} decision={decision} onToggle={onToggle} site={props.site} />;
```
`components/admin/RoleRecognizeControlBoundary.tsx` — same:
```ts
import type { WarningControlSite } from "@/components/admin/warningControlSite";
    warning: ParseWarning;
    /** spec 2026-07-17 §8: render site, forwarded to the control. */
    site?: WarningControlSite;
  return <RoleRecognizeControl roleToken={token} onSave={onSave} site={props.site} />;
```

- [ ] **Step 4: Pass `site` at the wizard mounts**

`components/admin/wizard/step3ReviewSections.tsx`:
- Callout (`SectionFlagCallout`, the two boundaries at `:611` and `:623`): add `site="callout"`.
- List (`WarningsBreakdown`, the two boundaries at `:2429` and `:2438`): add `site="list"`.

Example (callout use-raw, `:611`):
```tsx
              <UseRawControlBoundary
                surface="wizard"
                wizardSessionId={wizardSessionId}
                driveFileId={dfid}
                warning={warning}
                decision={decisionFor(warning)}
                site="callout"
              />
```
(Repeat: `site="callout"` on the `:623` recognize-role boundary; `site="list"` on both `:2429`/`:2438` boundaries.)

- [ ] **Step 5: Run — verify PASS**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y
git add components/admin/UseRawControlBoundary.tsx components/admin/RoleRecognizeControlBoundary.tsx components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "feat(admin): thread site through control boundaries + wizard callout/list mounts (USE-RAW-FULL-LIST-2)"
```

---

### Task 4: Wire live per-show mount (`showpage`) + migrate its test

**Files:**
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (`:57` use-raw, `:64` recognize-role)
- Test: `tests/components/admin/showpage/sectionWarningControls.test.tsx` (`:272-273,:276-277`)

**Interfaces:**
- Consumes: the boundaries' `site` prop (Task 3).

- [ ] **Step 1: Migrate the test** — suffix the section-scoped control queries with `-showpage`:
```tsx
// :272-273
expect(crew.getAllByTestId("role-recognize-control-showpage").length).toBeGreaterThan(0);
expect(rooms.queryByTestId("role-recognize-control-showpage")).toBeNull();
// :276-277
expect(rooms.getAllByTestId("use-raw-control-showpage").length).toBeGreaterThan(0);
expect(crew.queryByTestId("use-raw-control-showpage")).toBeNull();
```
(Leave `dq-controls`, `per-show-actionable-item`, `section-*` testids — those are emitted by the page, not the controls.)

- [ ] **Step 2: Run — verify FAIL**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/admin/showpage/sectionWarningControls.test.tsx`
Expected: FAIL — `*-showpage` testids absent (mount passes no `site`).

- [ ] **Step 3: Pass `site="showpage"` at the live mounts**

`components/admin/showpage/sectionWarningExtras.tsx`:
```tsx
      <UseRawControlBoundary
        surface="show"
        showId={showId}
        warning={warning}
        decision={findUseRawDecision(warning, useRawDecisions)}
        site="showpage"
      />
      {/* … */}
      <RoleRecognizeControlBoundary surface="show" showId={showId} warning={warning} site="showpage" />
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/admin/showpage/sectionWarningControls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y
git add components/admin/showpage/sectionWarningExtras.tsx tests/components/admin/showpage/sectionWarningControls.test.tsx
git commit --no-verify -m "feat(admin): site-scope live per-show warning controls (showpage) (USE-RAW-FULL-LIST-2)"
```

---

### Task 5: Requalify the non-blocking copy line

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (copy `:2344`; JSDoc `:2296-2300`)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (new copy assertion)

- [ ] **Step 1: Write the failing test** — append to `warningsBreakdownControls.test.tsx`:
```tsx
describe("non-blocking copy requalification (spec 2026-07-17 §9)", () => {
  test("headline drops 'informational', keeps 'don't block publishing', names the optional fix", () => {
    const q = renderBreakdown([roleWarning("SLED DRIVER")], { decisions: [] });
    const line = q.getByTestId(`wizard-step3-card-${DFID}-warnings-nonblocking`);
    expect(line.textContent!).toMatch(/don.t block publishing/i);
    expect(line.textContent!).not.toMatch(/informational/i);
    expect(line.textContent!).toMatch(/optional fix/i);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx -t "non-blocking copy"`
Expected: FAIL — old line still contains "informational" and no "optional fix".

- [ ] **Step 3: Edit the copy + JSDoc**

`step3ReviewSections.tsx:2344` — replace:
```tsx
            These are informational and don&rsquo;t block publishing.
```
with:
```tsx
            These warnings don&rsquo;t block publishing. Some include an optional fix you can
            apply below.
```
JSDoc `:2296-2300` — update the sentence "One explicit line states that warnings are informational and do NOT block publishing…" to "One explicit line states that warnings do NOT block publishing and that some rows carry an optional fix, so the count badge stops reading as an error."

- [ ] **Step 4: Run — verify PASS (this test + the two pre-existing copy regex tests still green)**

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/step3SheetCard.test.tsx`
Expected: PASS — including `step3ReviewSections.test.tsx:680,704` and `step3SheetCard.test.tsx:645` (`/don.t block publishing/i` still matches).

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "fix(admin): requalify wizard non-blocking warnings copy above consequential controls (USE-RAW-FULL-LIST-3)"
```

---

### Task 6: Ledger + spec-reference sync (docs-only)

**Files:**
- Modify: `DEFERRED.md` (USE-RAW-FULL-LIST-2 `~:608`, USE-RAW-FULL-LIST-3 `~:614`)
- Modify: `BACKLOG.md` (`BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y` `~:77`, `BL-WIZARD-WARNINGS-COPY-QUALIFIER` `~:83`)
- Modify: `docs/superpowers/specs/2026-07-07-flow3-correction-loop-clarity.md:46`
- Modify: `docs/superpowers/specs/step3-onboarding/2026-07-02-step3-review-modal-redesign.md:94,422`

- [ ] **Step 1: Re-grep the live line numbers** (append-only files drift):

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && grep -n "USE-RAW-FULL-LIST-2\|USE-RAW-FULL-LIST-3" DEFERRED.md && grep -n "BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y\|BL-WIZARD-WARNINGS-COPY-QUALIFIER" BACKLOG.md`

- [ ] **Step 2: Resolve DEFERRED entries** — append to each a resolution line (mirrors the file's existing `**Resolution (date):**` convention):
  - USE-RAW-FULL-LIST-2: `**Resolution (2026-07-17):** RESOLVED — optional `WarningControlSite` ("callout"|"list"|"showpage") threaded mount→boundary→control site-scopes every leaf testid; use-raw radiogroup kind-qualified + recognize-role trigger token-qualified accessible names. Spec `docs/superpowers/specs/2026-07-17-use-raw-control-site-a11y-copy.md`; branch `fix/use-raw-control-site-a11y-copy`.`
  - USE-RAW-FULL-LIST-3: `**Resolution (2026-07-17):** RESOLVED — line requalified to "These warnings don't block publishing. Some include an optional fix you can apply below." (drops "informational"; non-blocking contract unchanged). Same spec/branch.`

- [ ] **Step 3: Mark BACKLOG entries RESOLVED** and correct the a11y prose:
  - `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`: prepend `**Status:** ✅ RESOLVED — `fix/use-raw-control-site-a11y-copy` (2026-07-17).` and correct the fix description from "warning-title-qualified aria-labels" to "site-scoped leaf testids (ALL leaves, not just the container) + **kind/token-qualified** accessible names (use-raw radiogroup by parsed.kind; recognize-role trigger by roleToken)". Note in-repo queries were container-scoped so nothing broke.
  - `BL-WIZARD-WARNINGS-COPY-QUALIFIER`: prepend `**Status:** ✅ RESOLVED — same branch (2026-07-17).`

- [ ] **Step 4: Update the two prior-spec quotes** — append to each quoted "…don't block publishing." reference: ` (requalified 2026-07-17 → "…optional fix you can apply below."; non-blocking contract unchanged)`.

- [ ] **Step 5: Sanity check** the docs render / no stray edits:

Run: `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && git diff --stat DEFERRED.md BACKLOG.md docs/`

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y
git add DEFERRED.md BACKLOG.md docs/superpowers/specs/2026-07-07-flow3-correction-loop-clarity.md docs/superpowers/specs/step3-onboarding/2026-07-02-step3-review-modal-redesign.md
git commit --no-verify -m "docs(plan): resolve USE-RAW-FULL-LIST-2/3 ledgers + sync prior-spec copy quotes"
```

---

### Task 7: Impeccable dual-gate (invariant 8)

**Files:** none (evaluation). Findings → fix in-diff or `DEFERRED.md`.

- [ ] **Step 1** — run `/impeccable critique` on the diff (`git diff origin/main` scope), with the v3 setup gates (context.mjs load → register read). Focus surfaces: `UseRawControl.tsx`, `RoleRecognizeControl.tsx`, the requalified copy in `step3ReviewSections.tsx`.
- [ ] **Step 2** — run `/impeccable audit` on the same diff.
- [ ] **Step 3** — triage: fix P0/P1 in-diff; record any deferral in `DEFERRED.md` with rationale. Record findings + dispositions for the close-out report.
- [ ] **Step 4** — if fixes were made, re-run the affected vitest files + commit `fix(admin): impeccable dual-gate dispositions`.

Note: this is a testid/aria/copy diff (no new visual element, layout, or token) — critique/audit are expected to be light, but the gate is mandatory because `components/**` changed.

---

### Task 8: Full verification

- [ ] **Step 1: Typecheck** — `cd /Users/ericweiss/fxav-worktrees/use-raw-site-a11y && pnpm typecheck` → clean (vitest strips types; this catches `exactOptionalPropertyTypes` / prop-type mistakes).
- [ ] **Step 2: Lint** — `pnpm lint` → clean (canonical Tailwind, etc.).
- [ ] **Step 3: Format** — `pnpm format:check` → clean (`--no-verify` bypassed prettier).
- [ ] **Step 4: Full suite** — `pnpm test` → green (scoped gates miss cross-file regressions; run the whole suite before push).
- [ ] **Step 5:** If any step fails, fix + amend the owning task's commit (or a `fix:` commit), re-run.

---

## Self-Review

- **Spec coverage:** §4 type → Task 1; §6 UseRawControl → Task 1; §7 RoleRecognizeControl → Task 2; §8 boundaries → Task 3; §5 site assignments → Tasks 3–4; §9 copy → Task 5; §9.1 ledgers + spec quotes → Task 6; §10 tests → folded into Tasks 1–5; §11 invariant 8 → Task 7; verification → Task 8. No gap.
- **Green-per-commit:** `site` optional (absent = bare) means Tasks 1–2 don't break the integration tests (mounts still bare); Task 3 flips wizard mounts + migrates the wizard test in the same commit; Task 4 flips the live mount + its test together. Every commit's affected suite is green.
- **Type consistency:** `WarningControlSite` (one module), `site?:` prop name, `tid(base)` helper name, `triggerAriaLabel(token)` — used identically across tasks.
- **Anti-tautology:** exhaustive `[data-testid]` sweep (root-only impl fails), kind-aria expected map defined in-test, label-in-name read from rendered DOM (not the source constant), cross-site distinctness across two host renders, copy assertion scoped to the `-nonblocking` node.
- **Placeholder scan:** none — every code/test step carries real content.
