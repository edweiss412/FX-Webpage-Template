# Pill size and draft-restored note: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the review-modal attention pill's type one size at phone widths on the four sites where it wraps inside a cap, and tell the operator, without scrolling, that a report draft came back.

**Architecture:** Two independent changes in one PR because they close two ledger rows Eric decided together. D1 is a class-swept classname change plus the browser assertions that prove it did not break the header's geometry or its 44px hit band. D2 adds one conditionally-mounted note at the top of the step-3 modal's content pane, announced through the shell's existing provider so no new live region is introduced.

**Tech Stack:** Next.js 16, React, Tailwind v4 (`@theme` tokens in `app/globals.css`), Vitest + jsdom for unit, Playwright (desktop-chromium) for real-browser geometry.

**Spec:** `docs/superpowers/specs/2026-08-30-pill-size-draft-restored-note-design.md`: canonical. Five adversarial rounds; §1.1 carries eight ratified decisions that are closed to relitigation.

## Global Constraints

- **Invariant 1 (TDD).** Every task: failing test, minimal implementation, passing test, commit. No implementation before its test.
- **Invariant 6 (commit per task).** `<type>(<scope>): <summary>`; scopes here are `crew-page`-adjacent admin UI, so use `fix(admin)`, `test(admin)`, `docs(plan)`.
- **Invariant 8 (impeccable dual gate).** Both `/impeccable critique` and `/impeccable audit` run on the diff before closeout. This is a UI arc; the gate is not optional.
- **Invariant 11.** All work in `/Users/ericweiss/FX-worktrees/p1pair`. Never the main checkout.
- **Type tokens are `@theme` names, never arbitrary values.** `--text-xs: 0.75rem` / line-height `1.4`; `--text-sm: 0.875rem` / line-height `1.45` (`app/globals.css:168-171`). `--breakpoint-sm: 640px` (`app/globals.css:318`).
- **No em dash and no apostrophe in any user-visible copy this arc adds.** Sentence case. No error code: §12.4 is not implicated, so no `pnpm gen:spec-codes` run and no `lib/messages/catalog.ts` row.
- **The responsive spelling is `text-sm sm:text-xs`,** mobile-first, matching all nine repo precedents. Ratified §1.1 R7.
- **Heavy phases run under `pnpm heavy`.** Every Playwright run in this plan is a heavy phase. Export a loopback `TEST_DATABASE_URL` and `HASH_FOR_LOG_PEPPER` before any e2e run (see the note under Task 4).
- **The four in-class sites are P1, P2, P3, W2 only.** `components/admin/wizard/Step3ReviewModal.tsx:574` and `components/admin/wizard/Step3ReviewModal.tsx:676` are out of class (§1.1 R8) and must still read `text-xs` when this arc ends.

---

## Pre-draft verification record

Run at plan time, not described for later. Negative and enumerative claims get their own search because a self-sweep is structurally blind to them. That is the lesson the spec stage ended on.

**V1: is any pill site missed? (enumerative)**

```
$ rg -l "max-sm:flex-wrap" components/
components/admin/wizard/Step3SheetCard.tsx
components/admin/wizard/Step3ReviewModal.tsx
components/admin/showpage/PublishedReviewModal.tsx
```

Three files, and the third is **not** a missed site. `components/admin/wizard/Step3SheetCard.tsx:757` is a cluster wrapper, `flex shrink-0 items-center gap-3 max-sm:w-full max-sm:flex-wrap max-sm:justify-between`: full width below `sm`, so there is no cap and no 112px budget; it wraps a View/Review button row onto a second row. The chip it holds (`components/admin/wizard/Step3SheetCard.tsx:588`, testid `wizard-step3-card-<dfid>-judgment-chip`) is `text-xs font-medium` on a **card**, not in the review-modal header the ledger row named. Out of class on surface, on cap, and on weight.

**V2: does any test already assert the pill's computed font size? (negative)**

```
$ rg -n "fontSize|font-size" tests/ | rg -i "pill|chip"
(no output)
```

None. AC-1 clause (a) is new coverage, not a duplicate.

**V3: does any e2e fixture seed a report-draft key? (negative; AC-12 rests on this)**

```
$ rg -n "fxav-report-draft" tests/
tests/admin/reportDraftStore.test.ts:42
tests/components/admin/wizard/step3ReviewSections.test.tsx:2061
```

Two hits, **neither under `tests/e2e/`**: one asserts the key builder's output, one is a jsdom component test. So AC-12's claim: no e2e fixture seeds the key: holds, and the note cannot mount in any existing geometry spec. Task 9 pins it so it stays true.

**V4: who drives `tests/e2e/_pillFocusLiveEntry.tsx`? (enumerative; Task 6 rests on this)**

```
$ rg -n "_pillFocusLiveEntry" tests/ | rg -v "^tests/e2e/_pillFocusLiveEntry.tsx"
tests/components/admin/sheetIconLinkContainment.test.ts:1088
tests/e2e/popover-clip-fit.spec.ts:49
tests/e2e/attention-pill-focus.spec.ts:58,71
tests/e2e/attention-autoopen-suppress.spec.ts:37
```

**Three real-browser suites bundle and drive it** (`popover-clip-fit`, `attention-pill-focus`, and the one under change), and `sheetIconLinkContainment.test.ts:1088` **scans its source text** and pins a count. The entry's own fence comment (`tests/e2e/_pillFocusLiveEntry.tsx:121-127`) names only two and predates `popover-clip-fit`; this census is from disk and supersedes it.

**V5: three-segment coverage today (negative, narrowed).** `tests/components/admin/showpage/publishedReviewModal.test.tsx:529-541` composes all three segments and asserts the pill's **text** in jsdom. No real-browser fixture does, and jsdom computes no layout, so no geometry exists for the three-segment case. Task 2 builds it.

## Meta-test inventory

- **Extends:** none of the registry-bearing suites change shape. `tests/components/_metaLiveRegionMounting.test.ts`'s registry value for `components/admin/wizard/Step3ReviewModal.tsx` stays at **1**: the note announces through `UndoAnnounceContext` and mounts no region of its own (spec §3.3). Task 9 asserts the value is unchanged rather than editing it.
- **Creates:** no new registry. The class-boundary guard in Task 1 is a scanning assertion inside an existing suite, not a new registry file.
- **Advisory-lock topology:** N/A: this arc touches no `pg_advisory*` path, no RPC, no DB layer at all.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `components/admin/showpage/PublishedReviewModal.tsx` | P1/P2/P3 type classes; the tap-band comment's arithmetic | 1 |
| `components/admin/wizard/Step3ReviewModal.tsx` | W2's type class; the new note's mount, state and announcement | 1, 7 |
| `tests/e2e/_publishedReviewModalHarness.tsx` | a three-segment page (issues + sheet warnings + monitoring) | 2 |
| `tests/e2e/published-review-modal.layout.spec.ts` | AC-1 geometry oracle, AC-3 clip oracle, AC-4 at the tall fixture | 3, 4, 5 |
| `tests/e2e/_pillFocusLiveEntry.tsx` | opt-in crew-warnings setter, default tree unchanged | 6 |
| `tests/e2e/attention-autoopen-suppress.spec.ts` | AC-2 three-segment occlusion | 6 |
| `tests/components/admin/wizard/Step3ReviewModal.test.tsx` | note behaviour: mount predicate, announcement, staleness | 7 |
| `tests/e2e/step3-review-modal.layout.spec.ts` | AC-11/16/17 note geometry and dismissal compounds | 8 |
| tests/styles/pillTypeClassBoundary.test.ts | AC-6: exactly the four in-class sites carry the pair | 1 |
| `DEFERRED.md`, `DEFERRED-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` | graduate both rows | 10 |

---

<!-- tasks: depth=3 red-contract -->

### Task 1: Move the four in-class pills to `text-sm sm:text-xs`, and fence the boundary

<!-- task: red=`pnpm vitest run tests/styles/pillTypeClassBoundary.test.ts` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1128` why=`the four in-class sites still carry bare text-xs, so the boundary guard's in-class arm finds zero of four` ac=AC-6,AC-7 -->

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx:1128`, `components/admin/showpage/PublishedReviewModal.tsx:1301`, `components/admin/showpage/PublishedReviewModal.tsx:1334`, and the tap-band comment at `components/admin/showpage/PublishedReviewModal.tsx:1099-1101`
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:599`
- Create: tests/styles/pillTypeClassBoundary.test.ts

**Interfaces:**
- Consumes: nothing.
- Produces: the shipped classname pair every later browser assertion measures. No exported symbol.

The guard scans source rather than taking a hand-written list, so a fifth capped-and-wrapping pill added later fails it. It asserts **both** directions, because R8 is a decision that can be eroded from either side: the four in-class sites carry the pair, and the two out-of-class wizard arms still carry bare `text-xs`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/styles/pillTypeClassBoundary.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

const ROOT = join(__dirname, "..", "..");
const PRM = "components/admin/showpage/PublishedReviewModal.tsx";
const S3M = "components/admin/wizard/Step3ReviewModal.tsx";

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** A class attribute is "in class" when it is a pill that WRAPS inside a cap -
 *  the construction spec §2.3 rules on. Both markers must be present. */
function wrappingPillClassAttrs(src: string): string[] {
  return [...src.matchAll(/className=\{?`?([^`"}]*max-sm:flex-wrap[^`"}]*)`?\}?/g)]
    .map((m) => m[1]!)
    .filter((c) => c.includes("rounded-pill"));
}

describe("pill type-size class boundary (spec §2.3, §1.1 R8)", () => {
  const prm = read(PRM);
  const s3m = read(S3M);

  it("premise: the scanner still finds the in-class sites it is meant to rank", () => {
    // Without this, a regex that silently matches nothing passes every
    // assertion below by vacuity, which is the exact shape this repo's premise rule
    // exists for.
    premise("wrapping pill class attrs in PublishedReviewModal", wrappingPillClassAttrs(prm).length, 0);
    premise("wrapping pill class attrs in Step3ReviewModal", wrappingPillClassAttrs(s3m).length, 0);
  });

  it("every wrapping capped pill carries the responsive pair", () => {
    const offenders = [...wrappingPillClassAttrs(prm), ...wrappingPillClassAttrs(s3m)].filter(
      (c) => !c.includes("text-sm sm:text-xs"),
    );
    expect(offenders, "a capped, wrapping pill left at bare text-xs").toEqual([]);
  });

  it("the two static published pills carry the pair too", () => {
    // P2 and P3 are spans, not wrapping-flex buttons, so the scanner above
    // cannot see them; they are named because they are three states of one
    // element and shipping one size for some states is the defect §2.5 rejects.
    for (const label of ["Alerts unavailable", "In sync"]) {
      const at = prm.indexOf(label);
      expect(at, `${label} still rendered`).toBeGreaterThan(-1);
      const attr = prm.lastIndexOf("className=", at);
      const chunk = prm.slice(attr, at);
      expect(chunk, `${label} pill missing the responsive pair`).toContain("text-sm sm:text-xs");
    }
  });

  it("the two out-of-class wizard arms are NOT swept (§1.1 R8)", () => {
    // The other direction of the same decision. An uncapped nowrap chip cannot
    // exhibit the wrapped-12px defect, and widening it trades title width for
    // legibility, a product call Eric has not been asked.
    for (const label of ["Sheet changed", "All clean"]) {
      const at = s3m.indexOf(label);
      expect(at, `${label} still rendered`).toBeGreaterThan(-1);
      const attr = s3m.lastIndexOf("className=", at);
      const chunk = s3m.slice(attr, at);
      expect(chunk, `${label} is out of class and must stay at text-xs`).toContain("text-xs");
      expect(chunk, `${label} must not gain the responsive pair`).not.toContain("sm:text-xs");
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/styles/pillTypeClassBoundary.test.ts`
Expected: FAIL. "a capped, wrapping pill left at bare text-xs" lists the two wrapping sites, and the static-pill case fails on both labels. The out-of-class case already passes: that arm guards against a future edit, and its passing now is correct.

- [ ] **Step 3: Make the four edits**

In `components/admin/showpage/PublishedReviewModal.tsx`, replace `text-xs` with `text-sm sm:text-xs` in exactly three class strings: the button pill at `components/admin/showpage/PublishedReviewModal.tsx:1128`, the "Alerts unavailable" span at `components/admin/showpage/PublishedReviewModal.tsx:1301`, the "In sync" span at `components/admin/showpage/PublishedReviewModal.tsx:1334`. In `components/admin/wizard/Step3ReviewModal.tsx`, the same replacement in the pill at `components/admin/wizard/Step3ReviewModal.tsx:599` only. Do not touch `components/admin/wizard/Step3ReviewModal.tsx:574` or `components/admin/wizard/Step3ReviewModal.tsx:676`.

- [ ] **Step 4: Update the tap-band arithmetic comment (AC-7)**

At `components/admin/showpage/PublishedReviewModal.tsx:1099-1101`, the comment derives the band from the old size. Replace its arithmetic with the new one, keeping the approximations as approximations:

```
   text-sm below sm (~20px line box) + py-1 (8px) ≈ a 28px visible pill;
   -inset-y-3 (12px per side) ≈ 52px ≥ the 44px tap floor. At sm and up the
   pill returns to text-xs (~16px line box) ≈ a 24px pill and a 48px band.
   T-TAP probes the resolved band (§10) at both.
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run tests/styles/pillTypeClassBoundary.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the neighbours that read these files**

Run: `pnpm vitest run tests/styles/alertPillLadder.test.ts tests/components/admin/showpage/publishedPill.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx`
Expected: PASS. The ladder ranks affordances (fill, outline, dot), not type size, so it must be unaffected: if it moves, the edit touched something it should not have.

- [ ] **Step 7: Commit**

```bash
git add components/admin/showpage/PublishedReviewModal.tsx components/admin/wizard/Step3ReviewModal.tsx tests/styles/pillTypeClassBoundary.test.ts
git commit -m "fix(admin): raise the attention pill one type size at phone widths"
```

### Task 2: A three-segment harness page

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-THREE-SEG"` red-state=authored red-target=`tests/e2e/_publishedReviewModalHarness.tsx:488` why=`the pages object has no three-segment entry, so the spec's beforeAll cannot write threeseg.html and the page 404s` ac=AC-1 -->

**Files:**
- Modify: `tests/e2e/_publishedReviewModalHarness.tsx` (new item builder + new page)
- Modify: `tests/e2e/published-review-modal.layout.spec.ts` (write the page in `beforeAll`, serve it)

**Interfaces:**
- Consumes: `harnessAttentionItems(count)` (`tests/e2e/_publishedReviewModalHarness.tsx:58`), the `attentionItems?: AttentionItem[]` override (`tests/e2e/_publishedReviewModalHarness.tsx:254`), `withCrewWarnings?: boolean` (`tests/e2e/_publishedReviewModalHarness.tsx:259`).
- Produces: `pages.threeSegment` (string), served as threeseg.html. Task 3, 4 and 5 open it.

Every committed harness item is `actionable: true`, so no page renders a monitoring segment. The monitoring branch needs `actionable: false` with `clearingKind: "self_heal"`: the same shape `components/admin/showpage/PublishedReviewModal.tsx` partitions on.

- [ ] **Step 1: Add the monitoring item builder**

In `tests/e2e/_publishedReviewModalHarness.tsx`, beside `harnessAttentionItems`:

```ts
/** N self-healing items: the pill renders "N monitoring". Distinct from
 *  `harnessAttentionItems`, whose items are all `actionable: true`, which is
 *  why no committed page rendered a monitoring segment before this. */
export function harnessMonitoringItems(count: number): AttentionItem[] {
  return Array.from({ length: count }, (_, i) => ({
    ...harnessAttentionItems(1)[0]!,
    id: `alert:harness-mon-${i}`,
    actionable: false,
    clearingKind: "self_heal" as const,
    menuTitle: `Harness monitoring item ${i + 1}`,
  }));
}
```

- [ ] **Step 2: Add the page**

In the returned `pages` object (`tests/e2e/_publishedReviewModalHarness.tsx:488` onward), after `crewWarningsCapped`:

```ts
      // spec 2026-08-30 §2.2 / AC-1: the ONLY page with all three segments
      // populated at once: issues, sheet warnings, monitoring. Every other
      // page's items are actionable, so the monitoring branch never rendered.
      threeSegment: renderModalHtml(HARNESS_ALERT_COUNT, {
        attentionItems: [...harnessAttentionItems(2), ...harnessMonitoringItems(2)],
        withCrewWarnings: true,
      }),
```

- [ ] **Step 3: Write and serve it from the spec**

In `tests/e2e/published-review-modal.layout.spec.ts`, add `threeSegment: string;` to the `pages` type, then beside the other `writeFileSync` calls:

```ts
  // spec 2026-08-30 AC-1: three-segment page (issues · sheet warnings · monitoring).
  writeFileSync(join(workDir, "threeseg.html"), pageHtml("out.css", pages.threeSegment));
```

and add `"threeseg.html"` to the served-file allow-list beside `"crewwarningscapped.html"`.

- [ ] **Step 4: Prove the page renders all three segments**

Add to the same spec:

```ts
test("T-THREE-SEG @375: the fixture really renders all three segments", async ({ page }) => {
  await openHarness(page, { width: 375, height: 812 }, "threeseg.html");
  const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
  await expect(pill).toHaveCount(1);
  const text = ((await pill.textContent()) ?? "").replace(/\s+/g, " ").trim();
  // Each segment named separately: a single combined regex passes when two of
  // the three are present and the third silently drops out.
  expect(text, "issues segment").toMatch(/\d+ issues?/);
  expect(text, "sheet-warnings segment").toMatch(/\d+ sheet warnings?/);
  expect(text, "monitoring segment").toMatch(/\d+ monitoring/);
});
```

- [ ] **Step 5: Run it and watch it fail, then pass**

Run: `pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-THREE-SEG"`
Before steps 1-3 this fails on a missing page. After them: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/_publishedReviewModalHarness.tsx tests/e2e/published-review-modal.layout.spec.ts
git commit -m "test(admin): add the three-segment attention-pill harness page"
```

### Task 3: AC-1: the geometry oracle for the three-segment pill

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-PILL-SIZE"` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1128` why=`clause (a) reads the resolved font-size at 375, which is 12px until Task 1 ships the responsive pair` ac=AC-1 -->

**Files:**
- Modify: `tests/e2e/published-review-modal.layout.spec.ts`

**Interfaces:**
- Consumes: `pages.threeSegment` served as threeseg.html (Task 2); `openHarness(page, viewport, htmlPath)` (`tests/e2e/published-review-modal.layout.spec.ts:247`).
- Produces: nothing consumed later.

The oracle is differential and non-clipping, never a pixel literal. Clauses (a)-(c) alone are all satisfied by a pill clamped to one line with its overflow hidden, which is why (d) and (e) exist. Runs at **375x812**, the spec's own sheet constant; §2.2 measured the geometry identical at 667 and 812, so nothing rests on the choice.

- [ ] **Step 1: Write the failing test**

```ts
test("T-PILL-SIZE @375x812: the three-segment pill is 14px, capped, unclipped, multi-line", async ({
  page,
}) => {
  const probe = async (width: number) => {
    await openHarness(page, { width, height: 812 }, "threeseg.html");
    const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
    await expect(pill).toHaveCount(1);
    return pill.evaluate((el) => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const segs = [...el.querySelectorAll("span")].map((s) => s.getBoundingClientRect());
      return {
        fontSize: cs.fontSize,
        h: box.height,
        w: box.width,
        contentH: box.height - padY - borderY,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        segsInside: segs.every(
          (s) => s.top >= box.top - 0.5 && s.bottom <= box.bottom + 0.5 &&
                 s.left >= box.left - 0.5 && s.right <= box.right + 0.5,
        ),
      };
    });
  };

  const phone = await probe(375);
  const desktop = await probe(900);

  // (a) the responsive pair actually applied, on both sides of the breakpoint
  expect(phone.fontSize, "phone pill is one size up").toBe("14px");
  expect(desktop.fontSize, "desktop pill is unchanged").toBe("12px");

  // (b) differential, not a literal: taller at the phone width for the same content
  expect(phone.h, "the larger type buys height").toBeGreaterThan(desktop.h);

  // (c) the wrap is cap-driven, so the width is spent before the height is
  const capPx = await page
    .locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`)
    .evaluate((el) => (el.parentElement?.parentElement as HTMLElement).getBoundingClientRect().width);
  expect(phone.w, "pill is at the capped width").toBeLessThanOrEqual(capPx + 0.5);

  // (d) nothing is clipped, and every segment is inside the pill's box
  expect(phone.scrollW, "no horizontal clipping").toBeLessThanOrEqual(phone.clientW + 0.5);
  expect(phone.scrollH, "no vertical clipping").toBeLessThanOrEqual(phone.clientH + 0.5);
  expect(phone.segsInside, "a segment escaped the pill's box").toBe(true);

  // (e) more than one flex line, measured against a single-line render of the
  //     SAME component in the SAME run: never a hardcoded line height
  await openHarness(page, { width: 375, height: 812 }, "harness.html");
  const single = await page
    .locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`)
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return box.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) -
        parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    });
  expect(
    phone.contentH,
    `three-segment content box (${phone.contentH}) should exceed one line (${single})`,
  ).toBeGreaterThan(single * 1.5);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-PILL-SIZE"`
Expected: FAIL on clause (a), `expected "12px" to be "14px"`, if run before Task 1. Run after Task 1 it should pass: if it does not, the failure is real geometry, not a missing edit.

- [ ] **Step 3: Run it and watch it pass**

Same command. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/published-review-modal.layout.spec.ts
git commit -m "test(admin): pin the three-segment pill's phone geometry"
```

### Task 4: AC-4: run T-LAYOUT's equation against the tall fixture

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-LAYOUT-TALL"` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1128` why=`the new case opens threeseg.html, which does not exist until Task 2, and measures a header whose pill is only tall once Task 1 ships` ac=AC-4 -->

**Files:**
- Modify: `tests/e2e/published-review-modal.layout.spec.ts`

**Interfaces:**
- Consumes: threeseg.html (Task 2); the existing `T-LAYOUT` measurement helpers in the same file.
- Produces: nothing.

`T-LAYOUT` opens the default page, whose pill is the one-segment case. RISK-2 is about the tall case, so the equation has to see it. **The equation includes the grab strip at sheet widths**: `headerH + mainH + footerH + (isSheet ? grabH : 0)` (`tests/e2e/published-review-modal.layout.spec.ts:346`). Omitting that term false-reds a correct phone layout.

> **Environment, needed by every Playwright step in this plan.** The harness spawns a `tsx` subprocess that requires `HASH_FOR_LOG_PEPPER`, and an inherited non-loopback `TEST_DATABASE_URL` points at the validation project whose cron emails Doug. Export both before any e2e run:
>
> ```bash
> export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
> export HASH_FOR_LOG_PEPPER="$(grep -m1 '^HASH_FOR_LOG_PEPPER=' .env.local | cut -d= -f2- | tr -d '"')"
> ```

- [ ] **Step 1: Write the failing test**

```ts
test("T-LAYOUT-TALL @375x812: the panel equation still closes with a three-segment pill", async ({
  page,
}) => {
  await openHarness(page, { width: 375, height: 812 }, "threeseg.html");

  const geom = await page.evaluate((modalSel) => {
    const root = document.querySelector(modalSel)!;
    const h = (sel: string) => {
      const el = root.querySelector(sel);
      return el ? el.getBoundingClientRect().height : 0;
    };
    const panel = root.querySelector<HTMLElement>("[data-review-modal-panel]")!;
    return {
      header: h("header"),
      main: h("main"),
      footer: h("footer"),
      grab: h("[data-testid$='-grab']"),
      panel: panel.clientHeight,
    };
  }, MODAL);

  // Non-vacuity: this case exists to exercise a TALL header. If the pill did
  // not wrap, the case is measuring the same thing T-LAYOUT already does.
  expect(geom.header, "header is genuinely tall (the pill wrapped)").toBeGreaterThan(120);

  // Sheet mode at 375, so the grab strip is a term. Dropping it false-reds a
  // correct layout by the grab height.
  const sum = geom.header + geom.main + geom.footer + geom.grab;
  expect(
    Math.abs(sum - geom.panel),
    `grab ${geom.grab} + header ${geom.header} + main ${geom.main} + footer ${geom.footer} vs panel ${geom.panel}`,
  ).toBeLessThanOrEqual(0.5);
});
```

- [ ] **Step 2: Run it, confirm the non-vacuity guard is doing work**

Run: `pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-LAYOUT-TALL"`
Expected before Task 2: FAIL, missing page. After Tasks 1-2: PASS. If the header assertion fails at ~30px, the fixture is not rendering three segments: go back to Task 2 rather than lowering the threshold.

- [ ] **Step 3: Run the whole layout spec at both viewports**

Run: `pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium`
Expected: PASS, including `T-LAYOUT` and `T-TAP` at 375 and 1280.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/published-review-modal.layout.spec.ts
git commit -m "test(admin): close the panel equation against a wrapped pill"
```

### Task 5: AC-3: prove the static pill wraps rather than clips

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-STATIC-WRAP"` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1301` why=`the geometric clip oracle reads the degraded pill at 14px, a width it does not reach until Task 1 changes that class string` ac=AC-3 -->

**Files:**
- Modify: `tests/e2e/published-review-modal.layout.spec.ts`

**Interfaces:**
- Consumes: an existing harness page whose pill is the degraded "Alerts unavailable" branch. Per spec §2.8 that branch renders only when every count is zero and `alertsDegraded` is true; the harness exposes `alertsDegraded` (`tests/e2e/_publishedReviewModalHarness.tsx:255`). Add a `degraded: renderModalHtml(0, { alertsDegraded: true })` page in the same shape as Task 2 and serve it as degraded.html.
- Produces: nothing.

An accessible-name check cannot catch this. The defect this guards against kept the DOM text complete while CSS clipped it to "Alerts unavailab": so the oracle has to be geometric.

- [ ] **Step 1: Write the failing test**

```ts
test("T-STATIC-WRAP @375: the degraded pill wraps and no glyph is clipped", async ({ page }) => {
  await openHarness(page, { width: 375, height: 812 }, "degraded.html");
  const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveText(/Alerts unavailable/);

  const probe = await pill.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // A Range over the label's own text node: its rect is where the glyphs
    // actually painted, which is the thing `overflow:hidden` lies about.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textRect: DOMRect | null = null;
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      if (!n.textContent?.includes("Alerts unavailable")) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      textRect = r.getBoundingClientRect();
    }
    return {
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      scrollH: el.scrollHeight, clientH: el.clientHeight,
      fontSize: cs.fontSize,
      textInside:
        textRect !== null &&
        textRect.left >= box.left - 0.5 && textRect.right <= box.right + 0.5 &&
        textRect.top >= box.top - 0.5 && textRect.bottom <= box.bottom + 0.5,
      found: textRect !== null,
    };
  });

  expect(probe.found, "premise: the label's text node was located").toBe(true);
  expect(probe.fontSize, "the static pill moved with its siblings").toBe("14px");
  expect(probe.scrollW, "no horizontal clipping").toBeLessThanOrEqual(probe.clientW + 0.5);
  expect(probe.scrollH, "no vertical clipping").toBeLessThanOrEqual(probe.clientH + 0.5);
  expect(probe.textInside, "the label painted outside the pill's box").toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail, then pass**

Run: `pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-STATIC-WRAP"`
Before Task 1: FAIL on the 14px assertion. After: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/_publishedReviewModalHarness.tsx tests/e2e/published-review-modal.layout.spec.ts
git commit -m "test(admin): prove the degraded pill wraps instead of clipping"
```

### Task 6: AC-2: reach a three-segment load in the occlusion spec

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts --project=desktop-chromium` red-state=authored red-target=`tests/e2e/_pillFocusLiveEntry.tsx:118` why=`the entry's overrides never set crew warnings, so the sheet-warnings segment cannot render and the new three-segment premise assertion fails` ac=AC-2,AC-2b -->

**Files:**
- Modify: `tests/e2e/_pillFocusLiveEntry.tsx` (opt-in setter, default tree untouched)
- Modify: `tests/e2e/attention-autoopen-suppress.spec.ts`

**Interfaces:**
- Consumes: `window.__setItems(a, n, s, degraded, longTitles?)` (`tests/e2e/_pillFocusLiveEntry.tsx:92`), the `__setRefusal` opt-in pattern (`tests/e2e/_pillFocusLiveEntry.tsx:95`, `tests/e2e/_pillFocusLiveEntry.tsx:115`, fenced `tests/e2e/_pillFocusLiveEntry.tsx:121-127`).
- Produces: `window.__setCrewWarnings(n)`. No other suite calls it.

`buildItems` emits only attention items, so `k` is structurally always 0 in this entry and the sheet-warnings segment can never render. That is why AC-2 was unimplementable before this task. The setter is **opt-in and default-off**, exactly like `__setRefusal`, so the default tree stays byte-identical for the three other consumers found in V4: two that drive it (`tests/e2e/popover-clip-fit.spec.ts:49`, `tests/e2e/attention-pill-focus.spec.ts:58`) and one that scans its source and pins a count (`tests/components/admin/sheetIconLinkContainment.test.ts:1088`).

- [ ] **Step 1: Extend the entry, default-off**

```ts
// in the `declare global` Window block, beside __setRefusal:
    __setCrewWarnings?: (n: number) => void;

// beside the other setters:
    window.__setCrewWarnings = (n) => setCrewWarningCount(n);

// and in the overrides object, in the SAME opt-in shape as setPublished, so a
// consumer that never calls the setter sees a byte-identical tree:
    ...(crewWarningCount > 0 ? { withCrewWarnings: true } : {}),
```

- [ ] **Step 2: Assert the default tree did not move**

Run: `pnpm vitest run tests/components/admin/sheetIconLinkContainment.test.ts`
Expected: PASS. That suite pins a source-scan count over this entry; if it moves, the edit changed more than the opt-in branch.

Run: `pnpm heavy npx playwright test tests/e2e/attention-pill-focus.spec.ts tests/e2e/popover-clip-fit.spec.ts --project=desktop-chromium`
Expected: PASS. These two drive the entry and never call the new setter, so they must be unaffected. **If either moves, stop and take AC-2b**: revert the entry change, run AC-2 at `__setItems(a, 3, 3, false)` (two segments, `6 issues · 3 monitoring`), and record the untested three-segment interceptor height as a documented limit in the spec with a re-file trigger of "the next arc touching the attention pill's hit band."

- [ ] **Step 3: Drive the three-segment load and assert the premise**

In `tests/e2e/attention-autoopen-suppress.spec.ts`, in the boot helper beside the existing `__setItems` call, add `__setCrewWarnings(2)`. Then before the occlusion assertion:

```ts
  // Premise, on this case's OWN inputs. Without it a dropped segment shrinks
  // the pill to one line and the occlusion check passes on a load that never
  // exercised the risk it exists for.
  const pillText = ((await page.locator(PILL_SEL).textContent()) ?? "").replace(/\s+/g, " ");
  expect(pillText, "issues segment present").toMatch(/\d+ issues?/);
  expect(pillText, "sheet-warnings segment present").toMatch(/\d+ sheet warnings?/);
  expect(pillText, "monitoring segment present").toMatch(/\d+ monitoring/);
```

- [ ] **Step 4: Run the suite**

Run: `pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts --project=desktop-chromium`
Expected: PASS, with the suppressed-menu case asserting nothing intercepts the toggle at the now-taller pill, and its open-menu positive control still observing an interceptor.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/_pillFocusLiveEntry.tsx tests/e2e/attention-autoopen-suppress.spec.ts
git commit -m "test(admin): exercise toggle occlusion at a three-segment pill"
```

### Task 7: The "Draft restored" note

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:954` why=`the modal renders no note at all, so every case that queries the testid finds nothing` ac=AC-8,AC-9,AC-10,AC-13,AC-18 -->

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (state, effect, announcement, markup)
- Create: tests/components/admin/wizard/draftRestoredNote.test.tsx

**Interfaces:**
- Consumes: `reportDraftStorageKey(wizardSessionId, driveFileId)` and `readStoredDraft(storageKey)` from `lib/admin/reportDraftStore.ts:38` / `lib/admin/reportDraftStore.ts:61`; `const { dfid, wizardSessionId } = data;` already in scope at `components/admin/wizard/Step3ReviewModal.tsx:156` (`data: StagedSectionData`, `components/admin/wizard/Step3ReviewModal.tsx:144`); `UndoAnnounceContext` from `@/components/admin/undoAnnounceContext`, whose provider wraps the whole panel interior at `components/admin/review/ReviewModalShell.tsx:647-655`.
- Produces: `data-testid={`wizard-step3-card-${dfid}-draft-restored-note`}`. Tasks 8 and 9 query it.

The draft is restored on the first frame by a lazy `useState` initializer (`components/admin/wizard/step3ReviewSections.tsx:4683`), so there is no restore event to hook. The note reads the same store with the same key in its own mount-time initializer. **It announces through the existing provider and mounts no live region**, because it is conditionally mounted and `tests/components/_metaLiveRegionMounting.test.ts` forbids a gated one (`tests/components/_metaLiveRegionMounting.test.ts:427-450`, `tests/components/_metaLiveRegionMounting.test.ts:461`).

The copy states a completed event, never a present-tense claim about the draft. The operator can clear or submit inside the five-second window; past-tense copy cannot be falsified by that, and no note-to-draft coupling is needed.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/wizard/draftRestoredNote.test.tsx
/** @vitest-environment jsdom */
import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportDraftStorageKey } from "@/lib/admin/reportDraftStore";

import { renderStep3Modal, WSID, DFID } from "./_step3ReviewFixture";

const KEY = reportDraftStorageKey(WSID, DFID);
const NOTE = `wizard-step3-card-${DFID}-draft-restored-note`;

describe("draft-restored note (spec §3.2-§3.6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it("premise: the fixture's key is the one the modal computes", () => {
    // Without this the whole suite can pass by seeding a key nothing reads.
    expect(KEY).toBe(`fxav-report-draft-wizard-${WSID}-${DFID}`);
  });

  it("renders when a non-empty draft was restored (AC-8)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    renderStep3Modal();
    expect(screen.getByTestId(NOTE)).toBeTruthy();
  });

  it.each([
    ["absent key", null],
    ["empty string", ""],
    ["whitespace only", "   \n\t "],
  ])("does not render for %s (AC-9)", (_label, value) => {
    if (value !== null) window.sessionStorage.setItem(KEY, value);
    renderStep3Modal();
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it("never appears after mount, even when the operator types (AC-10)", () => {
    renderStep3Modal();
    expect(screen.queryByTestId(NOTE)).toBeNull();
    act(() => {
      window.sessionStorage.setItem(KEY, "typed after opening");
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId(NOTE), "the note is a restore signal, not a draft signal").toBeNull();
  });

  it("dismisses at 5000ms and not before (AC-15, timing)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    renderStep3Modal();
    act(() => void vi.advanceTimersByTime(4999));
    expect(screen.queryByTestId(NOTE), "still up at 4999ms").toBeTruthy();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.queryByTestId(NOTE), "gone at 5001ms").toBeNull();
  });

  it("stays accurate when the draft is cleared under it (AC-18)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    renderStep3Modal();
    const before = screen.getByTestId(NOTE).textContent;
    act(() => {
      window.sessionStorage.removeItem(KEY);
      vi.advanceTimersByTime(1000);
    });
    const after = screen.getByTestId(NOTE).textContent;
    expect(after, "copy describes the restore, not the draft's current state").toBe(before);
    // And it is past tense, so clearing cannot falsify it.
    expect(after).toMatch(/restored/i);
    expect(after, "no present-tense claim about the draft").not.toMatch(/is waiting|awaits/i);
  });

  it("announces once per mount, only with a draft, matching the visible copy (AC-13)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    const announce = vi.fn();
    renderStep3Modal({ announce });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]![0]).toBe(screen.getByTestId(NOTE).textContent);

    announce.mockClear();
    window.sessionStorage.clear();
    renderStep3Modal({ announce });
    expect(announce, "no draft, no announcement").not.toHaveBeenCalled();
  });

  it("copy holds the mechanical rules", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    renderStep3Modal();
    const text = screen.getByTestId(NOTE).textContent ?? "";
    expect(text, "no em dash in user-visible copy").not.toContain("-");
    expect(text, "no apostrophe").not.toMatch(/['’]/);
    expect(text, "names the destination section").toContain("Report an issue");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx`
Expected: FAIL. Every case that queries the testid finds nothing, because the modal renders no note.

If `_step3ReviewFixture.ts` has no `renderStep3Modal` helper accepting an `announce` override, add one in this task: wrap the rendered tree in `<UndoAnnounceContext.Provider value={{ announce }}>` so the spy is reachable without touching the shell.

- [ ] **Step 3: Implement**

In `components/admin/wizard/Step3ReviewModal.tsx`, near the other hooks:

```tsx
// spec 2026-08-30 §3.2. Mirrors how the draft itself is restored: a lazy
// initializer that runs once, at mount, because restoration happens on the
// first frame and leaves no event to hook.
const [draftRestored, setDraftRestored] = useState(() => {
  if (!dfid || !wizardSessionId) return false;
  return readStoredDraft(reportDraftStorageKey(wizardSessionId, dfid)).trim() !== "";
});
const { announce } = useContext(UndoAnnounceContext);

useEffect(() => {
  if (!draftRestored) return;
  announce(DRAFT_RESTORED_NOTE);
  const t = setTimeout(() => setDraftRestored(false), DRAFT_RESTORED_NOTE_MS);
  return () => clearTimeout(t);
  // Mount-scoped by construction: `draftRestored` only ever goes true -> false,
  // so this cannot re-announce.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

with the copy and timing as module constants beside the component:

```tsx
/** 5s, matching the in-file transient precedent at
 *  components/admin/wizard/step3ReviewSections.tsx:1683-1687. Not a new number. */
const DRAFT_RESTORED_NOTE_MS = 5_000;
/** Past tense deliberately (spec §3.4): the operator can clear or submit inside
 *  the window, and a present-tense claim would be false on screen with nothing
 *  to correct it. "Report an issue" is the section label, verbatim
 *  (components/admin/wizard/step3ReviewSections.tsx:5154). */
const DRAFT_RESTORED_NOTE = "Report draft restored, in Report an issue at the end of this list.";
```

and render it as the first child of the content-pane top slot, immediately before the resolution `<section>` at `components/admin/wizard/Step3ReviewModal.tsx:954`:

```tsx
{draftRestored ? (
  <p
    data-testid={`wizard-step3-card-${dfid}-draft-restored-note`}
    aria-hidden="true"
    className="w-full rounded-md bg-surface-sunken px-3 py-2 text-xs/relaxed text-text-subtle"
  >
    {DRAFT_RESTORED_NOTE}
  </p>
) : null}
```

`w-full` is explicit: the scroller is `flex ... flex-col` (`components/admin/review/ShowReviewSurface.tsx:1051-1055`), and although a `flex-col` parent with no `items-*` override does stretch an auto-sized child by default, this project's dimensional-invariant rule wants the guaranteeing class named rather than a default relied on: a later `items-start` on that parent would remove it silently.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx`
Expected: PASS, 9 cases.

- [ ] **Step 5: Run the four string-presence mutants before moving on**

The copy assertions are string-presence guards, so run all four and record the result in the commit body:

1. Empty the constant (`DRAFT_RESTORED_NOTE = ""`): the "names the destination" case must fail.
2. Append a suffix: the AC-13 equality case must still pass (it compares to the rendered text, so a suffix moves both) while the AC-18 tense case still holds; if appending `" It is waiting."` does **not** fail the tense assertion, that assertion is too weak.
3. Present but not live: move the constant into a comment or behind `false &&`: every render case must fail.
4. Vary the discriminating parameter: seed the key with whitespace and confirm the AC-9 row fails if the predicate is loosened to `!== ""`.

- [ ] **Step 6: Commit**

```bash
git add components/admin/wizard/Step3ReviewModal.tsx tests/components/admin/wizard/draftRestoredNote.test.tsx tests/components/admin/wizard/_step3ReviewFixture.ts
git commit -m "fix(admin): tell the operator the report draft came back"
```

### Task 8: Layout-dimensions task (mandatory): the note in a real browser

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/step3-review-modal.layout.spec.ts --project=desktop-chromium -g "T-NOTE"` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:954` why=`the note's testid does not exist in the rendered tree until Task 7 mounts it, so the locator resolves to zero nodes` ac=AC-8,AC-11,AC-16 -->

**Files:**
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts`, `tests/e2e/_step3ReviewModalHarness.tsx`

**Interfaces:**
- Consumes: the note's testid (Task 7); the harness's `Step3ReviewModal` mount (`tests/e2e/_step3ReviewModalHarness.tsx:285-299`); the scroller `[data-testid="wizard-step3-card-<dfid>-review-content"]` (`components/admin/review/ShowReviewSurface.tsx:1053`).
- Produces: nothing.

jsdom computes no layout, so Task 7 proves the note's behaviour and this task proves its geometry. The harness must seed `sessionStorage` **before the entry hydrates**, via `page.addInitScript`, or the lazy initializer runs against an empty store.

**Dimensional invariants under test, verbatim from spec §3.7:**

- **DI-8**: scroller to note, full content width. The scroller is `flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-tile-pad motion-safe:scroll-smooth`; the note carries an explicit `w-full`.
- **DI-9**: the note is never a zero-height in-flow child: it renders with content and padding, or is absent from the DOM.
- **DI-10**: removing the note raises every following section by the note's height **plus the scroller's 24px `gap-6`**, not by its height alone.
- **DI-11**: the note mounts only when `sessionStorage` holds a non-empty draft for its exact key.

- [ ] **Step 1: Write the failing tests**

```ts
const NOTE = `[data-testid="wizard-step3-card-${HARNESS_DFID}-draft-restored-note"]`;
const PANE = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-content"]`;
const KEY = `fxav-report-draft-wizard-${HARNESS_WSID}-${HARNESS_DFID}`;

async function openWithDraft(page: Page, draft: string | null) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  // BEFORE hydration: the modal reads the store in a mount-time initializer.
  await page.addInitScript(
    ([k, v]) => { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); },
    [KEY, draft] as const,
  );
  await page.goto(baseUrl + "live.html");
  await page.evaluate(() => document.fonts.ready);
}

test("T-NOTE-GEOM @375x812: the note spans the pane and sits above the fold (AC-8, DI-8, DI-9)", async ({
  page,
}) => {
  await openWithDraft(page, "half a sentence");
  const note = page.locator(NOTE);
  await expect(note).toHaveCount(1);

  const g = await page.evaluate(
    ([noteSel, paneSel]) => {
      const n = document.querySelector(noteSel)!.getBoundingClientRect();
      const p = document.querySelector(paneSel)!;
      const pr = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      return { nW: n.width, nH: n.height, nTop: n.top, nBottom: n.bottom,
               pW: pr.width, pTop: pr.top, pBottom: pr.bottom, padX,
               gap: parseFloat(cs.rowGap || cs.gap) };
    },
    [NOTE, PANE] as const,
  );

  // DI-8: full content width, within 0.5px of the pane's content box.
  expect(Math.abs(g.nW - (g.pW - g.padX)), "note does not span the pane's content width").toBeLessThanOrEqual(0.5);
  // DI-9: not a zero-height in-flow child.
  expect(g.nH, "note has real height").toBeGreaterThan(0);
  // AC-8: reachable without scrolling: inside the pane's initial viewport.
  expect(g.nTop).toBeGreaterThanOrEqual(g.pTop - 0.5);
  expect(g.nBottom).toBeLessThanOrEqual(g.pBottom + 0.5);
  // DI-10's constant, read rather than assumed.
  expect(g.gap, "scroller row gap").toBeGreaterThan(0);
});

test("T-NOTE-SHIFT @375x812: dismissal raises content by the note plus the gap (AC-11, DI-10)", async ({
  page,
}) => {
  await openWithDraft(page, "half a sentence");
  const before = await page.evaluate(
    ([noteSel, paneSel]) => {
      const n = document.querySelector(noteSel)!.getBoundingClientRect();
      const p = document.querySelector(paneSel)! as HTMLElement;
      const cs = getComputedStyle(p);
      const next = document.querySelector(noteSel)!.nextElementSibling!;
      return { noteH: n.height, gap: parseFloat(cs.rowGap || cs.gap),
               nextTop: next.getBoundingClientRect().top, scrollTop: p.scrollTop,
               nextId: next.getAttribute("data-testid") ?? next.tagName };
    },
    [NOTE, PANE] as const,
  );

  await expect(page.locator(NOTE)).toHaveCount(0, { timeout: 8_000 });

  const after = await page.evaluate(
    ([paneSel, nextId]) => {
      const p = document.querySelector(paneSel)! as HTMLElement;
      const next = document.querySelector(`[data-testid="${nextId}"]`) ?? p.firstElementChild!;
      return { nextTop: next.getBoundingClientRect().top, scrollTop: p.scrollTop };
    },
    [PANE, before.nextId] as const,
  );

  // The real consequence, derived from measurement: the follower rises by the
  // note's height PLUS the scroller's gap. "scrollTop unchanged" alone proves
  // nothing: an in-flow node vanishing above the fold leaves it untouched
  // WHILE everything below moves.
  expect(after.scrollTop, "pane stays at the top").toBe(before.scrollTop);
  expect(
    Math.abs((before.nextTop - after.nextTop) - (before.noteH + before.gap)),
    `follower rose ${before.nextTop - after.nextTop}, expected ${before.noteH + before.gap}`,
  ).toBeLessThanOrEqual(1);
});

test("T-NOTE-SCROLLED @375x812: dismissal while scrolled moves nothing visible (AC-16)", async ({
  page,
}) => {
  await openWithDraft(page, "half a sentence");
  await expect(page.locator(NOTE)).toHaveCount(1); // present BEFORE
  const ref = await page.evaluate((paneSel) => {
    const p = document.querySelector(paneSel)! as HTMLElement;
    p.scrollTop = 400;
    const el = document.elementFromPoint(p.getBoundingClientRect().left + 20,
                                         p.getBoundingClientRect().top + 200)!;
    const id = el.getAttribute("data-testid") ?? "";
    el.setAttribute("data-note-ref", "1");
    return { id, top: el.getBoundingClientRect().top, scrollTop: p.scrollTop };
  }, PANE);
  expect(ref.scrollTop, "premise: the pane really scrolled past the note").toBeGreaterThan(0);

  await expect(page.locator(NOTE)).toHaveCount(0, { timeout: 8_000 }); // absent AFTER

  const top = await page.evaluate(() =>
    document.querySelector("[data-note-ref]")!.getBoundingClientRect().top);
  expect(Math.abs(top - ref.top), "visible content moved under the operator").toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm heavy npx playwright test tests/e2e/step3-review-modal.layout.spec.ts --project=desktop-chromium -g "T-NOTE"`
Expected: FAIL, `toHaveCount(1)` receives 0, before Task 7.

- [ ] **Step 3: Run them and watch them pass**

Same command. Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/_step3ReviewModalHarness.tsx
git commit -m "test(admin): pin the draft-restored note's geometry and dismissal shift"
```

### Task 9: Transition-audit task (mandatory)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/draftRestoredNoteTransitions.test.tsx` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:954` why=`the audit enumerates the note's conditional block and asserts it declares no exit transition; with no note rendered the enumeration finds nothing and the premise fails` ac=AC-15,AC-17,AC-12 -->

**Files:**
- Create: tests/components/admin/wizard/draftRestoredNoteTransitions.test.tsx
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts` (the AC-17 compound)

**Interfaces:**
- Consumes: the note's markup (Task 7); `tests/components/_metaLiveRegionMounting.test.ts`'s registry.
- Produces: nothing.

**Transition inventory under test, verbatim from spec §3.6.** Three states: **A** absent, **V** visible, **G** gone: so three pairs, plus compounds:

| Pair | Declared treatment |
|---|---|
| A to V | unreachable after mount (state fixed in the mount initializer) |
| V to G | instant unmount at 5000ms, no transition, no exit animation |
| A to G | same DOM state, instant |
| compound: dismissal during the modal entrance | cannot collide; entrance is CSS on scrim and panel only |
| compound: dismissal while scrolled | AC-16 |
| compound: dismissal during a section expand/collapse | AC-17, both directions |
| compound: draft cleared or submitted under the note | AC-18, note unaffected and still true |
| compound: report section opened inside the window | note still dismisses on its own timer |

- [ ] **Step 1: Write the failing audit**

```tsx
/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "..", "..", "..", "..", "components", "admin", "wizard", "Step3ReviewModal.tsx"),
  "utf8",
);

describe("draft-restored note: transition audit (spec §3.6)", () => {
  it("premise: the note's conditional block is present to audit", () => {
    expect(SRC).toContain("draft-restored-note");
  });

  it("declares no exit transition or animation (AC-15)", () => {
    const at = SRC.indexOf("draft-restored-note");
    const attr = SRC.lastIndexOf("className=", at);
    const block = SRC.slice(attr, SRC.indexOf(">", at));
    for (const banned of ["transition", "animate-", "duration-", "AnimatePresence", "exit="]) {
      expect(block, `note must be instant; found ${banned}`).not.toContain(banned);
    }
  });

  it("has no AnimatePresence or framer-motion anywhere in this modal", () => {
    expect(SRC).not.toContain("AnimatePresence");
    expect(SRC).not.toContain("framer-motion");
  });

  it("is mount-gated and therefore must NOT be a live region (AC-12)", () => {
    const at = SRC.indexOf("draft-restored-note");
    const block = SRC.slice(SRC.lastIndexOf("<", at), SRC.indexOf(">", at));
    expect(block, "a gated live region is the shape the meta-test forbids").not.toMatch(
      /role=["']status["']|aria-live=/,
    );
    expect(block, "the visible note is decorative; the announcement carries it").toContain("aria-hidden");
  });
});
```

- [ ] **Step 2: Add the AC-17 compound in the browser**

In `tests/e2e/step3-review-modal.layout.spec.ts`, both directions and both starting scroll states:

```ts
for (const dir of ["expand", "collapse"] as const) {
  test(`T-NOTE-COMPOUND-${dir} @375x812: toggling a section while the note is live (AC-17)`, async ({
    page,
  }) => {
    await openWithDraft(page, "half a sentence");
    await expect(page.locator(NOTE)).toHaveCount(1);

    const trigger = page.locator(`${PANE} [aria-expanded]`).first();
    const was = await trigger.getAttribute("aria-expanded");
    if ((dir === "collapse") !== (was === "true")) await trigger.click();
    const start = await trigger.getAttribute("aria-expanded");

    await trigger.click();
    // Premise on this case's OWN inputs: the section actually changed state.
    await expect(trigger, `section did not ${dir}`).not.toHaveAttribute("aria-expanded", start!);

    const before = await page.evaluate((paneSel) => {
      const p = document.querySelector(paneSel)! as HTMLElement;
      return { scrollTop: p.scrollTop };
    }, PANE);

    await expect(page.locator(NOTE)).toHaveCount(0, { timeout: 8_000 });

    const after = await page.evaluate((paneSel) => {
      const p = document.querySelector(paneSel)! as HTMLElement;
      return { scrollTop: p.scrollTop };
    }, PANE);
    expect(after.scrollTop, "scroll moved during a compound dismissal").toBe(before.scrollTop);
  });
}
```

- [ ] **Step 3: Run both and watch them fail, then pass**

Run: `pnpm vitest run tests/components/admin/wizard/draftRestoredNoteTransitions.test.tsx`
Run: `pnpm heavy npx playwright test tests/e2e/step3-review-modal.layout.spec.ts --project=desktop-chromium -g "T-NOTE-COMPOUND"`

- [ ] **Step 4: Assert the live-region registry did not move (AC-12)**

Run: `pnpm vitest run tests/components/_metaLiveRegionMounting.test.ts`
Expected: PASS **with its declared count for `components/admin/wizard/Step3ReviewModal.tsx` still `1`.** Do not edit the registry. If it demands a change, the note grew a live region and the design in spec §3.3 was not followed.

- [ ] **Step 5: Assert no e2e fixture seeds the draft key (AC-12, DI-11)**

Run: `rg -n "fxav-report-draft" tests/e2e/ | rg -v "step3-review-modal.layout.spec.ts"`
Expected: **no output.** The note's isolation from every other geometry spec is the whole protection; this is the only assertion that would notice it breaking.

- [ ] **Step 6: Commit**

```bash
git add tests/components/admin/wizard/draftRestoredNoteTransitions.test.tsx tests/e2e/step3-review-modal.layout.spec.ts
git commit -m "test(admin): audit the note's transitions and compounds"
```

### Task 10: Graduate both ledger rows and close the gates

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the two ids added to the GRADUATED registry are still present in DEFERRED.md and absent from DEFERRED-archive.md, so the archive-only assertion fails on each` ac=AC-14 -->

**Files:**
- Modify: `DEFERRED.md` (remove both entries and their in-progress markers), `DEFERRED-archive.md` (append both with provenance), `tests/docs/_metaDeferralLedgerGraduation.test.ts` (two `GRADUATED` rows)
- Modify: the plan's own closeout section below

**Interfaces:**
- Consumes: the `GRADUATED` array (`tests/docs/_metaDeferralLedgerGraduation.test.ts:72`), whose loop asserts each id is present in `DEFERRED-archive.md` and absent from `DEFERRED.md` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:848-853`).
- Produces: nothing.

The in-progress markers come off **here, in the PR's last commit**, not afterwards: a marker that merges into main names a branch the merge just deleted, and the origin-existence rule in `tests/docs/_metaLedgerInProgress.test.ts` then reds main until someone clears it. A graduating entry's marker comes off in the same commit that archives it, because archives categorically reject in-progress entries.

- [ ] **Step 1: Add both ids to `GRADUATED` first, and watch the guard fail**

```ts
  // fix/pill-size-draft-restored-note (2026-08-30). Eric ruled both on the
  // 2026-08-29 decision board: the pill's type moves one size up at phone
  // widths (decision 5B), and a transient note ships instead of a rail count
  // (decision 6B), leaving the §D2 no-status-dot contract intact.
  "ATTENTION-PILL-PHONE-LEGIBILITY-1",
  "WIZARD-REPORT-DRAFT-RESTORE-UNDISCOVERABLE-1",
```

Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: FAIL: both ids are `missing from DEFERRED-archive.md` and both are `still in DEFERRED.md`. That is the genuine red this task is built around: the registry row asserts a move that has not happened yet.

- [ ] **Step 2: Move both entries**

Cut each entry whole from `DEFERRED.md` and append to `DEFERRED-archive.md`, **deleting the `· **Status:** IN PROGRESS · **Branch:** fix/pill-size-draft-restored-note` run from each meta line as you go.** Add one provenance line per entry naming what shipped and where: the four in-class sites and the out-of-class fence for the first, the note's placement and past-tense copy for the second, both citing this plan and the spec.

- [ ] **Step 3: Run the ledger guards**

Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`
Expected: PASS. `_metaLedgerInProgress` passing confirms no marker survived into the archive or the active queue.

- [ ] **Step 4: Verify the CI wiring reaches a real run (AC-14)**

The workflow and project entries landed with the spec. Confirm both, from disk rather than memory:

```bash
rg -n "step3-review-modal\.layout" playwright.config.ts .github/workflows/step3-live-bundle.yml
```

Expected: three hits: the `desktop-chromium` `testMatch`, the workflow's `paths` watch, and the workflow's `playwright test` invocation. **If real CI reds or flakes on that spec, take the pre-made fallback in spec §5:** revert the workflow entry only, keep the `playwright.config.ts` project wire, and record the CI gap as a documented limit with a re-file trigger of "the next arc touching Step3ReviewModal layout."

- [ ] **Step 5: Full local verification**

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export HASH_FOR_LOG_PEPPER="$(grep -m1 '^HASH_FOR_LOG_PEPPER=' .env.local | cut -d= -f2- | tr -d '"')"
pnpm typecheck && pnpm exec eslint . && pnpm format:check
pnpm heavy pnpm test
pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/attention-autoopen-suppress.spec.ts tests/e2e/attention-pill-focus.spec.ts tests/e2e/popover-clip-fit.spec.ts --project=desktop-chromium
```

All must pass. The last three e2e specs are the shared-entry consumers from V4: they are in this list because Task 6 edits the entry they share.

- [ ] **Step 6: Commit**

```bash
git add DEFERRED.md DEFERRED-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit -m "docs(plan): graduate both phone P1 rows"
```

<!-- tasks: end -->

---

## 12. Closeout

impeccable-gate: `/impeccable critique` + `/impeccable audit` on the whole diff, before the whole-diff cross-model review and before this arc reports READY. Both halves run with the canonical v3 setup gates: context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read. Findings and dispositions land in this section; P0 and P1 are fixed or explicitly deferred with a `DEFERRED.md` entry.

**UI surfaces in this diff:** `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`. No `app/globals.css` `@theme` change, no `DESIGN.md` change, no new colour token, so no new contrast ratio needs pinning.

**Pre-code mechanical checklist** (run before the gate, which verifies rather than discovers): 44px tap targets including the pill's resolved hit band at the new size; no em dash and no apostrophe in the note's copy; canonical type and token classes only, no arbitrary values; `text-xs/relaxed` and `text-subtle` for secondary copy.

### Acceptance-criteria coverage map

Criteria are declared in the spec (§5) and claimed here, per the coverage-map convention.

| AC | Task |
|---|---|
| AC-1 | Tasks 2, 3 |
| AC-2, AC-2b | Task 6 |
| AC-3 | Task 5 |
| AC-4 | Task 4 |
| AC-5 | Task 4 (T-TAP runs in the full-spec step) |
| AC-6, AC-7 | Task 1 |
| AC-8 | Tasks 7, 8 |
| AC-9, AC-10, AC-13, AC-18 | Task 7 |
| AC-11, AC-16 | Task 8 |
| AC-12 | Task 9 |
| AC-14 | Task 10 |
| AC-15, AC-17 | Task 9 |

## Self-review record

- **Spec coverage.** Every §5 criterion appears in the map above. §2.3's four sites are Task 1; §2.5's exclusion is asserted in both directions by Task 1's fourth case; §3.2-§3.6's design is Tasks 7-9; §4's documented limits need no task by construction.
- **Type consistency.** `DRAFT_RESTORED_NOTE` and `DRAFT_RESTORED_NOTE_MS` are defined once in Task 7 and referenced by name in Tasks 8 and 9. The note's testid string is identical in Tasks 7, 8, 9. `harnessMonitoringItems` is defined in Task 2 and used only there.
- **Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every code step carries the code.
- **RED validity.** Every task is `red-state=authored` with a `red-target` naming a production line whose absence or defect makes the new case fail. No task's red derives from a fixture the test itself writes: Task 1 reds on the shipped class strings, Tasks 3-6 on the classname and the entry's missing setter, Tasks 7-9 on the absent note, Task 10 on a registry row asserting a move that has not happened.
- **Anti-tautology.** Task 3's oracle is differential across the breakpoint plus a clipping check, never a pixel literal. Task 8 derives the expected shift from the measured note height plus the measured gap. Task 9's compound asserts the section's own `aria-expanded` changed before drawing any conclusion. Task 6 asserts each of the three segments separately, because one combined regex passes with a segment missing.
