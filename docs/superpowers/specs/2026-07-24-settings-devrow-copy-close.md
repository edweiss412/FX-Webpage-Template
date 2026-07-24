# Settings Developer-tools row: close SETTINGS-DEVROW-GALLERY-RESIDUE-1

**Date:** 2026-07-24
**Status:** Draft (autonomous `/ship-feature` run; owner copy ratification given in-session)
**Scope:** three user-visible text changes across two files (row description, hidden `sr-only` qualifier, destination heading), two Tailwind utility classes on one shared literal (`transition-colors`, `duration-fast`), four updates to EXISTING docs/ledgers (§8), plus two new files (this change's own `closeout.md` and one structural guard test — §1.0, §3.3). No DB, no routes, no new props, no new design tokens.

## 1. What

Close all four deferred impeccable findings in the `DEFERRED.md` entry
`SETTINGS-DEVROW-GALLERY-RESIDUE-1`:

1. **[P2]** the `Open` link announces as a bare "Open" in an out-of-context
   screen-reader link list → append an `sr-only` qualifier so its accessible
   name is `Open developer tools`, visible text unchanged.
2. **[P2]** link label `Attention gallery` vs destination `<h1>`
   `Attention modal gallery` → retitle the **destination heading** to
   `Attention gallery`. The row's link label does not change.
3. **[P3]** `devLinkClass` omits the `transition-colors duration-fast` its
   sibling settings buttons carry → add it. The ring-offset half of that
   finding is **out of scope** (§7).
4. **[P3]** the row description predates the second link → rewrite it to
   `Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.`

Findings 1, 2 and 4 are user-visible copy and were **owner-ratified in-session
on 2026-07-24** against a rendered mockup of each option (desktop + 390px).
That ratification is the amendment the entry's own un-defer trigger requires
(`DEFERRED.md`, un-defer line of that entry: any spec amendment reopening the
settings dev-row copy).

### 1.0 Change inventory (canonical counts — every other section references this)

Round 2 and round 3 both surfaced count drift, so the numbers live here ONCE and
nowhere else states a count independently (R3 F4). §11's sweep verifies this
table against the body rather than restating figures.

| What | Count | Where |
| --- | --- | --- |
| Deferred findings closed | 4 | §1 items 1-4 |
| User-visible text changes | 3 | row description, hidden `sr-only` qualifier, destination heading (§3.1b, §3.1c, §3.2) |
| Source files changed | 2 | `components/admin/settings/DevToolsRow.tsx`, `app/admin/dev/attention-gallery/page.tsx` |
| Tailwind utility classes added | 2 | `transition-colors`, `duration-fast`, both on the one shared literal (§3.1a) |
| Updates to EXISTING docs/ledgers | 4 | §8 items 1-4 |
| New files created | 2 | this change's own `closeout.md`, and one new test file (§3.3) |
| Test contracts | 9 | T1, T1b, T2-T8 (§9). T8 is a contract like any other; living in a different file does not make it one less (R4 F6). |
| Test files touched | 2 | the existing `DevToolsRow.test.tsx` (edited, carries T1-T7) and the new ledger-graduation guard (created, carries T8) |
| Vitest config files touched | 1 | `vitest.projects.ts` — the new test directory must be claimed by exactly one project (§9 T8, R4 F7) |

### 1.1 Resolved scope — do not relitigate

- **The owner picked each copy option; the options are closed.** Ratified
  2026-07-24 in-session: finding 1 → hidden qualifier (not a visible rename);
  finding 2 → move the **page heading** to match the link (not the link to
  match the heading); finding 4 → the additive description. Do not re-propose
  the rejected alternatives (visible `Open dev tools`, link renamed to
  `Attention modal gallery`, a shorter `modal previews` description).
- **Finding 2's ratified direction drops the word `modal` from the product
  name of this surface.** The description in finding 4 therefore reads
  `the attention gallery`, never `the attention modal gallery` — the mockup's
  C1 text said the latter and was corrected in the same beat, because keeping
  it would reintroduce the exact label/heading mismatch finding 2 removes. One
  canonical user-facing name: **Attention gallery**.
- **The 2026-07-21 spec's "Row copy unchanged" clause is superseded, not
  violated.** `docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md:29-31`
  froze the row title + description. This spec is the amendment that reopens
  it; §8 lands an explicit amendment note in that document so the freeze and
  its supersession are both discoverable from either end.
- **The link label `Attention gallery` stays exactly as ratified in the
  2026-07-21 spec §1.1/§3.** Findings 1 and 2 are closed without touching it.
- **`devLinkClass` stays a single shared literal used by BOTH links.** The
  2026-07-21 spec §3 requires byte-identical classNames on the two links, and
  `tests/components/admin/settings/DevToolsRow.test.tsx:56` pins it. Adding the
  transition to the shared literal preserves that invariant by construction.
- **The `Open` link's `data-testid`, `href`, and visible text are unchanged.**
  Only a hidden text node is added inside it.
- **No route, gate, or prop changes.** The build-time `DEV_PANEL_PRESENT` +
  runtime `isDeveloper` gate at
  `components/admin/settings/DevToolsRow.tsx:33` is untouched.
- **User review gates waived** — autonomous-ship consent given in-session
  (AGENTS.md brainstorming gate).

## 2. Current state (live-code citations)

Every claim below was grepped against this worktree at `origin/main`
`6c116b771` on 2026-07-24.

| Claim | Citation |
| --- | --- |
| `devLinkClass` literal, shared by both links, no transition token | `components/admin/settings/DevToolsRow.tsx:16-17` |
| Row heading `Developer tools` | `components/admin/settings/DevToolsRow.tsx:46` |
| Row description `Fixture tester and parse diagnostics. Hidden from normal use.` | `components/admin/settings/DevToolsRow.tsx:47-49` |
| `Open` link (`href="/admin/dev"`, `data-testid="admin-dev-tools-open"`), text node `Open` only | `components/admin/settings/DevToolsRow.tsx:53-55` |
| `Attention gallery` link (`href="/admin/dev/attention-gallery"`, `data-testid="admin-dev-tools-gallery"`) | `components/admin/settings/DevToolsRow.tsx:56-62` |
| Action-group wrapper `flex flex-wrap items-center gap-2` | `components/admin/settings/DevToolsRow.tsx:52` |
| Gate `if (!DEV_PANEL_PRESENT || !isDeveloper) return null;` | `components/admin/settings/DevToolsRow.tsx:33` |
| Destination `<h1>Attention modal gallery</h1>` | `app/admin/dev/attention-gallery/page.tsx:54` |
| Sibling settings button carrying `transition-colors duration-fast` | `components/admin/settings/DriveConnectionPanel.tsx:244`, `components/admin/settings/DriveConnectionPanel.tsx:277` |
| DESIGN.md rule banning a bare `focus-visible:ring-offset-2` | `DESIGN.md:40` |
| App-wide bare-offset sweep owner | `BACKLOG.md` § `BL-FOCUS-RING-CONTRAST` |
| Existing unit test asserting `open` text `/^Open$/` | `tests/components/admin/settings/DevToolsRow.test.tsx:38` and `tests/components/admin/settings/DevToolsRow.test.tsx:51` |
| Existing test asserting byte-identical classNames | `tests/components/admin/settings/DevToolsRow.test.tsx:56` |
| Existing test asserting gallery text `/^Attention gallery$/` | `tests/components/admin/settings/DevToolsRow.test.tsx:49` |
| e2e asserting row + both links visible (testid only, no text) | `tests/e2e/admin-dev.spec.ts:59-61` |
| Absent-build test (no text assertions) | `tests/components/admin/settings/DevToolsRow.absent.test.tsx:26` and `tests/components/admin/settings/DevToolsRow.absent.test.tsx:34` |
| Settings page caller | `app/admin/settings/page.tsx:221` |

**Blast-radius greps run (2026-07-24, worktree at `6c116b771`):**

- `grep -rn "Attention modal gallery"` → exactly 3 hits: the `<h1>`
  (`app/admin/dev/attention-gallery/page.tsx:54`), one line of the `DEFERRED.md`
  entry, and
  `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md:50`.
  **No test, no metadata export, no screenshot manifest** asserts the heading
  string; `app/admin/dev/attention-gallery/page.tsx` exports no `metadata`.
- `grep -rn "DevToolsRow"` → the component, its two unit tests, the settings
  page caller, `tests/app/admin/settings-developer-visibility.test.tsx:72-73`
  (mocks the component wholesale, asserts only the `isDeveloper` flag), and two
  runner manifests (`vitest.projects.ts:115`, `scripts/test-fast.mjs:13`) that
  name only `DevToolsRow.absent.test.tsx`.
- `tests/styles/_metaBgAccentInventory.test.ts` has **no** `DevToolsRow` row —
  the component uses `bg-bg`/`bg-surface-sunken`, no accent background.
- The row renders only in an `ADMIN_DEV_PANEL_ENABLED=true` build
  (`scripts/with-admin-dev-flag.mjs:63`), so no help-screenshot baseline
  captures it.

## 3. Change

### 3.1 `components/admin/settings/DevToolsRow.tsx`

**(a) `devLinkClass` (line 16-17)** — insert `transition-colors duration-fast`
in the sibling's position (after the text color, before the hover rule), so the
literal matches `DriveConnectionPanel.tsx:244` token-for-token apart from that
sibling's `gap-2`, `bg`/backdrop choice and its bare ring offset:

```
inline-flex min-h-tap-min items-center justify-center rounded-sm border
border-border-strong bg-bg px-4 text-sm font-medium text-text-strong
transition-colors duration-fast hover:bg-surface-sunken
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
```

Final token order is whatever `prettier-plugin-tailwindcss` emits; the contract
is token **membership**, not source order (§9 asserts membership).

**(b) Row description (line 47-49)** —
`Fixture tester and parse diagnostics. Hidden from normal use.`
→ `Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.`

No em dash, no apostrophe, no raw error code. Two sentences, same
`text-sm text-text-subtle max-w-prose` treatment.

**(c) `Open` link children (line 53-55)** —

```tsx
<Link href="/admin/dev" data-testid="admin-dev-tools-open" className={devLinkClass}>
  Open <span className="sr-only">developer tools</span>
</Link>
```

**The separating space is a visible text node on the same JSX line as the
span**, deliberately NOT inside the `sr-only` span, and the span is NOT on its
own line.

**Empirical probe (run 2026-07-24 in this worktree; measured, not reasoned).**
This claim was contested in spec review R1 on the theory that the
accessible-name algorithm accumulates descendant text and normalizes the flat
result, which would make all three JSX forms equivalent. A throwaway jsdom
vitest file rendered all three against the installed
dom-accessibility-api 0.5.16 (resolved via testing-library/dom 10.4.1 —
the same implementation `toHaveAccessibleName` uses) and asserted each name:

| JSX form | Measured accessible name |
| --- | --- |
| `Open<span className="sr-only"> developer tools</span>` (space inside the span) | `Opendeveloper tools` ❌ |
| `Open <span className="sr-only">developer tools</span>` (space as a visible text node, same line) | `Open developer tools` ✓ |
| `Open` and `<span …>` on **separate lines** | `Opendeveloper tools` ❌ |

Both failure modes are real: the algorithm trims each text node's
leading/trailing whitespace before concatenation, and JSX independently strips
whitespace-only text between an expression/element pair on separate lines. Only
the middle form is correct, which is why §9 T1 asserts the name by exact match
rather than substring. The probe file was deleted after measuring; T1 is its
permanent replacement.

This exact defect shipped once before on
`View details<span className="sr-only"> for {title}</span>` and went unnoticed
for months because the test matched a substring, never the boundary.

Resulting names: accessible `Open developer tools`; visible `Open`.

### 3.2 `app/admin/dev/attention-gallery/page.tsx`

Line 54: `<h1 …>Attention modal gallery</h1>` → `<h1 …>Attention gallery</h1>`.
Classes, structure, and the following description paragraph are unchanged. The
paragraph does not repeat the heading string, so no cascade.

### 3.3 What else the change adds

**No new design token, no new component, no new route, no new prop, and no
`data-testid` added or removed.** Two new files ARE created, both listed in the
§1.0 inventory (R3 F4 corrected an earlier "no new file" claim that contradicted
§8):

1. This change's own `closeout.md` under
   `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/`, carrying the
   invariant-8 evidence (§8).
2. tests/docs/_metaDeferralLedgerGraduation.test.ts — the ledger-graduation
   guard described in §9 T8. It exists because R2 F1 and R3 F1 both landed on
   the same vector: a ledger/doc task with no genuine red state. Per the
   structural-defense rule, the second occurrence ships the defense rather than
   another prose patch.

All edits to EXISTING tests land in the single file
`tests/components/admin/settings/DevToolsRow.test.tsx` (§9).
`tests/components/admin/settings/DevToolsRow.absent.test.tsx` is NOT touched —
it asserts an empty DOM and has no text assertions to update.

### 3.4 Dimensional Invariants

**None are introduced, and none are changed.** Enumerated in full so the
absence is a verified claim rather than an omission:

| Parent | Child | Dimension relationship | Guarantee |
| --- | --- | --- | --- |
| Row root (`components/admin/settings/DevToolsRow.tsx:37`, `flex flex-wrap items-center justify-between gap-3 p-4`) | heading block, action group | **None — content-sized.** The root sets no height or width; both children size to content and wrap. | No class required; nothing in this diff adds a dimension. |
| Action group (`components/admin/settings/DevToolsRow.tsx:52`, `flex flex-wrap items-center gap-2`) | both `<Link>` elements | **None — content-sized**, `items-center` (not `items-stretch`), so each link keeps its own `min-h-tap-min` height rather than inheriting the row's. | `min-h-tap-min` on `devLinkClass` guarantees the 44px tap target independently of the parent; unchanged by this diff. |
| `Open` link | new `sr-only` span | **Zero contribution.** `sr-only` removes the span from layout (`position:absolute`, 1px clip), so the link's box is identical before and after. | Tailwind's built-in `sr-only` utility. |

Tailwind v4 does not default `.flex` to `align-items: stretch` in this project,
which is exactly why the action group's explicit `items-center` matters — but
no parent here has a fixed dimension for a child to match, so the mandatory
real-browser `getBoundingClientRect` parity task does not apply (§10).

## 4. Accessible-name contract

| Element | Visible text | Accessible name | Rationale |
| --- | --- | --- | --- |
| `admin-dev-tools-open` | `Open` | `Open developer tools` | WCAG 2.4.4 in an out-of-context link list. WCAG 2.5.3 label-in-name holds: the visible string `Open` is a prefix of the accessible name, so voice control on "Open" still matches. |
| `admin-dev-tools-gallery` | `Attention gallery` | `Attention gallery` | Unchanged; already self-describing. |
| destination `<h1>` | `Attention gallery` | `Attention gallery` | Now byte-identical to the link that reached it, so arrival confirmation is unambiguous. |

No `aria-label` is used anywhere here: an `aria-label` would replace rather
than extend the visible text, putting label-in-name at risk on any future copy
edit of the visible string.

## 5. Transition inventory

`devLinkClass` gains an animated property, so every state pair is enumerated.
States: **rest**, **hover**, **focus-visible**, **hover+focus-visible**.

| Pair | Treatment |
| --- | --- |
| rest ↔ hover | `background-color` eases over `duration-fast` (`transition-colors`). This is the change. |
| rest ↔ focus-visible | **Instant — no animation needed.** The focus ring is `box-shadow`/`ring`, which `transition-colors` does not animate; an animated focus indicator would blur the very affordance that must appear immediately. Matches the sibling at `DriveConnectionPanel.tsx:244`. |
| hover ↔ focus-visible | Background eases (as rest ↔ hover); ring appears/disappears instantly. |
| rest ↔ hover+focus-visible | Compound: background eases, ring instant. No ordering dependency — the two properties are independent. |
| hover ↔ hover+focus-visible | Background already settled; ring instant. |
| focus-visible ↔ hover+focus-visible | Ring already present and unchanged; background eases. |
| any → navigating away | Not a visual state of this component; the link unmounts with the page. |

**Structural states (R1 F1).** The component also has two pre-existing
conditional-render branches. Neither is added or modified by this diff, but
once a transition inventory exists it must enumerate every conditional block,
so they are listed here rather than left undocumented:

| Structural pair | Treatment |
| --- | --- |
| not-rendered ↔ rendered (`if (!DEV_PANEL_PRESENT \|\| !isDeveloper) return null;`, `components/admin/settings/DevToolsRow.tsx:33`) | **Instant — no animation needed, and none is reachable.** `DEV_PANEL_PRESENT` is a build-time constant and `isDeveloper` is resolved server-side per request (`app/admin/settings/page.tsx:221`); neither can flip inside a mounted client session, so this pair never occurs as a transition. There is deliberately no `AnimatePresence` and no exit animation. |
| icon absent ↔ icon present (`icon ? … : null`, `components/admin/settings/DevToolsRow.tsx:40-44`) | **Instant — no animation needed, and none is reachable.** `icon` is a server-passed prop, constant for the life of the mount. |
| structural change while an interaction state is active (compound) | **Not reachable.** Both structural pairs require a server round-trip that produces a new element, so no interaction state survives the change; the new node starts from its own initial computed style with no stale mid-transition value. If either branch ever becomes client-toggleable, this row is the one that must be revisited. |

`duration-fast` is an existing DESIGN.md token already used by every sibling
settings control; no new token, no `prefers-reduced-motion` exception needed
(a sub-200ms color fade is not vestibular motion, and the app's existing
reduced-motion handling is unchanged).

## 6. Guard conditions

| Input | Value | Rendered result |
| --- | --- | --- |
| `DEV_PANEL_PRESENT` | `false` (committed default) | `null` — nothing renders; no copy is reachable. Unchanged. |
| `isDeveloper` | `false` | `null`. Unchanged. |
| `isDeveloper` | absent/`undefined` | `null` (safe default). Unchanged. |
| `icon` | `undefined` (absent) | Icon span omitted; heading block still renders, copy unaffected. Unchanged. |
| `icon` | any FALSY `ReactNode` — `null`, `false`, `""`, `0`, `NaN` | Icon span omitted. The branch is `icon ? … : null`, a truthiness test, so `0` and `NaN` are treated as "no icon" even though React would otherwise render them as the text `0` / `NaN`. **Pre-existing behavior, unchanged by this diff, and desirable here** — the wrapper span is decorative chrome, and a bare `0` inside it would be a defect, not content (R3 F3). |
| `icon` | any truthy `ReactNode` | Rendered inside an `aria-hidden` wrapper at `size-5`. Unchanged. The sole live caller passes a fixed `<ShieldCheck aria-hidden />` element (`app/admin/settings/page.tsx:221`). |
| `isDeveloper` | `null`, `0`, `""`, `NaN` (not type-valid, but reachable from untyped callers) | Falsy → the early return fires → `null`. The gate is `!isDeveloper`, a truthiness test, so it fails closed on every FALSY value — but **not** on truthy non-booleans: `1`, `"false"`, `{}` and `[]` would all pass it and render the row (R4 F4). The prop is typed `boolean`, and the sole live caller passes a real boolean from `isCurrentUserDeveloper()` (`app/admin/settings/page.tsx:100`), so no such value is reachable today; the row states the actual behavior rather than an aspirational "any non-`true` value is hidden". Unchanged by this diff. |

No prop carries user data — every string in this component is a literal — but
the falsy-`ReactNode` rows above are enumerated anyway rather than dismissed on
that basis (R3 F3): `icon` is typed `ReactNode`, so `0`, `NaN`, `""`, `false`
and `null` are all type-valid inputs with a rendered behavior worth stating.

## 7. Explicitly out of scope

- **The `focus-visible:ring-offset-*` half of finding 3.** The `DEFERRED.md`
  entry already corrected the fix shape on 2026-07-24: `DESIGN.md:40` bans a bare
  `focus-visible:ring-offset-2` (an offset MUST carry a container-matched
  `ring-offset-<backdrop>`), so adding the sibling's bare offset here would
  introduce a dark-mode white gap — a defect, not parity. The ~90 pre-existing
  bare offsets app-wide, including the two siblings at
  `components/admin/settings/DriveConnectionPanel.tsx:244` and
  `components/admin/settings/DriveConnectionPanel.tsx:277`, are owned by
  `BL-FOCUS-RING-CONTRAST` in `BACKLOG.md`,
  which must first decide the per-backdrop offset colors. Reconciling 2 of ~90
  here would be an arbitrary slice of that sweep.
- **Any change to the `Attention gallery` link label** (ratified 2026-07-21).
- **A link on the `/admin/dev` index page** (out of scope in 2026-07-21 §1.1;
  still out of scope).
- **The row heading `Developer tools`** — unchanged; finding 1 is closed by the
  hidden qualifier, which reuses that exact wording.

## 8. Doc + ledger updates (land in the same PR)

1. `docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md` — add
   a dated amendment note under §1.1's "Row copy unchanged" bullet recording
   that the freeze is superseded by this spec, with the new description string
   inline.
2. `DEFERRED.md` — remove the `SETTINGS-DEVROW-GALLERY-RESIDUE-1` entry.
3. `DEFERRED-archive.md` — land the full entry with a graduation note: date,
   **branch name**, which finding each change closed, and the explicit record
   that finding 3 closed on its transition half only, with the offset half
   tracked by `BL-FOCUS-RING-CONTRAST`. The note cites the BRANCH permanently, never a PR
   number (R2 F3, R3 F2, R4 F2): the ledger update happens before the branch is
   pushed, and backfilling a number afterwards would mean the merged diff is
   not the diff the cross-model review approved. No task edits this entry after
   Task 5. Anyone needing the PR finds it from the merge commit for that branch.
4. `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md`
   — annotate the three deferred dispositions (that file's lines 49, 50 and 52) as closed
   by this change so a future reader of that table is not sent to a
   `DEFERRED.md` entry that no longer exists.

**Separately from those four**, this change writes its own `closeout.md` under
`docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/`, whose §12 carries the invariant-8 impeccable findings and dispositions. That is
a NEW artifact belonging to this change, not an update to an existing ledger,
which is why the "four doc/ledger updates" count excludes it (R2 F7). The
invariant-8 evidence goes in THAT file — never in the 2026-07-21 closeout,
which records a different change's gate run.

## 9. Test plan (TDD, anti-tautology)

T1-T7 are edits to the existing `tests/components/admin/settings/DevToolsRow.test.tsx`
(jsdom). T8 is a NEW file, tests/docs/_metaDeferralLedgerGraduation.test.ts
(R4 F5 corrected an earlier "all edits are to one file" claim). Every assertion
below names the failure mode it catches.

**T1 — accessible-name boundary on the `Open` link.**
`expect(open).toHaveAccessibleName("Open developer tools")` — an exact-match
accessible name, not a substring. _Catches:_ the whitespace-trim defect
(`Opendeveloper tools`) that a `toContain`/substring assertion cannot see.

**T1b — the name comes from a hidden text node, not from `aria-label`
(R2 F6).** T1 alone is satisfied by `<Link aria-label="Open developer tools">`,
which has the right name but no hidden qualifier and violates §4's explicit
no-`aria-label` decision — so the ratified mechanism could regress while every
other assertion stayed green. Assert all three: the link has no `aria-label`
and no `aria-labelledby` attribute, and it contains exactly one `.sr-only`
descendant whose `textContent` is `developer tools`. _Catches:_ silently
swapping the hidden span for an `aria-label`, which would put WCAG 2.5.3
label-in-name at risk on the next visible-copy edit.

**T2 — the visible label is still exactly `Open`.** Clone the link node, remove
every `.sr-only` descendant from the clone, assert
`clone.textContent?.trim() === "Open"`. _Catches:_ closing finding 1 by
visibly renaming the button (a rejected option), which T1 alone would pass.
The clone-and-strip shape is required because `toHaveTextContent` on the live
node now legitimately includes the hidden suffix.

**T3 — the gallery link is untouched.** Keep the existing
`/^Attention gallery$/` text assertion and the `href` assertion. _Catches:_
collateral edits to the ratified label while touching its sibling.

**T4 — className parity survives.** Keep
`expect(gallery.getAttribute("class")).toBe(open.getAttribute("class"))`, and
extend the membership assertions to include `transition-colors` and
`duration-fast` alongside the existing `min-h-tap-min` / `focus-visible:ring-2`.
_Catches:_ (a) adding the transition to only one link, which would break the
shared-literal invariant; (b) satisfying parity by dropping the tap-target or
focus-ring from both.

**T5 — no bare ring offset sneaks in.** Both halves of the predicate are
scoped to the `focus-visible` variant (R2 F5): collect only class tokens
beginning `focus-visible:ring-offset-`, then fail if any of them ends in a
number while none of them ends in a name. An unscoped predicate has two defects
this shape avoids — `focus-visible:ring-offset-2 hover:ring-offset-bg` would
pass on the unrelated hover token, and a lone `hover:ring-offset-2` would fail
despite being outside the banned configuration. _Catches:_ a future "parity"
pass copying the sibling's bare offset, which `DESIGN.md:40` bans. Vacuous
today by construction; kept so §7's deliberate omission reads as a decision.

**T6 — the row description names the gallery.** Assert the description element
(scoped to the row's heading block, NOT the whole row — the row also contains a
link whose text is `Attention gallery`, so an unscoped `getByText` would pass
even with the old description) has text content exactly
`Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.`
_Catches:_ the tautology where the assertion is satisfied by the sibling
link's label rather than by the paragraph under test.

**T7 — destination heading matches the link label.** Lands in the same file, in
its own `describe`, as a source-level assertion over
`app/admin/dev/attention-gallery/page.tsx`. _Catches:_ the link label and the
destination heading silently drifting apart again — finding 2 recurring.

A source scan is the right shape because the page is an async Server Component
whose first line is `requireDeveloper()`; rendering it in jsdom would mean
mocking the whole auth chain to assert one string. But a naive substring scan
has three failure modes that R1 F3 correctly identified, and the assertion is
specified to avoid all three:

1. **Formatting brittleness.** `>Attention gallery</h1>` breaks the moment
   prettier reflows the heading across lines. Match with a whitespace-tolerant
   regex over the element instead:
   `/<h1[^>]*>\s*([^<]*?)\s*<\/h1>/` , then assert the **captured group** equals
   `Attention gallery`. Assert the regex matched at all before comparing, so a
   structural change to the heading fails loudly rather than passing vacuously.
2. **False positive from an unrelated literal.** Because the assertion compares
   the captured heading text rather than searching the whole file, a comment or
   unrelated string containing the phrase cannot satisfy it.
3. **False negative from a stale mention in a comment.** The blanket
   `not.toContain("Attention modal gallery")` would fail on a comment that
   legitimately narrates the rename. It is therefore **dropped** — asserting
   the captured heading text equals `Attention gallery` already excludes the old
   value from the only place that matters.

**Residual limitation, stated rather than hidden:** the regex takes the FIRST
`<h1>` in the file, so it would read the wrong element if a second `<h1>` were
ever added above it. Acceptable: the page has exactly one `<h1>`
(`app/admin/dev/attention-gallery/page.tsx:54`), and a second one would be an
a11y defect this project would catch separately.

**Path resolution** is `join(process.cwd(), ...)` — under vitest, `cwd` is the
project root, the convention
`tests/cross-cutting/vitest-projects-partition.test.ts` already uses. An earlier
draft specified `new URL(..., import.meta.url)`; that throws
`TypeError: The URL must be of scheme file` under vitest's transform, because
`import.meta.url` is not a `file:` URL there. It was caught at execution by this
step's own rule: confirm the red state fails on the string comparison, not on
the file read. A path typo surfaces as `ENOENT`, which is a false red.

The existing assertions at `tests/components/admin/settings/DevToolsRow.test.tsx:38`
and `tests/components/admin/settings/DevToolsRow.test.tsx:51` (`toHaveTextContent` /
`/^Open$/`) **must be updated in the same task** — `/^Open$/` fails once the
hidden suffix is added, because `toHaveTextContent` normalizes and includes
`sr-only` text. T1+T2 replace them with strictly stronger contracts.

**T8 — ledger-graduation guard (new file, closes the R2 F1 / R3 F1 vector).**
Two consecutive rounds landed on the same defect: the ledger and closeout tasks
had no genuine failing state, only post-hoc checks that were already green.
Rather than patch the prose a third time, this spec ships the structural
defense (tests/docs/_metaDeferralLedgerGraduation.test.ts), which has a real
red state and a durable class guard:

1. **Durable class invariant.** No `### <ID>` deferral heading may appear in
   BOTH the repo-root `DEFERRED.md` and `DEFERRED-archive.md`. A graduation
   that copies without deleting, or a re-opened entry left in the archive, is
   the recurring shape this catches. Verified to hold today: 4 active ids, 130
   archived, zero overlap.
2. **This graduation, specifically.** `SETTINGS-DEVROW-GALLERY-RESIDUE-1` must
   be ABSENT from `DEFERRED.md` and PRESENT in `DEFERRED-archive.md`. **This is
   red before the Task 5 edits** (the id is in the active queue and not in the
   archive), and green after. It is a registry row, so the next graduation adds
   a line rather than a file.
3. **Closeout presence.** A second registry carries the plan directory for this
   change; the test asserts its `closeout.md` exists and that **the body of its
   §12 section specifically** — sliced from the `## 12` heading to the next
   `##` heading, not searched document-wide — names both halves of the
   invariant-8 gate. Searching the whole document would pass on an EMPTY §12
   whenever the words appear in a title, a checklist, or boilerplate elsewhere
   (R4 F3), which is a false-green structural defense.
   **Red at the start of Task 6** (the file does not exist), green after. Task 6
ADDS this assertion; Task 5 deliberately does not, so no task commits a
knowingly-failing assertion and the suite is green at every commit boundary
(R4 F1).

**Runner wiring (R4 F7).** A new `tests/` subdirectory is not automatically in
the fast project: `PARALLEL_TEST_GLOBS` in `vitest.projects.ts` is an explicit
per-directory allowlist, and anything unlisted falls to the serial DB-bound
project. This guard is pure filesystem reads with no DB, so the change adds
`tests/docs/**/*.test.{ts,tsx}` to that allowlist in the same task that creates
the file. `tests/cross-cutting/vitest-projects-partition.test.ts` then asserts
the file is claimed by exactly one project — that meta-test is the proof the
guard is actually discovered, not merely written.

Rows 2 and 3 are what give Tasks 5 and 6 an honest failing-test-first cycle;
row 1 is what makes the file worth keeping after this change ships. The earlier
claim that an archived condition "can never regress" was wrong (R3 F1) — a
later edit can restore the active entry or corrupt the archive record, and row
1 is exactly the assertion that catches it.

**Not covered by unit tests, deliberately:** jsdom applies no CSS, so
`transition-colors duration-fast` is asserted as class membership (T4), not as
computed style. That is the same shape every sibling settings button uses; a
real-browser check would add a Playwright run for one non-layout-affecting
property. No fixed-dimension parent is introduced, so the mandatory
layout-dimensions task does **not** apply (§10).

## 10. Applicability of the mandatory task classes

| Rule | Applies? |
| --- | --- |
| Layout-dimensions task (real-browser `getBoundingClientRect`) | **No.** No fixed-height/width parent is introduced or changed. The row is content-height `flex flex-wrap` with `gap-3`; the action group is `flex flex-wrap gap-2`. Nothing in this diff sets a dimension. |
| Transition-audit task | **Yes, and it is discharged in §5 rather than deferred to a separate plan task (R1 F1).** No `AnimatePresence` and no new conditional block is added — the single new animated property is a CSS `transition-colors` on a persistently-mounted link — but the component does contain two pre-existing conditional-render branches (the null gate and `icon ? … : null`). §5's structural-states table enumerates both, plus the compound case, each with an explicit instant-and-unreachable declaration. The plan carries a step that re-walks every `AnimatePresence`, ternary render, and conditional block in the two touched files against that table; T4 pins the CSS tokens. |
| Meta-test inventory | **One created: tests/docs/_metaDeferralLedgerGraduation.test.ts** (§9 T8) — a registry-style structural guard over the deferral ledgers, shipped as the structural defense for the twice-recurring red-state vector (R2 F1, R3 F1). None of the existing registries is extended: no Supabase call boundary, no `admin_alerts` code, no advisory lock, no new mutation surface, no `§12.4` catalog row, no new admin route/table. T5 remains a local assertion in the component's own test, not a registry. |
| Advisory-lock topology | **N/A** — no `pg_advisory*` in the diff. |
| DB/tier×domain matrix, CHECK/enum matrix, migration parity | **N/A** — no DB surface. |
| Flag lifecycle table | **N/A** — no new flag. `DEV_PANEL_PRESENT` and `isDeveloper` are unchanged and already documented in the 2026-07-21 spec. |
| Empirical spike | **N/A** — no lifecycle, race, optimistic state, or undocumented framework contract. The one non-obvious behavior (accessible-name whitespace trimming) is a known, previously-shipped defect with a documented fix shape, asserted directly by T1. |
| Invariant 8 impeccable dual-gate | **Yes** — `components/` and `app/` (non-API) files are touched. Critique + audit both run before the cross-model review. |
| Invariant 10 mutation-surface telemetry | **N/A** — no route handler, no `"use server"` action. |

## 11. Numeric sweep

Counts are declared ONCE in §1.0 (R3 F4). This section verifies that table
against the body rather than restating figures, and covers the numbers that
live outside it.

**Verified against §1.0:** 4 findings = §1 items 1-4. 3 text changes = §3.1b +
§3.1c + §3.2. 2 source files = the two §3 subsections. 2 utility classes =
`transition-colors` + `duration-fast` in §3.1a. 4 doc/ledger updates = §8 items
1-4, which the Scope line also says. 2 new files = the closeout (§8 trailer)
and the guard (§3.3, §9 T8). 9 test contracts = T1, T1b, T2, T3, T4, T5, T6,
T7, T8 in §9 — 8 of them edited into the existing file and 1 in the new guard.
The earlier "8" excluded T8 on the grounds that it lives elsewhere, which
conflated two independent categories (R4 F6).

**Numbers not in §1.0:**

- **~90** bare ring offsets — quoted from `BL-FOCUS-RING-CONTRAST` in
  `BACKLOG.md`, not independently recounted; §7 and the `DEFERRED.md` entry use
  the same figure.
- **2** sibling offsets in
  `components/admin/settings/DriveConnectionPanel.tsx` (lines 244 and 277) —
  matches the `DEFERRED.md` entry and the §2 citation row.
- **4** interaction states / **6** state pairs in §5 — 4·3/2 = 6 unordered
  pairs, all enumerated, plus one non-state row (navigating away) marked N/A.
  §5's second table adds **3** structural rows (the null gate, the icon branch,
  and their compound), all pre-existing and all declared instant-and-unreachable
  (R1 F1).
- **3** occurrences of the old heading string found by the §2 grep; **1** is
  the `<h1>` this spec edits, **2** are ledger/closeout prose that §8 rewrites.
- **3** JSX forms measured by the §3.1(c) probe; **1** produces the correct
  accessible name.
- **4** active and **130** archived deferral ids at the time §9 T8's durable
  invariant was verified, with **0** overlap.

## 12. Risk

Lowest-risk class in the repo: literal copy and two Tailwind utility classes
(§1.0), on a surface that renders only in a developer build behind two gates. The single
non-obvious failure mode is the accessible-name whitespace trim (§3.1c),
which T1 pins with an exact-match assertion rather than a substring.
