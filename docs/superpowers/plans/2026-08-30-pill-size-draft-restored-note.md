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
| `tests/e2e/_publishedReviewModalHarness.tsx` | monitoring item builder; the three-segment and degraded pages | 1 |
| `tests/e2e/published-review-modal.layout.spec.ts` | fixture-integrity premise, AC-1 geometry, AC-4 equation, AC-3 clip oracle | 1 |
| tests/styles/pillTypeClassBoundary.test.ts | AC-6: exactly the four in-class sites carry the pair, both directions | 1 |
| `components/admin/showpage/PublishedReviewModal.tsx` | P1/P2/P3 type classes; the tap-band comment's arithmetic | 1 |
| `components/admin/wizard/Step3ReviewModal.tsx` | W2's type class; mounting the note in the content-pane top slot | 1, 3 |
| `tests/e2e/_pillFocusLiveEntry.tsx` | opt-in crew-warnings setter; the stale consumer comment | 2 |
| `tests/e2e/attention-autoopen-suppress.spec.ts` | AC-2 three-segment occlusion, premise first | 2 |
| components/admin/wizard/DraftRestoredNote.tsx | the note: mount-time predicate, announcement, self-dismissal, copy | 3 |
| tests/components/admin/wizard/draftRestoredNote.test.tsx | AC-8, AC-9, AC-10, AC-13, AC-15 timing, AC-18 | 3 |
| `tests/e2e/step3-review-modal.interactions.spec.ts` | AC-8 geometry, AC-11 shift, AC-16 scrolled, AC-17 four-cell matrix | 4 |
| tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts | AC-15 structural audit, AC-12 live-region contract | 5 |
| `DEFERRED.md`, `DEFERRED-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` | graduate both rows, markers off | 5 |

---

<!-- tasks: depth=3 red-contract -->

> **Ordering rule this plan is built on.** Within a task the tests come first and the production change comes last, so the `red=` command is observed failing against the *shipped* tree and the same command passes after the edit. An earlier draft put the class edit in task 1 and the browser assertions after it; every one of those assertions then passed the moment it was authored, which is a plan defect, not a test. Fixtures a task's own assertions need are built inside that task, before its red is claimed, so no task reds on its own missing scaffolding.

### Task 1: The pill's phone type size, tests first

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-PILL-SIZE|T-LAYOUT-TALL|T-STATIC-WRAP"` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1128` why=`the shipped pills are text-xs, so the resolved font-size at 375 is 12px and every one of the three cases fails its first assertion` ac=AC-1,AC-3,AC-4,AC-5,AC-6,AC-7 -->

**Files:**
- Modify: `tests/e2e/_publishedReviewModalHarness.tsx` (monitoring item builder, two pages)
- Modify: `tests/e2e/published-review-modal.layout.spec.ts` (three cases, two page writes)
- Create: tests/styles/pillTypeClassBoundary.test.ts
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (three class strings, one comment)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (one class string)

**Interfaces:**
- Consumes: `harnessAttentionItems(count)` (`tests/e2e/_publishedReviewModalHarness.tsx:58`); the `attentionItems?: AttentionItem[]` override (`tests/e2e/_publishedReviewModalHarness.tsx:254`); `withCrewWarnings?: boolean` (`tests/e2e/_publishedReviewModalHarness.tsx:259`); `alertsDegraded?: boolean` (`tests/e2e/_publishedReviewModalHarness.tsx:255`); `openHarness(page, viewport, htmlPath)` (`tests/e2e/published-review-modal.layout.spec.ts:247`).
- Produces: `harnessMonitoringItems(count)`, `pages.threeSegment`, `pages.degraded`. Nothing later depends on them.

- [ ] **Step 1: Add the monitoring item builder**

Every committed harness item is `actionable: true`, so no page has ever rendered a monitoring segment. The published pill partitions monitoring on `!actionable && clearingKind === "self_heal"`.

```ts
/** N self-healing items: the pill renders "N monitoring". Distinct from
 *  `harnessAttentionItems`, whose items are all actionable, which is why no
 *  committed page rendered a monitoring segment before this. */
export function harnessMonitoringItems(count: number): AttentionItem[] {
  const base = harnessAttentionItems(1)[0]!;
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `alert:harness-mon-${i}`,
    actionable: false,
    clearingKind: "self_heal" as const,
    menuTitle: `Harness monitoring item ${i + 1}`,
  }));
}
```

- [ ] **Step 2: Add both pages**

In the returned `pages` object, after `crewWarningsCapped`:

```ts
      // spec 2026-08-30 AC-1: the ONLY page with all three segments at once.
      threeSegment: renderModalHtml(HARNESS_ALERT_COUNT, {
        attentionItems: [...harnessAttentionItems(2), ...harnessMonitoringItems(2)],
        withCrewWarnings: true,
      }),
      // spec 2026-08-30 AC-3: the degraded branch. Per spec 2.8 it is reachable
      // only when every count is zero, because `interactive` is tested first.
      degraded: renderModalHtml(0, { attentionItems: [], alertsDegraded: true }),
```

In `tests/e2e/published-review-modal.layout.spec.ts`, add `threeSegment: string;` and `degraded: string;` to the `pages` type and write both files beside the existing `writeFileSync` calls:

```ts
  writeFileSync(join(workDir, "threeseg.html"), pageHtml("out.css", pages.threeSegment));
  writeFileSync(join(workDir, "degraded.html"), pageHtml("out.css", pages.degraded));
```

The static server resolves any file under `workDir` (`tests/e2e/published-review-modal.layout.spec.ts:228`), so no allow-list edit is needed. The nearby array at `tests/e2e/published-review-modal.layout.spec.ts:171` is Tailwind's `@source` list; add both new page names there only if a class first appears on these pages, which it does not.

- [ ] **Step 3: Prove the fixtures render what they claim, before relying on them**

```ts
test("T-FIXTURE-SEGMENTS @375: threeseg renders all three segments, degraded renders the degraded branch", async ({
  page,
}) => {
  await openHarness(page, { width: 375, height: 812 }, "threeseg.html");
  const three = ((await page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`).textContent()) ?? "")
    .replace(/\s+/g, " ");
  // Named separately: one combined regex passes with a segment missing.
  expect(three, "issues segment").toMatch(/\d+ issues?/);
  expect(three, "sheet-warnings segment").toMatch(/\d+ sheet warnings?/);
  expect(three, "monitoring segment").toMatch(/\d+ monitoring/);

  await openHarness(page, { width: 375, height: 812 }, "degraded.html");
  await expect(page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`)).toHaveText(
    /Alerts unavailable/,
  );
});
```

This case is fixture integrity, not the feature. It passes as soon as steps 1-2 land, which is correct: it is a premise for the three cases below, not one of them.

- [ ] **Step 4: Write the class-boundary guard**

The scanner must survive `${HEADER_ACTION_CAP}` inside a template literal, so it reads whole `className={...}` expressions by brace matching rather than a character class that stops at the first `}`.

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

/** Every `className={...}` expression, brace-matched so an interpolation like
 *  `${HEADER_ACTION_CAP}` does not terminate the scan early. Returns the raw
 *  expression text. */
function classNameExprs(src: string): string[] {
  const out: string[] = [];
  const needle = "className={";
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) {
    let depth = 0;
    for (let j = i + needle.length - 1; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) {
          out.push(src.slice(i + needle.length, j));
          break;
        }
      }
    }
  }
  return out;
}

/** In class = a pill that WRAPS inside a cap, the construction spec 2.3 rules
 *  on. Both markers required. */
const isWrappingPill = (expr: string) =>
  expr.includes("max-sm:flex-wrap") && expr.includes("rounded-pill");

/** The class string of the element whose rendered text is `label`: walk back to
 *  the opening `<` of that element's own tag, then forward to its `className`.
 *  Walking back to the nearest `className=` instead picks up a SIBLING's (the
 *  decorative dot's, or an unrelated button's) and silently audits the wrong
 *  element. */
function classOfElementRendering(src: string, label: string): string {
  const at = src.indexOf(`\n            ${label}`) !== -1
    ? src.indexOf(`\n            ${label}`)
    : src.indexOf(label);
  expect(at, `${label} still rendered`).toBeGreaterThan(-1);
  const openTag = src.lastIndexOf("<span", at);
  const close = src.indexOf(">", openTag);
  return src.slice(openTag, close);
}

describe("pill type-size class boundary (spec 2.3, 1.1 R8)", () => {
  const prm = read(PRM);
  const s3m = read(S3M);

  it("premise: the scanner finds the wrapping pills it is meant to rank", () => {
    // A brace-matcher that silently matched nothing would pass every assertion
    // below by vacuity, which is the shape this repo's premise rule exists for.
    premise("wrapping pills in PublishedReviewModal", classNameExprs(prm).filter(isWrappingPill).length, 0);
    premise("wrapping pills in Step3ReviewModal", classNameExprs(s3m).filter(isWrappingPill).length, 0);
  });

  it("every wrapping capped pill carries the responsive pair", () => {
    const offenders = [...classNameExprs(prm), ...classNameExprs(s3m)]
      .filter(isWrappingPill)
      .filter((e) => !e.includes("text-sm sm:text-xs"));
    expect(offenders, "a capped, wrapping pill left at bare text-xs").toEqual([]);
  });

  it("the two static published pills carry the pair too", () => {
    for (const label of ["Alerts unavailable", "In sync"]) {
      expect(
        classOfElementRendering(prm, label),
        `${label} pill missing the responsive pair`,
      ).toContain("text-sm sm:text-xs");
    }
  });

  it("the two out-of-class wizard arms are NOT swept (1.1 R8)", () => {
    for (const label of ["Sheet changed", "All clean"]) {
      const cls = classOfElementRendering(s3m, label);
      expect(cls, `${label} is out of class and must stay at text-xs`).toContain("text-xs");
      expect(cls, `${label} must not gain the responsive pair`).not.toContain("sm:text-xs");
    }
  });
});
```

- [ ] **Step 5: Write the three browser cases**

```ts
test("T-PILL-SIZE @375x812: the three-segment pill is 14px, at the cap, unclipped, multi-line", async ({
  page,
}) => {
  const measure = () =>
    page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`).evaluate((el) => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const bord = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      // The capped cluster is the pill's grandparent on the interactive branch
      // (wrapper `min-w-0` at :1112, cluster at :1096). Assert that rather than
      // trusting it: the cluster is the element carrying the cap class.
      const cluster = el.parentElement!.parentElement!;
      return {
        fontSize: cs.fontSize,
        h: box.height,
        w: box.width,
        contentH: box.height - pad - bord,
        clusterW: cluster.getBoundingClientRect().width,
        clusterHasCap: cluster.className.includes("max-w-40"),
        clipped: el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5,
      };
    });

  await openHarness(page, { width: 375, height: 812 }, "threeseg.html");
  const phone = await measure();
  await openHarness(page, { width: 900, height: 812 }, "threeseg.html");
  const desktop = await measure();
  // Single-line reference for clause (e), same component, same run.
  await openHarness(page, { width: 375, height: 812 }, "harness.html");
  const single = await measure();

  // (a) the pair applied, on both sides of the breakpoint
  expect(phone.fontSize, "phone pill is one size up").toBe("14px");
  expect(desktop.fontSize, "desktop pill is unchanged").toBe("12px");
  // (b) differential, not a literal
  expect(phone.h, "the larger type buys height").toBeGreaterThan(desktop.h);
  // (c) the wrap is cap-driven. The cap element is identified, then equality
  //     against the phone cluster's own width, so an 80px pill cannot pass.
  expect(phone.clusterHasCap, "premise: the grandparent is the capped cluster").toBe(true);
  expect(phone.w, "pill fills the capped budget").toBeGreaterThan(phone.clusterW - 60);
  expect(phone.w, "pill does not exceed the capped budget").toBeLessThanOrEqual(phone.clusterW + 0.5);
  // (d) nothing clipped
  expect(phone.clipped, "content is clipped").toBe(false);
  // (e) more than one flex line, measured against this run's single-line render
  expect(
    phone.contentH,
    `three-segment content box ${phone.contentH} should exceed one line ${single.contentH}`,
  ).toBeGreaterThan(single.contentH * 1.5);
});

test("T-LAYOUT-TALL @375x812: the panel equation closes with a wrapped pill", async ({ page }) => {
  await openHarness(page, { width: 375, height: 812 }, "threeseg.html");
  const geom = await page.evaluate((modalSel) => {
    const root = document.querySelector(modalSel)!;
    const h = (sel: string) => {
      const el = root.querySelector(sel);
      return el ? el.getBoundingClientRect().height : 0;
    };
    const panel = root.querySelector<HTMLElement>("[data-review-modal-panel]")!;
    return { header: h("header"), main: h("main"), footer: h("footer"),
             grab: h("[data-testid$='-grab']"), panel: panel.clientHeight };
  }, MODAL);

  // Non-vacuity: this case exists for a TALL header. Threshold read from the
  // single-segment baseline rather than invented: spec 2.2 measures the
  // one-segment pill at 30.30px, so a header under 60px did not wrap.
  expect(geom.header, "header is genuinely tall (the pill wrapped)").toBeGreaterThan(60);
  // Sheet mode at 375, so the grab strip is a term of the equation
  // (tests/e2e/published-review-modal.layout.spec.ts:346). Dropping it
  // false-reds a correct layout by the grab height.
  const sum = geom.header + geom.main + geom.footer + geom.grab;
  expect(
    Math.abs(sum - geom.panel),
    `grab ${geom.grab} + header ${geom.header} + main ${geom.main} + footer ${geom.footer} vs panel ${geom.panel}`,
  ).toBeLessThanOrEqual(0.5);
});

test("T-STATIC-WRAP @375x812: the degraded pill wraps and paints inside its padding box", async ({
  page,
}) => {
  await openHarness(page, { width: 375, height: 812 }, "degraded.html");
  const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
  await expect(pill).toHaveText(/Alerts unavailable/);

  const probe = await pill.evaluate((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    // PADDING box, not the border box getBoundingClientRect returns. AC-3 asks
    // whether glyphs painted inside the content area, and a border-box test
    // passes on text painted over the padding or the border itself.
    const pad = {
      left: box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
      right: box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight),
      top: box.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop),
      bottom: box.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom),
    };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let rect: DOMRect | null = null;
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      if (!n.textContent?.includes("Alerts unavailable")) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      rect = r.getBoundingClientRect();
    }
    return {
      found: rect !== null,
      fontSize: cs.fontSize,
      clipped: el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5,
      inside:
        rect !== null && rect.left >= pad.left - 0.5 && rect.right <= pad.right + 0.5 &&
        rect.top >= pad.top - 0.5 && rect.bottom <= pad.bottom + 0.5,
    };
  });

  expect(probe.found, "premise: the label's own text node was located").toBe(true);
  expect(probe.fontSize, "the static pill moved with its siblings").toBe("14px");
  expect(probe.clipped, "copy is clipped").toBe(false);
  expect(probe.inside, "the label painted outside the pill's padding box").toBe(true);
});
```

- [ ] **Step 6: Run everything and watch it fail**

```
pnpm vitest run tests/styles/pillTypeClassBoundary.test.ts
pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium -g "T-PILL-SIZE|T-LAYOUT-TALL|T-STATIC-WRAP"
```

Expected: the guard fails on "a capped, wrapping pill left at bare text-xs" and on both static labels; the three browser cases fail their `toBe("14px")` assertions. `T-FIXTURE-SEGMENTS` passes, because it is a premise.

- [ ] **Step 7: Make the four class edits**

Replace `text-xs` with `text-sm sm:text-xs` in exactly four class strings: `components/admin/showpage/PublishedReviewModal.tsx:1128`, `components/admin/showpage/PublishedReviewModal.tsx:1301`, `components/admin/showpage/PublishedReviewModal.tsx:1334`, and `components/admin/wizard/Step3ReviewModal.tsx:599`. **Do not touch `components/admin/wizard/Step3ReviewModal.tsx:574` or `components/admin/wizard/Step3ReviewModal.tsx:676`** (spec 1.1 R8).

- [ ] **Step 8: Update the tap-band arithmetic comment (AC-7)**

At `components/admin/showpage/PublishedReviewModal.tsx:1099-1101`, keeping the approximations as approximations:

```
   text-sm below sm (~20px line box) + py-1 (8px) ≈ a 28px visible pill;
   -inset-y-3 (12px per side) ≈ 52px ≥ the 44px tap floor. At sm and up the
   pill returns to text-xs (~16px line box) ≈ a 24px pill and a 48px band.
   T-TAP probes the resolved band (§10) at both.
```

- [ ] **Step 9: Run the same commands and watch them pass**

Both commands from step 6. Expected: PASS.

- [ ] **Step 10: Run the whole layout spec and the pill's neighbours**

```
pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts --project=desktop-chromium
pnpm vitest run tests/styles/alertPillLadder.test.ts tests/components/admin/showpage/publishedPill.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx
```

Expected: PASS, including `T-LAYOUT` and `T-TAP` at both viewports (AC-4, AC-5). The ladder ranks affordances, not type size, so if it moves the edit touched more than four class strings.

- [ ] **Step 11: Commit**

```bash
git add tests/e2e/_publishedReviewModalHarness.tsx tests/e2e/published-review-modal.layout.spec.ts tests/styles/pillTypeClassBoundary.test.ts components/admin/showpage/PublishedReviewModal.tsx components/admin/wizard/Step3ReviewModal.tsx
git commit -m "fix(admin): raise the attention pill one type size at phone widths"
```

### Task 2: Reach a three-segment load in the occlusion spec

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts --project=desktop-chromium` red-state=authored red-target=`tests/e2e/_pillFocusLiveEntry.tsx:118` why=`the entry's overrides object never sets crew warnings, so k is structurally 0, the sheet-warnings segment cannot render, and the new premise assertion fails before the occlusion check runs` ac=AC-2,AC-2b -->

**Files:**
- Modify: `tests/e2e/attention-autoopen-suppress.spec.ts` (premise first, then the boot call)
- Modify: `tests/e2e/_pillFocusLiveEntry.tsx` (opt-in setter; stale fence comment)

**Interfaces:**
- Consumes: `window.__setItems(a, n, s, degraded, longTitles?)` (`tests/e2e/_pillFocusLiveEntry.tsx:92`); the `__setRefusal` opt-in pattern (`tests/e2e/_pillFocusLiveEntry.tsx:95`, `tests/e2e/_pillFocusLiveEntry.tsx:115`, `tests/e2e/_pillFocusLiveEntry.tsx:121-127`).
- Produces: `window.__setCrewWarnings(n)`. No other suite calls it.

`buildItems` emits only attention items (`tests/e2e/_pillFocusLiveEntry.tsx:68-88`), so `k` is always 0 in this entry and the sheet-warnings segment can never render there. The premise assertion is authored **before** the setter so its red is the missing production capability, not a missing test.

- [ ] **Step 1: Write the premise assertion into the existing case**

In `tests/e2e/attention-autoopen-suppress.spec.ts`, immediately before the occlusion assertion in the menu-suppressed case:

```ts
  // Premise on this case's OWN inputs (not on some other case's). Without it a
  // dropped or unreachable segment shrinks the pill to one line and the
  // occlusion check passes on a load that never exercised the risk.
  const pillText = ((await page.locator(PILL).textContent()) ?? "").replace(/\s+/g, " ");
  expect(pillText, "issues segment present").toMatch(/\d+ issues?/);
  expect(pillText, "sheet-warnings segment present").toMatch(/\d+ sheet warnings?/);
  expect(pillText, "monitoring segment present").toMatch(/\d+ monitoring/);
```

`PILL` is the module constant already defined in that spec.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts --project=desktop-chromium`
Expected: FAIL on "sheet-warnings segment present". The other two match, which is the point: the failure names the one segment this entry cannot produce.

- [ ] **Step 3: Add the opt-in setter**

In `tests/e2e/_pillFocusLiveEntry.tsx`, beside the existing state and setters:

```ts
  // spec 2026-08-30 AC-2. Opt-in, exactly like __setRefusal below: a consumer
  // that never calls it sees a byte-identical tree.
  const [crewWarningCount, setCrewWarningCount] = useState(0);
```

in the `declare global` Window block beside `__setRefusal`:

```ts
    __setCrewWarnings?: (n: number) => void;
```

beside the other setter assignments:

```ts
    window.__setCrewWarnings = (n) => setCrewWarningCount(n);
```

and in the overrides object, in the same conditional-spread shape as `setPublished`:

```ts
    ...(crewWarningCount > 0 ? { withCrewWarnings: true } : {}),
```

- [ ] **Step 4: Fix the stale fence comment while you are in the file**

The comment at `tests/e2e/_pillFocusLiveEntry.tsx:121-127` names two consumers. There are three, and one of them is not what the comment implies: `tests/e2e/popover-clip-fit.spec.ts:49` and `tests/e2e/attention-pill-focus.spec.ts:58` **bundle and drive** this entry, while `tests/components/admin/sheetIconLinkContainment.test.ts:1005` **scans this file's source** and pins the count of a Google Sheets URL literal, so it is sensitive to that literal rather than to the rendered tree. Rewrite the comment to say exactly that. A comment naming two consumers when three exist is the next census error already written down.

- [ ] **Step 5: Drive the three-segment load**

In the boot helper, beside the existing `__setItems` call:

```ts
        (window as unknown as { __setCrewWarnings: (n: number) => void }).__setCrewWarnings(2),
```

- [ ] **Step 6: Run it and watch it pass**

Run: `pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts --project=desktop-chromium`
Expected: PASS, with the suppressed-menu case now asserting that nothing intercepts the published toggle at a three-segment, `text-sm`, wrapped pill, and its open-menu positive control still observing an interceptor.

- [ ] **Step 7: Prove the default tree did not move for the other three consumers**

```
pnpm heavy npx playwright test tests/e2e/attention-pill-focus.spec.ts tests/e2e/popover-clip-fit.spec.ts --project=desktop-chromium
pnpm vitest run tests/components/admin/sheetIconLinkContainment.test.ts
```

Expected: PASS. The two e2e suites drive this entry and never call the new setter, so they must be unaffected; the third pins a source-literal count, so it catches an accidental edit to the sheet URL rather than a tree change. **If either e2e suite moves, take AC-2b:** revert steps 3 and 5, run the occlusion case at `__setItems(a, 3, 3, false)` (two segments, `6 issues * 3 monitoring`, `tests/e2e/attention-autoopen-suppress.spec.ts:121`), relax the premise to the two segments that load produces, and record the untested three-segment interceptor height as a documented limit in the spec with a re-file trigger of "the next arc touching the attention pill's hit band."

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/_pillFocusLiveEntry.tsx tests/e2e/attention-autoopen-suppress.spec.ts
git commit -m "test(admin): exercise toggle occlusion at a three-segment pill"
```

### Task 3: The "Draft restored" note

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:954` why=`components/admin/wizard/DraftRestoredNote.tsx does not exist, so the suite fails to resolve its import before any case runs` ac=AC-8,AC-9,AC-10,AC-13,AC-15,AC-18 -->

**Files:**
- Create: components/admin/wizard/DraftRestoredNote.tsx
- Create: tests/components/admin/wizard/draftRestoredNote.test.tsx
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (render it in the content-pane top slot)

**Interfaces:**
- Consumes: `reportDraftStorageKey(wizardSessionId, driveFileId)` and `readStoredDraft(storageKey)` (`lib/admin/reportDraftStore.ts:38`, `lib/admin/reportDraftStore.ts:61`); `UndoAnnounceContext` from `@/components/admin/undoAnnounceContext`; `STEP3_FIXTURE_DFID` and `STEP3_FIXTURE_WSID` (`tests/components/admin/wizard/_step3ReviewFixture.ts:158-159`).
- Produces: `DraftRestoredNote({ dfid, wizardSessionId }: { dfid: string; wizardSessionId: string })`, default export absent, named export used. Rendered by `components/admin/wizard/Step3ReviewModal.tsx`; queried by Task 4.

**Why this is a component and not inline state.** `components/admin/wizard/Step3ReviewModal.tsx` **renders** `ReviewModalShell` (`components/admin/wizard/Step3ReviewModal.tsx:47`), and `AdminAnnounceProvider` lives **inside** that shell (`components/admin/review/ReviewModalShell.tsx:647-655`). React context does not flow from a child provider up to its parent, so a `useContext(UndoAnnounceContext)` call in the modal's own body would read the admin-layout channel outside the dialog, not the dialog-local one spec 3.3 requires. The consumer therefore has to be a component rendered **inside** the shell's children slot. That also makes the note unit-testable on its own, with no modal fixture.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/wizard/draftRestoredNote.test.tsx
/** @vitest-environment jsdom */
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { DraftRestoredNote } from "@/components/admin/wizard/DraftRestoredNote";
import { reportDraftStorageKey, REPORT_MESSAGE_MAX_CHARS } from "@/lib/admin/reportDraftStore";

import { STEP3_FIXTURE_DFID as DFID, STEP3_FIXTURE_WSID as WSID } from "./_step3ReviewFixture";

const KEY = reportDraftStorageKey(WSID, DFID);
const NOTE = `wizard-step3-card-${DFID}-draft-restored-note`;

function mount(announce = vi.fn()) {
  const r = render(
    <UndoAnnounceContext.Provider value={{ announce }}>
      <DraftRestoredNote dfid={DFID} wizardSessionId={WSID} />
    </UndoAnnounceContext.Provider>,
  );
  return { announce, ...r };
}

describe("DraftRestoredNote (spec 3.2-3.6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it("premise: the key under test is the one the component computes", () => {
    expect(KEY).toBe(`fxav-report-draft-wizard-${WSID}-${DFID}`);
  });

  it("renders when a non-empty draft was restored (AC-8)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    expect(screen.getByTestId(NOTE)).toBeTruthy();
  });

  it.each([
    ["absent key", null],
    ["empty string", ""],
    ["whitespace only", "   \n\t "],
  ])("does not render for %s (AC-9)", (_l, v) => {
    if (v !== null) window.sessionStorage.setItem(KEY, v);
    mount();
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it.each([
    ["one character", "x"],
    ["at the cap", "x".repeat(REPORT_MESSAGE_MAX_CHARS)],
  ])("renders for %s (AC-9)", (_l, v) => {
    window.sessionStorage.setItem(KEY, v);
    mount();
    expect(screen.getByTestId(NOTE)).toBeTruthy();
  });

  it("never appears after mount, however the store changes (AC-10)", () => {
    const { rerender } = mount();
    expect(screen.queryByTestId(NOTE)).toBeNull();
    act(() => {
      window.sessionStorage.setItem(KEY, "typed after opening");
      vi.advanceTimersByTime(1000);
    });
    // A rerender is the strongest form: an implementation that re-reads the
    // store on render, or is driven by the textarea's onChange, shows the note
    // here. One that reads only in its mount initializer cannot.
    rerender(
      <UndoAnnounceContext.Provider value={{ announce: vi.fn() }}>
        <DraftRestoredNote dfid={DFID} wizardSessionId={WSID} />
      </UndoAnnounceContext.Provider>,
    );
    expect(screen.queryByTestId(NOTE), "the note is a restore signal, not a draft signal").toBeNull();
  });

  it("dismisses at 5000ms and not before (AC-15)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    act(() => void vi.advanceTimersByTime(4999));
    expect(screen.queryByTestId(NOTE), "still up at 4999ms").toBeTruthy();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.queryByTestId(NOTE), "gone at 5001ms").toBeNull();
  });

  it.each([
    ["the draft is cleared", () => window.sessionStorage.removeItem(KEY)],
    ["the draft is submitted and the key removed", () => window.sessionStorage.removeItem(KEY)],
    ["the draft is edited to something else", () => window.sessionStorage.setItem(KEY, "different")],
  ])("stays accurate and still dismisses on its timer when %s (AC-18)", (_l, mutate) => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const before = screen.getByTestId(NOTE).textContent;
    act(() => {
      mutate();
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId(NOTE).textContent, "copy describes the restore, not the draft now").toBe(before);
    // And it still goes on its OWN timer rather than on the mutation.
    act(() => void vi.advanceTimersByTime(4001));
    expect(screen.queryByTestId(NOTE), "timer still owns the dismissal").toBeNull();
  });

  it("copy is past tense, so nothing the operator does can falsify it (AC-18)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const text = screen.getByTestId(NOTE).textContent ?? "";
    expect(text).toMatch(/restored/i);
    expect(text, "no present-tense claim about the draft").not.toMatch(/is waiting|awaits|is still/i);
  });

  it("announces once per mount, only with a draft, matching the visible copy (AC-13)", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    const { announce } = mount();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]![0]).toBe(screen.getByTestId(NOTE).textContent);
    cleanup();

    window.sessionStorage.clear();
    const second = mount();
    expect(second.announce, "no draft, no announcement").not.toHaveBeenCalled();
  });

  it("copy holds the mechanical rules", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const text = screen.getByTestId(NOTE).textContent ?? "";
    expect(text, "no em dash in user-visible copy").not.toContain("-");
    expect(text, "no apostrophe").not.toMatch(/['’]/);
    expect(text, "names the destination section").toContain("Report an issue");
  });

  it("the visible element is decorative; the announcement carries it", () => {
    window.sessionStorage.setItem(KEY, "half a sentence");
    mount();
    const el = screen.getByTestId(NOTE);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("role"), "no live region: it is conditionally mounted").toBeNull();
    expect(el.getAttribute("aria-live")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx`
Expected: FAIL at module load, "Cannot find module '@/components/admin/wizard/DraftRestoredNote'". That is the red: the production component does not exist.

- [ ] **Step 3: Write the component**

```tsx
// components/admin/wizard/DraftRestoredNote.tsx
"use client";

import { useContext, useEffect, useState } from "react";

import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";
import { readStoredDraft, reportDraftStorageKey } from "@/lib/admin/reportDraftStore";

/** 5s, matching the in-file transient precedent at
 *  components/admin/wizard/step3ReviewSections.tsx:1683-1687. Not a new number. */
export const DRAFT_RESTORED_NOTE_MS = 5_000;

/** Past tense deliberately (spec 3.4). The operator can reach the report
 *  section and clear or submit inside the window; a present-tense claim would
 *  then be false on screen with nothing to correct it. "Report an issue" is the
 *  section label verbatim (components/admin/wizard/step3ReviewSections.tsx:5154). */
export const DRAFT_RESTORED_NOTE = "Report draft restored, in Report an issue at the end of this list.";

/**
 * A component rather than state in Step3ReviewModal, and that is load-bearing:
 * the modal RENDERS ReviewModalShell, and AdminAnnounceProvider lives inside
 * that shell, so a useContext call in the modal's own body would read the
 * admin-layout channel rather than the dialog-local one. This mounts inside the
 * shell's children slot, where the provider is an ancestor.
 */
export function DraftRestoredNote({
  dfid,
  wizardSessionId,
}: {
  dfid: string;
  wizardSessionId: string;
}) {
  // Mirrors how the draft itself is restored: a lazy initializer that runs
  // once, because restoration happens on the first frame and leaves no event.
  // Read ONCE and never re-read, which is what makes AC-10 structural.
  const [restored, setRestored] = useState(
    () => readStoredDraft(reportDraftStorageKey(wizardSessionId, dfid)).trim() !== "",
  );
  const { announce } = useContext(UndoAnnounceContext);

  useEffect(() => {
    if (!restored) return;
    announce(DRAFT_RESTORED_NOTE);
    const t = setTimeout(() => setRestored(false), DRAFT_RESTORED_NOTE_MS);
    return () => clearTimeout(t);
    // Mount-scoped: `restored` only ever goes true -> false, so this cannot
    // re-announce, and the deps are deliberately empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!restored) return null;
  return (
    <p
      data-testid={`wizard-step3-card-${dfid}-draft-restored-note`}
      aria-hidden="true"
      className="w-full rounded-md bg-surface-sunken px-3 py-2 text-xs/relaxed text-text-subtle"
    >
      {DRAFT_RESTORED_NOTE}
    </p>
  );
}
```

`w-full` is explicit. The scroller is `flex ... flex-col` with no `items-*` override (`components/admin/review/ShowReviewSurface.tsx:1051-1055`), so a `flex-col` parent does stretch an auto-sized child by default; naming the class is this project's dimensional-invariant rule, because a later `items-start` on that parent would remove the default silently.

- [ ] **Step 4: Mount it in the content-pane top slot**

In `components/admin/wizard/Step3ReviewModal.tsx`, immediately before the resolution `<section>` at `components/admin/wizard/Step3ReviewModal.tsx:954`, inside the children passed to the shell:

```tsx
<DraftRestoredNote dfid={dfid} wizardSessionId={wizardSessionId} />
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx`
Expected: PASS, 15 cases (the `it.each` blocks expand to 3, 2 and 3).

- [ ] **Step 6: Run the four string-presence mutants, and record each result in the commit body**

1. `DRAFT_RESTORED_NOTE = ""`, the "names the destination section" case must fail.
2. Append `" It is waiting."`, the past-tense case must fail. If it does not, that assertion is too weak to keep.
3. Present but not live: move the constant behind `false &&` in the JSX, every render case must fail.
4. Vary the discriminating parameter: loosen the predicate to `!== ""`, the whitespace-only AC-9 row must fail.

- [ ] **Step 7: Commit**

```bash
git add components/admin/wizard/DraftRestoredNote.tsx components/admin/wizard/Step3ReviewModal.tsx tests/components/admin/wizard/draftRestoredNote.test.tsx
git commit -m "fix(admin): tell the operator the report draft came back"
```

### Task 4: The note in a real browser: geometry, shift, and every compound

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/step3-review-modal.interactions.spec.ts --project=desktop-chromium -g "T-NOTE"` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:954` why=`the live page seeds a draft key but nothing reads it in the browser build until Task 3's component is mounted, so the note locator resolves to zero nodes` ac=AC-8,AC-11,AC-16,AC-17 -->

**Files:**
- Modify: `tests/e2e/step3-review-modal.interactions.spec.ts`

**Interfaces:**
- Consumes: the note's testid (Task 3); the live page and esbuild bundle this spec already builds (`tests/e2e/step3-review-modal.interactions.spec.ts:134`); the scroller `[data-testid="wizard-step3-card-<dfid>-review-content"]` (`components/admin/review/ShowReviewSurface.tsx:1053`); the spec's own `HARNESS_DFID` and its wizard-session id constant.
- Produces: nothing.

**These cases live in the interactions spec, not the layout spec.** The layout spec emits only static `harness*.html` pages and has no live.html and no bundle; the live setup exists here (`tests/e2e/step3-review-modal.interactions.spec.ts:134`). Adding a second live pipeline to the layout spec to host these would duplicate the machinery for nothing. This spec is already in CI (`.github/workflows/step3-live-bundle.yml:88`) and in the `desktop-chromium` project.

**Dimensional invariants under test, verbatim from spec 3.7:** DI-8 scroller to note, full content width, guaranteed by explicit `w-full`. DI-9 the note is never a zero-height in-flow child: it renders with content and padding, or is absent. DI-10 removing it raises every following section by the note's height **plus the scroller's 24px `gap-6`**. DI-11 it mounts only when sessionStorage holds a non-empty draft for its exact key.

- [ ] **Step 1: Add a draft-seeding helper**

The component reads the store in a mount-time initializer, so the seed must land **before hydration**.

```ts
const NOTE = `[data-testid="wizard-step3-card-${HARNESS_DFID}-draft-restored-note"]`;
const PANE = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-content"]`;
const DRAFT_KEY = `fxav-report-draft-wizard-${HARNESS_WSID}-${HARNESS_DFID}`;

/** Seeds the report draft BEFORE the bundle hydrates; the note's state is
 *  decided in a mount initializer, so a seed after `goto` is a seed the
 *  component never sees. */
async function openLiveWithDraft(page: Page, draft: string | null) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(
    ([k, v]) => {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    },
    [DRAFT_KEY, draft] as const,
  );
  await page.goto(baseUrl + "live.html");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(PANE)).toBeVisible();
}

/** The pane's scrollTop plus a viewport-relative reference top, which is what
 *  the operator actually perceives. */
async function paneState(page: Page, refSel: string) {
  return page.evaluate(
    ([paneSel, ref]) => {
      const p = document.querySelector(paneSel) as HTMLElement;
      const r = document.querySelector(ref);
      return { scrollTop: p.scrollTop, refTop: r ? r.getBoundingClientRect().top : NaN };
    },
    [PANE, refSel] as const,
  );
}
```

If `HARNESS_WSID` is not already exported by the harness, export the wizard-session id the harness passes to `buildStagedSectionData` and import it here. Do not re-declare the literal: two copies of a session id is the census error this arc keeps finding.

- [ ] **Step 2: Write the geometry case (AC-8, DI-8, DI-9)**

```ts
test("T-NOTE-GEOM @375x812: the note spans the pane and sits above the fold", async ({ page }) => {
  await openLiveWithDraft(page, "half a sentence");
  await expect(page.locator(NOTE)).toHaveCount(1);

  const g = await page.evaluate(
    ([noteSel, paneSel]) => {
      const n = document.querySelector(noteSel)!.getBoundingClientRect();
      const p = document.querySelector(paneSel)!;
      const pr = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      return {
        nW: n.width, nH: n.height, nTop: n.top, nBottom: n.bottom,
        contentW: pr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        pTop: pr.top, pBottom: pr.bottom,
        gap: parseFloat(cs.rowGap || cs.gap),
      };
    },
    [NOTE, PANE] as const,
  );

  expect(Math.abs(g.nW - g.contentW), "DI-8: note does not span the pane's content width").toBeLessThanOrEqual(0.5);
  expect(g.nH, "DI-9: note has real height").toBeGreaterThan(0);
  expect(g.nTop, "AC-8: reachable without scrolling").toBeGreaterThanOrEqual(g.pTop - 0.5);
  expect(g.nBottom, "AC-8: fully inside the initial viewport").toBeLessThanOrEqual(g.pBottom + 0.5);
  expect(g.gap, "premise: the scroller's row gap is the DI-10 term").toBeGreaterThan(0);
});

test("T-NOTE-ABSENT @375x812: no draft, no note (DI-11)", async ({ page }) => {
  await openLiveWithDraft(page, null);
  await expect(page.locator(NOTE)).toHaveCount(0);
});
```

- [ ] **Step 3: Write the shift case (AC-11, DI-10)**

```ts
test("T-NOTE-SHIFT @375x812: dismissal raises content by the note plus the gap", async ({ page }) => {
  await openLiveWithDraft(page, "half a sentence");
  const before = await page.evaluate(
    ([noteSel, paneSel]) => {
      const note = document.querySelector(noteSel)!;
      const p = document.querySelector(paneSel) as HTMLElement;
      const next = note.nextElementSibling!;
      next.setAttribute("data-note-follower", "1");
      return {
        noteH: note.getBoundingClientRect().height,
        gap: parseFloat(getComputedStyle(p).rowGap || getComputedStyle(p).gap),
        followerTop: next.getBoundingClientRect().top,
        scrollTop: p.scrollTop,
      };
    },
    [NOTE, PANE] as const,
  );
  expect(before.scrollTop, "premise: this case is the scroll-top start").toBe(0);

  await expect(page.locator(NOTE)).toHaveCount(0, { timeout: 8_000 });

  const after = await paneState(page, "[data-note-follower]");
  // The real consequence, derived from measurement. "scrollTop unchanged"
  // alone proves nothing: an in-flow node vanishing above the fold leaves it
  // untouched WHILE everything below moves.
  expect(after.scrollTop, "pane stays at the top").toBe(before.scrollTop);
  expect(
    Math.abs((before.followerTop - after.refTop) - (before.noteH + before.gap)),
    `follower rose ${before.followerTop - after.refTop}, expected ${before.noteH + before.gap}`,
  ).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 4: Write the scrolled case (AC-16)**

```ts
test("T-NOTE-SCROLLED @375x812: dismissal while scrolled moves nothing visible", async ({ page }) => {
  await openLiveWithDraft(page, "half a sentence");
  await expect(page.locator(NOTE), "present BEFORE").toHaveCount(1);

  const ref = await page.evaluate((paneSel) => {
    const p = document.querySelector(paneSel) as HTMLElement;
    p.scrollTop = 400;
    const box = p.getBoundingClientRect();
    const el = document.elementFromPoint(box.left + 20, box.top + 200)!;
    el.setAttribute("data-note-ref", "1");
    return { scrollTop: p.scrollTop, top: el.getBoundingClientRect().top };
  }, PANE);
  expect(ref.scrollTop, "premise: the pane really scrolled past the note").toBeGreaterThan(0);

  await expect(page.locator(NOTE), "absent AFTER").toHaveCount(0, { timeout: 8_000 });

  const after = await paneState(page, "[data-note-ref]");
  expect(Math.abs(after.refTop - ref.top), "visible content moved under the operator").toBeLessThanOrEqual(1);
});
```

The present-before and absent-after brackets are what make this non-vacuous: without them an implementation whose timer is cancelled by scrolling passes trivially, because a note that never leaves cannot move anything.

- [ ] **Step 5: Write the AC-17 compound matrix, all four cells**

Two directions times two starting scroll states, each asserting the section's own state actually changed and then applying the oracle its start demands.

```ts
for (const dir of ["expand", "collapse"] as const) {
  for (const start of ["top", "scrolled"] as const) {
    test(`T-NOTE-COMPOUND ${dir} from ${start} @375x812: toggling while the note is live (AC-17)`, async ({
      page,
    }) => {
      await openLiveWithDraft(page, "half a sentence");
      await expect(page.locator(NOTE)).toHaveCount(1);

      const trigger = page.locator(`${PANE} [aria-expanded]`).first();
      const was = await trigger.getAttribute("aria-expanded");
      // Put the section into the state this direction can move OUT of.
      if ((dir === "collapse") !== (was === "true")) {
        await trigger.click();
      }
      const from = await trigger.getAttribute("aria-expanded");
      expect(from, `premise: section is set up to ${dir}`).toBe(dir === "collapse" ? "true" : "false");

      const before = await page.evaluate(
        ([noteSel, paneSel, scrolled]) => {
          const p = document.querySelector(paneSel) as HTMLElement;
          if (scrolled) p.scrollTop = 400;
          const note = document.querySelector(noteSel)!;
          const cs = getComputedStyle(p);
          let refTop = NaN;
          if (scrolled) {
            const box = p.getBoundingClientRect();
            const el = document.elementFromPoint(box.left + 20, box.top + 200)!;
            el.setAttribute("data-note-ref", "1");
            refTop = el.getBoundingClientRect().top;
          } else {
            const next = note.nextElementSibling!;
            next.setAttribute("data-note-follower", "1");
            refTop = next.getBoundingClientRect().top;
          }
          return {
            scrollTop: p.scrollTop,
            refTop,
            noteH: note.getBoundingClientRect().height,
            gap: parseFloat(cs.rowGap || cs.gap),
          };
        },
        [NOTE, PANE, start === "scrolled"] as const,
      );
      if (start === "scrolled") expect(before.scrollTop, "premise: really scrolled").toBeGreaterThan(0);
      else expect(before.scrollTop, "premise: really at the top").toBe(0);

      // Toggle, and prove on THIS case's own inputs that the section moved.
      await trigger.click();
      await expect(trigger, `section did not ${dir}`).toHaveAttribute(
        "aria-expanded",
        dir === "collapse" ? "false" : "true",
      );

      await expect(page.locator(NOTE)).toHaveCount(0, { timeout: 8_000 });

      const after = await paneState(
        page,
        start === "scrolled" ? "[data-note-ref]" : "[data-note-follower]",
      );
      if (start === "scrolled") {
        // AC-16's oracle: what the operator sees must not move.
        expect(Math.abs(after.refTop - before.refTop), "visible content moved").toBeLessThanOrEqual(1);
      } else {
        // AC-11's oracle: the measured shift equation, not "scrollTop unchanged".
        expect(after.scrollTop, "pane stays at the top").toBe(before.scrollTop);
        expect(
          Math.abs((before.refTop - after.refTop) - (before.noteH + before.gap)),
          `follower rose ${before.refTop - after.refTop}, expected ${before.noteH + before.gap}`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
}
```

- [ ] **Step 6: Run them and watch them fail, then pass**

Run: `pnpm heavy npx playwright test tests/e2e/step3-review-modal.interactions.spec.ts --project=desktop-chromium -g "T-NOTE"`
Before Task 3: FAIL, `toHaveCount(1)` receives 0. After Task 3: PASS, 8 cases.

- [ ] **Step 7: Run the whole interactions spec**

Run: `pnpm heavy npx playwright test tests/e2e/step3-review-modal.interactions.spec.ts --project=desktop-chromium`
Expected: PASS. The new `addInitScript` seeding runs per test, so no other case in this spec may start seeing a note; if one does, the helper is leaking across tests.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/step3-review-modal.interactions.spec.ts
git commit -m "test(admin): pin the note's geometry, dismissal shift and compounds"
```

### Task 5: Transition audit, live-region contract, and graduation

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the two ids are added to the GRADUATED registry while both entries are still in DEFERRED.md and absent from DEFERRED-archive.md, so the archive-only assertion fails on each` ac=AC-12,AC-14,AC-15,AC-17 -->

**Files:**
- Create: tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts
- Modify: `DEFERRED.md`, `DEFERRED-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`

**Interfaces:**
- Consumes: components/admin/wizard/DraftRestoredNote.tsx (Task 3) as source text; the `GRADUATED` array (`tests/docs/_metaDeferralLedgerGraduation.test.ts:72`), whose loop asserts each id is in `DEFERRED-archive.md` and absent from `DEFERRED.md` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:846-853`).
- Produces: nothing.

**Transition inventory, verbatim from spec 3.6.** Three states, A absent / V visible / G gone, so three pairs plus compounds. A to V is unreachable after mount, pinned by AC-10 in Task 3. V to G is an instant unmount at 5000ms, pinned below and timed in Task 3. A to G is the same DOM state, instant. Dismissal during the modal entrance cannot collide, because the entrance is CSS on the scrim and panel only and 5000ms is far past it. Dismissal while scrolled is AC-16, dismissal during expand or collapse is AC-17, both in Task 4. A draft cleared or submitted under the note is AC-18 in Task 3. The report section opened inside the window changes nothing, because the note is not coupled to section state, which the audit below asserts structurally.

- [ ] **Step 1: Write the audit**

It reads components/admin/wizard/DraftRestoredNote.tsx, a file whose whole content is the note, so there is no sibling element to slice into by accident. An earlier draft audited `Step3ReviewModal.tsx` by walking back to the nearest `className=`, which landed on the publish button's `transition-colors duration-fast` and would have failed a correct note.

```ts
// tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "..", "..", "..", "..", "components", "admin", "wizard", "DraftRestoredNote.tsx"),
  "utf8",
);

describe("draft-restored note: transition audit (spec 3.6)", () => {
  it("premise: the file under audit is the note and nothing else", () => {
    expect(SRC).toContain("draft-restored-note");
    expect(SRC.length, "a plausible single-component file").toBeLessThan(4000);
  });

  it("declares no transition, animation, or exit (AC-15)", () => {
    for (const banned of ["transition", "animate-", "duration-", "AnimatePresence", "framer-motion", "exit="]) {
      expect(SRC, `the note must be instant; found ${banned}`).not.toContain(banned);
    }
  });

  it("is conditionally mounted and therefore must NOT be a live region (AC-12)", () => {
    expect(SRC, "a gated live region is the shape the meta-test forbids").not.toMatch(
      /role=["']status["']|aria-live=/,
    );
    expect(SRC, "the visible note is decorative; the announcement carries it").toContain('aria-hidden="true"');
  });

  it("is not coupled to draft or section state after mount", () => {
    // The A-to-V-unreachable and report-section compounds are structural: the
    // component reads the store exactly once, in its mount initializer.
    expect((SRC.match(/readStoredDraft/g) ?? []).length, "reads the store exactly once").toBe(1);
    expect(SRC, "no effect re-reads the store").not.toMatch(/useEffect[\s\S]*readStoredDraft/);
  });
});
```

- [ ] **Step 2: Add both ids to `GRADUATED`, and watch the ledger guard fail**

```ts
  // fix/pill-size-draft-restored-note (2026-08-30). Eric ruled both on the
  // 2026-08-29 decision board: the pill's type moves one size up at phone
  // widths (decision 5B), and a transient note ships instead of a rail count
  // (decision 6B), leaving the spec D2 no-status-dot contract intact.
  "ATTENTION-PILL-PHONE-LEGIBILITY-1",
  "WIZARD-REPORT-DRAFT-RESTORE-UNDISCOVERABLE-1",
```

- [ ] **Step 3: Run both and watch them fail**

Run: `pnpm vitest run tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: the ledger guard fails with both ids `missing from DEFERRED-archive.md` and `still in DEFERRED.md`. The audit passes if Task 3 shipped the component as written; if it fails, the note grew a transition or a live region and Task 3 is wrong, not this task.

- [ ] **Step 4: Move both entries**

Cut each entry whole from `DEFERRED.md` and append it to `DEFERRED-archive.md`, **deleting the `· **Status:** IN PROGRESS · **Branch:** fix/pill-size-draft-restored-note` run from each meta line as you go.** The marker comes off here, in the PR's last commit, because a marker that merges into main names a branch the merge just deleted and `tests/docs/_metaLedgerInProgress.test.ts` then reds main. Add a provenance line per entry: the four in-class sites and the out-of-class fence for the first, the note's placement and past-tense copy for the second, both citing this plan and the spec.

- [ ] **Step 5: Run the ledger guards and watch them pass**

Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`
Expected: PASS. `_metaLedgerInProgress` green confirms no marker survived into either file.

- [ ] **Step 6: Assert the live-region registry did not move (AC-12)**

Run: `pnpm vitest run tests/components/_metaLiveRegionMounting.test.ts`
Expected: PASS **with the declared count for `components/admin/wizard/Step3ReviewModal.tsx` still `1`, and no row added for the new file.** Do not edit that registry. If it demands a change, the note grew a live region and spec 3.3 was not followed.

- [ ] **Step 7: Assert the draft key is seeded in exactly one e2e spec (AC-12, DI-11)**

The note's isolation from every other geometry spec is its whole protection, and Task 4 deliberately seeds the key in one file. So the check is an equality against the expected set, not a search that filters out its own counterexample:

```
rg -l "fxav-report-draft" tests/e2e/
```

Expected: exactly one line, `tests/e2e/step3-review-modal.interactions.spec.ts`. Any other file means a spec whose geometry nobody re-baselined has started mounting the note.

- [ ] **Step 8: Verify the CI wiring reaches a real run (AC-14)**

```
rg -n "step3-review-modal\.(layout|interactions)" playwright.config.ts .github/workflows/step3-live-bundle.yml
```

Expected: both specs present in the `desktop-chromium` `testMatch`, and both in the workflow's `paths` watch and its `playwright test` invocation. **If real CI reds or flakes on the layout spec, take the pre-made fallback in spec section 5:** revert only its workflow entry, keep its `playwright.config.ts` project wire, and record the CI gap as a documented limit with a re-file trigger of "the next arc touching Step3ReviewModal layout."

- [ ] **Step 9: Full local verification**

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export HASH_FOR_LOG_PEPPER="$(grep -m1 '^HASH_FOR_LOG_PEPPER=' .env.local | cut -d= -f2- | tr -d '"')"
pnpm typecheck && pnpm exec eslint . && pnpm format:check
pnpm heavy pnpm test
pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/attention-autoopen-suppress.spec.ts tests/e2e/attention-pill-focus.spec.ts tests/e2e/popover-clip-fit.spec.ts --project=desktop-chromium
```

All must pass. The last three e2e specs are the shared-entry consumers from V4; they are here because Task 2 edits the entry they share.

- [ ] **Step 10: Commit**

```bash
git add tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts DEFERRED.md DEFERRED-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit -m "docs(plan): audit the note's transitions and graduate both P1 rows"
```

<!-- tasks: end -->


---

## 12. Closeout

impeccable-gate: `/impeccable critique` + `/impeccable audit` on the whole diff, before the whole-diff cross-model review and before this arc reports READY. Both halves run with the canonical v3 setup gates: context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read. Findings and dispositions land in this section; P0 and P1 are fixed or explicitly deferred with a `DEFERRED.md` entry.

**UI surfaces in this diff:** `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`. No `app/globals.css` `@theme` change, no `DESIGN.md` change, no new colour token, so no new contrast ratio needs pinning.

**Pre-code mechanical checklist** (run before the gate, which verifies rather than discovers): 44px tap targets including the pill's resolved hit band at the new size; no em dash and no apostrophe in the note's copy; canonical type and token classes only, no arbitrary values; `text-xs/relaxed` and `text-subtle` for secondary copy.

### Acceptance-criteria coverage map

Criteria are declared in the spec (section 5) and claimed here, per the coverage-map convention.

| AC | Task |
|---|---|
| AC-1, AC-3, AC-4, AC-5, AC-6, AC-7 | Task 1 |
| AC-2, AC-2b | Task 2 |
| AC-8 | Tasks 3, 4 |
| AC-9, AC-10, AC-13, AC-18 | Task 3 |
| AC-11, AC-16, AC-17 | Task 4 |
| AC-12, AC-14 | Task 5 |
| AC-15 | Tasks 3 (timing), 5 (structural audit) |

## Self-review record

- **Spec coverage.** Every section-5 criterion appears in the map above. Spec 2.3's four sites are Task 1; 2.5's exclusion is asserted in both directions by Task 1's fourth guard case; 3.2-3.6 are Tasks 3-5; section 4's documented limits need no task by construction.
- **Ordering.** Within every task the tests are authored and observed red before the production change, so each `red=` fails against the shipped tree and the same command passes after the edit. No task reds on scaffolding it creates itself: Task 1 builds its two fixtures in steps 1-2 and proves them with a separate premise case in step 3, then claims its red in step 6 against the production class.
- **Type consistency.** `DRAFT_RESTORED_NOTE` and `DRAFT_RESTORED_NOTE_MS` are exported once from components/admin/wizard/DraftRestoredNote.tsx in Task 3 and referenced by name afterwards. The note's testid string is identical in Tasks 3, 4 and 5. `harnessMonitoringItems` is defined and used only in Task 1. Fixture identifiers are the real exports, `STEP3_FIXTURE_DFID` and `STEP3_FIXTURE_WSID` (`tests/components/admin/wizard/_step3ReviewFixture.ts:158-159`), not invented short names.
- **Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every code step carries its code.
- **RED validity.** Task 1 reds on the shipped `text-xs`; Task 2 on the entry's missing crew-warnings capability; Task 3 on an absent module; Task 4 on an absent element in the live build; Task 5 on a registry row asserting a move that has not happened. None derives from a fixture the test itself writes.
- **Anti-tautology.** Task 1's oracle is differential across the breakpoint plus a clipping check plus a single-line reference measured in the same run, and its cap clause asserts the grandparent really carries the cap class before comparing widths. Task 2 names each of the three segments separately, because one combined regex passes with a segment missing. Task 3's AC-10 case rerenders after mutating the store, so an implementation driven by the textarea's `onChange` fails. Task 4's compounds assert the section's own `aria-expanded` changed before drawing any conclusion, and bracket the note present-before and absent-after so a cancelled timer cannot pass. Task 5's AC-12 search is an equality against the expected one-file set rather than a search that filters out its own counterexample.
