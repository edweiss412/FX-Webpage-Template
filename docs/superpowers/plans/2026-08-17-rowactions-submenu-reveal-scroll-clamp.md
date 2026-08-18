# Plan — capped-submenu reveal scroll clamp

**Spec:** `docs/superpowers/specs/ci/2026-08-17-rowactions-submenu-reveal-scroll-clamp-design.md` (canonical; this plan implements it and restates nothing normative). **Branch:** `fix/rowactions-submenu-reveal-flake`. **Ledger:** `BL-ROWACTIONS-SUBMENU-REVEAL-E2E-FLAKE`, `BL-ADVISORY-E2E-JOBS-FLAKE-ACROSS-IDENTICAL-CODE`.

**Routing:** UI files (`components/admin/**`) → Opus + Claude Code implementer, per the AGENTS.md hard rule. The implementation session runs the invariant-8 dual gate — run /impeccable critique then /impeccable audit on the affected diff — and fills the machine closeout marker in §12 before the whole-diff review.

**Arc-F fence:** arc F later touches `components/admin/ShowRowActions.tsx`. This plan touches that file not at all; implementation still serializes before arc F per the orchestrator brief.

**Meta-test inventory (writing-plans rule):** CREATES tests/components/_metaScrollNeutralMeasurement.test.ts and tests/components/naturalSize.test.ts (both new). EXTENDS none. Advisory-lock topology: N/A — no `pg_advisory*` path touched. Mutation-surface observability (invariant 10): N/A — no mutating route or server action touched. Source-mutation registry enrolment: N/A — the shipped surface is a React measurement helper, not a guard/proof module with a Vitest-importable defect class of "reports OK while the output moved"; the guard being shipped (the meta-test) is itself a test, which the registry does not enroll.

**e2e harness readiness (writing-plans rule):** (a) server boot: local `pnpm dev -H 127.0.0.1 -p ${E2E_PORT}` / CI `pnpm build && pnpm start` per `playwright.config.ts` webServer entry 1; run local e2e with an `E2E_PORT` other than 3000 so a sibling worktree's dev server is never silently reused (`playwright.config.ts:5-8`). (b) readiness gate: `lastSeededTrigger`'s `toHaveCount(SEEDED_SHOWS)` settle on `shows-find-input` filtering (`tests/e2e/rowactions-geometry.spec.ts:116-132`) — never `networkidle`. (c) detach-safety: every `panel.evaluate` in the strengthened case runs while the submenu is held open by the test's own flow; no sampler outlives its element.

**Test wiring (writing-plans rule):** both new suites match `BASE_INCLUDE` (`vitest.projects.ts:34`, `tests/**/*.test.ts`) and run in the standard unit-suite CI job with no config edit; the e2e change edits an existing file already named by `admin-layout-e2e.yml` and by the desktop-chromium testMatch regex (`playwright.config.ts:97` — desktop-chromium ONLY; the mobile-safari matcher does not list it). ONE path-filter change IS required (plan-R1 F4): lib/popover/naturalSize.ts (new) joins `admin-layout-e2e.yml`'s paths in Task 1, plus the derived sweep over other `lib/popover`-listing workflows.

**Heavy wrapping:** every non-interactive Playwright invocation below runs under `pnpm heavy` (machine-wide slot semaphore), foreground, never backgrounded across a turn boundary.

## Acceptance criteria (from spec §6; the `ac=` markers below bind to these)

- **AC-1** (spec §6 AC-1): mechanism closed; the helper's contract suite is its durable unit-level proof.
- **AC-2** (spec §6 AC-2): strengthened case red 10/10 pre-fix, green 10/10 post-fix, locally.
- **AC-3** (spec §6 AC-3): full CI file set green locally, no regression.
- **AC-4** (spec §6 AC-4): derived-cover meta-test green, and red under a deliberate bare-clear reintroduction (verified at plan time: the pre-repair tree IS that reintroduction, red on exactly the four sites).
- **AC-7** (spec §6 AC-7): §5.4 pins per the family matrix (family A at three sites; family B at all four; family C at the two scroll-listening surfaces), each shown red against every applicable migration mutant.
- **AC-5** (spec §6 AC-5): nine-dispatch CI probe, 0/9 failures against the 4/9 baseline.
- **AC-6** (spec §6 AC-6): ledger dispositions land in the PR's last commit.

## Plan-time validation already executed (2026-08-17, this branch)

The three test artifacts below were drafted, spliced into the live tree, and RUN at plan time; transcripts follow each task. The temporary helper used for the green-reachability check was deleted afterward — the implementation re-lands it via TDD. The two drafted test files were likewise removed after capture; the fenced blocks in Tasks 2-3 are their exact validated content (typecheck: `pnpm typecheck` exits 0 with all three present; the one strict-mode violation found at plan time — an `HTMLElement`-to-record cast in the spy cleanup — is already repaired in the embedded content, which uses `Reflect.deleteProperty`).

- Meta-test observed RED set (exactly the spec §4.3 table, nothing else):
  `components/admin/AnchoredPortal.tsx`, `components/admin/HoverHelp.tsx`, `components/admin/showpage/ShareHub.tsx`, `components/admin/useFitWithinClip.ts`; scanner self-tests green.
- Unit suite observed RED: `Failed to resolve import "@/lib/popover/naturalSize"`. With the spec §4.2 helper (post-R1 hardened form: SyncOnly type, inert probe, heightAtWidth finally) materialized verbatim: green (all cases), typecheck clean. (Counts per run are in the transcripts; the suite grew across review rounds, so no fixed number is restated here.)
- Baseline behavior: spec §2 probes (P2: reveal reverts to `scrollTop 0` ~8ms after `End`, 5/5; P3: shipped test 10/10 green on the same defective tree).

<!-- tasks: depth=2 red-contract -->

## Task 1 — withNaturalSize helper, TDD, and its CI wiring

<!-- task: red=`pnpm vitest run tests/components/naturalSize.test.ts` red-state=authored red-target=`lib/popover/naturalSize.ts` why=`the module does not exist; the suite's import fails to resolve, and once the module lands each contract case (clear-both-caps, restore-on-throw, scroll snapshot restore, conditional write, runtime thenable rejection, inert probe, heightAtWidth probe) fails unless the helper implements exactly the spec §4.2 semantics` ac=AC-1 -->

1. Create tests/components/naturalSize.test.ts with exactly this content (validated at plan time — RED observed as unresolved import; all cases green against the spec §4.2 helper; typecheck clean):

```ts
/**
 * Contract tests for lib/popover/naturalSize.ts (spec §4.2). jsdom computes no
 * layout, so the browser's clamp behavior is NOT testable here; that lives in
 * the real-browser e2e case (spec §5.1). These pin the helper's contract:
 * clear-then-restore of inline caps, scroll snapshot/restore, conditional
 * writes, exception safety, and the heightAtWidth probe.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { withNaturalSize } from "@/lib/popover/naturalSize";

function box(): HTMLElement {
  const el = document.createElement("div");
  el.style.maxHeight = "200px";
  el.style.maxWidth = "300px";
  document.body.appendChild(el);
  return el;
}

describe("withNaturalSize", () => {
  it("clears both caps for the measurement and restores them on return", () => {
    const el = box();
    let during: { mh: string; mw: string } | null = null;
    const out = withNaturalSize(el, () => {
      during = { mh: el.style.maxHeight, mw: el.style.maxWidth };
      return 42;
    });
    expect(out).toBe(42);
    expect(during).toEqual({ mh: "", mw: "" });
    expect(el.style.maxHeight).toBe("200px");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("restores caps when the measure callback throws", () => {
    const el = box();
    expect(() =>
      withNaturalSize(el, () => {
        throw new Error("measurement failed");
      }),
    ).toThrow("measurement failed");
    expect(el.style.maxHeight).toBe("200px");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("restores a clamped scrollTop and scrollLeft after the caps return", () => {
    const el = box();
    el.scrollTop = 150;
    el.scrollLeft = 30;
    withNaturalSize(el, () => {
      // jsdom does not clamp on layout (it has none); simulate the browser's
      // clamp so the restore path is exercised.
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
    expect(el.scrollTop).toBe(150);
    expect(el.scrollLeft).toBe(30);
  });

  it("does not write scroll offsets that never moved", () => {
    const el = box();
    el.scrollTop = 80;
    const writes: number[] = [];
    let value = 80;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => value,
      set: (v: number) => {
        writes.push(v);
        value = v;
      },
    });
    try {
      withNaturalSize(el, () => undefined);
      expect(writes, "no scrollTop write when the measurement never moved it").toEqual([]);
    } finally {
      Reflect.deleteProperty(el, "scrollTop");
    }
  });

  it("heightAtWidth constrains, measures, and clears the probe width", () => {
    const el = box();
    const seen: string[] = [];
    const spy = vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => {
      seen.push(el.style.maxWidth);
      return { height: 111 } as DOMRect;
    });
    const h = withNaturalSize(el, (probe) => probe.heightAtWidth(240));
    expect(h).toBe(111);
    expect(seen).toEqual(["240px"]);
    expect(el.style.maxWidth).toBe("300px");
    spy.mockRestore();
  });

  it("the probe is inert after withNaturalSize returns (R1 F2)", () => {
    const el = box();
    let escaped: ((w: number) => number) | null = null;
    withNaturalSize(el, (probe) => {
      escaped = probe.heightAtWidth;
      return 0;
    });
    expect(() => escaped!(120)).toThrow("escaped");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("heightAtWidth clears its probe width even when the measurement throws (R1 F2)", () => {
    const el = box();
    const spy = vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => {
      throw new Error("detached");
    });
    withNaturalSize(el, (probe) => {
      expect(() => probe.heightAtWidth(120)).toThrow("detached");
      // caught INSIDE the callback: continued measurement must not see 120px
      expect(el.style.maxWidth).toBe("");
      return 0;
    });
    expect(el.style.maxWidth).toBe("300px");
    spy.mockRestore();
  });

  it("throws synchronously on a thenable return (R2 F1: SyncOnly union escape)", () => {
    const el = box();
    expect(() =>
      withNaturalSize(el, () => Promise.resolve(1) as unknown as number),
    ).toThrow("must be synchronous");
    expect(el.style.maxHeight).toBe("200px");
    expect(el.style.maxWidth).toBe("300px");
  });

  it("rejects async callbacks at the type level (R1 F2)", () => {
    const el = box();
    // @ts-expect-error promise-returning callbacks are rejected (SyncOnly)
    const call = () => withNaturalSize(el, async () => 1);
    void call;
  });
});
```

2. Observe RED (unresolved import). 3. Create lib/popover/naturalSize.ts (new) exactly per spec §4.2. 4. GREEN on the same command. Commit (`fix(admin):` or `feat(admin):` — the helper is new plumbing for an existing surface; use `fix(admin):` since it lands inside the defect repair).

**CI wiring, same commit (plan-R1 F4):** add the new helper path lib/popover/naturalSize.ts to `.github/workflows/admin-layout-e2e.yml`'s path filter beside the four existing `lib/popover/*` entries (`admin-layout-e2e.yml:68-71`), so a helper-only regression still fires the sole real-browser capped-scroll gate. Then run the derived sweep `grep -rn "lib/popover" .github/workflows/` and add the helper to any other workflow whose guarded components consume it (known second candidate: `published-modal-e2e.yml:51` lists `lib/popover/position.ts`; add the helper path there iff its guarded surfaces reach HoverHelp/ShareHub/AnchoredPortal; record the disposition either way in the commit).

## Task 2 — AnchoredPortal repair: strengthened e2e RED → scroll-neutral measurement + self-origin filter → GREEN

<!-- task: red=`E2E_PORT=3107 pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/rowactions-geometry.spec.ts -g "CAPPED submenu" --repeat-each=10` red-state=authored red-target=`components/admin/AnchoredPortal.tsx:139` why=`measureAndApply clears panel.style.maxHeight to measure natural size; layout with no cap clamps a scrolled panel's scrollTop to 0 and the restore at AnchoredPortal.tsx:156 does not restore it, so the reveal reverts one rAF after every keypress (spec P2, 5/5); the shipped sampling races that ~8ms window and wins locally (P3, 10/10 green), so the red appears once this task's test edit moves the sample past the revert, and the SAME command goes green when this task's call-site rewrite and §4.5 filter land` ac=AC-2,AC-3,AC-7 -->

**RED half — strengthen the e2e case (spec §5.1):**

Edit `tests/e2e/rowactions-geometry.spec.ts` in the CAPPED-submenu case only: between `await page.keyboard.press("End");` (line 357) and the `revealed` sampling `page.evaluate` (line 358), insert the settle from spec §5.1:

```ts
await page.keyboard.press("End");
// Settle: the defect class this pins reverts the reveal on the NEXT animation
// frame (measureAndApply's clamp). Two rAFs put the sample on the far side of
// any scheduled re-measure, so the assertion reads the DURABLE state (the one
// the keyboard user is left looking at) instead of racing the revert.
await page.evaluate(
  () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
);
```

Everything else in the case (premise guards, sampling body, assertions) is unchanged. RED step: run the marker command and observe 10/10 failures at the line-368 assertion (`bottom` ≈ 77px past `boxBottom`, per spec P2's `activeBottom 587 / boxBottom 433.375` shape at the local viewport). Record the observed count in the merged task's commit message.

Add the family-C second phase in the same edit (spec §5.4): after the settle and the reveal assertion, install a style-attribute MutationObserver on the panel, wait six further animation frames, assert ZERO additional `maxHeight` writes.

**GREEN half — the AnchoredPortal rewrite:**

Rewrite `measureAndApply` (`components/admin/AnchoredPortal.tsx:127-187`) per spec §4.3 row 1: the clear/measure/restore block becomes `withNaturalSize(panel, (probe) => …)`; `wrappedHeightAt: probe.heightAtWidth`; the held-style locals go away; `placeWithinVisibleViewport` inputs and the `commit` logic are unchanged. In the SAME task, add the §4.5 self-origin guard to `onScrollCapture` (`AnchoredPortal.tsx:204-215`): an event whose target is the panel or a descendant returns before the re-place branch; document-scroll dismissal and ancestor re-placement unchanged. Without the guard the restore's own scroll events loop the coalescer at one forced measurement per frame (spec §4.2/§4.5, R5 F1). Extend the strengthened §5.1 e2e case with the family-C second phase (six-frame MutationObserver window, zero further maxHeight writes) and add the jsdom family-C case to `anchoredPortal.test.tsx` (panel-targeted scroll ignored; ancestor-targeted re-places; document-targeted dismisses). GREEN: `E2E_PORT=3107 pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/rowactions-geometry.spec.ts --repeat-each=2` passes 2/2 (full file, all five cases); the CAPPED-only `--repeat-each=10` form passes 10/10; and `pnpm vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` (which now holds the family-B and family-C cases this task added) passes. Family-B and family-C mutant validation for this surface happens here (capped measurement; dropped filter — each observed red, reverted, recorded). Commit (`fix(admin):`) — the strengthened e2e case, the call-site rewrite, the filter, and the jsdom cases land together, red-then-green inside this one task.

## Task 3 — derived-cover meta-test RED → peer call sites + pins → GREEN

<!-- task: red=`pnpm vitest run tests/components/_metaScrollNeutralMeasurement.test.ts tests/components/admin/hoverHelpBlurClose.test.tsx` red-state=authored red-target=`components/admin/HoverHelp.tsx:220` why=`after Task 2, the meta-test this task authors names HoverHelp.tsx, ShareHub.tsx and useFitWithinClip.ts as bare-clear offenders; the command is red until all three route their measurement through withNaturalSize, and the HoverHelp jsdom suite in the same command pins that the rewrite preserved the component's behavior` ac=AC-4,AC-7 -->

**RED half — author the meta-test and observe the three-peer red:**

Create tests/components/_metaScrollNeutralMeasurement.test.ts with exactly this content (validated at plan time — observed RED names exactly the four spec sites; both self-test cases green; premise guard on walk coverage included):

```ts
/**
 * Invariant (spec 2026-08-17-rowactions-submenu-reveal-scroll-clamp §4.1):
 * measuring a panel's natural size must not mutate its scroll state. The only
 * place allowed to clear an inline size cap is the withNaturalSize helper,
 * which snapshots and restores scroll offsets around the clear. A bare
 * cap-clearing assignment anywhere else is the defect class that reverted
 * every keyboard reveal in the capped row-actions submenu (probe P1/P2, spec
 * §2): layout with no cap clamps scrollTop to 0 and the restore does not
 * restore it.
 *
 * Derived cover: the tree is walked from disk, so a NEW measurement site that
 * bypasses the helper fails by default. Threat fence (spec §4.4): this guards
 * the repo's established direct-assignment idiom against accidental
 * reintroduction; obfuscated spellings are a documented limit (spec §8).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const ROOTS = ["components", "lib"] as const;
const HELPER_SUFFIX = join("lib", "popover", "naturalSize.ts");

/** A cap-clearing assignment: `.style.maxHeight = ""` (any quote flavor). */
const CLEAR_RE = /\.style\.(maxHeight|maxWidth)\s*=\s*(""|''|``)/;

function walk(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
}

describe("scroll-neutral measurement (derived cover)", () => {
  it("no cap-clearing assignment outside the withNaturalSize helper", () => {
    const files: string[] = [];
    for (const root of ROOTS) walk(join(REPO_ROOT, root), files);
    // PREMISE: the walk actually covered the tree the invariant ranges over.
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter(
      (f) => !f.endsWith(sep + HELPER_SUFFIX) && CLEAR_RE.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders.map((f) => f.slice(REPO_ROOT.length + 1)),
      "cap-clearing assignment outside lib/popover/naturalSize.ts: route the measurement through withNaturalSize (spec §4.2)",
    ).toEqual([]);
  });

  // Scanner self-tests (positive AND negative, per the repair-economy rule):
  it("recognizes every quote flavor of a bare clear", () => {
    expect(CLEAR_RE.test('el.style.maxHeight = ""')).toBe(true);
    expect(CLEAR_RE.test("el.style.maxWidth = ''")).toBe(true);
    expect(CLEAR_RE.test("panel.style.maxHeight = ``")).toBe(true);
    expect(CLEAR_RE.test('body.style.maxWidth  =  ""')).toBe(true);
  });

  it("does not fire on cap SETS or unrelated properties", () => {
    expect(CLEAR_RE.test("el.style.maxWidth = `${w}px`")).toBe(false);
    expect(CLEAR_RE.test('el.style.maxHeight = "425px"')).toBe(false);
    expect(CLEAR_RE.test('el.style.height = ""')).toBe(false);
    // Placement application, not measurement (spec §4.2 both-branch writes):
    expect(CLEAR_RE.test('el.style.removeProperty("max-height")')).toBe(false);
    // Clone-capture spelling, documented limit (spec §8, captureElement.ts):
    expect(CLEAR_RE.test('clone.style.maxHeight = "none"')).toBe(false);
  });
});
```

Observe RED (the four offenders). This test goes green only at the end of Task 5; Tasks 4-5 each shrink the offender list and record the shrinking list in their commit messages. Commit the test alone (`test(admin):`) with the observed-red transcript in the message.

(Plan-time validation observed the four-site red on the pre-repair tree; after Task 2 the observed set is the three peers — the shrink is itself evidence Task 2's rewrite landed.)

**GREEN half — the three peer rewrites and their pins:**

Per spec §4.3 rows 2-4:

- `components/admin/HoverHelp.tsx` `measureAndApply` (`HoverHelp.tsx:214-241` region): measurement moves inside `withNaturalSize(body, (probe) => …)` with `wrappedHeightAt: probe.heightAtWidth`; the capture-phase scroll listener at `HoverHelp.tsx:328` gains the §4.5 self-origin guard (body-targeted events ignored), with the jsdom family-C case per spec §5.4; the conditional cap SETS at `HoverHelp.tsx:290-291` become both-branch applications — `${v}px` when the placement returns a cap, `style.removeProperty("max-height")` / `("max-width")` when it returns null — so a capped→uncapped placement ends uncapped exactly as today (spec §4.2/§4.3, R1 F1).
- `components/admin/showpage/ShareHub.tsx` (`ShareHub.tsx:287-309`): same rewrite; the post-placement SETS at `ShareHub.tsx:352-353` become the same both-branch application.
- `components/admin/useFitWithinClip.ts` `apply` (`useFitWithinClip.ts:78-95` region): the clear and the computed-cap derivation move inside `withNaturalSize`, which returns the fitted cap or null (no clipping ancestor, `useFitWithinClip.ts:85`); the site then applies both branches — fitted px, or `removeProperty("max-height")` so the stale previous fit does not survive the early-return path (spec §4.3, R1 F1).

**Site-transition pins (spec §5.4, AC-7), in the same task — TWO mutant families per the spec's closure matrix:**

Family A (cap-STATE assertions; drop-branch mutant):

- HoverHelp: no new test — the shipped standalone case "maxWidth engages inside a NARROW pane host and is CLEARED when the host widens" (`tests/e2e/hoverhelp-geometry.spec.ts:409`) is the pin; it runs in Task 6.
- ShareHub: extend `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` with an uncapped-placement case — placement returns null caps, assert both inline properties ABSENT after apply.
- useFitWithinClip: extend `tests/components/admin/useFitWithinClip.test.tsx` with a fitted→unclipped transition — apply under a clipping ancestor (cap written), re-apply with the clip gone, assert the stale fitted cap is removed. (Family A ONLY — the unclipped branch returns before any measurement, so this case cannot discriminate family B; spec §5.4, R4 F1.)
- AnchoredPortal: N/A — React owns the style prop; no hand-written application branch exists to drop (spec §5.4).

Family B (COORDINATE/SIZE assertions under style-sensitive rect stubs; capped-measurement mutant — spec §5.4 carries the review probe's discriminating numbers):

- AnchoredPortal: extend `tests/components/admin/rowActions/anchoredPortal.test.tsx` — make the panel's stub rect style-sensitive (capped dims while an inline cap is applied, natural dims when cleared), place once so a cap is written, grow available room via a position-only anchor move, flush frames, assert the re-applied cap/position derives from the NATURAL height, with a `premise` pinning natural > stale so the case cannot pass vacuously.
- HoverHelp: one analogous jsdom placement case (in `tests/components/admin/hoverHelpBlurClose.test.tsx` or a sibling file) asserting applied top/left derives from natural size.
- ShareHub: one analogous case in `shareHubVisualViewport.test.tsx` (its `stubRect` becomes style-sensitive for the body) asserting applied x derives from the natural 308px width, not a stale capped width.
- useFitWithinClip: a clipped→clipped EXPANSION case (spec §5.4, R4 F1) — apply under a clipping ancestor (cap written), GROW the clip's available room, re-apply, assert the cap equals the new larger fitted value; a capped measurement retains the stale fit and fails.

**Mutant validation (AC-7):** per site, EVERY applicable mutant — (A) drop the `removeProperty`/null branch, (B) re-order or skip the withNaturalSize wrap so measurement runs with the stale cap applied, (C) drop the §4.5 self-origin filter (AnchoredPortal in Task 4, HoverHelp here) — each observed red against the site's pins, then reverted; all observations recorded in the commit message. The pins are green on the pre-migration tree by design (regression pins, not REDs).

GREEN: marker command passes (meta-test empty offender list + HoverHelp jsdom suite green), the two extended unit suites pass, and each pin has been shown red under its mutant. Then `pnpm typecheck` and `pnpm exec eslint components/admin/AnchoredPortal.tsx components/admin/HoverHelp.tsx components/admin/showpage/ShareHub.tsx components/admin/useFitWithinClip.ts lib/popover/naturalSize.ts tests/components/naturalSize.test.ts tests/components/_metaScrollNeutralMeasurement.test.ts tests/components/admin/rowActions/anchoredPortal.test.tsx tests/components/admin/hoverHelpBlurClose.test.tsx tests/components/admin/showpage/shareHubVisualViewport.test.tsx tests/components/admin/useFitWithinClip.test.tsx`. Commit (`fix(admin):`) — the meta-test, the three peer rewrites, and their pins land together, red-then-green inside this one task.

<!-- tasks: end -->

## Task 4 — full local verification (AC-3) + the AC-1 post-fix timeline probe

Under `pnpm heavy`, foreground: `E2E_PORT=3107 pnpm exec playwright test --project=desktop-chromium tests/e2e/bell-panel-layout.spec.ts tests/e2e/admin-nav-layout-dimensions.spec.ts tests/e2e/nojs-loading-notice.spec.ts tests/e2e/needs-attention-holds.spec.ts tests/e2e/rowactions-geometry.spec.ts` — the exact CI file set from `.github/workflows/admin-layout-e2e.yml:175`. Also under `pnpm heavy`: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts` (the AC-3 HoverHelp transition pin, spec §5.4). All green. Also confirm no stray probe artifacts: `git status --porcelain` shows no `tests/e2e/probe-*` files (the plan-time probe spec was already removed; this is the check, not a deletion step).

**AC-1 post-fix probe (plan-R1 F3):** materialize Appendix A as tests/e2e/probe-rowactions-geometry.spec.ts (uncommitted), run it under `pnpm heavy` (foreground, `--project=desktop-chromium`, an off-3000 `E2E_PORT`), and require every repetition's timeline to show the reveal's `scrollTop` stable across the 400ms window — exactly one scroll event (the reveal) and `revealed: true`. Record the timelines in the task notes, then DELETE the probe file; the `git status --porcelain` check above then applies.

## Task 5 — invariant-8 dual gate + marker (before any review dispatch)

Run the gate pair named in the routing header on the affected diff with the canonical v3 setup (context load, register reference). Expected finding surface: nil (zero class/markup/token deltas — the diff is measurement plumbing), but the gate RUNS and the marker is never fabricated. Then fill the §12 marker line with the REAL outcome values. Commit the marker fill (`docs(plan): fill impeccable-gate closeout marker`) — a tracked edit is never left for a later commit to sweep up.

## Task 6 — acceptance, closeout commit, review of the merging diff, merge

Ordering is load-bearing (plan-R1 F2): the whole-diff review must cover the exact diff that merges, and invariant 12 wants the ledger markers' removal in the PR's last commit — so the closeout commit comes FIRST and the review covers it.

1. **CI acceptance instrument (AC-5):** push, then nine fixed-sha dispatches of `admin-layout-e2e` via the distinct-ref method (sibling refs at the identical sha; `cancelled` runs are not samples — spec §6 AC-5, method per PR #822). Required: 0/9 failures of the CAPPED-submenu case, against the 4/9 baseline. Record run ids in the PR body.
2. **Ledger closeout commit (AC-6) — the PR's last commit:** graduate both entries to `BACKLOG-archive.md` per spec §7 (including the filed-hypothesis correction), add the `BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` successor row per spec §7 (with its `**Reachability:** INFERRED, NOT PROBED` field), and remove both `**Status:** IN PROGRESS · **Branch:** …` markers. Push.
3. **Whole-diff cross-model review** (codex-guard, `--stage diff`) of the pushed head — the diff under review IS the diff that merges. If the review forces changes: apply them, RE-DO step 2 so the ledger-closeout commit is again last, and re-review the new head.
4. Arm auto-merge only now — after the closeout commit is pushed and the review APPROVEs (the #838 arming-window lesson); real CI green; `gh pr merge --merge`; fast-forward main and verify `git rev-list --left-right --count main...origin/main` = `0  0`.

## Appendix A — AC-1 post-fix timeline probe (uncommitted; materialized, run, and deleted by Task 4)

The P2 characterization instrument, preserved verbatim. Post-fix expectation per repetition: `scrolls` holds exactly the reveal event (no reset), `finalScrollTop` equals the reveal offset, `revealed: true`.

```ts
/**
 * PROBE (NOT COMMITTED). AC-1 post-fix verification for the capped-submenu
 * reveal (spec §6 AC-1). Instrument BEFORE the keypress; sample 400ms later.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";

const SEEDED_SHOWS = 16;
const CREW_PER_SHOW = 14;
const TITLE_PREFIX = "RowActions RevealProbe";
const DRIVE_FILE_ID = (i: number) => `rowactions-reveal-probe-e2e:${i}`;
const VIEWPORT = { width: 1280, height: 720 };
const SETUP_TIMEOUT_MS = 300_000;
const CASE_TIMEOUT_MS = 180_000;
const LAST_SEEDED_INDEX = SEEDED_SHOWS - 1;
const LAST_SEEDED_SLUG = `rowactions-probe-${LAST_SEEDED_INDEX}`;

async function lastSeededTrigger(page: Page): Promise<Locator> {
  const find = page.getByTestId("shows-find-input");
  await find.waitFor({ state: "visible" });
  await find.fill(TITLE_PREFIX);
  const triggers = page.locator('[data-testid^="row-actions-trigger-"]');
  await expect(triggers).toHaveCount(SEEDED_SHOWS);
  await page.getByTestId("shows-sort-title").click();
  const target = page.getByTestId(`row-actions-trigger-${LAST_SEEDED_SLUG}`);
  await expect(target).toHaveCount(1);
  await expect(triggers.last()).toHaveAttribute(
    "data-testid",
    `row-actions-trigger-${LAST_SEEDED_SLUG}`,
  );
  return target;
}

test.describe("PROBE: capped submenu reveal timeline (AC-1)", () => {
  let restoreDashboardState: (() => Promise<void>) | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(SETUP_TIMEOUT_MS);
    restoreDashboardState = await settleDashboardAdminState();
    for (let i = 0; i < SEEDED_SHOWS; i += 1) {
      await seedShowWithCrew({
        driveFileId: DRIVE_FILE_ID(i),
        slug: `rowactions-probe-${i}`,
        title: `${TITLE_PREFIX} ${String(i).padStart(2, "0")}`,
        published: true,
        archived: false,
        crew: Array.from({ length: CREW_PER_SHOW }, (_u, c) => ({
          name: `Probe Crew ${i}-${c}`,
          role: "Tech",
        })),
      });
    }
    const warm = await browser.newPage();
    await signInAs(warm, ADMIN_FIXTURE);
    await warm.goto("/admin", { waitUntil: "load", timeout: 300_000 });
    await warm.getByTestId("shows-find-input").waitFor({ state: "visible", timeout: 60_000 });
    await warm.close();
  });

  test.afterAll(async () => {
    test.setTimeout(SETUP_TIMEOUT_MS);
    for (let i = 0; i < SEEDED_SHOWS; i += 1) await deleteSeededShow(DRIVE_FILE_ID(i));
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setViewportSize(VIEWPORT);
    await page.goto("/admin");
  });

  for (let rep = 0; rep < 5; rep += 1) {
    test(`timeline rep ${rep}`, async ({ page }) => {
      const trigger = await lastSeededTrigger(page);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.locator('[data-testid^="row-action-preview-"]').first().click();
      const submenu = page.locator('[data-testid^="row-action-preview-menu-"]');
      await expect(submenu).toBeVisible();

      const panel = page.locator("[data-portal-scroll]").last();
      const metrics = await panel.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(metrics.scrollHeight, "premise: panel capped and scrolling").toBeGreaterThan(
        metrics.clientHeight,
      );

      await panel.evaluate((el) => {
        const w = window as unknown as {
          __probe?: { scrolls: Array<{ t: number; top: number }> };
        };
        w.__probe = { scrolls: [] };
        el.addEventListener("scroll", () => {
          w.__probe!.scrolls.push({ t: performance.now(), top: (el as HTMLElement).scrollTop });
        });
      });

      await page.keyboard.press("End");
      await page.waitForTimeout(400);

      const result = await panel.evaluate((el) => {
        const w = window as unknown as {
          __probe?: { scrolls: Array<{ t: number; top: number }> };
        };
        const active = document.activeElement as HTMLElement | null;
        const a = active?.getBoundingClientRect();
        const b = (el as HTMLElement).getBoundingClientRect();
        return {
          scrolls: w.__probe?.scrolls ?? [],
          finalScrollTop: (el as HTMLElement).scrollTop,
          activeBottom: a?.bottom ?? null,
          boxBottom: b.bottom,
          revealed: a && b ? a.bottom <= b.bottom + 0.5 : null,
        };
      });
      console.log(`PROBE-TIMELINE rep=${rep} ${JSON.stringify(result)}`);
      expect(result.revealed, "AC-1: reveal durable at 400ms").toBe(true);
      expect(
        result.scrolls.filter((e) => e.top === 0).length,
        "AC-1: no clamp-to-zero reset event",
      ).toBe(0);
    });
  }
});
```

## §12 — closeout

Filled by the implementation session at Task 7 (never fabricated in the spec+plan arc; `tests/docs/_metaInvariant8Closeout.test.ts` reds on this unmerged branch by design until then). The line to add here, with real values:

`impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`
