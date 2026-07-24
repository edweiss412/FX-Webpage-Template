# Settings Developer-tools row: close SETTINGS-DEVROW-GALLERY-RESIDUE-1

**Date:** 2026-07-24
**Status:** Draft (autonomous `/ship-feature` run; owner copy ratification given in-session)
**Scope:** two component/page copy edits, one className token, three doc/ledger updates. No DB, no routes, no new props, no new tokens.

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
span**, deliberately NOT inside the `sr-only` span. The accessible-name
algorithm (`dom-accessibility-api`, which Testing Library and browsers follow)
trims leading/trailing whitespace inside each text node, so the intuitive
`Open<span className="sr-only"> developer tools</span>` yields the accessible
name `Opendeveloper tools`. JSX also strips whitespace-only text between an
expression/element pair on **separate lines**, so the space must be on the same
line as the `<span>` (prettier preserves it there). This exact defect shipped
once before on `View details<span className="sr-only"> for {title}</span>` and
went unnoticed for months because the test matched a substring, never the
boundary — §9 asserts the boundary with an anchored regex.

Resulting names: accessible `Open developer tools`; visible `Open`.

### 3.2 `app/admin/dev/attention-gallery/page.tsx`

Line 54: `<h1 …>Attention modal gallery</h1>` → `<h1 …>Attention gallery</h1>`.
Classes, structure, and the following description paragraph are unchanged. The
paragraph does not repeat the heading string, so no cascade.

### 3.3 Nothing else changes

No new file, no new token, no new test file beyond edits to the two existing
unit tests (§9). No `data-testid` added or removed.

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
| `icon` | absent/`undefined` | Icon span omitted; heading block still renders, copy unaffected. Unchanged. |
| `icon` | provided | Rendered `aria-hidden` at `size-5`. Unchanged. |

No prop accepts user data, so there is no null/empty/NaN/zero content path: all
strings in this component are literals.

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
   PR, which finding each change closed, and the explicit record that finding
   3 closed on its transition half only, with the offset half tracked by
   `BL-FOCUS-RING-CONTRAST`.
4. `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md`
   — annotate the three deferred dispositions (that file's lines 49, 50 and 52) as closed
   by this change so a future reader of that table is not sent to a
   `DEFERRED.md` entry that no longer exists.

## 9. Test plan (TDD, anti-tautology)

All edits are to `tests/components/admin/settings/DevToolsRow.test.tsx`
(jsdom). Every assertion below names the failure mode it catches.

**T1 — accessible-name boundary on the `Open` link.**
`expect(open).toHaveAccessibleName("Open developer tools")` — an exact-match
accessible name, not a substring. _Catches:_ the whitespace-trim defect
(`Opendeveloper tools`) that a `toContain`/substring assertion cannot see, and
a missing/misplaced `sr-only` span.

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

**T5 — no bare ring offset sneaks in.** Assert the class list contains no token
matching `/^(?:[a-z-]+:)*focus-visible:ring-offset-\d/` without a companion
`focus-visible:ring-offset-<name>` token. _Catches:_ a future "parity" pass
copying the sibling's bare offset, which `DESIGN.md:40` bans. This pins §7's
deliberate omission so it reads as a decision, not an oversight.

**T6 — the row description names the gallery.** Assert the description element
(scoped to the row's heading block, NOT the whole row — the row also contains a
link whose text is `Attention gallery`, so an unscoped `getByText` would pass
even with the old description) has text content exactly
`Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.`
_Catches:_ the tautology where the assertion is satisfied by the sibling
link's label rather than by the paragraph under test.

**T7 — destination heading matches the link label.** In
`tests/components/admin/settings/DevToolsRow.test.tsx` this cannot be checked
(different module tree), so it lands as a source-level assertion in the same
file's sibling: read `app/admin/dev/attention-gallery/page.tsx` from disk and
assert it contains `>Attention gallery</h1>` and no longer contains
`Attention modal gallery`. _Catches:_ the two strings silently drifting apart
again, which is precisely finding 2 recurring. A source-scan is the right shape
here because the page is an async Server Component with a `requireDeveloper()`
first line — rendering it in jsdom would require mocking the auth chain to
assert one string.

The existing assertions at `tests/components/admin/settings/DevToolsRow.test.tsx:38`
and `tests/components/admin/settings/DevToolsRow.test.tsx:51` (`toHaveTextContent` /
`/^Open$/`) **must be updated in the same task** — `/^Open$/` fails once the
hidden suffix is added, because `toHaveTextContent` normalizes and includes
`sr-only` text. T1+T2 replace them with strictly stronger contracts.

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
| Transition-audit task | **No `AnimatePresence`, no conditional render, no mount/unmount transition** is added. The single new animated property is a CSS `transition-colors` on a persistent element; §5 enumerates its state pairs and T4 pins the tokens. |
| Meta-test inventory | **None created or extended.** No Supabase call boundary, no `admin_alerts` code, no advisory lock, no new mutation surface, no `§12.4` catalog row, no new admin route/table. T5 is a local assertion in the component's own test, not a registry. |
| Advisory-lock topology | **N/A** — no `pg_advisory*` in the diff. |
| DB/tier×domain matrix, CHECK/enum matrix, migration parity | **N/A** — no DB surface. |
| Flag lifecycle table | **N/A** — no new flag. `DEV_PANEL_PRESENT` and `isDeveloper` are unchanged and already documented in the 2026-07-21 spec. |
| Empirical spike | **N/A** — no lifecycle, race, optimistic state, or undocumented framework contract. The one non-obvious behavior (accessible-name whitespace trimming) is a known, previously-shipped defect with a documented fix shape, asserted directly by T1. |
| Invariant 8 impeccable dual-gate | **Yes** — `components/` and `app/` (non-API) files are touched. Critique + audit both run before the cross-model review. |
| Invariant 10 mutation-surface telemetry | **N/A** — no route handler, no `"use server"` action. |

## 11. Numeric sweep

Every number in this document, cross-checked against the body it describes:

- **4** findings closed — matches the four numbered items in the `DEFERRED.md`
  entry and the four entries in §1.
- **3** edit sites in §3 inside `components/admin/settings/DevToolsRow.tsx`
  (the class literal, the description, the Open link's children) plus **1** in
  `app/admin/dev/attention-gallery/page.tsx` = **2 files** changed in
  §3, consistent with §1's "two component/page copy edits".
- **4** doc/ledger updates in §8 — matches the four numbered items.
- **7** tests T1-T7 in §9 — matches the seven numbered paragraphs.
- **~90** bare ring offsets — quoted from `BL-FOCUS-RING-CONTRAST` in
  `BACKLOG.md`, not independently recounted; §7 and the `DEFERRED.md` entry use
  the same figure.
- **2** sibling offsets in
  `components/admin/settings/DriveConnectionPanel.tsx` (lines 244 and 277) —
  matches the `DEFERRED.md` entry and the §2 citation row.
- **4** button states / **6** state pairs in §5 — 4·3/2 = 6 unordered pairs,
  all enumerated, plus one non-state row (navigating away) marked N/A.
- **3** occurrences of the old heading string found by the §2 grep; **1** is
  the `<h1>` this spec edits, **2** are ledger/closeout prose that §8 rewrites.

## 12. Risk

Lowest-risk class in the repo: literal copy and one Tailwind token, on a
surface that renders only in a developer build behind two gates. The single
non-obvious failure mode is the accessible-name whitespace trim (§3.1c),
which T1 pins with an exact-match assertion rather than a substring.
