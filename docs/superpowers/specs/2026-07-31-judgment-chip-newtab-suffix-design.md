# Judgment-chip visibility + new-tab suffix dedup — design

**Date:** 2026-07-31 · **Branch:** `fix/judgment-chip-newtab-suffix` · **Status:** ratified (owner approved design + autonomous ship 2026-07-31)

Closes two BACKLOG entries in one small UI branch:

- `BL-HEADER-JUDGMENT-CHIP-CONTRAST` (BACKLOG.md, filed 2026-07-26) — the section-header judgment chip is near-invisible next to the clean chip.
- `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` (BACKLOG.md, filed 2026-07-26) — user-supplied text already containing "(opens in a new tab)" gets the suffix announced twice.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Chip treatment is **Option A: outline only** — judgment chip's `border-border` becomes `border-border-strong`; fill, icon color, pill, clean and flagged states unchanged. | Owner picked Option A from a three-option mockup built from the live markup and exact token values, 2026-07-31 (this session; mockup artifact `159c55db`). Do not propose a new fill token or re-open Option B/C. |
| The suffix helper **sanitizes the interpolated value; it does not build the label.** Each call site keeps its literal `(opens in a new tab)` template text. | Hard constraint from the static guard: `tests/styles/_metaNewTabAnnouncement.test.ts` requires the literal phrase per label branch (accepts branch-wise literals, `tests/styles/_metaNewTabAnnouncement.test.ts:467-484`; rejects non-announcing branches, `tests/styles/_metaNewTabAnnouncement.test.ts:475`). A helper-built label has no literal phrase for the scanner and would fail the guard. Teaching the guard to trust helper names was considered and rejected: it would weaken a mutation-proven guard to save three template strings. |
| The **card-row judgment chip and card border tiers are out of scope.** `Step3SheetCard.tsx:549` ("calm INFO tone (bg-info-bg + neutral dot)") and the row tiers pinned by `tests/components/admin/wizard/step3JudgmentChrome.test.tsx:7-9` are a different surface: the dot sits on a card with its own border tiering, not beside a `bg-surface-sunken` sibling chip, so the near-identical-siblings failure this spec fixes does not apply there. Documented-limits §6 carries the residual. | Class-sweep run pre-draft (grep `bg-info-bg` across `components/ app/`); BACKLOG entry names only the section-header chip. |
| "Parsed with judgment" / "Needs a look" pill copy and placement untouched. Pill placement is owner-ratified (BACKLOG `BL-HEADER-JUDGMENT-CHIP-CONTRAST`: "Fix candidates that do not touch the ratified pill placement"). | BACKLOG.md entry; wide-inline spec 2026-07-26. |
| No new tokens, no `DESIGN.md` palette change, no §12.4 catalog rows (no error codes involved). | Option A uses only existing `--color-border-strong-runtime` (`app/globals.css:296` light `#cfcdc7`; dark `#3a3b40` at `app/globals.css:346` and `app/globals.css:391`). |
| Mid-string occurrences of the phrase in user text are NOT stripped — only trailing ones. | §3.2; documented-limits §6. |

## 2. Item 1 — judgment chip outline

### 2.1 Current state (verified in code)

`ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:868`; chip ternary at `components/admin/wizard/step3ReviewSections.tsx:948-956`, anchor token `place-items-center rounded-sm`) renders the section-header chip:

- flagged: `bg-warning-bg text-warning-text` (borderless)
- judgment: `border border-border bg-info-bg text-text`
- clean: `bg-surface-sunken text-text-subtle` (borderless)

Fill separation judgment-vs-clean is ~1.08:1 light (`#eeeae3` vs `#f4f3f1`) and ~1.18:1 dark (`#1f1e22` vs `#0b0c10`), and the judgment hairline (`--color-border-runtime`, `#e5e4e0`/`#2a2b30`) matches every other panel border, so judgment reads as clean. At `sm`+ the "Parsed with judgment" pill sits at the row's far edge (up to ~600px away — BACKLOG entry), leaving the chip as the only cue beside the name.

### 2.2 Change

One class edit in the judgment branch of the chip ternary:

```
- : judgment
-   ? "border border-border bg-info-bg text-text"
+ : judgment
+   ? "border border-border-strong bg-info-bg text-text"
```

Rationale for legibility: clean is borderless, so under Option A **any visible outline means "not clean"**; `border-strong` is the same token the flagged pill already uses for emphasis (`components/admin/wizard/step3ReviewSections.tsx:1016`, `border-border-strong bg-warning-bg`), so no new precedent. Both color modes flip automatically via the token (light `#cfcdc7`, dark `#3a3b40`).

Guard conditions: `judgment` is `chrome.judgment === true && !flagged` (`components/admin/wizard/step3ReviewSections.tsx:886`) — boolean, no null/NaN surface; absent/false renders clean exactly as today.

### 2.3 Transition inventory and Dimensional Invariants

Three states (clean, judgment, flagged), data-driven per render — the component has no state transitions at runtime (status follows parse data, not interaction). All 3 pairs (clean↔judgment, clean↔flagged, judgment↔flagged): **instant — no animation needed**, matching the file's existing `§11: instant — deliberate` posture (`components/admin/wizard/step3ReviewSections.tsx:991`). No compound transitions: status cannot change while any other chip state is mid-transition because nothing animates.

**Dimensional Invariants:** N/A — no dimension, layout, or flex/grid relationship changes; the chip stays `size-7`/`size-6` in the same row.

### 2.4 Test impact

- No existing test pins the chip's STATUS classes (`tests/components/admin/wizard/modalSectionChromeClasses.test.tsx` pins only the sm+ layout classes; verified by grep). The red-first TDD test is therefore a NEW assertion added to that file: render `{ judgment: true }`, locate the `aria-hidden` icon chip, assert `border-border-strong` + `bg-info-bg` (fails today), plus companions pinning clean borderless and flagged `bg-warning-bg` so the other branches cannot regress silently.
- `tests/e2e/_sectionHeaderCellHarness.tsx` renders judgment cells (`tests/e2e/_sectionHeaderCellHarness.tsx:98-208`), so `tests/e2e/section-header-visual.spec.ts` committed PNG baselines **will change**. Regenerate via the sanctioned amd64-runner producer only (byte-comparison discipline, AGENTS.md "Byte-comparison CI gates"; #631 used the same flow, bot commit `64bdc34d3`) — never from this arm64 host.
- `tests/e2e/section-header-layout.layout.spec.ts` asserts geometry, not colors — expected untouched; verify green.
- `tests/components/admin/review/__fixtures__/step3-header-baseline.html` (skeleton/header parity) carries only `bg-surface-sunken` occurrences — the judgment branch never appears in it, so the fixture is unaffected (verified by grep).
- No contrast-test rows change (no new/repurposed tokens). The pre-code mechanical gate is satisfied by recording the deltas here: border-strong vs info-bg fill = 1.33:1 light / 1.48:1 dark (computed WCAG relative luminance from the runtime hex above) — an *edge* cue against a borderless sibling, not a fill-contrast claim; WCAG 1.4.11 non-text contrast for a status *supplement* is tracked at the pill, which carries the text.

## 3. Item 2 — new-tab suffix dedup

### 3.1 Current state (verified in code)

Three labels interpolate user-supplied text and then append the literal suffix:

1. `components/admin/SheetIconLink.tsx:92-95` — `trimmed` (show/section title from admin sheet cells); empty-value fallback branch already exists (both branches announce; #592 shape).
2. `components/admin/wizard/step3ReviewSections.tsx:3675` — `aria-label={alt ? `${alt} (opens in a new tab)` : "Staged diagram (opens in a new tab)"}` (diagram alt from sheet).
3. `components/admin/wizard/Step3SheetCard.tsx:152` — `aria-label={`Open the source sheet for ${title} in Google Sheets (opens in a new tab)`}` (sheet title, **no** empty fallback today).

A value already ending in the phrase announces it twice (BACKLOG example: show titled `Summit (opens in a new tab)`).

### 3.2 Change

Export from the copy's single home, `components/shared/NewTabHint.tsx` (census-safe: the file-set census at `tests/styles/_metaNewTabAnnouncement.test.ts:964-1010` already lists it, and every call site is already a carrier):

```ts
export function stripNewTabSuffix(value: string): string
```

Behavior:

- Repeatedly strips a **trailing** `(opens in a new tab)` (the canonical copy string, exact spelling, case-sensitive — single-sourced as a module constant shared with `NewTabHint`'s JSX), tolerating trailing whitespace before/after each occurrence; then trims trailing whitespace.
- Mid-string occurrences untouched (§6).
- Empty/whitespace-only input → returns `""`.

Applied at the three interpolation sites, value-position only — the literal suffix in each template stays, so the static guard's per-branch phrase requirement holds with zero guard changes:

1. `SheetIconLink`: strip inside the existing `trimmed` computation (strip, then trim); a value that strips to empty falls into the **existing** fallback branch.
2. Diagram alt anchor: `alt` → conditional on the **stripped** value; empty falls to the existing `"Staged diagram (opens in a new tab)"` branch. The `<img alt>` itself keeps the raw `alt` (it is content, not a suffix-bearing label).
3. `Step3SheetCard`: strip `title` in the label; a stripped-to-empty title takes a new fallback branch `"Open the source sheet in Google Sheets (opens in a new tab)"` — the same no-dangling-"for" shape #592 ratified for `SheetIconLink` (BACKLOG `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` closure note for item 2). Visible link text keeps the raw `title`.

Static-label sites (`SheetIconLink.tsx:95` fallback, `VenueMapTile.tsx:138`, `SourceLink.tsx:71`) have no interpolation — unchanged.

### 3.3 Tests (TDD, red-first)

- Helper unit tests (new file beside the a11y suite): trailing occurrence stripped; repeated trailing occurrences stripped; mid-string occurrence untouched; internal whitespace variants (`"X (opens in a new tab)"`, `"X (opens in a new tab) "`, `"X (opens in a new tab) (opens in a new tab)"`); exact-phrase only (near-miss `"(opens in new tab)"` untouched); empty input.
- `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`: for each of the three sites, render with a pathological value whose TRAILING text is the phrase (e.g. `Summit (opens in a new tab)`) and assert the **computed accessible name** contains the phrase exactly once; a mid-string case (e.g. `Summit (opens in a new tab) Tour`) asserts exactly two occurrences — the preserved user text plus the single appended suffix (§6) (the suite already measures computed names — its charter); plus the `Step3SheetCard` empty-after-strip fallback name.
- `tests/styles/_metaNewTabAnnouncement.test.ts`: no changes; its census and per-branch scans must stay green as-is (proof the helper approach is guard-neutral).

Failure modes each test catches: label-builder regression (guard would also catch), strip-anywhere over-reach (mid-string case), dangling-"for" (fallback case), copy drift (helper and JSX share one constant).

## 4. Invariants and gates

- UI surface → invariant-8 impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff before adversarial close-out; findings + dispositions to the close-out §12.
- Invariant 10: no new mutation surfaces (pure render/label changes) — N/A.
- Advisory locks, DB, sync: untouched — N/A (no tier×domain matrix needed).
- Commits: `fix(admin): …` / `test(admin): …` per task, TDD ordering.

## 5. Acceptance

1. Judgment chip renders `border-border-strong` in both modes; clean and flagged bit-identical to today except the regenerated visual baselines' judgment cells.
2. For any input, the three interpolated labels end with exactly one appended suffix occurrence — trailing occurrences in the value never stack with the template's suffix. Mid-string occurrences inside user text are preserved by ratified limit (§6), so the total phrase count can legitimately exceed one; the invariant is on the suffix, not the whole string. Static sites unchanged; `_metaNewTabAnnouncement` suite green without modification.
3. `modalSectionChromeClasses`, layout spec, visual spec (regenerated baselines), full unit suite, impeccable dual-gate, Codex whole-diff review, real CI — all green.

## 6. Documented limits

- **Mid-string phrase occurrences survive** (e.g. `Summit (opens in a new tab) Tour`): the announced name contains the user's own text plus one real suffix. Not silent corruption — verbose announcement of admin-typed text; per the consequence-bound posture this files here, not as a blocker.
- **Only the canonical spelling is stripped.** Variants (`(Opens in a New Tab)`, `(opens in new tab)`) pass through and may double-announce in spirit; they have never been the appended copy, so they cannot duplicate the *suffix* — they are user content.
- **Card-row judgment chip** (`Step3SheetCard.tsx:549`) keeps today's tone; if its context ever gains a sunken sibling chip, re-evaluate under this spec's Option A rule.
- **The chip remains a non-text cue** whose accessible semantics live in the pill; screen-reader parity for judgment state is the pill's charter, unchanged here.
