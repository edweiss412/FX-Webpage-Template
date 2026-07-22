# Spec: retire the duplicate "Content we couldn't read" callout + alert-surface polish

**Date:** 2026-07-21
**Slug:** `unread-callout-dedup`
**Author:** Opus (Claude Code), autonomous ship
**Surface:** Admin show-review modal (published + wizard). UI-only.

---

## 1. Problem

The admin show-review modal renders the same unparsed sheet rows **twice**, and three smaller alert-surface issues sit alongside. The five problems, numbered canonically (referenced by these numbers everywhere below):

- **Problem 1 (the bug): duplicate render.** The unparsed `raw_unrecognized` rows render as (a) routed, actionable "Unrecognized row in sheet" anchored cards (eyebrow `UNRECOGNIZED ROW IN SHEET`, per-row Report / Ignore / Ignore-all) at their content section, AND (b) a bare read-only "Content we couldn't read (N)" bottom callout with no controls, no section-chrome eyebrow, no rail nav entry, rendered via the shell's `bottomSlot`. Both derive from the **same** rows. The bottom callout is a pre-routing surface (originating spec `2026-07-07` section C) never retired when the anchored cards (attention-alert-routing PRs #524, #526, #529) took over. It is the exact "duplicate with no controls" that `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md` section 3.2 already removed from the Parse-warnings **list**; the `bottomSlot` copy is the one instance that trim missed.
- **Problem 2: count desync.** The "Parse warnings" section header renders a `(0)` chip next to a "Needs a look" badge at the same time. The zero is the *routed* count (warn-severity rows are filtered from the panel list because they render as anchored cards); the badge fires because routed warnings exist. A zero count beside a "Needs a look" badge is self-contradictory.
- **Problem 3: vocabulary.** The same concept was named three ways ("Content we couldn't read", "Unrecognized row in sheet", "Parse warnings"). Retiring the bottom callout (Problem 1) deletes "Content we couldn't read" entirely, collapsing this to standard container/item naming with no further copy churn (see Fix D).
- **Problem 4: opaque clearing pill.** The modal header pill reads a bare "N clearing" with no accessible explanation of what "clearing" means.
- **Problem 5: orphan chrome.** The bottom callout has no rail entry and no section eyebrow, so it reads as visually detached from the section system. This is a symptom of Problem 1 and is dissolved by Fix A (the element is removed).

### 1.1 Resolved scope, do not relitigate

Ratified decisions. Verify each contract at its cited location (a `file:line` for code claims, a doc `file` + section for ratifications); do not re-derive.

- **No-drop is a superset guarantee, established by an end-to-end code trace and enforced by the section 3 real-render tests (not by prose inference).** Scoped claim: *the surviving warnings surface renders a superset of what the callout rendered, so removing the callout cannot hide any unrecognized row.* Five verified links:
  1. **Single origin, co-emitted.** `emitUnknownField` (`lib/parser/warnings.ts:323`) is the only producer of `raw_unrecognized` (one `agg.rawUnrecognized.push`, `lib/parser/warnings.ts:337`) and co-pushes a `UNKNOWN_FIELD` warn in the same call (`lib/parser/warnings.ts:332`). Every writer of the persisted column feeds from a `ParseResult` carrying **both** arrays — `applyParseResult` (`lib/sync/applyParseResult.ts:264`), `enrichWithDrivePins` (`lib/sync/enrichWithDrivePins.ts:402`), and the cron path (`lib/sync/runScheduledCronSync.ts:1813`) — so no writer persists raw content without its warnings.
  2. **Atomic co-persistence.** Both columns are written in one upsert: `insert into public.shows_internal (... parse_warnings, raw_unrecognized ...)` (`lib/sync/runScheduledCronSync.ts:1796`) `... on conflict do update set parse_warnings = excluded.parse_warnings` (`lib/sync/runScheduledCronSync.ts:1801`)`, raw_unrecognized = excluded.raw_unrecognized` (`lib/sync/runScheduledCronSync.ts:1802`). A persisted raw row therefore always has its warning persisted alongside; there is no stored-raw-without-warning shape, and no separate legacy writer exists (the three writers above are the complete set). The one carry-forward/reconstruction read path carries **both** columns from the same prior row — `raw_unrecognized: internal?.raw_unrecognized ?? []` (`lib/sync/runScheduledCronSync.ts:944`) sits directly beside `warnings: internal?.parse_warnings ?? []` (`lib/sync/runScheduledCronSync.ts:945`), both read from one `select parse_warnings, raw_unrecognized` on `shows_internal` (`lib/sync/runScheduledCronSync.ts:897`) — so pairing survives reconstruction; there is no carry-forward path that advances raw content without its warnings.
  3. **Total routing to a rendered bucket.** `warningsBySection` (`lib/admin/step3SectionStatus.ts:84`) sends every warn-severity warning to its mapped section or, failing that, the `"warnings"` fallback bucket (the else arm is literally `"warnings"`, `lib/admin/step3SectionStatus.ts:92`) — no drop branch. Routed warns render as anchored cards via `buildSectionWarningExtras` (`components/admin/showpage/PublishedReviewModal.tsx:253`, passed as `renderSectionExtras`, `components/admin/showpage/PublishedReviewModal.tsx:743`); when routing is off (the staged wizard, `mode="rescan"`, `components/admin/wizard/step3ReviewSections.tsx:3975`) the Parse-warnings list renders **all** rows (`visibleWarningRows` returns the full array, `lib/admin/visibleWarningRows.ts:22`; the body maps `count={rows.length}`, `components/admin/wizard/step3ReviewSections.tsx:987`).
  4. **Superset on the cap axis.** The deleted callout truncated at 50 rows (`RAW_UNRECOGNIZED_CAP`, in the deleted `lib/admin/rawUnrecognized.ts`). The warnings surface has **no** row cap — the section-4.3 cap constants cover crew/rooms/hotels/pack/schedule only (`components/admin/wizard/step3ReviewSections.tsx:151`), none for warnings — so it renders at least as many rows as the callout ever did.
  5. **Distinct rows are never collapsed.** `operatorActionableWarnings` (`lib/parser/dataGaps.ts:409`) dedups only by resolved-cell A1, and warnings without a resolved `sourceCell` are never deduped (`lib/parser/dataGaps.ts:398`). Distinct `raw_unrecognized` rows come from distinct sheet rows (distinct cells), so no two collapse — matching the observed four separate "Unrecognized row in sheet" cards for the four rows in the reference show.
- **Scoped behavior change (documented, not a drop): ignored rows.** The callout listed every raw row regardless of ignore state; after removal an *ignored* `UNKNOWN_FIELD` row appears in its section's "Ignored (N)" disclosure instead of inline in the callout. It stays visible (one disclosure toggle) and now behaves exactly like every other ignored warning — an intentional consistency gain, not a content drop. Section 3 covers an ignored-row fixture to pin it.
- **`lib/admin/rawUnrecognized.ts` and its `buildRawUnrecognizedView` are deleted with the callout.** They are consumed **only** by `RawUnrecognizedCallout` (`components/admin/wizard/step3ReviewSections.tsx:107` imports `buildRawUnrecognizedView`; `components/admin/wizard/step3ReviewSections.tsx:3552` calls it) and their own unit test (`tests/admin/rawUnrecognized.test.ts`). The `/admin/dev` surface renders raw chunks with its own inline JSX off `result.rawUnrecognized` (`app/admin/dev/page.tsx:304`) and does **not** import the lib. Deleting the lib is dead-code elimination, not a behavior change.
- **The generic `bottomSlot` prop on `ShowReviewSurface` is removed.** After both production call-sites go, it has zero production producers (`grep 'bottomSlot='` in `components/` and `app/` finds only the two modal files). One test — `tests/components/admin/showpage/changesSection.test.tsx` — also builds a harness passing `bottomSlot={<RawUnrecognizedCallout .../>}` (`tests/components/admin/showpage/changesSection.test.tsx:199`) and asserts the callout's section-5.3a DOM position (`tests/components/admin/showpage/changesSection.test.tsx:224`). That test is **edited** (Fix A): its harness drops the prop and the import, its callout-ordering assertions are removed, and its real subject (Changes-is-last plus `#changes` anchor) is retained. A prop with no production producers and no consumers is dead surface; it is removed, not left as a zombie hook.
- **Count suppression is a general rule (Problem 2), not warnings-only.** `ModalSectionChrome` suppresses the `(count)` chip when `count === 0 && flagged` for any counted section. A zero next to a "Needs a look" badge is contradictory on every section; the badge is the signal. `judgment` sections are unaffected (they show `Parsed with judgment`, not a contradiction).
- **The clearing-pill fix is accessibility copy only (Problem 4).** The visible pill text stays exactly "N clearing" (space-constrained pill). A `title` plus `aria-label` supply the meaning. No visible-copy change, no state-machine change.
- **This spec supersedes the `2026-07-07` section C "Content we couldn't read" surface.** Retiring it is the point, not a regression.

---

## 2. The fixes

### Fix A, retire the duplicate callout (Problem 1, dissolves Problem 5)

Removals:

- `components/admin/showpage/PublishedReviewModal.tsx`: the `RawUnrecognizedCallout` import member (`components/admin/showpage/PublishedReviewModal.tsx:60`), the `bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}` prop (`components/admin/showpage/PublishedReviewModal.tsx:745`), and the now-stale comment that cites the callout as the established cross-domain import (`components/admin/showpage/PublishedReviewModal.tsx:245`; reword to reference the surviving `dateSummarySegments` / `CREW_CAP` imports instead of the removed symbol).
- `components/admin/wizard/Step3ReviewModal.tsx`: the `RawUnrecognizedCallout` import member (`components/admin/wizard/Step3ReviewModal.tsx:49`) and the `bottomSlot` prop (`components/admin/wizard/Step3ReviewModal.tsx:615`).
- `components/admin/wizard/step3ReviewSections.tsx`: the `RawUnrecognizedCallout` component (`components/admin/wizard/step3ReviewSections.tsx:3551`) and its `buildRawUnrecognizedView` import (`components/admin/wizard/step3ReviewSections.tsx:107`).
- `components/admin/review/ShowReviewSurface.tsx`: the `bottomSlot` prop, its type member (`components/admin/review/ShowReviewSurface.tsx:186`), the destructure (`components/admin/review/ShowReviewSurface.tsx:164`), and the render plus comment (`components/admin/review/ShowReviewSurface.tsx:1059`).
- `tests/components/admin/showpage/changesSection.test.tsx`: **edit, do not delete.** Remove the `RawUnrecognizedCallout` import, the `bottomSlot={...}` harness prop (`tests/components/admin/showpage/changesSection.test.tsx:199`), the `callout` element lookup and its two ordering assertions (`tests/components/admin/showpage/changesSection.test.tsx:215`, `tests/components/admin/showpage/changesSection.test.tsx:224`, `tests/components/admin/showpage/changesSection.test.tsx:225`), and the stale bottomSlot references in the header doc comment (`tests/components/admin/showpage/changesSection.test.tsx:15`, `tests/components/admin/showpage/changesSection.test.tsx:22`). Keep the Overview-precedes-warnings and Changes-is-last-with-`#changes`-anchor assertions.
- `lib/admin/rawUnrecognized.ts`: delete the file.
- `tests/admin/rawUnrecognized.test.ts`: delete (tests the deleted lib).
- `tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx`: delete (tests the deleted component).

**Behavioral guarantee (enforced by the section 3 tests, not merely asserted in prose):** removing the callout is a **no-op on the warnings-driven surfaces**. Anchored cards and the Parse-warnings list are driven by `warnings`, **independently** of `data.rawUnrecognized` — so the shape of `data.rawUnrecognized` (non-empty / empty / null / malformed) has **no** effect on whether a `UNKNOWN_FIELD` warning renders. The only thing `data.rawUnrecognized` ever drove was the now-removed callout. Concretely: for a non-empty `raw_unrecognized` with its co-produced `UNKNOWN_FIELD` warnings, every row's label remains visible via the warnings surface (anchored card, fallback bucket, or list) after removal (section 3, test 1); for empty/null/malformed `raw_unrecognized`, the callout previously rendered nothing and now the code path is gone (no new null path introduced — a prop and a component are removed).

### Fix B, suppress the contradictory zero-count (Problem 2)

`components/admin/wizard/step3ReviewSections.tsx`, `ModalSectionChrome`, the `showCount` computation (`components/admin/wizard/step3ReviewSections.tsx:742`):

```ts
// before
const showCount =
  count !== null && chrome.sectionId !== undefined && COUNT_SECTIONS.has(chrome.sectionId);
// after
const showCount =
  count !== null &&
  chrome.sectionId !== undefined &&
  COUNT_SECTIONS.has(chrome.sectionId) &&
  !(count === 0 && flagged);
```

`flagged` is already destructured from `chrome` at the top of `ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:689`). Header becomes "Parse warnings, Needs a look" (no zero chip). Non-flagged zero counts are unchanged (a clean "Crew (0)" still shows).

**Guard conditions for `count`:** `count` is typed `number | null` (the section body's `BreakdownSection` count). Reachable values are `null` (agenda; the existing `count !== null` guard already suppresses the chip, unchanged) and a **non-negative integer** (it is an array `.length` or a `visibleWarningRows(...).length`, `components/admin/wizard/step3ReviewSections.tsx:3962`). `NaN` is **not reachable** — no code path assigns a computed non-length to `count` — so no NaN branch is required; the section 3 test nonetheless documents the `null` case. `flagged` is a required `boolean` on `Step3SectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:444`), never null/undefined.

### Fix C, accessible clearing pill (Problem 4)

`components/admin/showpage/PublishedReviewModal.tsx`, the clearing-state pill span (`components/admin/showpage/PublishedReviewModal.tsx:681`): add `title` and `aria-label`:

```
aria-label={`${clearingCount} clearing on their own, no action needed`}
title={`${clearingCount} clearing on their own, no action needed`}
```

Visible text stays exactly `{clearingCount} clearing` (unchanged). Phrasing mirrors `AttentionMenu` (`components/admin/showpage/AttentionMenu.tsx:148`, "clearing on their own") but uses a comma, **not** an em-dash, to satisfy the mechanical em-dash ban in user-visible copy (`DESIGN.md` section 9; the `AttentionMenu` line's em-dash is a pre-existing latent case not touched here).

**Guard conditions:** `clearingCount = live.length - actionable.length` (`components/admin/showpage/PublishedReviewModal.tsx:273`) is a non-negative integer because `actionable` is a filtered subset of `live` (`actionable = live.filter((i) => i.actionable)`, `components/admin/showpage/PublishedReviewModal.tsx:272`), so `actionable.length <= live.length`. This branch only renders when `clearingCount > 0` (`components/admin/showpage/PublishedReviewModal.tsx:680`), so the label never reads "0 clearing" and the interpolation is never null/NaN.

### Fix D, vocabulary (Problem 3): no code change

Retiring the callout (Fix A) deletes the string "Content we couldn't read". The surviving names are the section label "Parse warnings" and the card title "Unrecognized row in sheet" (`lib/messages/catalog.ts:1194`), standard container/item naming. No catalog edit, no section 12.4 lockstep touched.

---

## 3. Testing

TDD per task. Every expected value is derived from the fixture or the rule, never from the implementation-under-test (anti-tautology). Each test names its destination file. The canonical fixture (used by tests 1–4) is exactly:

```ts
const RAW_ROWS = [
  { block: "event", key: "Stage", value: "8' x 24'" },
  { block: "event", key: "Truss Podium", value: "YES" },
];
// one co-produced UNKNOWN_FIELD warn per row, built EXACTLY as emitUnknownField
// emits (lib/parser/warnings.ts:328-334), including the required `message`:
//   {
//     severity: "warn",
//     code: "UNKNOWN_FIELD",
//     message: `Unrecognized ${block} row label: '${key}'`,
//     blockRef: { kind: "event", name: key },
//     rawSnippet: `${key} | ${value}`,
//   }
// (A shared helper `unknownFieldWarn(row)` in the test builds this so the shape
// matches ParseWarning under the strict tsconfig (no partial cast).
```

1. **Routed path, anti-duplication + no-drop by scoped identity, on the REAL modal** — new file unreadCalloutRemoved.test.tsx under tests/components/admin/showpage/. Render the actual `PublishedReviewModal` (template: `tests/components/admin/showpage/publishedReviewModal.test.tsx` — same `next/navigation` mock + `buildPublishedSectionData` fixture), whose snapshot carries the `RAW_ROWS` `raw_unrecognized` plus their co-produced `UNKNOWN_FIELD` warns. Rendering the real modal is what makes this a **durable** regression: the modal is the composition that today supplies `bottomSlot={<RawUnrecognizedCallout .../>}`, so the test is **red before Fix A** (the callout renders "Content we couldn't read", failing assertion a) and green after, AND a future re-addition of any bottom callout to `PublishedReviewModal` re-fails it. Assert (a) **zero** elements matching text "Content we couldn't read" in the whole tree; (b) for **each** `RAW_ROWS` key, the key text appears **inside an anchored warning-card element** — scope the query to the extras subtree produced by `buildSectionWarningExtras` (precedent: `tests/components/admin/showpage/publishedWarningNoLoss.test.tsx` scopes to the extras subtree per identity), NOT `getByText` over the whole tree (a bare tree search could match parsed content; scoping to the warning-card container defeats that false-positive).
2. **Routing-off (wizard) path, no-drop into the list** — same new file. Render the wizard warnings surface with `routedWarningsRenderElsewhere === false` (no `renderSectionExtras`) and the same fixture; assert each `RAW_ROWS` key appears **inside a Parse-warnings list row** (scoped to the list-row testid, not the whole tree), and "Content we couldn't read" is absent. Exercises the `visibleWarningRows` return-all branch.
3. **Ignored-row case** — same new file. Mark one `RAW_ROWS` row's warning ignored; assert its key is reachable inside the section's "Ignored (N)" disclosure (still present, not dropped) and "Content we couldn't read" is still absent. Pins the documented ignored-row behavior change.
4. **Cap case** — same new file. A fixture of 51 distinct rows; assert the 51st row's key renders on the warnings surface (proving the surface exceeds the callout's `RAW_UNRECOGNIZED_CAP = 50`). Scoped to the warning-row container.
5. **Anti-duplication (wizard modal)** — new file step3ReviewModalUnread.test.tsx under tests/components/admin/wizard/ (or extend an existing `Step3ReviewModal` test if present). Render the `Step3ReviewModal` staged path with the fixture; assert "Content we couldn't read" absent and each key survives inside a list row.
6. **`bottomSlot` prop removed** — new type-level file showReviewSurfaceProps.test.ts under tests/components/admin/review/. Assert `ShowReviewSurface`'s props type no longer includes `bottomSlot` (a `// @ts-expect-error` on a `bottomSlot={...}` prop, or a `Expect<...>` type assertion). Catches a future caller re-adding a parallel bottom surface.
7. **Count suppression, all four count-chip classes** — new file modalSectionChromeCount.test.tsx under tests/components/admin/wizard/ (or extend the existing chrome test). Reach `ModalSectionChrome` via a counted section (`warnings`): (a) `count === 0, flagged === true` → **no** chip; (b) `count === 0, flagged === false` → chip `(0)` **present**; (c) `count === 3, flagged === true` → `(3)` present; (d) `count === null` (agenda-style section) → no chip (pre-existing guard). Each case derived from the rule.
8. **Clearing-pill aria-label + exact visible text** — new file clearingPill.test.tsx under tests/components/admin/showpage/ (or extend an existing `PublishedReviewModal` header test). Render the published header in the clearing state (`clearingCount === 2`, no actionable holds): assert (a) visible text is exactly "2 clearing"; (b) `aria-label` and `title` both equal `"2 clearing on their own, no action needed"` (interpolated count and phrase both verified); (c) the accessible name contains no em-dash (`—`).
9. **Deleted / edited test accounting.** `tests/admin/rawUnrecognized.test.ts` and `tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx` are removed in the same task as their subjects (no orphan test importing a deleted export). `tests/components/admin/showpage/changesSection.test.tsx` is edited in the same task (drop callout import/prop/ordering assertions per Fix A); its retained assertions (Overview-precedes-warnings, Changes-is-last) still pass.

The plan (writing-plans) fixes each test's exact harness wiring; this section fixes the file, the fixture, the scoped assertion target, and the red-before/green-after expectation.

### Meta-test inventory

- **Creates or extends:** none. No new Supabase call boundary, no new admin_alerts code, no advisory-lock surface, no tile sentinel, no admin mutation surface (invariant 10) — a pure UI render change (removals plus two presentational tweaks). Declared explicitly per the meta-test-inventory rule: **none applies, because no registry-guarded surface (auth boundary, alert catalog, advisory lock, mutation surface, email normalization) is touched.**
- **Invariant 8 (impeccable dual-gate):** applies (UI surfaces under `components/` change). `/impeccable critique` plus `/impeccable audit` run on the diff before cross-model review; P0 and P1 findings fixed or `DEFERRED.md`-logged.

### Numeric sweep

Behavioral literals introduced by the fixes and where each is single-sourced: `count === 0 && flagged` (the Fix B rule, stated once in section 2 Fix B, tested in section 3 test 7); `count === 3` and `clearingCount === 2` are **test fixture values** chosen in section 3 only (not code constants). The `50` value is the deleted callout's `RAW_UNRECOGNIZED_CAP`; the constant itself is removed with `lib/admin/rawUnrecognized.ts`, but `50` survives intentionally as a **documentation reference** in section 1.1 link 4 and section 3 test 4, where it names the boundary the warnings surface must exceed; it is not a live code constant after this change. No new production magic number is introduced. Problem numbers 1–5 are single-sourced in section 1 and referenced (not redefined) by the Fix headings and section 1.1 — Fix A = Problems 1 and 5, Fix B = Problem 2, Fix C = Problem 4, Fix D = Problem 3.

---

## 4. Dimensional Invariants

**N/A.** This change introduces and modifies **no** fixed-dimension parent containing flex or grid children. Fix A removes a statically-rendered `<section>`; Fix B toggles the presence of a content-sized, `shrink-0` text chip inside an existing flex header row (no parent-to-child dimension relationship); Fix C adds two static attributes to an existing pill. No parent-to-child height or width guarantee is created or altered, so there is no Playwright layout-assertion task.

---

## 5. Transition inventory

The modal's state machine is unchanged; no `AnimatePresence` or timed transition is added or removed. The count chip has three reachable classes — `zero+flagged` (no chip, new), `zero+unflagged` (chip `(0)`), and `nonzero` (chip `(n)`, always with or without flag) — plus the `null` class (agenda, no chip). All pairwise transitions and the compound (count and flag changing together) are enumerated:

| Change | State pair | Treatment |
| --- | --- | --- |
| Callout removal | rendered then permanently absent | Instant. The surface no longer exists; no mount or unmount animation to specify. |
| Count: zero+flagged ↔ zero+unflagged (flag flips, count stays 0) | chip absent ↔ chip `(0)` | Instant. Chip presence follows data (matches the `showCount` "instant, deliberate" precedent, `components/admin/wizard/step3ReviewSections.tsx:761`). |
| Count: zero+flagged ↔ nonzero (count crosses 0 while flagged) | chip absent ↔ chip `(n)` | Instant. Same precedent. |
| Count: zero+unflagged ↔ nonzero | chip `(0)` ↔ chip `(n)` | Instant, text swap only. |
| Count: nonzero ↔ nonzero, `(n)` to `(m)` (count changes, flag constant) | chip `(n)` ↔ chip `(m)` | Instant, text swap only. |
| Count: nonzero+unflagged → zero+flagged (compound: count drops to 0 AND section flags, both change) | chip `(n)` → chip absent | Instant. Both variables change together; the chip stops rendering (now `count===0 && flagged`), no animation. |
| Count: nonzero+flagged → zero+unflagged (compound: count drops to 0 AND section un-flags, both change) | chip `(n)` → chip `(0)` | Instant. Both change together; the suppression rule does NOT fire (unflagged), so the chip becomes `(0)`, no animation. |
| Count: nonzero+flagged → zero+flagged (count drops, flag constant) | chip `(n)` → chip absent | Instant. Single-variable case; the chip stops rendering, no animation. |
| Count: null ↔ any counted class (a section gains/loses a count, e.g. agenda) | chip absent ↔ chip/no-chip per class | Instant. The pre-existing `count !== null` guard already gates this; unchanged by Fix B. |
| Clearing pill: clearing-count changes while pill stays mounted (`N` to `M`) | visible text `N clearing` → `M clearing`; `aria-label`/`title` `N ...` → `M ...` | Instant, dynamic. The visible text and the two new attributes all interpolate `clearingCount`, so all three update together when the count changes — no animation, and the attributes are dynamic (they track the count), not static. |
| Clearing pill: enter/exit the clearing branch (`clearingCount` crosses 0, or the pill swaps to the in-sync / degraded branch) | clearing pill present ↔ a different branch's pill | Instant. Branch selection is pre-existing logic untouched by Fix C; the new attributes exist only while the clearing branch renders. |

Every pair resolves to instant (presence and text follow data); no pair needs an animation. The clearing pill's new `aria-label`/`title` are dynamic attributes (they interpolate the live count), not static.

---

## 6. Blast radius

- **Production files changed:** `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`.
- **Tests edited:** `tests/components/admin/showpage/changesSection.test.tsx` (per Fix A). **Tests deleted:** `tests/admin/rawUnrecognized.test.ts`, `tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx`. **Tests added (per section 3), created by the plan** — default target filenames (basenames): unreadCalloutRemoved.test.tsx (tests 1–4, under tests/components/admin/showpage/), step3ReviewModalUnread.test.tsx (test 5, under tests/components/admin/wizard/), showReviewSurfaceProps.test.ts (test 6, under tests/components/admin/review/), modalSectionChromeCount.test.tsx (test 7, under tests/components/admin/wizard/), clearingPill.test.tsx (test 8, under tests/components/admin/showpage/). The plan may consolidate a test into an existing sibling file where one already covers that component.
- **Deleted production:** `lib/admin/rawUnrecognized.ts`.
- **No** DB, migrations, advisory locks, server actions, `app/api/**`, section 12.4 catalog, message-lookup, or env changes.
- **Routing:** UI-only, so Opus / Claude Code (per `ROUTING.md` hard rule).
