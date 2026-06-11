# M12.12 — Affordance-Matrix Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make §5.6 true again in both directions on the redesigned admin UI (every matrix row resolves on a live surface at its declared viewport; every live help tooltip is a matrix row with a Learn-more link), then keep it true via a fast structural meta-test on every PR plus a two-viewport e2e walker in CI.

**Architecture:** `app/help/_affordanceMatrix.ts` stays the single source of truth and absorbs `DEFERRED_TESTIDS` + a new `visibleAt` field; `HoverHelp` gains `rootTestId`/`learnMore` (disclosure semantics, `<div>` body); six broken rows re-point to live hosts; a conditional legend under ShowsTable replaces the un-nestable restage-badge tooltip; walker fixtures seed via a walker-only locked SQL extension so capture DB state stays byte-identical; CI = dedicated `x-audits.yml` job (meta-test, every PR) + new path-filtered `help-affordances.yml` (e2e walker) on a shared guarded-migration bootstrap script.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 tokens, Vitest + Testing Library (jsdom), Playwright (iPhone 14 + 1280×800 projects), Supabase local stack via psql-applied seed SQL, GitHub Actions.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-11-affordance-matrix-realignment-design.md` (Codex adversarial rounds R1–R5 repaired; R6 pending at plan-draft time — reconcile any R6 findings into this plan before execution). Spec §2 owner decisions and §13 watchpoints are ratified — do not relitigate during implementation or review.

**Routing:** Entire milestone = **Opus / Claude Code** (UI-dominant; AGENTS.md hard rule). **Codex = reviewer only** (spec rounds done; plan round + per-cluster + whole-milestone fresh-eyes). Branch: `worktree-m12.12-affordance-matrix` (holds the spec).

**No DB schema changes.** No migrations, no validation-project apply, no schema-manifest regen. (Seed-layer changes only.)

---

## Meta-test inventory (writing-plans rule)

- **CREATES** `tests/help/_metaAffordanceMatrixParity.test.ts` — call-site sweep / inverse uniqueness / deferred-set consistency (spec §7).
- **EXTENDS** `tests/help/_affordance-matrix-shape.test.ts` — `visibleAt` validation + `--legend` testid suffix (its `CONCRETE_TESTID_RE` at `:9` admits only `tooltip|tour|learn-more` today).
- **EXTENDS** `tests/help/deep-link-walker-reverse.test.ts` — literal sweep also resolves `rootTestId` literals (today it only matches `data-testid="help-affordance--…"` attributes, `:11`).
- Advisory-lock structural tests: none extended — no new lock surface (see topology below). Supabase call-boundary registry (`tests/auth/_metaInfraContract.test.ts`): no new auth helpers; per-test walker seeding keeps the existing loud-throw pattern with inline `// not-subject-to-meta: e2e fixture helper, throws on error` comments where new helpers are added.

## Advisory-lock holder topology (writing-plans rule)

Lock-relevant surfaces (R10 correction — there are TWO, not one):

1. **Walker fixture seeding of `shows` rows.** Holder: the seed SQL transaction itself (`begin; select pg_advisory_xact_lock(hashtext('show:' || <drive_file_id>)) … order by drive_file_id; … commit;`), mirroring `supabase/seed.ts:517-523` (`seedSql`). One layer, JS-builds-SQL-psql-applies.
2. **The first-seen `pending_syncs` fixture** — `pending_syncs` is an invariant-2 locked table and the CURRENT walker delete/inserts it via PostgREST with no lock (`deep-link-walker.spec.ts:136-168`, pre-existing latent violation). PostgREST cannot hold a multi-statement advisory-lock transaction, so this fixture MOVES into the same locked seed-extension transaction (Task 12); the walker keeps only the read path. Holder: the seed-extension transaction — same single layer as (1).

No JS-side wrapper, no RPC, no nested SECURITY DEFINER — `tests/auth/advisoryLockRpcDeadlock.test.ts` is unaffected. Structural pin (Task 11): the walker spec + `tests/e2e/helpers/**` contain no `.insert(`/`.update(`/`.delete(` on `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`.

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `app/help/_affordanceMatrix.ts` | Modify | `visibleAt` field; 19-row table per spec §3.1; `DEFERRED_TESTIDS` moves in (runner-neutral) |
| `components/admin/HoverHelp.tsx` | Modify | `rootTestId` + `learnMore` props; `<div>` body; disclosure semantics when `learnMore` present |
| `components/admin/ShowsTable.tsx` | Modify | Row 1 wiring; row 4 conditional restage legend |
| `components/admin/Dashboard.tsx` | Modify | Rows 2 + 5 wiring |
| `app/admin/needs-attention/page.tsx` | Modify | Row 3 `titleAppendSlot` HoverHelp |
| `app/admin/show/[slug]/page.tsx` | Modify | Rows 7 + 9 new HoverHelps |
| `components/admin/PerShowAlertSection.tsx` | Modify | Row 8: matrix testId literal + Learn-more in HelpTooltip children |
| `components/admin/settings/AdministratorsSection.tsx` | Modify | Row 11 wiring |
| `components/admin/settings/DriveConnectionPanel.tsx` | Modify | Rows 12 + 13 wiring |
| `app/admin/settings/page.tsx` | Modify | Row 14 wiring |
| `app/help/admin/settings/page.mdx` | Create | New help page: `#administrators` `#drive-connection` `#drive-health` `#preferences` |
| `app/help/_nav.ts` | Modify | NAV entry for `/help/admin/settings` |
| `app/help/admin/dashboard/page.mdx` | Modify | New `#archived` section; live-UI prose for `#active-shows` / `#pending-ingestion` |
| `lib/admin/showDisplay.ts` | Create | Relocated `ActiveShowRow` type + `formatRelative` + `formatDateRange` |
| `components/admin/ActiveShowsPanel.tsx` | Delete | Dead since M12.2 (after importers re-point) |
| `components/admin/PendingPanel.tsx` | Delete | Dead since M12.2 (after type-consumer grep) |
| `tests/help/_metaAffordanceMatrixParity.test.ts` | Create | Spec §7 structural meta-test |
| `tests/e2e/helpers/walkerRoutes.ts` | Create | Runner-neutral `allWalkableRows` + `walksAt` + `routeForPure` (placeholder-only) + `prepKindFor` (pathname-keyed) |
| `tests/e2e/deep-link-walker.spec.ts` | Modify | Imports helpers + matrix `DEFERRED_TESTIDS`; HoverHelp `assertTarget` arm; per-viewport row filtering |
| `tests/help/walker-routes.test.ts` | Create | Unit pins: non-placeholder pass-through; pathname-keyed prep (row 5 path) |
| `playwright.config.ts` | Modify | `help-docs` (mobile, existing) + `help-docs-desktop` (1280×800) projects |
| `supabase/seedWalkerFixtures.ts` | Create | Walker-only locked seed extension (3 shows + admin_alert), `seed-fixture:` prefixed |
| `tests/e2e/help-docs-setup.ts` | Modify | Invokes the walker seed extension after `pnpm db:seed` |
| `scripts/ci/supabase-local-bootstrap.sh` | Create | Factored guarded-migration boot (from `screenshots-drift.yml:25-80`) |
| `.github/workflows/screenshots-drift.yml` / `screenshots-regen.yml` | Modify | Consume the shared bootstrap script |
| `.github/workflows/help-affordances.yml` | Create | Path-filtered PR + dispatch e2e walker job |
| `.github/workflows/x-audits.yml` | Modify | `affordance-matrix-parity` job (every PR) |
| `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` | Modify | §5.6 amendment (spec §9) |
| `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md` | Modify | M11-G-D-6 + M11-G-D-1 → RESOLVED |
| `public/help/screenshots/needs-attention-mobile*.webp` | Regen | Via `screenshots-regen.yml` dispatch (pinned amd64) |

Tests named per task below. Baseline note: the worktree baseline is 3 failed files / 5 failed tests (`test-auth-gate` Layer 2, `layoutIdentityFault`, `revokeHang`) — pre-existing environmental, CI-green on main. Any OTHER failure is yours.

## Execution order (R18 — every commit lands green on the default suite)

**T10 → T8 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T9 → T11 → T12 → T13 → T14 → T15 → T16 → T17.** Task 10 (dead-component deletion) EXECUTES FIRST: the dead components carry `help-affordance--` literals for rows Task 1 renames/removes, and `tests/help/deep-link-walker-reverse.test.ts` (default suite) fails on any literal without a matrix row — deleting the carriers first keeps it green through the matrix rewrite (the reverse test checks literal→row only, so rows without carriers don't fail it). Task 8 (help content) runs SECOND, before the matrix rewrite and all wiring: the reverse test also resolves help targets to files, so every `/help/admin/settings#…` / `#archived` target must exist before any matrix row or component literal references it. The e2e walker (`pnpm test:e2e`, NOT in the default unit suite and not yet in any CI) is ALREADY red at HEAD — that pre-existing red is the bug this milestone fixes and is not newly introduced by any commit here; it goes green at T13 before T14 wires it into CI. Task numbering below is by THEME, not order — each task header notes nothing; follow this order list.

---

### Task 1: Matrix schema — `visibleAt`, `DEFERRED_TESTIDS`, 19 rows

**Files:**
- Modify: `app/help/_affordanceMatrix.ts`
- Modify: `tests/help/_affordance-matrix-shape.test.ts`

- [ ] **Step 1.1: Extend the shape test (failing first).** In `tests/help/_affordance-matrix-shape.test.ts`: change `CONCRETE_TESTID_RE` to `/^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more|legend)$/`; inside the per-row loop add `expect(["mobile", "desktop", "both"]).toContain(row.visibleAt);`. Add three pinning tests:

```ts
it("exports DEFERRED_TESTIDS containing exactly the two still-deferred rows", () => {
  expect([...DEFERRED_TESTIDS].sort()).toEqual([
    "help-affordance--per-show-restage-card--tooltip",
    "help-affordance--preview-banner--tooltip",
  ]);
  for (const id of DEFERRED_TESTIDS) {
    expect(
      AFFORDANCE_MATRIX.some((r) => r.kind === "concrete" && r.testid === id),
      `${id} must be a concrete matrix row`,
    ).toBe(true);
  }
});

it("pins the 19 concrete rows incl. renames and the legend row", () => {
  const concrete = AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete");
  expect(concrete).toHaveLength(19);
  const ids = concrete.map((r) => r.testid);
  expect(ids).toContain("help-affordance--dashboard-restage--legend");
  expect(ids).toContain("help-affordance--dashboard-needs-attention--tooltip");
  expect(ids).not.toContain("help-affordance--dashboard-pending-ingestion--tooltip");
  expect(ids).not.toContain("help-affordance--dashboard-restage-badge--tooltip");
  expect(ids).not.toContain("help-affordance--per-show-sync-health--tooltip");
});

it("wizard step rows carry their ?step deep link in sourceRoute (no routeFor special case)", () => {
  const byId = new Map(
    AFFORDANCE_MATRIX.flatMap((r) => (r.kind === "concrete" ? [[r.testid, r]] : [])),
  );
  expect(byId.get("help-affordance--wizard-step2--tooltip")?.sourceRoute).toBe("/admin?step=2");
  expect(byId.get("help-affordance--wizard-step3--tooltip")?.sourceRoute).toBe("/admin?step=3");
});
```

Concrete failure mode caught: a future row added without `visibleAt`, with a novel suffix, or a re-introduced deferred/renamed testid.

- [ ] **Step 1.2:** `pnpm vitest run tests/help/_affordance-matrix-shape.test.ts` → FAIL (no `visibleAt`, no `DEFERRED_TESTIDS` export, 13 rows).
- [ ] **Step 1.3: Rewrite the matrix.** In `app/help/_affordanceMatrix.ts`: add `visibleAt: "mobile" | "desktop" | "both";` to `ConcreteRow`; rewrite `AFFORDANCE_MATRIX` to exactly the spec §3.1 table (19 concrete rows — testid/sourceRoute/target/visibleAt cell-for-cell; keep `sourceSurface`/`affordance`/`owningMilestone` strings descriptive of the live hosts; the template-family and negative rows are unchanged). Append:

```ts
// Still-deferred concrete rows (M11-G-D-2 / M11-G-D-3 — DEFERRED.md). Lives
// here (not in the Playwright spec) so the Vitest meta-test can import it
// without executing Playwright test registration (spec R5).
export const DEFERRED_TESTIDS: ReadonlySet<string> = new Set([
  "help-affordance--per-show-restage-card--tooltip",
  "help-affordance--preview-banner--tooltip",
]);
```

- [ ] **Step 1.4:** `pnpm vitest run tests/help/_affordance-matrix-shape.test.ts` → PASS. Then `pnpm vitest run tests/help/deep-link-walker-reverse.test.ts` → STILL PASS (R18 ordering: Task 10 already deleted the dead carriers, so no literal references a renamed/removed row; the reverse test checks literal→row only). If it fails here, a stale literal survived Task 10 — fix THAT, do not patch the test.
- [ ] **Step 1.5:** Commit: `feat(help): matrix visibleAt + DEFERRED_TESTIDS + 19-row §5.6 realignment table`

### Task 2: `HoverHelp` — `rootTestId` + `learnMore` (disclosure semantics)

**Files:**
- Modify: `components/admin/HoverHelp.tsx`
- Modify: `tests/components/admin/HoverHelp.test.tsx`

- [ ] **Step 2.1: Failing tests.** Add to `tests/components/admin/HoverHelp.test.tsx` (match the file's existing render/query idioms):

```tsx
it("rootTestId lands on the wrapper; trigger/body keep the testId convention", () => {
  render(
    <HoverHelp label="Help: X" testId="x-help" rootTestId="help-affordance--x--tooltip">
      <p>Body copy.</p>
    </HoverHelp>,
  );
  const root = screen.getByTestId("help-affordance--x--tooltip");
  expect(within(root).getByTestId("x-help-trigger")).toBeInTheDocument();
  expect(within(root).getByTestId("x-help-body")).toBeInTheDocument();
});

it("learnMore renders a link AFTER children, drops role=tooltip, adds aria-controls, scopes describedby to children only", () => {
  render(
    <HoverHelp label="Help: X" testId="x-help" learnMore={{ href: "/help/admin/dashboard#active-shows" }}>
      <p>Body copy.</p>
    </HoverHelp>,
  );
  const trigger = screen.getByTestId("x-help-trigger");
  const body = screen.getByTestId("x-help-body");
  expect(body).not.toHaveAttribute("role");
  expect(trigger).toHaveAttribute("aria-controls", body.id);
  const describedId = trigger.getAttribute("aria-describedby")!;
  const described = document.getElementById(describedId)!;
  expect(within(described).queryByRole("link", { hidden: true })).toBeNull(); // link excluded from description
  const link = within(body).getByRole("link", { hidden: true });
  expect(link).toHaveAttribute("href", "/help/admin/dashboard#active-shows");
  expect(link).toHaveTextContent(/learn more/i);
  expect(described.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("without learnMore, role=tooltip and describedby semantics are unchanged", () => {
  render(<HoverHelp label="Help: X" testId="x-help"><p>Body.</p></HoverHelp>);
  const body = screen.getByTestId("x-help-body");
  expect(body).toHaveAttribute("role", "tooltip");
  expect(screen.getByTestId("x-help-trigger")).toHaveAttribute("aria-describedby", body.id);
});

it("body AND root wrapper are divs (block children are valid HTML at every level)", () => {
  render(
    <HoverHelp label="Help: X" testId="x-help" rootTestId="help-affordance--x--tooltip">
      <p>Body.</p>
    </HoverHelp>,
  );
  expect(screen.getByTestId("x-help-body").tagName).toBe("DIV");
  expect(screen.getByTestId("help-affordance--x--tooltip").tagName).toBe("DIV"); // span root containing a div body would itself be invalid (spec R6)
});
```

Concrete failure modes: link flattened into the SR description; `aria-controls` missing; `<span><p>` invalid nesting regression; existing no-`learnMore` call sites silently changing semantics.

- [ ] **Step 2.2:** `pnpm vitest run tests/components/admin/HoverHelp.test.tsx` → new tests FAIL.
- [ ] **Step 2.3: Implement.** In `components/admin/HoverHelp.tsx`: add props `rootTestId?: string` and `learnMore?: { href: string }`. The root wrapper (`:115-119`) becomes `<div className="relative inline-flex" …>` (same classes/handlers; `<span>` cannot legally contain the div body — spec §4.1 R6) and gains `data-testid={rootTestId}` (omit attribute when undefined). Body element (`:142-150`) becomes `<div>`; keep all classes/handlers. Add `const descId = useId();`. Body content becomes:

```tsx
<div id={descId}>{children}</div>
{learnMore ? (
  <a
    href={learnMore.href}
    className="mt-2 inline-block text-xs font-semibold text-text-strong underline underline-offset-2 hover:text-text"
  >
    Learn more →
  </a>
) : null}
```

Body element: `role={learnMore ? undefined : "tooltip"}`. Trigger props: `"aria-describedby": learnMore ? descId : bodyId` (no-`learnMore` instances byte-identical to today — Step 2.1's third test pins that; `learnMore` instances describe ONLY the children wrapper, excluding the link) and `"aria-controls": learnMore ? bodyId : undefined`. Keep `bodyId` on the body element itself.

- [ ] **Step 2.4:** `pnpm vitest run tests/components/admin/HoverHelp.test.tsx` → PASS (all, incl. pre-existing).
- [ ] **Step 2.5:** `pnpm vitest run tests/components` → green minus baseline (R18 ordering keeps the suite green at every commit).
- [ ] **Step 2.6:** Commit: `feat(admin): HoverHelp rootTestId + learnMore disclosure variant (div body)`

### Task 3: ShowsTable — row 1 wiring + row 4 restage legend

**Files:**
- Modify: `components/admin/ShowsTable.tsx`
- Modify: `tests/components/admin/ShowsTable.test.tsx`

- [ ] **Step 3.1: Failing tests** (in `ShowsTable.test.tsx`, reusing its existing fixture-row builders — derive every expectation from the fixture rows, never hardcode counts):

```tsx
it("header help carries the matrix root testid and Learn-more target", () => {
  renderShowsTable({ rows: [rowWith({ lastSyncStatus: "ok" })] });
  const root = screen.getByTestId("help-affordance--dashboard-active-shows--tooltip");
  const link = within(root).getByRole("link", { hidden: true });
  expect(link).toHaveAttribute("href", "/help/admin/dashboard#active-shows");
});

it("legend renders iff a VISIBLE row has bucket=review, links to re-stage", () => {
  const reviewRow = rowWith({ lastSyncStatus: "pending_review", title: "Review Me" });
  const okRow = rowWith({ lastSyncStatus: "ok", title: "Fine Show" });
  const { rerender } = renderShowsTable({ rows: [reviewRow, okRow] });
  const legend = screen.getByTestId("help-affordance--dashboard-restage--legend");
  expect(legend).toHaveAttribute("href", "/help/admin/review-queues#re-stage");
  renderShowsTable({ rows: [okRow] }, rerender);
  expect(screen.queryByTestId("help-affordance--dashboard-restage--legend")).toBeNull();
});

it("legend follows the FILTERED visible set (Find hides it) — anti-tautology: assert on the legend testid only", async () => {
  renderShowsTable({ rows: [rowWith({ lastSyncStatus: "pending_review", title: "Zebra" }), rowWith({ lastSyncStatus: "ok", title: "Alpha" })] });
  await user.type(screen.getByTestId("shows-find-input"), "Alpha");
  expect(screen.queryByTestId("help-affordance--dashboard-restage--legend")).toBeNull();
});
```

Concrete failure modes: legend keyed off the UNFILTERED input array (Find test fails); legend always-on (iff test fails); a sibling SyncCell "Changes to review" label satisfying a text-based assertion (prevented by asserting only the legend testid, never text-scanning the table).

- [ ] **Step 3.2:** Run → FAIL.
- [ ] **Step 3.3: Implement.** (a) Header HoverHelp (`ShowsTable.tsx:236`) gains `rootTestId="help-affordance--dashboard-active-shows--tooltip"` and `learnMore={{ href: "/help/admin/dashboard#active-shows" }}`. (b) After the closing `</div>` of the rounded list container (after `:392`-ish `)}`), inside the top-level `flex flex-col gap-3` wrapper:

```tsx
{visible.some((r) => syncStatusBucket(r.lastSyncStatus).bucket === "review") ? (
  <p className="text-sm text-text-subtle">
    <span aria-hidden="true">⚠ </span>
    <span className="font-semibold text-text-strong">Changes to review</span> means a sheet edit
    is staged and waiting for your approval.{" "}
    <Link
      href="/help/admin/review-queues#re-stage"
      data-testid="help-affordance--dashboard-restage--legend"
      className="font-semibold text-text-strong underline underline-offset-2 hover:text-text"
    >
      What the sync statuses mean →
    </Link>
  </p>
) : null}
```

`visible` is the post-Find, post-cap, post-sort array the rows render from — key the condition on the SAME identifier the `.map` consumes (spec §4.3 guard conditions). Transition inventory (spec §4.3): appear/disappear is instant — no `AnimatePresence`, no animation classes; compound case (bucket switch while Find non-empty) recomputes from the new bucket's visible set, still instant.

- [ ] **Step 3.4:** Run Task-3 tests → PASS; `pnpm vitest run tests/components/admin/ShowsTable.test.tsx` whole file → PASS.
- [ ] **Step 3.5: Negative-regression check (mandatory):** temporarily change the legend condition to `true ? (` — the "iff" and Find tests must FAIL; revert. State the result in the commit body.
- [ ] **Step 3.6:** Commit: `feat(admin): ShowsTable matrix wiring + conditional restage legend (row 1 + row 4)`

### Task 4: Dashboard — rows 2 + 5

**Files:**
- Modify: `components/admin/Dashboard.tsx`
- Modify: `tests/components/admin/Dashboard.test.tsx`

- [ ] **Step 4.1: Failing tests** (Dashboard.test.tsx has builders for the dashboard result; archived bucket renders via the `bucket: "archived"` result shape — see `Dashboard.tsx:417`):

```tsx
it("desktop needs-attention header help carries matrix root testid + first-seen link", () => {
  renderDashboard(resultWith({ bucket: "active" }));
  const root = screen.getByTestId("help-affordance--dashboard-needs-attention--tooltip");
  expect(within(root).getByRole("link", { hidden: true })).toHaveAttribute(
    "href",
    "/help/admin/review-queues#first-seen",
  );
});

it("archived header help carries matrix root testid + archived link (archived bucket only)", () => {
  renderDashboard(resultWith({ bucket: "archived" }));
  const root = screen.getByTestId("help-affordance--dashboard-archived-shows--tooltip");
  expect(within(root).getByRole("link", { hidden: true })).toHaveAttribute(
    "href",
    "/help/admin/dashboard#archived",
  );
});
```

Concrete failure mode: redesign drops either header's HoverHelp → testid vanishes (the M12.x drift class, now caught at unit speed).

- [ ] **Step 4.2:** Run → FAIL.
- [ ] **Step 4.3:** `Dashboard.tsx:512` HoverHelp gains `rootTestId="help-affordance--dashboard-needs-attention--tooltip"` + `learnMore={{ href: "/help/admin/review-queues#first-seen" }}`; `Dashboard.tsx:428` HoverHelp gains `rootTestId="help-affordance--dashboard-archived-shows--tooltip"` + `learnMore={{ href: "/help/admin/dashboard#archived" }}`.
- [ ] **Step 4.4:** Run → PASS. **Step 4.5:** Commit: `feat(admin): dashboard needs-attention + archived matrix wiring (rows 2, 5)`

### Task 5: Needs-attention page — row 3

**Files:**
- Modify: `app/admin/needs-attention/page.tsx:34`
- Test: `tests/app/admin/needsAttentionPage.test.tsx` (exists)

- [ ] **Step 5.1: Failing test:** page header renders the matrix root testid with a Learn-more link to `/help/admin/review-queues#first-seen` (same shape as Task 4 tests; this page's test file already renders the page — follow its async server-component render idiom).
- [ ] **Step 5.2:** Run → FAIL.
- [ ] **Step 5.3:** The `AdminPageHeader` call at `app/admin/needs-attention/page.tsx:34` gains:

```tsx
titleAppendSlot={
  <HoverHelp
    label="Help: Needs attention"
    testId="needs-attention-page-help"
    rootTestId="help-affordance--needs-attention-page--tooltip"
    learnMore={{ href: "/help/admin/review-queues#first-seen" }}
  >
    <p>
      Everything waiting on a decision from you: sheets we could not auto-apply and staged
      changes to review. Items leave this list as soon as you resolve them.
    </p>
  </HoverHelp>
}
```

(`AdminPageHeader` `titleAppendSlot` prop: `components/admin/nav/AdminPageHeader.tsx:20`. Import HoverHelp in the page. If `HoverHelp` is a client component rendered from a server page — it is `"use client"` — this composition is already used by Dashboard; no boundary change needed.)

- [ ] **Step 5.4:** Run → PASS. **Step 5.5:** Commit: `feat(admin): needs-attention page header help affordance (row 3)`

### Task 6: Per-show page — rows 7, 8, 9

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx` (sync footer `:616-621`; Crew header `:442`)
- Modify: `components/admin/PerShowAlertSection.tsx:156-168`
- Tests: `tests/components/admin/parse-panel-affordance.test.tsx` + the per-show page/section tests that reference `per-show-alert-help` (grep first: `rg -n "per-show-alert-help" tests/`)

- [ ] **Step 6.1: Failing tests:** (a) sync footer renders `help-affordance--per-show-sync-footer--tooltip` root with Learn-more → `/help/admin/per-show-panel#sync-health`; (b) Crew header renders `help-affordance--per-show-crew--tooltip` root with Learn-more → `/help/admin/preview-as-crew`; (c) PerShowAlertSection's `<details>` root carries `data-testid="help-affordance--per-show-alerts--tooltip"` and its body contains a link to `/help/admin/parse-warnings`. Update every existing test that queries `per-show-alert-help`/`-trigger`/`-body` to the new derived ids.
- [ ] **Step 6.2:** Run → FAIL.
- [ ] **Step 6.3: Implement.** (a) In the sync footer (`page.tsx:616-621`), wrap the StatusIndicator side:

```tsx
<div className="flex items-center gap-2">
  <StatusIndicator status={syncBucket.bucket} label={syncFooterLabel} />
  <HoverHelp
    label="Help: Sync status"
    testId="per-show-sync-help"
    rootTestId="help-affordance--per-show-sync-footer--tooltip"
    learnMore={{ href: "/help/admin/per-show-panel#sync-health" }}
  >
    <p>
      How the last sync with this show&apos;s sheet went. We re-check on a schedule; Re-sync
      forces a fresh read right now.
    </p>
  </HoverHelp>
</div>
```

(`<div>`, NOT `<span>` — HoverHelp's root is a `<div>` after Task 2 and `span > div` is the invalid-nesting class Task 2 eliminates, R10. Same rule for the Task-6b Crew-header wrapper and ANY other wrapper introduced around a HoverHelp in this milestone: flow-content parents only. The Task-2 nesting test covers the component; for these compositions, each task's unit test additionally asserts `screen.getByTestId("<matrix-testid>").parentElement!.tagName` is not `SPAN`.)

(b) Crew header (`page.tsx:442`): wrap the `<h2>` in a `flex items-center gap-2` row with a HoverHelp (`testId="per-show-crew-help"`, `rootTestId="help-affordance--per-show-crew--tooltip"`, `learnMore={{ href: "/help/admin/preview-as-crew" }}`, body: one sentence on crew rows + "Preview as" links). (c) PerShowAlertSection: change `testId="per-show-alert-help"` → `testId="help-affordance--per-show-alerts--tooltip"` and append inside the children block:

```tsx
<p className="mt-2">
  <a
    href="/help/admin/parse-warnings"
    className="font-semibold text-text-strong underline underline-offset-2 hover:text-text"
  >
    Learn more →
  </a>
</p>
```

(HelpTooltip puts `testId` on the `<details>` root — `components/admin/HelpTooltip.tsx:58-60` — so the walker's existing summary arm works without component changes; the derived `-trigger`/`-body` ids shift with it, hence the test updates.)

- [ ] **Step 6.4:** Run → PASS; run `pnpm vitest run tests/components/admin tests/app/admin` → green minus baseline. **Step 6.5:** Commit: `feat(admin): per-show sync-footer/crew/alerts matrix wiring (rows 7-9)`

### Task 7: Settings — rows 11–14

**Files:**
- Modify: `components/admin/settings/AdministratorsSection.tsx:88`, `components/admin/settings/DriveConnectionPanel.tsx:133` + `:176`, `app/admin/settings/page.tsx:124`
- Tests: the settings component test files (grep: `rg -ln "admins-help|drive-help|drive-connection-health-help|prefs-help" tests/`)

- [ ] **Step 7.1: Failing tests:** four root-testid + Learn-more-href assertions (same shape as Task 4): `settings-administrators` → `/help/admin/settings#administrators`; `settings-drive-connection` → `/help/admin/settings#drive-connection`; `settings-drive-health-badge` → `/help/admin/settings#drive-health` (render the non-healthy branch — the panel test file already has a warn-state fixture for the badge); `settings-preferences` → `/help/admin/settings#preferences`.
- [ ] **Step 7.2:** Run → FAIL.
- [ ] **Step 7.3:** Add `rootTestId="help-affordance--settings-<name>--tooltip"` + matching `learnMore` to each of the four HoverHelp call sites (inline string literals — meta-test requirement).
- [ ] **Step 7.4:** Run → PASS. **Step 7.5:** Commit: `feat(admin): settings matrix wiring (rows 11-14)`

### Task 8: Help content — settings page, archived anchor, live-UI prose

**Files:**
- Create: `app/help/admin/settings/page.mdx`
- Modify: `app/help/_nav.ts` (NAV, `admin-surface` group, after the per-show entries: `{ slug: "/help/admin/settings", title: "Settings", group: "admin-surface" }`)
- Modify: `app/help/admin/dashboard/page.mdx`
- Tests: `tests/help/_metaNavSync.test.ts` (auto-covers nav↔page parity), `tests/help/anchor-resolver.test.ts`, `tests/help/deep-link-walker-reverse.test.ts` (target-file existence)

- [ ] **Step 8.1 (failing test):** this task runs BEFORE the matrix rewrite (R18 order), so the reverse test cannot be its red signal. Use the nav meta-test instead: add the `{ slug: "/help/admin/settings", … }` NAV entry FIRST, run `pnpm vitest run tests/help/_metaNavSync.test.ts` → FAIL (nav entry without a page). The page + anchors in Step 8.2 turn it green.
- [ ] **Step 8.2: Write the content.** `app/help/admin/settings/page.mdx`: follow the voice/structure of `app/help/admin/dashboard/page.mdx` (front-matter/title convention identical to siblings); `<h2 id="administrators">`, `<h2 id="drive-connection">`, `<h2 id="drive-health">`, `<h2 id="preferences">` — one short plain-language section each (who can sign in; what the watched-folder connection is; what the health badge states mean — mirror `deriveStatusLine` reasons in `DriveConnectionPanel.tsx:35-60` in prose, NO raw codes per invariant 5; what the notification toggles do). Dashboard page: add `<h2 id="archived">Archived shows</h2>` section (archive = crew links off until unarchive + republish — mirror the `archived-help` popover copy, `Dashboard.tsx:429-432`); rewrite the `#active-shows` section prose to describe the shows TABLE (sortable headers, Find, count chip) and the `#pending-ingestion` section to describe the Needs-attention inbox/page model (anchor id KEPT — spec §5). Add the NAV entry.
- [ ] **Step 8.3:** `pnpm vitest run tests/help` → reverse-test target-existence + nav meta-test PASS; suite green minus baseline.
- [ ] **Step 8.4:** Commit: `feat(help): settings help page + archived anchor + live-UI dashboard prose`

### Task 9: Structural meta-test

**Files:**
- Create: `tests/help/_metaAffordanceMatrixParity.test.ts`
- Modify: `tests/help/deep-link-walker-reverse.test.ts` (literal regex also captures `rootTestId="…"`)

- [ ] **Step 9.1: Write the meta-test** (this is the structural defense — it must FAIL at this point if any wiring task above was skipped, and must FAIL on HEAD-minus-this-branch by construction):

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AFFORDANCE_MATRIX, DEFERRED_TESTIDS } from "@/app/help/_affordanceMatrix";

const ROOT = process.cwd();
const MATRIX_FILE = join(ROOT, "app/help/_affordanceMatrix.ts");
const DOMAIN_ROOTS = ["components", "app"].map((p) => join(ROOT, p));
const EXEMPT = /\/\/\s*not-a-help-affordance:\s*\S/;

function domainFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (!/__generated__/.test(p)) walk(p);
      } else if (/\.(tsx?|mdx)$/.test(p) && !/\.test\./.test(p) && p !== MATRIX_FILE) {
        out.push(p);
      }
    }
  };
  DOMAIN_ROOTS.forEach(walk);
  return out;
}

// Blank out /* */ and // comment CONTENT while preserving newlines, so the
// call-site scan never matches doc prose like "Distinct from <HelpTooltip>"
// (HoverHelp.tsx:33) and reported line numbers stay valid (R13). The
// EXEMPTION check reads the RAW source — "// not-a-help-affordance:" is
// itself a comment and must survive for that rule.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/[^\n]*/gm, (m, pre) => pre + " ".repeat(m.length - pre.length));
}

const concreteIds = new Set(
  AFFORDANCE_MATRIX.flatMap((r) => (r.kind === "concrete" ? [r.testid] : [])),
);
const liveIds = new Set([...concreteIds].filter((id) => !DEFERRED_TESTIDS.has(id)));

describe("affordance-matrix ↔ live-surface parity (spec §7)", () => {
  const files = domainFiles().map((f) => {
    const raw = readFileSync(f, "utf8");
    return {
      path: f,
      rel: relative(ROOT, f),
      raw, // exemption comments are read from RAW source
      src: stripComments(raw), // call sites + literals scanned comment-free (R13)
    };
  });

  it("stripComments: prose mentions of <HelpTooltip> in comments are not call sites (R13 fixture)", () => {
    const sample = `// Distinct from <HelpTooltip>\nconst x = 1; /* <HoverHelp testId="y"> */\nrender(<HoverHelp label="z" />);\n`;
    const stripped = stripComments(sample);
    expect(stripped.match(/<(HoverHelp|HelpTooltip)\b/g)).toHaveLength(1);
    expect(stripped.split("\n").length).toBe(sample.split("\n").length); // line numbers preserved
  });

  it("every HoverHelp/HelpTooltip call site references a live matrix testid or carries an exemption", () => {
    const failures: string[] = [];
    for (const f of files) {
      const sites = f.src.match(/<(HoverHelp|HelpTooltip)\b/g) ?? [];
      if (sites.length === 0) continue;
      // Per-call-site resolution: split source at call sites; each chunk up to the
      // closing of the opening tag must contain a resolvable matrix literal
      // (rootTestId="…" for HoverHelp, testId="help-affordance--…" for HelpTooltip)
      // or an exemption comment within the 3 lines above the call site.
      const lines = f.src.split("\n");
      const rawLines = f.raw.split("\n");
      lines.forEach((line, i) => {
        if (!/<(HoverHelp|HelpTooltip)\b/.test(line)) return;
        const window = lines.slice(i, Math.min(i + 12, lines.length)).join("\n");
        // Exemption comments live in the RAW source (stripComments blanks them).
        const rawAbove = rawLines.slice(Math.max(0, i - 3), i).join("\n");
        const rawWindow = rawLines.slice(i, Math.min(i + 12, rawLines.length)).join("\n");
        const literal = window.match(/(?:rootTestId|testId)=["'](help-affordance--[^"']+)["']/);
        if (literal && liveIds.has(literal[1]!)) return;
        if (EXEMPT.test(rawAbove) || EXEMPT.test(rawWindow)) return;
        failures.push(`${f.rel}:${i + 1} — call site resolves no live matrix testid and carries no exemption`);
      });
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every live concrete row's testid occurs EXACTLY ONCE across the domain (occurrences, not files — R8)", () => {
    const counts = new Map<string, string[]>();
    for (const id of liveIds) counts.set(id, []);
    for (const f of files) {
      for (const id of liveIds) {
        let idx = f.src.indexOf(id);
        while (idx !== -1) {
          const line = f.src.slice(0, idx).split("\n").length;
          counts.get(id)!.push(`${f.rel}:${line}`);
          idx = f.src.indexOf(id, idx + 1);
        }
      }
    }
    const bad = [...counts].filter(([, hits]) => hits.length !== 1);
    expect(bad, bad.map(([id, hits]) => `${id} → [${hits.join(", ")}]`).join("\n")).toEqual([]);
  });

  it("no deferred testid appears in any domain file; deferred ids are matrix rows", () => {
    for (const id of DEFERRED_TESTIDS) {
      expect(concreteIds.has(id), `${id} must be a matrix row`).toBe(true);
      const hits = files.filter((f) => f.src.includes(id)).map((f) => f.rel);
      expect(hits, `${id} must not appear in components/app: ${hits.join(", ")}`).toEqual([]);
    }
  });

  it("matrix testids are unique", () => {
    expect(concreteIds.size).toBe(AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete").length);
  });
});
```

Concrete failure modes: a new HoverHelp without a matrix row (call-site rule); a matrix testid in dead code AND live code (uniqueness = 2 files); a deferred testid shipped by accident. The 12-line window + exemption rules are the inline-literal contract from spec §7 — a variable-valued `rootTestId` resolves no literal and fails.

- [ ] **Step 9.2 (lands GREEN; failing-first via negative verification):** under the R18 execution order, Tasks 10 + 1–8 have already landed, so `pnpm vitest run tests/help/_metaAffordanceMatrixParity.test.ts` → PASS on first real run. Prove the test is not tautological the established way (negative-regression verification): temporarily remove `rootTestId` from the ShowsTable header HoverHelp → call-site rule AND inverse-uniqueness must both FAIL with file:line output → restore. Record the negative run in the commit body.
- [ ] **Step 9.3:** Extend `deep-link-walker-reverse.test.ts:11`: `HELP_AFFORDANCE_RE = /(?:data-testid|rootTestId)=["'](help-affordance--[^"']+)["']/g;` → suite stays green.
- [ ] **Step 9.4:** Commit: `test(help): affordance-matrix parity meta-test (call-site sweep, occurrence uniqueness, deferred-set)` — negative-verification evidence in the body.

### Task 10: Delete dead components, relocate helpers — **EXECUTES FIRST (R18 execution order; see the list after the file-structure table).** Own TDD cycle, own green commit: the default suite (including `deep-link-walker-reverse`) passes after deletion because every surviving literal still maps to a not-yet-renamed matrix row.

**Files:**
- Create: `lib/admin/showDisplay.ts`
- Delete: `components/admin/ActiveShowsPanel.tsx`, `components/admin/PendingPanel.tsx`
- Modify importers: `components/admin/ShowsTable.tsx:26`, `components/admin/NeedsAttentionInbox.tsx:13-14`, `app/admin/show/[slug]/page.tsx:28`, `components/admin/ChangeFeedTime.tsx:11`, `components/admin/ArchivedShowRow.tsx:30`, `components/admin/Dashboard.tsx:21`
- Tests: relocate `tests/components/admin/formatDateRange.test.ts` + `class-sweep-now-utility.test.ts` imports; DELETE `tests/components/admin/PendingPanel-awaiting-approval.test.tsx` and the `ActiveShowsPanel`/`PendingPanel` render cases in `DashboardPanels.test.tsx` + `section-header-affordance.test.tsx` (grep `rg -ln "ActiveShowsPanel|PendingPanel" tests/` and disposition EVERY hit: relocate import, delete dead-component case, or migrate the assertion to the live equivalent — state the disposition per file in the commit body); update `tests/help/_uiLabelExceptions.ts` + `forbidden-prose-registry.test.ts` entries that name the dead files.

- [ ] **Step 10.1:** Create `lib/admin/showDisplay.ts`: move `ActiveShowRow` (type), `formatDateRange`, `formatRelative` VERBATIM from `ActiveShowsPanel.tsx:12-115` (one home, no transitional re-export — spec §13). Re-point all six importers. Grep first for PendingPanel type consumers: `rg -n "PendingIngestionRow|FirstSeenStagedRow" --type ts --type tsx -g '!components/admin/PendingPanel.tsx'` — relocate any live consumer's type alongside (expected: none outside tests).
- [ ] **Step 10.2:** Delete both component files. `pnpm vitest run tests/` → green minus baseline (this task runs FIRST, before the matrix rewrite — `deep-link-walker-reverse` stays green because every surviving `help-affordance--` literal still maps to a current matrix row); fix any straggler imports the run surfaces.
- [ ] **Step 10.3:** `pnpm build` → compiles clean (catches `page.tsx`-level imports vitest misses).
- [ ] **Step 10.4:** Commit: `refactor(admin): delete dead ActiveShowsPanel/PendingPanel, relocate show display helpers (pre-matrix-rewrite per R18 execution order)`

### Task 11: Walker rework — helpers module, two viewports, HoverHelp arm

**Files:**
- Create: `tests/e2e/helpers/walkerRoutes.ts` (runner-neutral — NO `@playwright/test` import)
- Create: `tests/help/walker-routes.test.ts`
- Modify: `tests/e2e/deep-link-walker.spec.ts`, `playwright.config.ts:154-168`

- [ ] **Step 11.1: Failing unit tests** (`tests/help/walker-routes.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { AFFORDANCE_MATRIX } from "@/app/help/_affordanceMatrix";
import { allWalkableRows, prepKindFor, routeForPure, walksAt } from "../e2e/helpers/walkerRoutes";

describe("walker route derivation (spec §3.1/§6)", () => {
  it("non-placeholder sourceRoutes pass through routeForPure unchanged (R4 pin)", () => {
    for (const row of AFFORDANCE_MATRIX) {
      if (row.kind !== "concrete") continue;
      if (/rpas-central-2026|eric-weiss|STAGED_ID_PLACEHOLDER/.test(row.sourceRoute)) continue;
      expect(routeForPure(row, { slug: "x", crewId: "y", stagedId: "z" })).toBe(row.sourceRoute);
    }
  });

  it("prep kind keys on parsed pathname: /admin?bucket=archived gets dashboard prep (R4 row-5 pin)", () => {
    expect(prepKindFor("/admin?bucket=archived", "help-affordance--dashboard-archived-shows--tooltip")).toBe("dashboard");
    expect(prepKindFor("/admin?step=2", "help-affordance--wizard-step2--tooltip")).toBe("wizard");
    expect(prepKindFor("/admin", "help-affordance--dashboard-active-shows--tooltip")).toBe("dashboard");
    expect(prepKindFor("/admin/settings", "help-affordance--settings-preferences--tooltip")).toBe("none");
  });

  it("walksAt partitions by visibleAt; allWalkableRows registers every non-deferred row (R7 pin)", () => {
    const desktopOnly = allWalkableRows.find(
      (r) => r.testid === "help-affordance--dashboard-needs-attention--tooltip",
    );
    expect(desktopOnly, "desktop-only row must be REGISTERED (skip at runtime, never absent)").toBeDefined();
    expect(walksAt(desktopOnly!, "desktop")).toBe(true);
    expect(walksAt(desktopOnly!, "mobile")).toBe(false);
    const concrete = AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete");
    expect(allWalkableRows).toHaveLength(concrete.length - 2); // minus the two DEFERRED_TESTIDS
    for (const r of allWalkableRows) expect(walksAt(r, "mobile") || walksAt(r, "desktop")).toBe(true);
  });
});
```

Concrete failure modes: a re-introduced per-testid route special case; exact-string prep regression stranding `?bucket=archived` in wizard mode; a `visibleAt: desktop` row walked at 390px (guaranteed false failure).

- [ ] **Step 11.2:** Run → FAIL (module doesn't exist).
- [ ] **Step 11.3: Implement `walkerRoutes.ts`:** export `allWalkableRows` = concrete rows minus `DEFERRED_TESTIDS` (import both from the matrix — the ONE registration array); `walksAt(row, vp: "mobile" | "desktop")` = `row.visibleAt === vp || row.visibleAt === "both"`; `routeForPure(row, fixtures)` = pure placeholder substitution ONLY (`rpas-central-2026` → `fixtures.slug`, `eric-weiss` → `fixtures.crewId`, `STAGED_ID_PLACEHOLDER` → `fixtures.stagedId`); `prepKindFor(sourceRoute, testid)` = `"wizard"` if testid starts with `help-affordance--wizard-step`, else `"dashboard"` if `new URL(sourceRoute, "http://localhost:3004").pathname === "/admin"`, else `"none"`.
- [ ] **Step 11.4:** Run → PASS.
- [ ] **Step 11.5: Rework the spec file.** `deep-link-walker.spec.ts`: delete the local `DEFERRED_TESTIDS` (`:17-30`) and the wizard `routeFor` special case (`:195-200`); import from `@/app/help/_affordanceMatrix` + `./helpers/walkerRoutes`; registration iterates `allWalkableRows` — the ONLY selection path; there is NO module-level viewport filter and NO env var (an unset env var would silently drop desktop-only rows from registration — R7). Viewport filtering is exclusively the runtime `test.skip` in Step 11.6. **Walker goes read-only on locked tables (R10 CRITICAL):** `firstSeenStagedId` (`:136-168`) currently delete/inserts `pending_syncs` — an invariant-2 locked table — unlocked via PostgREST; strip its mutation half (the fixture row moves to the seed extension, Task 12) leaving a pure lookup that loud-throws when the seeded staged row is absent. Add to `tests/help/walker-routes.test.ts` a structural pin: read `tests/e2e/deep-link-walker.spec.ts` + every file under `tests/e2e/helpers/` and assert NO `.insert(`/`.update(`/`.delete(` occurs within 5 lines after a `from("shows"|"crew_members"|"crew_member_auth"|"pending_syncs"|"pending_ingestions")` call (concrete failure mode: someone re-adds an unlocked locked-table fixture write to the walker). `prepareAdminState` switches on `prepKindFor(...)`; `assertTarget` gains the HoverHelp arm between the direct-href and details arms:

```ts
const hoverTrigger = root.locator("button[aria-expanded]").first();
if ((await hoverTrigger.count()) > 0) {
  await hoverTrigger.click();
}
```

(then falls through to the existing nested-link assertion `:231-236`, which resolves the now-visible Learn-more inside the root). The legend row (`--legend`) is a direct `<a>` → first arm, untouched.

- [ ] **Step 11.6: Two projects, runtime skip.** Project identity is only available inside a test (`test.info().project.name`), never at module load — hence the unconditional registration:

```ts
for (const row of allWalkableRows) {
  test(`${row.testid} resolves on ${row.sourceRoute}`, async ({ page }) => {
    const vp = test.info().project.name === "help-docs-desktop" ? "desktop" : "mobile";
    test.skip(!walksAt(row, vp), `visibleAt=${row.visibleAt} — not walked at ${vp}`);
    // …existing body
  });
}
```

A desktop-only row reports `skipped` on mobile and `passed`/`failed` on desktop — never absent from either report.

Add the `help-docs-desktop` project: same `testMatch`/`dependencies`/`baseURL`/`locale`/`timezoneId`/`reducedMotion` as `help-docs`, but `viewport: { width: 1280, height: 800 }` and NO `devices["iPhone 14"]` spread. (`help-auth`/`help-mobile` specs in the shared `testMatch` are mobile-shaped — scope the desktop project's `testMatch` to `/deep-link-walker\.spec\.ts/` only.)

- [ ] **Step 11.7:** `pnpm vitest run tests/help` → all green (unit side). E2e verification deferred to Task 13 (needs fixtures).
- [ ] **Step 11.8:** Commit: `test(help): two-viewport walker, runner-neutral route helpers, HoverHelp assert arm`

### Task 12: Walker seed extension + setup wiring

**Files:**
- Create: `supabase/seedWalkerFixtures.ts`
- Modify: `tests/e2e/help-docs-setup.ts` (after the `pnpm db:seed` spawnSync, `:16-19`)

- [ ] **Step 12.1: Failing check:** add to `help-docs-setup.ts` (it is itself a Playwright setup "test") after seeding: query `shows` for `drive_file_id like 'seed-fixture:walker-%'` expecting 3 rows — run `pnpm test:e2e --project=help-docs-setup` → FAIL (0 rows).
- [ ] **Step 12.2: Implement `supabase/seedWalkerFixtures.ts`.** Standalone tsx script, same `databaseUrl` resolution as `supabase/seed.ts:11-13`, applied via the same `execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", …])` pattern (`seed.ts:186`). It emits ONE transaction that: takes `pg_advisory_xact_lock(hashtext('show:' || <id>))` for each of its FOUR drive_file_ids (three show fixtures + `seed-fixture:walker-first-seen` for the pending_syncs row — R11) FIRST, **in `drive_file_id`-sorted (ascending) order** — the same order the prefix-wide sweep in Step 12.3 produces, so the two transactions can never acquire overlapping lock sets in opposite orders (R7 deadlock fix) — then `delete`s any prior rows by those ids (idempotent re-run), ALSO delete+inserts the first-seen `pending_syncs` fixture row that `firstSeenStagedId` currently writes unlocked — **production-reachability (R17): this live state is NOT retired.** `20260608000004_retire_live_pending_syncs.sql` was a one-shot residue sweep of the pre-cutover whole-parse cohort; the surviving LIVE writers are the cron's clean-first-seen staging (`lib/sync/runScheduledCronSync.ts:663-670`, `insert into public.pending_syncs … on conflict (drive_file_id) where wizard_session_id is null`, emitted when the auto-publish toggle is OFF per `lib/sync/phase1.ts:322-330`'s `FIRST_SEEN_REVIEW` sentinel) and `lib/sync/runManualStageForFirstSeen.ts`; the staged route itself documents live scope (`app/admin/show/staged/[stagedId]/page.tsx:14,21,80`). The fixture's column shape must MIRROR the cron writer's insert column list (`runScheduledCronSync.ts:663-670`) — including a `FIRST_SEEN_REVIEW` `triggered_review_items` entry — not merely the old test payload; cite the writer in a comment so shape drift is traceable. Copy the fixed staged UUID `11111111-1111-4111-8111-111111111111` from `deep-link-walker.spec.ts:137`, with `drive_file_id` RENAMED from `g5-first-seen-fixture` to `seed-fixture:walker-first-seen` (its lock joins the same sorted lock set; the rename puts it inside the `seed-fixture:%` prefix so the R7 sweep locks it, base `db:seed` cleans it, and capture isolation extends to it — at HEAD the unprefixed row survived `db:seed` and could leak a first-seen item into the review-queues-empty-state capture on a shared local stack; R10: the walker keeps only the lookup), then inserts three `shows` rows with `drive_file_id` values `seed-fixture:walker-pending-review` / `seed-fixture:walker-archived` / `seed-fixture:walker-drive-error`, distinct slugs (`walker-pending-review-2026` etc.), titles, and states: `last_sync_status='pending_review'` + `archived=false` + `published=true`; `archived=true`; `last_sync_status='drive_error'` + `archived=false`. **INSERT shape (R9 fix):** start from `showInsertSql`'s column list (`supabase/seed.ts:192-244`) for the NOT-NULL/payload columns (dates, timestamps, parse payload), then EXTEND it with the state columns `showInsertSql` does NOT set because the base seed relies on their schema defaults: explicitly write `archived`, `published`, and (for the archived fixture) `archived_at` per the three states above — copying `showInsertSql` verbatim would insert the "archived" fixture as an active show (`archived` defaults to false) and silently hollow out row 5's coverage. Then add `help-docs-setup` assertions that each walker slug carries its exact expected state triple (`archived`, `published`, `last_sync_status`) before any walker test navigates. Also seed one unresolved `admin_alerts` row whose `show_id` is selected IN SQL from the show the walker will actually navigate (R8 fixture-binding fix — see the `fixtureShow` change in this step's companion edit below; column shape: copy an existing `admin_alerts` insert from the codebase, `rg -n "admin_alerts" supabase/ lib/ --type ts | head`). **Alert lifecycle is idempotent IN THE SAME TRANSACTION (R14):** `admin_alerts` has no `drive_file_id` and carries a partial unique index on unresolved `(show_id, code)`, so a bare re-run insert conflicts or strands stale state — DELETE the prior fixture alert by that stable `(show_id, code)` pair first, then insert (`admin_alerts` is not invariant-2 locked, so no advisory lock is needed), and extend the `help-docs-setup` assertions with "exactly one unresolved fixture alert exists for that `(show_id, code)`". **Companion edit — pin the walker's fixture show:** the current `fixtureShow()` selects the LATEST show by `last_synced_at` (`deep-link-walker.spec.ts:101-116`), which after this task can resolve to a walker-created show that has no alert. Change it to resolve deterministically by the base-seed fixture identity: `.eq("slug", "2026-03-retirement-plan-advisor-institute-central-2026")` (the value of `RPAS_CENTRAL_2026_SLUG`, `scripts/help-screenshots.manifest.ts:26` — note the matrix's `rpas-central-2026` is only a placeholder TOKEN for `routeForPure`, not the real slug; loud-throw if the show is absent), and have the extension's alert insert select `show_id` via the same identifier: `(select id from public.shows where slug = '2026-03-retirement-plan-advisor-institute-central-2026')`. Add to the `help-docs-setup` assertions: the seeded alert's `show_id` equals the show resolved by that slug — pinning route↔fixture binding end-to-end. Run it from `help-docs-setup.ts` via `spawnSync("pnpm", ["dlx", "tsx", "supabase/seedWalkerFixtures.ts"], …)` with the same status assertion as the `db:seed` call.
- [ ] **Step 12.3: Lock the base cleanup (spec §6.3 R6 CRITICAL — do this BEFORE the isolation check).** `seed.ts`'s `seedSql` deletes `shows` by `like 'seed-fixture:%'` (`seed.ts:530-537`) while locking only the enumerated base fixture ids (`:517-523`) — with walker rows present that wildcard delete mutates `shows` rows whose locks it does not hold (invariant 2 P0). In `seedSql`, IMMEDIATELY after the enumerated lock block and before any delete, add:

```sql
create temporary table _locked_seed_ids on commit drop as
  select drive_file_id from (
    select drive_file_id from public.shows where drive_file_id like 'seed-fixture:%'
    union
    select drive_file_id from public.pending_syncs where drive_file_id like 'seed-fixture:%'
    union
    select drive_file_id from public.pending_ingestions where drive_file_id like 'seed-fixture:%'
  ) ids;

select pg_advisory_xact_lock(hashtext('show:' || drive_file_id))
  from _locked_seed_ids
 order by drive_file_id;
```

…and the three LOCKED-table deletes (`pending_syncs`, `pending_ingestions`, `shows` — `seed.ts:529-537`) change their predicates from `like 'seed-fixture:%'` to `in (select drive_file_id from _locked_seed_ids)` (R15: under READ COMMITTED, a row committed by a concurrent extension run between the sweep and a wildcard DELETE would be deleted without its lock; deleting by the locked snapshot means such a row simply survives this cleanup — correct, since the extension's own idempotent delete owns it. The non-locked `sync_audit` delete stays a plain wildcard). The UNION covers every locked table the cleanup touches because a `pending_syncs`-only fixture like `seed-fixture:walker-first-seen` has no `shows` row (R11); `order by drive_file_id` keeps acquisition order deterministic, matching the extension's sorted order (R7 deadlock class). Add a DB-free structural pin to `tests/db/seed-restage-fixture.test.ts` (the existing source-level seed.ts test): (a) the seed source materializes `_locked_seed_ids` with union arms for `shows`, `pending_syncs`, `pending_ingestions`, acquires `pg_advisory_xact_lock` over it WITH `order by drive_file_id`, all textually preceding the first locked-table delete; (b) NO locked-table delete uses a naked `like 'seed-fixture:%'` predicate — each must reference `_locked_seed_ids` (the `sync_audit` wildcard is the sole allowed exception); (c) `supabase/seedWalkerFixtures.ts` acquires exactly FOUR locks — the three show fixture ids plus `seed-fixture:walker-first-seen` — in sorted `drive_file_id` order (parse the lock lines, assert the set and the order). Concrete failure modes: sweep removed or reordered after a delete, ORDER BY dropped, a union arm dropped, a locked-table delete reverting to the naked wildcard (the R15 race), the pending_syncs-only id missing from the extension's lock set, or extension lock order drifting from sorted.

- [ ] **Step 12.4:** `pnpm test:e2e --project=help-docs-setup` → PASS. Verify capture isolation: run `pnpm db:seed` alone and assert the walker rows are GONE (`psql … -c "select count(*) from shows where drive_file_id like 'seed-fixture:walker-%'"` → 0). If db:seed's cleanup does NOT remove them (prefix scope narrower than assumed), extend the extension script with a self-cleanup preamble AND add the locked delete to `seed.ts`'s cleanup — do not ship without this property.
- [ ] **Step 12.5:** Commit: `test(e2e): walker-only locked seed extension + prefix-wide cleanup lock (invariant 2)`

### Task 13: Local two-viewport walker green (gate)

- [ ] **Step 13.1:** Fresh local stack state: `pnpm db:seed`, then `ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture pnpm exec playwright test --project=help-docs-setup --project=help-docs --project=help-docs-desktop` (server env per `playwright.config.ts` webServer entries — `:276-286` builds and serves :3004).
- [ ] **Step 13.2:** Expected: ALL rows pass at their viewports — 17 live rows × applicable viewports (15 `both` ⇒ both runs, 1 `desktop` ⇒ desktop only, runtime-skipped on mobile; legend/archived/alerts/drive-health rows render from Task-12 fixtures). Triage every failure to its task; re-run until green. This step is the milestone's core acceptance gate — do not weaken row assertions to pass; fix surfaces or fixtures.
- [ ] **Step 13.3:** Commit any fixes with task-scoped messages; then `git commit --allow-empty -m "test(e2e): two-viewport walker green locally (17 live rows)"` recording the run summary in the body.

### Task 14: CI — shared bootstrap, help-affordances workflow, x-audits job

**Files:**
- Create: `scripts/ci/supabase-local-bootstrap.sh`
- Modify: `.github/workflows/screenshots-drift.yml`, `.github/workflows/screenshots-regen.yml` (replace inline bootstrap with the script)
- Create: `.github/workflows/help-affordances.yml`
- Modify: `.github/workflows/x-audits.yml`

- [ ] **Step 14.1:** Extract the guarded-migration boot from `screenshots-drift.yml:25-80` VERBATIM into `scripts/ci/supabase-local-bootstrap.sh` (steps: hold aside `20260527000003_schedule_cron_jobs.sql` + `20260602000005_b3_schedule_notify_cron.sql` → `supabase start` → `alter database` set placeholder `app.fxav_vercel_url` GUC → restore → `supabase migration up --include-all`; keep every existing comment line — they encode the M12.1/M12.3 incident knowledge). Both screenshot workflows call the script; diff their behavior to confirm no step changed (`bash -n` + side-by-side).
- [ ] **Step 14.2:** `.github/workflows/help-affordances.yml`:

```yaml
name: Help affordances (deep-link walker)
on:
  pull_request:
    paths:
      - "components/admin/**"
      - "app/admin/**"
      - "app/help/**"
      - "lib/messages/**"
      - "lib/admin/**"
      - "tests/e2e/**"
      - "playwright.config.ts"
      - "scripts/ci/**"
      - "supabase/migrations/**"
      - "supabase/seed.ts"
      - "supabase/seedWalkerFixtures.ts"
      - ".github/workflows/help-affordances.yml"
  workflow_dispatch:

jobs:
  deep-link-walker:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
      - name: Install psql (db:seed shells out via execFileSync("psql", …) — seed.ts:185-189; R14)
        run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Boot local Supabase (guarded migrations)
        run: bash scripts/ci/supabase-local-bootstrap.sh
      - run: pnpm exec playwright install --with-deps chromium
      - name: Run walker (mobile + desktop)
        env:
          # help-docs-setup.ts:11-13 asserts these in the TEST-RUNNER process —
          # the webServer.env in playwright.config.ts only reaches the Next
          # server process, NOT the Playwright workers (spec R6).
          ENABLE_TEST_AUTH: "true"
          TEST_AUTH_SECRET: "test-secret-fixture"
        run: pnpm exec playwright test --project=help-docs-setup --project=help-docs --project=help-docs-desktop
```

(Mirror the pnpm/node versions and any Supabase env exports — local-stack URL/service-role values consumed by `tests/e2e/helpers/supabaseAdmin.ts` — from the screenshot workflows EXACTLY; read them before writing. The Playwright webServer builds the app itself; CI=true makes it use `pnpm build && pnpm start` per `playwright.config.ts:199-205`.)

- [ ] **Step 14.3:** `x-audits.yml`: append job `affordance-matrix-parity` cloned from the `postgrest-dml-lockdown` job shape (`:307-341`) minus the psql/DB env (this meta-test is DB-free): checkout → pnpm → node 20 → install → run step with `shell: bash` and:

```bash
set -o pipefail
pnpm vitest run tests/help/_metaAffordanceMatrixParity.test.ts tests/help/_affordance-matrix-shape.test.ts tests/help/deep-link-walker-reverse.test.ts 2>&1 | tee affordance-matrix-parity.log
```

(`set -o pipefail` is MANDATORY — without it `tee` exits 0 and a failing Vitest run merges green, R16; the existing jobs carry it at `x-audits.yml:340`. Upload `affordance-matrix-parity.log` as an artifact if the sibling jobs do.)
- [ ] **Step 14.4:** `actionlint` on all touched workflows (or `gh workflow view` post-push); commit: `infra: shared supabase bootstrap + help-affordances walker workflow + affordance-matrix-parity audit job`
- [ ] **Step 14.5 (post-push):** `gh workflow run help-affordances.yml --ref <branch>` → real-CI green is a close-out gate (AGENTS.md local-passes-CI-fails discipline). Budget ≥2 rounds for environment gaps.

### Task 15: Spec §5.6 amendment + DEFERRED bookkeeping

**Files:**
- Modify: `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md:355-384`
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md`

- [ ] **Step 15.1:** Replace the §5.6 row table with the spec §3.1 table (all 7 columns incl. `sourceRoute`/`visibleAt`); add an amendment note block (date, this spec's path, the five renames, the needs-attention two-row split, the `--legend` kind, two-viewport walker contract); extend the class-sweep paragraph (`:382`) with "enforced by `tests/help/_metaAffordanceMatrixParity.test.ts` (x-audits `affordance-matrix-parity`, every PR)".
- [ ] **Step 15.2:** DEFERRED.md: suffix M11-G-D-6 and M11-G-D-1 headers with `— ✅ RESOLVED 2026-06-<dd> (M12.12, PR #<n>)` + one-line resolution note each; G-D-2/G-D-3 untouched.
- [ ] **Step 15.3:** Commit: `docs(spec): ratify §5.6 amendment (19-row matrix, visibleAt, legend) + resolve M11-G-D-6/G-D-1`

### Task 16: Screenshot baseline regen (needs-attention captures)

- [ ] **Step 16.1:** Push the branch; dispatch `screenshots-regen.yml` on it (`gh workflow run screenshots-regen.yml --ref <branch>`) — sanctioned pinned-amd64 path. Expect exactly the `needs-attention-mobile` family (light + dark) to change (row 3's header "?"); any OTHER changed capture means a leak (fixture isolation or popover-open state) — STOP and root-cause, do not re-baseline extra files.
- [ ] **Step 16.2:** Commit the regen output (the workflow commits or uploads; follow its established flow from PR #22) and confirm `screenshots-drift.yml` goes green on the PR.

### Task 17: Gates — impeccable (external), cross-model reviews, close-out

- [ ] **Step 17.1: Impeccable dual-gate (invariant 8, EXTERNAL attestation):** dispatch a fresh subagent to run `/impeccable critique` AND `/impeccable audit` on the milestone diff (UI surfaces: ShowsTable legend, HoverHelp variant, needs-attention/per-show/settings "?" placements, help-content pages) with the canonical v3 preflight gates. HIGH/CRITICAL → fix (then re-attest externally) or DEFERRED.md with trigger. Findings + dispositions recorded for the handoff.
- [ ] **Step 17.2: Cross-model adversarial review (mandatory):** `codex-companion.mjs adversarial-review` per round on the full milestone diff (fresh-eyes, REVIEWER ONLY framing, do-not-relitigate list = spec §2/§13 + plan dispositions). Iterate to APPROVE.
- [ ] **Step 17.3: Whole-milestone fresh-eyes close-out:** after per-task gates, one more full-diff adversarial round explicitly framed as integration review (cross-task composition: meta-test ↔ matrix ↔ walker ↔ seed ↔ CI).
- [ ] **Step 17.4:** Full local suite (`pnpm test`) — only the 3 known environmental failures remain; `pnpm build` clean; push; real CI green (x-audits incl. new job, screenshots-drift, help-affordances via dispatch + the PR's own path-triggered run); PR with summary + test plan; merge per owner instruction.

---

## Plan self-review record

- **Spec coverage:** §3 → T1; §4.1 → T2; §4.2 → T3–T7; §4.3 → T3; §5 → T8; §6 → T11–T13; §7 → T9; §8 → T10; §9 → T15; §10 → T14; §11 (regen) → T16; §12–13 → throughout + T17. No uncovered spec section.
- **Type consistency:** `visibleAt` union, `DEFERRED_TESTIDS: ReadonlySet<string>`, `rootTestId`/`learnMore` prop names, `walkerRoutes` export names (`allWalkableRows`/`walksAt`/`routeForPure`/`prepKindFor`) used identically across T1/T2/T9/T11.
- **Sequencing (R18):** execution order T10 → T1 → T2…T8 → T9 → T11… (declared after the file-structure table). Deleting the dead carriers FIRST keeps `deep-link-walker-reverse` green through the matrix rewrite; the meta-test then lands green at T9 with stash-based negative verification as its failing-first evidence. No commit anywhere in the plan lands with a known-red default-suite test (invariant 1); the e2e walker's red-at-HEAD state is pre-existing and goes green at T13.
- **Layout-dimensions task:** none required — no fixed-dimension parent/child relationships introduced (legend is normal flow; popovers absolute overlays). Declared per writing-plans rule.
- **Transition audit:** folded into T3 (legend = the only new visual-state element; declared instant; compound case stated). No `AnimatePresence` introduced anywhere in the milestone.
