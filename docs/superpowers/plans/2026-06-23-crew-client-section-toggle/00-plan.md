# Crew client-side section toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Section tabs switch instantly (client-side toggle over server-rendered bodies, no server round-trip per tap), with sheet-sync freshness and every crew contract preserved.

**Architecture:** `_CrewShell` (server) renders ALL entitled section bodies into `sectionNodes: Record<SectionId, ReactNode>` and hands them to a new client controller `CrewSections`, which owns `activeSection` state, renders the controlled `CrewSubNav` + the existing `CrewSectionTransition` over `sectionNodes[active]`, and on select does a shallow `?s=` URL update (`history.pushState`) + scroll — no `router.push`, so the dynamic route never re-renders per tab. Freshness rides the unchanged `ShowRealtimeBridge → router.refresh()` path (all bodies re-render server-side; client `active` survives).

**Spec:** `docs/superpowers/specs/2026-06-23-crew-client-section-toggle.md` (Codex-APPROVED round 1).

## Global Constraints
- **Invariant — freshness (NON-NEGOTIABLE):** section bodies stay **server-sourced**; the client controller toggles visibility only — NEVER fetches/derives/caches section data client-side. `router.refresh()` (realtime) must re-render all bodies fresh while `active` persists.
- **Invariant 8 (impeccable UI gate) APPLIES** — `/impeccable critique` + `/impeccable audit` (external) at close-out; real-browser perf-budget + dimensional checks (jsdom insufficient).
- **Preserve:** budget gate (`financialsVisible` single authority; Budget body+tab iff entitled; non-lead `?s=budget`→`today`), no-Budget-flash, `CrewSectionTransition` crossfade + reduced-motion, Footer report-autocapture (section-independent), scroll-to-top, deep-link/back-button via `?s=`, `aria-current`, equal-width mobile tabs, `CREW_PAGE_CONTAINER` alignment, the mobile fixed-bottom-bar dimensional invariant.
- **No** migration, no Supabase call-boundary change (invariant 9 N/A — `getShowForViewer` untouched), no advisory locks.
- **TDD per task; commit per task** (`feat`/`fix`/`test`/`refactor(crew)`); `--no-verify`; run `pnpm exec prettier --write` on touched files before each commit; trailers `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_012UbLmBoAmaFbndpRpLNwdp`. Runner: `pnpm exec vitest run <file>` (jsdom via `// @vitest-environment jsdom`).

## File Structure
- `components/crew/CrewSubNav.tsx` — modify (controlled: drop nav logic, add `onSelect`).
- `components/crew/CrewSections.tsx` — **new** client controller.
- `app/show/[slug]/[shareToken]/_CrewShell.tsx` — modify (render all bodies → `sectionNodes`; render `<CrewSections>`; keep Header/Bridge/Footer server).
- Tests: new `tests/components/crew/crewSections.test.tsx`; update `crewSubNav.test.tsx`, `noPrefetchAlert.test.tsx`, `crewShell.test.tsx`, `crewShellSections.test.tsx`, `crewShellAlert.test.tsx`, `sourceLinkCoverage.test.tsx`, `previewAsRoute.test.tsx`, `transitionAudit.test.tsx`, `tests/e2e/crew-page.spec.ts`, `tests/e2e/picker-flow.spec.ts`.

---

### Task 1: `CrewSubNav` → controlled presentational component

**Files:** `components/crew/CrewSubNav.tsx`; `tests/components/crew/crewSubNav.test.tsx` (update).

**Interfaces produced:** `CrewSubNavProps = { activeSection: SectionId; budgetVisible: boolean; onSelect: (id: SectionId) => void }`.

- [ ] **Step 1 (failing test):** update `crewSubNav.test.tsx` — render `<CrewSubNav activeSection="today" budgetVisible onSelect={spy} />`; assert: clicking a tab (`getAllByRole("button")` / `data-section`) calls `onSelect(id)` (NOT `router.push`); active tab has `aria-current="page"`; Budget tab present iff `budgetVisible`; the component imports NO `next/navigation` `useRouter`/`router.push` and NO `next/link`; `data-testid="crew-sub-nav"` + `data-section` present; equal-width mobile tabs (`min-w-0 flex-1`). The current router.push/scroll assertions are REMOVED (scroll now lives in the controller). Run → FAIL.
- [ ] **Step 2:** run, verify fail.
- [ ] **Step 3 (impl):** remove `useRouter`/`usePathname`/`useSearchParams`/`buildSectionHref`/`navigate`/`window.scrollTo`. Add `onSelect` to props. `tab(...)` `onClick={() => onSelect(id)}`. Keep everything else verbatim (desktop row + mobile fixed bar, glyphs, `aria-current`, `data-section`, `data-testid`, equal-width, `CREW_PAGE_CONTAINER`, focus rings, color token).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** prettier + commit `refactor(crew): make CrewSubNav a controlled component (onSelect, no per-tab router.push)`.

### Task 2: `CrewSections` client controller

**Files:** `components/crew/CrewSections.tsx` (new); `tests/components/crew/crewSections.test.tsx` (new, jsdom).

**Interfaces:** `CrewSectionsProps = { initialSection: SectionId; budgetVisible: boolean; sectionNodes: Partial<Record<SectionId, ReactNode>> }`.

- [ ] **Step 1 (failing test):** `crewSections.test.tsx` — mock `next/navigation` (`usePathname`→`/show/x/tok`, `useSearchParams`→empty), spy `window.history.pushState` + `window.scrollTo`. Render `<CrewSections initialSection="today" budgetVisible sectionNodes={{today:<div data-testid="body-today"/>, schedule:<div data-testid="body-schedule"/>, …}} />`. Assert:
  (a) initial: `body-today` visible; `data-active-section="today"` on the controller wrapper.
  (b) click the Schedule tab (`data-section="schedule"`) → `body-schedule` visible, `data-active-section="schedule"`, `history.pushState` called with a URL containing `?s=schedule`, `window.scrollTo(0,0)` called, and `useRouter().push` is NEVER called (assert the router-push spy is untouched — proves no server nav).
  (c) `popstate` with `location.search="?s=venue"` → `body-venue` visible (mock location).
  (d) a non-entitled section (no `budget` in `sectionNodes` when `budgetVisible=false`) → no Budget tab; `?s=budget` initial resolves to `today`.
  (e) **freshness:** re-render with NEW `sectionNodes` (new `body-today` content) while staying on `today` → the new content shows AND `active` is still `today` (data flows from the prop, not client cache).
  Run → FAIL (module missing).
- [ ] **Step 2:** run, verify fail.
- [ ] **Step 3 (impl):** create `components/crew/CrewSections.tsx`:
  ```tsx
  "use client";
  import { usePathname, useSearchParams } from "next/navigation";
  import { useCallback, useEffect, useState, type ReactNode } from "react";
  import { CrewSubNav } from "@/components/crew/CrewSubNav";
  import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";
  import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
  import { buildSectionHref } from "@/lib/crew/sectionHref";
  import { resolveActiveSection, type SectionId } from "@/lib/crew/resolveActiveSection";

  export interface CrewSectionsProps {
    initialSection: SectionId;
    budgetVisible: boolean;
    sectionNodes: Partial<Record<SectionId, ReactNode>>;
  }

  export function CrewSections({ initialSection, budgetVisible, sectionNodes }: CrewSectionsProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [active, setActive] = useState<SectionId>(initialSection);

    const onSelect = useCallback(
      (id: SectionId) => {
        if (id === active) return;
        setActive(id);
        // Shallow URL: history.pushState updates ?s= WITHOUT a server render
        // (no router.push → the dynamic route does not re-run getShowForViewer).
        // Next App Router keeps useSearchParams in sync with history.pushState.
        window.history.pushState(null, "", buildSectionHref(pathname, searchParams, id));
        window.scrollTo(0, 0);
      },
      [active, pathname, searchParams],
    );

    useEffect(() => {
      const onPop = () => {
        const raw = new URLSearchParams(window.location.search).get("s");
        setActive(resolveActiveSection(raw, { budgetVisible }));
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    }, [budgetVisible]);

    // Guard: active must be a present, entitled key (resolveActiveSection only
    // returns entitled ids; fall back to today if a body is somehow missing).
    const body = sectionNodes[active] ?? sectionNodes.today ?? null;

    return (
      <div data-testid="crew-shell-sections" data-active-section={active}>
        <CrewSubNav activeSection={active} budgetVisible={budgetVisible} onSelect={onSelect} />
        <main
          data-testid="page-container"
          className={`${CREW_PAGE_CONTAINER} flex flex-1 flex-col gap-section-gap pt-6 pb-[calc(var(--spacing-tap-min)+env(safe-area-inset-bottom)+1rem)] sm:pt-8 min-[720px]:pb-8`}
        >
          <CrewSectionTransition sectionId={active}>{body}</CrewSectionTransition>
        </main>
      </div>
    );
  }
  ```
  (The `<main>` className is moved verbatim from `_CrewShell.tsx:324`; `ShowRealtimeBridge`/`Header`/`Footer` stay in `_CrewShell`.)
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** prettier + commit `feat(crew): CrewSections client controller — instant section toggle + shallow ?s= URL`.

### Task 3: `_CrewShell` — render all bodies, mount the controller

**Files:** `app/show/[slug]/[shareToken]/_CrewShell.tsx`; update `crewShell.test.tsx` + `crewShellSections.test.tsx` + `crewShellAlert.test.tsx`.

- [ ] **Step 1 (failing test):** update `crewShellSections.test.tsx` — render `<CrewShell …>` for a LEAD viewer; assert ALL 7 section bodies are present in the markup (each section's distinctive testid/text), not just the active one; `data-active-section` reflects the initial `?s=`; for a NON-lead, NO Budget body/tab. Update `crewShellAlert.test.tsx` to confirm `upsertAdminAlert` still fires ONCE when `tileErrors` non-empty (it now fires once per load regardless of section). Run → FAIL.
- [ ] **Step 2:** run, verify fail.
- [ ] **Step 3 (impl):** in `_CrewShell.tsx`, replace `renderSection()`/`sectionBody` + the inline `<CrewSubNav>`/`<main>`/`<CrewSectionTransition>` (`:260-327`) with:
  - a `renderOne(id: SectionId): ReactNode` switch (the existing per-section JSX, same `({data,viewer,today,showId})` contract);
  - `const entitled: SectionId[] = budgetVisible ? [...BASE_SECTION_IDS, "budget"] : [...BASE_SECTION_IDS];`
  - `const sectionNodes = Object.fromEntries(entitled.map((id) => [id, renderOne(id)])) as Partial<Record<SectionId, ReactNode>>;`
  - render order: `<Header …/>` then `<CrewSections initialSection={activeSection} budgetVisible={budgetVisible} sectionNodes={sectionNodes} />` then `<ShowRealtimeBridge …/>` then `<Footer …/>`, all inside the existing `<div data-testid="crew-shell" data-active-section={activeSection}>` (keep `crew-shell` testid; `_CrewShell`'s outer `data-active-section` may stay as the server first-paint value — the controller owns the live one on its own wrapper). Keep the `upsertAdminAlert`, `resolveViewerContext`, `budgetVisible`, `today`, `rightNowCtx`, `headerShow`, `statusPill` logic verbatim.
  - NOTE: `ShowRealtimeBridge` stays a sibling (section-independent); Footer stays a sibling with its unchanged `reportAutocapture`.
- [ ] **Step 4:** run the 3 shell tests → PASS; `pnpm exec tsc --noEmit` → clean.
- [ ] **Step 5:** prettier + commit `refactor(crew): _CrewShell renders all section bodies, mounts CrewSections controller`.

### Task 4: Class-sweep the remaining crew tests + the noPrefetchAlert meta-guard

**Files:** `tests/components/crew/noPrefetchAlert.test.tsx`, `crewSubNav.test.tsx` (if not fully done in T1), `crewShell.test.tsx`, `sourceLinkCoverage.test.tsx`, `previewAsRoute.test.tsx`, `transitionAudit.test.tsx`.

- [ ] **Step 1:** `noPrefetchAlert.test.tsx` group (i) — rewrite to the new contract: CrewSubNav does section nav via `onSelect` (assert it has an `onSelect` prop / no `router.push` / no `next/link` import / still `<button>`); the controller updates the URL via shallow `history.pushState` NOT `router.push` (assert `CrewSections.tsx` contains `history.pushState` and NO `router.push`). Group (ii) (routes dynamic; `SectionChipLink prefetch={false}`) UNCHANGED. Add: section nav performs no server navigation (no `router.push` in either file).
- [ ] **Step 2:** `transitionAudit.test.tsx` — the section crossfade is now driven by the controller's `active` state; assert `CrewSectionTransition` keys on the controller's section and the COMPOUND case (a re-render with same `active` but new `sectionNodes` does not change the key → no re-animate). Keep reduced-motion + exit/initial/animate assertions.
- [ ] **Step 3:** update `crewShell.test.tsx`, `sourceLinkCoverage.test.tsx`, `previewAsRoute.test.tsx` for: all bodies rendered (toggle), `data-active-section` on the controller wrapper, CrewSubNav controlled. (`sourceLinkCoverage`/`previewAsRoute` mostly assert section content + preview behavior — confirm they still pass with all-bodies-rendered; fix selectors if they assumed only-active-rendered.)
- [ ] **Step 4:** run all updated files → PASS.
- [ ] **Step 5:** prettier + commit `test(crew): update nav/shell tests + noPrefetchAlert guard for client-toggle nav`.

### Task 5: e2e

**Files:** `tests/e2e/crew-page.spec.ts`, `tests/e2e/picker-flow.spec.ts`.

- [ ] **Step 1:** update/add e2e: tapping a section tab updates the visible section AND the URL `?s=` with **no navigation/network round-trip** (assert via `page.on("request")` that no document/RSC request fires on a section tap, or that the nav event doesn't occur); browser Back restores the prior section; a deep-link `?s=schedule` lands on Schedule. Keep existing picker-flow assertions.
- [ ] **Step 2:** run the e2e specs (Playwright) → PASS (or document the runner requirement if e2e isn't in the local set; ensure CI covers it).
- [ ] **Step 3:** prettier + commit `test(crew): e2e — section tabs are client toggles (no round-trip), back-button + deep-link`.

### Task 6: Full verification
- [ ] `pnpm exec vitest run --exclude '**/tests/admin/test-auth-gate.test.ts' --exclude '**/tests/cross-cutting/pg-cron-coverage.test.ts' --exclude '**/tests/cross-cutting/email-canonicalization.test.ts'` → green.
- [ ] `pnpm exec tsc --noEmit` clean; `pnpm format:check` clean; eslint changed files clean.
- [ ] Commit any incidental fixes.

### Task 7: Invariant-8 impeccable close-out + real-browser perf/dimension gate
- [ ] `/impeccable critique` AND `/impeccable audit` (fresh subagent, external) on `git diff origin/main...HEAD -- app components`. HIGH/CRITICAL fixed or `DEFERRED.md`'d.
- [ ] **Real-browser PERF budget (design-call scrutiny):** boot the app, load a crew page (lead viewer, content-heavy fixture), measure: (a) a section tab tap issues **0 network requests** (the win — `page.on("request")`); (b) initial HTML/RSC transfer + first-contentful render vs the pre-change baseline — assert ≤ ~25% payload increase. If a content-heavy show blows the budget → **STOP and surface** (fall back to lazy/cache-backed variant).
- [ ] **Real-browser dimensional check:** the mobile fixed bottom bar — each tab fills the bar height; bar clears `env(safe-area-inset-bottom)`; equal-width tabs; `<main>` bottom clearance prevents occlusion. `getBoundingClientRect` assertions, 0.5px tolerance.
- [ ] Record findings + perf numbers in the PR.

### Task 8: Self-review
- [ ] Re-read spec §3/§5/§9; confirm each contract has a landed task+test. Grep the diff: NO client-side section data fetch (freshness); NO `router.push` for section nav; `history.pushState` present; budget body+tab only when entitled; `data-active-section` reactive; `SectionChipLink prefetch={false}` + noPrefetchAlert group (ii) intact; no migration.

### Task 9: Close-out — whole-diff Codex review + CI + merge
- [ ] Whole-diff Codex review (`codex exec`, BACKGROUNDED per the launch guard; stall Monitor; fresh-eyes, REVIEWER ONLY), iterate to APPROVE. Triage via deferral discipline.
- [ ] Push; open PR (base `main`). Body: scope, the prefetch→client-toggle re-scope (+ correct the BACKLOG entry), freshness invariant, perf numbers, impeccable dispositions, "no migration."
- [ ] Watch real CI to green (quality, unit-suite, e2e, screenshots-drift, deep-link-walker). Reconcile if BEHIND base.
- [ ] `gh pr merge --merge`; ff local `main` (`git -C <main-checkout> merge --ff-only origin/main`); verify `rev-list --left-right --count main...origin/main` == `0  0`. Correct the `BL-CREWSUBNAV-PREFETCH-ENABLEMENT` BACKLOG entry (mark superseded by this milestone).

---

## Self-Review (run after drafting)
1. **Spec coverage:** freshness→T2/T6 + T8 grep; instant toggle→T2/T5; CrewSubNav controlled→T1; all-bodies→T3; budget gate→T1/T2/T3; transition+compound→T4; perf budget→T7; dimensional→T7; noPrefetchAlert→T4. ✓
2. **No placeholders:** controller code is concrete; CrewSubNav prop change explicit; `_CrewShell` sectionNodes construction explicit.
3. **Anti-tautology:** freshness test asserts new content flows from the prop (data source), not the container; toggle test asserts `router.push` is NEVER called (no server nav) + `history.pushState` IS; perf test asserts 0 network requests on a tap.
4. **Type consistency:** `SectionId`, `Partial<Record<SectionId, ReactNode>>`, `onSelect: (id: SectionId)=>void`, `resolveActiveSection(raw,{budgetVisible})` — consistent across T1–T3.
