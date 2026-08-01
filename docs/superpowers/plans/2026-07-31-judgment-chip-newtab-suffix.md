# Judgment-chip outline + new-tab suffix dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the section-header judgment chip visibly distinct (border-strong outline) and stop user-supplied text from double-announcing the "(opens in a new tab)" suffix, per spec `docs/superpowers/specs/2026-07-31-judgment-chip-newtab-suffix-design.md` (approved, adversarial r2).

**Architecture:** One class edit in `ModalSectionChrome`'s chip ternary; one `stripNewTabSuffix` helper exported from the announcement copy's single home (`components/shared/NewTabHint.tsx`), applied in value-position at the three aria-label interpolation sites so every label template keeps its literal suffix (static-guard neutrality).

**Tech Stack:** React 19 / Next 16, Tailwind v4 tokens, vitest + Testing Library (jsdom), Playwright visual gate (amd64-pinned baselines).

## Global Constraints

- TDD per task: failing test → minimal implementation → passing test → commit (AGENTS.md invariant 1).
- Commit style: `test(admin): …` / `fix(admin): …` / `docs: …`; one task per commit (invariant 6).
- The static guard `tests/styles/_metaNewTabAnnouncement.test.ts` must stay green **without modification** (spec §3.3) — every aria-label branch keeps a literal `(opens in a new tab)`.
- Chip states other than judgment stay byte-identical: clean `bg-surface-sunken text-text-subtle` (borderless), flagged `bg-warning-bg text-warning-text` (spec §2.2).
- Visual baselines are regenerated ONLY by the `section-header-visual-regen` workflow (amd64 CI runner, bot commit) — never from this arm64 host (AGENTS.md byte-comparison discipline; precedent bot commit `64bdc34d3`).
- Meta-test inventory (writing-plans rule): CREATES no registry entries; EXTENDS `tests/components/admin/wizard/modalSectionChromeClasses.test.tsx` (new status-class block) and `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` (three site cases). Registry meta-tests (`_metaInfraContract`, advisory-lock, admin-alert catalog, sentinel-hiding, no-inline-email) — none applies: no Supabase calls, locks, alerts, tiles, or email surfaces are touched. BACKLOG graduation exercises `tests/docs/_metaDeferralLedgerGraduation.test.ts` (Task 5). Task 3 UPDATES one pinned census value in `tests/components/admin/sheetIconLinkContainment.test.ts` (the behavior suite's `"Open the source sheet"` occurrence count rises with the new exact-name assertions).

---

### Task 1: Judgment chip border-strong

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (chip ternary, judgment branch — anchor: `place-items-center rounded-sm`, currently line ~948-956)
- Test: `tests/components/admin/wizard/modalSectionChromeClasses.test.tsx`

**Interfaces:**
- Consumes: existing `renderChrome(overrides: Partial<Step3SectionChrome>)` helper (`modalSectionChromeClasses.test.tsx:17-33`); the chip is the `span[aria-hidden="true"]` inside the rendered chrome.
- Produces: judgment chip class contract `border border-border-strong bg-info-bg text-text` that Task 4's visual regen and the impeccable gate verify visually.

- [ ] **Step 1: Write the failing test** — append to the existing `describe` in `modalSectionChromeClasses.test.tsx`:

```tsx
describe("chip status classes (spec 2026-07-31 §2.2)", () => {
  test("judgment chip carries the strong outline over the info fill", () => {
    const { container } = renderChrome({ judgment: true });
    const chip = container.querySelector('span[aria-hidden="true"]');
    const classes = (chip?.className ?? "").split(/\s+/);
    expect(classes).toContain("border-border-strong");
    expect(classes).toContain("bg-info-bg");
    expect(classes).toContain("text-text");
    expect(classes).not.toContain("border-border");
  });

  test("clean chip stays borderless and sunken", () => {
    const { container } = renderChrome({});
    const chip = container.querySelector('span[aria-hidden="true"]');
    const classes = (chip?.className ?? "").split(/\s+/);
    expect(classes).toContain("bg-surface-sunken");
    expect(classes).toContain("text-text-subtle");
    expect(classes.some((c) => c.startsWith("border-border"))).toBe(false);
  });

  test("flagged chip stays amber and borderless", () => {
    const { container } = renderChrome({ flagged: true });
    const chip = container.querySelector('span[aria-hidden="true"]');
    const classes = (chip?.className ?? "").split(/\s+/);
    expect(classes).toContain("bg-warning-bg");
    expect(classes).toContain("text-warning-text");
    expect(classes.some((c) => c.startsWith("border-border"))).toBe(false);
  });
});
```

Failure mode caught: a silent revert of the judgment outline, or the fix bleeding into the clean/flagged branches. Exact-token matching (split on whitespace) pins that the hairline `border-border` is GONE and the strong token is EXACTLY `border-border-strong` — a substring check would pass on a nonexistent `border-border-stronger` utility that renders no outline (plan r1 finding 5).

- [ ] **Step 2: Run to verify the judgment case fails** — `pnpm exec vitest run tests/components/admin/wizard/modalSectionChromeClasses.test.tsx` → judgment test FAILS (`border-border-strong` absent today); clean/flagged tests PASS (they pin current behavior).
- [ ] **Step 3: Minimal implementation** — in the chip ternary's judgment branch replace `"border border-border bg-info-bg text-text"` with `"border border-border-strong bg-info-bg text-text"`. No other branch changes.
- [ ] **Step 4: Re-run the file** → all PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "fix(admin): judgment chip gets border-strong outline (BL-HEADER-JUDGMENT-CHIP-CONTRAST)"`

### Task 2: `stripNewTabSuffix` helper

**Files:**
- Modify: `components/shared/NewTabHint.tsx`
- Test: Create tests/components/a11y/stripNewTabSuffix.test.ts (new file, no existing citation)

**Interfaces:**
- Produces: `export function stripNewTabSuffix(value: string): string` and internal single-source constant for the phrase, both in `components/shared/NewTabHint.tsx`. Task 3 imports `stripNewTabSuffix` at three call sites.

- [ ] **Step 1: Write the failing test** (new file):

```ts
import { describe, expect, test } from "vitest";

import { stripNewTabSuffix } from "@/components/shared/NewTabHint";

describe("stripNewTabSuffix (spec 2026-07-31 §3.2)", () => {
  test("strips a single trailing occurrence", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab)")).toBe("Summit");
  });
  test("strips repeated trailing occurrences", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab) (opens in a new tab)")).toBe("Summit");
  });
  test("tolerates trailing whitespace around occurrences", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab)  ")).toBe("Summit");
  });
  test("mid-string occurrence is preserved (documented limit §6)", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab) Tour")).toBe("Summit (opens in a new tab) Tour");
  });
  test("near-miss spellings pass through", () => {
    expect(stripNewTabSuffix("Summit (opens in new tab)")).toBe("Summit (opens in new tab)");
    expect(stripNewTabSuffix("Summit (Opens in a New Tab)")).toBe("Summit (Opens in a New Tab)");
  });
  test("value that IS the phrase strips to empty", () => {
    expect(stripNewTabSuffix("(opens in a new tab)")).toBe("");
  });
  test("empty and whitespace-only input", () => {
    expect(stripNewTabSuffix("")).toBe("");
    expect(stripNewTabSuffix("   ")).toBe("");
  });
});
```

Failure modes caught: strip-anywhere over-reach (mid-string case), case-fold over-reach (near-miss case), single-pass under-strip (repeated case).

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run tests/components/a11y/stripNewTabSuffix.test.ts` → FAIL (`stripNewTabSuffix` is not exported).
- [ ] **Step 3: Minimal implementation** — in `components/shared/NewTabHint.tsx`, hoist the phrase to a module constant, reuse it in the JSX, and add the helper (doc comment kept phrase-free per the file's own census note):

```tsx
const PHRASE = "(opens in a new tab)";

/**
 * Strips TRAILING occurrences of the canonical new-tab phrase from a value
 * that is about to be interpolated into an aria-label whose template appends
 * the phrase itself, so the appended suffix never stacks (spec
 * 2026-07-31-judgment-chip-newtab-suffix-design.md §3.2). Mid-string
 * occurrences are user content and survive (§6). Exact spelling only.
 */
export function stripNewTabSuffix(value: string): string {
  let out = value.trimEnd();
  while (out.endsWith(PHRASE)) {
    out = out.slice(0, -PHRASE.length).trimEnd();
  }
  return out;
}

export function NewTabHint(): JSX.Element {
  return <span className="sr-only">{PHRASE}</span>;
}
```

- [ ] **Step 4: Re-run the file** → PASS. Also run `pnpm exec vitest run tests/styles/_metaNewTabAnnouncement.test.ts` → PASS unmodified (file-set census: `NewTabHint.tsx` already a carrier; JSX still renders the literal phrase text).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(admin): stripNewTabSuffix helper in the announcement copy's single home"`

### Task 3: Apply at the three interpolation sites + behavioral announce-once proof

**Files:**
- Modify: `components/admin/SheetIconLink.tsx` (label value, ~:92-95), `components/admin/wizard/step3ReviewSections.tsx` (`DiagramTile` alt anchor, ~:3675; add `export` to `DiagramTile` at ~:3644), `components/admin/wizard/Step3SheetCard.tsx` (`SheetTitleLink` label, ~:152; add `export` to `SheetTitleLink` at ~:141)
- Test: `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`

**Interfaces:**
- Consumes: `stripNewTabSuffix` from Task 2; `DiagramTile({src, alt, testId, hasPreviewSource})` (`step3ReviewSections.tsx:3644-3654`); `SheetTitleLink({dfid, title})` (`Step3SheetCard.tsx:141`); `SheetIconLink({href, subjectLabel, testId, ringOffset})` (existing export).
- Produces: the three labels' suffix-dedup behavior; `DiagramTile` and `SheetTitleLink` become named exports (test-reachability only — precedent: `BreakdownSection`/`Step3SectionChromeContext` are exported for the chrome tests).

- [ ] **Step 1: Write the failing tests** — new `describe` in `newTabAnnouncementBehavior.test.tsx` — assertions use `toHaveAccessibleName` (the suite's computed-name idiom), NOT `getAttribute`, so an `aria-labelledby` override regression is caught (plan r1 finding 2):

```tsx
import { SheetIconLink } from "@/components/admin/SheetIconLink";
import { DiagramTile } from "@/components/admin/wizard/step3ReviewSections";
import { SheetTitleLink } from "@/components/admin/wizard/Step3SheetCard";

describe("interpolated labels never stack the appended suffix (spec 2026-07-31 §3)", () => {
  test("SheetIconLink: trailing occurrence in the subject dedupes to one", () => {
    const { getByRole } = render(
      <SheetIconLink href="https://x" subjectLabel="Summit (opens in a new tab)" testId="t1" ringOffset="bg" />,
    );
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet for Summit in Google Sheets (opens in a new tab)",
    );
  });

  test("SheetIconLink: mid-string occurrence is preserved, exactly two total", () => {
    const { getByRole } = render(
      <SheetIconLink href="https://x" subjectLabel="Summit (opens in a new tab) Tour" testId="t2" ringOffset="bg" />,
    );
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet for Summit (opens in a new tab) Tour in Google Sheets (opens in a new tab)",
    );
  });

  test("DiagramTile: alt ending in the phrase announces it once", () => {
    const { getByRole } = render(
      <DiagramTile src="https://x/img" alt="Stage plot (opens in a new tab)" testId="t3" hasPreviewSource={true} />,
    );
    expect(getByRole("link")).toHaveAccessibleName("Stage plot (opens in a new tab)");
  });

  test("SheetTitleLink: title ending in the phrase announces it once", () => {
    const { getByRole } = render(<SheetTitleLink dfid="d1" title="II - Summit (opens in a new tab)" />);
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet for II - Summit in Google Sheets (opens in a new tab)",
    );
  });

  test("SheetTitleLink: title that strips to empty takes the no-subject fallback", () => {
    const { getByRole } = render(<SheetTitleLink dfid="d1" title="(opens in a new tab)" />);
    expect(getByRole("link")).toHaveAccessibleName(
      "Open the source sheet in Google Sheets (opens in a new tab)",
    );
  });
});
```

Failure modes caught: suffix stacking at each real site (not just in the helper); the dangling-"for" empty-title label (`Open the source sheet for  in Google Sheets…`).

Note: `SheetTitleLink` renders the title link only when `buildSheetDeepLink` yields an href for `dfid` — if `dfid: "d1"` renders the plain-`<p>` branch, use a real-shaped Drive file id (copy the fixture id used by `tests/components/admin/wizard/Step3ReviewModal.test.tsx`) so the anchor branch renders; the assertion target is `getByRole("link")` either way.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run tests/components/a11y/newTabAnnouncementBehavior.test.tsx` → the file FAILS RED with unresolved imports (`DiagramTile`/`SheetTitleLink` are not exported yet) — that unexported-import failure IS the observed red state; no production file is touched before it is observed (plan r1 finding 1, invariant 1).
- [ ] **Step 3: Minimal implementation** — add the `export` keyword to `DiagramTile` and `SheetTitleLink`, then:
  - `SheetIconLink.tsx`: `const trimmed = stripNewTabSuffix(subjectLabel).trim();` replacing the bare trim feeding the existing ternary (fallback branch already handles empty).
  - `DiagramTile` anchor: `const strippedAlt = stripNewTabSuffix(alt);` then `aria-label={strippedAlt ? `${strippedAlt} (opens in a new tab)` : "Staged diagram (opens in a new tab)"}` (the `<img alt={alt}>` keeps the raw value — it is content, not a suffix-bearing label).
  - `SheetTitleLink`: `const strippedTitle = stripNewTabSuffix(title);` then `aria-label={strippedTitle ? `Open the source sheet for ${strippedTitle} in Google Sheets (opens in a new tab)` : "Open the source sheet in Google Sheets (opens in a new tab)"}` (visible link text keeps raw `title`).
- [ ] **Step 4: Update the containment census** — the new exact-name assertions add `"Open the source sheet"` occurrences to `newTabAnnouncementBehavior.test.tsx`, whose count is PINNED at 2 in `tests/components/admin/sheetIconLinkContainment.test.ts:53`. Run `pnpm exec vitest run tests/components/admin/sheetIconLinkContainment.test.ts`, read the actual new count from the failure message, and update that one pinned value in the same commit with a comment citing this plan (plan r1 finding 3).
- [ ] **Step 5: Re-run** the behavior file AND `pnpm exec vitest run tests/styles/_metaNewTabAnnouncement.test.ts` (unmodified, green — every branch still carries the literal phrase) AND `pnpm exec vitest run tests/components/admin/wizard/` (no chrome/card regression) AND the containment test (green on the updated pin).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "fix(admin): dedupe the appended new-tab suffix at the three interpolated labels (BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA)"`

### Task 4: Verification sweep + visual baseline regen

**Files:**
- Modify: `tests/e2e/section-header-visual.spec.ts-snapshots/*` (bot commit via workflow only)

- [ ] **Step 1:** `pnpm exec tsc --noEmit && pnpm exec eslint components/shared/NewTabHint.tsx components/admin/SheetIconLink.tsx components/admin/wizard/Step3SheetCard.tsx components/admin/wizard/step3ReviewSections.tsx tests/components/a11y tests/components/admin/wizard/modalSectionChromeClasses.test.tsx && pnpm exec prettier --check .` → clean.
- [ ] **Step 2:** Full unit suite `pnpm test` (or the repo's serial+parallel invocation) → green.
- [ ] **Step 3:** Push branch; `gh workflow run section-header-visual-regen.yml --ref fix/judgment-chip-newtab-suffix`; await the bot commit (precedent `64bdc34d3` message shape); `git pull` it into the worktree.
- [ ] **Step 4:** Push a validating commit if the workflow requires one (per `64bdc34d3` body: "Push a validating commit to run the gate on these baselines") — the Task 5 BACKLOG graduation commit serves.

### Task 5: BACKLOG graduation + close-out gates

**Files:**
- Modify: `BACKLOG.md` (remove both entries), `BACKLOG-archive.md` (append both with provenance + PR ref), spec close-out section.

- [ ] **Step 1:** Move `BL-HEADER-JUDGMENT-CHIP-CONTRAST` and `BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA` whole-entry to `BACKLOG-archive.md`; run `pnpm exec vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` → green (no id both active and archived).
- [ ] **Step 2:** Commit — `git add -A && git commit -m "docs: graduate BL-HEADER-JUDGMENT-CHIP-CONTRAST + BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA"`.
- [ ] **Step 3:** Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff (invariant 8; canonical v3 setup gates); fix or defer P0/P1 with dispositions recorded in the spec's close-out section (§12-style).
- [ ] **Step 4:** Whole-diff Codex review via codex-guard (REVIEWER ONLY, fresh-eyes, do-not-relitigate from spec §1.1) to APPROVE.
- [ ] **Step 5:** PR → real CI green → `gh pr merge --merge` → `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only` → verify `git rev-list --left-right --count main...origin/main` = `0  0` → CronDelete the nudge, clear pane label.
