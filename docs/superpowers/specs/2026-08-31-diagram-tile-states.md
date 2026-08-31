# The diagram tile says which of three things happened

Closes `DIAGRAMTILE-FAILURE-STATE-COPY-1` (the repo-root `DEFERRED.md`) and
`DIAGRAMTILE-LIVE-TILE-UNLABELLED-1` (same file), and folds in the impeccable P2 border
restyle the first row names. Effort S-M, product-facing.

`DIAGRAMTILE-OBJECT-COVER-CROPS-1` (same file) is decision-fenced and is NOT in scope here.
§7 states what it would cost if the ruling lands, so folding it in later needs no spec round.

## 1. What is wrong

`DiagramTile` (`components/admin/wizard/step3ReviewSections.tsx:4095`) holds one boolean, `failed`,
and renders one string for the two states that boolean merges:

| State | How it is reached | What Doug should conclude |
| --- | --- | --- |
| **absent** | `useState(!hasPreviewSource)` seeds `failed` true (`components/admin/wizard/step3ReviewSections.tsx:4120`), and the reconcile re-derives it on a source change (`components/admin/wizard/step3ReviewSections.tsx:4149`). No `<img>` ever mounts. | The diagram is not in the snapshot. It will not reach the crew page. |
| **load-failed** | `onError` sets `failed` true after a real request (`components/admin/wizard/step3ReviewSections.tsx:4252`). | The bytes exist. The thumbnail did not render. Publishing is unaffected. |

Both render `Preview unavailable` (`components/admin/wizard/step3ReviewSections.tsx:4159`). That phrase describes the COMPONENT's problem, so an
absent diagram reads like a present-but-slow one, on the grid Doug uses to confirm diagrams made it
into a show before he publishes it. He can publish believing a diagram is there.

Two more defects on the same component, both from the same impeccable pass:

- **The live tile is anonymous.** The failed branch renders the diagram's name (`components/admin/wizard/step3ReviewSections.tsx:4175`); the live
  branch renders none. The tile that WORKED cannot be identified by sight, and the tile that BROKE
  can. It is not an accessibility defect: the anchor's `aria-label` carries the name (`components/admin/wizard/step3ReviewSections.tsx:4199-4201`).
- **The placeholder's edge is the faintest thing on screen.** The placeholder box paints
  `border-border` (`components/admin/wizard/step3ReviewSections.tsx:4156`) while the live box paints
  `border-text-faint` (`components/admin/wizard/step3ReviewSections.tsx:4237`). Both boxes are
  filled `bg-surface-sunken`, so that is the ground the pins are read against: `DESIGN.md:191`
  measures `--color-border` as an outline on the four neutral grounds at 1.22-1.27:1 light and
  1.19-1.38:1 dark, and `DESIGN.md:184` measures `--color-text-faint` on `--color-surface-sunken`
  at 3.02:1 light and 4.11:1 dark. The state that most needs to be noticed has the edge that cannot
  be seen. (`DESIGN.md` §1.2a's 3.16:1 / 4.22:1 figures are the same token against `--color-bg` and
  are the WRONG ground for this element; the row body's 3.02:1 is the right one.)

### 1.1 Resolved scope — do not relitigate

- **The two copy strings are RATIFIED and are typed verbatim.** Eric ratified the meaning by mockup
  on 2026-08-28 (Option A, consequence-stating); bl-orch conformed the punctuation to the
  `DESIGN.md` §9 em-dash ban the same day. Both are recorded in that row's body.
  A reviewer proposing different strings, different punctuation, or a different tone assignment is
  declined by citation. **A guard carve-out for em dashes was considered and DECLINED** in the same
  ruling: weakening `tests/styles/_metaEmDashCopy.test.ts` to admit copy is the wrong direction.
- **The apostrophes are straight (`'`), because the ratified strings are.** This file also holds
  curly ones (`components/admin/wizard/step3ReviewSections.tsx:3616`, `components/admin/wizard/step3ReviewSections.tsx:4611`), so the corpus is mixed and no guard decides it; straight-apostrophe
  copy already ships at `components/admin/DataQualityWarningControls.tsx:120-121` and
  `components/admin/BellPanel.tsx:938`. Verbatim beats consistency here because verbatim is the
  ruling.
- **`object-cover` is NOT changed.** It is `DIAGRAMTILE-OBJECT-COVER-CROPS-1`, it is Eric's call,
  and it also implies the crew gallery (`components/diagrams/Gallery.tsx:757`) by that row's own
  consistency argument. See §7.
- **The anchor's `aria-label` is not touched.** It is the tile's sole accessible name, ratified by
  `docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` §2.4, and the image's empty `alt`
  (`components/admin/wizard/step3ReviewSections.tsx:4242`) exists so the name is not heard twice.
- **The chrome stays on the box, not on the image.** Ratified 2026-08-28
  (`docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md`) and pinned in a real
  browser at `tests/e2e/step3-review-modal.layout.spec.ts:595`.
- **A warning HUE for the absent state was considered and declined.** `--color-warning-text` is
  pinned only against `--color-warning-bg` (`DESIGN.md` §1.2, the `warning-bg` rows at :175-178).
  Painting it on a neutral ground would owe a new contrast row plus a meta-test, which a copy split
  should not spend. The absent state is distinguished by glyph shape and by its sentence, which is
  what `DESIGN.md` §1's colour-blind floor asks for anyway.
- **No new ledger row is filed by this arc, of any facing.** Peers this arc does not repair are
  listed in §6 and go to bl-orch, per the 2026-08-31 batch rule.

## 2. The measurement that decides the layout

The ratified strings are 44 and 54 characters. The current copy is 19. Before designing anything I
measured all of them in a real browser, in the shipped face (`public/fonts/InterVariable-latin.d5549562.woff2`)
at `--text-xs` (`DESIGN.md` §2.2: 0.75rem / 1.4), at the four tile widths
`diagramTileWidthAt` produces (`components/admin/wizard/diagramTileGeometry.ts:51`).
Probes: `docs/superpowers/specs/probes/2026-08-31-diagram-tile-copy-fit-probe.mjs`, `docs/superpowers/specs/probes/2026-08-31-diagram-tile-layout-probe.mjs`.

| Viewport | Tile width | 4:3 box height | `Not captured. …` | `Preview couldn't load. …` |
| --- | --- | --- | --- | --- |
| 320px | 74.0px | 55.5px | 6 lines, needs 120.8px — **overflows by 65.3** | 6 lines, needs 120.8px — **overflows by 65.3** |
| 390px | 97.3px | 73.0px | 4 lines, needs 87.2px — **overflows by 14.2** | 4 lines, needs 87.2px — **overflows by 14.2** |
| 640px | 121.5px | 91.1px | 3 lines, needs 70.4px — fits | 3 lines, needs 70.4px — fits |
| 1072px | 169.5px | 127.1px | 2 lines, needs 53.6px — fits | 2 lines, needs 53.6px — fits |

"Needs" is the icon (16px) plus the `gap-1` (4px) plus the laid-out text.

**The ratified copy cannot live inside the 4:3 box below 640px.** That is not a preference; the box
height is derived from the tile width and the tile width is derived from the modal's own geometry.

It fits at 640px and above, and the design in §3 moves it out anyway. One arrangement, not a
breakpoint-conditional one: a layout that reorganises itself at 640px would need every assertion in
§5 written twice, and the 320px case would still be the one nobody had looked at.

The same probe found a defect nobody had measured: **today's placeholder already clips itself at
320px.** Icon plus `Preview unavailable` plus the truncated name is 66px of content in a 55.5px box,
so `overflow-hidden` (`components/admin/wizard/step3ReviewSections.tsx:4156`) cuts 10.5px off the name the previous arc added precisely so the
reviewer could tell which sheet tab was missing.

## 3. The design

**The text leaves the box.** Each tile becomes a wrapper holding the 4:3 box and a caption beneath
it. The box keeps its exact geometry and its `data-testid`; the caption is a sibling, outside the
box, free to be as tall as its content.

```
<span class="flex flex-col gap-1">        ← wrapper, the grid item, NO data-testid
  <a|span data-testid={testId} …>         ← the box: aspect-4/3, chrome, image or icon
  <span class="text-xs …truncate">        ← the NAME line, every state, same position
  <span class="text-xs/relaxed …">        ← the MESSAGE, failed states only
</span>
```

Why the name line comes first and is present in every state: that position is the scanning fix. A
reader running down the grid finds every tile's name at the same offset, and a failed tile's
explanation hangs below rather than displacing it.

### 3.1 What each state renders

| Element | absent | load-failed | live |
| --- | --- | --- | --- |
| Box element | `<span>` | `<span>` | `<a>` |
| Box chrome | `rounded-md border border-text-faint bg-surface-sunken` | same | same (unchanged, `components/admin/wizard/step3ReviewSections.tsx:4237`) |
| Inside the box | `TriangleAlert`, `size-4 text-text-subtle`, `aria-hidden` | `ImageOff`, `size-4 text-text-subtle`, `aria-hidden` | `<Image>` (unchanged) |
| Name line | shown, announced | shown, announced | shown, `aria-hidden="true"` |
| Message | `Not captured. Won't appear on the crew page.` | `Preview couldn't load. The diagram will still publish.` | none |

- **Glyph, not colour, carries the state.** `TriangleAlert` is this app's notice glyph
  (`DESIGN.md` §16; `components/admin/IgnoredSheetsDisclosure.tsx:93`,
  `components/admin/BellPanel.tsx:62`).
  `ImageOff` keeps the literal meaning it already has at
  `components/admin/wizard/step3ReviewSections.tsx:4158`: a request happened and the image did not
  render. Both glyphs stay `text-text-subtle`, per §1.1.
- **The name line is `aria-hidden` only in the live state**, because only there does an anchor
  already carry the name (`components/admin/wizard/step3ReviewSections.tsx:4199-4201`). In the two failed states there is no anchor, so the caption
  is the only accessible text and must stay announced. This is the same argument that emptied the
  image's `alt` (`components/admin/wizard/step3ReviewSections.tsx:4242`).
- **The message uses `text-xs/relaxed`** — the repo's class for copy that wraps (34 uses, e.g.
  `components/diagrams/GalleryLightbox.tsx:1568`). The name line uses plain `text-xs`; it is one
  truncated line and never wraps.
- **The placeholder's border becomes `border-text-faint`**, matching the live box: 1.22-1.27:1 light
  becomes 3.02:1 light, over the 3:1 non-text floor. This is the P2 restyle the
  `DIAGRAMTILE-FAILURE-STATE-COPY-1` row folds in, and `DESIGN.md` §1.2a is the rule: a box filled
  with one of the four neutral grounds carries no visual weight of its own, so its stroke IS its
  boundary and takes the text ramp. No NEW token pairing is introduced, so no new contrast row is
  owed: the pair is already pinned at `DESIGN.md:184`.

### 3.2 Guard conditions, per prop

| Prop | null / empty / blank | What renders |
| --- | --- | --- |
| `alt` | `""` or whitespace after `stripNewTabSuffix` | **No name line at all**, in every state — the existing behaviour at `components/admin/wizard/step3ReviewSections.tsx:4174-4177`, preserved. The anchor's `aria-label` falls back to `Staged diagram (opens in a new tab)` (`components/admin/wizard/step3ReviewSections.tsx:4200`). The message still renders in the failed states. |
| `hasPreviewSource` | `false` | `absent`. No `<img>` mounts, so `onError` cannot fire. |
| `href`, `sourceKey` | `""` | Not special-cased. They are compared by identity in the reconcile (`components/admin/wizard/step3ReviewSections.tsx:4143-4147`); an empty-to-empty change is not a change and re-derives nothing. |
| `onFailure`, `anchorRef` | omitted | Optional today (`components/admin/wizard/step3ReviewSections.tsx:4113-4118`) and still optional. |
| `testId` | — | Always on the BOX, never on the wrapper or caption. Non-negotiable: see §4. |

### 3.3 Dimensional invariants

Tailwind v4 does not default `.flex` to `align-items: stretch`, and grid items DO stretch, so every
relationship here is stated rather than assumed. All are verified in a real browser (§5, Task 6),
never in jsdom.

| Parent | Child | Relationship | What guarantees it |
| --- | --- | --- | --- |
| grid cell | wrapper | wrapper fills the cell's width | `flex flex-col` on a block-level wrapper; width is the cell's |
| wrapper | box | box width == wrapper width | `w-full` on the box (unchanged) |
| wrapper | box | box height == box width × 3/4, **exactly**, at every viewport | `aspect-4/3` on the box; the box is a column-flex item with no `flex-grow`, so a taller wrapper does not stretch it |
| grid row | wrapper | a tall failed wrapper does not stretch a live SIBLING's box | same: the sibling's wrapper stretches, its box does not |
| live box | placeholder box | equal width AND equal height in the same grid | both `aspect-4/3 w-full`; pinned at `tests/e2e/step3-review-modal.layout.spec.ts:682-700` |

The fourth row is the one this design exists to protect. Growing the BOX for the failed states would
have broken the fifth, which is a ratified contract.

### 3.4 Measured cost of the design

Same probes, name line first, message at `text-xs/relaxed`:

| Viewport | live cell | absent cell | load-failed cell |
| --- | --- | --- | --- |
| 320px | 76.3px | 197.3px | 177.8px |
| 390px | 93.8px | 156.3px | 175.8px |
| 640px | 111.9px | 174.4px | 174.4px |
| 1072px | 147.9px | 190.9px | 190.9px |

At 1072px, where this modal is actually worked in, a failed cell is 43px taller than a live one. At
320px it is 2.6x taller and the message wraps to six lines. That is ugly, and it is the honest
trade: the alternative is clipping a sentence whose entire purpose is to be read. **A 2-column mobile grid would fix the wrap** (tile 115px at 320px, message 3 lines) and is
deliberately NOT taken here: it moves `DIAGRAM_TILE_SIZES` and `diagramTileWidthAt`
(`components/admin/wizard/diagramTileGeometry.ts:33` and `components/admin/wizard/diagramTileGeometry.ts:51`), re-tiers the srcset oracle at
`tests/e2e/published-review-modal.layout.spec.ts:2079`, and is a density decision this row did not
buy. It is §6's first peer.

## 4. The three-state value

```ts
type DiagramTileState = "live" | "absent" | "load-failed";
```

| Today | Becomes |
| --- | --- |
| `const [failed, setFailed] = useState(!hasPreviewSource)` (`components/admin/wizard/step3ReviewSections.tsx:4120`) | `useState<DiagramTileState>(hasPreviewSource ? "live" : "absent")` |
| `setFailed(!hasPreviewSource)` in the reconcile (`components/admin/wizard/step3ReviewSections.tsx:4149`) | `setState(hasPreviewSource ? "live" : "absent")` |
| `setFailed(true)` in `onError` (`components/admin/wizard/step3ReviewSections.tsx:4252`) | `setState("load-failed")` |
| `if (failed)` (`components/admin/wizard/step3ReviewSections.tsx:4152`) | `if (state !== "live")` |

The reconcile's comparison key is unchanged: `lastSource` on `{hasPreviewSource, href, sourceKey}`
(`components/admin/wizard/step3ReviewSections.tsx:4142-4148`), deliberately not the loader, which is a fresh closure every render.

**The reconcile RE-DERIVES rather than clears.** A tile that reached `load-failed` and is then handed
a new source goes to `live`, not to "still failed" — that is the existing trapdoor fix
(`components/admin/wizard/step3ReviewSections.tsx:4124-4140`) and the three-state form preserves it exactly.

### 4.1 Transition inventory

Three states, so three unordered pairs and six ordered transitions. Every one is INSTANT: this
component carries no animation, and two suites pin that
(`tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:236-247`,
`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:900-904`).

| From | To | Trigger | Treatment |
| --- | --- | --- | --- |
| live | load-failed | `onError` (`components/admin/wizard/step3ReviewSections.tsx:4252`) | instant — the `<a>` is replaced by a `<span>`; no animation |
| live | absent | reconcile, `hasPreviewSource` goes false | instant |
| absent | live | reconcile, `hasPreviewSource` goes true | instant |
| load-failed | live | reconcile, new `href`/`sourceKey` | instant |
| load-failed | absent | reconcile, `hasPreviewSource` goes false | instant |
| absent | load-failed | **UNREACHABLE directly.** No `<img>` mounts in `absent`, so `onError` cannot fire. Reachable only as absent → live → load-failed, which is two transitions above. | n/a — asserted unreachable, not asserted instant |

Compound transitions:

| Compound | Behaviour |
| --- | --- |
| A state flip while the tile's `title` tooltip is open | The browser owns the tooltip; the element is replaced, the tooltip closes. No component state. |
| `live → load-failed` while the anchor HOLDS focus | Existing, unchanged: `onFailure` hands the grid the anchor BEFORE the flip (`components/admin/wizard/step3ReviewSections.tsx:4245-4253`), and `handleTileFailure` moves focus forward, then backward, then to the grid (`components/admin/wizard/step3ReviewSections.tsx:4336-4348`). Ordering is load-bearing and this arc does not touch it. |
| `live → absent` while the anchor holds focus | Focus is LOST to `<body>` — the reconcile path never calls `onFailure`. Pre-existing, not repaired here, §6 peer 2. |
| A flip while another tile in the same row is mid-flip | No shared state; each tile owns its own. Row height re-solves once, in the same frame. |

## 5. What proves it

Every existing assertion on `Preview unavailable` moves with the split. Census, run at spec time:

```
$ rg -l "Preview unavailable" tests components
components/admin/wizard/step3ReviewSections.tsx
tests/components/admin/wizard/step3DiagramTile.published.test.tsx
tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx
tests/components/admin/wizard/step3DiagramTile.staged.test.tsx
tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx
tests/components/admin/wizard/step3ReviewSections.test.tsx
```

| File | Sites | What each becomes |
| --- | --- | --- |
| `tests/components/admin/wizard/step3DiagramTile.published.test.tsx` | `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:210`, `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:226` `getByText`; `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:275` `queryByText(…)).toBeNull()` | `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:210` and `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:226` are null-contentUrl and null-fingerprint stubs — both `absent`. `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:275` is the live-branch negative and asserts BOTH strings absent. |
| `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx` | `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:84`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:118`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:157` negative; `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:95`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:181` positive | The positives are the discriminating cases: `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:95` and `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:181` must now assert WHICH failure, not that one occurred. |
| `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` | `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:176`, `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:221`, `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:233`, `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:254` `getByText`; `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:190` inside `premiseHolds` | All `absent`. `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:190`'s premise moves with it or the premise is vacuous. |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:903` `toContain` | `onError`, so `load-failed`. `toContain` would survive the split silently — it is tightened to the exact string, or the case proves nothing. |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx` | `tests/components/admin/wizard/step3ReviewSections.test.tsx:815`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:843` `getByText`; `tests/components/admin/wizard/step3ReviewSections.test.tsx:841` negative | Section-level; `absent`. |

Also moving: `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:157` and `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:186-192`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:219-225` assert the
placeholder's chrome and today do NOT pin `border-border` — the restyle needs a POSITIVE pin on
`border-text-faint` added, or the P2 is unguarded.

New coverage this spec owes, each stating the failure mode it catches:

1. **`absent` renders the absent sentence and NOT the load-failed one, and the reverse.** Catches a
   split that threads the state but renders one string for both, which is today's defect wearing a
   new type.
2. **A tile that reaches `load-failed` via `onError` renders the load-failed sentence** — reached by
   a real error event on a mounted image, not by seeding. Catches a seed-only implementation.
3. **The live tile renders its name, visibly, and the name is `aria-hidden`.** Catches row 2 shipped
   as an `aria-label` change (which would be a no-op — the label is already correct) and catches the
   duplicate-announcement regression.
4. **Both failed states render the name, NOT `aria-hidden`.** Catches an `aria-hidden` applied
   unconditionally.
5. **The transition matrix of §4.1, all six ordered transitions**, driven through a stable React key
   so a remount cannot be mistaken for a re-derivation. Catches a reconcile that clears to `live`
   unconditionally, and pins `absent → load-failed` unreachable.
6. **Real-browser layout (Playwright, not jsdom):** every row of §3.3 by `getBoundingClientRect()`
   within 0.5px, at 320 / 390 / 640 / 1072, with one failed tile beside a live tile so the
   non-stretch invariant is actually exercised. Catches the stretch defect Tailwind v4 makes easy.
7. **The placeholder box carries `border-text-faint` and not `border-border`.** Catches the P2 being
   dropped in a later repair round.
8. **`data-testid` is on the box, not the wrapper**, and the prefix count is still
   `DIAGRAM_TILE_CAP`. Catches the wrapper being given a derived testid, which the existing comment
   at `components/admin/wizard/step3ReviewSections.tsx:4166-4172` records as having read 24 tiles where 12 was correct.

**Anti-tautology.** Assertions scope to the tile's own subtree and, for a string that could be
rendered by a sibling, clone and strip siblings first. Expected widths derive from
`diagramTileWidthAt`, never hardcoded. Every string-presence assertion gets the four pre-dispatch
mutants (value emptied; expected plus a suffix; present-but-not-live; each discriminating parameter
varied) recorded in its commit.

**Meta-test inventory.** This arc CREATES no structural meta-test and EXTENDS none.
`tests/components/diagrams/perItemStateLifetime.probe.test.ts:27` scans only `Gallery.tsx` and
`GalleryLightbox.tsx`, so renaming `failed` touches nothing there;
`tests/styles/_metaControlOutlineResidue.test.ts` censuses INTERACTIVE elements and the placeholder
`<span>` is not one. Both are re-run as gates, not extended.

**Mutation enrolment.** No file this arc changes is an enrolled `sourcePath` in
`tests/mutation/source/registry.ts`. No surface is scored.

### 5.1 Acceptance criteria

- **AC-1** — A tile seeded `hasPreviewSource: false` renders `Not captured. Won't appear on the crew page.` and does NOT render the load-failed sentence.
- **AC-2** — A tile whose mounted image fires `onError` renders `Preview couldn't load. The diagram will still publish.` and does NOT render the absent sentence.
- **AC-3** — A live tile renders its diagram name as visible text, and that text carries `aria-hidden="true"`.
- **AC-4** — Both failed states render the diagram name as visible text WITHOUT `aria-hidden`.
- **AC-5** — With `alt` empty or whitespace, no name line renders in any state, and the anchor's `aria-label` still falls back to `Staged diagram (opens in a new tab)`.
- **AC-6** — All five reachable ordered transitions of §4.1 land on the correct state under a stable React key, and `absent → load-failed` is unreachable directly.
- **AC-7** — Every dimension relationship in §3.3 holds in a real browser within 0.5px at 320, 390, 640 and 1072px, with a failed tile beside a live tile.
- **AC-8** — The placeholder box carries `border-text-faint` and does not carry `border-border`.
- **AC-9** — `data-testid` is on the box element in every state, and the prefix count over a full grid equals `DIAGRAM_TILE_CAP`.
- **AC-10** — No user-visible string this arc adds contains an em dash, and `tests/styles/_metaEmDashCopy.test.ts` is green.

### 5.2 Sections that do not apply

Declared rather than omitted, so a reviewer does not read silence as an oversight.

- **Tier × domain matrix, CHECK/enum migration matrix, DB completeness matrix** — N/A. This arc touches no migration, no RPC, no table, no CHECK. `supabase/` is not in the diff.
- **Flag lifecycle table** — N/A. No boolean config field or toggle is added; `DiagramTileState` is component-local render state with one seed, one reconcile and one event writer, all enumerated in §4.
- **Advisory-lock topology** — N/A. No `pg_advisory*` call is reachable from this component.
- **Build-vs-runtime gate** — N/A. Nothing here is env-gated.
- **Accept-set discipline** — N/A. This arc ships no detector, classifier or recognizer; `DiagramTileState` is a closed three-value union written and read in one file.

## 6. Peers this arc does not repair

Reported to bl-orch. No ledger row is filed.

1. **The 12-tile grid is 3 columns below 640px**, which is what forces a six-line message at 320px
   (§3.4). Fixing it is a density decision plus a geometry-module change; it is not what either row
   bought.
2. **A reconcile to `absent` while the anchor holds focus drops focus to `<body>`.** The
   `onFailure` → `handleTileFailure` path is wired only to `onError` (`components/admin/wizard/step3ReviewSections.tsx:4245-4253`). Repairing it
   means announcing the absent case too, and `handleTileFailure` announces
   `${name} could not be loaded.` (`components/admin/wizard/step3ReviewSections.tsx:4350`), which is the WRONG sentence for a diagram that was never
   captured. That is a copy decision, which is exactly the class of thing this arc is not permitted
   to take.
3. **The crew gallery's terminal failure branch says only `image unavailable`**, and says it
   `sr-only` (`components/diagrams/Gallery.tsx:852`), so a sighted crew member gets a grey box and a
   glyph with no words at all. Whether it ALSO merges an absent state the way this tile does is not
   established here and would need its own read of that component; what is established is that its
   copy is unratified and consequence-free. Splitting or rewording it would take a second product
   decision this arc was not given, and §7 already ties that surface's other open question to Eric's
   pending ruling.

## 7. If the `object-contain` ruling lands

Not in scope. Enumerated so folding it in costs no spec round.

- One production line: `className="object-cover"` → `"object-contain"` at `components/admin/wizard/step3ReviewSections.tsx:4254`. The plate is
  already on the anchor rather than on the image (`components/admin/wizard/step3ReviewSections.tsx:4237`), which is what made this clean; that was
  the obstacle the 2026-08-28 chrome move removed.
- `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:144` asserts
  `img.className.trim()` EQUALS `"object-cover"` and reds. The same file's negative-control literals
  at `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:98-112` embed `object-cover` as data and stop mirroring production unless they move too.
- If the ruling says product-wide, `components/diagrams/Gallery.tsx:757` moves with it. No test
  asserts that class today.
- The `DIAGRAMTILE-OBJECT-COVER-CROPS-1` row cites line 412 of the crew gallery for the class. That
  is STALE: `components/diagrams/Gallery.tsx:412` is `nameOf`, and the class is at
  `components/diagrams/Gallery.tsx:757`. The stale figure is inherited from
  `docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md:9`, which repeats it at
  that document's line 49.
