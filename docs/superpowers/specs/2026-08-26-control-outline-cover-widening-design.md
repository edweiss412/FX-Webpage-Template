# Widening the control-outline cover until it sees both families

**Closes** `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` (`BACKLOG.md:99`, filed 2026-08-16 by
`fix/control-outline-surface-fills`, `**Reachability:** PROBED`).

**Branch** `fix/control-outline-cover`. **Base** `b30413cf5`.

---

## 1. The two rulings this implements

Both design questions the row named as its `**Class-sweep exception:** (a)` were ruled by Eric on
2026-08-26 at 04:53, against a rendered mockup carrying the measured ratios. That is the same bar as
the 2026-08-16 and 2026-08-18 rulings, so it is an amendment under invariant 7 and not an argument to
be re-opened.

- **(a) A text field's border IS a control outline** under `DESIGN.md` §1.2a and must reach the 3:1
  non-text floor. Family A's fields measure **1.59:1 light / 1.60:1 dark** today
  (`--color-border-strong` on `--color-surface`), the identical before-figure `DESIGN.md:359` records
  for the secondary-action treatment the 2026-08-16 swap moved.
- **(b) An open-state child outline IS a resting boundary**, not a state cue, and must reach 3:1. The
  menu-trigger open state measures **1.43:1 light / 1.75:1 dark** (`--color-border-strong` on
  `--color-surface-sunken`).

**The switch tracks are untouched by both.** `DESIGN.md:250-261` ruled them OUT on 2026-08-16 and
records that same 1.43:1 / 1.75:1 pair as the documented limit of that decision. They are out for the
ON/OFF *relationship*, never for the ratio: lifting only the OFF ring would make OFF read heavier
while the deliberately-tuned ON boundary stood still. Ruling (b) reaches the open state of **menu
triggers** and does not reach a toggle. §7.1 records what the widened cover does to them instead.

## 1.1 Resolved scope — do not relitigate

- **Both rulings.** Taken 2026-08-26 04:53 against a rendered mockup carrying the measured ratios,
  the same bar as 2026-08-16 and 2026-08-18. Arguing that a text field's border is a field affordance,
  or that an open-state child outline is a state cue, is relitigating a rendered ruling.
- **The switch tracks stay OUT.** `DESIGN.md:250-261`. Family B's open state carries the same token
  pair and the same number; the tracks are excluded for the ON/OFF relationship, not for the ratio.
  `AutoRefreshControl.tsx:105` becoming visible is a registration duty, not a reopening.
- **The 2026-08-18 `border-border` ruling.** `DESIGN.md:295-302`. The closed arms are that ruling
  reaching a site the cover could not see.
- **No structural predicate for trackness, and none for chrome-ness.** Five mechanisms tried to
  recover structure from the scanner's projection and each escaped
  (`tests/styles/controlOutlineScan.ts:16-20`, `tests/styles/controlOutlineResidue.ts:9-13`). §8's bar
  is form plus one structural fact the scanner already knows, deliberately.
- **`subtleInteractiveScan` stays unenrolled** (`tests/mutation/source/registry.ts:2657-2671`) and reads the default.
- **The specLint fixtures** under `tests/specLint/fixtures/claimSweep/` are frozen copies.
- **The row's line citations** are superseded by §3.
- **No new ledger row of any facing** (Eric's directive, 2026-08-25). Every peer defect is repaired
  here, demoted to the owning surface's documented limits, or raised to bl-orch.

## 2. The constraint that shapes everything below

The row refuses to repair its own sites by hand, and says why in its own words:

> Including it would make the swap set "the 21 the cover found, plus one the cover did not, chosen by
> hand" a hand-extended list is exactly the enumerated cover the arc refused everywhere else.

So the order is fixed:

1. widen the cover so it SEES both families;
2. run the consuming guards and let them go red;
3. move exactly the sites the red names.

**A site repaired without appearing in the red transcript of §6 is a P0 in this arc regardless of
test status.** That count is an acceptance criterion (AC-9) and it is zero.

The row's own list held eight sites. §6 measures **twenty-seven**, plus one more that only the
tinted-plate guard names. Eight was what the row could see, not the population.

## 3. Line anchors, reconciled once

The row anchors several sites on the `className=` line. `scanInteractiveElements` anchors every
element on its **opening tag** (`tests/styles/interactiveScanCore.ts:918`), and that anchor is what
both censuses and the mutation registry key on. Re-derived against `b30413cf5`; this table supersedes
the row's citations and is cited in preference to them from here on.

| Row cites | Live element line | What is there |
| --- | --- | --- |
| `components/admin/wizard/VenueMapTile.tsx:123` | **`components/admin/wizard/VenueMapTile.tsx:121`** | `<span data-testid="venue-directions">`; paint on line 123 |
| `components/admin/OnboardingWizard.tsx:240` | **`components/admin/OnboardingWizard.tsx:258`** | `<span data-testid={…-visual}>` inside the `<Link>` on line 251; the done-branch paint is the `pillState` arm on line 240 |
| `components/admin/ShowRowActions.tsx:650` | **`components/admin/ShowRowActions.tsx:647`** | `<span>` inside the `<button>` on line 631; open arm line 650, closed arm line 651 |
| `components/admin/wizard/CrewRowActions.tsx:273` | **`components/admin/wizard/CrewRowActions.tsx:270`** | `<span>` inside the `<button>`; open arm line 273, closed arm line 274 |
| `components/admin/BellPanel.tsx:836` | **`components/admin/BellPanel.tsx:838`** | `<input type="number">`; paint on line 844. Line 836 is the wrapping `<label>` |
| `components/admin/BellPanel.tsx:847` | **`components/admin/BellPanel.tsx:849`** | `<input type="number">`; paint on line 855. Line 847 is the wrapping `<label>` |
| `components/admin/wizard/step3ReviewSections.tsx:4200` | **`components/admin/wizard/step3ReviewSections.tsx:4195`** | `<textarea>`; paint on line 4206 |
| `components/admin/dev/SwitcherControls.tsx:119` | `components/admin/dev/SwitcherControls.tsx:119` | `<select>`; paint on line 122. Correct as cited |

Two path spellings in circulation are wrong: it is `components/admin/OnboardingWizard.tsx` (not
`components/admin/wizard/`) and `components/admin/dev/SwitcherControls.tsx` (not `components/dev/`).

## 4. D1: the widening is PER-CONSUMER, and that is a decision

`scanInteractiveElements` has six live consumers. Every one of them widens the instant `isInScope`
does, so "widen the predicate" is not a local edit; it is a population change in six censuses at once.

**Decision: `isInScope` gains a declared options argument, defaulted OFF, and only the outline guards
opt in.**

```ts
export type ScanOptions = {
  /** Admit text-entry element kinds: <textarea>, <select>, and <input> at ANY type. */
  readonly textEntry?: boolean;
  /** Admit a className-carrying JSX descendant of an in-scope element as its own element. */
  readonly paintedChildren?: boolean;
};

export function scanInteractiveElements(rootDir: string, options: ScanOptions = {}): ScanElement[]
```

**Why not one shared vocabulary.** The tap-target census would absorb 59 more elements into a
44px height floor that neither ruling mentions. `components/admin/wizard/step3ReviewSections.tsx:4195`
carries `rows={3}` and no `min-h-tap-min`; `components/shared/ReportModal.tsx:705` carries `rows={6}`
and none either. Every one of them would land in `TAP_TARGET_CENSUS` needing a reason
(`tests/styles/_metaTapTargetFloor.test.ts:59`). That is a different arc with a different ruling, and
absorbing it silently is the scope explosion the row exists to avoid.

The subtle-policy guard says the same thing about the other axis in its own docstring, and it says it
as a decision rather than as a gap (`tests/styles/subtleInteractiveScan.ts:15-23`): widening to
descendants "means every span inside every control, which is a different guard with a different
census it is a scope decision, not a bug fix". An options argument honours that decision instead of
overruling it in passing.

**Why this is not the two-copies drift the module was built to prevent.** The module's header
(`tests/styles/interactiveScanCore.ts:12-16`) argues against *two definitions* of what counts as
interactive, because they drift silently. This is one definition with one declared axis, read from one
place, and every consumer states which setting it reads. A consumer cannot disagree with another about
what an element IS; it can only declare which kinds it asks about, in its own source, where a reviewer
sees it.

## 5. D2: Family B admits the painted child as its OWN element

`ScanElement` carries no notion of a parent or a child (`tests/styles/interactiveScanCore.ts:50-65`).
Two shapes were available.

**Chosen: admit the child as its own element** when it carries a `className` and its nearest in-scope
JSX ancestor is in scope. Both censuses stay keyed the way they already key (`file` + element line for
the fill census, `file` + `tag` + projections for the residue census), and the sites the row names ARE
the child lines, so the corrected anchors in §3 are the rows.

**Rejected: attribute the child's className to the ancestor.** It collapses two paints onto one row,
and worse, it is wrong about the cascade: a parent's `bg-surface` and a child's `border-border-strong`
are two boxes, and merging their tokens into one `paths` entry makes `weakSides`
(`tests/styles/controlOutlineResidue.ts:352`) resolve a cascade between declarations that never
compete in the browser.

### 5.1 Three resolution edges, each forced by a live site

JSX ancestry alone reaches neither of the two sites that matter most, so the walk follows two more
edges. Each is bounded, each is named, and each was added because a measured site needed it and not
because it seemed prudent.

**Edge 1, a file-local JSX-valued binding.** `components/admin/wizard/VenueMapTile.tsx:121` is the site
the row names first and calls the strongest claim to have belonged in the 21. Its span lives in
`const inner = (<>…</>)` at `components/admin/wizard/VenueMapTile.tsx:42` and is rendered as `{inner}`
inside the `<a>` at `components/admin/wizard/VenueMapTile.tsx:143`, so ancestry alone does not see it.
The walk follows a JSX child expression that is a bare identifier resolving to a file-local
declaration whose initializer or body contains JSX. This is the binding resolution the module already
performs for classNames (`tests/styles/interactiveScanCore.ts:770-774`), applied to a JSX child rather
than to a class string.

**Edge 2, a component invocation, one hop.** `components/admin/telemetry/EventRow.tsx:39` is a
`role="button"` control whose ONLY child is `<CronRunSummaryCard event={event} />` at
`components/admin/telemetry/EventRow.tsx:53`, and that component's root at
`components/admin/telemetry/CronRunSummaryCard.tsx:26` paints `border border-border bg-surface-sunken`.
Under §6.2's sorting rule that IS the control's visual and must move. Without this edge it is not in
the red at all, and a limit that hides a live control-outline defect is a silent hole rather than a
documented limit. So the walk resolves a capitalised tag inside an in-scope ancestor to its
declaration, in the same file or through ONE import hop (named or default), and visits the JSX in that
declaration. The callee is parsed with the existing cache and its elements are reported against the
CALLEE's own file and line, so a row names the file a reader must edit.

Costs, measured against `b30413cf5`, each edge added to the one before it: ancestry alone takes the
universe from 362 to 627. Edge 1 adds 9 elements (636) and one residue site, the flagship one. Edge 2
adds a further 72 (708) and 8 residue sites, one of which is `CronRunSummaryCard`. `textEntry` adds the
remaining 59, for 767.

**Why the three edges are ONE flag.** They are three resolution mechanisms answering one question:
what paints inside this control. Splitting them would give eight option combinations to test and would
let a consumer take an answer that is wrong in a way nobody declared. §5.3's accept-set enumerates all
three under `paintedChildren`.

**Termination and duplicates.** Re-entrancy is bounded by a per-file set of followed names, so
`const a = <>{b}</>; const b = <>{a}</>` and a component that renders itself both terminate. A
component invoked from several in-scope ancestors would report its elements once per call site, so the
result is de-duplicated by `(file, line, tag)`; with both flags off no element can be reached twice, so
the de-duplication is inert on the default path and AC-1 still holds byte-for-byte.

### 5.2 What the mechanism cannot reach, stated as a limit and not as a gap

The component edge closes the case §5.1 was written around, and three narrower cases stay open. Each
fails in the safe direction: the element is not admitted, so nothing is cleared that was not already
clear, and none of the three has a live instance in the corpus today.

- **A component the resolver cannot name.** A tag produced by a higher-order component, a factory, a
  dynamic import, or a re-export chain past `MAX_IMPORT_HOPS` (3,
  `tests/styles/interactiveScanCore.ts:81`). One hop covers every component call the corpus makes
  inside a control today; a second hop is a widening nobody has a site for.
- **JSX inside an ATTRIBUTE of an in-scope element.** A render prop or an `icon={<span className="…"/>}`
  renders inside the control's box but is not a JSX CHILD. The ancestor counter rises only over an
  element's children, so attribute JSX is scanned with the counter at its outer value and is not
  admitted.
- **Paint applied by a `style` prop or an arbitrary CSS variable rather than a Tailwind border
  utility.** Unchanged from today: the oracle asks Tailwind's compiler what a token paints, and a
  declaration that never becomes a token is invisible to it
  (`tests/styles/controlOutlineResidue.ts:9-13`).

**RE-FILE TRIGGER for all three:** a control whose only resting outline is painted through one of these
paths reaching `main` at `border-border` or `border-border-strong`.

**What this does to the switch-track count, which is the checkable prediction.**
`DESIGN.md:260-261` records that two of the five switch-track render paths "paint the track on a nested
`<span>`, which is why an element-level census reported three". Both now become visible, by two
DIFFERENT mechanisms: `components/admin/telemetry/AutoRefreshControl.tsx:105` is a lexical `<span>`
child of its button, and `components/admin/settings/DeveloperToggleButton.tsx:93` is inside
`function SwitchTrack`, rendered as `<SwitchTrack on={…} />` at
`components/admin/settings/DeveloperToggleButton.tsx:128` and
`components/admin/settings/DeveloperToggleButton.tsx:165`, reached by edge 2. So `count("switch-track")`
moves **3 to 5**, measured, and §11 rewrites that `DESIGN.md` sentence to name the two mechanisms
rather than one.

### 5.3 The accept-set, and every input the options can receive

Both flags declare what they ACCEPT, keyed on tag or structure and never on spelling. Everything
outside an accept-set is not admitted, and an element the resolver cannot read still reports
`unresolved` exactly as today, which is the surfaced-signal half of the consequence bound.

| Input | `textEntry: false` (default) | `textEntry: true` |
| --- | --- | --- |
| `<input type="checkbox">`, `<input type="radio">` | admitted (unchanged) | admitted |
| `<input>` at any other static type | not admitted | admitted |
| `<input type={expr}>` (dynamic) | not admitted | admitted, without reading the type |
| `<textarea>`, `<select>` | not admitted | admitted |
| every other tag | unchanged by this flag | unchanged by this flag |

| Input | `paintedChildren: false` (default) | `paintedChildren: true` |
| --- | --- | --- |
| a JSX descendant of an in-scope element, with `className` | not admitted | admitted, `admittedAs: "painted-child"` |
| a JSX descendant of an in-scope element, no `className` | not admitted | not admitted |
| a JSX descendant that is itself in scope | admitted as an element (unchanged) | admitted as an element, never twice: the child arm is guarded by `!own` |
| a JSX child `{ident}` bound to a file-local JSX-valued declaration | not followed | followed, once per name per file |
| a JSX child `{ident}` bound to a non-JSX value, or to nothing | not followed | not followed |
| a JSX child `{ident}` imported from another module | not followed | not followed |
| `<Foo />` inside an in-scope ancestor, `Foo` declared in this file | admitted only if `Foo` is in scope by the existing rules | its declaration's JSX is visited, reported against this file |
| `<Foo />` inside an in-scope ancestor, `Foo` a named or default import one hop away | same | its declaration's JSX is visited, reported against the CALLEE's file and line |
| `<Foo />` whose declaration the resolver cannot name (HOC, factory, dynamic import, past 3 hops) | same | not followed |
| `<Foo />` NOT inside an in-scope ancestor | same | not followed |
| JSX inside an ATTRIBUTE of an in-scope element | not admitted | not admitted |
| a JSX element at the top level of a file, no in-scope ancestor | not admitted | not admitted |

**Guard conditions.** `options` omitted, `{}`, or either field `undefined` or `false` all behave as
today; the comparison is `=== true`, so no truthy-coercion surprise reaches the predicate. A file with
no JSX contributes nothing. A cyclic pair of JSX-valued consts, and a component that renders itself,
both terminate on the per-file followed-name set. The existing resolver bounds (`MAX_RESOLVE_DEPTH` 6,
`MAX_PATHS` 64, `MAX_IMPORT_HOPS` 3 at `tests/styles/interactiveScanCore.ts:79-81`) are untouched and
apply to a painted child's className exactly as they apply to an element's.

## 6. The red, measured

Probe: the widening applied to `tests/styles/interactiveScanCore.ts`, `residueOf` given the same
options, run against `b30413cf5` with `app/globals.css` as the oracle stylesheet. Full transcript
committed at `docs/superpowers/specs/probes/2026-08-26-control-outline-cover-red.txt`.

**Positive control first.** With both flags off the widened scanner returns byte-identical
`file:line:tag` output to today's `scanInteractiveElements`. Reported `true`. Without it the numbers
below measure a scanner, not a widening.

| Setting | Universe | Residue elements | Residue keys |
| --- | --- | --- | --- |
| today | 362 | 10 | 10 |
| `textEntry` only | 421 | 23 | 20 |
| `paintedChildren` only | 708 | 32 | 29 |
| both | **767** | **45** | **39** |

Ten of those 45 are the ten already registered. **The reddening set is 35 elements**, and one further
site is named by the tinted-plate guard alone (§6.3).

### 6.1 Family A, thirteen elements

| Element | Paint today | Ground |
| --- | --- | --- |
| `app/admin/settings/admins/AddAdminForm.tsx:73` `<input>` | `border border-border bg-bg` | `bg` |
| `app/admin/settings/admins/AddAdminForm.tsx:84` `<input>` | `border border-border bg-bg` | `bg` |
| `components/admin/BellPanel.tsx:838` `<input>` | `border border-border-strong bg-surface` | `surface` |
| `components/admin/BellPanel.tsx:849` `<input>` | `border border-border-strong bg-surface` | `surface` |
| `components/admin/ShowsTable.tsx:455` `<input>` | `border border-border bg-surface` | `surface` |
| `components/admin/dev/MaterializeCard.tsx:152` `<input>` | `border border-border bg-surface` | `surface` |
| `components/admin/dev/MaterializeCard.tsx:164` `<select>` | `border border-border bg-surface` | `surface` |
| `components/admin/dev/MaterializeCard.tsx:179` `<select>` | `border border-border bg-surface` | `surface` |
| `components/admin/dev/SwitcherControls.tsx:119` `<select>` | `border border-border bg-surface hover:border-accent` | `surface` |
| `components/admin/telemetry/EventFilters.tsx:40` `<input>` | `border border-border bg-surface` (second alternative; the first is the `className` prop) | `surface` |
| `components/admin/telemetry/EventFilters.tsx:101` `<select>` | `border border-border bg-surface` | `surface` |
| `components/admin/wizard/step3ReviewSections.tsx:4195` `<textarea>` | `border border-border-strong bg-surface` | `surface` |
| `components/shared/ReportModal.tsx:705` `<textarea>` | `border border-border bg-bg` | `bg` |

`MaterializeCard`'s three share the file-local `CONTROL` constant, so they are one edit.

Two of these appear in `DESIGN.md` and not in the row: `ReportModal.tsx:705`, named at
`DESIGN.md:322-324`, and the `MaintenanceResetButtons` field of §6.3, named at `DESIGN.md:412-418`.
**Eight** appear in neither: `app/admin/settings/admins/AddAdminForm.tsx:73`,
`app/admin/settings/admins/AddAdminForm.tsx:84`, `components/admin/ShowsTable.tsx:455`,
`components/admin/dev/MaterializeCard.tsx:152`, `components/admin/dev/MaterializeCard.tsx:164`,
`components/admin/dev/MaterializeCard.tsx:179`, `components/admin/telemetry/EventFilters.tsx:40` and
`components/admin/telemetry/EventFilters.tsx:101`. That gap is the reason the sweep is derived.

### 6.2 Family B, twenty-two elements

| Element | Paint today | Disposition |
| --- | --- | --- |
| `components/admin/wizard/VenueMapTile.tsx:121` `<span>` | `border border-border-strong bg-surface` | swap |
| `components/admin/OnboardingWizard.tsx:258` `<span>` | 4 alternatives; the done arm is `border-border-strong bg-surface` | swap the done arm |
| `components/admin/ShowRowActions.tsx:647` `<span>` | open `border border-border-strong bg-surface-sunken`, closed `border border-border` unfilled | swap both arms |
| `components/admin/wizard/CrewRowActions.tsx:270` `<span>` | byte-identical to the row above | swap both arms |
| `components/admin/wizard/step3ReviewSections.tsx:1226` `<span>` | `border border-border` unfilled | swap |
| `components/admin/wizard/step3ReviewSections.tsx:1768` `<span>` | `border border-border` unfilled | swap |
| `components/admin/wizard/step3ReviewSections.tsx:1779` `<span>` | `border border-border` unfilled | swap |
| `components/admin/wizard/step3ReviewSections.tsx:3788` `<img>` | `border border-border bg-surface-sunken` | swap |
| `components/admin/ReSyncButton.tsx:213` `<span>` | `border border-border` unfilled | swap |
| `components/admin/telemetry/CronRunSummaryCard.tsx:26` `<div>` | `border border-border bg-surface-sunken` | swap |
| `components/admin/telemetry/AutoRefreshControl.tsx:105` `<span>` | switch track, both arms | register, `switch-track` |
| `components/admin/settings/DeveloperToggleButton.tsx:93` `<span>` | switch track, both arms | register, `switch-track` |
| `components/admin/IgnoredSheetsDisclosure.tsx:80` `<span>` | `border border-border-strong bg-warning-bg` | register, `inner-chrome` |
| `components/admin/IgnoredSheetsDisclosure.tsx:97` `<span>` | `border border-border bg-surface-sunken` | register, `inner-chrome` |
| `components/admin/RecentAutoAppliedStrip.tsx:474` `<span>` | `border border-border bg-surface` | register, `inner-chrome` |
| `components/admin/nav/AdminNav.tsx:154` `<span>` | `border border-border bg-surface-raised` | register, `inner-chrome` |
| `components/admin/ShowsTable.tsx:288` `<span>` | `border border-border` unfilled | register, `inner-chrome` |
| `components/admin/wizard/step3ReviewSections.tsx:2431` `<span>` | `border border-border bg-surface-sunken` | register, `inner-chrome` |
| `components/admin/UnarchiveShowButton.tsx:113` `<p>` | `border border-border-strong bg-warning-bg` | register, `inner-chrome` |
| `components/admin/ArchiveShowButton.tsx:232` `<div>` | `border border-border-strong bg-warning-bg` | register, `inner-chrome` |
| `components/admin/ArchiveShowButton.tsx:243` `<p>` | `border border-border-strong bg-warning-bg` | register, `inner-chrome` |
| `components/admin/ArchiveShowButton.tsx:253` `<p>` | `border border-border-strong bg-warning-bg` | register, `inner-chrome` |

**The rule that sorts this column, and it is a ruling rather than a projection.** Family B's principle
is that paint landing on a child instead of on the interactive element is not a reason to treat it
differently. So a painted child that IS the control's own visual box takes the rule the element would
have taken. A painted child that is chrome INSIDE the control (a status chip, a count pill, a
decorative label, an alert banner) keeps the treatment `DESIGN.md` §1.2a's scope paragraph already
gives non-interactive chrome by name: "tile and card edges, hover borders, focus-adjacent chrome, and
the status-emphasis outline on non-interactive chrome (the flagged pill, the judgment chip)".

`CronRunSummaryCard` is the sharpest instance of the visual half and the reason edge 2 exists: its
caller at `components/admin/telemetry/EventRow.tsx:39` is a `role="button"` whose only child is that
component, and the comment there records that the rich card IS the collapsed body. The `<div>` at
`components/admin/telemetry/CronRunSummaryCard.tsx:26` is therefore the control's boundary, not a card
edge beside one.

The seven `bg-warning-bg` banners of `ArchiveShowButton` and `UnarchiveShowButton` are the sharpest
instance of the chrome half. They are `role="alert"` status surfaces that happen to render inside the
`<div onClick>` at `components/admin/showpage/ShareHub.tsx:1081`, which is in scope by the `onClick`
rule. Being inside a click target does not make an alert a control boundary, and §1.2a preserves
`border-border-strong` for status emphasis by name.

The closed arms of `ShowRowActions` and `CrewRowActions` are not a new question:
`DESIGN.md:295-302` ruled on 2026-08-18 that a control's resting `border-border`, on a neutral ground
or unfilled, takes the text ramp. That ruling simply could not reach a child span. Both arms verified
individually, not assumed.

`ReSyncButton.tsx:213` is the button's own `max-sm:` skin, so it is the control's visual below 640px
and swaps with the rest. Its `border-border` carries no responsive variant of its own (the element is
display-gated instead), so `responsive-skin-filed` does not reach it and would not be honest anyway:
the site is repaired, not filed.

### 6.3 The site only the tinted-plate guard names

`components/admin/MaintenanceResetButtons.tsx:300` `<input type="text">` carries
`border border-text-faint bg-bg` with `focus-visible:ring-offset-warning-bg`. `border-text-faint` is
not a weak colour, so the residue guard never sees it. The **derived arm** of
`tests/styles/tintedPlateOutline.test.ts:74-80` does: it admits any scanned element whose own strings
declare both a tinted-plate ring-offset and a resting outline, and asserts that element carries
`border-control-outline-tinted` and NOT `border-text-faint`. Measured: the derived subject list moves
8 to 9 and the new member is this field, failing both assertions.

That red is the site's own derived cover naming it, so moving it is not a hand-extension.

It also puts two live assertions in direct contradiction, and the contradiction is the arc's work
rather than an accident. `tintedPlateOutline.test.ts:252-261` pins the field as deliberately untouched,
and states its reason: family A's question is open, so moving it "would answer its question in
passing". The question is now answered. The pin is **inverted rather than deleted**, the same shape
`DESIGN.md:337-352` records for the ShareHub skin: same case, asserting the new token, with the
ratification and its date in the docstring.

`--color-text-faint` measures **3.04:1 light / 2.79:1 dark** against `warning-bg`, under the floor in
dark, which is why `--color-control-outline-tinted` exists (`DESIGN.md:188`).

## 7. Consumer-by-consumer population accounting

Six consumers. Each states which setting it reads and what that does to its population.

**7.1 `tests/styles/controlOutlineResidue.ts:449` (`residueOf`) reads `{ textEntry: true, paintedChildren: true }`.** This
is the guard that drives the sweep. Universe 362 to 767, residue elements 10 to 45 before the repairs
and 22 after, `RESIDUE_CENSUS.length` 10 to 22. Per category: `switch-track` 3 to 5,
`side-divider` 5 unchanged, `focus-state-chrome` 2 unchanged, `inner-chrome` 0 to 10 (new category,
§8), and `responsive-skin-filed`, `filed-defect`, `literal-outline` all 0 unchanged. 5 + 5 + 2 + 10 is
22, which is the length. Intended: this is the deliverable.
`tests/styles/_metaControlOutlineResidue.test.ts:386` and
`tests/styles/_metaControlOutlineResidue.test.ts:392-394` move to the derived values.

**Why 22 rows and not 22 plus duplicates.** The residue key is `(file, tag, sorted projections)` with
no line number (`tests/styles/controlOutlineResidue.ts:436`), so identical siblings share one key at
multiplicity two and need two rows. Measured: 35 new elements collapse to 29 new keys, six collisions
in all. Five are among the SWAPPED sites:
`app/admin/settings/admins/AddAdminForm.tsx:73` with `app/admin/settings/admins/AddAdminForm.tsx:84`,
`components/admin/BellPanel.tsx:838` with `components/admin/BellPanel.tsx:849`, and
`components/admin/dev/MaterializeCard.tsx:164` with `components/admin/dev/MaterializeCard.tsx:179`
are each one key at multiplicity two;
`components/admin/wizard/step3ReviewSections.tsx:1226`,
`components/admin/wizard/step3ReviewSections.tsx:1768` and
`components/admin/wizard/step3ReviewSections.tsx:1779` are one key at multiplicity three. The sixth is
among the REGISTERED sites: `components/admin/ArchiveShowButton.tsx:243` and
`components/admin/ArchiveShowButton.tsx:253` are both `<p>` on the same paint, so they are one key at
multiplicity two and take TWO rows. 35 minus 6 is 29, which is the measured key count and the check
that this reading of the key is the guard's reading. The twelve registered elements therefore hold
eleven distinct keys and twelve rows, so the census is 10 plus 12.

The `switch-track` movement is the checkable prediction the row set: both nested paths become visible,
by the two different mechanisms §5.2 names, so the count moves 3 to 5.

**7.2 `tests/styles/tintedPlateOutline.test.ts:56` reads `{ textEntry: true, paintedChildren: true }`.** Derived
subject list 8 to 9, the new member being §6.3. Universe premise `>= 200` still holds at 767.

Its registry's `neutralFaintCount` rows count `border-text-faint` occurrences in a FILE with comments
stripped, not scanned elements, so the opt-in itself moves none of them. The SWEEP does:
`tests/styles/tintedPlateOutline.test.ts:215` pins
`components/admin/wizard/step3ReviewSections.tsx` at 4, and §6 adds five occurrences to that file (the
textarea plus four painted children), so the pin moves to 9 in the same commit or this suite reds for a
reason that has nothing to do with plates. It is the only registry row any file in this diff touches;
the other six name `DataQualityWarningControls`, `archivedTabOffer`, `PublishedArchivedTabOffer`,
`RoleMappingRow`, `lib/ui/actionClass.ts` and `RescanSheetButton`, none of which this diff edits.

Intended: the plate cover reaching a text field is exactly what ruling (a) makes correct.

**7.3 `tests/styles/tapTargetScan.ts:33` reads the DEFAULT.** Population unchanged at 362.
`TAP_TARGET_CENSUS` unchanged. Intended, and argued rather than absorbed: neither ruling says anything
about the height of a text field, and admitting the 59 elements `textEntry` adds to a 44px floor census would
oblige a reason row for each of the 59 elements `textEntry` admits, for a question nobody has asked. A future arc that wants that census
widened opts this consumer in and takes the rows; the axis is declared and one line away, which is the
point of D1.

**7.4 `tests/styles/subtleInteractiveScan.ts:44` reads the DEFAULT.** Population unchanged at 362, the
15 registry rows unchanged. Intended: its docstring already records descendant widening as a scope
decision taken against, at invariant-8 critique round 2 on 2026-08-14, and this arc has no ruling that
touches the resting-text-colour policy. §11 adds one sentence to that docstring noting the axis is now
expressible and still declined here, so a later reader does not read "cannot" where the truth is
"does not".

**7.5 `tests/styles/controlOutlineScan.ts:229` (`resolveCensus`) reads the DEFAULT.** Population
unchanged at 362, all 57 rows resolve as today. Intended: it is a regression pin over a closed set of
elements that are all in the base vocabulary, and it needs no widening to answer its one question.
`scoreFloor` is 1 on this surface, so leaving its behaviour byte-identical is also what keeps that
floor reachable.

**7.6 `tests/styles/_metaControlOutlineFill.test.ts:53` scans directly, and reads the DEFAULT**, as
does its fixture helper at `tests/styles/_metaControlOutlineFill.test.ts:102`. Its
`premise("scanner reaches the component tree", UNIVERSE.length, 200)` at
`tests/styles/_metaControlOutlineFill.test.ts:60` and its recorded
"Measured universe: 362" both stand unchanged.

## 8. The `inner-chrome` category

Four of the reddened elements are non-interactive chrome painted inside a control. No existing
`RESIDUE_CATEGORIES` member fits: they are not tracks, not side dividers, not focus chrome, not
responsive skins, and there is no defect to file. A quiet exclusion is not available; the guard's whole
contract is that everything admitted is either swapped or registered with a reason whose form a test
checks.

```
inner-chrome
```

**Bar, two halves.**

- *Structural, with teeth:* the element was admitted as a painted child and is not in scope on its
  own. `ScanElement` gains `admittedAs: "element" | "painted-child"`, and the bar refuses any row whose
  live element is `"element"`. This is what stops a real `<button>` being parked here.
- *Form:* the reason cites `DESIGN.md` §1.2a and records the measured ratio as `n.nn:1 light /
  n.nn:1 dark`, the same two demands the `switch-track` bar already makes
  (`tests/styles/controlOutlineResidue.ts:665-670`).

**What the bar deliberately does NOT decide** is whether a given painted child is really chrome rather
than the control's visual. That is a ruling, exactly like trackness, and the module's header already
says why no predicate may grow here (`tests/styles/controlOutlineResidue.ts:9-13`, five mechanisms,
five structural escapes). A false citation costs its author a false citation and a diff a reviewer
reads, which is the same price the `switch-track` category already charges
(`tests/styles/controlOutlineResidue.ts:19-23`).

## 9. Tokens: seven pinned grounds, and exactly one new row

Every swap target's ground is one of the seven `DESIGN.md` §1.2 already pins, so the token follows
from the GROUND and never from the family:

| Ground | Token | Pinned ratio | `DESIGN.md` |
| --- | --- | --- | --- |
| `--color-surface` | `border-text-faint` | 3.35:1 / 3.76:1 | `DESIGN.md:183` |
| `--color-surface-sunken` | `border-text-faint` | 3.02:1 / 4.11:1 | `DESIGN.md:185` |
| `--color-bg` | `border-text-faint` | 3.21:1 / 4.00:1 | `DESIGN.md:186` |
| `--color-surface-raised` | `border-text-faint` | 3.35:1 / 3.53:1 | `DESIGN.md:187` |
| the three tinted plates | `border-control-outline-tinted` | 3.42-3.62 / 3.65-4.55 | `DESIGN.md:188` |

The unfilled sites (`ShowRowActions:647` closed arm, `CrewRowActions:270` closed arm, the three
step3 icon visuals, `ReSyncButton:213`) are reached by §1.2a's ratified "or left unfilled" clause and
stand on `--color-surface` or `--color-surface-sunken` rows, both pinned above.

**One new row, because §6.3's field carries its own `bg-bg` fill on a `warning-bg` plate.** Its outer
edge is the plate (pinned) and its inner edge is a pair nothing pins yet:

| Pair | Light | Dark |
| --- | --- | --- |
| `--color-control-outline-tinted` as OUTLINE vs `--color-bg` (inner edge) | **3.82:1** | **5.22:1** |

Computed with the standard WCAG 2.x relative-luminance formula from
`app/globals.css:366, 385, 437, 447`. The same computation reproduces every pinned §1.2 figure above
to two decimal places, which is the check that the method matches the table it is joining. The row
lands in `DESIGN.md` §1.2 **and** takes an assertion in
`tests/styles/secondary-action-contrast.test.ts` in the same commit, per the AGENTS.md pre-code
mechanical UI gate. Keeping the field's `bg-bg` fill and pinning the pair is preferred to changing the
fill to `bg-surface`: the fill is a visual decision neither ruling made.

## 10. The hover half

`DESIGN.md:309-316` makes hover-heavier-than-rest a rule. Raising a resting outline to 3.35:1 while a
`hover:` override sits at 1.59:1 inverts the pair.

Swept repo-wide over `app/**` and `components/**`: `hover:border-*` resolves to
`border-text-subtle` (11), `border-border-strong` (8, of which 7 are card links in
`app/help/tour/page.mdx`, outside the `.tsx` corpus and outside this sweep),
`border-status-warn` (2), `border-accent-on-bg` (2) and `border-accent` (**1**). The single bare
`hover:border-accent` on a control is `components/admin/dev/SwitcherControls.tsx:122`, which is the
Family A `<select>` at `components/admin/dev/SwitcherControls.tsx:119`. `--color-accent` is decorative-only in light (2.10-2.33:1,
`DESIGN.md:192`) and cannot carry a hover heavier than 3.35:1, so its rest and its hover move
together: `border-text-faint` and `hover:border-accent-on-bg`, matching its own lexical neighbours at
`components/admin/dev/SwitcherControls.tsx:29` and
`components/admin/dev/SwitcherControls.tsx:145`. No other swap target in §6 carries a `hover:` border override.

## 11. `DESIGN.md` and the docstrings that are now false

A `DESIGN.md` edit is a UI surface under invariant 8. Each paragraph becomes a record of what was
ruled and what moved, never a promise the diff has not kept. `DESIGN.md:326-329` is explicit that an
earlier revision over-claimed and the invariant-8 review caught it; this does not repeat the shape.

- **`DESIGN.md:319-329`** ("What the 2026-08-18 sweep actually reached") states the vocabulary as
  `button`/`a`/`summary` plus checkbox and radio inputs, and says text-entry fields and `<select>`s
  are outside it in both directions. Rewritten to record ruling (a), the widened cover, the thirteen
  Family A sites that moved, and the fact that `ReportModal.tsx:705`, which this paragraph named, is
  one of them.
- **`DESIGN.md:412-418`** (the `MaintenanceResetButtons` paragraph) pins that field as untouched
  *because* family A's question was open. Rewritten to record that the question is answered, the field
  moved to the plate token, and the executable pin was inverted rather than deleted.
- **`DESIGN.md:445-449`** ("the outlines the element-level census cannot see … are filed separately
  with their probe transcripts"). Rewritten to record that the row is closed and archived, with the
  two limits of §5.2 named as limits.
- **`DESIGN.md:250-261`** (the switch-track carve-out) keeps its ruling intact. One sentence changes:
  the two nested paths are distinguished by mechanism per §5.2, and the paragraph states that
  `AutoRefreshControl` now carries a residue row against the same ruling while the ruling itself is
  untouched. This is where the arc says plainly why the same 1.43:1 / 1.75:1 pair is swept in one
  place and preserved in another.
- **`DESIGN.md` §1.2a scope paragraph** gains the Family B sorting rule of §6.2, so the difference
  between a control's visual painted on a child and chrome painted inside a control is written down
  once rather than re-derived per site.
- **`tests/styles/subtleInteractiveScan.ts:15-23`** gains one sentence: the descendant axis is now
  expressible via `ScanOptions` and is still declined here, for the reason the docstring already gives.
- **`tests/styles/tintedPlateOutline.test.ts:33-41`** records as a documented limit that ancestor
  resolution is not coming and cites this row as untouched. Rewritten: the row is closed, the scanner
  gained a bounded child admission, and the L1 limit (asking "is this control inside a tinted plate"
  in general) is unchanged, because a ring-offset is still the only element-level signal.

**Do not touch** `tests/specLint/fixtures/claimSweep/fede5f084/spec.md:274` or
`tests/specLint/fixtures/claimSweep/c272ebed3/spec.md:271`. Both contain the sentence "The scanner's
element vocabulary is unchanged." They are frozen fixtures of a prior arc's spec, not live claims;
editing them reds specLint.

## 12. Mutation surfaces

Three enrolled surfaces sit in this diff's path (`tests/mutation/source/registry.ts:2565`, `tests/mutation/source/registry.ts:2699`,
`tests/mutation/source/registry.ts:2722`). All three are re-scored at the shipping head with `pnpm heavy:mutation pnpm mutation:guards`,
under the class lock arbitrated by bl-orch. A surface's shard is derived by LPT from the registry
(`tests/mutation/source/shardPartition.ts:90`) and is never a number carried by hand.

**The `accepted` rows are LINE-KEYED, and this diff shifts them.** A `siteId` is
`<operator>:<line>:<column>:<mutation>`, so an insertion above an accepted site invalidates the row and
the score reds on a survivor nobody introduced. Both affected surfaces are enumerable at spec time
rather than discovered at score time. `interactiveScanCore` holds 11 accepted rows at source lines 141,
153, 180, 236, 285, 312, 380, 383 and 394 (`tests/mutation/source/registry.ts:2588-2657`); adding
`admittedAs` to `ScanElement`, whose declaration ends at `tests/styles/interactiveScanCore.ts:65`,
inserts N lines above all eleven, so every one shifts by exactly +N and no column changes.
`controlOutlineResidue` holds 9 accepted rows at 45, 51, 62, 80, 307, 321, 324, 373 and 659; only 659
sits below the `ResidueCategory` and `RESIDUE_CATEGORIES` additions, so only that one shifts. Every
other edit lands below the highest accepted line on its surface or changes a line in place (the residue
import, the `residueOf` signature). The repair is therefore deterministic: apply the shift by
construction, then let the score run confirm zero unaccepted survivors rather than discover the shift.

**`millisPerBoot` is an input to the shard partition, so it moves too.**
`tests/mutation/source/shardPartition.ts:90` derives a surface's shard by LPT over `millisPerBoot`. The
two opted-in suites are re-measured and their rows updated in the same commit as the opt-in, and the
shard is read back out of the partition rather than carried as a number.

**The coverage hazard, named at spec time.** `interactiveScanCore`'s deciding suites are
`interactiveScanCore.test.ts`, `_metaSubtleOnInteractive.test.ts` and `_metaTapTargetFloor.test.ts`
(`registry.ts:2565`), and by D1 the last two read the DEFAULT options. So every mutant in the new
`ScanOptions` code would survive against suites that never turn it on. The new behaviour is therefore
covered in `tests/styles/interactiveScanCore.test.ts`, against its own fixture roots, with both flags
exercised, rather than by adding a 9.7s-per-boot residue suite to the surface's list.

`tests/styles/subtleInteractiveScan.ts` stays UNENROLLED (`registry.ts:2657-2671`): it produced zero
mutants and the harness rejected it by its own no-mutants condition. Its population does not change
here, so nothing about that record moves. A vacuous row would be worse than an honest absence.

## 13. Acceptance criteria

- **AC-1** With both flags off, `scanInteractiveElements` returns byte-identical `file:line:tag`
  output to `b30413cf5`. Executable, and it is the premise every other number rests on.
- **AC-2** With `{ textEntry: true }`, the scanner admits `<textarea>`, `<select>` and `<input>` at any
  type; universe 421 on the live corpus.
- **AC-3** With `{ paintedChildren: true }`, a className-carrying JSX descendant of an in-scope element
  is admitted as its own element with `admittedAs: "painted-child"`, anchored on its own opening tag.
- **AC-4** A JSX child that is a bare identifier bound to a file-local JSX-valued declaration is
  followed, and so is a capitalised tag inside an in-scope ancestor whose declaration is in this file
  or one named-or-default import hop away. A tag the resolver cannot name is NOT followed, and neither
  is JSX inside an attribute. All four directions asserted against fixtures, the follow cases shaped
  like `VenueMapTile` and `CronRunSummaryCard`, the refusals shaped like an HOC-produced tag and an
  `icon={<span className="…"/>}` prop.
- **AC-4b** A component invoked from two in-scope ancestors contributes its elements ONCE: the result
  is de-duplicated by `(file, line, tag)`, and a self-rendering component terminates.
- **AC-5** All four `TAP_TARGET`, subtle-policy, fill-census and direct-scan consumers report
  unchanged populations (362, 362, 57 resolved rows, 362).
- **AC-6** Every one of the 35 elements in §6.1 and §6.2 is either swapped to the token its ground
  requires or holds a `RESIDUE_CENSUS` row that passes its category bar.
- **AC-7** `RESIDUE_CENSUS.length` is 22; per-category counts are 5 / 5 / 2 / 10 / 0 / 0 / 0 for
  `switch-track`, `side-divider`, `focus-state-chrome`, `inner-chrome`, `responsive-skin-filed`,
  `filed-defect`, `literal-outline`.
- **AC-8** An `inner-chrome` row whose live element is `admittedAs: "element"` is refused, with the
  refusal asserted against a constructed subject.
- **AC-9** The count of sites repaired that do not appear in the §6 red transcript is **zero**.
- **AC-10** `--color-control-outline-tinted` vs `--color-bg` is pinned in `DESIGN.md` §1.2 and asserted
  in `tests/styles/secondary-action-contrast.test.ts`, in the same commit.
- **AC-11** `components/admin/dev/SwitcherControls.tsx:122` carries `hover:border-accent-on-bg`, and
  no bare `hover:border-accent` remains on any control in `app/**` or `components/**`.
- **AC-12** `tintedPlateOutline.test.ts`'s derived arm passes with 9 members, and its inverted pin
  asserts `border-control-outline-tinted` on `MaintenanceResetButtons.tsx:300`.
- **AC-13** Playwright at 390px, light and dark, on the BellPanel config row, a menu trigger open and
  closed, the step-3 report textarea, the wizard step indicator's done pill, and the venue tile's
  Directions visual. Before and after captures in the PR body.
- **AC-14** The invariant-8 dual gate green, with dispositions recorded in the closeout.
- **AC-15** The multiset of border-WIDTH utilities across every swap target is identical before and
  after. A colour swap that moved a width would change layout, and §14 claims it does not.
- **AC-16** `tests/styles/tintedPlateOutline.test.ts:215` records 9 for
  `components/admin/wizard/step3ReviewSections.tsx`, counted code-only with comments stripped, in the
  same commit as the five occurrences the sweep adds to that file.
- **AC-17** All three enrolled surfaces score at or above their floors with an empty unaccepted-survivor
  set, and every `accepted` row still names the mutation its reason describes after the line shift of
  §12.

## 14. Dimensional Invariants

Every repair in §6 replaces one border COLOUR token with another. Nothing here changes a border
width, a padding, a radius or a display mode, so no box model moves. Stated anyway, because a
colour-only claim is exactly the kind that turns out to be false once a diff exists.

| Parent | Child | Relationship | What guarantees it |
| --- | --- | --- | --- |
| `<button>` `components/admin/ShowRowActions.tsx:631` (`min-h-tap-min min-w-tap-min`) | `<span>` at `components/admin/ShowRowActions.tsx:647` | child is the 32px visual inside the 44px target, deliberately smaller | `size-8` on the child, `min-h-tap-min min-w-tap-min` on the parent; neither is touched |
| `<button>` `components/admin/wizard/CrewRowActions.tsx:260` (`size-tap-min`) | `<span>` at `components/admin/wizard/CrewRowActions.tsx:270` | same | `size-8` on the child; neither is touched |
| `<a>` `components/admin/wizard/step3ReviewSections.tsx:1217` (`size-tap-min`) | `<span>` at `components/admin/wizard/step3ReviewSections.tsx:1226` | same | `size-8` on the child; neither is touched |
| `<a>` `components/admin/wizard/VenueMapTile.tsx:134` (the whole tile) | `<span>` at `components/admin/wizard/VenueMapTile.tsx:121` | the child IS the 44px target here, absolutely positioned in the tile's bottom band | `min-h-tap-min` on the child, `absolute inset-x-2.5 bottom-2.5`; neither is touched |
| `<button>` `components/admin/ReSyncButton.tsx:175` (`min-h-tap-min min-w-tap-min`) | `<span>` at `components/admin/ReSyncButton.tsx:213` | the `max-sm:` skin is `h-8` inside the 44px rect, and the button keeps its real rect | `h-8` on the child; neither is touched |

**Border width is 1px at every swap target.** No target carries `border-2` or a side-only width, so a
colour swap cannot change a computed size. AC-15 asserts the width utility set is identical before and
after across the whole swap.

## 15. Transition Inventory

Four swap targets animate their outline colour, so the swap changes what is tweened. Every other target
has no colour transition, which is stated rather than left blank.

`components/admin/ShowRowActions.tsx:647` and `components/admin/wizard/CrewRowActions.tsx:270` are
two-state (closed, open), so one pair each.

| Element | Pair | Transition |
| --- | --- | --- |
| `components/admin/ShowRowActions.tsx:647` | closed to open | `transition-colors duration-fast`, unchanged; the tween now runs `text-faint` unfilled to `text-faint` on `surface-sunken` instead of `border` to `border-strong` |
| `components/admin/ShowRowActions.tsx:647` | open to closed | the same tween in reverse, unchanged |
| `components/admin/wizard/CrewRowActions.tsx:270` | both directions | byte-identical recipe to the two rows above |
| `components/admin/telemetry/AutoRefreshControl.tsx:105` | OFF to ON, ON to OFF | `transition-colors`, unchanged, and the recipe is unchanged: the track is registered, not swapped |
| `components/admin/settings/DeveloperToggleButton.tsx:93` | OFF to ON, ON to OFF | same, through `TRACK_BASE`; registered, not swapped |

`components/admin/OnboardingWizard.tsx:258` has FOUR states, so six pairs, and the pill DOES animate:
`base` at `components/admin/OnboardingWizard.tsx:166` carries `transition-colors duration-fast` and the
visual is `cn(base, pillState)`. Only the `isDone` arm's border moves in this diff
(`border-border-strong` to `border-text-faint` at `components/admin/OnboardingWizard.tsx:240`), so every
pair with `done` on one side changes what is tweened and the other three do not.

| Pair | Border endpoints after the swap | Transition |
| --- | --- | --- |
| active to done | `accent-edge` to `text-faint` | `transition-colors duration-fast`; the done endpoint moves, the tween is unchanged in kind |
| done to active | `text-faint` to `accent-edge` | same, reversed |
| visited to done | `transparent` to `text-faint` | same; a transparent endpoint tweens to a visible one, as it did before at a lower weight |
| done to visited | `text-faint` to `transparent` | same, reversed |
| unreached to done | `transparent` to `text-faint` | same; `unreached` and `visited` share the border token and differ in text colour |
| done to unreached | `text-faint` to `transparent` | same, reversed |
| active to visited, visited to active | `accent-edge` to `transparent` | unchanged by this diff |
| active to unreached, unreached to active | `accent-edge` to `transparent` | unchanged by this diff |
| visited to unreached, unreached to visited | `transparent` to `transparent` | unchanged by this diff; the border is not what distinguishes these two |

Every other swap target:

| Element | Pair | Transition |
| --- | --- | --- |
| every Family A field | rest to focus, focus to rest | the focus cue is a `focus-visible:ring-*`, not a border tween; unchanged in both directions |
| `components/admin/dev/SwitcherControls.tsx:119` | rest to hover, hover to rest | no `transition-colors` on this element today. The hover token moves from `accent` to `accent-on-bg` and the switch stays instant, matching its two neighbours at `components/admin/dev/SwitcherControls.tsx:29` and `components/admin/dev/SwitcherControls.tsx:145`, which are also instant |
| `components/admin/wizard/VenueMapTile.tsx:121`, `components/admin/ReSyncButton.tsx:213`, `components/admin/telemetry/CronRunSummaryCard.tsx:26`, the four `step3ReviewSections` visuals | single-state | no state pair exists; instant by construction |

**Compound cases.** A menu trigger's open/closed tween can be interrupted by a re-render that swaps the
whole className string, because the two arms are a ternary rather than a variant: true today, unchanged
by a colour swap, no arm added or removed. And a wizard pill can change `pillState` while a previous
`transition-colors` is still running, since the four arms are also a ternary chain on one element; the
browser retargets the running colour tween, which is the behaviour today at the old token.

## 17. Documented limits

Carried from round 0, and this is the section a hypothetical files into. Per the consequence bound in
§1.1: an input that ends in a conservative demote plus a surfaced signal is a limit here, not a
finding.

- **L1. A component the resolver cannot name is not followed.** §5.2. A tag produced by a
  higher-order component, a factory, a dynamic import, or a re-export chain past `MAX_IMPORT_HOPS`
  (3, `tests/styles/interactiveScanCore.ts:81`). No live instance: one hop reaches every component
  call the corpus makes inside a control today, including
  `components/admin/telemetry/CronRunSummaryCard.tsx:26`, which is why the hop budget is 1 rather
  than 2. RE-FILE TRIGGER: a control whose only resting outline is painted inside such a component
  reaching `main` at `border-border` or `border-border-strong`.
- **L2. JSX reached through anything but a bare identifier or a component tag is not followed.** A
  `.map()` callback, a function call, a prop, an imported constant, and JSX inside an ATTRIBUTE of an
  in-scope element (`icon={<span className="…"/>}`, a render prop). The ancestor counter rises only
  over an element's CHILDREN, so attribute JSX is scanned at the outer value and is not admitted.
  Conservative in the safe direction: the element is simply not admitted, so nothing is cleared that
  was not already clear.
- **L3. Ancestor questions other than "is my nearest JSX ancestor in scope" are still unanswerable.**
  `tests/styles/tintedPlateOutline.test.ts` L1 stands unchanged: deciding "is this control inside a
  tinted plate" in general needs ancestor RESOLUTION, and a `focus-visible:ring-offset-*` on the
  element remains the only element-level signal for it. The child admission answers a different
  question and does not weaken that limit.
- **L4. `disabled:opacity-60` drops a raised outline back under 3:1.** Unchanged, and already recorded
  at `DESIGN.md:432-433`: WCAG exempts inactive controls.
- **L5. An unresolved className is admitted and never cleared.** Unchanged behaviour
  (`tests/styles/interactiveScanCore.ts:27-30`). A painted child whose class string the resolver cannot
  read is reported `unresolved` and stays in the census, which is the conservative direction.
- **L6. The `inner-chrome` bar cannot verify that a registered element really is chrome.** §8. Same
  posture as `switch-track`, and for the same reason: it is a ruling, not a projection.
