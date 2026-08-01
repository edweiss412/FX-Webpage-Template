# Focus-Ring A11y Mechanical Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec `docs/superpowers/specs/2026-08-01-focus-ring-a11y-pass-design.md` (adversarially APPROVED R6): light focus-ring token `#E06000`, light info-bg nudge `#F1EDE7`, bare `ring-offset-2` sweep with structural guard, `--default-transition-duration` alias, Ignored(N) tap floor, switcher-bar 390px fix.

**Architecture:** Two token edits in `app/globals.css` runtime blocks; a shared backdrop-allowlist module imported by BOTH new style meta-tests (allowlist=matrix identity by construction); a filesystem-walked guard; a mechanical class sweep executed from the pre-decided per-hit table below; three Playwright surfaces extended.

**Tech Stack:** Vitest (tests/styles pattern per `tests/styles/status-token-contrast.test.ts`), Playwright (`tests/e2e/*`), Tailwind v4 `@theme` runtime-var pattern.

## Global Constraints

- TDD per task; commit per task, conventional-commits — AGENTS.md invariants 1, 6. Task 6 declares a docs-only TDD waiver inline.
- UI diff ships only after `/impeccable critique` + `/impeccable audit` (invariant 8) — close-out, before whole-diff review.
- No em-dashes in user-visible copy; 44px tap floor `min-h-tap-min` (`--spacing-tap-min: 44px`, `app/globals.css:162`).
- Spec §1.1 fences binding: no offset add/remove; `#E06000` pinned; info-bg `#F1EDE7` pinned; arbitrary `ring-offset-[…]` banned.
- No DB, no advisory locks, no §12.4 codes, no new mutation surfaces (invariants 2, 5, 10: N/A — declared).

**Meta-test inventory (declared):** CREATES tests/styles/focusRingContrast.test.ts, tests/styles/noBareRingOffset.test.ts, shared module tests/styles/_focusBackdropAllowlist.ts (all under the existing `tests/styles` vitest include — no testMatch change needed; a Task 6 step confirms collection). EXTENDS `tests/design/durationTokenEmission.test.ts`, `tests/e2e/attention-modal-gallery.spec.ts`, `tests/e2e/picker-flow.spec.ts`. Auth/DB/alert registries: none applies (no such surface touched).

**Mutation-family closure for the guard** (convergence set; new families need a live escaping mutant): (1) bare offset; (2) companion outside allowlist (`ring-offset-text`); (3) non-emitting spelling (`ring-offset-garbage`); (4) any arbitrary value (`ring-offset-[garbage]`, `ring-offset-[var(--color-text)]`); (5) mismatched variant chain; (6) unregistered indirection file; (7) focus-prefixed `outline-accent`.

**e2e harness readiness (three browser surfaces):**

| Host | Boot | Readiness gate | Trigger |
| --- | --- | --- | --- |
| `tests/e2e/picker-flow.spec.ts` | its existing `signInAs(fixture)` Supabase-session flow (seedPickerCookie is DEPRECATED per its header: Chromium CDP rejects `__Host-` cookies — the spec DRIVES the picker) | the spec's existing roster-render wait before row interaction | `crew-e2e.yml`, PR-triggered |
| `tests/e2e/attention-modal-gallery.spec.ts` | `dev-build` project on :3001, `ADMIN_DEV_PANEL_ENABLED=true`, developer JWT | `gotoScenario(page, "<name>")` then modal `[data-testid="published-show-review-modal"]` visible | `dev-gate-e2e.yml` — **workflow_dispatch/schedule ONLY; close-out dispatches it explicitly (Task 6 Step 5)** |
| `tests/e2e/section-header-layout.layout.spec.ts` | pattern donor only (its :1455 focus-offset probe), not modified | — | — |

Detach-safety: every sampled value is read inside a single `locator.evaluate` call; no element handle is held across navigation.

---

### Task 1: Token changes + contrast meta-test

**Files:**
- Create: tests/styles/_focusBackdropAllowlist.ts
- Create: tests/styles/focusRingContrast.test.ts
- Modify: `app/globals.css` (light `--color-focus-ring-runtime` ~:310; light `--color-info-bg-runtime` ~:307)
- Modify: `DESIGN.md` §1.1 rows (`--color-focus-ring`, `--color-info-bg`), §1.2 focus-ring row

**Interfaces — Produces:** `FOCUS_BACKDROP_ALLOWLIST` (Task 3 imports it).

- [ ] **Step 1: Write the allowlist module + failing meta-test.**

tests/styles/_focusBackdropAllowlist.ts:

```ts
export const FOCUS_BACKDROP_ALLOWLIST = [
  "surface", "surface-raised", "surface-sunken", "bg",
  "warning-bg", "info-bg", "stale-tint", "accent-tint", "danger-bg",
] as const;
export type FocusBackdrop = (typeof FOCUS_BACKDROP_ALLOWLIST)[number];
```

tests/styles/focusRingContrast.test.ts — copy the module-local helpers from `tests/styles/status-token-contrast.test.ts` with their exact names and signatures: `relLuminance(hex)` (:22-27), `contrast(a, b)` (:29-35), `blend(fg, alpha, bg)` (:181-191), `tokenIn(block, token)` (:39-44), `block(selectorStart)` (:46-60); parse the same three blocks it parses (`:root {`, the explicit dark runtime block, the `@media (prefers-color-scheme: dark)` block).

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOCUS_BACKDROP_ALLOWLIST } from "./_focusBackdropAllowlist";
// relLuminance / contrast / blend / tokenIn / block copied per above.

const css = readFileSync("app/globals.css", "utf8");
const lightBlock = block(":root {");
const darkBlock = block(':root:not([data-theme="light"]) {');

const ringDecls = [...css.matchAll(/--color-focus-ring-runtime:\s*([^;]+);/g)]
  .map((m) => (m[1] ?? "").trim());
const darkRing = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(ringDecls[1] ?? "");

describe("focus ring contrast (spec 2026-08-01 §3)", () => {
  it("three declarations: light pin + identical dark pair", () => {
    expect(ringDecls).toHaveLength(3);
    expect(ringDecls[0]?.toUpperCase()).toBe("#E06000"); // oracle 1: ratification pin
    expect(ringDecls[1]).toBe(ringDecls[2]);             // oracle 2: dark-pair identity
  });
  for (const token of FOCUS_BACKDROP_ALLOWLIST) {
    it(`ring >= 3.0 on --color-${token} in both modes`, () => {
      const light = tokenIn(lightBlock, `--color-${token}-runtime`);
      const dark = tokenIn(darkBlock, `--color-${token}-runtime`);
      expect(contrast("#E06000", light)).toBeGreaterThanOrEqual(3.0); // oracle 3
      if (darkRing === null) throw new Error("dark ring is not rgba()");
      const hex =
        "#" + [darkRing[1], darkRing[2], darkRing[3]]
          .map((c) => Number(c ?? "0").toString(16).padStart(2, "0")).join("");
      expect(contrast(blend(hex, Number(darkRing[4] ?? "1"), dark), dark)).toBeGreaterThanOrEqual(3.0);
    });
  }
});
```

- [ ] **Step 2: Run — verify RED.** `pnpm vitest run tests/styles/focusRingContrast.test.ts`. Expected failures: oracle 1 (light is `rgba(255, 140, 26, 0.55)`) AND the `info-bg` light floor (2.9976 < 3.0).
- [ ] **Step 3: Edit `app/globals.css`:** light `--color-focus-ring-runtime: #E06000;`, light `--color-info-bg-runtime: #f1ede7;` (both dark declarations untouched).
- [ ] **Step 4: Update `DESIGN.md`** rows + §1.2 focus-ring row (figures from spec §3 table).
- [ ] **Step 5: Run — GREEN**, plus `pnpm vitest run tests/styles tests/help` (info-bg text pairs improve, must stay green).
- [ ] **Step 6: Commit** — `fix(crew-page): focus-ring #E06000 + info-bg #F1EDE7 light tokens with contrast meta-test`

### Task 2: Default transition duration alias

**Files:**
- Modify: `app/globals.css` `@theme` (~:234, beside the `--transition-duration-*` aliases)
- Modify: `tests/design/durationTokenEmission.test.ts`

- [ ] **Step 1: Extend the compiler-output test** (reuse its existing compile helper): compile fixture markup `<div class="transition-colors">` (no duration class) and assert (a) the emitted `.transition-colors` rule takes `transition-duration` through `var(--default-transition-duration)`, (b) the emitted theme layer sets `--default-transition-duration: var(--duration-fast)`.
- [ ] **Step 2: Run — verify RED, corrected red-state (plan R1):** Tailwind ALREADY emits through `var(--default-transition-duration)` with default `150ms`, so assertion (a) is green from day one (it is the future-Tailwind regression net) and ONLY assertion (b) fails today.
- [ ] **Step 3: Add** `--default-transition-duration: var(--duration-fast);` to `@theme` with a comment in the alias-block style.
- [ ] **Step 4: Run — GREEN.** Reduced-motion collapse propagates via the existing `--duration-*` zeroing (already covered in that file).
- [ ] **Step 5: Commit** — `fix(crew-page): alias --default-transition-duration to duration-fast`

### Task 3: Offset probes (red) → guard → sweep (green)

**Files:**
- Modify: `tests/e2e/picker-flow.spec.ts` (probe A), `tests/e2e/attention-modal-gallery.spec.ts` (probe B)
- Create: tests/styles/noBareRingOffset.test.ts
- Modify: the 76 non-REGISTRY rows of the sweep table below (incl. `components/admin/ReSyncButton.tsx` DISMISS_BUTTON split and `components/admin/dev/SwitcherControls.tsx` outline migration)
- Modify: component tests asserting old literals (grep each touched file's tests for `ring-offset-2`; update in the same commit)

**Interfaces — Consumes:** `FOCUS_BACKDROP_ALLOWLIST` (Task 1).

- [ ] **Step 1: Write probe A (RED).** In `tests/e2e/picker-flow.spec.ts`, where the claimed roster row renders, following the donor pattern at `tests/e2e/section-header-layout.layout.spec.ts:1455` (`emulateMedia({ reducedMotion: "reduce" })`, set `data-theme="dark"` via `evaluate`, `keyboard.press("Tab")` until the row control carries keyboard-visible focus, then read inside ONE evaluate):

```ts
const probe = await row.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    offsetColor: cs.getPropertyValue("--tw-ring-offset-color").trim(),
    expected: getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
  };
});
expect(probe.offsetColor).toBe(probe.expected); // exact match; sweep-table row says bg (dark #0f1014)
```

- [ ] **Step 2: Write probe B (regression pin; may already be GREEN).** In the gallery spec under `gotoScenario(page, "t2-ignored-warnings")`, Tab-focus a `DataQualityWarningControls` confirm-go control and assert its `--tw-ring-offset-color` equals the document's computed `--color-surface` with `data-theme="dark"` — pins a REGISTRY-lane site's rendered value (the guard trusts the file; this proves the compile).
- [ ] **Step 3: Run probe A — RED** (bare offset resolves `#fff`). Run probe B — record its state in the commit body.
- [ ] **Step 4: Write the guard** — full body (structure the per-line check as an exported `lineViolations(rel, text)` so the walker AND the fixture cases share one predicate):

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOCUS_BACKDROP_ALLOWLIST } from "./_focusBackdropAllowlist";

const ROOTS = ["app", "components"];
const INDIRECTION_REGISTRY: Record<string, string> = {
  "components/shared/ReportButton.tsx": "RING_OFFSET_CLASS map",
  "components/shared/AccentButton.tsx": "RING_OFFSET_CLASS map + doc comment",
  "components/crew/CrewSubNav.tsx": "split adjacent literals",
  "components/admin/PerShowActionableWarnings.tsx": "linkOffsetClass",
  "components/admin/SheetIconLink.tsx": "BACKDROP_SKIN map",
  "components/admin/DataQualityWarningControls.tsx": "RING_OFFSET map",
};
const COMMENT = /^\s*(\/\/|\*|\{\/\*)/;
const OFFSET = /((?:[\w-]+:)*)ring-offset-2(?![\w-])/g;
const FOCUS_OUTLINE_ACCENT = /((?:[\w-]+:)*)outline-accent(?![\w-])/g;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Violation = { site: string; reason: string };
export function lineViolations(rel: string, text: string, lineNo: number): Violation[] {
  const out: Violation[] = [];
  if (COMMENT.test(text)) return out;
  const site = `${rel}:${lineNo}`;
  if (text.includes("ring-offset-[")) {
    out.push({ site, reason: "arbitrary ring-offset value (banned, spec 4.3)" });
    return out;
  }
  for (const hit of text.matchAll(FOCUS_OUTLINE_ACCENT)) {
    if ((hit[1] ?? "").includes("focus")) out.push({ site, reason: "focus-prefixed outline-accent (spec 2.1)" });
  }
  for (const hit of text.matchAll(OFFSET)) {
    const chain = hit[1] ?? "";
    const companion = new RegExp(
      `(?:^|[\\s"'\`])${esc(chain)}ring-offset-(${FOCUS_BACKDROP_ALLOWLIST.join("|")})(?![\\w-])`,
    );
    if (companion.test(text)) continue;
    if (rel in INDIRECTION_REGISTRY) continue;
    out.push({ site, reason: `bare ring-offset-2 (chain "${chain}")` });
  }
  return out;
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

describe("no bare ring-offset-2 / no focus outline-accent (spec 4.3)", () => {
  it("tree is clean", () => {
    const all: Violation[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root, [])) {
        const rel = file.split("\\").join("/");
        readFileSync(file, "utf8").split("\n").forEach((text, i) => {
          all.push(...lineViolations(rel, text, i + 1));
        });
      }
    }
    expect(all).toEqual([]);
  });
  const cases: Array<[string, string, boolean]> = [
    ["a.tsx", 'className="focus-visible:ring-offset-2"', true],
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-text"', true],
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-garbage"', true],
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-[garbage]"', true],
    ["a.tsx", 'className="peer-focus-visible:ring-offset-2 focus-visible:ring-offset-surface"', true],
    ["a.tsx", "className={`focus-visible:ring-offset-2 ${x}`}", true],
    ["a.tsx", 'className="focus-visible:outline-accent"', true],
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-surface"', false],
    ["components/shared/ReportButton.tsx", "className={`focus-visible:ring-offset-2 ${offsetClass}`}", false],
  ];
  for (const [rel, text, expected] of cases) {
    it(`predicate: ${text.slice(0, 58)} -> ${String(expected)}`, () => {
      expect(lineViolations(rel, text, 1).length > 0).toBe(expected);
    });
  }
});
```

- [ ] **Step 5: Run guard — RED**; diff the printed sites against the sweep table below. Mismatch = investigate before editing.
- [ ] **Step 6: Execute the sweep table.** Every non-REGISTRY row gets its same-chain companion literal appended. Special rows: `Step3SheetCard.tsx:122` → `peer-focus-visible:ring-offset-surface`; ReSyncButton — remove the offset-color leg from `DISMISS_BUTTON` (:165); its TWO consumers get per-site legs: warning error overlay (~:375) `focus-visible:ring-offset-warning-bg`, info success overlay (~:455) `focus-visible:ring-offset-info-bg`; SwitcherControls — three `focus-visible:outline-accent` (:28, :100, :120) → `focus-visible:outline-focus-ring`.
- [ ] **Step 7: Run guard — GREEN; probes A and B — GREEN.** Update component-test literals in the same commit.
- [ ] **Step 8: Commit** — `fix(crew-page): container-matched ring-offset colors tree-wide + structural guard (spec 4.2/4.3)` — body carries the six CALLER-UNKNOWN sites (spec §10 enumeration) and probe B's Step-3 state.

**Sweep table (authoritative worklist, decided at plan time; 84 rows; counts: surface 29, bg 24, warning-bg 7, surface-sunken 6, CALLER-UNKNOWN→surface 6, surface-raised 4, REGISTRY 8, info-bg 0):**

| file:line | chain | token |
|---|---|---|
| app/admin/show/staged/[stagedId]/page.tsx:260 | focus-visible: | bg |
| app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:176 | focus-visible: | bg |
| app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:94 | focus-visible: | bg |
| app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:106 | focus-visible: | bg |
| app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:117 | focus-visible: | bg |
| app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:124 | focus-visible: | bg |
| components/admin/AcceptChangeButton.tsx:50 | focus-visible: | CALLER-UNKNOWN → surface |
| components/admin/ArchivedShowRow.tsx:83 | focus-visible: | surface |
| components/admin/CleanupAbandonedFinalizeButton.tsx:83 | focus-visible: | bg |
| components/admin/CleanupAbandonedFinalizeButton.tsx:187 | focus-visible: | surface-raised |
| components/admin/CleanupAbandonedFinalizeButton.tsx:196 | focus-visible: | surface-raised |
| components/admin/DashboardBucketSegmentedControl.tsx:36 | focus-visible: | surface-sunken |
| components/admin/DashboardFooter.tsx:35 | focus-visible: | bg |
| components/admin/FinalizeButton.tsx:786 | focus-visible: | bg |
| components/admin/FinalizeButton.tsx:815 | focus-visible: | bg |
| components/admin/FinalizeButton.tsx:937 | focus-visible: | CALLER-UNKNOWN → surface (sole caller has no production mount) |
| components/admin/FinalizeButton.tsx:1115 | focus-visible: | surface-raised |
| components/admin/HelpAffordance.tsx:97 | focus-visible: | CALLER-UNKNOWN → surface |
| components/admin/HelpAffordance.tsx:111 | focus-visible: | CALLER-UNKNOWN → surface |
| components/admin/HelpSheet.tsx:75 | focus-visible: | bg |
| components/admin/HelpSheet.tsx:145 | focus-visible: | surface |
| components/admin/HelpTooltip.tsx:60 | focus-visible: | surface-raised |
| components/admin/IgnoredSheetsDisclosure.tsx:68 | focus-visible: | bg |
| components/admin/MaintenanceResetButtons.tsx:188 | focus-visible: | surface |
| components/admin/MaintenanceResetButtons.tsx:235 | focus-visible: | surface |
| components/admin/MaintenanceResetButtons.tsx:288 | focus-visible: | warning-bg |
| components/admin/MaintenanceResetButtons.tsx:298 | focus-visible: | warning-bg |
| components/admin/MaintenanceResetButtons.tsx:308 | focus-visible: | warning-bg |
| components/admin/MaintenanceResetButtons.tsx:339 | focus-visible: | surface-sunken |
| components/admin/MaintenanceResetButtons.tsx:349 | focus-visible: | surface-sunken |
| components/admin/Mi11GateActions.tsx:76 | focus-visible: | surface |
| components/admin/Mi11GateActions.tsx:77 | focus-visible: | surface |
| components/admin/NeedsAttentionInbox.tsx:28 | focus-visible: | surface |
| components/admin/OnboardingWizard.tsx:103 | focus-visible: | bg |
| components/admin/OnboardingWizard.tsx:128 | focus-visible: | bg |
| components/admin/PerShowAlertResolveButton.tsx:94 | focus-visible: | warning-bg |
| components/admin/PreviewBanner.tsx:117 | focus-visible: | warning-bg |
| components/admin/ReapStaleSessionsButton.tsx:108 | focus-visible: | surface |
| components/admin/ReapStaleSessionsButton.tsx:137 | focus-visible: | warning-bg |
| components/admin/ReapStaleSessionsButton.tsx:146 | focus-visible: | warning-bg |
| components/admin/RecentAutoAppliedStrip.tsx:485 | focus-visible: | surface |
| components/admin/StagedReviewCard.tsx:470 | focus-visible: | surface-sunken |
| components/admin/UndoChangeButton.tsx:55 | focus-visible: | surface |
| components/admin/UnignoreButton.tsx:63 | focus-visible: | surface |
| components/admin/settings/AddAdminDisclosure.tsx:31 | focus-visible: | bg |
| components/admin/settings/DriveConnectionPanel.tsx:251 | focus-visible: | surface |
| components/admin/settings/DriveConnectionPanel.tsx:284 | focus-visible: | surface |
| components/admin/settings/NotifyToggle.tsx:133 | focus-visible: | surface |
| components/admin/telemetry/HealthAlertResolveButton.tsx:28 | focus-visible: | surface |
| components/admin/telemetry/HealthAlertsPanel.tsx:152 | focus-visible: | surface |
| components/admin/telemetry/HealthAlertsPanel.tsx:258 | focus-visible: | bg |
| components/admin/wizard/Step1Share.tsx:94 | focus-visible: | surface |
| components/admin/wizard/Step1Share.tsx:122 | focus-visible: | bg |
| components/admin/wizard/Step1Share.tsx:180 | focus-visible: | surface |
| components/admin/wizard/Step1Share.tsx:196 | focus-visible: | bg |
| components/admin/wizard/Step1Share.tsx:232 | focus-visible: | bg |
| components/admin/wizard/Step2Verify.tsx:119 | focus-visible: | CALLER-UNKNOWN → surface |
| components/admin/wizard/Step2Verify.tsx:124 | focus-visible: | CALLER-UNKNOWN → surface |
| components/admin/wizard/Step2Verify.tsx:366 | focus-visible: | surface |
| components/admin/wizard/Step2Verify.tsx:402 | focus-visible: | surface |
| components/admin/wizard/Step2Verify.tsx:509 | focus-visible: | surface-sunken |
| components/admin/wizard/Step2Verify.tsx:559 | focus-visible: | surface-sunken |
| components/admin/wizard/Step2Verify.tsx:598 | focus-visible: | bg |
| components/admin/wizard/Step3ReviewWithFinalize.tsx:146 | focus-visible: | bg |
| components/admin/wizard/Step3ReviewWithFinalize.tsx:251 | focus-visible: | bg |
| components/admin/wizard/Step3SheetCard.tsx:122 | peer-focus-visible: | surface |
| components/admin/wizard/Step3SheetCard.tsx:159 | focus-visible: | surface |
| components/admin/wizard/Step3SheetCard.tsx:578 | focus-visible: | surface |
| components/admin/wizard/step3ReviewSections.tsx:765 | focus-visible: | surface |
| components/admin/wizard/step3ReviewSections.tsx:1922 | focus-visible: | surface |
| components/admin/wizard/step3ReviewSections.tsx:3064 | focus-visible: | surface |
| components/admin/wizard/step3ReviewSections.tsx:3266 | focus-visible: | surface |
| components/admin/wizard/step3ReviewSections.tsx:3288 | focus-visible: | surface |
| components/admin/wizard/step3ReviewSections.tsx:3486 | focus-visible: | surface |
| components/auth/IdentityChip.tsx:62 | focus-visible: | bg |
| components/auth/TerminalFailure.tsx:57 | focus-visible: | bg |
| components/admin/DataQualityWarningControls.tsx:20 | focus-visible: | REGISTRY |
| components/admin/PerShowActionableWarnings.tsx:282 | focus-visible: | REGISTRY |
| components/admin/SheetIconLink.tsx:74 | focus-visible: | REGISTRY |
| components/crew/CrewSubNav.tsx:87 | focus-visible: | REGISTRY |
| components/shared/AccentButton.tsx:51 | (doc comment — DO NOT EDIT) | REGISTRY |
| components/shared/AccentButton.tsx:101 | focus-visible: | REGISTRY |
| components/shared/ReportButton.tsx:100 | focus-visible: | REGISTRY |
| components/shared/ReportButton.tsx:101 | focus-visible: | REGISTRY |

Line numbers are drafting-time locators (they rot); the guard's red output at Step 5 is the executable worklist. Prop-union note: every non-registry row takes a LITERAL — do not reroute through the component offset unions (ReportButton's RingOffset lacks surface-raised; SheetIconLink's is bg|surface only; AccentButton's lacks surface-sunken).

### Task 4: Ignored (N) tap floor

**Files:**
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (`<summary>` ~:272)
- Test: `tests/e2e/attention-modal-gallery.spec.ts` (t2-ignored-warnings scenario opened ~:588)

- [ ] **Step 1: Failing browser assertion:**

```ts
await gotoScenario(page, "t2-ignored-warnings");
const summary = page.locator('[data-testid^="section-ignored-summary-"]').first();
await expect(summary).toBeVisible();
const box = await summary.boundingBox();
if (box === null) throw new Error("summary not rendered");
expect(box.height).toBeGreaterThanOrEqual(44);
```

Failure mode caught: token drift or a competing rule — invisible to a class-string check.

- [ ] **Step 2: Run — RED** (text-xs row measures well under 44). Use the gallery spec's documented local run (dev-build project, :3001).
- [ ] **Step 3: Fix** — append `min-h-tap-min inline-flex items-center` to the summary literal.
- [ ] **Step 4: Run — GREEN.** Optional unit companion for the literal.
- [ ] **Step 5: Commit** — `fix(admin): Ignored (N) summary meets 44px tap floor`

### Task 5: Switcher bar at 390px — single-row min-width solution

**Files:**
- Modify: `components/admin/dev/SwitcherControls.tsx`
- Test: `tests/e2e/attention-modal-gallery.spec.ts`

**Plan-time mechanism decision (spec §7.1 requires it recorded here):** SINGLE ROW retained — the host spec already asserts the collapsed bar is single-row and ≤64px tall, so `flex-wrap` is off the table. Classes: counter span gains `shrink-0 tabular-nums`; scenario label keeps `truncate` and gains `min-w-12` (48px floor); the group keeps `min-w-0 flex-1`. The existing single-row/height and modal-overlap assertions stay untouched and must not regress.

- [ ] **Step 1: Add missing hooks** — `data-testid="attention-switcher-counter"` (counter span), `"attention-switcher-label"` (scenario label), `"attention-switcher-prev"` / `"attention-switcher-next"` (the STEP_BTN pair). Existing: `attention-switcher-controls`, `-group-select`, `-excluded-toggle`.
- [ ] **Step 2: Failing 390×844 assertions** (exclusions present so all six clusters render):

```ts
await page.setViewportSize({ width: 390, height: 844 });
const bar = page.locator('[data-testid="attention-switcher-controls"]');
expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true); // no overflow
const ids = ["attention-switcher-prev", "attention-switcher-next", "attention-switcher-counter",
  "attention-switcher-label", "attention-switcher-group-select", "attention-switcher-excluded-toggle"];
for (const id of ids) {
  const box = await page.locator(`[data-testid="${id}"]`).boundingBox();
  if (box === null) throw new Error(`${id} not rendered`);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390); // containment (boundingBox exposes x/width)
  expect(box.width).toBeGreaterThan(0);
}
const counter = page.locator('[data-testid="attention-switcher-counter"]');
expect(await counter.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true); // untruncated
const label = await page.locator('[data-testid="attention-switcher-label"]').boundingBox();
if (label === null) throw new Error("label not rendered");
expect(label.width).toBeGreaterThanOrEqual(48);
for (const id of ["attention-switcher-prev", "attention-switcher-next",
  "attention-switcher-group-select", "attention-switcher-excluded-toggle"]) {
  const box = await page.locator(`[data-testid="${id}"]`).boundingBox();
  if (box === null) throw new Error(`${id} not rendered`);
  expect(box.height).toBeGreaterThanOrEqual(44);
}
```

- [ ] **Step 3: Run — RED** (counter/label measure 0 today).
- [ ] **Step 4: Apply the decided classes** (`shrink-0 tabular-nums` counter, `min-w-12` label; hooks from Step 1).
- [ ] **Step 5: Run — GREEN**, including the pre-existing single-row/64px and modal-overlap assertions and a desktop-viewport case.
- [ ] **Step 6: Commit** — `fix(admin): switcher counter/label keep readable width at 390px`

### Task 6: Ledger graduation + close-out gates

**TDD declaration:** docs-only ledger task — invariant 1's failing-test step intentionally waived (no behavior change); the oracle is the graduation meta-test, which rejects terminal-status leftovers in BACKLOG.md.

- [ ] **Step 1:** Graduate the five rows (`BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`) to `BACKLOG-archive.md`; update the reconciliation header; the two announcement rows stay. Run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` — GREEN.
- [ ] **Step 2:** Full local suite + `pnpm lint` + `pnpm typecheck` + `pnpm vitest list tests/styles` (confirms the two new files are collected under the existing include).
- [ ] **Step 3:** Impeccable dual-gate on the diff (invariant 8); P0/P1 fixed or DEFERRED.md.
- [ ] **Step 4:** Commit — `docs(plan): graduate five Cluster A rows to BACKLOG-archive`
- [ ] **Step 5: Explicit non-PR e2e dispatch.** The gallery spec runs under `dev-gate-e2e.yml` (workflow_dispatch + daily schedule ONLY): after push, `gh workflow run dev-gate-e2e.yml --ref fix/focus-ring-a11y-pass` and require green BEFORE merge. The picker probe rides `crew-e2e.yml`, which IS PR-triggered.
- [ ] **Step 6:** Whole-diff Codex review (fresh-eyes; split tight-scope briefs if the diff is large) → push → PR CI green AND dispatched dev-gate green → `gh pr merge --merge` → ff main → `git rev-list --left-right --count main...origin/main` == `0 0`.
