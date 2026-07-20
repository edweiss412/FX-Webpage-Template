# Plan — Show Alert Compact

**Spec:** `docs/superpowers/specs/2026-07-20-show-alert-compact.md` (canonical; §-references below point there).
**Branch:** `feat/show-alert-compact` (worktree `../FX-worktrees/show-alert-compact`).
**Implementer:** Opus / Claude Code — UI work is always Opus per AGENTS.md routing.
**Mode:** autonomous ship (user approved 2026-07-20 00:55 CDT); both user-review gates waived.

## 0. Pre-draft verification (DONE at plan time, not deferred)

Every file, symbol, and registry named below was verified against the live checkout while drafting. Findings that changed the plan:

| Check | Result |
|-------|--------|
| `vitest.projects.ts` line 20 `BASE_INCLUDE` = `["tests/**/*.test.ts", "tests/**/*.test.tsx"]` | Any new unit test under `tests/` is auto-included; NO testMatch edit needed. |
| Affordance-matrix parity gate matches a LITERAL testid (`tests/help/_metaAffordanceMatrixParity.test.ts` line 90) and requires each concrete id to occur exactly once (same file, lines 100-116) | Per-item popovers must use exemption comments + ONE template-family row, never concrete rows (spec §10). |
| `tests/help/_affordance-matrix-shape.test.ts` lines 75-79 bans concrete parse-warning testids | Confirms the same route. |
| `tests/components/admin/dataGapsTransitionAudit.test.tsx` line 147 pins `/\{a\.dataGaps \? \(/` | Must change in the same commit as the AttentionBanner guard tightening (Task 5). |
| `tests/components/admin/class-sweep-now-utility.test.ts` lines 126-133 forbids `Date.now(` / `new Date()` in AttentionBanner | Binds Task 5; no test edit. |
| `tests/components/admin/transitionAudit.test.tsx` line 41 already lists AttentionBanner | Task 9 adds three more paths. |
| `components/admin/telemetry/HealthAlertResolveButton.tsx` line 19 has pending but no error state | Task 7 asserts only the states that exist. |
| Repo has ZERO `toBeVisible()` usages and loads no CSS in jsdom (`vitest.config.ts` line 61) | Unit tests assert `aria-expanded` + `hidden` class; real visibility only in Playwright (spec §9.1). |
| `PerShowActionableWarnings` consumers | `components/admin/showpage/sectionWarningExtras.tsx` lines 101 and 146, `components/admin/StagedReviewCard.tsx` line 521, `BulkIgnoreControls.tsx` (slot pass-through), `app/admin/show/staged/[stagedId]/page.tsx` line 172. |
| `AttentionBanner` call site | `components/admin/showpage/PublishedReviewModal.tsx` line 294 (`bannerFor` helper). |

Snippet typecheck: every code block below was written against the repo's strict tsconfig conventions (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Optional props are passed conditionally via spread (`...(x ? { prop: x } : {})`), never as `prop={undefined}`.

## 1. Meta-test inventory (declared up front)

CREATES: none.
EXTENDS: `transitionAudit.test.tsx` (3 paths), `dataGapsTransitionAudit.test.tsx` (regex), `app/help/_affordanceMatrix.ts` (1 template-family row + comment rewrite).
SATISFIED BY EXEMPTION: `_metaAffordanceMatrixParity.test.ts` (2 call-site comments).
CONSTRAINS (no edit): `class-sweep-now-utility.test.ts`, `status-token-contrast.test.ts`.
MUST NOT EDIT: `_metaInlineIdentityContract.test.ts`, `_metaAdminAlertCatalog.test.ts`.

## 2. Task list

Each task is TDD: failing test → minimal implementation → passing test → commit. Commit format `<type>(<scope>): <summary>`; scope `crew-page` is wrong here — use `admin`.

---

### Task 1 — `CompactAlertCard` shell: bands and slot presence

**Test first** (new file `tests/components/admin/compactAlertCard.test.tsx (new)`; auto-included by `BASE_INCLUDE`):

Assert every spec §5.1 row. Concrete failure modes each catches, stated per test:

- each of `detailBand` / `controlsBand` / both footer slots absent as `null`, `undefined`, `false`, `""` ⇒ neither the band element NOR its divider renders. (Catches a divider left behind when the band is conditional but the `border-t` wrapper is not.)
- `footerRight` present with `footerLeft` absent ⇒ bar renders AND the right cluster carries `ml-auto`. (Catches a `justify-between` implementation, which leaves a lone child at the START edge — spec §2.)
- `footerLeft` present alone ⇒ bar renders.
- `0`, `NaN`, `[]`, and an empty fragment in a slot ⇒ band DOES render (the uniform presence rule; adapters are responsible for normalizing these to `null`).

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";

afterEach(cleanup);

describe("CompactAlertCard bands", () => {
  test("absent detail band renders neither band nor divider", () => {
    render(<CompactAlertCard message="m" />);
    expect(screen.queryByTestId("compact-alert-detail-band")).toBeNull();
  });

  test("footerRight alone pins right via ml-auto, not justify-between", () => {
    render(<CompactAlertCard message="m" footerRight={<button type="button">Go</button>} />);
    const bar = screen.getByTestId("compact-alert-footer");
    expect(bar.className).not.toContain("justify-between");
    expect(screen.getByTestId("compact-alert-footer-right").className).toContain("ml-auto");
  });
});
```

**Implement:** the new file `components/admin/CompactAlertCard.tsx (new)` per spec §3.1. Testids: `compact-alert-card`, `compact-alert-message`, `compact-alert-detail-band`, `compact-alert-footer`, `compact-alert-footer-left`, `compact-alert-footer-right`, `compact-alert-controls-band`.

**Commit:** `feat(admin): CompactAlertCard shell with banded slots`

---

### Task 2 — Shell tone skins and stripe forcing

**Test first:** all three tones map to their spec §3.1 skin classes; `muted` and `neutral` force `stripe="none"` EVEN WHEN a stripe prop is passed, and omit the `!` glyph; `className` merges rather than replaces. (Catches a tone map that honors a caller's stripe on a non-severity card — the exact defect amendment A5 exists to prevent.)

**Implement:** tone/stripe class map with full literal class strings (JIT requirement).

**Commit:** `feat(admin): CompactAlertCard tone skins with forced stripe suppression`

---

### Task 3 — `HoverHelp` Escape containment

**Test first** (new file `tests/components/admin/hoverHelpEscapeContainment.test.tsx (new)`): render a `HoverHelp` inside a real `ReviewModalShell`, open the popover, dispatch Escape from inside it. Assert BOTH: the popover closed, AND the shell's close callback was NOT called. Regression pair: with the popover CLOSED, Escape reaches the shell and it closes normally.

Do NOT assert `defaultPrevented` — the shell ignores it (`components/admin/review/ReviewModalShell.tsx` lines 239-245), so that assertion proves nothing. A synthetic-parent-handler spy is likewise insufficient alone; the `document`-level native listener is the boundary under test.

**Implement:** element-level `onKeyDown` on the HoverHelp root per spec §3.2 (`preventDefault` + `stopPropagation` + close, only while open).

**Commit:** `fix(admin): contain HoverHelp Escape so it never closes the host modal`

---

### Task 4 — Amber `?` trigger + help adapter helper

**Test first:** a shared helper builds the popover body from `(helpfulContext, helpHref, route)`; assert all four presence combinations plus the route-gated case, and that a whitespace-only `helpfulContext`/`helpHref` counts as absent. (Catches the trigger rendering with an empty popover.)

**Implement:** the trigger node (spec §3.2 visual spec, `min-h-tap-min min-w-tap-min` hit area) and a small `buildHelpPopover` helper applying `shouldEmitLearnMore`.

**Commit:** `feat(admin): amber help trigger and route-gated popover body helper`

---

### Task 5 — AttentionBanner adapter

**Test first:** update `tests/components/admin/review/attentionBanner.test.tsx` per spec §9.2 — remove identity assertions and the `underCrewRow` prop; add: invalid item ⇒ null; null/empty/whitespace template ⇒ fallback; null action ⇒ time alone with no leading separator; `failedKeys` null/`[]`/all-whitespace ⇒ no entry; >6 keys ⇒ `+N more`; `dataGaps` null / `total: 0` / `total: NaN` ⇒ no entry; whitespace-only `autoClearNote` ⇒ resolve button; stripe review vs degraded from `item.tone`; trigger across all four help combinations with the route gate exercised both ways; Ep→Rp→C retry path.

Popover assertions follow spec §9.1: `aria-expanded` on the trigger plus the `hidden` class on the body. Never `toBeVisible()` in jsdom.

**Implement:** rewrite the component onto `CompactAlertCard`; delete the identity sub-line, the `INLINE_IDENTITY_CODES` import, the `underCrewRow` prop (and its use at `components/admin/showpage/PublishedReviewModal.tsx` line 294), and the freestanding Learn-more link. Keep `now: Date` as a prop and never read the clock (`class-sweep-now-utility` constraint).

**Same commit:** update `tests/components/admin/dataGapsTransitionAudit.test.tsx` line 147's pinned regex to the tightened guard. The scanner fails otherwise, and splitting it across commits leaves a red intermediate state.

**Commit:** `refactor(admin): AttentionBanner onto the compact card`

---

### Task 6 — PerShowActionableWarnings adapter

**Test first:** update `tests/admin/perShowActionable*.test.tsx` and `tests/parser/parseWarningDeepLinkRender.test.tsx` per spec §9.2, including: `sourceCell` present with NULL `driveFileId` ⇒ no link (catches branching on `sourceCell` instead of on the built href); controls land in `controlsBand`, asserted via the controls node's ancestor band, NOT merely "controls exist" (catches the A1 regression of putting a full control cluster in the footer); no link + no controls ⇒ no footer bar; muted tone skin.

**Implement:** rewrite onto `CompactAlertCard`; `helpfulContext` moves into the popover; controls to `controlsBand`; stripe `"none"`.

**Commit:** `refactor(admin): per-show actionable warnings onto the compact card`

---

### Task 7 — HealthAlertsPanel adapter

**Test first:** update `tests/components/healthAlertsPanel*.test.tsx` — `neutral` tone with NO stripe and NO glyph; the weight badge still distinguishes degraded from notice (catches severity being moved onto the container, which A5 forbids); separator interleaving across every link-presence combination including `show_id` XOR `slug`; `occurrence_count` 0/1/2/negative/non-finite; empty and whitespace identity; all four detail inputs absent ⇒ no band.

**Implement:** rewrite `HealthAlertRowItem` onto `CompactAlertCard` with `tone="neutral"`. The panel stays a server component.

**Commit:** `refactor(admin): health alert rows onto the compact card`

---

### Task 8 — Affordance-matrix registration

**Test first:** the parity and shape suites must stay green with the two new `<HoverHelp` call sites present. Assert the concrete-row count is UNCHANGED (no concrete row added).

**Implement:** exemption comment `// not-a-help-affordance: per-item popover; registered as a template-family row, see app/help/_affordanceMatrix.ts` above each call site; ONE new `template-family` row; rewrite the stale comment at `app/help/_affordanceMatrix.ts` lines 105-112.

**Commit:** `test(admin): register the per-item help popover as a template-family affordance`

---

### Task 9 — Transition audit extension

**Test first / implement together:** add `components/admin/CompactAlertCard.tsx (new)`, `components/admin/PerShowActionableWarnings.tsx`, and `components/admin/telemetry/HealthAlertsPanel.tsx` to the motion-free list in `tests/components/admin/transitionAudit.test.tsx` (AttentionBanner is already listed at line 41). Concrete failure mode: R9 could otherwise be violated on an adapter outside the current scan.

**Commit:** `test(admin): extend the transition audit to every compact-card adapter`

---

### Task 10 — Real-browser layout assertions

**Test first** (Playwright, existing standalone harness pattern; workflow path filter confirmed in the same commit):

- footer containment at 400px and 320px with a short-label and a longest-live-label fixture ("Open branch settings"): EVERY descendant of the footer bar within the bar's content box ±0.5px;
- truncation load-bearing: `scrollWidth > clientWidth` on the long label (catches ancestor clipping masquerading as truncation);
- single-line only for the short fixture; long fixture wraps to two lines WITHOUT overflow;
- help trigger ≥44×44;
- popover opens (`toBeVisible()` is meaningful here), sits below and right-aligned to its trigger, not clipped by the card. Per A6 it does NOT assert scroll-container containment;
- message-row containment with a long unbroken token: the help trigger stays inside the card (proves `min-w-0`).

**Commit:** `test(admin): real-browser layout assertions for the compact alert card`

---

### Task 11 — Impeccable dual gate

Run `/impeccable critique` and `/impeccable audit` on the diff. Before running, apply the pre-code mechanical checklist (em-dash ban in user-visible copy, straight apostrophes, `min-h-tap-min` on interactives, canonical `text-xs/relaxed` and `text-subtle` classes). P0/P1 fixed or explicitly deferred via `DEFERRED.md`. Findings and dispositions recorded in the close-out doc.

**Commit:** `fix(admin): impeccable gate findings on the compact alert card` (only if findings)

---

### Task 12 — Close-out

Full suite, typecheck, eslint, `format:check`. Whole-diff cross-model review (inlined variant — tool-using codex dispatches are dying on this repo today; 15 attempts across the spec rounds). Push, real CI green, `gh pr merge --merge`, fast-forward local main until `git rev-list --left-right --count main...origin/main` reports `0  0`.

## 3. Risks

| Risk | Mitigation |
|------|-----------|
| Affordance-matrix registration breaks three assertions if done as a concrete row | Task 8 pins the count-unchanged assertion; spec §10 explains the route |
| `dataGaps` guard tightening lands without the scanner update | Same commit, stated in Task 5 |
| Popover clipping inside the review modal | Descoped (A6), residual filed as `BL-HOVERHELP-PORTAL` |
| Controls band regresses to the footer | Task 6 asserts the ancestor band, not mere presence |
| jsdom visibility assertions silently vacuous | Spec §9.1 rules; Playwright owns real visibility |
