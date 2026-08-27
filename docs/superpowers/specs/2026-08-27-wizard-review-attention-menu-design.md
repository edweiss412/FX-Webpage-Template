# Review modal headers: count the warnings the operator will see, and let the pill open them

**Date:** 2026-08-27 · **Branch:** `feat/wizard-review-attention-menu` · **Surface:** UI (Opus-owned; invariant 8 dual-gate applies) · **Merge:** bl-orch only; this arc sends a readiness line

## 1. Problem

Two screenshots from the validation deployment, 2026-08-27, same show (II - RIA Investment Forum - Central 2025):

**Wizard (Step 3).** The sheet row reads "⚠ 4". The operator opens Review expecting four things. The modal header says "1 needs a look", the chip is inert, and the flagged section is below the rail's fold. The row badge counts individual data-gap warnings: `Step3SheetCard.tsx` (`const gaps = summarizeDataGaps(warnings)` feeding `<DataQualityBadge dataGaps={gaps} />`), where `summarizeDataGaps` (`lib/parser/dataGaps.ts`) counts every non-info warning whose code is in `DATA_GAP_CODES`. The modal chip counts flagged *sections*: `Step3ReviewModal.tsx` `flaggedCount` useMemo buckets warnings with `warningsBySection` and increments once per section whose `sectionStatus` is `"flagged"`. RIA's four warnings all route to one section, so 4 became 1. The chip is a `<span>` (the `flaggedCount > 0` branch of the header chip ternary), specified as a status chip only (`docs/superpowers/specs/step3-onboarding/2026-07-02-step3-review-modal-redesign.md` §7 "Header chip").

**Published modal.** The dashboard row reads "⚠ 3", the rail reads "Sheet warnings 3" with an amber dot, and the header pill says "In sync". The pill derives from `attentionItems` (alerts + holds; `PublishedReviewModal.tsx` `live` / `needsYou` / `selfHeal` memos, `interactive = needsYou.length > 0 || selfHeal.length > 0`). Active parse warnings travel separately as `routedWarnings` (`deriveRoutedWarnings(bySection)`, `lib/admin/routedWarnings.ts`) and feed the rail and the section panels, never the pill. Three warn rows still read "In sync".

One cause on both surfaces: the header's count and the warnings the operator is about to be shown are derived from different universes. The published modal already has the right shape for the fix, an interactive pill opening an index of jump rows (`components/admin/showpage/AttentionMenu.tsx`); it just leaves warnings out. The wizard has neither.

### Goal

- Both header pills count warn-severity parse warnings, in the same unit the modal body lists them.
- Both pills open an index whose rows name each warning and jump to it.
- The dashboard/card row badge (`DataQualityBadge`) is unchanged; the pill count is always ≥ the badge count.

## 1.1 Resolved scope — do NOT relitigate

| Decision | Ratification |
|---|---|
| Wizard header counts **warn-severity warnings**, partitioned needs-look / judgment by `isAmbiguityCode`; sections are no longer the unit. | This spec §3.1. User direction 2026-08-27: "ship 1 [copy alignment]. otherwise align the wizard modal ux with the published show modal ux". Supersedes `2026-07-02-step3-review-modal-redesign.md` §7 "Header chip: `flaggedCount = flagged.size`" and its §9.1 footer mirror for the COUNT only. The flagged SET (rail dots, `SectionFlagCallout`) is untouched. |
| Published pill gains a **sheet-warnings segment** and the menu a **Sheet warnings group**; "In sync" is unreachable while an active warn-severity warning exists. | User report 2026-08-27 ("similarly this published modal is showing 'in sync' … dashboard row shows '3' and there are 3 rows in the modal's sheet warnings section"). Amends `2026-07-24-attention-index-consolidation.md` §2.4 ("Three counted segments collapse to two") back to three segments, the new one being sheet warnings, not a revival of the retired "to review" segment; and §2.1's two groups to three. The `issues` / `monitoring` copy and semantics are unchanged. |
| Vocabulary stays per surface: wizard says "need a look" / "judgment calls"; published says "issues" / "sheet warnings" / "monitoring". | `2026-07-24-attention-index-consolidation.md` §2.1 ("'Needs a look' survives as a per-section chip and is NOT retired … the two surfaces are unrelated") and §2.4 (noun "issues" chosen to avoid a verb-agreement branch). "sheet warnings" is a noun that pluralises with s for the same reason. |
| The card/dashboard row badge keeps its data-gap universe. | `docs/superpowers/specs/parser/2026-07-07-ambiguity-warnings-v1-design.md` §7.3a (`DataQualityBadge` keeps the full gap count with no partition, per its §3.4 dashboard rule) and §7.1 (row/section universe divergence "pre-existing and preserved"). The pill is a superset (§3.1 I-1); residual divergence is a documented limit (§10). |
| Wizard judgment (ambiguity-only) warnings get a quiet second segment and a second menu group, never the amber tone. Published does NOT split by judgment; its rows carry a per-row tone dot instead. | `2026-07-07-ambiguity-warnings-v1-design.md` §7.3a (judgment chrome "never the amber warn tone"); `Step3SheetCard.tsx` `judgmentChip`. The wizard's card and summary chrome are built on that partition; the published modal's are not, and adding a fourth published segment for it is more than the report asks. |
| "All clean" is unreachable while any warn-severity warning exists. | `2026-07-02-step3-review-modal-redesign.md` §7 "No false 'All clean' (R3 contract)". Today a judgment-only sheet renders "All clean" (the `flaggedCount` loop skips `"judgment"` sections), which violates R3's letter; this spec closes it with the quiet judgment pill. |
| Wizard rows jump to the warning's row in the Sheet warnings list. Published rows jump to the section's active-warnings block. | Wizard: the existing jump contract, `SectionFlagCallout` → `jumpToWarning(index)` → `[data-warning-index]` (`ShowReviewSurface.tsx` `jumpToWarning`; `step3ReviewSections.tsx` warning `<li data-warning-index={i}>`), because `WarningsBreakdown` is the sole actionable site (spec 2026-07-17 USE-RAW-FULL-LIST-1). Published: warning cards render per section inside `section-warning-active-${id}` (`components/admin/showpage/sectionWarningExtras.tsx`), and the surface's own comment says "published anchors jump by section, not row". |
| Jump plumbing reuses `attentionJump` and the `[data-attention-anchor]` lookup on both surfaces. No new `ShowReviewSurface` prop. | `ShowReviewSurface.tsx` `attentionJump?: AttentionJump \| null` and its nonce-keyed effect (anchor hit → scroll + flash; miss → `handleNavClick(sectionId)`). |
| Row click closes the menu first, then jumps; focus is not restored to the pill on row activation. | `AttentionMenu.tsx` row `onClick` (`onClose(); onNavigate(item);`); `DEFERRED.md` "Accepted, not fixed, in the index consolidation". Same behavior, same acceptance, both surfaces. |
| Auto-open: wizard opens once per mount when needs-look > 0; published auto-open stays `actionable.length > 0` only (warnings never auto-open it). | Published: `PublishedReviewModal.tsx` auto-open effect (published-show-alerts §5.2) — non-actionable items never auto-opened it and warnings are non-actionable in that sense. Wizard: the operator pressed Review to review; the index is the thing they were missing. |
| The published render with no warnings is byte-identical after this change. | §4.3 (`warningIndex` absent), §5 (same file, same markup). Pinned by the existing `attentionMenu.test.tsx`, `attentionMenuGroups.test.tsx`, `publishedReviewModal.test.tsx` suites on warning-free fixtures. |
| The wizard header's "All clean" and "Sheet changed" spans are byte-identical. | `tests/components/admin/review/reviewModalShell.test.tsx` T-STEP3-INVARIANT pins the modal header's `innerHTML` against `tests/components/admin/review/__fixtures__/step3-header-baseline.html` on a clean fixture. The interactive wrapper renders only in button states (§3.2), so the baseline does not move. If it does, that is a defect, not a regeneration. |
| `Step3SheetCard.tsx`, `DataQualityBadge.tsx`, `Step3Review.tsx` summary counts, rail dot derivation, `SectionFlagCallout`: untouched. | Scope fence. |
| Copy on these surfaces uses no em dash. | DESIGN.md §9; `tests/styles/_metaEmDashCopy.test.ts`. |

## 2. Shared derivation: `deriveWarningAttention`

New pure module lib/admin/warningAttention.ts (planned; client-safe, no I/O):

```ts
export type WarningTone = "needsLook" | "judgment";
export type WarningAttentionInput = { id: string; sectionId: SectionId; warning: ParseWarning };
export type WarningAttentionEntry<T extends WarningAttentionInput = WarningAttentionInput> = T & {
  sectionLabel: string;
  tone: WarningTone;
};
export type WarningAttention<T extends WarningAttentionInput = WarningAttentionInput> = {
  needsLook: readonly WarningAttentionEntry<T>[];
  judgment: readonly WarningAttentionEntry<T>[];
  all: readonly WarningAttentionEntry<T>[]; // input order, both tones
};
export function deriveWarningAttention<T extends WarningAttentionInput>(
  entries: readonly T[],
  sections: ReadonlyArray<{ id: SectionId; label: string }>,
): WarningAttention<T>;
```

Rules:

- Callers pass only warn-severity entries (both callers already have warn-only inputs: `warningsBySection` drops info, `lib/admin/step3SectionStatus.ts`; `SectionWarningModel.active` is routed from the same helper, `lib/admin/sectionWarningModel.ts` header comment). The function asserts `severity === "warn"` on every entry and throws otherwise — a caller bug surfaces, never a silently inflated count.
- `tone = isAmbiguityCode(warning.code) ? "judgment" : "needsLook"` (`lib/parser/ambiguityCodes.ts`).
- `sectionLabel` = the label of `sections.find(s => s.id === entry.sectionId)`. A miss throws: routing already degrades unknown targets to `"warnings"`, which every caller renders, so a miss is a programming error.
- Order: input order preserved in `all` and within each group.
- `id` is the caller's jump key and React key; the function does not inspect it.

**Invariants (each pinned by a unit test, §8):**

- **I-1 (superset of the badge).** For any warnings array `w`, `deriveWarningAttention(warnOnly(w)).all.length >= summarizeDataGaps(w).total`. Holds because the badge counts `severity !== "info" ∧ DATA_GAP_CODES.has(code)`, `severity` is the closed union `"info" | "warn"` (`lib/parser/types.ts` `ParseWarning`), and this derivation counts every `"warn"`.
- **I-2 (rail agreement, wizard).** A section holds ≥1 `needsLook` entry iff `sectionStatus` of its routed warnings is `"flagged"`; holds only `judgment` entries iff `"judgment"`. Follows from sharing `warningsBySection` and `isAmbiguityCode` with `sectionStatus`.
- **I-3 (R3 contract).** Any warn-severity input yields a non-empty `all`.

Warn-severity codes outside `DATA_GAP_CODES` exist, and the repo already enumerates them: `tests/parser/dataGapsClassCompleteness.test.ts` partitions the persisted `ParseWarning` universe into gap classes, `BENIGN_WARN_CODES` (warn-severity autocorrect and agenda-confidence codes) and `ASSET_WARN_CODES` (warn-severity Drive-asset codes), and pins that every code lands in exactly one bucket. Every `AMBIGUITY_CODES` member is a gap class (`lib/parser/ambiguityCodes.ts` header; `AMBIGUITY_CODES ⊆ GAP_CLASSES` in `2026-07-07-ambiguity-warnings-v1-design.md` §7.2). So "make the pill equal the badge" is not achievable without dropping the benign and asset warn codes from the pill, which R3 forbids; the superset invariant is the honest alignment. The I-1 test (§12.2) draws its non-gap warn codes from those two sets by importing them (they move to an exported fixture module if the test file does not export them today), never from a hand-typed list.

## 3. Part A: wizard modal (`Step3ReviewModal.tsx`)

### 3.1 Counts

Replace the `flaggedCount` useMemo with:

```ts
const attention = useMemo(() => {
  const defs = step3Sections(data);
  const bySection = warningsBySection(data.warnings, new Set(defs.map((s) => s.id)));
  const entries = [...bySection]
    .flatMap(([sectionId, list]) => list.map((e) => ({ id: `warning:${e.index}`, sectionId, warning: e.warning, index: e.index })))
    .sort((a, b) => a.index - b.index);
  return deriveWarningAttention(entries, defs);
}, [data]);
const n = attention.needsLook.length, m = attention.judgment.length;
```

`index` is the position in the FULL `data.warnings` array (what `warningsBySection` records and what `[data-warning-index]` carries). Order = Sheet warnings list order = where every row jumps. Every count on the modal (pill, footer, sr text) reads from this one value.

### 3.2 Header pill states

In the header's trailing cluster (`Step3ReviewModal.tsx`, the `flex shrink-0 items-center gap-2` div), the three-way chip ternary becomes five states:

| State | Condition | Element | Text | Treatment |
|---|---|---|---|---|
| Sheet changed | `isDirtyRescan` | `<span>` unchanged | "Sheet changed" | unchanged |
| All clean | `!isDirtyRescan && n + m === 0` | `<span>` unchanged | "All clean" | unchanged |
| Needs a look | `n > 0 && m === 0` | `<button>` | "{n} need a look" / "1 needs a look" | amber interactive: `border border-warning-text bg-warning-bg text-warning-text hover:bg-warning-bg/80`, filled `bg-status-review` dot, trailing `ChevronDown` `size-3` (`rotate-180` while open) |
| Composite | `n > 0 && m > 0` | `<button>` | "{n} need a look · {m} judgment calls" ("1 judgment call") | as Needs a look; the judgment segment and its leading middot in `text-warning-text/80` (the published monitoring-segment alpha; contrast note "/80 floor" in `PublishedReviewModal.tsx`) |
| Judgment only | `n === 0 && m > 0` | `<button>` | "{m} judgment calls" / "1 judgment call" | quiet interactive: `border border-text-faint bg-surface-sunken text-text hover:border-text-subtle`, neutral `bg-text-faint` dot (`Step3SheetCard.tsx` `judgmentChip`), chevron `text-text-subtle` |

The button states share:

- `data-testid` stays `wizard-step3-card-${dfid}-review-chip`.
- `type="button"`, `aria-expanded={menuOpen}`, `aria-controls={menuId}` (`useId()`), `onClick` toggles `menuOpen`.
- Classes copied from the published pill button: `relative inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold tabular-nums whitespace-nowrap transition-colors duration-fast before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. The `before:-inset-y-3` band gives a ≥44px hit target over a ~24px visible pill (published comment "T-TAP probes the resolved band").
- Count cap per segment: over 99 renders "99+" with an `sr-only` "({exact} …)" tail after a real space text node (published pattern).
- The button and the menu live in a `<div className="relative min-w-0">` wrapper with a `<div id={menuId}>` child hosting the menu. **The wrapper renders only in button states.** The All clean and Sheet changed spans render exactly as today, bare in the cluster, so the T-STEP3-INVARIANT baseline (clean fixture) is unchanged.
- Dot and chevron `aria-hidden`; the count text carries the meaning (DESIGN.md §1.3 color-blind floor).
- Resting ink is `text-warning-text` or `text-text`, never `text-text-subtle` (`tests/styles/_metaSubtleOnInteractive.test.ts`; no registry row needed).
- Each new JSX conditional carries the `§11: instant — deliberate` marker on the line above it (`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` conditional-site audit); the audit's site count is re-measured by running the scanner, not predicted.

### 3.3 Menu: `WizardAttentionMenu`

New file components/admin/wizard/WizardAttentionMenu.tsx (planned):

```ts
type Entry = WarningAttentionEntry<{ id: string; sectionId: SectionId; warning: ParseWarning; index: number }>;
export type WizardAttentionMenuProps = {
  dfid: string;
  attention: WarningAttention<Entry>;
  open: boolean;
  onClose: () => void;
  onNavigate: (entry: Entry) => void;
  pillRef: RefObject<HTMLButtonElement | null>;
};
```

Renders `null` when `!open`. Otherwise an `AttentionMenuFrame` (§5) with:

- Panel testid `wizard-step3-card-${dfid}-review-attention-menu`, `role="group"`, `aria-label` "Needs a look" when `n > 0`, else "Judgment calls".
- Lead heading outside the scroller (published "Needs you" placement): "Needs a look", testid `wizard-attention-needslook-heading`, only when `n > 0`.
- Scroller `aria-label="Warnings to review"`.
- One `AttentionMenuRow` per `needsLook` entry: testid `wizard-step3-card-${dfid}-attention-row-${entry.index}`, dot `bg-status-review`, sr text "needs review: ", title `reviewWarningTitle(entry.warning)` (`lib/admin/reviewWarningTitle.ts`, invariant 5), second line `entry.sectionLabel` (truncating), trailing "→". Select = `onClose(); onNavigate(entry)`.
- Judgment group when `m > 0`: sunken heading "Judgment calls" (testid `wizard-attention-judgment-heading`; `border-t border-border` when a needs-look group precedes it, `rounded-t-md` when it leads), then rows as above with dot `bg-text-faint`, sr text "judgment call: ". Rows are pressable: a judgment call has a destination.
- No row cap. The scroller is `max-h-96 overflow-y-auto` under `useFitWithinClip`; every entry renders (an index that hides entries is the defect this spec fixes).
- Open with empty `attention` cannot occur: the modal derives `menuEffectivelyOpen = menuOpen && !isDirtyRescan && n + m > 0` (§3.5).

### 3.4 Jump

- `Step3ReviewModal` holds `const [jump, setJump] = useState<AttentionJump | null>(null)` and `jumpNonceRef`. `navigateTo(entry)` sets `{ itemId: entry.id, sectionId: "warnings", nonce: ++jumpNonceRef.current }` and the modal passes `attentionJump={jump}` to `ShowReviewSurface` (its first attention prop; the other attention props stay absent).
- The wizard warning `<li>` in `step3ReviewSections.tsx` (the `rows.map` branch carrying `data-warning-index={i}`) gains `data-attention-anchor={\`warning:${i}\`}`. The surface's existing effect scrolls to it with the §A2 suppression and sets `data-step3-warning-flash` (`app/globals.css` `@keyframes step3-warning-flash`), the same flash `jumpToWarning` applies. `hashSync` is false in the modal, so no `replaceState`.
- Anchor missing → `handleNavClick("warnings")`, section top, no flash (existing degradation).
- `warning:<index>` is disjoint from the published `alert:<uuid>` / `hold:<id>` / `warnings:<sectionId>` namespaces.

### 3.5 Footer and open state

Footer note (testid `wizard-step3-card-${dfid}-review-note`), non-dirty branch:

| Condition | Text |
|---|---|
| `n > 0` | "{n} to review · publishing isn't blocked" |
| `n === 0 && m > 0` | "{m} parsed with judgment · publishing isn't blocked" |
| `n + m === 0` | "All clear to publish" |

Dirty-rescan and finalize-demoted footers untouched.

- `const [menuOpen, setMenuOpen] = useState(false)`; `pillInteractive = !isDirtyRescan && n + m > 0`; `menuEffectivelyOpen = menuOpen && pillInteractive`. The menu mounts only under `pillInteractive`, so the dirty-rescan span and the All clean span never coexist with a panel.
- Reconciliation (the published "Compound reconciliation" precedent, `PublishedReviewModal.tsx`): an effect with deps `[pillInteractive, menuOpen]` calls `setMenuOpen(false)` whenever `menuOpen && !pillInteractive`. So warning→dirty and count→0 both close the menu and clear the state, and dirty→warning always starts closed; a menu can never reappear already open.
- Auto-open once per mount: the published effect minus its `alertId` arm — `useRef(false)` guard; if `!pillInteractive`, return WITHOUT consuming (a dirty rescan on arrival defers the one-shot until the sheet is re-approved and the pill is interactive again, which is the moment the operator needs the index); if `menuOpen`, consume; if `n === 0`, return; else `requestAnimationFrame(() => { fired = true; setMenuOpen(true) })`, frame cancelled on cleanup, guard consumed only inside the callback. Deps `[n, menuOpen, pillInteractive]`.
- Close paths: Escape (frame, capture phase, focus to pill), pointerdown outside panel + pill, focus moving outside, row activation, the reconciliation effect (dirty rescan, count 0), modal unmount.

## 4. Part B: published modal (`PublishedReviewModal.tsx`)

### 4.1 Counts

```ts
const sheetWarnings = useMemo(() => {
  const defs = /* the registry the surface renders; step3Sections(data) */;
  const entries = defs.flatMap((s) =>
    (routedWarnings.activeWarningsBySection[s.id] ?? []).map((warning, i) => ({
      id: `warnings:${s.id}`, sectionId: s.id, warning, ordinal: i })));
  return deriveWarningAttention(entries, defs);
}, [routedWarnings, data]);
const k = sheetWarnings.all.length;
```

Registry order, then per-section active order (`SectionWarningModel.active` is "in routed order"). `id` is the section anchor (§4.4), shared by every warning of one section on purpose; React keys use `${id}:${ordinal}`. `k` counts ACTIVE rows only, so ignoring a warning decrements the pill exactly as it empties the rail dot (`lib/admin/routedWarnings.ts` "ACTIVE, not total").

`interactive = needsYou.length > 0 || k > 0 || selfHeal.length > 0`; `monitoringOnly = needsYou.length === 0 && k === 0 && selfHeal.length > 0`. The compound reconciliation effect that closes the menu when the pill stops being interactive reads the new `interactive`.

### 4.2 Pill segments

Segments render in order, each only when its count > 0, with the existing between-segments-only middot rule (`2026-07-21-attention-needs-attention-split.md` §3.2):

1. `{needsYou} issues` / `1 issue` — unchanged.
2. `{k} sheet warnings` / `1 sheet warning` — testid `attention-pill-warnings-segment`, same ink as segment 1 (`text-warning-text` on the amber pill), no alpha: a warning is work, not monitoring. 99+ cap as segment 1. Rendered as ONE wrap unit exactly like the monitoring segment: a `<span className="inline-flex items-center gap-1.5">` that contains its leading separator (`{needsYou.length > 0 ? <span className="opacity-50">{" · "}</span> : null}`) and its text, so under `max-sm:flex-wrap` the middot can never orphan at the end of a line (the round-4 critique F3/P3 defect the monitoring wrapper exists to prevent, `PublishedReviewModal.tsx` comment above `attention-pill-monitoring-segment`). The monitoring segment's own separator condition becomes `needsYou.length > 0 || k > 0`.
3. `{selfHeal} monitoring` — unchanged, including its `/80` alpha and the wrap-unit wrapper.

The amber branch's `title` attribute, dot, chevron and classes are unchanged. Monitoring-only quiet branch unchanged. Degraded ("Alerts unavailable") and "In sync" spans unchanged in markup; "In sync" is now reachable only when `needsYou`, `k`, and `selfHeal` are all 0.

### 4.3 Menu group

`AttentionMenu` gains ONE optional prop, ABSENT → byte-identical. Entries and their handler travel together so the type cannot express a list with no handler:

```ts
export type SheetWarningEntry = WarningAttentionEntry<{ id: string; sectionId: SectionId; warning: ParseWarning; ordinal: number }>;
warningIndex?: { entries: readonly SheetWarningEntry[]; onNavigate: (entry: SheetWarningEntry) => void };
```

`const sheetWarningRows = warningIndex?.entries ?? []` inside the panel; the group renders when `sheetWarningRows.length > 0`. `PublishedReviewModal` passes the prop only when `k > 0` (spread-inserted, exactOptional discipline), so a warning-free render passes nothing and the panel's element tree is byte-identical to today's.

Body order: Needs you heading + rows (unchanged) → **Sheet warnings group** (when `sheetWarningRows.length > 0`) → Monitoring group (unchanged). The new group: heading "Sheet warnings" on a container with testid `attention-sheetwarnings-heading` (sunken eyebrow like Monitoring; `border-t border-border` when Needs you precedes it, `rounded-t-md` when it leads), then one `AttentionMenuRow` per entry, testid `attention-menu-row-${entry.id}:${entry.ordinal}`, dot `bg-status-review` for `needsLook` / `bg-text-faint` for `judgment`, sr text "needs review: " / "judgment call: ", title `reviewWarningTitle`, second line `sectionLabel` (truncating), select = `onClose(); warningIndex.onNavigate(entry)`. Panel `aria-label`: "Needs you" if present, else "Sheet warnings" if present, else "Monitoring". Monitoring group's `border-t` now keys on "any group above it", which is the same value it had when only Needs you existed.

### 4.4 Jump

`navigateWarning(entry)` sets `{ itemId: entry.id, sectionId: entry.sectionId, nonce }`. The active block wrapper in `sectionWarningExtras.tsx` (`<div data-testid={\`section-warning-active-${id}\`}>`) gains `data-attention-anchor={\`warnings:${id}\`}` ONLY when `activeGroups.length > 0` (spread-inserted; absent otherwise). Two cases leave that block without cards: the "empty-seam guard" returns `null` when `activeGroups` and `ignoredWarnings` are both empty, and when `activeGroups` is empty but ignored warnings exist the wrapper still renders around a `BulkIgnoreControls` that renders nothing, a zero-height element the surface's effect would otherwise treat as a hit and flash invisibly. With the attribute conditional, both cases miss the anchor lookup and the effect falls back to `handleNavClick(sectionId)`: section top, no flash. In every other case the jump scrolls to that section's warning cards and flashes the block. `hashSync` is true on the page layout, so the hash updates as for any attention jump. The crew section can reach the empty-active state while `k` still counts its warnings (they render under crew rows and stay in `model.active`); those rows jump to the crew section top (§10).

### 4.5 Auto-open

Unchanged: `actionable.length > 0` only.

## 5. Shared frame: exported from `AttentionMenu.tsx`, not a new file

`AttentionMenuPanel` owns behavior the wizard needs verbatim: the mount-scoped entrance rAF, the Escape/pointerdown/focusin document listeners, `useFitWithinClip(entered)`, the panel + scroller markup, the row button markup. Split it into two exported components that STAY in `components/admin/showpage/AttentionMenu.tsx`:

```ts
export function AttentionMenuFrame(props: {
  testId: string;
  ariaLabel: string;        // panel group name
  scrollerLabel: string;    // nested scroller group name
  pillRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  heading?: ReactNode;      // between the panel edge and the scroller; absent → nothing rendered there
  children: ReactNode;      // inside the scroller
}): JSX.Element;

export function AttentionMenuRow(props: {
  testId: string;
  dotClassName: string;
  srText: string;
  title: string;
  secondLine: string | null;      // null → the second-line <span> is not rendered (today's `secondLine ? … : null`)
  truncateSecondLine: boolean;    // true → `truncate` on the second line (today's `hint ? "" : "truncate"`)
  onSelect: () => void;
}): JSX.Element;
```

`AttentionMenu` keeps `if (!open) return null;` and renders `<AttentionMenuFrame testId="published-show-review-attention-menu" ariaLabel={…} scrollerLabel="Attention items" heading={needsYou heading | undefined}>` with needs-you rows as `AttentionMenuRow`, the Sheet warnings group, and the Monitoring group as children. Class strings, testids, roles, `tabIndex`, `aria-label`s, listener registration order, entrance and fit semantics move within the file without edit. WizardAttentionMenu.tsx imports both and renders NO overlay markup of its own.

Why the same file: the structural registries key on this file by path, and several by line. Keeping the overlay and the divider in `AttentionMenu.tsx` leaves every path-keyed row valid and reduces the fallout to line re-measurement:

- `tests/components/admin/showpage/popoverOverlayRegistry.ts`: the `AttentionMenu.tsx` / `published-show-review-attention-menu` row stays as is (the panel markup and the literal `useFitWithinClip` import remain in that file). `_metaPopoverPlacementContract.test.ts` `liveExtraction` walks `components/**` for overlay markup; WizardAttentionMenu.tsx contains none, so it gets NO row (a row with no detectable overlay is rejected as stale).
- `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts`: the `useFitWithinClip` consumer row stays on `AttentionMenu.tsx`.
- Line-keyed rows that necessarily move and are re-measured by running each scanner (the plan carries the before/after numbers): `tests/styles/controlOutlineScan.ts` `CENSUS` rows for `Step3ReviewModal.tsx` (two controls, at lines 604 and 688 at drafting time), `PublishedReviewModal.tsx` (line 979 at drafting time, the pill) and the `DIVIDERS` row `AttentionMenu.tsx:189`; `tests/styles/_metaControlOutlineFill.test.ts` `HOVER_SUBTLE` entry `PublishedReviewModal.tsx:979`; `tests/styles/tapTargetCensus.ts` `TAP_TARGET_CENSUS` row for `Step3ReviewModal.tsx` (line 205 at drafting time); `tests/styles/controlOutlineResidue.ts` `AttentionMenu.tsx` row; `tests/styles/_metaControlOutlineResidue.test.ts` divider helper, refusal case, acceptance case and blind-oracle list, which hardcode `AttentionMenu.tsx` (path stays valid) and `AttentionMenu.tsx:189` (line re-measured).
- New interactive sites the scanners will see: the wizard pill button (same recipe as the published pill; `controlOutlineScan.ts` `CENSUS` gets a row modelled on the `PublishedReviewModal.tsx` pill row, `_metaControlOutlineFill` `HOVER_SUBTLE` likewise if its classifier flags the hover fill) and the `AttentionMenuRow` sites now rendered from two callers (one divider row, one file).
- `tests/components/admin/showpage/pageTransitions.test.tsx` `PAGE_COMPONENT_COUNTS`: `AttentionMenu.tsx` count re-measured; WizardAttentionMenu.tsx ADDED with its measured count (this is the fail-by-default source inventory for its conditional sites, since `step3ReviewModal.transitions.test.tsx` scans only `Step3ReviewModal.tsx`). `tests/components/admin/transitionAudit.test.tsx` `SERVER_RENDERED`: WizardAttentionMenu.tsx added (no mount animation classes; the panel's entrance is `transition-[opacity,transform]`, which the sweep's regex does not match, as it does not match it in `AttentionMenu.tsx` today).
- `tests/components/admin/useFitWithinClip.test.tsx` (h17) pins the panel's attach lifecycle; the frame keeps the same ref-callback shape.

## 6. Copy (single source; tests reference these strings)

| Key | String |
|---|---|
| wizard.pill.needsLook | `{n} need a look` / `1 needs a look` |
| wizard.pill.judgment | `{m} judgment calls` / `1 judgment call` |
| published.pill.warnings | `{k} sheet warnings` / `1 sheet warning` |
| pill.separator | ` · ` (real text node, visible and announced) |
| pill.cap | `99+` + sr-only `({exact} {noun})` |
| wizard.menu.heading.needsLook | `Needs a look` |
| wizard.menu.heading.judgment | `Judgment calls` |
| wizard.menu.scroller | `Warnings to review` |
| published.menu.heading.warnings | `Sheet warnings` |
| row.sr.needsLook | `needs review: ` |
| row.sr.judgment | `judgment call: ` |
| wizard.footer.needsLook | `{n} to review · publishing isn't blocked` |
| wizard.footer.judgment | `{m} parsed with judgment · publishing isn't blocked` |
| wizard.footer.clean | `All clear to publish` |

No em dashes. No raw codes (titles go through `reviewWarningTitle`).

## 7. Guard conditions

| Input | Behavior |
|---|---|
| Wizard: `data.warnings` empty or all info | `n = m = 0`; "All clean" span (byte-identical); footer "All clear to publish"; no wrapper, no menu. |
| Published: no active warn rows | `k = 0`; `warningIndex` not passed; pill and menu byte-identical to today. |
| Warning with unknown `blockRef.kind` or no `blockRef` | Routes to `"warnings"`, label "Sheet warnings"; counted and listed (I-3). |
| Warning whose `message` is a raw code and code not cataloged | `reviewWarningTitle` fallback "A parse issue was recorded for this sheet."; never blank, never a code. |
| Agenda-kind warning while agenda not rendered | Degrades to `"warnings"` (existing `warningsBySection` rule). |
| Any segment count > 99 | "99+" visible, exact count sr-only. |
| Wizard row whose `<li>` is absent | `handleNavClick("warnings")`. |
| Published row whose section block is absent or renders no cards (crew under-row case; ignored-only section) | No anchor attribute (§4.4) → `handleNavClick(sectionId)`, section top, no flash. |
| `isDirtyRescan` flips true while the menu is open | Reconciliation effect closes it; the "Sheet changed" span renders; `menuOpen` is false when the dirty state clears. |
| `isDirtyRescan` with `n + m > 0` | "Sheet changed" span wins; no pill, no menu (existing precedence). |
| Rescan / ignore drops the count to 0 while the menu is open | `menuEffectivelyOpen` false → panel unmounts; wizard chip becomes the "All clean" span; published pill follows the existing reconciliation effect. |
| `isPublishRunActive` | No effect on pill or menu (navigation only). |
| Modal closes while menu open | Whole tree unmounts; listeners and rAF cleaned up by the frame's effects. |
| Two entries with the same title | Both listed; second line + jump target disambiguate. Published rows in one section share `id` but differ by `ordinal` in key and testid. |
| `deriveWarningAttention` given an info-severity or unlabelable entry | Throws (caller bug). Both callers are structurally warn-only and registry-labelled; the throw is a tripwire, pinned by a unit test. |

## 8. Transition inventory

Wizard pill states: SheetChanged (S), AllClean (A), NeedsLook (N), Composite (C), JudgmentOnly (J). Every pair is data-driven (parse or rescan) and instant, matching the existing "§11 T10: instant" declaration; the menu state on each is fixed by the §3.5 reconciliation:

| Pair | Treatment |
|---|---|
| S↔A | instant — no animation; no menu on either side |
| S↔N | instant; menu closed on both sides (S has none; entering N starts closed, auto-open may fire once if never consumed) |
| S↔C | instant; as S↔N |
| S↔J | instant; as S↔N, and J never auto-opens |
| A↔N | instant; A has no menu; entering N starts closed |
| A↔C | instant; as A↔N |
| A↔J | instant; as A↔N |
| N↔C | instant; menu state preserved (both interactive), rows re-render |
| N↔J | instant; menu state preserved, rows re-render |
| C↔J | instant; menu state preserved, rows re-render |

Published pill states gain no new transition pair beyond the segment's mount/unmount. Published pill: the new segment mounts/unmounts instantly like its siblings (`pageTransitions.test.tsx` "instant omit/mount that follows data"). Menu closed → open: motion-safe fade + scale-95→100 over `duration-fast ease-out-quart`, `motion-reduce:transition-none` (frame, unchanged). Open → closed: instant unmount. Chevron: `rotate-180` over `transition-transform duration-fast`.

| A changes while B… | Treatment |
|---|---|
| Pill state swaps while menu open | Count still > 0: menu stays open, rows re-render instantly. Count 0: menu unmounts instantly with the swap. |
| Row click during entrance | Close is instant; jump proceeds (published §9 "close FIRST, then navigate"). |
| Auto-open rAF pending while modal closes | rAF cancelled; guard unconsumed; nothing opens. |
| Escape during entrance | Menu unmounts; modal stays; focus to pill. |
| Jump flash active when another row is clicked | `clearWarningHighlight` first: one flash at a time (existing). |
| Published: warning ignored while the menu lists it | `routedWarnings` recomputes; the row disappears instantly; if `k` and the other counts hit 0 the reconciliation effect closes the menu. |

## 9. Dimensional invariants

- Wizard pill visible box ≈ 24px; hit band ≥ 44px via `before:-inset-y-3` on the `relative` button. Playwright: `document.elementFromPoint` at pill center ± 20px vertically resolves to the button; the computed insets of the before pseudo-element span ≥ 44px.
- Every `AttentionMenuRow` is `min-h-tap-min`: Playwright `getBoundingClientRect().height >= 44` for each row on both surfaces.
- Panel `w-[min(400px,calc(100vw-32px))]`, `absolute top-[calc(100%+8px)] right-0` in the `relative min-w-0` wrapper; must stay inside the `ReviewModalShell` clip (`useFitWithinClip`). Playwright: panel right/bottom ≤ clip right/bottom at 375×667 and 1280×800 on the wizard modal (the published modal is already covered by `tests/e2e/popover-clip-fit.spec.ts` T3).
- Neither header cluster is a fixed-dimension parent; no stretch relationship to declare.

## 10. Documented limits

- The badge and the pill can still differ: the badge is the parser data-gap digest, the pill is every warn-severity warning (published: every ACTIVE one). Direction is fixed (pill ≥ badge for the wizard; for published, ignoring a warning lowers the pill while the badge, which reads `parse_warnings`, does not move). Aligning the badge to the pill changes the dashboard aggregate and the regression-gate universe (`2026-07-07-ambiguity-warnings-v1-design.md` §3.3); out of scope.
- The published fix hints (`lib/admin/needsLookHints.ts`) are keyed on alert codes; warning rows show the section label instead. A per-warning hint is a follow-up if wanted (`messageFor(code).helpfulContext` already renders on the card the jump lands on).
- Focus after a row click lands on `document.body` (menu unmounts). Accepted per the DEFERRED.md entry in §1.1.
- Published crew-scoped warnings that render under crew rows jump to the crew section top, not the row.

## 11. Out of scope

- Step 3 summary line (`Step3Review.tsx`), card chrome, `DataQualityBadge`, dashboard row.
- Published auto-open semantics.
- New catalog copy or §12.4 rows.

## 12. Tests (TDD per task; each names the failure it catches)

Unit (new file tests/lib/admin/warningAttention.test.ts):

1. Partition by `isAmbiguityCode`; input order preserved in `all` and per group. Catches: counting sections; reordering.
2. I-1 property over every `GAP_CLASSES` code, every `AMBIGUITY_CODES` code, and every `BENIGN_WARN_CODES` ∪ `ASSET_WARN_CODES` member (imported, per §2): `all.length >= summarizeDataGaps(w).total`, with `premise` asserting the non-gap set is non-empty. Catches: a universe narrower than the badge.
3. I-2: for each registry section, `sectionStatus` agreement with entry tones. Catches: routing drift between rail and menu.
4. Unmapped warning → `sectionLabel === "Sheet warnings"` read from the registry, not hardcoded.
5. Throws on an info-severity entry and on an unlabelable `sectionId`.

Wizard component (`tests/components/admin/wizard/Step3ReviewModal.test.tsx` extended; `expectedFlagged` rewritten to count warnings):

6. Two non-ambiguity warnings in ONE section → chip "2 need a look". This is the reported bug; today it reads "1 needs a look".
7. Judgment-only fixture → quiet pill "1 judgment call", footer "1 parsed with judgment · publishing isn't blocked", no "All clean".
8. Composite → textContent "2 need a look · 1 judgment call"; judgment segment carries `text-warning-text/80`.
9. Button states carry `aria-expanded` / `aria-controls` → the menu wrapper; the All clean and Sheet changed spans carry neither and have no `relative` wrapper (assert the chip's parent is the cluster div).
10. Auto-open: needs-look fixture opens after one frame; judgment-only does not; an already-open menu consumes the one-shot; a needs-look fixture mounted with `isDirtyRescan` does not open and does not consume, and opens once after `isDirtyRescan` flips false. Rerender to `isDirtyRescan` while open → menu unmounted and `aria-expanded` gone with the span.
11. Row click → `ShowReviewSurface` receives `itemId "warning:<index>"`, `sectionId "warnings"`; the `<li data-attention-anchor="warning:<index>">` gains `data-step3-warning-flash`; menu closed. Assert on the `<li>`, not a container that also renders the title.
12. Escape closes only the menu and focuses the pill; second Escape closes the modal.
13. Outside pointerdown and focus-out close the menu.
14. 100 needs-look warnings → "99+ need a look" visible, sr-only "(100 need a look)", 100 rows rendered.
15. T-STEP3-INVARIANT (`reviewModalShell.test.tsx`) passes with the committed baseline unchanged.

Published component (`tests/components/admin/showpage/publishedReviewModal.test.tsx`, `attentionMenuGroups.test.tsx` extended):

16. Zero attention items + 3 active warn rows → interactive pill "3 sheet warnings", not "In sync". This is the second reported bug. The existing "In sync" test keeps its warning-free fixture and still passes.
17. `attentionItems` present + warnings → "2 issues · 3 sheet warnings"; + self-heal → "2 issues · 3 sheet warnings · 1 monitoring"; separator only between present segments (no leading middot when issues = 0).
18. Menu with warnings renders the Sheet warnings group between Needs you and Monitoring; rows are BUTTONs with no `<a>`; click order `["close", "navigate"]`; row tone dot follows `isAmbiguityCode`.
19. Row click → `attentionJump` `{ itemId: "warnings:<sectionId>", sectionId }`; the `section-warning-active-<id>` block (with `data-attention-anchor`) flashes. Ignored-only section: the block renders WITHOUT the anchor attribute and the jump lands on the section top with no flash attribute anywhere in the scroller.
20. Ignoring the last active warning of the only section drops the pill to "In sync" and closes the menu (reconciliation).
21. All existing published suites pass; `pageTransitions.test.tsx` and `transitionAudit.test.tsx` counts re-measured and updated with the scanner output quoted in the commit.

Real browser (Playwright, new file tests/e2e/wizard-attention-menu.spec.ts on the wizard modal harness `tests/e2e/_step3ReviewModalHarness.tsx`): the §9 measurements; panel within the shell clip at 375px; row click scrolls the Sheet warnings `<li>` into the scroller viewport and it carries the flash attribute. Published: extend `tests/e2e/published-show-attention.spec.ts` with a seeded warn row → "sheet warnings" segment present and its row jumps into the section block. DB-touching e2e runs wait for the local Postgres slot holder assignment from bl-orch (fleet rule 1).

## 13. Meta-test inventory

- `tests/log/_metaMutationSurfaceObservability.test.ts`: no new mutation surface. N/A.
- `tests/styles/_metaSubtleOnInteractive.test.ts`: no subtle resting ink on either button. No row.
- `tests/styles/_metaEmDashCopy.test.ts`: new strings are middot/period only.
- `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` + `popoverOverlayRegistry.ts`: existing `AttentionMenu.tsx` row unchanged; no row for WizardAttentionMenu.tsx (§5).
- `tests/components/admin/showpage/pageTransitions.test.tsx`: WizardAttentionMenu.tsx enrolled with its measured count (§5).
- `tests/docs/_metaInvariant8Closeout.test.ts`: plan carries `impeccable-gate:`.
- `tests/messages/*`, `tests/cross-cutting/codes.test.ts`: untouched.
- Advisory-lock, Supabase call-boundary, DB matrices: N/A (no server/DB code).

## 14. Citation ledger (verified against `origin/main` at `66c9857f5`, 2026-08-27; anchors are file + symbol, line numbers are drafting-time locators)

| Claim | Anchor |
|---|---|
| Row badge counts data gaps | `components/admin/wizard/Step3SheetCard.tsx` `const gaps = summarizeDataGaps(warnings)`; `<DataQualityBadge slug={dfid} dataGaps={gaps} />`; `components/admin/DataQualityBadge.tsx` `gapLabel` |
| `summarizeDataGaps` skips info, counts `DATA_GAP_CODES` | `lib/parser/dataGaps.ts` `export function summarizeDataGaps` |
| Modal counts flagged sections | `components/admin/wizard/Step3ReviewModal.tsx` `const flaggedCount = useMemo(` |
| Chip ternary and cluster | `Step3ReviewModal.tsx` `flex shrink-0 items-center gap-2` then `isDirtyRescan ? … : flaggedCount > 0 ? … : …` |
| Footer note | `Step3ReviewModal.tsx` `to review · publishing isn't blocked` |
| Published pill derivation | `components/admin/showpage/PublishedReviewModal.tsx` `const live`, `const needsYou`, `const selfHeal`, `const interactive`, `const monitoringOnly` |
| Published "In sync" span | `PublishedReviewModal.tsx` `In sync` (the last pill branch) |
| Published pill button, segments, 99+ cap, monitoring segment wrapper | `PublishedReviewModal.tsx` `ref={pillRef}`, `attention-pill-monitoring-segment` |
| Published auto-open, `navigateTo`, reconciliation | `PublishedReviewModal.tsx` `autoOpenFiredRef`, `const navigateTo`, "Compound reconciliation" comment |
| `routedWarnings` derivation, ACTIVE semantics, `activeWarningsBySection` | `PublishedReviewModal.tsx` `deriveRoutedWarnings(bySection)`; `lib/admin/routedWarnings.ts` |
| `SectionWarningModel.active` routed order, `SectionWarningItem` | `lib/admin/sectionWarningModel.ts` |
| Published active block wrapper, empty-seam guard | `components/admin/showpage/sectionWarningExtras.tsx` `section-warning-active-${id}`, "Empty-seam guard" |
| `warningsBySection`, `sectionStatus` | `lib/admin/step3SectionStatus.ts` |
| `isAmbiguityCode`, `AMBIGUITY_CODES` | `lib/parser/ambiguityCodes.ts` |
| `severity: "info" \| "warn"` | `lib/parser/types.ts` `ParseWarning` |
| Registry labels; `"warnings"` → "Sheet warnings" | `components/admin/wizard/step3ReviewSections.tsx` `export function step3Sections`, `Step3SectionDef` |
| Warning `<li data-warning-index={i}>` | `step3ReviewSections.tsx` `rows.map((w, i) =>` list branch |
| `jumpToWarning`, flash attribute, `attentionJump` effect, anchor lookup, fallback | `components/admin/review/ShowReviewSurface.tsx` |
| `AttentionJump` | `ShowReviewSurface.tsx` `export type AttentionJump` |
| Flash keyframes | `app/globals.css` `@keyframes step3-warning-flash` |
| `AttentionMenu` panel, listeners, row button, groups | `components/admin/showpage/AttentionMenu.tsx` `AttentionMenuPanel` |
| `useFitWithinClip(reapplyKey)` | `components/admin/useFitWithinClip.ts` |
| `reviewWarningTitle` | `lib/admin/reviewWarningTitle.ts` |
| Shell bubble-phase Escape | `components/admin/review/ReviewModalShell.tsx` (per `AttentionMenu.tsx` header comment) |
| Judgment chip tone | `Step3SheetCard.tsx` `const judgmentChip` |
| Row focus non-restoration accepted | `DEFERRED.md` "Accepted, not fixed, in the index consolidation" |
| Header baseline pin | `tests/components/admin/review/reviewModalShell.test.tsx` T-STEP3-INVARIANT; `tests/helpers/step3HeaderBaseline.ts`; `tests/components/admin/review/__fixtures__/step3-header-baseline.html` |
| Conditional-site audit | `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` (`§11 … instant — deliberate` marker rule); `tests/components/admin/showpage/pageTransitions.test.tsx` per-file counts |
| Popover registries | `tests/components/admin/showpage/popoverOverlayRegistry.ts`, `_metaPopoverPlacementContract.test.ts`, `_metaSharedHelperAdoption.test.ts` |
| Existing chip tests | `tests/components/admin/wizard/Step3ReviewModal.test.tsx` `expectedFlagged`; `step3ReviewModal.transitions.test.tsx` `"1 needs a look"` |
| Published pill/menu tests | `tests/components/admin/showpage/publishedReviewModal.test.tsx` ("In sync: zero items"), `attentionMenu.test.tsx`, `attentionMenuGroups.test.tsx` |
| Vocabulary split | `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` §2.1, §2.4 |
