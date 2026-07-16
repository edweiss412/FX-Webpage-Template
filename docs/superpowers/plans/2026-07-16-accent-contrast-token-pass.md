# Accent-Contrast Token Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the WCAG contrast token pass ratified in `docs/superpowers/specs/2026-07-16-accent-contrast-token-pass.md` (Codex-APPROVED, 14 rounds): light-mode accent token fixes, `accent-edge` boundary token, eyebrow/raw-accent/tinted-text migrations, TEL-1/TEL-2 telemetry re-tones, and the structural meta-tests that pin the whole class.

**Architecture:** Pure UI/token diff — `app/globals.css` token values + `@theme` alias, ~20 component class-string edits, DESIGN.md figure corrections, three new/extended structural test files, real-browser standalone Playwright proof. No DB, no RPC, no advisory locks, no mutation surfaces.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme` tokens), Vitest, Playwright (standalone harness pattern per `tests/e2e/developer-toggle-layout.spec.ts`).

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-16-accent-contrast-token-pass.md` (all hex values, ratios, and dispositions copied from there verbatim).
- Invariant 1 (TDD per task), invariant 6 (commit per task, conventional commits), invariant 8 (impeccable dual-gate after implementation — session-level, not a plan task).
- New light values: `--color-accent-text-runtime` `#0e0f12`; `--color-accent-on-bg-runtime` `#a65000`; NEW `--color-accent-edge-runtime` light `#7a3d00`, dark `#ffa047` (BOTH dark blocks) + `@theme` alias `--color-accent-edge: var(--color-accent-edge-runtime)`.
- Floors: text 4.5:1, non-text/graphical 3:1; figure-parity tolerance ±0.05.
- Matchers are exact-token + variant-chain-aware; `\b` regexes on hyphenated utilities are BANNED (PR #354 class).
- Before push: `pnpm test`, `pnpm typecheck` (or `next build`), `pnpm lint`, `pnpm format:check`, `pnpm build`.
- Never run prettier on the master spec. Never `echo >>` a file.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/styles/status-token-contrast.test.ts` — accent rows 1–7 + alias pin (spec §6.1 rows 1,2,3,3b,4,5,6,7,10).
- **CREATES** `tests/styles/design-figure-parity.test.ts` — DESIGN.md documented-figure ↔ computed-ratio parity (spec §6.1 row 8).
- **CREATES** `tests/styles/_metaRawAccentText.test.ts` — raw accent TEXT ban + wizard 10px-faint eyebrow scan (spec §4.4a, §4.2).
- **CREATES** `tests/styles/_metaBgAccentInventory.test.ts` — per-occurrence `bg-accent` fill registry (spec §4.1b, meta row 11).
- **NOT extended, with reason:** `tests/styles/_metaDesignTokenPairs.test.ts` (v1 scope note pins it to `app/help/_components` — no help files change); advisory-lock topology (no `pg_advisory*` in scope); `_metaInfraContract` / mutation-surface observability (no Supabase calls, no mutation surfaces — docs+CSS+class strings only).

## File structure

- `app/globals.css` — token values (light block) + accent-edge in all three runtime blocks + `@theme` alias.
- `DESIGN.md` — §1.1 rows (accent, accent-text, accent-on-bg, status-live, accent-tint, NEW accent-edge), §1.2 rows L57–L59, L70 + new accent-edge rows.
- Components (class strings only): 5 toggle files, `OnboardingWizard.tsx`, `step3ReviewSections.tsx` (eyebrow const + 2 hard-coded), `VenueMapTile.tsx`, `CrewSubNav.tsx`, 9 hover-shift link files, 4 decorative-glyph files, `BellPanel.tsx`, `RightNowHero.tsx`, `EventFilters.tsx`, `EventRow.tsx`, `EventLevelBadge.tsx`.
- Tests: 3 new style meta-tests, extended contrast test, new `tests/e2e/toggle-edge-layout.spec.ts` (standalone harness — sibling of `developer-toggle-layout.spec.ts` per spec §6.1/§9.1), swept component tests.

---

### Task 1: Token layer — failing contrast rows, then the token edits

**Files:**
- Modify: `tests/styles/status-token-contrast.test.ts` (append a describe block)
- Modify: `app/globals.css:278-279` (light block), `:325-331` region + `:364-372` region (add accent-edge), `@theme` block near `:56-66` (alias)

**Interfaces:**
- Produces: tokens `--color-accent-edge(-runtime)` consumed by Tasks 3, 6; new hexes consumed by every later assertion.

- [ ] **Step 1: Write the failing rows** — append to `tests/styles/status-token-contrast.test.ts` (reuses the file's `contrast`, `tokenIn`, `block`, `MODES`, `DOT_FLOOR`, `TEXT_FLOOR`):

```ts
// Accent-contrast token pass (spec 2026-07-16-accent-contrast-token-pass §6.1).
// Alpha-blend helper: composite fg over bg at alpha, return hex.
function blend(fg: string, alpha: number, bg: string): string {
  const c = (h: string) => h.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16));
  const f = c(fg);
  const b = c(bg);
  const m = f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]!));
  return "#" + m.map((v) => v.toString(16).padStart(2, "0")).join("");
}

describe("accent token contrast floors (2026-07-16 token pass)", () => {
  const mediaDarkBlock = block("@media (prefers-color-scheme: dark)");

  for (const mode of MODES) {
    const accent = tokenIn(mode.src, "--color-accent-runtime");
    const accentHover = tokenIn(mode.src, "--color-accent-hover-runtime");
    const accentText = tokenIn(mode.src, "--color-accent-text-runtime");
    const accentOnBg = tokenIn(mode.src, "--color-accent-on-bg-runtime");
    const accentTint = tokenIn(mode.src, "--color-accent-tint-runtime");
    const staleTint = tokenIn(mode.src, "--color-stale-tint-runtime");

    it(`${mode.name}: accent-text on accent AND accent-hover clears >=4.5:1 (CTA text)`, () => {
      expect(contrast(accentText, accent)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentText, accentHover)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it(`${mode.name}: accent-on-bg clears >=4.5:1 on bg and surface (links/emphasis)`, () => {
      expect(contrast(accentOnBg, mode.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, mode.surface)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it(`${mode.name}: accent-on-bg AS TEXT clears >=4.5:1 on every audited tinted fill`, () => {
      expect(contrast(accentOnBg, blend(accent, 0.1, mode.bg))).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, blend(accent, 0.15, mode.bg))).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, accentTint)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, staleTint)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }

  it("light: accent-edge clears >=3:1 vs the accent track AND vs bg AND vs surface", () => {
    const light = MODES[0]!;
    const edge = tokenIn(light.src, "--color-accent-edge-runtime");
    const accent = tokenIn(light.src, "--color-accent-runtime");
    expect(contrast(edge, accent)).toBeGreaterThanOrEqual(DOT_FLOOR);
    expect(contrast(edge, light.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
    expect(contrast(edge, light.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
  });

  it("dark: the accent track itself is the >=3:1 toggle boundary (edge is decorative)", () => {
    const dark = MODES[1]!;
    const accent = tokenIn(dark.src, "--color-accent-runtime");
    expect(contrast(accent, dark.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
    expect(contrast(accent, dark.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
  });

  it("accent-edge is wired: @theme alias present, runtime value in ALL three blocks, dark blocks identical", () => {
    expect(css).toMatch(/--color-accent-edge:\s*var\(--color-accent-edge-runtime\)\s*;/);
    const lightVal = tokenIn(block(":root {"), "--color-accent-edge-runtime");
    const mediaVal = tokenIn(mediaDarkBlock, "--color-accent-edge-runtime");
    const explicitVal = tokenIn(block('[data-theme="dark"] {'), "--color-accent-edge-runtime");
    expect(lightVal).toBe("#7a3d00");
    expect(mediaVal).toBe(explicitVal);
    expect(mediaVal).toBe("#ffa047");
  });

  it("status-live-text still aliases accent-on-bg (spec §6.1 row 10)", () => {
    expect(css).toMatch(/--color-status-live-text:\s*var\(--color-accent-on-bg\)\s*;/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/styles/status-token-contrast.test.ts`. Expected: FAIL — `accent-text on accent` light (2.33 < 4.5), `accent-on-bg` rows (4.11 < 4.5), `token --color-accent-edge-runtime not found`.
- [ ] **Step 3: Edit `app/globals.css`** —
  - `:278` `--color-accent-text-runtime: #ffffff;` → `#0e0f12;`
  - `:279` `--color-accent-on-bg-runtime: #c25e00;` → `#a65000;`
  - In the `:root` light runtime block, after the accent-on-bg line add: `--color-accent-edge-runtime: #7a3d00; /* ON-state control boundary; 3.61:1 vs the orange track, 8.06:1 vs bg (WCAG 1.4.11 both-sides) */`
  - In BOTH dark runtime blocks (`@media (prefers-color-scheme: dark)` AND `[data-theme="dark"]`), same position: `--color-accent-edge-runtime: #ffa047; /* decorative in dark — the track itself is 8.16:1 vs bg */`
  - In the `@theme` block after `--color-accent-on-bg`: `--color-accent-edge: var(--color-accent-edge-runtime);`
- [ ] **Step 4: Re-run** — same command. Expected: PASS (all new rows + all pre-existing rows, incl. bell-info-icon with `#a65000`).
- [ ] **Step 5: Commit** — `feat: accent token contrast pass — dark CTA text, #a65000 on-bg, accent-edge boundary token`

### Task 2: DESIGN.md corrections + figure-parity meta-test

**Files:**
- Create: `tests/styles/design-figure-parity.test.ts`
- Modify: `DESIGN.md` L31–34, L41, L47, L57–59, L70 (+ new accent-edge rows)

- [ ] **Step 1: Write the failing parity test:**

```ts
// tests/styles/design-figure-parity.test.ts
// Pins every DESIGN.md contrast figure touched by the 2026-07-16 accent pass
// to the ratio computed from the live globals.css hexes (±0.05). The pass
// exists because these figures had drifted (gamma miscalculation class);
// this test closes that class for the touched rows. Any touched figure the
// parser cannot cover must be listed in KNOWN_UNPINNED with a reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const design = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function token(scopeStart: string, name: string): string {
  const idx = css.indexOf(scopeStart);
  const scope = css.slice(idx, css.indexOf("}", css.indexOf("{", idx) + 1) + 1);
  // runtime blocks are flat (no nested braces), so first-close slicing is safe
  const m = scope.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`${name} not in ${scopeStart}`);
  return m[1]!;
}
const L = (n: string) => token(":root {", n);
const D = (n: string) => token('[data-theme="dark"] {', n);
const TOL = 0.05;

// Every documented figure touched by the pass: [label, documentedFigureRegex, computed].
// The regex must match DESIGN.md exactly once; the captured number is compared.
// §1.2 table rows are pipe-delimited: | `pair` | light | dark | note |
// Parse a §1.2 row's light+dark figures by its pair-label prefix.
function tableFigures(labelRe: string): { light: number; dark: number } {
  const re = new RegExp(`\\|\\s*${labelRe}[^|]*\\|\\s*([\\d.]+):1\\s*\\|\\s*([\\d.]+):1\\s*\\|`);
  const m = design.match(re);
  if (!m) throw new Error(`§1.2 row not found: ${labelRe}`);
  return { light: parseFloat(m[1]!), dark: parseFloat(m[2]!) };
}

const ROWS: Array<[string, RegExp, number]> = [
  ["accent-text on accent (light §1.1 L33)", /near-black on orange in BOTH modes; ([\d.]+):1 in each/, contrast(L("--color-accent-text-runtime"), L("--color-accent-runtime"))],
  ["accent-on-bg on bg (light, §1.1 L34)", /contrast against `#FAFAF9` reaches ([\d.]+):1/, contrast(L("--color-accent-on-bg-runtime"), L("--color-bg-runtime"))],
  ["accent raw on light bg (L34 corrected side-claim)", /The brand `#FF8C1A` itself only hits ([\d.]+):1 on light bg/, contrast(L("--color-accent-runtime"), L("--color-bg-runtime"))],
  ["accent-on-bg dark (L34)", /Dark `#FFA047` on `#0F1014` = ([\d.]+):1/, contrast(D("--color-accent-on-bg-runtime"), D("--color-bg-runtime"))],
  ["accent-tint icon (L47)", /icon on it uses `--color-accent-on-bg` \(graphical, ([\d.]+):1/, contrast(L("--color-accent-on-bg-runtime"), L("--color-accent-tint-runtime"))],
  // Anchored to the exact accent-edge §1.1 row phrase written in Step 3 below —
  // one regex, both captures, cannot match neighboring prose.
  ["accent-edge vs track (§1.1 new row)", /Light: accent-edge is ([\d.]+):1 vs the orange track and [\d.]+:1 vs bg/, contrast(L("--color-accent-edge-runtime"), L("--color-accent-runtime"))],
  ["accent-edge vs bg (§1.1 new row)", /Light: accent-edge is [\d.]+:1 vs the orange track and ([\d.]+):1 vs bg/, contrast(L("--color-accent-edge-runtime"), L("--color-bg-runtime"))],
];

// §1.2 TABLE cells — pinned directly (spec §6.1 row 8: EVERY touched figure in
// BOTH sections; "duplicate rendering" is not an exemption).
const TABLE_ROWS: Array<[string, string, number, number]> = [
  // [name, row-label regex fragment, computedLight, computedDark]
  ["L57 accent on bg", "`--color-accent` on `--color-bg`", contrast(L("--color-accent-runtime"), L("--color-bg-runtime")), contrast(D("--color-accent-runtime"), D("--color-bg-runtime"))],
  ["L58 accent-on-bg on bg", "`--color-accent-on-bg` on `--color-bg`", contrast(L("--color-accent-on-bg-runtime"), L("--color-bg-runtime")), contrast(D("--color-accent-on-bg-runtime"), D("--color-bg-runtime"))],
  ["L59 accent-text on accent", "`--color-accent-text` on `--color-accent`", contrast(L("--color-accent-text-runtime"), L("--color-accent-runtime")), contrast(D("--color-accent-text-runtime"), D("--color-accent-runtime"))],
  ["L70 accent-on-bg icon on tint", "`--color-accent-on-bg` icon on `--color-accent-tint`", contrast(L("--color-accent-on-bg-runtime"), L("--color-accent-tint-runtime")), contrast(D("--color-accent-on-bg-runtime"), D("--color-accent-tint-runtime"))],
  ["accent-edge vs accent (new §1.2 row)", "`--color-accent-edge` vs `--color-accent`", contrast(L("--color-accent-edge-runtime"), L("--color-accent-runtime")), contrast(D("--color-accent-edge-runtime"), D("--color-accent-runtime"))],
  ["accent-edge vs bg (new §1.2 row)", "`--color-accent-edge` vs `--color-bg`", contrast(L("--color-accent-edge-runtime"), L("--color-bg-runtime")), contrast(D("--color-accent-edge-runtime"), D("--color-bg-runtime"))],
];
// NOTE: the new §1.2 accent-edge rows must therefore carry BOTH light and dark
// figures (dark values are real ratios even though decorative — document them).
// KNOWN_UNPINNED is now empty; keep the array + assertion as the future escape hatch.
const KNOWN_UNPINNED: Array<[string, string]> = [];

describe("DESIGN.md figure parity (touched rows)", () => {
  for (const [label, re, computed] of ROWS) {
    it(`${label}: documented figure equals computed ±${TOL}`, () => {
      const m = design.match(re);
      expect(m, `regex found no match for ${label}`).toBeTruthy();
      expect(Math.abs(parseFloat(m![1]!) - computed)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [name, label, light, dark] of TABLE_ROWS) {
    it(`§1.2 table ${name}: documented light+dark figures equal computed ±${TOL}`, () => {
      const fig = tableFigures(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      expect(Math.abs(fig.light - light)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(fig.dark - dark)).toBeLessThanOrEqual(TOL);
    });
  }
  it("known-unpinned list stays empty unless a parser limitation is documented", () => {
    for (const [, reason] of KNOWN_UNPINNED) expect(reason.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/styles/design-figure-parity.test.ts`. Expected: FAIL (DESIGN.md still documents 4.07/4.6/3.0/9.8/3.8; no accent-edge row).
- [ ] **Step 3: Edit DESIGN.md** exactly per spec §5:
  - L31 (accent row): append to rationale: "Raw `--color-accent` on light bg is decorative-only (2.23:1); it must be redundant with an adjacent text label or shape cue, and any load-bearing orange-as-text/glyph use must go through `--color-accent-on-bg`."
  - L33: light hex `#FFFFFF` → `#0E0F12`; rationale → "Text drawn ON `--color-accent` surfaces. Near-black on orange in BOTH modes; 8.23:1 in each (same hex pair; the old dark-row 11.3:1 figure was itself a miscalculation). The former white-on-orange light pairing measured 2.33:1 (the 4.07:1 figure was a luminance miscalculation) and failed every WCAG tier."
  - L34: light hex `#C25E00` → `#A65000`; "reaches 4.6:1" → "reaches 5.34:1 (AA body; ≥4.5:1 on every audited tinted text fill — accent/10, accent/15, accent-tint, stale-tint)"; "only hits 3.0:1 on light bg — fine for a 24px+ 'today' pin glyph but NOT for body links" → "only hits 2.23:1 on light bg — decorative-only, never load-bearing"; "Dark `#FFA047` on `#0F1014` = 9.8:1" → "= 9.39:1".
  - New row after L34 (EXACT phrase — the parity regex anchors on it): `--color-accent-edge` | `#7A3D00` | `#FFA047` | "ON-state control boundary (toggle track border, active step pill). Light: accent-edge is 3.61:1 vs the orange track and 8.06:1 vs bg — WCAG 1.4.11 passes on both adjacent sides. Dark: decorative; the track itself clears 8.16:1 vs bg."
  - L41 (status-live row): light `-text` hex `#C25E00` → `#A65000`.
  - L47: "graphical, ≥3:1" figure "3.8:1" → "4.91:1" and drop the "only reaches ~3.8:1 as text" clause → "(and now also clears the 4.5:1 text floor at 4.91:1; the pill number stays `--color-text-strong` for hierarchy, not necessity)".
  - §1.2 L57: `3.0:1` → `2.23:1`, note → "decorative-only — use `--color-accent-on-bg` for any load-bearing text/glyph".
  - §1.2 L58: `4.6:1` → `5.34:1`; `9.8:1` → `9.39:1`.
  - §1.2 L59: `4.07:1` → `8.23:1` / `11.3:1` → `8.23:1`, note → "AA body both modes (same pair)".
  - §1.2 L70: `3.8:1` → `4.91:1`.
  - §1.2 new rows (BOTH columns, since the parity parser reads light AND dark): `--color-accent-edge` vs `--color-accent` | 3.61:1 | 1.15:1 | note "light = the load-bearing 1.4.11 boundary; dark edge is decorative (the track itself is the boundary, next row)"; `--color-accent-edge` vs `--color-bg` | 8.06:1 | 9.39:1 |; plus a note line (not a table row) that dark's toggle boundary is `--color-accent` vs bg = 8.16:1, already pinned by the contrast meta-test row 5.
  - §1.1 prose (single-accent paragraph): add "Selected-filter segments are NOT an accent surface — the selected-state recipe is inverted neutral (`bg-text text-bg`); accent stays reserved for live/matters-now signals and CTAs."
- [ ] **Step 4: Re-run** — PASS. Also re-run Task 1 file — still PASS.
- [ ] **Step 5: Commit** — `docs: correct DESIGN.md contrast figures to measured values; pin with figure-parity meta-test`

### Task 3: Toggle recipes + real-browser edge proof + dimensional invariants

**Files:**
- Modify: `components/admin/settings/NotifyToggle.tsx:134`, `components/admin/settings/AutoPublishToggle.tsx:126`, `components/admin/settings/DeveloperToggleButton.tsx:93`, `components/admin/PublishedToggle.tsx:146`, `components/admin/telemetry/AutoRefreshControl.tsx:106`, `components/admin/OnboardingWizard.tsx:151`
- Create: `tests/e2e/toggle-edge-layout.spec.ts` (standalone harness, sibling of `developer-toggle-layout.spec.ts`)
- Modify: `tests/e2e/developer-toggle-layout.spec.ts` (VERBATIM `TRACK_ON` string)

**Interfaces:**
- Consumes: `border-accent-edge` utility from Task 1.

- [ ] **Step 1: Component-test-first (vitest class assertions).** Find each toggle's existing component test (grep testid). Add/extend assertions, e.g. for DeveloperToggleButton test: ON state class list contains `border-accent-edge` and NOT `border-accent`. Run: FAIL.
- [ ] **Step 2: Edit the recipes:**
  - 4 settings/admin toggles: `on ? "border-accent bg-accent"` → `on ? "border-accent-edge bg-accent"`
  - `AutoRefreshControl.tsx:106`: `rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-sunken"}` → `rounded-full border transition-colors ${on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"}`
  - `OnboardingWizard.tsx:151`: `"border-transparent bg-accent text-accent-text"` → `"border-accent-edge bg-accent text-accent-text"`
- [ ] **Step 3: Vitest green.** Update `developer-toggle-layout.spec.ts` `TRACK_ON` verbatim string (`border-accent` → `border-accent-edge`).
- [ ] **Step 4: Write `tests/e2e/toggle-edge-layout.spec.ts`** — copy the harness scaffolding (Tailwind CLI compile + harness.html + http server + standalone.config) from `developer-toggle-layout.spec.ts`, with body:

```ts
// Spec §6.1 computed-style proof + §9.1 dimensional invariants.
// TRACK strings transcribed VERBATIM from the components (post-change).
const SETTINGS_TRACK_ON =
  "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-fast border-accent-edge bg-accent";
const SETTINGS_THUMB_ON =
  "inline-block h-5 w-5 rounded-full bg-bg shadow-(--shadow-tile) transition-transform duration-fast translate-x-6";
const AUTOREFRESH_TRACK = (on: boolean) =>
  `relative inline-flex h-5 w-[34px] items-center rounded-full border transition-colors ${on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"}`;
const AUTOREFRESH_THUMB = (on: boolean) =>
  `absolute size-4 rounded-full bg-surface shadow-tile transition-transform ${on ? "translate-x-[16px]" : "translate-x-[2px]"}`;

test("ON toggle border is the accent-edge token and geometry invariants hold", async () => {
  // harness renders: settings track (ON), autorefresh track ON + OFF, each with data-testid
  const track = page.getByTestId("autorefresh-track-on");
  const borderColor = await track.evaluate((el) => getComputedStyle(el).borderColor);
  expect(borderColor).toBe("rgb(122, 61, 0)"); // #7a3d00 — proves the utility generated CSS

  const t = await track.boundingBox();
  expect(Math.abs(t!.width - 34)).toBeLessThanOrEqual(TOL);   // border-box: outer unchanged
  expect(Math.abs(t!.height - 20)).toBeLessThanOrEqual(TOL);

  const thumbOn = await page.getByTestId("autorefresh-thumb-on").boundingBox();
  const thumbOff = await page.getByTestId("autorefresh-thumb-off").boundingBox();
  const trackOff = await page.getByTestId("autorefresh-track-off").boundingBox();
  // thumb fully inside its track, both states
  for (const [th, tr] of [[thumbOn, t], [thumbOff, trackOff]] as const) {
    expect(th!.x).toBeGreaterThanOrEqual(tr!.x - TOL);
    expect(th!.x + th!.width).toBeLessThanOrEqual(tr!.x + tr!.width + TOL);
    expect(th!.y).toBeGreaterThanOrEqual(tr!.y - TOL);
    expect(th!.y + th!.height).toBeLessThanOrEqual(tr!.y + tr!.height + TOL);
  }
  // ON−OFF travel = 14px (16px − 2px offsets) — each thumb measured against
  // ITS OWN track origin so harness layout position cancels out.
  const onOffset = thumbOn!.x - t!.x;
  const offOffset = thumbOff!.x - trackOff!.x;
  expect(Math.abs(onOffset - offOffset - 14)).toBeLessThanOrEqual(TOL);

  const settings = await page.getByTestId("settings-track-on").boundingBox();
  expect(Math.abs(settings!.width - 48)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(settings!.height - 28)).toBeLessThanOrEqual(TOL);
  const settingsThumb = await page.getByTestId("settings-thumb-on").boundingBox();
  expect(settingsThumb!.x + settingsThumb!.width).toBeLessThanOrEqual(settings!.x + settings!.width + TOL);
  const settingsBorder = await page
    .getByTestId("settings-track-on")
    .evaluate((el) => getComputedStyle(el).borderColor);
  expect(settingsBorder).toBe("rgb(122, 61, 0)");
});
```

- [ ] **Step 5: Run** — `pnpm exec playwright test tests/e2e/toggle-edge-layout.spec.ts --config tests/e2e/standalone.config.ts`. Expected: PASS. (Failure mode caught: alias missing → borderColor is `rgb(0, 0, 0)`/initial → test fails — this is the dead-utility proof.)
- [ ] **Step 6: Commit** — `feat(admin): accent-edge ON boundary on all toggle tracks + wizard active pill; real-browser edge proof`

### Task 4: Eyebrows → text-subtle (+ wizard 10px-faint scan)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:392` (const), `:950`, `:990` (hard-coded venue/dock eyebrows), `components/admin/wizard/VenueMapTile.tsx:52`
- Test: assertions land in `tests/styles/_metaRawAccentText.test.ts` (created Task 5) — so HERE: extend `tests/components/admin/wizard/step3ReviewSections.test.tsx` with class assertions first.

- [ ] **Step 1: Failing assertions** in `step3ReviewSections.test.tsx`: eyebrow elements (query by the rendered label text, e.g. "Venue", "Loading dock", scoped to their container per anti-tautology) have class `text-text-subtle`, not `text-text-faint`. Run: FAIL.
- [ ] **Step 2: Edits:** `CELL_EYEBROW_CLASS` → `"text-[10px] font-semibold uppercase tracking-eyebrow text-text-subtle"`; the two hard-coded literals at `:950`/`:990` → replace the whole literal with `{CELL_EYEBROW_CLASS}` (re-unify); `VenueMapTile.tsx:52` `text-text-faint` → `text-text-subtle`.
- [ ] **Step 3: Green** + re-run the wizard component test files + `rg 'text-\[10px\][^"]*text-text-faint|text-text-faint[^"]*text-\[10px\]' components/ app/` → expect ZERO hits.
- [ ] **Step 4: Commit** — `fix(admin): Stage-3 eyebrows + map badge to text-subtle (AA at 10px)`

### Task 5: Raw-accent TEXT migration + `_metaRawAccentText.test.ts`

**Files:**
- Create: `tests/styles/_metaRawAccentText.test.ts`
- Modify (per spec §4.4a, exact edits):
  - `components/crew/CrewSubNav.tsx:98` `text-accent` → `text-accent-on-bg` (and update the `:105-109` comment: active mobile tab now inherits accent-on-bg, desktop override may simplify — keep behavior identical)
  - DELETE the hover color shift (remove ` hover:text-accent-hover` / ` hover:text-accent` token only): `components/auth/IdentityChip.tsx:62`, `components/admin/HelpAffordance.tsx:111`, `components/admin/StagedReviewCard.tsx:430`, `components/admin/DashboardFooter.tsx:35`, `components/admin/wizard/Step1Share.tsx:94,122`, `components/admin/wizard/Step2Verify.tsx:359`, `app/admin/show/[slug]/CrewPageLink.tsx:28`, `components/shared/ReportModal.tsx:513`
  - `app/admin/show/[slug]/RotateShareTokenButton.tsx:170,184`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`, `app/admin/show/[slug]/PickerResetControl.tsx:184`: `text-accent` → `text-accent-on-bg`

- [ ] **Step 1: Write the meta-test (fails against current code):**

```ts
// tests/styles/_metaRawAccentText.test.ts
// Bans raw accent TEXT classes (2.23:1 light) and the sub-AA hover shifts
// (spec §4.4a). Also scans the wizard for the 10px-faint eyebrow pattern
// (spec §4.2). Filesystem-walked: NEW files fail by default.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["components", "app"];
// file:reason rows; EMPTY at ship (spec §4.4a).
const ALLOWLIST: Array<{ file: string; reason: string }> = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx|ts)$/.test(e) ? [p] : [];
  });
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
// A token is banned iff, after stripping its variant chain, the final utility
// is EXACTLY `text-accent` (raw accent as text — banned in EVERY chain, hover
// or not), OR the chain contains `hover` and the final utility is EXACTLY
// `text-accent-hover` (the sub-AA hover shift). `text-accent-on-bg` /
// `text-accent-text` never match (suffixed utilities are different tokens).
function bannedToken(tok: string): boolean {
  const parts = tok.split(":");
  const util = parts[parts.length - 1]!.replace(/^!/, "");
  // text-accent: banned in EVERY chain (bare, hover:, md:hover:, data-[…]:).
  // text-accent-hover: ALSO banned in every chain incl. bare — the hover-shift
  // hue (#e67a0e light, 2.9:1) is sub-AA wherever it colors text, and no
  // legitimate non-hover use exists. Strictly stronger than the spec's
  // enumerated three tokens; spec §4.4a amended to match.
  if (util === "text-accent" || util === "text-accent-hover") return true;
  return false;
}

describe("META raw accent text ban (spec 2026-07-16 §4.4a)", () => {
  it("matcher self-check: safe tokens accepted, banned tokens rejected", () => {
    expect(bannedToken("text-accent")).toBe(true);
    expect(bannedToken("hover:text-accent")).toBe(true);
    expect(bannedToken("hover:text-accent-hover")).toBe(true);
    expect(bannedToken("md:hover:text-accent")).toBe(true);
    expect(bannedToken("focus:text-accent-hover")).toBe(true);
    expect(bannedToken("text-accent-hover")).toBe(true);
    expect(bannedToken("text-accent-on-bg")).toBe(false);
    expect(bannedToken("bg-accent-hover")).toBe(false);
    expect(bannedToken("hover:text-accent-on-bg")).toBe(false);
    expect(bannedToken("text-accent-text")).toBe(false);
  });

  it("no raw accent text classes in components/ or app/", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWLIST.some((a) => a.file === file)) continue;
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          for (const tok of line.split(/[\s"'`{}$]+/)) {
            if (bannedToken(tok)) violations.push(`${file}:${i + 1} ${tok}`);
          }
        });
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("wizard: no 10px + text-text-faint pairing (spec §4.2 eyebrow class)", () => {
    const violations: string[] = [];
    for (const file of walk("components/admin/wizard")) {
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("text-text-faint") && line.includes("text-[10px]")) {
            violations.push(`${file}:${i + 1}`);
          }
        });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — FAIL listing exactly **16 token occurrences across the 14 files** above (RotateShareTokenButton and Step1Share each carry two; 1 mobile tab + 9 hover-shift links + 4 glyph sites = 14 files). Task 4 already cleared the eyebrow scan.
- [ ] **Step 3: Apply the 15 edits.** Note TravelSection:595's comment cites "4.6:1" for accent-on-bg — update comment to 5.34:1.
- [ ] **Step 4: Run** — PASS. Sweep affected component tests (`Header.test.tsx`, `SignInBrand.test.tsx`, etc. from the 18-file grep) — fix any pinned `hover:text-accent-hover` expectations.
- [ ] **Step 5: Commit** — `fix: migrate raw accent text states to accent-on-bg; delete sub-AA hover shifts; add structural ban`

### Task 6: bg-accent inventory meta-test + B4 darkened fills + Bell pip / RightNow segment

**Files:**
- Create: `tests/styles/_metaBgAccentInventory.test.ts`
- Modify: `components/admin/BellPanel.tsx:292` `bg-accent` → `bg-accent-on-bg`; `components/crew/RightNowHero.tsx:556` active segment `bg-accent` → `bg-accent-on-bg`
- Modify: their component tests (`bell-panel` tests, RightNowHero tests — grep testids `bell-unread-dot-`, `data-segment-active`) with class assertions.

- [ ] **Step 1: Failing component assertions** — unread pip class contains `bg-accent-on-bg`; active segment ternary yields `bg-accent-on-bg`. Run: FAIL.
- [ ] **Step 2: Apply the two class edits.** Green.
- [ ] **Step 3: Write the inventory meta-test** — same walk/stripComments/tokenizer helpers as Task 5 (import from a small shared `tests/styles/_classScanUtils.ts` extracted in this task — move Task 5's helpers there):

```ts
// tests/styles/_metaBgAccentInventory.test.ts
// Per-occurrence registry of every exact-token bg-accent fill (spec §4.1b
// meta row 11). Variant chains normalized: disabled:hover:bg-accent MATCHES;
// bg-accent-tint / bg-accent/10 never do. NEW occurrences fail by default.
import { walk, stripComments } from "./_classScanUtils";
// ... vitest imports, fs

type Disposition = "labeled" | "edge-treated" | "redundant-glyph" | "decorative";
// REGISTRY: the spec §4.1b generated inventory in its POST-CHANGE state
// (EventFilters:90, BellPanel:292, RightNowHero:556 have left the scan —
// re-toned/darkened; comments are stripped pre-scan). `index` = nth exact-token
// bg-accent occurrence within the file, 0-based, in line order after
// comment-stripping. `context` must be a substring of the matched line.
const L = (file: string, index: number, context = "bg-accent"): Row => ({ file, index, context, disposition: "labeled" });
type Row = { file: string; index: number; context: string; disposition: Disposition };
const REGISTRY: Row[] = [
  // labeled (37): the shared CTA/labeled-control recipe or count badges
  L("app/admin/error.tsx", 0), L("app/admin/settings/admins/AddAdminForm.tsx", 0), L("app/admin/settings/admins/AddAdminForm.tsx", 1),
  L("app/admin/settings/admins/error.tsx", 0), L("app/admin/settings/admins/RevokeRowButton.tsx", 0), L("app/admin/settings/admins/RevokeRowButton.tsx", 1),
  L("app/admin/settings/admins/RevokeRowButton.tsx", 2), L("app/admin/settings/error.tsx", 0), L("app/admin/settings/roles/RoleMappingRow.tsx", 0),
  L("app/admin/show/[slug]/PickerResetControl.tsx", 0), L("app/admin/show/[slug]/ResetPickerEpochButton.tsx", 0),
  L("app/admin/show/[slug]/RotateShareTokenButton.tsx", 0), L("app/admin/show/[slug]/ShareLinkCopyButton.tsx", 0),
  L("app/global-error.tsx", 0), L("app/me/page.tsx", 0), L("app/show/[slug]/[shareToken]/_PickerInterstitial.tsx", 0),
  L("app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", 0), L("app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", 1),
  L("app/show/[slug]/[shareToken]/error.tsx", 0), L("app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx", 0),
  L("components/admin/Mi11GateActions.tsx", 0), L("components/admin/RoleRecognizeControl.tsx", 0),
  L("components/admin/settings/AddAdminDisclosure.tsx", 0), L("components/admin/nav/AdminNav.tsx", 0), L("components/admin/nav/NotifBell.tsx", 0),
  L("components/admin/wizard/Step1Share.tsx", 0), L("components/admin/wizard/Step2Verify.tsx", 0),
  L("components/admin/wizard/Step3ReviewModal.tsx", 1), L("components/admin/wizard/Step3ReviewModal.tsx", 2),
  L("components/shared/AccentButton.tsx", 0), L("components/shared/ReportButton.tsx", 0),
  L("components/shared/ReportModal.tsx", 0), L("components/shared/ReportModal.tsx", 1), L("components/shared/ReportModal.tsx", 2),
  L("components/shared/ReportModal.tsx", 3), L("components/shared/ReportModal.tsx", 4),
  L("components/admin/ResolveAlertButton.tsx", 0, "disabled:hover:bg-accent"),
  // edge-treated (6): context must show the edge border beside the fill
  { file: "components/admin/PublishedToggle.tsx", index: 0, context: "border-accent-edge bg-accent", disposition: "edge-treated" },
  { file: "components/admin/settings/AutoPublishToggle.tsx", index: 0, context: "border-accent-edge bg-accent", disposition: "edge-treated" },
  { file: "components/admin/settings/DeveloperToggleButton.tsx", index: 0, context: "border-accent-edge bg-accent", disposition: "edge-treated" },
  { file: "components/admin/settings/NotifyToggle.tsx", index: 0, context: "border-accent-edge bg-accent", disposition: "edge-treated" },
  { file: "components/admin/telemetry/AutoRefreshControl.tsx", index: 2, context: "border-accent-edge bg-accent", disposition: "edge-treated" },
  { file: "components/admin/OnboardingWizard.tsx", index: 0, context: "border-accent-edge bg-accent", disposition: "edge-treated" },
  // redundant-glyph (1)
  { file: "components/admin/wizard/Step3SheetCard.tsx", index: 0, context: "border-accent bg-accent text-accent-text", disposition: "redundant-glyph" },
  // decorative (7)
  { file: "components/crew/RightNowHero.tsx", index: 0, context: "bg-accent", disposition: "decorative" },
  { file: "components/right-now/RightNowCard.tsx", index: 0, context: "bg-accent", disposition: "decorative" },
  { file: "components/admin/telemetry/EventVolumeSparkline.tsx", index: 0, context: "bg-accent", disposition: "decorative" },
  { file: "components/crew/primitives/DayCard.tsx", index: 0, context: "bg-accent", disposition: "decorative" },
  { file: "components/admin/wizard/Step3ReviewModal.tsx", index: 0, context: "rounded-r-pill bg-accent", disposition: "decorative" },
  { file: "components/admin/telemetry/AutoRefreshControl.tsx", index: 0, context: "telemetry-ping", disposition: "decorative" },
  { file: "components/admin/telemetry/AutoRefreshControl.tsx", index: 1, context: "size-2 rounded-full", disposition: "decorative" },
];

function bgAccentToken(tok: string): boolean {
  const parts = tok.split(":");
  const util = parts[parts.length - 1]!.replace(/^!/, "");
  return util === "bg-accent";
}

describe("META bg-accent per-occurrence disposition registry (spec §4.1b)", () => {
  it("matcher self-check", () => {
    expect(bgAccentToken("bg-accent")).toBe(true);
    expect(bgAccentToken("disabled:hover:bg-accent")).toBe(true);
    expect(bgAccentToken("data-[state=active]:bg-accent")).toBe(true);
    expect(bgAccentToken("bg-accent-tint")).toBe(false);
    expect(bgAccentToken("bg-accent/10")).toBe(false);
  });

  it("every bg-accent occurrence is registered; every registry row exists", () => {
    const hits: Array<{ file: string; index: number; line: string; lineNo: number }> = [];
    for (const root of ["components", "app"]) {
      for (const file of walk(root)) {
        let n = 0;
        stripComments(readFileSync(file, "utf8")).split("\n").forEach((line, i) => {
          for (const tok of line.split(/[\s"'`{}$]+/)) {
            if (bgAccentToken(tok)) hits.push({ file, index: n++, line, lineNo: i + 1 });
          }
        });
      }
    }
    const problems: string[] = [];
    for (const h of hits) {
      const row = REGISTRY.find((r) => r.file === h.file && r.index === h.index);
      if (!row) { problems.push(`UNREGISTERED ${h.file}:${h.lineNo} (occurrence ${h.index})`); continue; }
      if (!h.line.includes(row.context)) problems.push(`CONTEXT MISMATCH ${h.file}:${h.lineNo} expected "${row.context}"`);
      if (row.disposition === "edge-treated" && !h.line.includes("border-accent-edge")) {
        problems.push(`EDGE MISSING ${h.file}:${h.lineNo}`);
      }
    }
    for (const r of REGISTRY) {
      if (!hits.some((h) => h.file === r.file && h.index === r.index)) {
        problems.push(`STALE REGISTRY ROW ${r.file} occurrence ${r.index}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
```

Indexes are seeded from the spec's generated inventory in line order per file (e.g. `AutoRefreshControl`: ping `:86`=0, dot `:90`=1, track `:106`=2; `Step3ReviewModal`: side bar `:1064`=0, CTAs `:1378`=1 / `:1464`=2). If the scan finds drift vs these seeds (tree moved since spec generation), reconcile to zero problems by updating rows — never by loosening the matcher.

- [ ] **Step 4: Run** — PASS with exact reconciliation (post-change: EventFilters/BellPanel/RightNowHero rows must NOT be present; if the scan still finds them the earlier edits are wrong).
- [ ] **Step 5: Commit** — `feat: bg-accent per-occurrence disposition registry; darken Bell pip + RightNow active segment to accent-on-bg`

### Task 7: TEL-1 re-tone + TEL-2 badge fill

**Files:**
- Modify: `components/admin/telemetry/EventFilters.tsx:90`, `components/admin/telemetry/EventRow.tsx:103`, `components/admin/telemetry/EventLevelBadge.tsx:7`
- Test: `tests/components/telemetry/*` (grep for `filter-level-`, `event-level-`, requestId chip)

- [ ] **Step 1: Failing assertions:**
  - selected level segment: classes include `bg-text text-bg`, exclude `bg-accent` and `text-accent-text`
  - requestId chip: `text-text-subtle`, not `text-accent-on-bg`
  - error badge: `bg-status-degraded text-status-degraded-text font-semibold`; NOT `bg-warning-bg`; NOT the pair `bg-danger-bg`+`text-status-degraded`; warn/info rows unchanged; testid contract unchanged
- [ ] **Step 2: Edits:**
  - `EventFilters.tsx:90`: `levels.has(lvl) ? "bg-accent text-accent-text" : "text-text-subtle"` → `levels.has(lvl) ? "bg-text text-bg" : "text-text-subtle"`
  - `EventRow.tsx:103`: `text-accent-on-bg` → `text-text-subtle`
  - `EventLevelBadge.tsx:7`: `error: { label: "Error", className: "bg-warning-bg text-warning-text font-semibold" }` → `error: { label: "Error", className: "bg-status-degraded text-status-degraded-text font-semibold" }`
- [ ] **Step 3: Green** + `tests/e2e/telemetry-layout.spec.ts` sweep for pinned strings.
- [ ] **Step 4: Commit** — `feat(admin): telemetry accent reservation — inverted-neutral selected filter, neutral requestId chip, solid degraded error badge`

### Task 8: Full-tree class-sweep + gates

- [ ] **Step 1:** Re-run the spec's sweeps; expect zero unaccounted:
  - `rg -nP '(^|[^A-Za-z0-9-])text-accent(?![A-Za-z0-9-])' components/ app/` → only comments
  - `rg -n 'hover:text-accent(-hover)?(?![A-Za-z0-9-])' -P components/ app/` → empty
  - `rg -n 'text-text-faint' components/admin/wizard/` → no 10px pairings
  - Tinted-consumer audit re-run (spec §3): `rg -n 'text-accent-on-bg' components/ app/` — for each hit confirm its rendered background is in the §6.1 pinned set {bg, surface, accent/10, accent/15, accent-tint, stale-tint, surface-sunken}; any NEW background gets a pinned row or a migration before ship
- [ ] **Step 2:** Sweep the 18 pinned-class test files (grep list from spec §6.2) — update expectations that still assert old recipes.
- [ ] **Step 3:** `pnpm test` (full), `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/toggle-edge-layout.spec.ts tests/e2e/developer-toggle-layout.spec.ts`, `pnpm lint`, `pnpm format:check`, `pnpm build`. All green. (Structural meta-tests are comment/format-fragile — re-run `tests/styles/` after any prettier pass.)
- [ ] **Step 4:** Commit any sweep fixes — `test: sweep pinned accent/toggle/badge class expectations for the token pass`

### Task 9: Close-out docs

- [ ] **Step 1:** DEFERRED.md — mark STEP3MODAL-1, DEVTIER-2, VCR-1, TEL-1, TEL-2 as `✅ RESOLVED 2026-07-16 (accent-contrast token pass, feat/accent-contrast-token-pass)` keeping original text.
- [ ] **Step 2:** BACKLOG.md — `BL-ACCENT-ON-BG-AA-CONTRAST` → `✅ SHIPPED` header with one-paragraph outcome (tokens landed at #0e0f12/#a65000/#7a3d00; meta-tests pin). Note eyebrow disposition on `BL-ADMIN-EYEBROW-FAINT-CONTRAST` if present (grep first; add note only where the ID exists).
- [ ] **Step 3:** `pnpm format:check` (docs edits can trip prettier), commit — `docs: close out accent-contrast deferrals (STEP3MODAL-1, DEVTIER-2, VCR-1, TEL-1, TEL-2, BL-ACCENT-ON-BG-AA-CONTRAST)`

### Post-plan pipeline gates (session-level, not plan tasks)

Impeccable dual-gate (invariant 8) on the UI diff → screenshot pixel-diff + amd64 regen (`screenshots-regen.yml` / pinned Docker; `git restore public/help/screenshots/` after local verification) → whole-diff Codex review → push → real CI green → merge.
