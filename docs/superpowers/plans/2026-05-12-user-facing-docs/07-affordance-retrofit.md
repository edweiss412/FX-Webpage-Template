# Phase G — Affordance retrofit (§9.0.1 deep-link wiring)

**Scope:** Build the `affordanceMatrix.ts` registry as the typed source of truth for §5.6's affordance matrix. Implement the render-side gate (admin-context detection with the preview-as-crew exception). Wire `Learn more →` links into existing components via `messageFor(code).helpHref`. Retrofit M3/M9/M10 source surfaces with the documented `data-testid` attributes. Ship the deep-link walker (#13) and error-renderer gate (#12).

**Prereqs:** Phase F complete (strict sequential per 00-overview.md — implies A through F also complete). Catalog with `helpHref` populated (Phase B + Phase E backfill); target pages exist (Phase E); manifest entries with WebPs (Phase F). M3/M9/M10 source components must exist — confirmed by M10 close-out (AC-12.22).

**Tasks:** G.0 → G.6 (7 tasks). G.0 (pre-execution discovery) MUST land before any other G.* commit because G.3 and G.4 both edit M9/M10-owned components whose concrete paths aren't pinned in the plan inventory yet. G.0 → G.1 → G.2 → G.3 → G.4 → G.5 → G.6 are linear.

---

### Task G.0: Pre-execution discovery (pin remaining M9/M10 component paths)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-12-user-facing-docs/00-overview.md` (replace the file-inventory placeholder rows with concrete paths)

Per r4 (addresses round-3 finding 2): G.3 and G.4 both edit components whose paths are placeholder entries in 00-overview.md's file inventory. The placeholders exist because M9/M10 components hadn't shipped at plan-write time. G.0 runs at M10 close-out (the AC-12.22 gate) and pins every remaining placeholder to a real path.

- [ ] **Step 1: Grep the live tree for each matrix row's source surface text**

For each `AFFORDANCE_MATRIX` concrete-testid row, find the owning component by grepping its `sourceSurface` description (which uses the exact UI text the affordance lives near):

```bash
# Dashboard rows:
grep -rln "Active Shows" components/ app/admin/
grep -rln "Sheets we couldn't" components/ app/admin/
grep -rln "Review staged changes" components/ app/admin/

# Per-show panel rows:
grep -rln "Sync health" components/ app/admin/
grep -rln "Crew preview links" components/ app/admin/

# Preview-as-crew banner:
grep -rln "Previewing as" components/ app/admin/

# Onboarding wizard steps:
grep -rln "Share your show folder" components/ app/admin/   # Step 1
# (Steps 2 + 3 grep similarly per master spec §9.0)
```

- [ ] **Step 2: Update `00-overview.md` file inventory**

Replace each placeholder entry with the discovered concrete file path. Known anchors from r2 plan-write time:
- `components/admin/AlertBanner.tsx` (Phase G.3 — shared error renderer)
- `components/admin/ParsePanel.tsx` (G.4 — parse warnings)
- `components/admin/ReSyncButton.tsx` (G.4 — sync health)
- `components/admin/StagedReviewCard.tsx` (G.4 — staged review)
- `components/messages/ErrorExplainer.tsx` (G.3 — "What does this mean?" expansion, confirmed live at r4)

M9/M10-discovered additions land here as a single commit.

- [ ] **Step 3: Commit the inventory update**

```bash
git add docs/superpowers/plans/2026-05-12-user-facing-docs/00-overview.md
git commit -m "docs(plan): G.0 pre-execution discovery — pin M9/M10 component paths for Phase G retrofit"
```

---

### Task G.1: `affordanceMatrix.ts` registry

**Files:**
- Create: `app/help/_affordanceMatrix.ts`

Per spec §5.6 — the matrix is the typed source of truth. Three row classes (per r10): concrete-testid rows, template-family row, negative-assertion row.

- [ ] Step 1: Write failing test `tests/help/_affordance-matrix-shape.test.ts`:
  - `AFFORDANCE_MATRIX` is non-empty
  - Every concrete-testid row has `kind: "concrete"`, `testid` matching `/^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more)$/`, `sourceRoute`, `target`
  - The template-family row has `kind: "template-family"`, `testidPattern`, `target` (with `<code>` placeholder)
  - The negative-assertion row has `kind: "negative"`, `sourceRoute` (`/show/<slug>`-shaped)
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement `app/help/_affordanceMatrix.ts`:

  ```ts
  // app/help/_affordanceMatrix.ts — Phase G.1
  //
  // Typed source of truth for spec §5.6 affordance matrix. Three row classes
  // per r10:
  //   - concrete:        one testid per row; finite, walked by test #13
  //   - template-family: per-code testid template (error-message); walked
  //                      at unit-level in test #13 via catalog iteration
  //   - negative:        no testid; test #13 asserts absence in crew context

  export type ConcreteRow = {
    kind: "concrete";
    sourceSurface: string;   // human-readable label for test failure output
    sourceRoute: string;     // route the affordance lives on
    affordance: string;      // "? tooltip" / "Learn more →" / "Take the tour"
    testid: string;          // unique data-testid
    target: string;          // /help/... URL with optional #anchor
    owningMilestone: string; // "M3 / M9" etc.
  };

  export type TemplateFamilyRow = {
    kind: "template-family";
    sourceSurface: string;
    sourceRoute: string;     // representative route; e.g., "/admin/show/<slug>"
    affordance: string;
    testidPattern: string;   // e.g., "help-affordance--error-message--<code>--learn-more"
    targetPattern: string;   // e.g., "/help/errors#<code>"
    owningMilestone: string;
  };

  export type NegativeRow = {
    kind: "negative";
    sourceSurface: string;
    sourceRoute: string;     // /show/<slug>
    assertion: string;       // human-readable: "no help-affordance--* testid present"
  };

  export type AffordanceRow = ConcreteRow | TemplateFamilyRow | NegativeRow;

  export const AFFORDANCE_MATRIX: ReadonlyArray<AffordanceRow> = [
    // Concrete (12 rows after Step 2 + Step 3 split):
    { kind: "concrete", sourceSurface: "Dashboard — Active Shows header", sourceRoute: "/admin",
      affordance: "? tooltip", testid: "help-affordance--dashboard-active-shows--tooltip",
      target: "/help/admin/dashboard#active-shows", owningMilestone: "M3 / M9" },
    { kind: "concrete", sourceSurface: "Dashboard — Sheets-we-couldn't-auto-apply header", sourceRoute: "/admin",
      affordance: "? tooltip", testid: "help-affordance--dashboard-pending-ingestion--tooltip",
      target: "/help/admin/review-queues#first-seen", owningMilestone: "M3 / M9" },
    { kind: "concrete", sourceSurface: "Dashboard — Review staged changes badge", sourceRoute: "/admin",
      affordance: "? tooltip", testid: "help-affordance--dashboard-restage-badge--tooltip",
      target: "/help/admin/review-queues#re-stage", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Dashboard footer — Take the tour", sourceRoute: "/admin",
      affordance: "Take the tour", testid: "help-affordance--dashboard-footer--tour",
      target: "/help/tour", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Per-show — Staged review card (re-stage)", sourceRoute: "/admin/show/rpas-central-2026",
      affordance: "? tooltip", testid: "help-affordance--per-show-restage-card--tooltip",
      target: "/help/admin/review-queues#re-stage", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "First-seen staged review card (/admin/show/staged/<stagedId>)",
      sourceRoute: "/admin/show/staged/STAGED_ID_PLACEHOLDER", affordance: "? tooltip",
      testid: "help-affordance--first-seen-review-card--tooltip",
      target: "/help/admin/review-queues#first-seen", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Per-show — Sync health header", sourceRoute: "/admin/show/rpas-central-2026",
      affordance: "? tooltip", testid: "help-affordance--per-show-sync-health--tooltip",
      target: "/help/admin/per-show-panel#sync-health", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Per-show — Parse warnings header", sourceRoute: "/admin/show/rpas-central-2026",
      affordance: "? tooltip", testid: "help-affordance--per-show-parse-warnings--tooltip",
      target: "/help/admin/parse-warnings", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Per-show — Crew preview links header", sourceRoute: "/admin/show/rpas-central-2026",
      affordance: "? tooltip", testid: "help-affordance--per-show-preview-links--tooltip",
      target: "/help/admin/preview-as-crew", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Preview-as-crew sticky banner", sourceRoute: "/admin/show/rpas-central-2026/preview/eric-weiss",
      affordance: "? icon", testid: "help-affordance--preview-banner--tooltip",
      target: "/help/admin/preview-as-crew#impersonation-banner", owningMilestone: "M9" },
    { kind: "concrete", sourceSurface: "Onboarding wizard — Step 1 (service-account email)",
      sourceRoute: "/admin", affordance: "? icon",
      testid: "help-affordance--wizard-step1--tooltip",
      target: "/help/admin/onboarding-wizard#service-account", owningMilestone: "M10" },
    { kind: "concrete", sourceSurface: "Onboarding wizard — Step 2 header", sourceRoute: "/admin",
      affordance: "? tooltip", testid: "help-affordance--wizard-step2--tooltip",
      target: "/help/admin/onboarding-wizard#step-2", owningMilestone: "M10" },
    { kind: "concrete", sourceSurface: "Onboarding wizard — Step 3 header", sourceRoute: "/admin",
      affordance: "? tooltip", testid: "help-affordance--wizard-step3--tooltip",
      target: "/help/admin/onboarding-wizard#step-3", owningMilestone: "M10" },

    // Template family (one row, walked per-code):
    { kind: "template-family",
      sourceSurface: "Any error rendered via messageFor(code) in /admin/* (excludes admin-log-only)",
      sourceRoute: "/admin/show/rpas-central-2026", // representative surface
      affordance: "Learn more →",
      testidPattern: "help-affordance--error-message--<code>--learn-more",
      targetPattern: "/help/errors#<code>",
      owningMilestone: "M9 / M10" },

    // Negative assertion (one row):
    { kind: "negative",
      sourceSurface: "Crew page /show/<slug>",
      sourceRoute: "/show/SLUG_PLACEHOLDER",
      assertion: "No data-testid^=\"help-affordance--\" element present in rendered DOM" },
  ];

  /** Helper for test #13: lowercase-kebab transform of catalog code. */
  export function testidForErrorCode(code: string): string {
    return `help-affordance--error-message--${code
      .toLowerCase()
      .replace(/_/g, "-")}--learn-more`;
  }

  /** Helper for test #13: href for a catalog code. */
  export function targetForErrorCode(code: string): string {
    return `/help/errors#${code}`;
  }
  ```

- [ ] Step 4: Run `pnpm typecheck && pnpm test tests/help/_affordance-matrix-shape.test.ts` → PASS.
- [ ] Step 5: Commit: `feat(help): _affordanceMatrix.ts typed §5.6 registry (Task G.1)`

---

### Task G.2: Render-side gate (admin-context detection + preview exception)

**Files:**
- Create: `lib/messages/renderer-gate.ts`
- Create: `tests/messages/renderer-gate-unit.test.ts`

Per spec §5.2 r10. The shared error renderer emits `Learn more →` only when (a) `helpHref` non-null AND (b) rendering context is admin AND (c) preview-as-crew is excluded — content inside `/admin/show/<slug>/preview/<crew-id>` (the crew page rendered as a viewer) is CREW context.

- [ ] Step 1: Write failing unit test:

  ```ts
  // tests/messages/renderer-gate-unit.test.ts
  import { describe, it, expect } from "vitest";
  import { shouldEmitLearnMore } from "@/lib/messages/renderer-gate";

  describe("shouldEmitLearnMore (Phase G.2 — spec §5.2 r10)", () => {
    it("admin route + helpHref present → true", () => {
      expect(shouldEmitLearnMore({ route: "/admin/show/rpas-central-2026", helpHref: "/help/errors#X" })).toBe(true);
    });
    it("help-admin route + helpHref present → true", () => {
      expect(shouldEmitLearnMore({ route: "/help/admin/dashboard", helpHref: "/help/admin/parse-warnings#X" })).toBe(true);
    });
    it("crew route → false even with helpHref", () => {
      expect(shouldEmitLearnMore({ route: "/show/rpas-central-2026", helpHref: "/help/errors#X" })).toBe(false);
    });
    it("preview-as-crew route → false even with helpHref (spec §5.2 r10 exception)", () => {
      expect(shouldEmitLearnMore({ route: "/admin/show/rpas-central-2026/preview/eric-weiss", helpHref: "/help/errors#X" })).toBe(false);
    });
    it("admin route + helpHref null → false", () => {
      expect(shouldEmitLearnMore({ route: "/admin", helpHref: null })).toBe(false);
    });
    it("route is a non-admin '/admin'-prefixed string (e.g., '/admins') → false (defensive)", () => {
      expect(shouldEmitLearnMore({ route: "/admins/spoof", helpHref: "/help/errors#X" })).toBe(false);
    });
  });
  ```

- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement `lib/messages/renderer-gate.ts`:

  ```ts
  // lib/messages/renderer-gate.ts — Phase G.2
  //
  // Spec §5.2 render-side gate. Determines whether the shared error renderer
  // should emit a `Learn more →` link. Rule:
  //   admin-context AND helpHref !== null
  // where admin-context := /admin/* OR /help/admin/*
  //   EXCEPT /admin/show/<slug>/preview/<crew-id> (renders crew page; r10)

  /** Match /admin or /admin/<anything>, but NOT /admin/show/<slug>/preview/<crew-id>. */
  const ADMIN_RE = /^\/admin(?:\/(?!show\/[^/]+\/preview\/)|$)/;
  /** Match /help/admin or /help/admin/<anything>. */
  const HELP_ADMIN_RE = /^\/help\/admin(?:\/|$)/;

  export function shouldEmitLearnMore(args: {
    route: string;
    helpHref: string | null;
  }): boolean {
    if (!args.helpHref) return false;
    if (HELP_ADMIN_RE.test(args.route)) return true;
    if (ADMIN_RE.test(args.route)) return true;
    return false;
  }
  ```

- [ ] Step 4: Run test → PASS.
- [ ] Step 5: Commit: `feat(messages): renderer-gate with preview-as-crew exception (Task G.2)`

---

### Task G.3: Wire `Learn more →` links via `messageFor().helpHref`

**Files:**
- Modify: the shared error renderer component (existing project component; survey via `grep -rn "messageFor" components/` to locate). Candidates: `components/admin/AlertBanner.tsx`, `components/messages/ErrorExplainer.tsx`. Implementer surveys M9/M10 surfaces.
- Modify: the dashboard footer to render the "Take the tour" link (per §5.6 matrix row 4).
- Modify: section-header components in `/admin` dashboard, per-show panel, onboarding wizard — to render the `Learn more →` link inline in their tooltips when the matrix row's helpHref is present.

Per spec §5.3 affordance wiring. The retrofit is LINK-ONLY — does not change the text content of any existing tooltip / error message / expansion.

- [ ] Step 1: Audit existing error-renderer call sites:
  ```bash
  grep -rn "messageFor" components/ app/admin/
  ```
  Identify the shared rendering helper.
- [ ] Step 2: Write failing test (`tests/messages/renderer-emits-learn-more.test.tsx`) that mounts the rendering helper in two contexts and asserts:
  - In `/admin/*` context: helper emits `<a>` with `data-testid="help-affordance--error-message--<code>--learn-more"` and `href` = `messageFor(code).helpHref`
  - In `/show/<slug>` context: helper does NOT emit the `<a>`
  - In `/admin/show/<slug>/preview/<crew-id>` context: helper does NOT emit the `<a>` (preview-as-crew exception)
- [ ] Step 3: Run → FAIL.
- [ ] Step 4: Modify the rendering helper:
  - Accept the current route as a prop (or derive via `usePathname()` if it's a client component; OR derive from request `headers().get('next-url')` if RSC).
  - Compute `shouldEmitLearnMore({ route, helpHref })` from G.2.
  - When `true`, render an inline `<a href={helpHref} data-testid={...}>Learn more →</a>`.
- [ ] Step 5: Run test → PASS. Also run existing AlertBanner tests; they should still pass (the link is additive).
- [ ] Step 6: Wire the dashboard footer — add `<a href="/help/tour" data-testid="help-affordance--dashboard-footer--tour">Take the tour →</a>` to the dashboard footer component.
- [ ] Step 7: Commit: `feat(messages): wire Learn-more + Take-the-tour links via helpHref (Task G.3)`

---

### Task G.4: Retrofit `data-testid` on M3/M9/M10 source surfaces

**Files:**
- Modify: existing components per the `AFFORDANCE_MATRIX` concrete-testid rows. Concrete paths were pinned by Task G.0 (pre-execution discovery). Known live anchors: `components/admin/AlertBanner.tsx`, `components/admin/ParsePanel.tsx`, `components/admin/ReSyncButton.tsx`, `components/admin/StagedReviewCard.tsx`, `components/messages/ErrorExplainer.tsx`. M9/M10-owned files (dashboard rows, onboarding wizard steps) were discovered + added to the inventory by G.0.

For every concrete-testid row in the matrix, the owning component must carry the `data-testid` attribute on the affordance element (the `?` icon, "Take the tour" link, etc.). Most M3/M9/M10 work already shipped these affordances without testids; G.4 retrofits them.

- [ ] Step 1: For each matrix row, locate the component:
  ```bash
  grep -rn "Active Shows" components/admin/ app/admin/    # finds the Active Shows header
  grep -rn "Sheets we couldn't" components/admin/ app/admin/
  # ... repeat for each row's source surface text
  ```
- [ ] Step 2: Add `data-testid={...}` to each affordance element. Example for the Active Shows header tooltip:
  ```tsx
  <button
    type="button"
    aria-label="What is the Active Shows panel?"
    data-testid="help-affordance--dashboard-active-shows--tooltip"
    className="..."
  >
    ?
  </button>
  ```
- [ ] Step 3: Repeat for all 13 concrete-testid rows. Commit each retrofit as a separate logical commit OR batch by component:
  ```bash
  git add components/admin/Dashboard.tsx tests/components/admin/dashboard-testids.test.tsx
  git commit -m "feat(admin): add help-affordance testids on Dashboard tooltips (Task G.4 — dashboard subset)"
  ```
- [ ] Step 4: Verify each via the matrix walker (Task G.5 runs against these).

---

### Task G.5: Deep-link affordance walker (test #13)

**Files:**
- Create: `tests/playwright/deep-link-walker.spec.ts` (concrete rows — E2E via Playwright)
- Create: `tests/help/deep-link-walker-template-family.test.tsx` (template-family row — unit-level per r7)
- Create: `tests/help/deep-link-walker-reverse.test.ts` (reverse-direction codebase grep)

Per spec §7.1 test 13 (r10 row-class split). Three row-class handlers; reverse-direction check.

- [ ] Step 1: **Concrete rows** — E2E Playwright spec. Iterates `AFFORDANCE_MATRIX` where `kind === "concrete"`:
  - Sign in as admin via `signInAs`.
  - For each row: `await page.goto(row.sourceRoute)`. Locate `page.getByTestId(row.testid)`. Assert it's visible. If the row is a tooltip, click/hover to reveal its inner `Learn more →`. Assert the visible `<a>`'s `href` matches `row.target`.
  - For the first-seen-review row whose route contains `STAGED_ID_PLACEHOLDER` — implementer substitutes a known staged_id from the seeded fixture; if no staged row exists in seed, skip with `test.skip("requires staged-row fixture")`.
- [ ] Step 2: **Template-family row** — unit-level test. Imports `MESSAGE_CATALOG`; iterates entries matching the AC-12.6 predicate (`severity !== "info"` AND `dougFacing != null` AND M12 fields non-null); for each entry calls the rendering helper from G.3 directly (mock the route as `/admin/show/x`); asserts the output contains:
  - `data-testid` matching `testidForErrorCode(code)`
  - `<a>` with `href` matching `targetForErrorCode(code)` (which equals `messageFor(code).helpHref` for the error-code family)
- [ ] Step 3: **Negative row** — Playwright spec navigates to `/show/<slug>` as a signed-link viewer (not admin) and asserts `page.locator('[data-testid^="help-affordance--"]')` has count 0.
- [ ] Step 4: **Reverse-direction check** — vitest test:
  - Grep the codebase for `data-testid="help-affordance--*"` literals.
  - For each found testid: assert it's enumerated in the matrix (concrete rows) OR matches the template-family pattern `/^help-affordance--error-message--[a-z0-9-]+--learn-more$/`.
- [ ] Step 5: Run all three test files. Concrete rows should PASS once G.4 retrofitted testids. Template-family PASSES once G.3 wires the renderer. Negative PASSES — no testids on `/show/<slug>`. Reverse-direction PASSES — every testid in the codebase is in the matrix or matches the family pattern.
- [ ] Step 6: Commit: `test(help): deep-link affordance walker (Task G.5 — test #13, three row classes)`

---

### Task G.6: Error-renderer gate meta-test (test #12)

**Files:**
- Create: `tests/messages/_metaErrorRendererGate.test.ts`

Per spec §7.1 test 12 (r10 expanded to 4 contexts). Renders catalog entries through the shared rendering helper in four contexts (admin, help-admin, crew, preview-as-crew). Includes an anti-tautology forced-mismatch: mock an `adminLogOnly`-style entry... wait — `adminLogOnly` was retired in r8. The forced-mismatch case for r10 is: mock a CREW-ONLY entry (`dougFacing: null`, `crewFacing: non-null`) with `helpHref` accidentally populated, render in `/admin/*` AND `/show/<slug>`, assert admin emits the link but crew does NOT.

- [ ] Step 1: Write failing test:
  - Mock four contexts: `/admin`, `/help/admin/dashboard`, `/show/rpas-central-2026`, `/admin/show/rpas-central-2026/preview/eric-weiss`.
  - For each Doug-facing catalog entry with `helpHref != null`, render the helper in each context; assert: admin + help-admin emit `Learn more →`; crew + preview-as-crew do NOT.
  - **Anti-tautology forced fixture:** construct a synthetic entry `{ code: "FAKE", dougFacing: null, crewFacing: "x", helpHref: "/help/errors#FAKE", title: null, longExplanation: null }` (crew-only with helpHref populated — a forced contract violation); render in admin context AND crew context; assert admin context still respects the gate based on the rendering route (so this entry, if rendered in admin context, emits the link — the gate doesn't check entry shape, only route + helpHref). The point: the gate is a route-based filter, NOT a catalog-shape filter.
- [ ] Step 2: Run → exercises G.2 + G.3.
- [ ] Step 3: Commit: `test(messages): _metaErrorRendererGate 4-context coverage (Task G.6 — test #12)`

---

## Phase G close-out

After G.0 – G.6 commits land:

- [ ] `AFFORDANCE_MATRIX` enumerates every §5.6 row with the typed three-class shape
- [ ] `lib/messages/renderer-gate.ts` correctly classifies all four contexts including the preview exception
- [ ] Shared error renderer emits `Learn more →` per the gate, NOT a self-link on `/help/errors`
- [ ] Every M3/M9/M10 source surface carries its documented `data-testid`
- [ ] Test #13 (deep-link walker) all three classes PASS; reverse-direction PASSES
- [ ] Test #12 (renderer-gate) PASSES with 4-context coverage + anti-tautology fixture
- [ ] **Hand off to Phase H** ([08-auth-integration.md](08-auth-integration.md))

Phase G introduces ~6 + retrofit commits.
