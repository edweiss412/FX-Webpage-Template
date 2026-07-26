# Section header: inline row at `sm`+ (2026-07-26)

**Status:** spec, awaiting adversarial review.
**Branch:** `feat/section-header-wide-inline`.
**Follow-up to:** `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md` (PR #605). Owner-directed rescope, 2026-07-26.

---

## 1. Why

PR #605 rebuilt `ModalSectionChrome`'s header (`components/admin/wizard/step3ReviewSections.tsx:922`) as a column at **every** width: line one `[icon | centred name+count | corner link]`, line two the status pill. That fixed the phone-width name crush, but the owner reviewed the shipped result on a desktop window and rejected the wide rendering: a flagged section spends a whole second row on one pill floating in empty space. Owner direction (2026-07-26): **keep the stacked layout only where the one-row layout would crush the name; on large screens return to one left-aligned row with the pill at the right.**

Layout selected from a rendered 3-way mockup (owner choice, Option A): name+count left, pill right, icon-only corner sheet glyph last. Mockup: <https://claude.ai/code/artifact/2571459c-a53f-4e8f-8402-a423833930ce>.

### 1.1a Measured header-row content-box widths (this session)

Measured 2026-07-26 in Chromium against the real `/admin?show=<slug>` route (seeded Waldorf show, hydrated published review modal, settled dashboard state), same row-selection and content-box arithmetic as `tests/e2e/admin-layout-dimensions.spec.ts:687-712`. Method recorded in §8 so the plan can reproduce it; the probe spec itself was scratch and is deliberately not committed.

| viewport | header row content box |
| -------- | ---------------------- |
| 560px    | 520px                  |
| 600px    | 560px                  |
| 640px    | **552px** (floor of the `sm`+ band) |
| 700px    | 612px                  |
| 768px    | 680px                  |
| 900px    | 812px (band peak)      |
| 1024px   | 696px                  |
| 1092px   | 744px                  |
| 1280px   | 744px (cap; matches `ROW_WIDTHS[1280]` in `tests/e2e/_sectionHeaderWidths.ts:32`) |

The band is **non-monotonic** (812px at 900px viewport, then 696px at 1024px — the desktop pane structure changes), which is why the fit claim below is made against the measured floor, not an assumed "wider viewport = wider row".

### 1.1b Fit arithmetic at the 552px floor

Ingredient widths measured on the same run (worst case of each): status icon 28px, `gap-2.5` 10px, widest real section name "Sheet warnings" 116.4px, in-group `gap-1.5` 6px, count "(128)"-class ≈ 35px (measured 18.84px for "(1)"; +2 digits ≈ 16px), widest pill "Parsed with judgment" 142.06px, glyph margin `sm:ml-0.5` 2px, sheet glyph 20px:

```
28 + 10 + 116.4 + 6 + 35 + 10 + 142.06 + 2 + 10 + 20 = 379.5px  ≤  552px  (172.5px slack)
```

The inline row fits at every measured `sm`+ width with ≥172.5px of slack. No name wraps; the row is a single 44px line (`min-h-tap-min`, `--spacing-tap-min: 44px`, `app/globals.css:162`).

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratified |
| - | -------- | -------- |
| 1 | **Wide layout is Option A: name+count left, status pill right, icon-only corner glyph last.** Owner-selected 2026-07-26 from a rendered 3-way comparison (A left+glyph / B full old row with text link / C centered+inline pill). The "In sheet" text link does NOT return; the 20px glyph + `before:-inset-3` hit area from #605 stays at every width. | Owner decision, this session; mockup artifact `2571459c`. |
| 2 | **The fork is the `sm` viewport breakpoint (640px, `app/globals.css:238`), not a container query.** Container queries have zero precedent in this repo and a documented failure mode (`contain: inline-size` severs width-from-content on shrink-to-fit flex items). The modal's pane width tracks the viewport below the cap (§1.1a), so the viewport axis is faithful here; the measured 552px floor at the boundary carries 172.5px of slack (§1.1b). | This spec; measurements §1.1a/b. |
| 3 | **430–639px stays stacked even though the inline row would fit there.** The `sm` fork matches the modal shell's own mobile/desktop fork (`components/admin/review/ReviewModalShell.tsx:623` `sm:max-w-5xl`; drag handle `sm:hidden` at `components/admin/review/ReviewModalShell.tsx:644`) and the owner's framing ("phones stacked"). Not an oversight. | Owner framing, this session. |
| 4 | **Below `sm`, the shipped #605 layout is unchanged.** Same DOM, same classes at those widths — the diff only adds `sm:` variants (and the narrow-only scoping of decision 7). All #605 narrow-width measurements and tests remain valid. | This spec §2. |
| 5 | **Supersession:** this spec supersedes the 2026-07-25 spec's §1.1 decisions 2 and 3 (`docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:35-36`) **at `sm`+ only** — the pill returns inline and a flagged section costs 44px, not 72.8px, on one row. Both decisions stand in full below `sm`. Decisions 1, 4, 5, 6, 7 of that spec are untouched (centring below `sm`, glyph form, off-centre spread below `sm`, padding compensation below `sm`, skeleton). | This table; supersession note lands in the old spec §1.1 (§5.3 below). |
| 6 | **Mechanism is a single DOM tree, CSS-only:** the line-1 wrapper and the pill-line wrapper flatten at `sm` (`sm:contents`), making the outer column the row (`sm:flex-row`), with a `sm:order-*` utility placing the glyph last. NO duplicated pill or link DOM (`hidden sm:flex` twins are rejected: duplicated interactive link, duplicated pill text). If real-browser verification shows `display: contents` unsound here, the plan escalates back to the owner rather than silently shipping twins. | This spec §2.1. |
| 7a | **Reading order at `sm`+ diverges from visual order, and that is ratified.** DOM (and therefore assistive/sequential reading) order stays `name, count, sheet link, pill` — identical to the narrow mode and to shipped #605, so the AT experience is consistent across every width and unchanged by this spec. Visual order is `name, count, pill, glyph` via an order utility. The link is the only focusable item, so Tab order is unaffected. (R1 finding 5: acknowledged and accepted, not an oversight.) | This spec §2.1; R1 triage. |
| 7 | **`pr-header-link-slot` compensation becomes narrow-only** (`sm:pr-0`). It exists to center a linkless section's name on the same axis as a linked one; at `sm`+ the name is left-aligned and the axis argument is void. The token itself (`DESIGN.md:201`, `--spacing-header-link-slot`) is unchanged. | This spec §2.2. |

## 2. Layout contract

### 2.1 Structure (one DOM tree, two renderings)

Current structure (`components/admin/wizard/step3ReviewSections.tsx:922-1010`):

```
outer   div  flex w-full flex-col items-stretch gap-1.5        (+ mb-2/mb-3)
line1   div  flex w-full min-h-tap-min items-center gap-2.5
  icon    span (aria-hidden, size-6/7)
  group   div  flex min-w-0 flex-1 items-center justify-center gap-1.5 [pr-header-link-slot when linkless]
    name    h3/h4
    count   span (conditional)
  glyph   a (conditional, size-5)
line2   div  flex w-full justify-center                        (conditional: flagged | judgment)
  pill    span
```

Target: the SAME tree, with responsive classes such that:

- **Below `sm`:** identical rendering to today (decision 4).
- **At `sm`+:** `line1` and `line2` flatten (`sm:contents`); `outer` becomes the flex row (`sm:flex-row sm:items-center sm:gap-2.5 sm:min-h-tap-min`); `group` left-aligns (`sm:justify-start`) and keeps `flex-1 min-w-0`, so it absorbs all slack and pushes the trailing items to the right edge — no pusher element, no `ml-auto` needed with a growable middle; the visual order is `icon, name+count, pill, glyph` (glyph carries `sm:order-1`; the pill needs no order utility — flattened source order already places it after the group). The glyph ALSO carries `sm:ml-0.5`: its `before:-inset-3` hit overlay extends 12px left, and the row's 10px `sm:gap-2.5` alone would let the link's hit area bleed 2px into the pill, silently making the pill's rightmost 2px open the sheet (R1 finding 4). The extra 2px margin makes gap + margin = 12px, so the hit area is exactly tangent to the pill. Tokenized (`ml-0.5` = 2px), not a raw pixel value.

Notes the implementer must not lose:

- `min-h-tap-min` currently lives on `line1`; `display: contents` removes that box from layout, so at `sm`+ the min-height MUST be carried by `outer` (`sm:min-h-tap-min`). Missing this silently drops the 44px row floor.
- `outer`'s `gap-1.5` is the narrow line-to-line gap; the `sm` row needs the row's own `gap-2.5`. In-group name↔count spacing stays `gap-1.5` at every width.
- The pill-line wrapper still emits NO wrapper when there is no pill (both branches conditional today, `components/admin/wizard/step3ReviewSections.tsx:997-1010`); `sm:contents` on it changes nothing about that contract.
- Exactly one `<a>` and one pill span exist in the tree at every width (decision 6). The pill spans keep their tone classes verbatim (amber `components/admin/wizard/step3ReviewSections.tsx:999`, info `components/admin/wizard/step3ReviewSections.tsx:1006`).

### 2.2 Mode boundaries (which element belongs to which mode)

| element | below `sm` | at `sm`+ |
| ------- | ---------- | -------- |
| `outer` | column, `gap-1.5`, `items-stretch` | row, `gap-2.5`, `items-center`, `min-h-tap-min` |
| `line1` wrapper box | flex row, `min-h-tap-min` | **no box** (`display: contents`) |
| `group` | centred (`justify-center`), `pr-header-link-slot` when linkless | left (`justify-start`), `pr-0` always |
| pill-line wrapper box | flex row, `justify-center`, full width | **no box** (`display: contents`) |
| pill span | on its own centred line | inline, right cluster, before the glyph |
| glyph `<a>` | corner of line 1 | rightmost item of the row (order utility + `sm:ml-0.5`) |
| trailing (right-edge) element at `sm`+ | n/a | linked cells: the glyph. Linkless+pilled cells (G6a/G6b flagged/judgment in the harness): the pill. Linkless clean cells (report, Diagrams, empty-dfid, G6a/G6b clean): the name group itself extends to the row edge. |
| icon, name, count | unchanged | unchanged (position aside) |

Shared at both widths: the icon chip tones, heading element/level (h3/h4), count visibility rule (`shouldShowSectionCount`, `components/admin/wizard/step3ReviewSections.tsx:893`), sheet-link href/aria-label/testid (`components/admin/wizard/step3ReviewSections.tsx:977-992`), pill copy and tones.

### 2.3 Guard conditions (all pre-existing, restated because the layout forks)

- `count` null or suppressed → no count span at either width (`components/admin/wizard/step3ReviewSections.tsx:893` and `components/admin/wizard/step3ReviewSections.tsx:956`).
- `sheetHref === null` (Diagrams sub-block, "Report an issue", empty-dfid defensive state) → no `<a>` at either width; narrow keeps the slot padding, wide has none (decision 7).
- `flagged` and `judgment` mutually exclusive (`components/admin/wizard/step3ReviewSections.tsx:885`); neither → no pill element at either width, and no empty wrapper box.
- Sub-block (`headingLevel === 4`) gets the same fork; its smaller sizes (`size-6`, `text-sm`, `mb-2`) are orthogonal.

### 2.4 Dimensional invariants (`sm`+)

| parent → child | relationship | guaranteed by |
| -------------- | ------------ | ------------- |
| `outer` row → all items | single row, vertically centred, row height = 44px for clean AND flagged/judgment | `sm:min-h-tap-min` + `sm:items-center` on `outer`; fit proof §1.1b |
| `outer` row → `group` | absorbs all horizontal slack (name left, trailing cluster right) | `flex-1 min-w-0` on `group` (already present) |
| section parent (`flex-col`) → `outer` | full width | `w-full` on `outer` (already present; Tailwind v4 does not default `.flex` to `align-items: stretch`) |
| name | exactly 1 text line for every real section name at every `sm`+ width | fit proof §1.1b; asserted per cell in §4 |

Below `sm`: the #605 invariants hold unchanged (their spec §3.1, already verified by the shipped suites).

### 2.5 Transition inventory

States: {below-`sm` stacked, `sm`+ inline} × {clean, flagged, judgment} — the second axis is data-static per render (link presence and pill presence follow data, not user interaction; the existing instant-deliberate comment at `components/admin/wizard/step3ReviewSections.tsx:964` stays).

| transition | treatment |
| ---------- | --------- |
| stacked ↔ inline (viewport resize across 640px) | **instant — no animation.** A media-query layout fork; animating would require FLIP machinery for zero product value. |
| clean ↔ flagged ↔ judgment (data changes between renders) | **instant — deliberate**, unchanged from #605 (pill/link presence is server data, not a client state transition). |
| compound (resize while a pill is present) | same instant fork; the pill moves between its two slots with no exit/enter animation. No `AnimatePresence` exists in this header. |

## 3. What does not change

- No copy changes: pill texts, aria-labels, heading texts identical → **no §12.4 catalog work**.
- No DB, no RPC, no telemetry (pure presentational CSS fork on a read-only surface; mutation-surface registry untouched).
- No new tokens; no `DESIGN.md` `@theme` additions. (`DESIGN.md` prose updates: §5.)
- Crew-facing pages, admin dashboard headers, `Step3ReviewModal` card header: untouched.
- The `ShowReviewModalSkeleton` keeps its `flex-1` skeleton bar (2026-07-25 spec §1.1 decision 7).

## 4. Test plan

All geometry in a real browser (Playwright); jsdom asserts only class strings and DOM shape. Anti-tautology: every geometry assertion is conditioned on the cell's asserted identity first (the #605 pattern in `tests/e2e/section-header-layout.layout.spec.ts`), and expected values derive from the shared width fixture, never hardcoded panes.

1. **Width fixture:** `tests/e2e/_sectionHeaderWidths.ts` gains `640 → 552` in `ROW_WIDTHS`; `REAL_ROUTE_WIDTHS` gains `640` so `admin-layout-dimensions.spec.ts:678` pins the measured boundary width against the real route (the two-sided chain that caught the 561-vs-744 estimate error).
2. **Reconciliation of the existing wide-mode assertions (R1 finding 1 — enumerated, not discovered during implementation).** Four existing regions currently assert the STACKED layout at 1280 and/or measure boxes that flatten at `sm`+; a correct implementation leaves them red unless they are retargeted in the SAME task that adds the new assertions:
   - `tests/e2e/section-header-layout.layout.spec.ts:386-443` (cell-shape measurement): the suite already measures BOTH `headerLineHeight` (44px in every state) and `outerHeight` (44px clean / 72.8px pilled). Narrow (320/375/430) expectations are UNCHANGED — including `headerLine` 44px and pilled `outer` 72.8px; do NOT retarget them (R2 finding 1: a verbatim every-width retarget to `outer` would fail correct narrow pilled cells, whose `outer` is legitimately 72.8px). At `sm`+ (640/1280): `headerLine` has no box (`display: contents` — assert `getBoundingClientRect().width === 0` as the positive statement of the flatten), and `outerHeight` is 44px REGARDLESS of pill state. WIDTH measurements (the "row content box") retarget to `outer` at every width, where narrow equality with `headerLine` is exact (both `w-full`, no horizontal padding).
   - `tests/e2e/section-header-layout.layout.spec.ts:476-604` (centring suite, loops 320/375/430/1280): centring is a **below-`sm` contract** now. The 1280 iteration's centring expectations are REPLACED by the left-alignment assertions below; 320/375/430 keep theirs verbatim.
   - `tests/e2e/admin-layout-dimensions.spec.ts:691-712` (width chain row selection): same retarget — measure `outer`'s content box; selection still finds the row via the icon's parent, then measures its parent.
   - `tests/e2e/admin-layout-dimensions.spec.ts:967-983` and `tests/e2e/admin-layout-dimensions.spec.ts:1058-1063` (§5 width-link chain): in that suite's own nomenclature `column = headerLine.parentElement` (`tests/e2e/admin-layout-dimensions.spec.ts:941-945`) — their `column` IS this spec's `outer` (R2 finding 2: an "`outer→column`" replacement link would compare a node with itself). Retarget: at `sm`+ the `headerLine→column` link is DROPPED and replaced by the boxless assertion (`headerLine` width 0); `column`'s own participation in the chain via the header-path walk already guarantees the row width and is unchanged. The `pillLine→column` link is likewise narrow-only; at `sm`+ it is replaced by asserting the pill span itself sits in `column`'s row band (pill vertical centre within ±0.5 of the heading's). The pillLinesMeasured/pillLinesPresent equality keeps its shape, with the `sm`+ variant counting the pill span directly.
3. **15-cell matrix extension** (`section-header-layout.layout.spec.ts` + `_sectionHeaderCellHarness.tsx`; suite currently 69 cases, all green at HEAD): existing 320/375/430 cases keep their stacked expectations verbatim (decision 4 regression guard). New per-cell assertions at 640 and 1280:
   - row (`outer`) height 44px (±0.5) for clean AND pilled cells (the 72.8px expectation moves to narrow-only);
   - name occupies exactly 1 text line (`Range.getClientRects()` on the name's text node, #605 method);
   - pilled cells: pill vertical centre within (±0.5 of) the row centre and pill left edge right of the name group's ink;
   - trailing-edge per cell class (§2.2 table): linked cells end in the glyph (right edge flush ±1 with the row content box); linkless+pilled cells end in the pill (flush ±1); linkless clean cells: the name group's right edge reaches the row content box edge (±1) and computed `padding-right` of `group` is 0;
   - name left-aligned: heading box left edge within icon-width+gap of the row's content-box left edge;
   - **breakpoint boundary pair (R1 finding 3):** one flagged cell rendered at viewport 639 AND 640 with the SAME container width (552px, the measured `sm` floor — synthetic at 639, documented as such): 639 asserts the stacked shape (pill below the row, `headerLine` has a box), 640 asserts the inline shape. Catches any additional incorrectly-scoped responsive utility the class tripwire cannot see;
   - **hit-area tangency (R1 finding 4):** at 640, `document.elementFromPoint` just inside the pill's right edge (1px in, vertical centre) resolves to the pill (or a descendant), NOT the sheet `<a>` — pins the `sm:ml-0.5` compensation behaviorally;
   - **transition-audit width list (R2 finding 3):** the audit at `tests/e2e/section-header-layout.layout.spec.ts:780-803` hardcodes `[320, 375, 430, 1280]` (loop AND the `sweepCell` viewport type) and claims exhaustiveness over every measured width. It gains 640, its viewport type union gains 640, and the pair-count literal in its assertion message is recomputed to match — otherwise a geometry transition scoped to the new band passes while the claim stays stale.
4. **Structural**: exactly one `<a>` (per linked cell) and at most one pill span in the header tree at 375 AND 1280 — pins decision 6 against a future twin-DOM regression.
5. **jsdom class assertions** (existing step3 suites): `outer` carries `sm:flex-row sm:items-center sm:gap-2.5 sm:min-h-tap-min`; wrappers carry `sm:contents`; `group` carries `sm:justify-start` and the linkless branch `sm:pr-0`; glyph carries `sm:order-1 sm:ml-0.5`. Cheap tripwire so a class typo fails before the e2e tier.
6. **Phantom-gap regression:** the flattened wrappers must not introduce a phantom item; `scanForPhantomGaps` coverage on this modal already runs in `admin-layout-dimensions.spec.ts` (its `KNOWN_...` ledger is empty and stays empty).
7. **No new e2e spec file**: extensions land in the two existing specs above (no CI fan-out: both already run in the `mobile-safari`/`desktop-chromium` projects' `layout-dimensions`/`section-header` matchers — `section-header-layout.layout` runs where it runs today; verify with `--list` before relying on it).

RED first for every new assertion (they fail against today's stacked-everywhere rendering at 640/1280), then the class change, then GREEN.

## 5. Documentation updates (same PR)

1. **`DESIGN.md:344-349` (centred section-header pattern):** the pattern statement gains its width qualifier — the column shape is the **below-`sm`** treatment; at `sm`+ the same tree flattens to one left-aligned row with the pill inline right (cite this spec). The "column, not a row" bullet and the `pr-header-link-slot` bullet get "below `sm`" scoping; a new bullet records the `sm:contents` flatten + carried `min-h-tap-min` trap (§2.1 note 1).
2. **`DESIGN.md:352` (verification line):** widths become 320/375/430/640/1280 and the spec pointer gains this file.
3. **Old spec supersession note:** one-line entries on decisions 2 and 3 of `2026-07-25-section-header-rebuild-and-phantom-spacers.md:35-36` — "superseded at `sm`+ by this spec, 2026-07-26 (owner re-decision); stands below `sm`."
4. **`DESIGN.md:201` token table row:** append "(narrow-only as of 2026-07-26: at `sm`+ the name is left-aligned and no compensation applies)".
5. **Live source/test commentary sweep (R1 finding 6; grep-verified this session, hits enumerated):** comments that would become false descriptions of the live contract are updated in the implementation commit: `components/admin/wizard/step3ReviewSections.tsx:908-921` (header comment: describe both modes + the `min-h-tap-min` carry trap), `components/admin/wizard/step3ReviewSections.tsx:936-941` (centred-group comment gains its below-`sm` qualifier), `components/admin/wizard/step3ReviewSections.tsx:994-996` (pill-own-line comment gains its below-`sm` qualifier); `tests/components/admin/showpage/publishedWarningsPanel.test.tsx:235-243` and `tests/components/admin/showpage/publishedWarningsPanel.test.tsx:317` ("two lines" description scoped to narrow); `tests/components/admin/wizard/sectionCountBoundary.test.tsx:80` (and its lines 105, 120: "centred group" wording becomes "name group"). Sweep command: `grep -rn -iE "centred|centered|own.*line|two lines|second line"` over `components/admin/wizard/step3ReviewSections.tsx`, `tests/components/admin/showpage/publishedWarningsPanel.test.tsx`, `tests/components/admin/wizard/`, `tests/e2e/_sectionHeaderCellHarness.tsx` plus the repo-root backlog (R2 finding 5). Live backlog prose updated in the same commit: the repo-root BACKLOG.md line 113 (overlay-bleed item gains a below-`sm` qualifier on the name side; the pill-side bleed is resolved at `sm`+ by `sm:ml-0.5`), line 114 (44px footprint attribution: `headerLine` below `sm`, `outer` at `sm`+), line 116 ("Out of bounds: the centred title" gains "superseded at `sm`+ by the 2026-07-26 spec, owner re-decision; still out of bounds below `sm`"). Historical specs/plans/closeouts stay as point-in-time records.

## 6. Gates

Invariant 8 dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff — UI surface. Then cross-model adversarial review (spec → plan → whole diff), real CI green, merge-commit. TDD per task (invariant 1). No advisory-lock surfaces touched; no migrations.

## 7. Out of scope

Container-query adoption anywhere; any other header (crew pages, dashboard, bell panel); changing pill copy or tones; the 430–639px band's stacked treatment (decision 3); touch-target changes.

## 8. Measurement method (reproduction recipe)

Dev server: worktree, `JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=<e2e constant> pnpm dev -H 127.0.0.1 -p 3000`, local Supabase seeded (`pnpm db:seed`) and dashboard settled (`settleDashboardAdminState()` from `tests/e2e/helpers/dashboardState.ts` — the wizard branch of `app/admin/page.tsx` ignores `?show` and renders no modal; an unsettled `app_settings` row reproduces exactly that trap). Playwright (desktop Chrome device profile) at each viewport: `goto /admin?show=<seeded slug>`, wait for `[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])`, then per header row (structural selection + content-box arithmetic identical to `admin-layout-dimensions.spec.ts:687-712`) record the row content width and the `getBoundingClientRect().width` of heading / count / pill / glyph / icon. One caution from the run: the FIRST sign-in of a fresh admin fixture user bootstraps `app_settings` and clobbers a prior settle — settle after the user exists, or settle via SQL after the first sign-in.
