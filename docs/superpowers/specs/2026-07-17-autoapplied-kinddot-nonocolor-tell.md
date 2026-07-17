# Auto-applied kind-dot non-color tell (KINDDOT-1) — Spec

**Date:** 2026-07-17
**Deferred entry:** KINDDOT-1 (`DEFERRED.md`, "Auto-applied collapsible groups" surface)
**Surface:** `components/admin/RecentAutoAppliedStrip.tsx` — `KindDotCluster` (collapsed group-header kind hint)
**Type:** UI a11y polish (invariant-8 impeccable dual-gate applies). No DB, no advisory-lock, no server action.

---

## 1. Problem

`KindDotCluster` (`components/admin/RecentAutoAppliedStrip.tsx:158`) renders one `size-2 rounded-full` dot per distinct change kind present in a collapsed auto-applied group, hue-only from `KIND_PILL[k].dot` (`:56-82`):

| kind | `KIND_PILL[k].dot` token |
|---|---|
| `crew_added` | `bg-status-positive` |
| `crew_renamed` | `bg-status-review` |
| `crew_removed` (destructive) | `bg-status-warn` |
| `field_changed` | `bg-status-idle` |
| `crew_email_changed` | `bg-status-idle` |

The **`review` and `warn` hues are near-identical** (per KINDDOT-1: review `#a87716`, warn `#b26a16`). For a color-vision-limited operator glancing at a sunlit venue floor, the **destructive `crew_removed` dot is not reliably distinguishable from `crew_renamed`** by color alone. The dots are `aria-hidden`; the cluster carries a `role="img"` + `aria-label` naming every kind (`:171-178`), so AT is already covered — this is a **sighted color-limited-vision** gap, not an AT gap.

Ratified framing (KINDDOT-1): the audit confirmed this is **not** a WCAG 1.4.1 violation (color is backed by text for AT + the expand-to-act model means no destructive change is actioned without seeing the per-row `KindPill`). This is the ratified **optional-polish** fix its Trigger names: "give `crew_removed` a non-color differentiator (glyph/ring)."

## 2. Fix

Give the destructive **`crew_removed`** marker in `KindDotCluster` a **shape-distinct non-color tell**: a centered horizontal **minus-bar** (semantically "removed") in place of the filled disc. Every other kind keeps its filled `size-2 rounded-full` disc.

Every shown marker (both branches below) carries a stable **`data-testid="auto-applied-kind-marker"`** on its top-level span so tests count markers by identity, not by shape (the shape is exactly what changes) — this is what lets the existing overflow test keep asserting "4 shown markers" after the removed disc becomes a bar (§6, Codex R1 finding 1).

**Rendered element (crew_removed only):**

```jsx
<span aria-hidden="true" data-testid="auto-applied-kind-marker" className="flex size-2 items-center justify-center">
  <span className="h-0.5 w-2 rounded-full bg-status-warn" />
</span>
```

- Occupies the same `size-2` (8px) footprint as the disc markers → row alignment (`flex items-center gap-1`) is unchanged.
- Inner bar: `h-0.5` (2px) × `w-2` (8px), `rounded-full`, `bg-status-warn` (destructive hue retained as a secondary channel; shape is the primary channel).
- Reads as a "−" / minus glyph → shape-distinct from all round dots regardless of hue.
- `aria-hidden` on the outer span; the inner bar is inside that hidden subtree (no separate `aria-hidden` literal on it, so DOM `span[aria-hidden='true']` selectors do not double-count it).

**Non-removed kinds (unchanged shape, gains the marker testid):** `<span aria-hidden="true" data-testid="auto-applied-kind-marker" className={`size-2 rounded-full ${KIND_PILL[k]?.dot ?? FALLBACK_PILL.dot}`} />`.

### 2.1 Why a bar, not a ring

A ring (hollow disc) would collide with the S3C-1 convention just shipped (`ShowReviewSurface` nav dots: filled = needs-review, hollow ring = no-issues) where hollow means *positive/clear* — the opposite of destructive. A minus-bar carries the correct "removed" semantic and no cross-surface conflict.

### 2.2 Boundary: `KindPill` is out of scope

The per-row `KindPill` (`:90`, its dot `:97`) also renders a color-only `size-1.5 rounded-full ${pill.dot}` dot, but it sits **immediately beside its uppercase text label** (`REMOVED`) and the row's `DiffBlock` renders a `line-through` value for the removed caption (`:124,:131`) — the removed kind there is already dual-channel (color + text + strikethrough). No 1.4.1 concern; left unchanged to keep the blast radius to the one color-only surface (`KindDotCluster`).

## 3. Guard conditions

- **Empty group** (`rows` yields no kinds): `KindDotCluster` returns `null` (`:164`). Unchanged — no marker rendered.
- **`crew_removed` present:** `crew_removed` is `KIND_ORDER[0]` (`:150`) and `MAX_DOTS = 4` (`:156`), so with ≤5 distinct kinds the removed marker is **always inside the `shown` slice** — it is never collapsed into the `+N` overflow. This is an invariant worth pinning (destructive never hidden behind overflow).
- **`crew_removed` absent:** no minus-bar rendered; all present kinds are filled discs. Unchanged behavior.
- **Unknown kind** (outside `KIND_ORDER`): collapses to the single neutral `__fallback__` disc (`:163`), never a minus-bar (only literal `crew_removed` gets the bar). Unchanged.
- **`aria-label`:** unchanged — still `Change kinds: <labels…>` naming every present kind incl. "Removed". The minus-bar is `aria-hidden` exactly like the discs; the text channel for AT is untouched.

## 4. Dimensional invariants + real-browser deferral (formal)

The minus-bar sits in a fixed `size-2` (8px) parent with `flex items-center justify-center`. The inner bar uses **explicit** `h-0.5` (2px) + `w-2` (8px) — it does **not** rely on flex `align-items: stretch` (this project's Tailwind v4 does not default `.flex` to stretch). The 8px bar width equals the 8px parent width; no overflow.

| parent | child | guaranteed by |
|---|---|---|
| `span.size-2` (8px×8px) | inner bar | `justify-center` + `items-center` centers; `w-2`/`h-0.5` are explicit, not stretch-derived |

**Real-browser assertion: DEFERRED-AS-N/A (explicit, per the project layout-dimensions rule; Codex R1 finding 2).** The project rule mandates a real-browser `getBoundingClientRect` assertion for fixed-dimension parents with flex/grid children *because* Tailwind v4 does not default `.flex` to `align-items: stretch` — the rule targets children whose dimensions **depend on stretch**. This marker's dimensions are **CSS-literal** (`h-0.5`/`w-2`), centered via `items-center`/`justify-center`, with **no stretch dependency and no child-fills-parent relationship** — the exact class the rule's own ratified deferrals (DQ-1, OUX-1, AUTOAPPLIED-REDESIGN-1) carve out as N/A. A standalone esbuild+Playwright harness for an 8px centered 8px×2px bar is disproportionate. The invariant is pinned in **jsdom** (class assertions on the marker + inner bar). Recorded as an explicit DEFERRED.md row (§8), not a silent skip.

## 5. Transition inventory

`KindDotCluster` is a **static, stateless** render (one pass per group; no open/close state, no async). There are **zero** state-transition pairs and **no** animation. Declared instant — no animation needed.

## 6. Tests (TDD)

`tests/components/admin/RecentAutoAppliedStrip.test.tsx` (existing suite for this component):

1. **Removed marker is shape-distinct** — a group containing a `crew_removed` row renders, inside `[data-testid="auto-applied-kind-dots"]`, a marker that is **not** a plain `rounded-full` disc: assert the minus-bar element (`h-0.5.w-2`) is present and that the removed kind does **not** render a `size-2 rounded-full bg-status-warn` disc. Failure mode caught: someone reverts the bar to a disc → destructive kind becomes color-only again.
2. **Non-removed kinds stay discs** — a group with `crew_renamed` + `crew_added` (no removed) renders two `size-2 rounded-full` discs and **no** minus-bar. Failure mode: the bar leaks onto a non-destructive kind.
3. **Removed never in overflow** — a group with all 5 distinct kinds still renders the removed minus-bar in the visible set (not collapsed into `+N`). Failure mode: a `MAX_DOTS`/`KIND_ORDER` reorder pushes destructive behind overflow.
4. **`aria-label` unchanged** — the cluster's `aria-label` still lists every present kind incl. "Removed". Failure mode: refactor drops a kind from the AT text channel.

**Existing-test update (Codex R1 finding 1):** the current test `kind-dot cluster: >4 distinct kinds → 4 dots + a +N overflow marker` (`tests/components/admin/RecentAutoAppliedStrip.test.tsx:~305`) counts visible markers via `querySelectorAll("span[aria-hidden='true']")` filtered on `.rounded-full`. After the change the `crew_removed` marker is a non-`rounded-full` wrapper (its `rounded-full` is on the nested bar), so that filter drops to 3 and the test fails. Update it to count top-level markers by `[data-testid="auto-applied-kind-marker"]` (== 4), which is shape-independent. This is the only existing test that breaks; test #1 (3 non-removed kinds) is unaffected (still 3 `aria-hidden` discs).

Anti-tautology: assertions extract from within `[data-testid="auto-applied-kind-dots"]` and target the marker's own classes/shape, not a container that also renders the per-row `KindPill` (which independently renders "Removed" text + its own dot).

## 7. Out of scope (ratified deferrals, unchanged)

- **AUTOAPPLIED-REDESIGN-3** (structured field diff) — owned by `feat/autoapplied-field-structured-diff`; needs the DB write-path arc.
- **AUTOAPPLIED-REDESIGN-1** (width e2e) — jsdom pins the grid invariant; disproportionate.
- **COLLAPSE-REGION-1** (`CollapsePanel` region opt-out) — P3 bounded; needs a new `region?` API prop; trigger (>6 concurrent groups) not met.
- **`KindPill`** per-row dot — dual-channel already (§2.2).

## 8. DEFERRED.md drift correction (lands in this PR)

Live-code verification found three entries stale on `origin/main` (plus KINDDOT-1, resolved by this PR):

- **AUTOAPPLIED-COLLAPSE-1** ("collapsed header hides change kind") — resolved-in-code by `KindDotCluster` (`:143-189`, comment cites COLLAPSE-1). Mark ✅ RESOLVED-BY-SUPERSESSION.
- **AUTOAPPLIED-COLLAPSE-2** ("panel mounts/unmounts instantly, no height-morph") — resolved-in-code: `CollapsePanel` now height-morphs (`RecentAutoAppliedStrip.tsx:357` comment; `CollapsePanel.tsx` always-mounted region). Mark ✅ RESOLVED-BY-SUPERSESSION.
- **AUTOAPPLIED-REDESIGN-2** ("singleton group renders card-in-card") — resolved-in-code: singleton groups now flatten the inner row card (`StripRow` `flatten` path; pinned green by `tests/components/admin/RecentAutoAppliedStrip.test.tsx` "singleton group flattens the inner row card"). The deferral's "matches the mock = keep card-in-card" rationale was superseded by the later flatten implementation. Mark ✅ RESOLVED-BY-SUPERSESSION.
- **KINDDOT-1** — mark ✅ RESOLVED by this PR.

New explicit deferral row (§4): **KINDDOT-DIM-1 — [N/A] real-browser dimension assertion for the `size-2` minus-bar marker — DEFERRED-AS-N/A** (CSS-literal dims, no stretch dependency; jsdom class-pin; cites DQ-1/OUX-1/REDESIGN-1 precedent).

Backlog `BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL` → mark SHIPPED.
