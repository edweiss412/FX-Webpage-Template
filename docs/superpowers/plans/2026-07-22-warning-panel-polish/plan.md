# Warning-Panel Polish Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven owner-ratified changes in `docs/superpowers/specs/2026-07-22-warning-panel-polish-design.md` (approved at adversarial-review R7, commit 6757a1622).

**Architecture:** Prop-driven, published-gate-only edits to the existing warning surface: a new `afterBodyText` slot through the popover chain (changes 1+3), a count-tuple live region mounted in `ShowReviewSurface` (change 2), a per-call `seamless` opt on the extras callback (change 4), an actionability-map callout gate (change 5), a chrome-threaded pointer sentence with scroll buttons (change 6), and one comment fix (change 7). Staged wizard DOM stays byte-identical throughout.

**Tech Stack:** Next.js 16 / React, Tailwind v4, Vitest + RTL (jsdom), Playwright e2e, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), TypeScript compiler API for the registry scanner.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-22-warning-panel-polish-design.md`. §1.1 lists resolved scope — do not relitigate.
- TDD per task: failing test → minimal implementation → passing test → commit (invariant 1).
- Staged (wizard) surface byte-identical — every behavioral change gates on `routedWarningsRenderElsewhere` or is prop-driven with no staged caller (spec §1.1 item 7).
- No em-dash in user-visible copy; apostrophes as `&rsquo;` in JSX where the file already does so; 44×44px tap floor via overlay (spec §3.5).
- `exactOptionalPropertyTypes`: optional context/prop fields inserted by SPREAD, never explicit `undefined` (pattern at `ShowReviewSurface.tsx:1006-1013`).
- New test files need no config wiring: `vitest.projects.ts:34` `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`; `tests/components/**` also matches `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:64-66`).
- Commits: `feat(admin):` / `test(admin):` / `fix(admin):` / `docs(handoff):` conventional style, one commit per task, `--no-verify` (worktree, gates run explicitly).
- Meta-test inventory (declared): this plan CREATES `tests/admin/_metaInfoCodeActionability.test.ts` (two-layer severity scanner, spec §3.4). No other structural registries change.
- Run per-task: `pnpm vitest run <files>`; before push: full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (memory: vitest strips types; scoped runs miss registry suites).

## File Structure

- Create: `lib/admin/infoCodeActionability.ts` — decision map + predicate (T1)
- Create: `tests/admin/_metaInfoCodeActionability.test.ts` — two-layer scanner (T1)
- Modify: `components/admin/HoverHelp.tsx` — `afterBodyText` prop + attribute triple (T2)
- Create: `tests/components/admin/hoverHelpAfterBody.test.tsx` (T2)
- Modify: `components/admin/compactAlertHelp.tsx`, `components/admin/PerShowActionableWarnings.tsx` (T3)
- Create: `tests/components/admin/perShowActionableFollowUp.test.tsx` (T3)
- Create: `lib/admin/warningsPanelStatus.ts` — sentence builder (T4)
- Create: `tests/helpers/publishedSurfaceProps.tsx` — SHARED surface-props builder for Tasks 4-7 (T4)
- Modify: `components/admin/review/ShowReviewSurface.tsx` — status span + pointer chrome + seamless call (T4, T5, T7)
- Create: `tests/admin/warningsPanelStatus.test.ts`, `tests/components/admin/review/warningsPanelStatusMount.test.tsx` (T4)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` — seamless container (T5)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` — callout gate (T6), pointer sentence + chrome type (T7), comment fix (T5)
- Create: `tests/components/admin/showpage/sectionWarningSeam.test.tsx` (T5), `tests/components/admin/calloutActionabilityGate.test.tsx` (T6), `tests/components/admin/wizard/pointerSentence.test.tsx` (T7)
- Create: `tests/e2e/warning-panel-polish.spec.ts` (T8)
- Modify: `DEFERRED.md`, create `docs/superpowers/plans/2026-07-22-warning-panel-polish/handoff.md` (T9)

---

### Task 1: Info-code actionability map + two-layer scanner meta-test

**Files:**
- Create: `lib/admin/infoCodeActionability.ts`
- Test: `tests/admin/_metaInfoCodeActionability.test.ts`

**Interfaces:**
- Produces: `INFO_CODE_ACTIONABILITY: Readonly<Record<string, "actionable" | "not-actionable">>`, `infoRowInvitesCorrection(w: Pick<ParseWarning, "code">): boolean` — consumed by Task 6.

- [ ] **Step 1: Write the failing scanner test**

```ts
// tests/admin/_metaInfoCodeActionability.test.ts
/**
 * Two-layer fail-closed scanner (spec 2026-07-22-warning-panel-polish §3.4).
 * Layer 1: every object literal in lib/parser/** and lib/sync/** carrying BOTH
 *   severity: "info" and a literal code must have a decision in
 *   INFO_CODE_ACTIONABILITY (discovered set == map key set).
 * Layer 2: every `severity` property key in those trees must have a literal
 *   "warn" | "info" value; anything else fails as unanalyzable. A literal
 *   "info" not attributable to a code-carrying literal also fails.
 * Residual boundary (spec §3.4): dynamically constructed property keys are out
 * of syntactic reach; the closed union at lib/parser/types.ts:49 covers them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { INFO_CODE_ACTIONABILITY } from "@/lib/admin/infoCodeActionability";

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

type Scan = { infoCodes: Set<string>; violations: string[] };

function scanFile(path: string, scan: Scan): void {
  scanSource(ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true), path, scan);
}

function scanSource(src: ts.SourceFile, path: string, scan: Scan): void {
  const visit = (node: ts.Node): void => {
    // "severity" as a property name in ANY syntactic form: identifier key,
    // string-literal key, computed key, shorthand, method/accessor. Shorthand,
    // computed, and method forms are unanalyzable BY CONSTRUCTION -> fail.
    const named = (name: ts.PropertyName, key: string): boolean =>
      (ts.isIdentifier(name) && name.text === key) ||
      (ts.isStringLiteral(name) && name.text === key) ||
      (ts.isComputedPropertyName(name) &&
        ts.isStringLiteral(name.expression) &&
        name.expression.text === key);
    const namedSeverity = (name: ts.PropertyName): boolean => named(name, "severity");
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === "severity") {
      scan.violations.push(`${path}: unanalyzable severity: extend the scanner or register the code`);
    }
    if (
      (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
      namedSeverity(node.name)
    ) {
      scan.violations.push(`${path}: unanalyzable severity: extend the scanner or register the code`);
    }
    if (ts.isPropertyAssignment(node) && namedSeverity(node.name)) {
      const v = node.initializer;
      const literal = ts.isStringLiteral(v) ? v.text : null;
      if (literal !== "warn" && literal !== "info") {
        scan.violations.push(
          `${path}: unanalyzable severity: extend the scanner or register the code`,
        );
      } else if (literal === "info") {
        const parent = node.parent;
        const codeProp = ts.isObjectLiteralExpression(parent)
          ? parent.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && named(p.name, "code"),
            )
          : undefined;
        const code =
          codeProp && ts.isStringLiteral(codeProp.initializer) ? codeProp.initializer.text : null;
        if (code === null) {
          scan.violations.push(`${path}: severity:"info" not attributable to a code-carrying literal`);
        } else {
          scan.infoCodes.add(code);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

describe("INFO_CODE_ACTIONABILITY registry (spec §3.4)", () => {
  const scan: Scan = { infoCodes: new Set(), violations: [] };
  for (const dir of ["lib/parser", "lib/sync"]) walkFiles(join(process.cwd(), dir)).forEach((f) => scanFile(f, scan));

  it("Layer 2: every severity property is a literal warn/info attributable to a code literal", () => {
    expect(scan.violations).toEqual([]);
  });

  it("Layer 1: discovered info-code set equals the decision map's key set", () => {
    expect([...scan.infoCodes].sort()).toEqual(Object.keys(INFO_CODE_ACTIONABILITY).sort());
  });

  it("scanner self-test: synthetic fixtures prove discovery and each fail-closed branch", () => {
    const probe = (code: string): Scan => {
      const sc: Scan = { infoCodes: new Set(), violations: [] };
      const path = "/synthetic/probe.ts";
      const src = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
      // reuse the same visitor via the scanSource seam
      scanSource(src, path, sc);
      return sc;
    };
    // info literal with code literal -> discovered, no violation
    let r = probe(`const w = { severity: "info", code: "X_CODE", message: "m" };`);
    expect([...r.infoCodes]).toEqual(["X_CODE"]);
    expect(r.violations).toEqual([]);
    // warn literal -> accepted silently
    r = probe(`const w = { severity: "warn", code: "Y", message: "m" };`);
    expect(r.infoCodes.size).toBe(0);
    expect(r.violations).toEqual([]);
    // variable severity -> unanalyzable
    r = probe(`const sev = "info"; const w = { severity: sev, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    // shorthand -> unanalyzable
    r = probe(`const severity = "info" as const; const w = { severity, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    // string-literal key -> analyzed like identifier key, no violation
    r = probe(`const w = { "severity": "info", code: "Q" };`);
    expect([...r.infoCodes]).toEqual(["Q"]);
    expect(r.violations).toEqual([]);
    // computed string key -> analyzed like identifier key, no violation
    r = probe(`const w = { ["severity"]: "info", ["code"]: "R" };`);
    expect([...r.infoCodes]).toEqual(["R"]);
    expect(r.violations).toEqual([]);
    // string-literal code key -> attributable, no violation
    r = probe(`const w = { severity: "info", "code": "S" };`);
    expect([...r.infoCodes]).toEqual(["S"]);
    expect(r.violations).toEqual([]);
    // method / getter / setter named severity -> unanalyzable
    r = probe(`const w = { severity() { return "info"; }, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    r = probe(`const w = { get severity() { return "info"; }, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    r = probe(`const w = { set severity(v: string) {}, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    // info without attributable code -> violation
    r = probe(`const w = { severity: "info", message: "m" };`);
    expect(r.violations).toHaveLength(1);
  });

  it("today's universe is exactly the two known codes with the ratified decisions", () => {
    expect(INFO_CODE_ACTIONABILITY).toEqual({
      DAY_RESTRICTION_DOUBLE_LOCATION: "actionable",
      TYPO_NORMALIZED: "not-actionable",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/admin/_metaInfoCodeActionability.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/infoCodeActionability`.

- [ ] **Step 3: Minimal implementation**

```ts
// lib/admin/infoCodeActionability.ts
//
// Actionability decisions for every info-severity ParseWarning code the
// published Parse-warnings panel can list. TOTAL by contract: a new info
// emitter without a row here fails tests/admin/_metaInfoCodeActionability.test.ts
// (two-layer scanner, spec 2026-07-22-warning-panel-polish §3.4).
import type { ParseWarning } from "@/lib/parser/types";

export const INFO_CODE_ACTIONABILITY: Readonly<Record<string, "actionable" | "not-actionable">> = {
  // Catalog copy directs a sheet edit ("Remove the duplicate", catalog.ts:1216).
  DAY_RESTRICTION_DOUBLE_LOCATION: "actionable",
  // The parser already fixed it; nothing for the operator to do.
  TYPO_NORMALIZED: "not-actionable",
};

export function infoRowInvitesCorrection(w: Pick<ParseWarning, "code">): boolean {
  return INFO_CODE_ACTIONABILITY[w.code] === "actionable";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/admin/_metaInfoCodeActionability.test.ts`
Expected: PASS (4 tests). If Layer 2 reports violations, those are REAL findings: inspect each reported site; a false positive means the scanner needs a narrower attribution rule, not a suppression.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/infoCodeActionability.ts tests/admin/_metaInfoCodeActionability.test.ts
git commit --no-verify -m "feat(admin): info-code actionability registry with two-layer fail-closed scanner"
```

---

### Task 2: `HoverHelp.afterBodyText` with the learnMore-parity attribute triple

**Files:**
- Modify: `components/admin/HoverHelp.tsx` (props ~`:60-104`, triple at `:181-182`, role at `:244`, body at `:254-274`)
- Test: `tests/components/admin/hoverHelpAfterBody.test.tsx`

**Interfaces:**
- Produces: `HoverHelp` prop `afterBodyText?: string` — non-empty ⇒ describedby=descId, aria-controls=bodyId, role dropped, `<p class="mt-2">` after descId div, before learnMore. Consumed by Task 3.

- [ ] **Step 1: Write the failing four-quadrant test**

```tsx
// tests/components/admin/hoverHelpAfterBody.test.tsx
// @vitest-environment jsdom
/** Spec §3.1/§8.2: the afterBodyText attribute triple mirrors learnMore.
 *  Catches: describedby narrowed but tooltip role kept or aria-controls
 *  omitted (each quadrant pins all three attributes + DOM order). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HoverHelp } from "@/components/admin/HoverHelp";

function attrs(testId: string) {
  const trigger = screen.getByTestId(`${testId}-trigger`);
  const body = screen.getByTestId(`${testId}-body`);
  return {
    trigger,
    body,
    describedbyEl: document.getElementById(trigger.getAttribute("aria-describedby") ?? ""),
    controls: trigger.getAttribute("aria-controls"),
    role: body.getAttribute("role"),
  };
}

describe("HoverHelp afterBodyText quadrants", () => {
  it("neither prop: describedby=whole body, tooltip role, no aria-controls", () => {
    render(<HoverHelp label="Help: q" testId="q0">ctx</HoverHelp>);
    const a = attrs("q0");
    expect(a.describedbyEl).toBe(a.body);
    expect(a.role).toBe("tooltip");
    expect(a.controls).toBeNull();
  });

  it("afterBodyText alone: describedby=descId only, aria-controls=body, role absent, p outside desc", () => {
    render(<HoverHelp label="Help: q" testId="q1" afterBodyText="Follow up.">ctx</HoverHelp>);
    const a = attrs("q1");
    expect(a.describedbyEl).not.toBeNull();
    expect(a.describedbyEl).not.toBe(a.body);
    expect(a.describedbyEl!.textContent).toBe("ctx");
    expect(a.describedbyEl!.textContent).not.toContain("Follow up.");
    expect(document.getElementById(a.controls ?? "")).toBe(a.body);
    expect(a.role).toBeNull();
    const p = a.body.querySelector("p.mt-2");
    expect(p?.textContent).toBe("Follow up.");
    expect(a.describedbyEl!.contains(p!)).toBe(false);
  });

  it("both: order is descId div, after-body p, learnMore link", () => {
    render(
      <HoverHelp label="Help: q" testId="q2" afterBodyText="Follow up." learnMore={{ href: "/help/x" }}>
        ctx
      </HoverHelp>,
    );
    const a = attrs("q2");
    expect(a.describedbyEl!.textContent).toBe("ctx");
    expect(a.role).toBeNull();
    expect(document.getElementById(a.controls ?? "")).toBe(a.body);
    const children = [...a.body.children];
    const descIdx = children.indexOf(a.describedbyEl as Element);
    const pIdx = children.findIndex((c) => c.matches("p.mt-2"));
    const linkIdx = children.findIndex((c) => c.matches("a"));
    expect(descIdx).toBeGreaterThanOrEqual(0);
    expect(pIdx).toBeGreaterThan(descIdx);
    expect(linkIdx).toBeGreaterThan(pIdx);
  });

  it("learnMore alone: shipped triple unchanged (pinned)", () => {
    render(<HoverHelp label="Help: q" testId="q4" learnMore={{ href: "/help/x" }}>ctx</HoverHelp>);
    const a = attrs("q4");
    expect(a.describedbyEl!.textContent).toBe("ctx");
    expect(a.describedbyEl).not.toBe(a.body);
    expect(document.getElementById(a.controls ?? "")).toBe(a.body);
    expect(a.role).toBeNull();
  });

  it.each(["", "   "])("empty/whitespace afterBodyText (%j) behaves as absent", (v) => {
    render(<HoverHelp label="Help: q" testId="q3" afterBodyText={v}>ctx</HoverHelp>);
    const a = attrs("q3");
    expect(a.describedbyEl).toBe(a.body);
    expect(a.role).toBe("tooltip");
    expect(a.controls).toBeNull();
    expect(a.body.querySelector("p.mt-2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/hoverHelpAfterBody.test.tsx`
Expected: FAIL — `afterBodyText` unknown prop / quadrant assertions fail.

- [ ] **Step 3: Implement**

In `components/admin/HoverHelp.tsx`:

(a) Destructure + prop type (after `learnMore` at `:66/:103`):

```ts
  afterBodyText,
```
```ts
  /**
   * Optional second paragraph rendered AFTER the described children and before
   * the learnMore link (spec 2026-07-22-warning-panel-polish §3.1). A string,
   * not ReactNode, so interactive content cannot enter a popover that may
   * carry role="tooltip". Non-empty ⇒ the same attribute shift learnMore
   * causes: describedby narrows to the children wrapper, the trigger gains
   * aria-controls, and the tooltip role drops (content outside the
   * description makes this a disclosure).
   */
  afterBodyText?: string;
```

(b) Normalize once, above `triggerProps` (~`:173`):

```ts
  const afterBody = typeof afterBodyText === "string" && afterBodyText.trim().length > 0
    ? afterBodyText.trim()
    : null;
  const narrowed = learnMore !== undefined || afterBody !== null;
```

(c) Attribute triple — replace at `:181-182`:

```ts
    "aria-describedby": narrowed ? descId : bodyId,
    "aria-controls": narrowed ? bodyId : undefined,
```

(d) Role — replace at `:244`:

```ts
        role={narrowed ? undefined : "tooltip"}
```

(e) Body — after `<div id={descId}>{children}</div>` (`:254`), before the learnMore block:

```tsx
        {afterBody !== null ? <p className="mt-2">{afterBody}</p> : null}
```

- [ ] **Step 4: Run new test + existing HoverHelp suites**

Run: `pnpm vitest run tests/components/admin/hoverHelpAfterBody.test.tsx tests/components/admin`
Expected: exit 0, new suite PASS, no existing suite regressions (neither-prop path byte-identical). Check the exit CODE, not the tail of output (vitest can exit 1 on uncaught errors while every test line reads pass).

- [ ] **Step 5: Commit**

```bash
git add components/admin/HoverHelp.tsx tests/components/admin/hoverHelpAfterBody.test.tsx
git commit --no-verify -m "feat(admin): HoverHelp afterBodyText slot with learnMore-parity attribute triple"
```

---

### Task 3: Thread `afterBodyText` through `CompactAlertHelp` + un-join in `PerShowActionableWarnings`

**Files:**
- Modify: `components/admin/compactAlertHelp.tsx` (`CompactAlertHelpProps` `:84-105`, component `:107-146`)
- Modify: `components/admin/PerShowActionableWarnings.tsx` (`:136-148` join, `:240-252` help usage)
- Test: `tests/components/admin/perShowActionableFollowUp.test.tsx`

**Interfaces:**
- Consumes: Task 2's `afterBodyText` on `HoverHelp`.
- Produces: `CompactAlertHelp` prop `afterBodyText?: string | null` (forwarded when non-empty). `PerShowActionableWarnings` external props UNCHANGED (`followUpCopy` input stays, spec §3.1).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/perShowActionableFollowUp.test.tsx
// @vitest-environment jsdom
/** Spec §3.1/§8.1: follow-up renders as a second popover paragraph OUTSIDE the
 *  described element; staged-shaped callers (no followUpCopy) are byte-identical.
 *  Fixtures copy real emitter shapes: TYPO/DOUBLE_LOCATION have no sourceCell
 *  (lib/parser/personalization.ts:71-77, blocks/venue.ts:134-141); the
 *  followUp-bearing card uses an OPERATOR_ACTIONABLE_ANCHORED warn shape. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

const FOLLOW_UP =
  "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";

const warnWithCell: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "Unknown role token",
  rawSnippet: "FX Teck",
  sourceCell: { title: "INFO", gid: 0, a1: "B12" }, // SourceAnchor shape: buildSheetDeepLink.ts:3
};

function bodyFor(i: number) {
  const item = screen.getAllByTestId("per-show-actionable-item")[i]!;
  const trigger = item.querySelector("[data-testid$='-trigger']")!;
  const body = item.querySelector("[data-testid$='-body']")!;
  const describedEl = document.getElementById(trigger.getAttribute("aria-describedby") ?? "");
  return { trigger, body, describedEl };
}

describe("per-card follow-up placement (spec §3.1)", () => {
  it("followUp card: second paragraph outside the described element", () => {
    render(
      <PerShowActionableWarnings items={[warnWithCell]} driveFileId="d1" followUpCopy={FOLLOW_UP} />,
    );
    const { body, describedEl } = bodyFor(0);
    expect(describedEl?.textContent ?? "").not.toContain("Fixed it in the sheet?");
    const p = body!.querySelector("p.mt-2");
    expect(p?.textContent).toBe(FOLLOW_UP);
  });

  it("staged-shaped caller (no followUpCopy): describedby spans whole body, no extra paragraph", () => {
    render(<PerShowActionableWarnings items={[warnWithCell]} driveFileId="d1" />);
    const { body, describedEl } = bodyFor(0);
    expect(describedEl).toBe(body);
    expect(body!.querySelector("p.mt-2")).toBeNull();
  });

  it("context-null guard: non-catalog code with sourceCell renders followUp AS the described body", () => {
    // isMessageCode("NOT_A_CATALOG_CODE") is false -> entry null -> trigger
    // context null; the ratified guard makes the follow-up the body (spec
    // section 3.1 boundary). Catches: guard omitted (no trigger at all) or
    // inverted (followUp in afterBodyText with an empty described body).
    const noContext: ParseWarning = {
      severity: "warn",
      code: "NOT_A_CATALOG_CODE",
      message: "A human message",
      rawSnippet: "row",
      sourceCell: { title: "INFO", gid: 0, a1: "C3" },
    };
    render(
      <PerShowActionableWarnings items={[noContext]} driveFileId="d1" followUpCopy={FOLLOW_UP} />,
    );
    const { body, describedEl } = bodyFor(0);
    expect(describedEl).toBe(body); // no afterBody -> describedby stays whole body
    expect(describedEl!.textContent).toBe(FOLLOW_UP);
    expect(body!.querySelector("p.mt-2")).toBeNull();
  });

  it("no sourceCell: no follow-up paragraph even with followUpCopy (existing gate)", () => {
    const noCell: ParseWarning = {
      severity: "info",
      code: "TYPO_NORMALIZED",
      message: "Typo alias 'venu' normalized to canonical 'venue'",
      rawSnippet: "venu",
    };
    render(<PerShowActionableWarnings items={[noCell]} driveFileId="d1" followUpCopy={FOLLOW_UP} />);
    const item = screen.getAllByTestId("per-show-actionable-item")[0]!;
    expect(item.querySelector("p.mt-2")).toBeNull();
    // The sentence must be absent from the ENTIRE card, not just the extra
    // paragraph slot — catches a regression to the old joined-into-body form.
    expect(item.textContent ?? "").not.toContain("Fixed it in the sheet?");
  });
});
```

NOTE for implementer: the `sourceCell` fixture shape above is the verified `SourceAnchor` (`lib/sheet-links/buildSheetDeepLink.ts:3`: `{ title: string; gid: number; a1?: string }`). `UNKNOWN_ROLE_TOKEN` is VERIFIED to carry catalog `triggerContext` (`lib/messages/catalog.ts:1234`), so its popover exists and the red phase fails on the JOINED text, not on a missing popover.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/perShowActionableFollowUp.test.tsx`
Expected: FAIL — follow-up currently joined into the described body text.

- [ ] **Step 3: Implement**

(a) `compactAlertHelp.tsx` — add to `CompactAlertHelpProps` (after `popoverCopy` `:93`):

```ts
  /**
   * Second popover paragraph (the correction follow-up), forwarded verbatim to
   * HoverHelp.afterBodyText. Same name at both hops (spec §3.1) — deliberately
   * NOT `followUpCopy`, which is PerShowActionableWarnings' external input.
   */
  afterBodyText?: string | null;
```

Destructure `afterBodyText` in the component and forward on `HoverHelp` (spread for exactOptional):

```tsx
      {...(typeof afterBodyText === "string" && afterBodyText.trim().length > 0
        ? { afterBodyText }
        : {})}
```

(b) `PerShowActionableWarnings.tsx` — replace `:140-148` (join + comment) with:

```ts
        // Spec 2026-07-22-warning-panel-polish §3.1: the follow-up is a second
        // popover paragraph OUTSIDE the aria-describedby text run, not joined
        // into the body. Guard boundary (§3.1): with a null trigger context the
        // follow-up IS the body — the only content of a producer-less defensive
        // case — so the card keeps a described popover instead of losing its
        // trigger entirely.
        const contextOrNull: string | null = context ?? null; // one sentinel, exactOptional-safe
        // followUp is the EXISTING :136-139 derivation whose else-branch is
        // null — annotate it `const followUp: string | null` so undefined is
        // unrepresentable and the spread below can never pass explicit
        // undefined to the optional prop.
        const popoverBody = contextOrNull ?? followUp;
        const afterBodyText: string | null = contextOrNull !== null ? followUp : null;
```

and pass to `CompactAlertHelp` (`:240-252`), spread-style:

```tsx
                  <CompactAlertHelp
                    subject={typeof title === "string" ? title : null}
                    popoverCopy={popoverBody}
                    {...(afterBodyText !== null ? { afterBodyText } : {})}
                    helpHref={null}
                    route="/admin"
                    testId={`per-show-actionable-help-${keys[i]}`}
                  />
```

(`context` is the existing `warningCardCopyFields(entry).trigger` value at `:117`; `contextOrNull` is the ONE normalized sentinel — never branch on raw `context` — so an `undefined` trigger cannot put the follow-up into both `popoverBody` and `afterBodyText`, and the truthy-string spread can never pass explicit `undefined` to the optional prop.)

- [ ] **Step 4: Run new + neighboring suites**

Run: `pnpm vitest run tests/components/admin/perShowActionableFollowUp.test.tsx tests/components/admin/stagedCardBaseline.test.tsx && pnpm vitest run tests/components/admin/showpage/sectionWarningControls.test.tsx`
Expected: all PASS. `stagedCardBaseline` snapshots must be UNCHANGED (no `followUpCopy` there). If `sectionWarningControls` pins the joined single-run popover text, update ONLY those assertions to the two-block shape and enumerate each edit in the commit body.

- [ ] **Step 5: Commit**

```bash
git add components/admin/compactAlertHelp.tsx components/admin/PerShowActionableWarnings.tsx tests/components/admin/perShowActionableFollowUp.test.tsx
git commit --no-verify -m "feat(admin): follow-up sentence as second popover paragraph outside aria-describedby"
```

---

### Task 4: Live-region sentence builder + `ShowReviewSurface` mount

**Files:**
- Create: `lib/admin/warningsPanelStatus.ts`
- Create: `tests/helpers/publishedSurfaceProps.tsx` — the SHARED `buildPublishedSurfaceProps` helper all of Tasks 4-7 import (`@/tests/helpers/publishedSurfaceProps`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (warnings `<section>` block, after `:1076`)
- Test: `tests/admin/warningsPanelStatus.test.ts`, `tests/components/admin/review/warningsPanelStatusMount.test.tsx`

**Interfaces:**
- Produces: `warningsPanelStatusSentence(listed: number, here: number, elsewhere: number): string` (exact copy table, spec §3.2) and `data-testid="warnings-panel-status"` span.

- [ ] **Step 1: Failing builder test**

```ts
// tests/admin/warningsPanelStatus.test.ts
/** Spec §3.2 copy table. Catches: a transition that changes one bucket but not
 *  the text (injectivity over single-bucket changes), and wrong grammar at n=1. */
import { describe, expect, it } from "vitest";
import { warningsPanelStatusSentence } from "@/lib/admin/warningsPanelStatus";

describe("warningsPanelStatusSentence (spec §3.2)", () => {
  it("exact strings per part and grammatical number", () => {
    expect(warningsPanelStatusSentence(0, 0, 0)).toBe("Nothing needs a look on this sheet.");
    expect(warningsPanelStatusSentence(1, 0, 0)).toBe("1 warning listed.");
    expect(warningsPanelStatusSentence(2, 0, 0)).toBe("2 warnings listed.");
    expect(warningsPanelStatusSentence(0, 1, 0)).toBe("1 warning needs a look below.");
    expect(warningsPanelStatusSentence(0, 3, 0)).toBe("3 warnings need a look below.");
    expect(warningsPanelStatusSentence(0, 0, 1)).toBe("1 warning needs a look in its own section.");
    expect(warningsPanelStatusSentence(0, 0, 4)).toBe("4 warnings need a look in their own sections.");
    expect(warningsPanelStatusSentence(2, 1, 3)).toBe(
      "2 warnings listed. 1 warning needs a look below. 3 warnings need a look in their own sections.",
    );
  });

  it("invalid inputs normalize to zero, never render literally", () => {
    expect(warningsPanelStatusSentence(Number.NaN, 0, 0)).toBe("Nothing needs a look on this sheet.");
    expect(warningsPanelStatusSentence(-2, 0, 0)).toBe("Nothing needs a look on this sheet.");
    expect(warningsPanelStatusSentence(Number.POSITIVE_INFINITY, 0, 0)).toBe(
      "Nothing needs a look on this sheet.",
    );
    expect(warningsPanelStatusSentence(2.7, 0, 0)).toBe("2 warnings listed.");
  });

  it("single-bucket changes always change the text (production ignore transitions)", () => {
    const base = warningsPanelStatusSentence(2, 2, 2);
    expect(warningsPanelStatusSentence(1, 2, 2)).not.toBe(base);
    expect(warningsPanelStatusSentence(2, 1, 2)).not.toBe(base);
    expect(warningsPanelStatusSentence(2, 2, 1)).not.toBe(base);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/admin/warningsPanelStatus.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement builder**

```ts
// lib/admin/warningsPanelStatus.ts
//
// The published Parse-warnings panel's live-region sentence: a pure function
// of the full count tuple so EVERY ignore/un-ignore transition changes the
// text (spec 2026-07-22-warning-panel-polish §3.2 — a routed warn row's
// ignore never changes the listed count, so listed alone is not enough).
export function warningsPanelStatusSentence(
  listed: number,
  here: number,
  elsewhere: number,
): string {
  // Input contract: counts are lengths, so nonnegative finite integers.
  // Defensive normalization: anything else (NaN, negative, Infinity, float)
  // collapses to the floor of a nonnegative finite value, else 0 — the
  // sentence must never render "NaN warnings".
  const norm = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  listed = norm(listed);
  here = norm(here);
  elsewhere = norm(elsewhere);
  const parts: string[] = [];
  if (listed > 0) parts.push(listed === 1 ? "1 warning listed." : `${listed} warnings listed.`);
  if (here > 0) {
    parts.push(here === 1 ? "1 warning needs a look below." : `${here} warnings need a look below.`);
  }
  if (elsewhere > 0) {
    parts.push(
      elsewhere === 1
        ? "1 warning needs a look in its own section."
        : `${elsewhere} warnings need a look in their own sections.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : "Nothing needs a look on this sheet.";
}
```

- [ ] **Step 4: Run builder test — PASS. Then write the failing mount test**

```tsx
// tests/components/admin/review/warningsPanelStatusMount.test.tsx
// @vitest-environment jsdom
/** Spec §3.2/§8.3: the status span lives OUTSIDE the suppressible panel-card
 *  subtree (step3ReviewSections.tsx:792-815 unmounts children in Silent), so
 *  the SAME node instance survives clean<->Silent and its text changes.
 *  Renders through the real surface, not a bare WarningsBreakdown. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
// Reuse the published fixture the trim suites already share:
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";

describe("warnings panel live region (spec §3.2)", () => {
  it("gate ON: span present, correct sentence, same node across Silent re-render", () => {
    const silent = buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0 });
    const { rerender } = render(<ShowReviewSurface {...silent} />);
    const span = screen.getByTestId("warnings-panel-status");
    expect(span).toHaveAttribute("role", "status");
    expect(span.textContent).toBe("2 warnings need a look below.");
    const clean = buildPublishedSurfaceProps({ listed: 0, here: 0, elsewhere: 0 });
    rerender(<ShowReviewSurface {...clean} />);
    expect(screen.getByTestId("warnings-panel-status")).toBe(span); // same instance
    expect(span.textContent).toBe("Nothing needs a look on this sheet.");
  });

  it("production wiring feeds each bucket: listed, elsewhere, and the mixed tuple", () => {
    // Catches: wiring that always passes zero for listed, swaps here/elsewhere,
    // or derives elsewhere from the wrong model. Counts differ pairwise so a
    // swapped pair cannot produce the same sentence.
    const { rerender } = render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 2, here: 0, elsewhere: 0 })} />,
    );
    const span = screen.getByTestId("warnings-panel-status");
    expect(span.textContent).toBe("2 warnings listed.");
    rerender(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0, here: 0, elsewhere: 3 })} />);
    expect(span.textContent).toBe("3 warnings need a look in their own sections.");
    rerender(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 2, here: 1, elsewhere: 3 })} />);
    expect(span.textContent).toBe(
      "2 warnings listed. 1 warning needs a look below. 3 warnings need a look in their own sections.",
    );
  });

  it("gate OFF (staged shape): span absent", () => {
    const staged = buildPublishedSurfaceProps({ listed: 1, here: 0, elsewhere: 0, gateOff: true });
    render(<ShowReviewSurface {...staged} />);
    expect(screen.queryByTestId("warnings-panel-status")).toBeNull();
  });
});
```

NOTE for implementer: `tests/helpers/publishedSurfaceProps.tsx` is CREATED IN THIS TASK (before the mount test can run) and is the single shared helper every later task imports — never a suite-local copy. Author it from the canonical scaffold in `tests/components/admin/review/routedWarningsGate.test.tsx`: `buildPublishedSectionData` (`components/admin/review/publishedAdapter`) over a `fixtureSnapshot`-style show (`tests/helpers/warningSurfaceFixture.ts:122`), `buildSectionWarningModel` + `deriveRoutedWarnings` for the counts, the `next/navigation` mock from that suite, and `renderSectionExtras` from `buildSectionWarningExtras` for gate-on renders (omit both for `gateOff`). The option names used in these steps (`listed`/`here`/`elsewhere`/`gateOff`/`withParseNotes`/`elsewhereInCrew`/`infoRows`/`elsewhereSections`) are the CONTRACT for that local helper — implement them there once, reuse across Tasks 4-7. Counts map to: `listed` = info rows in `data.warnings`, `here` = active warn rows in the `warnings` bucket, `elsewhere` = active warn rows in other sections. Do not weaken the same-instance assertion.

- [ ] **Step 5: Run to verify mount-test failure, then implement the mount**

In `ShowReviewSurface.tsx`, inside the section loop after `{renderSectionExtras?.(s.id, data)}` (`:1076`):

```tsx
              {/* Spec 2026-07-22-warning-panel-polish §3.2: always-mounted
                  published live region. OUTSIDE the chrome-suppressible card
                  subtree (Silent unmounts panel children,
                  step3ReviewSections.tsx:792-815) so the node survives every
                  state and role="status" announces each text change. */}
              {s.id === "warnings" && routedWarningsRenderElsewhere ? (
                <span role="status" className="sr-only" data-testid="warnings-panel-status">
                  {warningsPanelStatusSentence(
                    visibleWarningRows(data.warnings, true).length,
                    routedWarnings?.here ?? 0,
                    routedWarnings?.elsewhere ?? 0,
                  )}
                </span>
              ) : null}
```

Import `warningsPanelStatusSentence` (the file already imports `visibleWarningRows`).

- [ ] **Step 6: Run both suites**

Run: `pnpm vitest run tests/admin/warningsPanelStatus.test.ts tests/components/admin/review/warningsPanelStatusMount.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/warningsPanelStatus.ts tests/helpers/publishedSurfaceProps.tsx components/admin/review/ShowReviewSurface.tsx tests/admin/warningsPanelStatus.test.ts tests/components/admin/review/warningsPanelStatusMount.test.tsx
git commit --no-verify -m "feat(admin): count-tuple live region for the published Parse-warnings panel"
```

---

### Task 5: Seamless extras container in the Silent state

**Files:**
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (factory return type `:143`, container `:215-219`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (`renderSectionExtras` type `:192`, call `:1076`)
- Test: `tests/components/admin/showpage/sectionWarningSeam.test.tsx`

**Interfaces:**
- Produces: callback signature `(id: SectionId, d: SectionData, opts?: { seamless?: boolean }) => ReactNode`; caller passes `{ seamless: s.id === "warnings" && suppressWarningsPanelCard }`.

- [ ] **Step 1: Failing test (state matrix, spec §8.4)**

```tsx
// tests/components/admin/showpage/sectionWarningSeam.test.tsx
// @vitest-environment jsdom
/** Spec §3.3/§8.4. Catches: seam dropped in the wrong state or wrong section.
 *  Matrix: Silent -> warnings extras seamless; List -> byte-identical classes;
 *  here+parseNotes -> card AND seam stay; mixed -> only warnings seamless. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";

const SEAM_CLASSES = "mt-3 flex flex-col gap-3 border-t border-border pt-3";
const SEAMLESS_CLASSES = "flex flex-col gap-3";

function extrasClass(sectionId: string): string | null {
  return screen.queryByTestId(`section-warning-controls-${sectionId}`)?.className ?? null;
}

describe("extras seam (spec §3.3)", () => {
  it("Silent: warnings extras drop the seam", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0 })} />);
    expect(extrasClass("warnings")).toBe(SEAMLESS_CLASSES);
  });

  it("List state: byte-identical seam classes", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 1, here: 2, elsewhere: 0 })} />);
    expect(extrasClass("warnings")).toBe(SEAM_CLASSES);
  });

  it("here + parseNotes: card stays, seam stays", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0, withParseNotes: true })}
      />,
    );
    expect(extrasClass("warnings")).toBe(SEAM_CLASSES);
  });

  it("mixed here+elsewhere: warnings seamless while crew keeps its seam in the same render", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, here: 1, elsewhereInCrew: 2 })}
      />,
    );
    expect(extrasClass("warnings")).toBe(SEAMLESS_CLASSES);
    expect(extrasClass("crew")).toBe(SEAM_CLASSES);
  });
});
```

NOTE for implementer: reuse the SHARED helper `tests/helpers/publishedSurfaceProps.tsx` (created in Task 4 from the routedWarningsGate.test.tsx scaffold); `withParseNotes` = supply the `warningsNotes` input that produces `parseNotes` (see `ShowReviewSurface.tsx:1041-1043`); keep exact-className assertions (spec §8.4 requires byte-identity in non-Silent states — copy the CURRENT class string from `sectionWarningExtras.tsx:218` verbatim into `SEAM_CLASSES` at write time).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/showpage/sectionWarningSeam.test.tsx`
Expected red phase: the Silent case AND the mixed here+elsewhere warnings-section case FAIL (seam classes render today); the List case and here+parseNotes case already PASS (they pin current classes).

- [ ] **Step 3: Implement**

(a) `sectionWarningExtras.tsx` — the returned callback (`:146`) gains the opts param and branches the container class:

```ts
  function renderSectionExtras(
    id: SectionId,
    d: SectionData,
    opts?: { seamless?: boolean },
  ): ReactNode {
```
```tsx
      <div
        data-testid={`section-warning-controls-${id}`}
        // Spec 2026-07-22-warning-panel-polish §3.3: in the Silent state the
        // heading sits directly above these extras, so the border-t reads as a
        // heading underline; the caller passes seamless exactly when the
        // section body card is suppressed.
        className={
          opts?.seamless === true ? "flex flex-col gap-3" : "mt-3 flex flex-col gap-3 border-t border-border pt-3"
        }
      >
```

(b) `ShowReviewSurface.tsx:192` type:

```ts
  renderSectionExtras?: (
    id: SectionId,
    d: SectionData,
    opts?: { seamless?: boolean },
  ) => ReactNode; // Phase 2 hook: per-section warning controls
```

(c) `ShowReviewSurface.tsx:1076` call:

```tsx
              {renderSectionExtras?.(s.id, data, {
                seamless: s.id === "warnings" && suppressWarningsPanelCard,
              })}
```

Also in this task (change 7, same file family): fix the stale comment at `step3ReviewSections.tsx:2643-2645` —

```tsx
                  // §E4 jump-target key: index into the RENDERED (trimmed) rows
                  // — same index as the testid. Only consumer is the staged
                  // jump path, which is never gated, so staged index == full
                  // index there (published anchors jump by section, not row).
```

- [ ] **Step 4: Run suite + neighbors**

Run: `pnpm vitest run tests/components/admin/showpage/sectionWarningSeam.test.tsx tests/components/admin/showpage/sectionWarningControls.test.tsx`
Expected: PASS (existing suite unaffected — default opts renders identical classes).

- [ ] **Step 5: Commit**

```bash
git add components/admin/showpage/sectionWarningExtras.tsx components/admin/review/ShowReviewSurface.tsx components/admin/wizard/step3ReviewSections.tsx tests/components/admin/showpage/sectionWarningSeam.test.tsx
git commit --no-verify -m "feat(admin): seamless extras container in the Silent state; fix stale data-warning-index comment"
```

---

### Task 6: Callout actionability gate

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`:2620-2622` + comment block `:2591-2619`)
- Test: `tests/components/admin/calloutActionabilityGate.test.tsx`

**Interfaces:**
- Consumes: Task 1's `infoRowInvitesCorrection`.

- [ ] **Step 1: Failing matrix test (spec §8.5)**

```tsx
// tests/components/admin/calloutActionabilityGate.test.tsx
// @vitest-environment jsdom
/** Spec §3.4/§8.5. Catches: callout for a TYPO-only sheet (owner's ask), and
 *  the pre-change bug where the sourceCell conjunct suppressed it for ALL
 *  published info rows (neither info code is anchored, dataGaps.ts:370-391).
 *  Fixtures copy real emitter shapes: no sourceCell on either info code. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import type { ParseWarning } from "@/lib/parser/types";

const TYPO: ParseWarning = {
  severity: "info",
  code: "TYPO_NORMALIZED",
  message: "Typo alias 'venu' normalized to canonical 'venue'",
  blockRef: { kind: "venue" },
  rawSnippet: "venu",
};
const DOUBLE: ParseWarning = {
  severity: "info",
  code: "DAY_RESTRICTION_DOUBLE_LOCATION",
  message: "Day restriction paren+ONLY found in both name and role cells; preferring role cell.",
  rawSnippet: "name: A (SAT ONLY) | role: Tech (SAT ONLY)",
};

const CALLOUT = "correction-loop-callout";

describe("published callout actionability gate (spec §3.4)", () => {
  it("only TYPO_NORMALIZED listed: no callout", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO] })} />);
    expect(screen.queryByTestId(CALLOUT)).toBeNull();
  });

  it("only DAY_RESTRICTION_DOUBLE_LOCATION listed: callout renders", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [DOUBLE] })} />);
    expect(screen.getByTestId(CALLOUT)).toBeInTheDocument();
  });

  it("both listed: callout renders", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO, DOUBLE] })} />);
    expect(screen.getByTestId(CALLOUT)).toBeInTheDocument();
  });

  it("wizard (gate off) with only TYPO: callout renders unconditionally (staged contract)", () => {
    render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO], gateOff: true })} />,
    );
    expect(screen.getByTestId(CALLOUT)).toBeInTheDocument();
  });
});
```

(Reuse the shared helper `tests/helpers/publishedSurfaceProps.tsx`; `infoRows` = the info-severity entries of `data.warnings`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/calloutActionabilityGate.test.tsx`
Expected red phase: DOUBLE-only and both-listed cases FAIL (published callout never renders today — dead sourceCell conjunct); TYPO-only and wizard cases already PASS.

- [ ] **Step 3: Implement**

Replace `:2620-2622` and rewrite the tail of the comment block above it:

```tsx
          {/* ...existing Flow-3 / §3.5 history comment retained...

              Spec 2026-07-22-warning-panel-polish §3.4: on the published
              branch the sourceCell conjunct is RETIRED — published rows are
              info-only (visibleWarningRows), no info code is anchored
              (dataGaps.ts OPERATOR_ACTIONABLE_ANCHORED), so that gate could
              never fire. The callout now renders exactly when a listed info
              row invites a correction (actionability registry). The wizard
              branch stays unconditional (staged contract). */}
          {routedWarningsRenderElsewhere ? (
            rows.some((w) => infoRowInvitesCorrection(w)) ? (
              <CorrectionLoopCallout mode={mode} />
            ) : null
          ) : (
            <CorrectionLoopCallout mode={mode} />
          )}
```

Import `infoRowInvitesCorrection` from `@/lib/admin/infoCodeActionability`.

- [ ] **Step 4: Run + sweep pinned expectations**

Run: `pnpm vitest run tests/components/admin/calloutActionabilityGate.test.tsx && rg -ln "correction-loop-callout|CorrectionLoopCallout|correctionLoopCopy|Fixed it in the sheet" tests/ | xargs pnpm vitest run`
Expected: new suite PASS. The sweep pattern covers the testid, the component, the copy helper, AND the literal sentence — an expectation encoding the retired sourceCell gate through any of those shapes surfaces here. For each hit pinning the OLD published gate, update to registry behavior and enumerate every edited assertion in the commit body (class-sweep rule).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/calloutActionabilityGate.test.tsx
# PLUS each swept test file actually edited in Step 4 — list them explicitly; never blanket-add tests/
git commit --no-verify -m "feat(admin): callout gates on info-code actionability; retire dead sourceCell conjunct on published branch"
```

---

### Task 7: Pointer sentence with tappable section names

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`Step3SectionChrome` type `:436`, elsewhere branch `:2564-2570`)
- Modify: `components/admin/review/ShowReviewSurface.tsx` (chrome provider `:1002-1070`)
- Modify: `tests/helpers/publishedSurfaceProps.tsx` (extend with elsewhere-section options)
- Test: `tests/components/admin/wizard/pointerSentence.test.tsx`

**Interfaces:**
- Produces: chrome fields `pointerTargets?: { targets: ReadonlyArray<{ id: SectionId; label: string }>; totalSections: number }` and `onJumpToSection?: (id: SectionId) => void`; exported pure helper `pointerSentenceParts(targets, totalSections)` returning `{ named: ReadonlyArray<{ id: SectionId; label: string }>; moreCount: number }` with `POINTER_NAME_CAP = 3`.

- [ ] **Step 1: Failing test (spec §8.6 — full-string equality)**

```tsx
// tests/components/admin/wizard/pointerSentence.test.tsx
// @vitest-environment jsdom
/** Spec §3.5/§8.6: FULL sentence textContent equality pins punctuation.
 *  Catches: missing terminal period, wrong 2-name/3-name separators, cap and
 *  unified-overflow regressions, wrong callback ids, missing-callback fallback. */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { pointerSentenceParts, POINTER_NAME_CAP } from "@/components/admin/wizard/step3ReviewSections";

const T = (id: string, label: string) => ({ id: id as never, label });

describe("pointerSentenceParts (pure, spec §3.5)", () => {
  it("cap boundary and unified overflow", () => {
    expect(POINTER_NAME_CAP).toBe(3);
    expect(pointerSentenceParts([T("crew", "Crew")], 1)).toEqual({
      named: [T("crew", "Crew")],
      moreCount: 0,
    });
    expect(pointerSentenceParts([T("crew", "Crew"), T("rooms", "Rooms & scope")], 3)).toEqual({
      named: [T("crew", "Crew"), T("rooms", "Rooms & scope")],
      moreCount: 1, // 1 unresolved section folds into the same clause (spec §3.5)
    });
    const four = [T("a", "A"), T("b", "B"), T("c", "C"), T("d", "D")];
    expect(pointerSentenceParts(four, 4)).toEqual({ named: four.slice(0, 3), moreCount: 1 });
  });
});

describe("pointer sentence render (spec §8.6)", () => {
  function renderElsewhere(labels: string[], opts: { totalSections?: number } = {}) {
    const onJump = vi.fn();
    const props = buildPublishedSurfaceProps({
      listed: 0,
      here: 0,
      elsewhereSections: labels,
      ...(opts.totalSections !== undefined ? { elsewhereTotalSections: opts.totalSections } : {}),
    });
    render(<ShowReviewSurface {...props} />);
    return { onJump };
  }

  function sentence(): string {
    return screen.getByTestId(/warnings-elsewhere/).textContent ?? "";
  }

  it("2 sections: exact sentence with and", () => {
    renderElsewhere(["Crew", "Rooms & scope"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew and Rooms & scope.",
    );
  });

  it("3 sections: serial comma, no more-suffix", () => {
    renderElsewhere(["Crew", "Rooms & scope", "Contacts"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew, Rooms & scope, and Contacts.",
    );
  });

  it("4 sections: cap + overflow clause, comma-separated names, no and between names", () => {
    renderElsewhere(["Crew", "Rooms & scope", "Contacts", "Event"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew, Rooms & scope, Contacts, and 1 more.",
    );
  });

  it("1 section: exact sentence, no comma, no and", () => {
    renderElsewhere(["Crew"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew.",
    );
  });

  it("rendered partial-miss: 2 resolved + 1 unresolved section folds into the more-clause", () => {
    renderElsewhere(["Crew", "Rooms & scope"], { totalSections: 3 });
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew, Rooms & scope, and 1 more.",
    );
  });

  it("tap fires onJumpToSection with the section id (chrome-level contract)", () => {
    // Direct chrome render — the Provider carries the spy; catches a wrong id
    // or a dead handler wire. handleNavClick wiring is Task 8's browser test.
    const onJump = vi.fn();
    renderWarningsBreakdownWithChrome({
      pointerTargets: { targets: [{ id: "crew", label: "Crew" }], totalSections: 1 },
      onJumpToSection: onJump,
    });
    fireEvent.click(screen.getByRole("button", { name: "Crew" }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith("crew");
  });

  it("no callback: bold text, no buttons (direct chrome harness — the surface always wires the callback, so the absent-callback contract is chrome-level)", () => {
    renderWarningsBreakdownWithChrome({
      pointerTargets: { targets: [{ id: "crew", label: "Crew" }], totalSections: 1 },
      // onJumpToSection deliberately OMITTED
    });
    expect(screen.queryByRole("button", { name: "Crew" })).toBeNull();
    const el = screen.getByTestId(/warnings-elsewhere/);
    expect(el.textContent).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew.",
    );
    expect(el.querySelector("strong")?.textContent).toBe("Crew");
  });
});
```

NOTE for implementer: the pure `pointerSentenceParts` tests are exact as written. For the render tests, extend the shared helper `tests/helpers/publishedSurfaceProps.tsx` (add `elsewhereSections`/`elsewhereTotalSections` options; the file is therefore in this task's staging list) (elsewhere rows land in named sections); author `renderWarningsBreakdownWithChrome(chromeExtras)` in this suite following the direct-Provider pattern of `tests/components/admin/review/routedWarningsGate.test.tsx` (Provider value + the warnings section subtree in the elsewhere state). Full-string assertions must not be weakened to `toContain`.

- [ ] **Step 2: Run to verify failure (jsdom AND browser red phase)**

Run: `pnpm vitest run tests/components/admin/wizard/pointerSentence.test.tsx`
Expected red phase: module-load failure first (`pointerSentenceParts` / `POINTER_NAME_CAP` not yet exported) — that IS the failing state for the pure tests; after Step 3(b) exports land mid-implementation, the render cases fail on the static sentence until (c)/(d) complete.

Also author `tests/e2e/warning-panel-polish.spec.ts` NOW (full content in Task 8 — Task 8 only re-runs and repairs) and run it: `pnpm exec playwright test tests/e2e/warning-panel-polish.spec.ts`. Expected red phase: both tests FAIL — no pointer buttons exist yet. This is the browser-layout failing test that Task 8 turns green, so the 44x44/scroll behavior is test-first across the task pair.

- [ ] **Step 3: Implement**

(a) `step3ReviewSections.tsx` — chrome type additions (inside `Step3SectionChrome`, `:436`, spread-inserted like every optional field):

```ts
  /** Spec 2026-07-22-warning-panel-polish §3.5: ordered, label-resolved
   *  sections holding the elsewhere warn cards, plus the TOTAL count of such
   *  sections (resolved + unresolved) so the sentence can fold misses into
   *  the terminal "and N more." clause. Warnings section only. */
  pointerTargets?: {
    targets: ReadonlyArray<{ id: SectionId; label: string }>;
    totalSections: number;
  };
  /** §3.5: scroll-to-section, supplied from ShowReviewSurface.handleNavClick. */
  onJumpToSection?: (id: SectionId) => void;
```

(b) Pure helper + cap, exported next to `WarningsBreakdown`:

```ts
export const POINTER_NAME_CAP = 3;

/** Spec §3.5 unified overflow rule: named = first cap-many resolved targets;
 *  moreCount = every other elsewhere section (over-cap AND label-unresolved). */
export function pointerSentenceParts(
  targets: ReadonlyArray<{ id: SectionId; label: string }>,
  totalSections: number,
): { named: ReadonlyArray<{ id: SectionId; label: string }>; moreCount: number } {
  const named = targets.slice(0, POINTER_NAME_CAP);
  return { named, moreCount: Math.max(0, totalSections - named.length) };
}
```

(c) Elsewhere branch (`:2564-2570`) — replace the static `<p>` body:

```tsx
          here > 0 ? null : elsewhere > 0 ? (
            <p
              data-testid={`wizard-step3-card-${dfid}-warnings-elsewhere`}
              className="text-sm text-text-subtle"
            >
              {(() => {
                const pt = chrome?.pointerTargets;
                const { named, moreCount } = pt
                  ? pointerSentenceParts(pt.targets, pt.totalSections)
                  : { named: [], moreCount: 0 };
                if (named.length === 0) {
                  // All labels missed or no chrome data: today's exact fallback.
                  return "Nothing else to note here. The warnings that need a look are in their own sections.";
                }
                const jump = chrome?.onJumpToSection;
                const nameNode = (t: { id: SectionId; label: string }) =>
                  jump ? (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => jump(t.id)}
                      // Spec §3.5: text-sized inline button; 44x44 floor via the
                      // centered overlay, zero line-box inflation (HoverHelp
                      // compactTrigger pattern).
                      className="relative inline font-semibold text-text-strong underline underline-offset-2 before:absolute before:top-1/2 before:left-1/2 before:h-tap-min before:w-full before:min-w-tap-min before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    >
                      {t.label}
                    </button>
                  ) : (
                    <strong key={t.id} className="font-semibold text-text-strong">
                      {t.label}
                    </strong>
                  );
                const parts: ReactNode[] = ["Nothing else to note here. The warnings that need a look are in "];
                const withMore = moreCount > 0;
                named.forEach((t, i) => {
                  if (i > 0) {
                    // Unified rule (spec §3.5): with a terminal "and N more."
                    // clause the names are comma-separated (no "and" between
                    // names); without it, plain 2-name "A and B" / serial
                    // 3-name "A, B, and C".
                    parts.push(withMore || named.length > 2 ? ", " : " and ");
                    if (!withMore && named.length > 2 && i === named.length - 1) {
                      parts[parts.length - 1] = ", and ";
                    }
                  }
                  parts.push(nameNode(t));
                });
                if (withMore) {
                  parts.push(`, and ${moreCount} more`);
                }
                parts.push(".");
                return parts;
              })()}
            </p>
          ) : (
```

CAUTION for implementer: the separator logic above is the subtle part — derive it from the pinned §8.6 strings, not from this sketch: 1 name `"…in A."`; 2 names `"…in A and B."`; 3 names `"…in A, B, and C."`; any `moreCount>0` → `"…in A[, B[, C]], and N more."`. Write the joiner so those five exact strings fall out; adjust freely if the sketch misjoins, keeping the test as the contract. Overlay utilities RESOLVED: `--spacing-tap-min: 44px` is a theme spacing token (`app/globals.css:162`), so Tailwind v4 derives `h-tap-min`, `min-h-tap-min`, `min-w-tap-min`, `w-tap-min` automatically; `min-h-tap-min` is already in shipped use (`HoverHelp.tsx:212`). Use exactly `before:absolute before:top-1/2 before:left-1/2 before:h-tap-min before:w-full before:min-w-tap-min before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']` — Task 8 verifies the rendered box empirically.

(d) `ShowReviewSurface.tsx` provider — add to the chrome value (spread-inserted, warnings section only):

```tsx
                  ...(s.id === "warnings" && routedWarningsRenderElsewhere && routedWarnings
                    ? (() => {
                        const elsewhereIds = Object.keys(
                          routedWarnings.activeWarningsBySection,
                        ).filter((id) => id !== "warnings");
                        const targets = sections
                          .filter((sec) => elsewhereIds.includes(sec.id))
                          .map((sec) => ({ id: sec.id, label: sec.label }));
                        return elsewhereIds.length > 0
                          ? {
                              pointerTargets: { targets, totalSections: elsewhereIds.length },
                              onJumpToSection: (id: SectionId) => handleNavClick(id),
                            }
                          : {};
                      })()
                    : {}),
```

(`sections` is registry-ordered — `step3Sections(data)` at `:243` — so `targets` inherits visual order; a section id absent from `sections` is a label miss, counted via `totalSections`.)

- [ ] **Step 4: Run**

Run: `pnpm vitest run tests/components/admin/wizard/pointerSentence.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx`
Expected: new suite PASS; existing suite green except tests pinning the old static sentence in the elsewhere-with-chrome case — the NO-chrome fallback keeps the old string, so only chrome-driven cases change; enumerate any edits in the commit body.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx components/admin/review/ShowReviewSurface.tsx tests/components/admin/wizard/pointerSentence.test.tsx tests/helpers/publishedSurfaceProps.tsx
# PLUS each neighbor test edited in Step 4 (old-static-sentence pins) — list explicitly
git commit --no-verify -m "feat(admin): pointer sentence names elsewhere sections with tappable scroll buttons"
```

---

### Task 8: Real-browser e2e — scroll, 44×44 hit area, overlay disjointness

**Files:**
- Create: `tests/e2e/warning-panel-polish.spec.ts`
- Possibly modify (verification-driven repair): `components/admin/wizard/step3ReviewSections.tsx` (overlay classes), `components/admin/review/ShowReviewSurface.tsx`

**Interfaces:**
- Consumes: `data-testid` contracts from Tasks 4-7; harness constants from `tests/e2e/published-show-attention.spec.ts` (`BASE`, modal selectors `:26-28`, scroller `[data-testid="wizard-step3-card-${dfid}-review-content"]` at `:170-172`, its boot/seed/hydration helpers).

TDD pairing: the spec FILE was authored and run RED in Task 7 Step 2 (before the implementation existed); this task runs it expecting GREEN and owns the repair loop if it is not. The failing-test -> implementation -> passing-test sequence for the browser-layout behavior therefore spans Task 7 Step 2 (red) -> Task 7 Step 3 (implement) -> here (green).

- [ ] **Step 1: Confirm the spec authored in Task 7 Step 2 matches the content below** (author here only if Task 7 skipped it)

Copy the boot/seed/fixture prologue of `tests/e2e/published-show-attention.spec.ts` verbatim (same server boot, same seeded published show, same hydration gate — never `networkidle` alone), seeding warn rows routed to THREE sections (Crew + Rooms + Contacts — the pointer cap, the worst wrapping case) with the panel in the elsewhere state (no listed info rows, no here-bucket rows). The geometry test runs at an explicit mobile viewport (`await page.setViewportSize({ width: 390, height: 844 })`) so the three inline buttons wrap — wrapping is what makes 2D overlay intersection possible. Then:

```ts
const SCROLLER = `[data-testid="wizard-step3-card-${dfid}-review-content"]`;
const SENTENCE = `[data-testid="wizard-step3-card-${dfid}-warnings-elsewhere"]`;
const SECTION_CREW = `[data-testid="wizard-step3-card-${dfid}-review-section-crew"]`;

test("pointer button scrolls its section to the aligned position", async ({ page }) => {
  // ...boot + hydration gate from the prologue...
  const btn = page.locator(`${SENTENCE} button`, { hasText: "Crew" });
  const align = async () =>
    page.evaluate(
      ([sec, scr]) => {
        const t = document.querySelector(sec)!.getBoundingClientRect().top;
        const s = document.querySelector(scr)!.getBoundingClientRect().top;
        return Math.abs(t - s - 8);
      },
      [SECTION_CREW, SCROLLER] as const,
    );
  // Pre-click guard (spec §8.6): target NOT already aligned, else vacuous.
  expect(await align()).toBeGreaterThan(24);
  await btn.click();
  await expect.poll(align).toBeLessThanOrEqual(24);
});

test("pointer buttons: 44x44 effective hit area, adjacent overlays disjoint", async ({ page }) => {
  // ...boot into the 2-section elsewhere state...
  const buttons = page.locator(`${SENTENCE} button`);
  const n = await buttons.count();
  expect(n).toBe(3); // the seeded cap-count; disjointness must not pass vacuously
  type R = { left: number; right: number; top: number; bottom: number; cx: number; cy: number };
  const rects: R[] = [];
  for (let i = 0; i < n; i++) {
    const r = await buttons.nth(i).evaluate((el) => {
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el, "::before");
      const w = Math.max(parseFloat(cs.width) || 0, box.width);
      const h = Math.max(parseFloat(cs.height) || 0, box.height);
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, cx, cy };
    });
    expect(r.right - r.left).toBeGreaterThanOrEqual(44);
    expect(r.bottom - r.top).toBeGreaterThanOrEqual(44);
    rects.push(r);
  }
  // Geometric disjointness (spec §8.8): full 2D rect-intersection check over
  // every pair — not elementFromPoint (topmost-only), not x-axis alone.
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap =
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `overlay ${i} intersects overlay ${j}`).toBe(false);
    }
  }
  // ±21px offset clicks resolve to the intended button (behavioral floor probe).
  const first = buttons.first();
  const label = (await first.textContent()) ?? "";
  const r0 = rects[0]!;
  for (const [dx, dy] of [[0, -21], [0, 21], [-21, 0], [21, 0]] as const) {
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? null,
      [r0.cx + dx, r0.cy + dy] as const,
    );
    expect(hit).toBe(label);
  }
});
```

NOTE for implementer: if `getComputedStyle(el, "::before").width` returns `"auto"` in the harness browser, derive the overlay box from the button box plus the class contract (`w-full`/`min-w-tap-min`/`h-tap-min`, centered) and keep the ±21px `elementFromPoint` probes as the behavioral proof. Kill any stale sibling dev server on the harness port before booting; source `.env.local` (e2e is excluded from `pnpm test`).

- [ ] **Step 2: Run**

Run: `pnpm exec playwright test tests/e2e/warning-panel-polish.spec.ts`
Expected: PASS. On ANY failure: fix the SOURCE (overlay classes in `step3ReviewSections.tsx`, alignment offset, or provider wiring), re-run to green, and include the source fix in this task's commit — never weaken an assertion to pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/warning-panel-polish.spec.ts
# plus any source files repaired in Step 2 — list them explicitly
git commit --no-verify -m "test(admin): e2e pointer scroll, 44x44 hit area, overlay disjointness"
```

---

### Task 9: DEFERRED.md graduation + handoff doc

**Files:**
- Modify: `DEFERRED.md` (the four `warning-surface-trim` 2026-07-21 clusters, lines ~67-178)
- Create: `docs/superpowers/plans/2026-07-22-warning-panel-polish/handoff.md`

- [ ] **Step 1: Graduate resolved entries**

Follow the repo's graduation precedent (commits `5e6c2776a` / `36e33c342` — move resolved entries to a resolved/archive form, do not delete). Resolved by this bundle: critique P2 (popover paragraphs), audit P2 (live region), audit P2 (aria repetition), audit P2 ("names no section" — superseded by the pointer buttons), audit P3 (border-t seam), audit P3 (stale comment), re-gate P3 (always-on callout). Each graduated entry cites `docs/superpowers/specs/2026-07-22-warning-panel-polish-design.md` and the implementing task. Update stay-parked entries ONLY where 2026-07-21 owner decisions sharpened them: critique P1 heading count (owner re-confirmed suppression), critique P3 title (re-confirmed), whole-diff MEDIUM bell-only (owner accepted; note the Sheet-changes-feed coverage fact), crew-banner MEDIUM (owner chose dormant), re-gate P2 advice-twice (owner chose keep-both), staged-snapshot MEDIUM (unchanged).

- [ ] **Step 2: Write `handoff.md`** with numbered sections through §12 (invariant 8 requires findings + dispositions in §12 after the impeccable gate runs — leave §12 as a placeholder section header until the gate runs in close-out).

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md docs/superpowers/plans/2026-07-22-warning-panel-polish/handoff.md
git commit --no-verify -m "docs(handoff): graduate seven resolved DEFERRED items; warning-panel-polish handoff scaffold"
```

---

### Close-out (pipeline stages after the tasks; not TDD tasks)

- [ ] Full local gates: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` (fix everything; vitest exit code 1 with all tests passing means an uncaught error — check the "Errors" summary line).
- [ ] Impeccable dual-gate on the diff (invariant 8): `/impeccable critique` + `/impeccable audit` with canonical v3 setup (context.mjs load → register read). Each fix the gate forces is its own commit (test-first where behavioral); P0/P1 fixed or DEFERRED.md-entried. Then write findings + dispositions into handoff §12 and COMMIT the handoff + any DEFERRED.md edits (`docs(handoff): impeccable dispositions`). Re-run the affected vitest suites after any fix commit.
- [ ] Whole-diff cross-model review to APPROVE — split tight-scope briefs (per-surface file lists), REVIEWER ONLY inlined, verdict marker; inlined-artifact fallback on tool death. Repairs are commits with re-run gates; re-dispatch review after repairs until APPROVE.
- [ ] After ALL repair commits (impeccable fixes, §12/DEFERRED edits, cross-model repairs): re-run the FULL local gates (`pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`) PLUS `pnpm exec playwright test tests/e2e/warning-panel-polish.spec.ts` (e2e is excluded from `pnpm test`, and it is the only proof of scroll/geometry on the final tree) — unconditionally, whether or not a rebase happened. Then re-fetch origin/main; if behind, rebase and re-run the full gates AND the e2e spec again on the rebased tree. Push, PR, real CI green.
- [ ] Confirm both: `gh pr checks <PR#>` all green AND `gh pr view <PR#> --json mergeStateStatus` reports `CLEAN` (checks alone do not establish merge state).
- [ ] `gh pr merge --merge` in the same turn as CI-green; fast-forward local main; verify `git rev-list --left-right --count main...origin/main` == `0 0`; CronDelete the nudge; ship-state → done.
