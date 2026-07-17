# RightNowHero segment vibrancy (ACCENT-PASS-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the vibrant `#ff8c1a` brand fill on RightNowHero's active show-day progress segment while holding WCAG 1.4.11 ≥3:1, by moving the load-bearing boundary onto a `border-accent-edge` stroke (the already-ratified toggle recipe).

**Architecture:** Pure presentational className change on one span, plus its three pinning surfaces (component test, `bg-accent` inventory meta-test, DESIGN.md). No new token, no runtime, no DB.

**Tech Stack:** Next.js 16 RSC + React 19, Tailwind v4 (JIT literal classes), Vitest + Testing Library (jsdom).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-hero-segment-vibrancy.md`. Spec is canonical.
- New active-segment class EXACTLY: `border border-accent-edge bg-accent` (must contain the substring `border-accent-edge bg-accent` for the meta-test context guard).
- Tailwind v4: literal class strings only, never `${token}` interpolation.
- No new token; `--color-accent`, `--color-accent-edge` already exist in `app/globals.css`.
- TDD per task; commit per task (conventional commits, scope `crew-page`).
- Invariant 8 (impeccable dual-gate) applies — UI surface. Runs at milestone close-out before whole-diff review.
- Do NOT touch `BellPanel.tsx` (the pip stays `bg-accent-on-bg` — spec §9, out of scope).

---

### Task 1: Restore vibrant active-segment fill with accent-edge boundary

**Files:**
- Modify: `components/crew/RightNowHero.tsx:556-559`
- Test: `tests/components/crew/rightNowHero.test.tsx:489-496` (existing test, edited)
- Test: `tests/styles/_metaBgAccentInventory.test.ts:107-110` (add one row)
- Modify: `DESIGN.md` §1.2 accent-edge row
- Modify: `DEFERRED.md` (ledger reconciliation, Steps 11-14; `BACKLOG.md` needs no change)

**Interfaces:**
- Consumes: nothing new. `--color-accent` (`bg-accent`), `--color-accent-edge` (`border-accent-edge`) already in `app/globals.css`.
- Produces: the active segment's rendered class token set now contains `bg-accent`, `border`, `border-accent-edge` and NOT `bg-accent-on-bg`.

- [ ] **Step 1: Edit the existing component test to the new contract (RED).**

In `tests/components/crew/rightNowHero.test.tsx`, replace the WHOLE `:488-496` block — the 4-line stale comment (`:488-491`, "Accent-contrast token pass (spec 2026-07-16 §4.1b B4)… the ACTIVE segment must carry the darkened bg-accent-on-bg…") AND the assertions (`:492-496`). Do not leave the old comment prefix. Replace with:

```tsx
// progress lives in a role="img" indicator — NOT decorative. The ACTIVE segment
// carries the vibrant bg-accent fill; its WCAG 1.4.11 3:1 boundary is the
// border-accent-edge stroke (DESIGN.md §1.2: 8.06:1 vs bg, 3.61:1 vs the fill).
const activeSeg = progress(container)?.querySelector('[data-segment-active="true"]');
expect(activeSeg, "active segment not rendered").toBeTruthy();
const segTokens = new Set((activeSeg!.getAttribute("class") ?? "").split(/\s+/));
expect(segTokens.has("bg-accent")).toBe(true);
expect(segTokens.has("border-accent-edge")).toBe(true);
expect(segTokens.has("border")).toBe(true);
expect(segTokens.has("bg-accent-on-bg")).toBe(false);
```

- [ ] **Step 2: Run the test — verify it FAILS.**

Run: `cd /Users/ericweiss/fxav-worktrees/hero-segment-vibrancy && pnpm vitest run tests/components/crew/rightNowHero.test.tsx -t "re-derives to show_day_2"`
Expected: FAIL — the live segment still carries `bg-accent-on-bg`, so `has("bg-accent")` is false. (The active-segment class assertion lives in the `mount in show_day_1 ... re-derives to show_day_2` test at `rightNowHero.test.tsx:478`, block `:494-496`.)

- [ ] **Step 3: Edit the component (make it GREEN).**

In `components/crew/RightNowHero.tsx`, update the comment at `:556-558` and the class at `:559`:

```tsx
                      "h-1.5 flex-1 rounded-pill",
                      // Load-bearing graphical indicator (role="img" show-day
                      // progress): vibrant bg-accent fill; the border-accent-edge
                      // stroke is the 3:1 WCAG 1.4.11 boundary (DESIGN.md §1.2).
                      active ? "border border-accent-edge bg-accent" : "bg-border",
```

- [ ] **Step 4: Run the component test — verify it PASSES.**

Run: `pnpm vitest run tests/components/crew/rightNowHero.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 5: Run the bg-accent inventory meta-test — verify it now FAILS (new unregistered occurrence).**

Run: `pnpm vitest run tests/styles/_metaBgAccentInventory.test.ts`
Expected: FAIL — `UNREGISTERED components/crew/RightNowHero.tsx:559 (occurrence 1)`. The active segment is now a second exact-token `bg-accent` occurrence (occurrence 0 = live-dot at `:498`).

- [ ] **Step 6: Register the occurrence (make the meta-test GREEN).**

In `tests/styles/_metaBgAccentInventory.test.ts`, in the `// decorative (7)` block the file already has `D("components/crew/RightNowHero.tsx", 0)` (the live-dot). Add an `edge-treated` row for occurrence 1. Place it in the `// edge-treated (6)` group and bump the group count comment to `(7)`:

```ts
  // edge-treated (7)
  E("components/admin/OnboardingWizard.tsx", 0),
  E("components/admin/PublishedToggle.tsx", 0),
  E("components/admin/settings/AutoPublishToggle.tsx", 0),
  E("components/admin/settings/DeveloperToggleButton.tsx", 0),
  E("components/admin/settings/NotifyToggle.tsx", 0),
  E("components/admin/telemetry/AutoRefreshControl.tsx", 2),
  E("components/crew/RightNowHero.tsx", 1),
```

The `E(...)` helper sets context `"border-accent-edge bg-accent"`; the source line `active ? "border border-accent-edge bg-accent" : "bg-border",` contains that substring and `border-accent-edge`, satisfying both the context and the `edge-treated` guard.

- [ ] **Step 7: Run the meta-test — verify it PASSES.**

Run: `pnpm vitest run tests/styles/_metaBgAccentInventory.test.ts`
Expected: PASS (`problems` empty).

- [ ] **Step 8: Update DESIGN.md §1.2.**

In `DESIGN.md`, the `--color-accent-edge` row (`:35`) describes it as "ON-state control boundary (toggle track border, active step pill)." Append the new consumer:

`ON-state control boundary (toggle track border, active step pill, active show-day progress segment).`

No numeric change (same token pairing, same ratios already documented).

- [ ] **Step 9: Full targeted verification.**

Run: `pnpm vitest run tests/components/crew/rightNowHero.test.tsx tests/styles/_metaBgAccentInventory.test.ts tests/styles/_metaRawAccentText.test.ts`
Expected: all PASS. (`_metaRawAccentText` is unaffected — we added a `bg-*` fill, not a `text-accent*` token — but it scans the same files, so confirm no regression.)

- [ ] **Step 10: Commit.**

```bash
git add components/crew/RightNowHero.tsx tests/components/crew/rightNowHero.test.tsx tests/styles/_metaBgAccentInventory.test.ts DESIGN.md
git commit --no-verify -m "fix(crew-page): ACCENT-PASS-1 — vibrant active show-day segment with accent-edge boundary"
```

_Steps 11-14 are the ledger reconciliation for the same deliverable — kept inside Task 1 (not a separate task) because a docs-only DEFERRED/BACKLOG edit carries no behavioral surface and therefore no RED-test step; invariant 1's failing-test cycle is satisfied by Steps 1-9 above, and the reconciliation ships in the same task as a second commit._

- [ ] **Step 11: Mark ACCENT-PASS-1 resolved in `DEFERRED.md`.**

Change the `ACCENT-PASS-1` heading (`:621`) to `✅ RESOLVED` and add a resolution line citing this spec/plan + the `border-accent-edge bg-accent` treatment and the §3 contrast tables. Rewrite the `:625` "Backlog: `BL-HERO-SEGMENT-VIBRANCY`" line to: "Closed directly in DEFERRED — no `BL-*` row was ever filed."

- [ ] **Step 12: Add the `HERO-VIBRANCY-DIM-1` DEFERRED-AS-N/A row** (mirrors `KINDDOT-DIM-1`): the segment's dims are CSS literals with border-box; no fixed-parent stretch dependency, so no real-browser `getBoundingClientRect` parity test — the hairline visual is covered by the impeccable real-browser gate.

- [ ] **Step 13: BACKLOG.md — no change (verify).** Run `grep -rn "BL-HERO-SEGMENT-VIBRANCY" BACKLOG.md` — expected: no output (never filed). Nothing to flip; the aspirational reference lived only in DEFERRED.md:625 and is rewritten in Step 11.

- [ ] **Step 14: Commit the reconciliation.**

```bash
git add DEFERRED.md
git commit --no-verify -m "docs: reconcile ACCENT-PASS-1 resolved (no BACKLOG twin filed)"
```

---

### Task 2: Impeccable dual-gate + whole-diff review (milestone close-out)

**This is a review/gate task, not an implementation task — it authors no behavioral surface, so it has no RED-test step (invariant 1's failing-test cycle governs code-bearing tasks; Task 1 carries it).** The task RUNS the gates and records dispositions. If any gate surfaces a P0/P1/P2 that needs a code fix, that fix follows the normal micro-cycle inside this task — failing test → minimal fix → passing test → its own commit — before the gate is re-run to green. The §12 results-recording is committed as a docs commit (Step 5).

- [ ] **Step 1:** Run `/impeccable critique` on the diff (setup gates: `context.mjs` load, register read). UI surface = `RightNowHero.tsx` + `DESIGN.md`.
- [ ] **Step 2:** Run `/impeccable audit` on the diff (a11y/contrast/responsive). Real-browser screenshot of the hero progress bar at light + dark to confirm the 1px stroke reads as a crisp hairline on the 6px pill (the one visual judgment §4 defers to this gate). Also capture the `bg-stale-tint` morph state if reachable in the harness (spec §3 morph-path).
- [ ] **Step 3:** For any P0/P1/P2 requiring a code fix: write the failing test, apply the minimal fix, confirm green, commit (`fix(crew-page): …`), then re-run the affected gate.
- [ ] **Step 4:** Record findings + dispositions (P0/P1/P2 fixed or DEFERRED) in this plan's §12.
- [ ] **Step 5: Commit the gate results.**

```bash
git add docs/superpowers/plans/2026-07-17-hero-segment-vibrancy.md
git commit --no-verify -m "docs(plan): record impeccable dual-gate results (§12)"
```

- [ ] **Step 6:** Whole-diff Codex cross-model review to APPROVE.

---

## Self-Review

- **Spec coverage:** §2 change → Task 1 Step 3; §3 contrast (no code, doc) → cited in test comment + DESIGN.md; §6.1 test → Task 1 Steps 1-2; §6.2 registry → Task 1 Steps 5-7; §6.3 DESIGN.md → Task 1 Step 8; §5/§8 reconciliation → Task 1 Steps 11-14; §4 DEFERRED-AS-N/A → Task 1 Step 12; invariant 8 → Task 2. All covered.
- **Placeholder scan:** none.
- **Type consistency:** N/A (no new types; className strings only). Occurrence index `1` used consistently (spec §6.2, plan Task 1 Step 6).
- **Anti-tautology:** the component test scopes to the `[data-segment-active="true"]` node's own class set, not a container that renders both segments — a bug leaving the inactive segment wrong or the active un-edged fails.

## §12 — Impeccable dual-gate results (invariant 8)

Run on the `feat/hero-segment-vibrancy` diff (`RightNowHero.tsx` active segment + `DESIGN.md` §1.2), 2026-07-17.

**`/impeccable critique` — PASS.** Method: dual-agent (A: design review, B: detector + real-browser). AI-slop verdict: **intentional craft** (token-disciplined reuse of the ratified `border-accent-edge bg-accent` toggle recipe; DESIGN.md §1.2 already names the segment a consumer). Banned-pattern check CLEAR — this is a full 1px enclosing border on a `rounded-pill`, NOT a side-stripe >1px. Detector `detect.mjs --json` exit 0, findings `[]`. No P0/P1/P2.
- **P3 (A) — RESOLVED by B.** "Does the 1px `#7a3d00` stroke on a 6px (`h-1.5`) pill read as a crisp hairline or a heavy frame?" B's real-browser render (Playwright chromium, 390px@2x, 4 cells = {light,dark}×{surface,stale-tint}) confirms: crisp hairline, fill not swallowed (border-box holds 6px), vibrant orange clearly distinguishable from inactive `bg-border` on all four cells, dark `#ffa047` rim visible, no muddying. Screenshots: `bar-light.png` / `bar-dark.png` (scratchpad). Not a defect.

**`/impeccable audit` — PASS, 20/20.** A11y 4 (1.4.11 3:1 via edge on every surface/theme; role="img"+aria-label unchanged; no interactive-target change) · Performance 4 (static border; no animation/thrash/re-render/import) · Theming 4 (tokens only, both modes browser-verified) · Responsive 4 (`flex-1`+border-box, no shift/overflow at 390px) · Anti-patterns 4 (detector `[]`, full-border not side-stripe, accent used sparingly). No P0/P1/P2/P3.

**Disposition:** no findings to fix or defer. `HERO-VIBRANCY-DIM-1` (real-browser dimension assertion) stays DEFERRED-AS-N/A — the hairline visual it would have covered is confirmed by this gate's real-browser pass.
