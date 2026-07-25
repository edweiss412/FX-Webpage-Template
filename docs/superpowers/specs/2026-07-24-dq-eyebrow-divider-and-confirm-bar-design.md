# Data-quality group eyebrow: divider breakpoint + short-label confirm bar

**Date:** 2026-07-24
**Branch:** `fix/phantom-gap-hairline-crowded-row`
**Closes:** `BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW` (BACKLOG.md:7)
**Surface:** `components/admin/BulkIgnoreControls.tsx` (the ACTIVE data-quality list's per-code eyebrow row + bulk-ignore chip)

---

## 1. Problem

`components/admin/BulkIgnoreControls.tsx:179` renders a decorative rule — `<span aria-hidden="true" className="h-px flex-1 bg-border" />` — as the middle item of the group eyebrow row (`flex items-center gap-2`, `components/admin/BulkIgnoreControls.tsx:170`). The row's other items are the type label (`components/admin/BulkIgnoreControls.tsx:172-178`) and, for bulk-eligible groups, the ignore chip (`components/admin/BulkIgnoreControls.tsx:182-192`).

At narrow widths the label and chip consume the row. `flex-1` resolves `flex-basis: 0`, so the rule has nothing to shrink and settles at **0 px wide** — while the row still charges `gap-2` (8 px) on **both** sides of it. One of those 8 px would exist anyway between label and chip; the other is dead space no visible element accounts for. Same class as the Overview phantom gap (`DESIGN.md` §7a), one order of magnitude smaller.

`empty:hidden` — the `DESIGN.md` §7a idiom — does **not** apply: the span is not empty, it is zero-**width**.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratified | Where |
| --- | --- | --- |
| Divider is **hidden** below 480 px rather than floored, wrapped, or kept | Owner, 2026-07-24 (options A/B rejected after seeing real renders) | This spec §3.1 |
| 480 px, not `sm` (640 px) | Measured: rule is 0 px at every width 320→430 and first draws 31.4 px at 480 (§2) | §2 probe table |
| `min-[480px]:` arbitrary variant, **not** a new global `--breakpoint-*` | `app/globals.css:224-229` forbids adding a global `md`; the admin ShowsTable precedent is `min-[720px]:` | `app/globals.css:228` |
| Chip copy drops the count from the **visible** label | Owner, 2026-07-24 | §3.2 |
| Count survives in the **accessible name** | Owner, 2026-07-24 | §3.3 |
| Confirm copy is sentence case with the question mark — `Are you sure?` | Owner, 2026-07-24 (chose over title-case `Are You Sure`) | §3.2 |
| Full-width confirm applies **below 480 px only**; ≥480 px stays inline | Owner, 2026-07-24 | §3.1 |
| The armed morph keeps **one** button element (no unmount) | Focus preservation; see §3.4 | §3.4 |
| The 4 s auto-revert (`ARM_REVERT_MS`, `components/admin/BulkIgnoreControls.tsx:45`) is unchanged | Out of scope | `BulkIgnoreControls.tsx:45` |
| The single-armed-panel-wide invariant and per-fingerprint fan-out are unchanged | Out of scope (spec 2026-07-16-destructive-confirm-pass §4 G4) | `BulkIgnoreControls.tsx:74-137` |
| The eyebrow-row suppression rule for lone chip-less cards is unchanged | Out of scope (spec 2026-07-24-dq-singleton-eyebrow-suppress §2.1) | `BulkIgnoreControls.tsx:162` |
| The destructive-confirm recipe (C1) stays on the armed branch | `tests/styles/_metaDestructiveConfirm.test.ts:59-64` pins it | §6 |

---

## 2. Empirical basis (probe before prose)

Measured on the real component under real compiled Tailwind, via the existing live harness `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx` bundled with esbuild (the harness pattern `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:12-25` documents), and on the real published-review modal tree via `tests/e2e/_publishedReviewModalHarness.tsx` (its `crewWarnings` and `crewWarningsCapped` pages). Label is the live catalog title `MESSAGE_CATALOG.FIELD_UNREADABLE.title` = "Phone or email we couldn't use" (`lib/messages/catalog.ts:1767`).

Width sweep, published-modal tree, chip present, `Ignore`-length label:

| viewport | row width | rule width | label lines |
| --- | --- | --- | --- |
| 320 | 238 | **0** | 2 |
| 360 | 278 | **0** | 2 |
| 375 | 293 | **0** | 2 |
| 390 | 308 | **0** | 2 |
| 414 | 332 | **0** | 2 |
| 430 | 348 | **0** | 2 |
| 480 | 398 | 31.4 | 1 |
| 520 | 438 | 71.4 | 1 |
| 640 | 510 | 143.4 | 1 |
| 1280 | 654 | 287.4 | 1 |

Two facts this pins:

1. The collapse is total below 480 and absent at/above it. `sm` (640) would suppress a divider that legitimately draws 31–143 px across 480–639.
2. Shortening the chip copy alone does **not** fix it — the sweep above already uses the short copy, and the rule is still 0 px through 430.

Height cost of the armed morph, live harness at 375: row 44 px idle → 68.8 px armed (+24.8 px, reverting after `ARM_REVERT_MS`). Idle row height is unchanged from today.

---

## 3. Design

### 3.1 Layout

**Rule element** (replaces `BulkIgnoreControls.tsx:179`):

```
<span aria-hidden="true" className="hidden h-px min-w-6 flex-1 bg-border min-[480px]:block" />
```

- `hidden` below 480 px: the element leaves the flex flow entirely (`display: none`), so **neither** adjacent `gap-2` is charged. The phantom 8 px is gone by construction, not by compensation.
- `min-w-6` (24 px) at ≥480 px: a floor so the rule can never resolve to zero width in **any** container, including containers this spec did not measure (the standalone `app/admin/show/[slug]/page.tsx` render, future narrower panels). At the measured widths the rule is already ≥31.4 px, so the floor is invisible in practice — it exists to make the zero-extent state unreachable.
- `flex-1` unchanged: the rule still fills the middle at ≥480 px.

**Row** (`BulkIgnoreControls.tsx:170`): gains `flex-wrap` **only while armed or running**:

```
className={`flex items-center gap-2 ${armed || running ? "flex-wrap" : ""}`}
```

Idle rows never wrap — idle geometry is byte-identical to today apart from the removed rule. This is deliberate: a permanently wrapping row would push the chip to its own line at rest (+18 px per group), which was reviewed and rejected.

**Chip, armed/running branch:** full width on its own wrapped line below 480 px, inline chip at ≥480 px:

```
w-full justify-center min-[480px]:w-auto min-[480px]:justify-start
```

At ≥480 px the armed chip is `w-auto`, fits the line, and `flex-wrap` therefore has no effect — the row stays one line. Below 480 px `w-full` forces the button onto its own flex line (100% + `gap-2` exceeds the container), producing the full-width confirm bar.

### 3.2 Copy

| State | Visible text | Today |
| --- | --- | --- |
| idle | `Ignore` | `Ignore all {n}` |
| armed | `Are you sure?` | `Confirm ignore all {n}` |
| running | `Ignoring…` | `Ignoring…` (unchanged) |

Sentence case, apostrophe/ellipsis literals as elsewhere in the file, no em dashes — the mechanical copy invariants (AGENTS.md "Pre-code mechanical UI gate").

### 3.3 Accessible name

`aria-label` (`BulkIgnoreControls.tsx:188`) carries the count the visible label drops, plus the type context, exactly as today's pattern does:

| State | `aria-label` (label non-null) | `aria-label` (label null) |
| --- | --- | --- |
| idle | `Ignore {n} · {label}` | `Ignore {n}` |
| armed | `Are you sure? Ignore {n} · {label}` | `Are you sure? Ignore {n}` |
| running | `Ignoring… · {label}` | `Ignoring…` |

WCAG 2.5.3 Label-in-Name holds in every state: the visible string is a prefix (therefore a substring) of the accessible name. `{n}` is `bulk.items.length` — the same source today's label uses (`components/admin/BulkIgnoreControls.tsx:154-158`).

**Change from today:** the null-label branch currently yields `aria-label={undefined}` (`components/admin/BulkIgnoreControls.tsx:188`), so the accessible name falls back to the visible text and the count is lost. The table above gives that branch a name too. `{n}` is always available on this branch — the chip renders only when `bulk !== null` (`components/admin/BulkIgnoreControls.tsx:180`).

### 3.4 Element identity and focus

The armed morph must not remount the button. Wrapping onto a new flex line is a pure layout change: same element, same parent, same React position, so focus, the focus-visible ring, and the `role="status"` sibling (`components/admin/BulkIgnoreControls.tsx:195-197`) all survive the transition. Any implementation that renders the confirm as a *different* element in a *different* parent would drop keyboard focus on the arming tap and is out of contract.

### 3.5 Guard conditions

| Input | Value | Rendered result |
| --- | --- | --- |
| `group.bulk` | `null` | No chip, no `role="status"` span. Row is label + rule; below 480 px the rule is hidden, so the row is label-only and charges no gap. |
| `group.bulk.items` | `[]` (length 0) | Chip renders with `Ignore`; `aria-label` reads `Ignore 0 · {label}`. Unreachable in practice — `bulk` is non-null only at ≥2 distinct items (`lib/dataQuality/bulkIgnoreGroups.ts`) — but the expression must not throw. Today's `bulk?.items.length ?? 0` (`components/admin/BulkIgnoreControls.tsx:154-158`) already encodes this; the new code keeps a defined value. |
| `group.label` | `null` | No label span (`components/admin/BulkIgnoreControls.tsx:171`); row is rule + chip. `aria-label` per §3.3 null-label column. |
| `group.label` | Very long (wraps 2+ lines below 480) | Label wraps (`whitespace-normal` is the default; the label span carries `min-w-0`, `components/admin/BulkIgnoreControls.tsx:174`), never ellipsizes — pinned by `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:148`. |
| `group.itemCount` | `1` **and** `bulk === null` | Whole eyebrow row suppressed (`components/admin/BulkIgnoreControls.tsx:162`), unchanged. |
| `groups` | `[]` | Component returns `null` (`components/admin/BulkIgnoreControls.tsx:139`), unchanged. |

### 3.6 Dimensional invariants

The eyebrow row is not a fixed-dimension parent, but three relationships must hold and are asserted in a real browser (jsdom computes no layout):

| # | Invariant | Guaranteed by | Asserted at |
| --- | --- | --- | --- |
| DI-1 | Below 480 px, no in-flow child of the eyebrow row has zero extent on the row's gap axis | `hidden` on the rule | 375 px |
| DI-2 | At ≥480 px, the rule's width is ≥24 px | `min-w-6` | 480 px, 1280 px |
| DI-3 | Below 480 px, the armed chip's width equals the row's content width (±0.5 px) and its box is disjoint from the label's | `w-full` + `flex-wrap` | 375 px |
| DI-4 | At ≥480 px, the armed row occupies one line: chip height ≤ row height, chip width < row width | `min-[480px]:w-auto` | 480 px |
| DI-5 | Idle row height is unchanged by this spec at every width | idle row has no `flex-wrap` | 375 px, 1280 px |

### 3.7 Transition inventory

Button states: **idle**, **armed**, **running**, **disabled** (this group idle while a *sibling* group runs — `disabled={state.kind === "running"}`, `components/admin/BulkIgnoreControls.tsx:182`). The `error` state is a sibling `role="alert"` notice (`components/admin/BulkIgnoreControls.tsx:203-215`), not a button state.

| Pair | Treatment |
| --- | --- |
| idle → armed | Instant reflow (button jumps to its own full-width line below 480 px). No animation: `transition-opacity duration-fast` on the armed skin covers the fill change only; a height/position tween is out of scope and was never present. |
| armed → idle (4 s timeout) | Instant reflow back. |
| armed → idle (re-arm of another group clears this one, `components/admin/BulkIgnoreControls.tsx:77`) | Instant reflow back. |
| armed → running | Instant. Both branches share the full-width treatment below 480 px, so only the text changes; no reflow. |
| running → idle (all-ok, `components/admin/BulkIgnoreControls.tsx:115`) | Instant reflow back to inline chip. |
| running → error | Instant; the button returns to idle skin and the alert notice mounts below the cards. |
| idle → running | Unreachable — `running` is entered only from `armed` (`components/admin/BulkIgnoreControls.tsx:85-87`). |
| idle → disabled | Instant; `disabled:opacity-60`, no layout change (the disabled sibling is never armed, so it keeps the inline skin). |
| disabled → idle | Instant. |
| armed → disabled | Unreachable — entering `running` clears `armedCode` for every group (`components/admin/BulkIgnoreControls.tsx:93`). |
| disabled → armed / disabled → running | Unreachable — the button is `disabled` while any group runs. |
| **Compound:** group X armed → user taps group Y | X reverts to idle (inline) and Y arms (full width) in the same commit. Both reflows are instant; no interleaving animation exists to race. |
| **Compound:** 4 s timer fires while the confirm tap is in flight | `onGuardedClick` clears the timer before dispatch (`components/admin/BulkIgnoreControls.tsx:85`), so the revert cannot land mid-run. Unchanged by this spec. |

---

## 4. Out of scope

- The `role="status"` announcement copy ("Tap again to confirm.", `components/admin/BulkIgnoreControls.tsx:192`) — still accurate under the new visible text.
- `ARM_REVERT_MS`, the fan-out, the partial-failure copy, the `Ignored (N)` disclosure.
- The other surfaces in the destructive-confirm registry (`tests/styles/_metaDestructiveConfirm.test.ts:27`). This spec changes one row's component, not the recipe.
- `BL-PHANTOM-GAP-PROBE-OTHER-SURFACES` (BACKLOG.md:19) — extending the zero-extent probe to the crew page and dashboard harnesses stays open.

---

## 5. Test plan

Every item is TDD: failing assertion first.

**Unit (`tests/components/admin/bulkIgnoreControls.test.tsx`)**

1. Idle chip text is exactly `Ignore`; `aria-label` is `Ignore 2 · Unrecognized row in sheet`. *Catches:* a count silently surviving in, or vanishing from, the accessible name.
2. Armed chip text is exactly `Are you sure?`; `aria-label` is `Are you sure? Ignore 2 · Unrecognized row in sheet`. *Catches:* a stale accessible name after the morph (Label-in-Name break).
3. Null-label group: `aria-label` is `Ignore 2` idle and `Are you sure? Ignore 2` armed. *Catches:* the `undefined` fallback silently returning and dropping the count.
4. Armed branch class set contains `w-full` and `min-[480px]:w-auto`; idle branch contains neither. *Catches:* the responsive half of the full-width rule being dropped, which jsdom cannot see any other way.
5. Existing multi-group / arm-revert / fan-out assertions retargeted to the new strings (no behavior change intended).

**Real-browser geometry (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts`, standalone config)**

6. 375 px, idle **and** armed: no in-flow child of the eyebrow row has zero extent on the gap axis (DI-1). *Catches:* the phantom gap returning via any mechanism, not just this rule.
7. 375 px armed: chip width equals row content width ±0.5 px; chip box disjoint from label box (DI-3).
8. 480 px idle **and** armed: rule width ≥24 px (DI-2); armed row is one line — chip width < row width (DI-4).
9. 375 px and 1280 px idle: row height equals the pre-change baseline (DI-5). Baseline derived from the rendered idle row at each width, not hardcoded.
10. Existing 390 px wrap/overflow/disjoint assertions (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:148-151`) updated for the new armed string.

**Focus (`tests/components/admin/bulkIgnoreControls.test.tsx`)**

11. Focus the chip, click to arm, assert `document.activeElement` is still the same element node (§3.4). *Catches:* a future refactor that renders the confirm as a separate element and drops focus.

**Ledger (`tests/e2e/published-review-modal.layout.spec.ts`)**

12. Delete the `KNOWN_PHANTOM_ITEMS` row (`tests/e2e/published-review-modal.layout.spec.ts:1534-1542`). The spec's stale-row assertion (`tests/e2e/published-review-modal.layout.spec.ts:1783-1787`) then fails if the row is kept, and the offender assertion (`tests/e2e/published-review-modal.layout.spec.ts:1788-1791`) fails if the instance survives — the two together prove the fix without a new test.

---

## 6. Registry / meta-test inventory

| Registry | Action |
| --- | --- |
| `tests/styles/_metaDestructiveConfirm.test.ts:59-64` — `BulkIgnoreControls.tsx` index 0, kind `morph` | **Row unchanged.** The armed class literal keeps `bg-warning-text` + `text-warning-bg` + `font-semibold` + `hover:opacity-90` and adds no `bg-*` token, so it stays one C1-satisfying hit at index 0. The plan must keep the armed skin a **single** class literal — splitting it into two literals would create a second occurrence and fail the registry. |
| `tests/e2e/standalone.config.ts:36` `testMatch` | No change — `bulk-ignore-eyebrow.layout` is already allow-listed. |
| `tests/log/_auditableMutations.ts` (invariant 10) | N/A — no mutation surface is added or moved; the chip's POST path is untouched. |
| §12.4 catalog / `pnpm gen:spec-codes` | N/A — no error code changes. |
| `supabase/migrations/**` | N/A — no DB change. |
| Advisory-lock topology | N/A — no `pg_advisory*` path touched. |

---

## 7. Documentation

- `BACKLOG.md`: delete the `BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW` entry (:7-17) — the debt is paid, not deferred.
- `DESIGN.md` §7a: add the zero-**width** sibling case to the phantom-gap idiom — `empty:hidden` covers a childless item; a `flex-1` decorative rule in a crowded row needs a breakpoint (`hidden min-[480px]:block`) plus a `min-w-*` floor. One paragraph, referencing this spec.
- The component's header comment (`components/admin/BulkIgnoreControls.tsx:47-59`) still says the eyebrow renders "label + hairline rule" and the chip reads "Ignore all N": update both claims.
