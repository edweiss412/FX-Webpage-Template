# Focus-Ring A11y Mechanical Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec `docs/superpowers/specs/2026-08-01-focus-ring-a11y-pass-design.md` (adversarially APPROVED R6): light focus-ring token `#E06000`, light info-bg nudge `#F1EDE7`, bare `ring-offset-2` sweep with structural guard, `--default-transition-duration` alias, Ignored(N) tap floor, switcher-bar 390px fix.

**Architecture:** Two token edits in `app/globals.css` runtime blocks; a shared backdrop-allowlist module imported by BOTH new style meta-tests (allowlist=matrix identity by construction); a filesystem-walked guard; a mechanical class sweep; two Playwright surfaces extended.

**Tech Stack:** Vitest (tests/styles pattern per `tests/styles/status-token-contrast.test.ts`), Playwright (`tests/e2e/*`), Tailwind v4 `@theme` runtime-var pattern.

## Global Constraints

- TDD per task; commit per task, conventional-commits (`fix(...)`, `test(...)`, `docs(...)`) — AGENTS.md invariants 1, 6.
- UI diff ships only after `/impeccable critique` + `/impeccable audit` (invariant 8) — run at close-out, before whole-diff review.
- No em-dashes in user-visible copy; 44px tap floor `min-h-tap-min` (`--spacing-tap-min: 44px`, `app/globals.css:162`).
- Spec §1.1 fences are binding: no offset add/remove; Option B `#E06000` pinned; info-bg nudge `#F1EDE7` pinned; arbitrary `ring-offset-[…]` banned.
- No DB, no advisory locks, no §12.4 codes, no new mutation surfaces (invariants 2, 5, 10: N/A — declared).

**Meta-test inventory (declared):** CREATES tests/styles/focusRingContrast.test.ts, tests/styles/noBareRingOffset.test.ts, shared module tests/styles/_focusBackdropAllowlist.ts; EXTENDS `tests/design/durationTokenEmission.test.ts`, `tests/e2e/attention-modal-gallery.spec.ts`. None of the auth/DB/alert registries applies (no such surface touched — declared per writing-plans rule).

**Mutation-family closure for the §4.3 guard** (review converges against THIS set, new families need a live escaping mutant): (1) bare offset, no companion; (2) companion token outside the backdrop allowlist (`ring-offset-text`); (3) non-emitting spelling (`ring-offset-garbage`); (4) any arbitrary value (`ring-offset-[garbage]`, `ring-offset-[var(--color-text)]`); (5) companion under a mismatched variant chain (`focus-visible:` offset + `peer-focus-visible:` companion or vice versa); (6) unregistered indirection file; (7) focus-prefixed `outline-accent`.

**e2e harness readiness:** both e2e tasks extend EXISTING spec files that already boot (attention gallery) or use the existing live-entry toolchain (`tests/e2e/helpers/liveEntryToolchain.ts`); readiness gates and detach-safety follow the host file's established pattern — no new server-boot mechanism is introduced.

---

### Task 1: Token changes + contrast meta-test

**Files:**
- Create: tests/styles/_focusBackdropAllowlist.ts
- Create: tests/styles/focusRingContrast.test.ts
- Modify: `app/globals.css` (light `--color-focus-ring-runtime` at ~:310; light `--color-info-bg-runtime` at ~:307)
- Modify: `DESIGN.md` §1.1 rows for `--color-focus-ring` and `--color-info-bg`; §1.2 gains a focus-ring row

**Interfaces — Produces:** `export const FOCUS_BACKDROP_ALLOWLIST = ["surface","surface-raised","surface-sunken","bg","warning-bg","info-bg","stale-tint","accent-tint","danger-bg"] as const;` (Task 3 imports it.)

- [ ] **Step 1: Write the allowlist module + failing meta-test**

tests/styles/_focusBackdropAllowlist.ts:

```ts
export const FOCUS_BACKDROP_ALLOWLIST = [
  "surface", "surface-raised", "surface-sunken", "bg",
  "warning-bg", "info-bg", "stale-tint", "accent-tint", "danger-bg",
] as const;
export type FocusBackdrop = (typeof FOCUS_BACKDROP_ALLOWLIST)[number];
```

tests/styles/focusRingContrast.test.ts — follow `tests/styles/status-token-contrast.test.ts` construction (read `app/globals.css` source, parse runtime declarations). Three oracles per spec §3:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOCUS_BACKDROP_ALLOWLIST } from "./_focusBackdropAllowlist";

const css = readFileSync("app/globals.css", "utf8");

function decls(name: string): string[] {
  return [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].map((m) => {
    const v = m[1];
    if (v === undefined) throw new Error(`unmatched decl for ${name}`);
    return v.trim();
  });
}
// hexToRgb / alphaComposite / relativeLuminance / contrastRatio: lift verbatim
// from status-token-contrast.test.ts (same math, same rounding posture).

describe("focus ring contrast (spec 2026-08-01 §3)", () => {
  const ring = decls("--color-focus-ring-runtime");
  it("has exactly three declarations: light pin + identical dark pair", () => {
    expect(ring).toHaveLength(3);
    expect(ring[0]).toBe("#E06000"); // oracle 1: ratification pin (opaque)
    expect(ring[1]).toBe(ring[2]);   // oracle 2: dark-pair identity
  });
  for (const token of FOCUS_BACKDROP_ALLOWLIST) {
    it(`ring >= 3.0 on --color-${token} in both modes`, () => {
      // oracle 3: light = ratio(#E06000, lightHex(token));
      // dark = ratio(composite(darkRingRgba over darkHex(token)), darkHex(token));
      // both computed from the live file, expected side is only the 3.0 floor.
    });
  }
});
```

The `it` bodies compute from parsed values — no hardcoded ratios (anti-tautology: catches a backdrop hex drift or ring drift; fails today because light ring is `rgba(255, 140, 26, 0.55)` and light info-bg is `#eeeae3` at 2.9976:1).

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/styles/focusRingContrast.test.ts`. Expected: FAIL on the `#E06000` pin (light value is the rgba) AND on the info-bg floor.
- [ ] **Step 3: Edit `app/globals.css`** — light `--color-focus-ring-runtime: #E06000;` (root runtime block only; both dark declarations untouched); light `--color-info-bg-runtime: #f1ede7;`.
- [ ] **Step 4: Update `DESIGN.md`** — focus-ring row (new light value, §3 figures, pointer to the meta-test), info-bg row (`#F1EDE7`), §1.2 focus-ring contrast row.
- [ ] **Step 5: Run** — meta-test PASSES; also `pnpm vitest run tests/styles tests/help` (help-prose info-bg pairs must still pass — they improve).
- [ ] **Step 6: Commit** — `fix(crew-page): focus-ring #E06000 + info-bg #F1EDE7 light tokens with contrast meta-test`

### Task 2: Default transition duration alias

**Files:**
- Modify: `app/globals.css` `@theme` block (beside `--transition-duration-*` aliases at ~:234)
- Modify: `tests/design/durationTokenEmission.test.ts`

- [ ] **Step 1: Extend the compiler-output test.** In `durationTokenEmission.test.ts` (it already compiles Tailwind against fixture markup — reuse its compile helper), add a case: fixture `<div class="transition-colors">` (NO duration class); assert the emitted CSS for `.transition-colors` (or the compiled utility layer) sets `transition-duration` through `var(--default-transition-duration)` AND that `@theme`'s emitted `--default-transition-duration` resolves to `var(--duration-fast)`. Concrete failure mode: alias missing (today) → the emitted default is the literal `.15s`; a future Tailwind that stops consuming the namespace also fails the first assertion.
- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/design/durationTokenEmission.test.ts`. Expected: FAIL (`.15s` literal, no var).
- [ ] **Step 3: Add to `@theme`:** `--default-transition-duration: var(--duration-fast);` (one line, beside the existing aliases with a comment mirroring the alias-block comment style).
- [ ] **Step 4: Run** — PASSES. Reduced-motion propagation is inherited via the existing `--duration-*` zeroing block (already covered by the file's existing cases).
- [ ] **Step 5: Commit** — `fix(crew-page): alias --default-transition-duration to duration-fast (bare transition-* sites join reduced-motion collapse)`

### Task 3: Bare-offset guard + full sweep + outline migration

**Files:**
- Create: tests/styles/noBareRingOffset.test.ts
- Modify: every file the guard's first red run enumerates (≈84 line-sites / ~40 files; the red output IS the worklist — spec §1.1 mechanism-claim posture)
- Modify: `components/admin/ReSyncButton.tsx` (DISMISS_BUTTON split), `components/admin/dev/SwitcherControls.tsx` (3 × `outline-accent` → `outline-focus-ring`)
- Modify: component tests asserting `ring-offset-2` literals (e.g. `ResetPickerEpochButton` tests) — update literals alongside

**Interfaces — Consumes:** `FOCUS_BACKDROP_ALLOWLIST` from Task 1.

- [ ] **Step 1: Write the guard** per spec §4.3, using `tests/styles/_classScanUtils.ts` walk helpers where they fit:

```ts
import { describe, expect, it } from "vitest";
import { FOCUS_BACKDROP_ALLOWLIST } from "./_focusBackdropAllowlist";

// Indirection registry: file-scoped trust (spec §4.3 rule 2).
const INDIRECTION_REGISTRY: Record<string, string> = {
  "components/shared/ReportButton.tsx": "RING_OFFSET_CLASS map",
  "components/shared/AccentButton.tsx": "RING_OFFSET_CLASS map",
  "components/crew/CrewSubNav.tsx": "split adjacent literals",
  "components/admin/PerShowActionableWarnings.tsx": "linkOffsetClass",
  "components/admin/SheetIconLink.tsx": "BACKDROP_SKIN map",
  "components/admin/DataQualityWarningControls.tsx": "RING_OFFSET map",
};
const COMPANION = new RegExp(
  `ring-offset-(${FOCUS_BACKDROP_ALLOWLIST.join("|")})(?![-\\w])`,
);
// Per line: skip comments (trimmed ^// ^* ^{/*). For each occurrence of
// `((?:[\\w-]+:)*)ring-offset-2(?![\\w-])` capture the variant chain; a line
// passes iff a COMPANION with the SAME captured chain exists on the line,
// OR the file is in INDIRECTION_REGISTRY. `ring-offset-[` anywhere = hard fail.
// Second tripwire: /(?:[\w-]+:)*outline-accent(?![\w-])/ where chain contains a focus variant = fail.
```

Include the mutant self-checks as fixture strings inside the test (families 2–5 of the closure set above each get an `expect(isViolation(...)).toBe(true)` row) so the guard's own predicate is pinned.

- [ ] **Step 2: Run to verify it fails** — output enumerates every bare line (expected ≈84). Save the list into the commit body's tail.
- [ ] **Step 3: Sweep.** Per printed line, add the same-variant-chain companion per spec §4.2 (backdrop the offset gap cuts into: `bg-surface` container → `ring-offset-surface`; page ground → `ring-offset-bg`; warning/info/sunken fills → matching token; caller-unknown shared primitive → `ring-offset-surface` + note the file in the commit body per spec §10). Specifics ratified by spec: `_PickerInterstitial.tsx` claimed row → `focus-visible:ring-offset-surface`; `Step3SheetCard.tsx` → `peer-focus-visible:ring-offset-<backdrop>`; ReSyncButton: remove the offset-color leg from `DISMISS_BUTTON`, append `focus-visible:ring-offset-warning-bg` at the two warning-overlay call sites and `focus-visible:ring-offset-info-bg` at the info-overlay call site; SwitcherControls: three `focus-visible:outline-accent` → `focus-visible:outline-focus-ring`.
- [ ] **Step 4: Run guard** — PASSES. Run the touched components' unit suites; update any test literal asserting the old class strings in the same commit.
- [ ] **Step 5: Browser probes (spec §8 row 4).** In the picker e2e (seed via `tests/e2e/helpers/seedPickerCookie.ts` / `seedShowWithCrew.ts` like its host spec) and a confirm-go e2e site, dark mode: `getComputedStyle(el).getPropertyValue("--tw-ring-offset-color")` (or `ringOffsetColor` where exposed) EQUALS the site's backdrop computed color — exact `rgb(...)` equality, not ≠white. Follow the host spec's hydration gate before asserting.
- [ ] **Step 6: Commit** — `fix(crew-page): container-matched ring-offset colors tree-wide + structural guard (spec 4.2/4.3)`

### Task 4: Ignored (N) tap floor

**Files:**
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (`<summary>` at ~:272)
- Test: extend whichever e2e/live-entry spec already renders section warning extras (locate via `rg -l "sectionWarningExtras|Ignored (" tests/e2e tests/components`); if none renders it in a browser, add a live-entry harness per the `tests/e2e/_*LiveEntry.tsx` + `tests/e2e/helpers/liveEntryToolchain.ts` pattern

- [ ] **Step 1: Failing browser assertion** — render the section with ≥1 ignored warning; `expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44)`. Concrete failure mode: catches token drift or a competing max-height rule, which the class-string check cannot.
- [ ] **Step 2: Run — FAIL** (current text-xs row measures well under 44).
- [ ] **Step 3: Fix** — add `min-h-tap-min inline-flex items-center` to the summary class literal (keep existing classes).
- [ ] **Step 4: Run — PASS.** Optional unit companion asserting the literal contains `min-h-tap-min`.
- [ ] **Step 5: Commit** — `fix(admin): Ignored (N) summary meets 44px tap floor`

### Task 5: Switcher bar at 390px

**Files:**
- Modify: `components/admin/dev/SwitcherControls.tsx` (counter/label group at ~:89-93)
- Test: `tests/e2e/attention-modal-gallery.spec.ts` (existing boot + readiness pattern)

- [ ] **Step 1: Failing 390×844 assertions** per spec §7.1, with exclusions present so all six clusters render (Prev, Next, counter/label group, jump select, tier control, excluded toggle):

```ts
// bar: no horizontal overflow
expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
// each cluster: containment + nonzero
for (const rect of clusterRects) {
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(390);
  expect(rect.width).toBeGreaterThan(0);
}
// counter untruncated; label readable; controls >= 44 tall
expect(await counter.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
expect(labelRect.width).toBeGreaterThanOrEqual(48);
for (const c of controlRects) expect(c.height).toBeGreaterThanOrEqual(44);
```

- [ ] **Step 2: Run — FAIL** (counter/label measure 0 today).
- [ ] **Step 3: Fix** — implementer picks min-width floor on the counter/label group, `flex-wrap` on the bar, or both (single-line requirement dropped per spec §7); record the exact classes in the commit body.
- [ ] **Step 4: Run — PASS**, plus desktop viewport case still green.
- [ ] **Step 5: Commit** — `fix(admin): switcher bar counter/description visible at 390px`

### Task 6: Ledger graduation + close-out gates

**Files:**
- Modify: `BACKLOG.md`, `BACKLOG-archive.md` (graduate `BL-FOCUS-RING-CONTRAST`, `BL-PICKER-ROW-RING-OFFSET-BACKDROP`, `BL-IGNORED-SUMMARY-TAP-TARGET`, `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, `BL-BARE-TRANSITION-NO-DURATION-CLASS`; the two announcement rows STAY)

- [ ] **Step 1:** Move the five entries; update BACKLOG.md's reconciliation header line. Run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` — PASS.
- [ ] **Step 2:** Full local suite + `pnpm lint` + `pnpm typecheck` (strict tsconfig: every pasted snippet above uses guarded index access per `noUncheckedIndexedAccess`).
- [ ] **Step 3:** Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff — invariant 8; P0/P1 fixed or DEFERRED.md.
- [ ] **Step 4:** Commit — `docs(plan): graduate five Cluster A rows to BACKLOG-archive`
- [ ] **Step 5:** Whole-diff Codex review (fresh-eyes, split tight-scope briefs if needed) → push → CI green → `gh pr merge --merge` → ff main → `git rev-list --left-right --count main...origin/main` == `0 0`.

## Reconciliation sweep (run at plan time, per writing-plans rule)

`rg -n "ring-offset-2" app components | grep -cv "ring-offset-surface\|ring-offset-bg\|ring-offset-warning\|ring-offset-accent\|ring-offset-sunken\|ring-offset-\["` → **84** (2026-08-01, line-grep; includes ~6 false-bare lines belonging to the registered indirection files — the guard's registry lane absorbs them; disposition: every OTHER printed line gets a companion in Task 3 Step 3). `rg -n "outline-accent" app components` → 3 lines, all `components/admin/dev/SwitcherControls.tsx` (:28, :100, :120) — all migrated in Task 3. `rg -n "ring-offset-\[" app components` → 0 (ban starts clean).
