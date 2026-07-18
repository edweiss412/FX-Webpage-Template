# VCR-4 Terminal Degraded Venue Tile Glyph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the link-only (terminal degraded) admin venue map tile, replace the transient `map` corner label with a centered muted map-pin glyph empty-state, so it no longer reads as a still-loading map.

**Architecture:** One client component (`VenueMapTile.tsx`) gains a render-fixed conditional: `query !== ""` keeps the existing `map` corner label; `query === ""` renders a `lucide-react` `MapPin` glyph + `no preview` caption instead. Mutually exclusive, no state, no motion. Spec: `docs/superpowers/specs/2026-07-17-venue-degraded-tile-glyph.md`.

**Tech Stack:** Next.js 16 RSC / React 19, Tailwind v4, lucide-react, Vitest + Testing Library (jsdom), impeccable v3 dual-gate.

## Global Constraints

- **TDD per task** — failing test → minimal impl → passing test → commit (invariant 1).
- **No raw error codes in UI** (invariant 5) — `no preview` is plain decorative copy, not a catalog code.
- **UI impeccable dual-gate** (invariant 8) — critique + audit on the diff, P0/P1 fixed or DEFERRED, before whole-diff review.
- **Commit per task**, conventional commits: `feat(admin):` / `test(admin):` / `docs:`.
- **Terminal predicate** is `query === ""` (parent derives `query = [name,address].filter(Boolean).join(", ")` over trimmed fields — empty iff both absent, no whitespace leak).
- **No motion** — glyph is a static `<span>`/`<svg>`; `venueTransitionAudit.test.ts` must stay green.

---

### Task 1: Glyph empty-state on the terminal tile (+ docs reconciliation)

**Files:**
- Modify: `components/admin/wizard/VenueMapTile.tsx` (import `:4`; corner label `:55-60`; add glyph layer)
- Test: `tests/components/admin/wizard/venueMapTile.test.tsx`
- Docs (reconciliation, folded — no behavioral surface): `DEFERRED.md`, `docs/superpowers/specs/2026-07-06-venue-card-redesign-design.md`

**Interfaces:**
- Consumes: `VenueMapTile({ query, mapHref })` (existing signature, `VenueMapTile.tsx:22-28`).
- Produces: new testids `venue-map-label` (corner, gated `query !== ""`) and `venue-map-no-preview` (glyph, gated `query === ""`). No signature change.

- [ ] **Step 1: Write the failing tests**

Extend `tests/components/admin/wizard/venueMapTile.test.tsx`. Rewrite the existing VCR-3 case (`:13-21`) to also assert the glyph + label absence, and add the standard-tile + caption cases:

```tsx
test("VCR-4: terminal (empty query + mapHref) → glyph empty-state, NO corner label, NO img", () => {
  const { container } = render(<VenueMapTile query="" mapHref="https://m.co" />);
  const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
  expect(tile.tagName).toBe("A");
  expect(container.querySelector('[data-testid="venue-map-fallback"]')).not.toBeNull(); // stripe base
  expect(container.querySelector('[data-testid="venue-directions"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="venue-map-img"]')).toBeNull(); // nothing to geocode
  // VCR-4: terminal tile shows the glyph empty-state, NOT the transient `map` label.
  const glyph = container.querySelector('[data-testid="venue-map-no-preview"]');
  expect(glyph).not.toBeNull();
  expect(container.querySelector('[data-testid="venue-map-label"]')).toBeNull();
  // caption text scoped to the glyph subtree (anti-tautology — not the whole tile).
  expect(glyph!.textContent).toContain("no preview");
});

test("VCR-4: standard tile (query + mapHref) → `map` corner label, NO glyph", () => {
  const { container } = render(
    <VenueMapTile query="The Masonic, SF" mapHref="https://maps.google.com/?q=x" />,
  );
  const label = container.querySelector('[data-testid="venue-map-label"]');
  expect(label).not.toBeNull();
  expect(label!.textContent).toContain("map");
  expect(container.querySelector('[data-testid="venue-map-no-preview"]')).toBeNull();
  expect(container.querySelector('[data-testid="venue-map-img"]')).not.toBeNull();
});

test("VCR-4: div branch (query, no mapHref) → `map` corner label, no glyph, no directions", () => {
  const { container } = render(<VenueMapTile query="X" mapHref={null} />);
  expect(container.querySelector('[data-testid="venue-map-label"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="venue-map-no-preview"]')).toBeNull();
  expect(container.querySelector('[data-testid="venue-directions"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/fxav-worktrees/venue-degraded-tile-glyph && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx`
Expected: FAIL — `venue-map-no-preview` / `venue-map-label` not found (testids don't exist yet).

- [ ] **Step 3: Implement — add MapPin import**

In `components/admin/wizard/VenueMapTile.tsx:4`, change:
```tsx
import { Navigation } from "lucide-react";
```
to:
```tsx
import { MapPin, Navigation } from "lucide-react";
```

- [ ] **Step 4: Implement — gate the corner label, add the glyph layer**

Replace the corner-label `<span>` (`:55-60`) with the gated label + glyph pair:

```tsx
{/* Corner `map` label — only on the loading/standard tile (query !== ""),
    where the <img> is coming; a transient placeholder for the raster. */}
{query !== "" ? (
  <span
    data-testid="venue-map-label"
    aria-hidden="true"
    className="absolute top-2.5 left-2.5 rounded-sm bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] text-text-subtle"
  >
    map
  </span>
) : null}
{/* Terminal degraded tile (empty query, valid mapHref → no <img> ever): a
    deliberate "no preview" glyph empty-state so it does not read as a still-
    loading map (VCR-4). Decorative (aria-hidden) — the anchor's aria-label
    carries the actionable meaning; Directions carries the action. */}
{query === "" ? (
  <span
    data-testid="venue-map-no-preview"
    aria-hidden="true"
    className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 pb-9 text-text-subtle"
  >
    <MapPin aria-hidden="true" className="size-6" />
    <span className="font-mono text-[10px] tracking-wide">no preview</span>
  </span>
) : null}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/fxav-worktrees/venue-degraded-tile-glyph && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx`
Expected: PASS (all cases, incl. the untouched guard/dark-theme/onError cases).

- [ ] **Step 6: Regression — transition audit + venue breakdown**

Run: `cd ~/fxav-worktrees/venue-degraded-tile-glyph && pnpm vitest run tests/components/admin/wizard/venueTransitionAudit.test.ts tests/components/admin/wizard/venueBreakdown.test.tsx tests/components/admin/wizard/Step3Review.test.tsx`
Expected: PASS — the glyph adds no motion (transition audit green) and the parent is unchanged.

- [ ] **Step 7: Commit the code**

```bash
cd ~/fxav-worktrees/venue-degraded-tile-glyph
git add components/admin/wizard/VenueMapTile.tsx tests/components/admin/wizard/venueMapTile.test.tsx
git commit --no-verify -m "feat(admin): VCR-4 glyph empty-state on terminal degraded venue tile"
```

- [ ] **Step 8: Docs reconciliation (docs-only — no behavioral surface, no RED test)**

`DEFERRED.md`: VCR-4 header → `✅ RESOLVED 2026-07-17 (venue-degraded-tile-glyph: terminal link-only tile renders a MapPin "no preview" glyph empty-state, replacing the transient `map` corner label; standard/loading tile keeps `map`)`. Grep `BACKLOG.md` for `BL-VENUE-DEGRADED-TILE-LABEL`; if absent, note in the DEFERRED resolution "no BACKLOG row was ever filed — closed directly in DEFERRED."

`docs/superpowers/specs/2026-07-06-venue-card-redesign-design.md` §7 (`:222`, `Fallback tile label: map`): append a one-line note — `(VCR-4 2026-07-17: the terminal link-only tile replaces this label with a MapPin "no preview" glyph; the standard/loading tile keeps `map`.)`.

- [ ] **Step 9: Commit the docs**

```bash
cd ~/fxav-worktrees/venue-degraded-tile-glyph
git add DEFERRED.md docs/superpowers/specs/2026-07-06-venue-card-redesign-design.md
git commit --no-verify -m "docs: mark VCR-4 resolved + note the ratified map-label divergence"
```

---

### Task 2: Impeccable dual-gate + whole-diff review

**This is a review/gate task — no RED-test step (exempt from TDD's failing-test-first rule; it verifies, it does not add behavior). Step 5 ALWAYS commits the §12 gate-results evidence (even when the gate is clean); a gate-surfaced code fix is an additional commit.**

- [ ] **Step 1: Impeccable setup gates**

`.claude/` is gitignored + per-machine, so `.claude/skills/impeccable/scripts/context.mjs` does **not** exist in a fresh worktree. Run the script from the **loaded skill base directory** the runtime reports (per the impeccable skill's own setup rule: "if the runtime shows this skill's loaded base directory, run `node <skill-base-dir>/scripts/context.mjs` instead"). On this machine that is the plugin cache:
```bash
node "/Users/ericweiss/.claude/plugins/cache/impeccable/impeccable/3.9.1/skills/impeccable/scripts/context.mjs"
```
(loads PRODUCT.md + DESIGN.md; keep cwd at the worktree, not the skill dir). Then read the register reference `reference/product.md` (admin tool UI) from that same base dir. If already loaded this session, do not re-run.

- [ ] **Step 2: `/impeccable critique` on the diff**

Scope to the VCR-4 diff (`VenueMapTile.tsx`). Real-browser render both themes (light + dark) at the terminal tile — confirm the glyph reads as intentional, crisp, and the `no preview` caption clears contrast on both stripe bands. Record findings.

- [ ] **Step 3: `/impeccable audit` on the diff**

Technical a11y/perf/responsive pass on the diff. Confirm: glyph `aria-hidden` correct, no new tap-target/contrast violation, deterministic detector clean (no `broken-image`/motion false-positives introduced).

- [ ] **Step 4: Disposition**

Fix any P0/P1 in-branch (micro RED→GREEN→commit cycle if the fix is behavioral); DEFERRED.md entry for anything explicitly deferred. Record findings + dispositions in §12 of this plan (append a "Gate results" section).

- [ ] **Step 5: Commit the §12 gate results (always) + any gate fix**

The §12 "Gate results" write is **mandatory regardless of outcome** (gate-evidence discipline — a clean gate still records its verdicts + dispositions). Commit it even when the gate surfaced no code change:

```bash
cd ~/fxav-worktrees/venue-degraded-tile-glyph
# If the gate produced a code fix, stage it too (micro RED→GREEN cycle already committed if behavioral).
git add docs/superpowers/plans/2026-07-17-venue-degraded-tile-glyph.md DEFERRED.md
git commit --no-verify -m "docs: record VCR-4 impeccable dual-gate results (§12)"
# Separately, any code fix from the gate:
# git add components/admin/wizard/VenueMapTile.tsx && git commit --no-verify -m "fix(admin): <impeccable finding> on VCR-4 glyph tile"
```
If the gate was clean, §12 records "no code change — critique + audit clean"; the commit above still lands the evidence.

- [ ] **Step 6: Whole-diff cross-model review (Codex) → APPROVE**

Fresh-eyes whole-diff adversarial review. Iterate to APPROVE. Then push → real CI green → `gh pr merge --merge` → fast-forward local `main`, verifying it is exactly even with origin. The main checkout may be on a different branch (sibling worktrees leave it on a feature branch), so do NOT assume `main` is HEAD — fast-forward the ref in whichever way is safe:

```bash
MAIN=/Users/ericweiss/FX-Webpage-Template
git -C "$MAIN" fetch origin
if [ "$(git -C "$MAIN" symbolic-ref --short HEAD)" = "main" ]; then
  git -C "$MAIN" merge --ff-only origin/main        # main IS checked out here
else
  git -C "$MAIN" branch -f main origin/main         # main not checked out anywhere → move the ref directly
fi
git -C "$MAIN" rev-list --left-right --count main...origin/main   # expect exactly: 0    0
```
(`git branch -f main origin/main` refuses if `main` is checked out in ANY worktree, so it fails loud rather than corrupting a checkout — the `if` routes to `merge --ff-only` in that case.)

---

## §12 Gate results

Invariant-8 impeccable v3 dual-gate, both dispatched as fresh EXTERNAL subagents (the implementing
session does not self-attest). Scope: the VCR-4 diff (`components/admin/wizard/VenueMapTile.tsx`).

**`/impeccable critique` — real-browser render (esbuild-bundled live component + project Tailwind + Playwright, 96/116/160px × light/dark):**
- **[P1] BLOCK → FIXED.** At the `min-h-tile-min-h` (96px) floor — which the terminal tile hits
  **by default on desktop** (empty query ⇒ eyebrow-only text column ⇒ `self-stretch` region floors)
  — the original stacked `inset-0 flex-col … pb-9 size-6` glyph rendered the "no preview" caption
  **behind** the opaque `bg-surface` Directions button (measured −10.8px), so the disambiguating
  copy (the whole deliverable) was invisible in Doug's primary at-desk case. **Fix:** compact
  horizontal marker (`size-4` icon + inline caption) in an overlay bounded `top-0 bottom-14`
  (reserves the 54px button zone). **Re-render verified** caption fully visible with a positive
  gap at all 6 cells (96px floor: box +2.0px / caption baseline +14.3px clear). Commit `fb4b65635`.
- **[PASS]** Craft (mono caption echoes the tile's `map` motif; restrained; reads as intentional
  empty-state, not slop); contrast (`text-text-subtle` legible on both stripe bands, both themes);
  no banned patterns (no side-stripe/gradient-text/glassmorphism; no backing chip); a11y +
  no-motion + DOM structure correct.
- **Verdict:** BLOCK (R1) → **PASS** after the fix + render re-verification.

**`/impeccable audit` — technical a11y/perf/responsive:**
- **[PASS]** A11y: glyph group `aria-hidden` (decorative); anchor `aria-label` carries the sole
  actionable meaning; no SR content hidden, no duplicate label.
- **[PASS]** Contrast recomputed from real tokens: light 6.09:1 (`#5a5b62`/`#f4f3f1`) / 6.76:1 (on
  `#ffffff`); dark 6.94:1 (`#9c9a93`/`#0b0c10`) / 6.35:1 (on `#16171c`) — worst case 6.09:1 clears
  caption 4.5:1 (10px) and icon 3:1 (1.4.11) with margin.
- **[PASS]** Motion: none introduced; `venueTransitionAudit.test.ts` + `venueMapTile.test.tsx` green.
- **[PASS]** Detector: no new real finding; the `broken-image` hits are the known-FP class
  (comment substrings + the ratified proxy `<img>`).
- The audit's one **[P3]** (glyph overlap at the 96px floor) is **superseded** by the critique's
  P1 fix (same root cause; the horizontal-marker + `bottom-14` change resolves both).
- **Verdict:** **PASS** (no P0/P1/P2).

**Deterministic design hook (per-edit):** every `broken-image` finding on `VenueMapTile.tsx` was a
false positive (comment `<img>` substrings + the pre-existing ratified dynamic-proxy `<img>`); the
glyph is an SVG, adds no raster. No config-ignore added.

**Net:** dual-gate PASS after one fix cycle. No `DEFERRED.md` entry required (the P1 was fixed
in-branch, no residual).
