# Milestone 3 — Admin upload-test (AC-3.1..3.3)

> Part of [the FXAV crew pages design plan](README.md).


Spec context: §17.1 milestone 3 + §15 demo wording. Eric uploads any fixture and sees the parse panel.

### Task 3.1: `/admin/dev` form — real Phase-1 write-through with isolated test schema

`/admin/dev` is a REAL Phase-1 write path, NOT a dry-run preview. AC-3.2 and AC-3.3 explicitly assert rows land in `pending_syncs` and `pending_ingestions`; a pure preview cannot satisfy them. The earlier draft's "without writing to the DB yet" wording was the contradiction — eliminated. To prevent the M3 dev panel from corrupting real `shows`/staging rows during fixture upload-tests, every `/admin/dev` write happens in an **isolated `dev_*` schema** (the migrations apply twice — once to `public` for production, once to `dev` for the panel).

**Auth gate is mandatory.** `/admin/dev` is a write surface (creates `dev.pending_syncs` rows) AND has a destructive `TRUNCATE dev.* CASCADE` reset action. Schema isolation prevents `public.*` corruption but does NOT solve the access-control problem: without an auth gate, anyone hitting the URL can pollute test state and hammer reset. Per the spec routing table §7.3, every `/admin/**` route is admin-auth-required. **Both the page (`app/admin/dev/page.tsx`) AND the server action (`parseAndStage`) AND the reset action MUST call `requireAdmin` as their first line — X.3's chain audit catches missing gates as a blocking CI failure.**

**Build-time flag (server-only, NOT NEXT_PUBLIC).** Earlier draft used `NEXT_PUBLIC_ENABLE_ADMIN_DEV_PANEL`; that prefix means the value is inlined into the client bundle at build time AND can be mutated at runtime via `process.env`/`env.set`. A Playwright test toggling it via `env.set` only changes runtime process state; it does NOT validate the actual build artifact. Switch to a **server-only env var `ADMIN_DEV_PANEL_ENABLED`** (no `NEXT_PUBLIC_` prefix), read in the route's Server Component `process.env.ADMIN_DEV_PANEL_ENABLED === 'true'`, and add an explicit dual-build test:
- Build the app twice — once with `ADMIN_DEV_PANEL_ENABLED=true` (dev/test), once with the var unset/`false` (prod). Run each build separately.
- For the prod build: assert `/admin/dev` returns 404 even with admin auth.
- For the dev build: assert the route loads with admin auth AND returns 403 without.

This proves the build artifact, not just runtime state. The dev panel must NEVER ship in production builds even with valid admin auth.

**Files:** Create: `app/admin/dev/page.tsx`, `app/admin/dev/actions.ts`. Modify: `supabase/migrations/...` to apply DDL to BOTH `public` AND `dev` schemas. Test: `tests/e2e/admin-dev.spec.ts`.

**Pipeline contract.** `parseAndStage` MUST exercise the **same** parser/enrichment boundary production uses, otherwise `/admin/dev` validates routing while the real sync path stages different data. Earlier drafts called `parseSheet` and went straight to invariants — that skips `enrichWithDrivePins` entirely, so the dev panel never exercises reel pins, linked-folder pins, embedded-image extraction, or enrichment-time warnings. The corrected flow is `parseSheet → enrichWithDrivePins(parsed, mockDriveClient) → runInvariants → phase1`, with the mock Drive client returning fixture-resident metadata for any folder/file IDs the fixture markdown references.

- [ ] **Step 1: Failing Playwright test**
  ```ts
  test('admin/dev: upload fixture, see parse panel (AC-3.1)', async ({ page }) => {
    await page.goto('/admin/dev');
    await page.selectOption('[data-testid=fixture-picker]', '2026-03-rpas-central-four-seasons.md');
    await page.click('[data-testid=parse-and-stage]');
    await expect(page.locator('[data-testid=parse-outcome]')).toHaveText(/auto[ -]apply|stage|hard fail/i);
    await expect(page.locator('[data-testid=triggered-items]')).toBeVisible;
    // The dev panel writes to `dev.*` schemas, not `public.*` — assert prod tables untouched.
    /*
     * Comprehensive public-schema isolation probe:
     * Earlier draft only checked `public.shows` count, missing writes to other Phase-1 targets and
     * status-field mutations on existing rows. The corrected probe snapshots every public Phase-1
     * write surface BEFORE the test AND re-asserts after:
     * - public.shows: row count unchanged AND every existing row's (last_sync_status,
     * last_sync_error, last_sync_attempted_at, last_synced_at, last_seen_modified_time)
     * unchanged (a status mutation is the most likely accidental write).
     * - public.pending_syncs: row count unchanged + content-hash unchanged.
     * - public.pending_ingestions: row count unchanged + content-hash unchanged.
     * - public.crew_member_auth: row count unchanged (auth side-effects must NOT spill to public).
     * - public.sync_log: row count unchanged.
     * - public.sync_audit: row count unchanged (Apply path writes here per §6.8.3 Apply-only;
     * dev mode strictly Phase-1 so should never write sync_audit either way).
     * Any discrepancy fails the test with the specific surface that was clobbered.
     */
  });
  // Auth-gate negative tests — must run at M3, not deferred to X.3.
  // The /admin/dev surface is a real write+TRUNCATE path that ships in this milestone; if X.3
  // doesn't land before M3 ships in any environment, the gates above are unverified.
  // Dual-build test for the server-only ADMIN_DEV_PANEL_ENABLED flag.
  // Run as separate Playwright projects with different build artifacts:
  // playwright.config.ts: { projects: [{ name: 'prod-build', use: { baseURL: 'http://localhost:3000' } /* ADMIN_DEV_PANEL_ENABLED unset */ }, { name: 'dev-build', use: { baseURL: 'http://localhost:3001' } /* built with ADMIN_DEV_PANEL_ENABLED=true */ }] }
  test('admin/dev: prod build returns 404 even for admin (build artifact gate)', async ({ page }) => {
    test.skip(test.info.project.name !== 'prod-build', 'this test is for the prod-build project only');
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto('/admin/dev');
    expect(response?.status).toBe(404);
  });
  test('admin/dev: dev build rejects non-admin', async ({ page, request }) => {
    test.skip(test.info.project.name !== 'dev-build', 'this test is for the dev-build project only');
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto('/admin/dev');
    expect(response?.status).toBe(403);
    // Verify dev.* state was NOT mutated:
    const { count } = await admin.from('dev.shows').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
  // ONE invocation model end-to-end (not a mix of fictitious POST URLs and
  // synthetic action IDs). `/admin/dev` exposes its surface as Server Actions in
  // `app/admin/dev/actions.ts` — `parseAndStage(fixtureName)` and `resetDevSchema`. The page
  // renders form-elements wired to those actions via Next.js's `<form action={parseAndStage}>` /
  // `<form action={resetDevSchema}>` syntax. There is NO `/admin/dev/parseAndStage` or
  // `/admin/dev/reset` route handler. The negative tests drive the SAME surface production uses:
  // render the page (admin or non-admin), submit the form, observe the server action's response.

  test('admin/dev: parseAndStage form submit rejects non-admin (dev build)', async ({ page }) => {
    test.skip(test.info.project.name !== 'dev-build', 'dev-build only');
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto('/admin/dev');
    expect(response?.status).toBe(403); // page-level requireAdmin already rejects
    const { count } = await admin.from('dev.pending_syncs').select('*', { count: 'exact', head: true });
    expect(count).toBe(0); // no fixture-derived rows landed
  });
  test('admin/dev: parseAndStage server action rejects non-admin even if page were bypassed (defense in depth, dev build)', async => {
    test.skip(test.info.project.name !== 'dev-build', 'dev-build only');
    // Server-side integration test of the action function directly — bypasses HTTP and Next.js
    // entirely. Imports the action and invokes it with a simulated non-admin auth context. This
    // proves requireAdmin runs as the action's first line, even if some future caller reaches
    // the action through a non-page entry point.
    const { parseAndStage } = await import('@/app/admin/dev/actions');
    await expect(parseAndStage.bind(null, '2026-03-rpas-central-four-seasons.md')).rejects.toThrow(/requireAdmin/);
    const { count } = await admin.from('dev.pending_syncs').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
  test('admin/dev: reset action rejects non-admin via server-side integration test (dev build)', async => {
    test.skip(test.info.project.name !== 'dev-build', 'dev-build only');
    await admin.from('dev.shows').insert({ /* minimal */ });
    const { resetDevSchema } = await import('@/app/admin/dev/actions');
    await expect(resetDevSchema.bind(null)).rejects.toThrow(/requireAdmin/);
    const { count } = await admin.from('dev.shows').select('*', { count: 'exact', head: true });
    expect(count).toBe(1); // reset blocked
  });

  // Pipeline-parity test:
  test('admin/dev runs the FULL parseSheet → enrichWithDrivePins → invariants → phase1 chain', async ({ page }) => {
    await page.goto('/admin/dev');
    await page.selectOption('[data-testid=fixture-picker]', '2026-05-fintech-forum-cto-summit.md'); // has reel + diagrams
    await page.click('[data-testid=parse-and-stage]');
    // Enrichment ran — assertions visible in the rendered panel:
    await expect(page.locator('[data-testid=enriched-reel-pin]')).toBeVisible; // headRevisionId + modifiedTime captured
    await expect(page.locator('[data-testid=enriched-linked-folder-items]')).toBeVisible; // linkedFolderItems[] populated
    await expect(page.locator('[data-testid=enriched-embedded-images]')).toBeVisible; // embeddedImages[] populated
    // Server-side spy: assert mockDriveClient was called (would be wired via test fixture).
  });
  // Parse-panel diagnostics test:
  test('admin/dev surfaces parse_warnings, every triggered MI, and raw_unrecognized chunks', async ({ page }) => {
    await page.goto('/admin/dev');
    await page.selectOption('[data-testid=fixture-picker]', '2025-03-dci-rpas-central.md'); // raw v2 fixture with typo
    await page.click('[data-testid=parse-and-stage]');
    await expect(page.locator('[data-testid=parse-warnings]')).toBeVisible; // §15 demo: warning list
    await expect(page.locator('[data-testid=parse-warning-item]')).toHaveCount(/* >= 1 */);
    await expect(page.locator('[data-testid=raw-unrecognized]')).toBeVisible; // raw_unrecognized chunks visible with snippet
    await expect(page.locator('[data-testid=triggered-mi]')).toBeVisible; // every MI code with name + reason
  });
  ```
- [ ] **Step 2: Implement** the page and a server action `parseAndStage(filename)` that:
  1. Reads the fixture from disk.
  2. **`const parsed = parseSheet(markdown)`** — pure parser, returns `ParsedSheet`.
  3. **`const parseResult = await enrichWithDrivePins(parsed, mockDriveClient, { driveFileId: fixtureFileId, fileMeta: fixtureMeta })`** — sync-layer enrichment, returns `ParseResult`. The `mockDriveClient` is a fixture-driven stub that returns deterministic `headRevisionId` / `md5Checksum` / linked-folder file lists. **Skipping this step is the bug this section guards against.**
  4. **`const invariants = runInvariants(prior, parseResult)`** where `prior` is the persisted state of the `dev.shows` row if a prior dev-Apply created one (for first-seen, `null`). Note this uses `parseResult`, not `parsed`.
  5. **Strictly Phase-1-only writes**: dev `parseAndStage` runs the §5.2 phase 1 logic against the `dev` schema — writes to `dev.pending_syncs` / `dev.pending_ingestions` AND status-only updates on `dev.shows` if a row already exists. **It does NOT INSERT new `dev.shows` rows directly** — that's a Phase 2 / Apply responsibility. To exercise the full Apply path in the dev panel, the operator clicks "Apply" on a staged row (which calls the same `applyStaged` endpoint M6 Task 6.11 implements, scoped to the `dev` schema via `search_path`). This keeps the dev panel's parity claim honest: same Phase 1 contract as production, same Apply path. Earlier draft conflated stage and apply by inserting `dev.shows` directly during parseAndStage — that diverges from canonical Phase 1 semantics and produces a different state machine than production.
  6. **Render the parse panel from the freshly-written `dev.*` rows AND the in-memory `parseResult`**: `parse_outcome`, `triggered-items`, `parse_warnings` with raw snippets, `raw_unrecognized` chunks (each with snippet + a "report this" button that pre-fills `/api/report` from the snippet), and the enrichment summary (reel pin, linked-folder count, embedded-image count). This is the M3 surface — it's the smallest viable parse panel; Task 10.7 layers in admin polish (filters, search, history).
- [ ] **Step 3: Cleanup affordance** — the `/admin/dev` page has a "Reset dev schema" button that runs `TRUNCATE dev.shows, dev.crew_members, dev.pending_syncs, dev.pending_ingestions, .. CASCADE` so successive fixture uploads start from a clean slate. Auto-truncate also runs at the start of every Playwright test setup hook to prevent test pollution.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(admin): /admin/dev with parse-panel + enrichment pipeline (M3)`.

### Task 3.2: MI-7 + MI-1 synthesis tests (AC-3.2, AC-3.3)

**Files:** Create: `tests/sync/dev-routing.test.ts`. May modify: `app/admin/dev/actions.ts` to support synthetic mutation.

- [ ] **Step 1: Failing tests** — use server-action invocation via Vitest against the `dev` schema. Synthesize `prior` = 4 hotels and `next` = 1, assert `dev.pending_syncs` contains the row with `triggered_review_items` containing `MI-7_SECTION_SHRINKAGE`. For AC-3.3, synthesize a markdown blob with no version markers and assert `dev.pending_ingestions` contains the row with `last_error_code = 'MI-1_VERSION_DETECTION_FAILED'`. **The dev schema isolation (Task 3.1) is what makes these AC tests safe to run alongside production data.** Each test starts with a `TRUNCATE dev.*` cleanup hook.
- [ ] **Step 2: Implement** the routing inside `parseAndStage` (this is the precursor to the M6 phase-1 logic — when M6 lands, this code is shared with `lib/sync/phase1.ts` via the same module, parameterized on schema namespace).
- [ ] **Step 3: Commit** `test(sync): MI-7 + MI-1 routing in /admin/dev with dev-schema isolation (AC-3.2..3.3)`.

---

# Milestone 4 — Crew page, no auth (AC-4.1..4.12)

Spec context: §8 entire section, §17.1 milestone 4. Demo: open the page on a phone, see direction B with empty-state discipline.

**Auth is mocked via an identity-only `?crew=<crewMemberId>` query param at this milestone**. Earlier draft used `?role=lead&crew=...` URL steering; that broadens the public route into a role-spoofing surface and undermines Task 4.3's identity-only `getShowForViewer` contract. The corrected mock only supplies the **identity** — `?crew=<crewMemberId>` — and `getShowForViewer` derives role flags fresh from `crew_members.role_flags` exactly as production will (Task 4.3's lookup binds `id` AND `show_id`, so a wrong `crewMemberId` from a different show fails closed). Admin preview is a separate `?as=admin` flag that maps to `Viewer = { kind: 'admin' }`. **`?role=` is ignored** even if present — a regression test (`tests/e2e/role-spoof.spec.ts`) asserts `?role=lead` cannot unlock financials when the bound crew row's role_flags don't include `LEAD`. M5 replaces the mock with real auth chains.

### Task 4.1: Run `/teach-impeccable` to establish design tokens

**Files:** Modify: `.impeccable.md` and any token files the skill writes.

- [ ] **Step 1:** Invoke the `frontend-design` and `teach-impeccable` skills per global CLAUDE.md "Frontend Tasks" rule. Capture the design tokens (colors, fonts, spacing, radii) into `.impeccable.md`. This is a one-time setup gating all UI work.
- [ ] **Step 2:** Commit `chore(design): establish impeccable tokens for crew page UI`.

### Task 4.2: Layout shell (`app/show/[slug]/page.tsx` + layout)

**Files:** Create: `app/show/[slug]/page.tsx`, `app/show/[slug]/layout.tsx`, `components/layout/Header.tsx`, `components/layout/Footer.tsx`. Test: `tests/e2e/crew-page.spec.ts`.

- [ ] **Step 1: Failing Playwright test** — assert page renders for a seeded slug; `data-testid="page-shell"` exists; mobile viewport renders the 2-col tile grid.
- [ ] **Step 2: Implement** Server Component that fetches show + viewer using `lib/data/getShowForViewer`. Viewer identity comes from the **identity-only mock** — `?crew=<crewMemberId>` resolves to `{ kind: 'crew', crewMemberId }`, `?as=admin` resolves to `{ kind: 'admin' }`. **`?role=` is explicitly ignored** if present; the page extracts ONLY `crew` and `as` from `searchParams`. Render Header + RightNowCard slot + tile grid + Footer. Use Tailwind v4 tokens from `.impeccable.md`.
- [ ] **Step 3: Commit** `feat(crew-page): layout shell`.

### Task 4.3: `getShowForViewer` data fetcher (§7.4)

**Files:** Create: `lib/data/getShowForViewer.ts`. Test: `tests/data/getShowForViewer.test.ts`.

**Role re-derivation invariant.** `getShowForViewer` MUST derive role from current `crew_members.role_flags` **inside** the helper on every call — NEVER trust caller-supplied `role_flags`. Spec §7.4 names this as the first line of defense: a stale token claim, a `?role=lead` preview param, or an accidental `role_flags: ['LEAD']` argument from a refactor cannot be allowed to make the helper join `shows_internal` and return financials after the DB row has been demoted. The signature accepts only **viewer identity** (`{ kind: 'crew', crewMemberId }` or `{ kind: 'admin' }`); the helper loads `crew_members.role_flags` itself. An earlier draft of this task accepted `role_flags` as a parameter — that was the regression vector.

- [ ] **Step 1: Failing tests**
  ```ts
  it('AC-4.1, AC-5.9 non-LEAD response omits financials', async => {
    // Seed crew row with role_flags=['A1'] in DB.
    const r = await getShowForViewer(showId, { kind: 'crew', crewMemberId: aliceId });
    expect(r.financials).toBeUndefined;
    expect(r.coi_status).toBeDefined; // public per §4.4
  });
  it('AC-4.2, AC-5.9 LEAD response includes financials', async => {
    // Seed crew row with role_flags=['LEAD','A1'] in DB.
    const r = await getShowForViewer(showId, { kind: 'crew', crewMemberId: leadId });
    expect(r.financials).toBeDefined;
    expect(r.coi_status).toBeDefined;
  });
  it('admin response includes financials', async => {
    const r = await getShowForViewer(showId, { kind: 'admin' });
    expect(r.financials).toBeDefined;
  });
  // Stale-role regression test:
  it('demoting LEAD→A1 in DB hides financials on next call (no caller role trust)', async => {
    // Seed lead with role_flags=['LEAD','A1']. Call once → financials present.
    const before = await getShowForViewer(showId, { kind: 'crew', crewMemberId: leadId });
    expect(before.financials).toBeDefined;
    // Demote in DB (simulating a sync rewriting role_flags=['A1']).
    await admin.from('crew_members').update({ role_flags: ['A1'] }).eq('id', leadId);
    // Call again with the SAME identity. The helper must re-derive role and hide financials.
    const after = await getShowForViewer(showId, { kind: 'crew', crewMemberId: leadId });
    expect(after.financials).toBeUndefined;
  });
  // Static-analysis test (regression guard):
  it('getShowForViewer signature does NOT accept role_flags', => {
    // Use ts-morph or simple grep — function signature must contain only `crewMemberId` / `kind`,
    // never `role_flags` / `roles` / `viewerRole`. A failing implementation that re-introduces a role param trips this.
    const src = fs.readFileSync('lib/data/getShowForViewer.ts', 'utf8');
    expect(src).not.toMatch(/role_flags\s*:/);
    expect(src).not.toMatch(/viewerRole\s*:/);
  });
  ```
- [ ] **Step 2: Implement** with this exact signature AND show-bound viewer lookup:
  ```ts
  // Round-X / : third kind 'admin_preview' added for Task 10.8 preview-as.
  // Identity-only — carries ONLY crewMemberId, no impersonate/role-bearing field. Resolves
  // EXACTLY like 'crew' (binds by id + show_id, derives role_flags fresh from DB, fails closed
  // cross-show). Difference vs 'crew' is surface-level only: the admin_preview route requires
  // requireAdmin and renders the sticky preview banner.
  type Viewer =
    | { kind: 'crew'; crewMemberId: string }
    | { kind: 'admin' }
    | { kind: 'admin_preview'; crewMemberId: string };
  export async function getShowForViewer(showId: string, viewer: Viewer): Promise<ShowForViewer> {
    const isAdmin = viewer.kind === 'admin';
    const needsCrewLookup = viewer.kind === 'crew' || viewer.kind === 'admin_preview';
    let roleFlags: RoleFlag[] = [];
    if (needsCrewLookup) {
      // **Bind lookup to BOTH id AND show_id.** Without the show_id
      // constraint, a caller can point at a LEAD row from a different show and inherit financial
      // visibility on this show. The crew row MUST belong to the requested show OR the call
      // throws LINK_NO_CREW_MATCH. This closes the cross-show financials leak Task 4.3 was
      // designed to prevent. admin_preview obeys the SAME contract — it never accepts caller-
      // supplied role flags or a passed-in crewMember object.
      const { data } = await supabase
        .from('crew_members')
        .select('role_flags')
        .eq('id', viewer.crewMemberId)
        .eq('show_id', showId) // mandatory show binding
        .single;
      if (!data) throw new Error('LINK_NO_CREW_MATCH'); // §7.2.2 step 5; canonical §12.4 code
      roleFlags = data.role_flags; // FRESH from DB, never from caller
    }
    const isLead = isAdmin || roleFlags.includes('LEAD');
    const showCols = isLead
      ? ['*, shows_internal(financials)'] // JOIN only when authorized
      : ['*']; // never query shows_internal otherwise
    /* ...select shows + filter related tables to viewer's crew row.. */
    return { /* .. financials only present when isLead .. */ };
  }
  ```
  `coi_status` always comes from `shows` (public per §4.4). Return show + crew + hotels (filtered to viewer name) + rooms + transport + contacts + pull_sheet.

  **Transport projection contract.** When `transportation` is non-null, the helper returns the FULL `TransportationRow` shape including `schedule: TransportScheduleEntry[]` where every entry carries `assigned_names: string[]` (per §4.1 / §6.7 canonical contract). The projection MUST NOT strip `assigned_names` — TransportTile's branch-2 visibility (Task 4.7) reads it directly. Add a regression test asserting that a seeded transportation row whose `schedule[0].assigned_names = ['Alice']` round-trips through `getShowForViewer` unchanged (the returned object's `transportation.schedule[0].assigned_names` deeply equals `['Alice']`).

  **Cross-show regression test (mandatory)**: seed two shows. Show A has crew member Alice (LEAD). Show B has crew member Bob (A1). Call `getShowForViewer(showB.id, { kind: 'crew', crewMemberId: alice.id })` (Alice belongs to A, NOT B). Assert the call THROWS `LINK_NO_CREW_MATCH` — does NOT return show B's data with Alice's LEAD role flags applied. Without the `show_id` constraint, this call would return show B's data with `financials` present (cross-show leak).
- [ ] **Step 3: Commit** `feat(data): getShowForViewer with internal role derivation (§7.4)`.

### Task 4.4: Tile components (Lodging, Venue, Crew, Contacts)

**Files:** Create: `components/tiles/{LodgingTile,VenueTile,CrewTile,ContactsTile}.tsx`. Test: `tests/e2e/crew-page.spec.ts` extends.

For each tile, follow the same TDD pattern:
1. Failing Playwright test asserts the tile's `data-testid` is visible and contains expected text from a seeded fixture.
2. Implement Server Component reading from props (shape derived from `getShowForViewer`).
3. Apply empty-state discipline per §8.3:
   - Required fields missing → "Doug hasn't filled this in yet" placeholder.
   - Optional fields missing → omit field entirely; tile sized to actual content.
4. Commit per tile, e.g. `feat(crew-page): LodgingTile`.

**Lodging tile specifics:** filter `hotel_reservations` by `names` substring match on viewer name.

**Crew tile specifics:** list every crew member with role + phone + email. Tap-to-call/email via `tel:`/`mailto:` href.

### Task 4.5: ScheduleTile (§8.1, AC-4.6)

**Files:** Create: `components/tiles/ScheduleTile.tsx`. Test: `tests/e2e/schedule-tile.spec.ts`.

- [ ] **Step 1: Failing tests**
  ```ts
  test('unknown_asterisk crew sees days-unconfirmed message, NO per-day schedule (AC-4.6)', async ({ page }) => {
    /* seed a fixture with unknown_asterisk crew member; navigate as them via mock */
    await expect(page.locator('[data-testid=schedule-tile]')).toContainText(/days aren't confirmed/i);
    await expect(page.locator('[data-testid=schedule-day]')).toHaveCount(0);
  });
  test('explicit-day crew sees only their days', async ({ page }) => { /* .. */ });
  test('unrestricted crew sees all show days', async ({ page }) => { /* .. */ });
  ```
- [ ] **Step 2: Implement** the three branches per §8.1 schedule tile spec.
- [ ] **Step 3: Commit** `feat(crew-page): ScheduleTile (§8.1)`.

### Task 4.6: Audio/Video/Lighting scope tiles (§8.1)

**Files:** Create: `components/tiles/{AudioScopeTile,VideoScopeTile,LightingScopeTile}.tsx`, `lib/visibility/scopeTiles.ts`. Test extends.

**Canonical scope-tile rule.** Spec §8.1 defines a SINGLE shared predicate set `SCOPE_TILE_VISIBILITY_RULE` that governs scope-tile visibility everywhere — this task, Task 4.12's transition audit, and the §17.1 acceptance criteria. Earlier drafts had two contradictory rules ("LEAD sees all" in this task vs "LEAD-only viewers see ONLY Financials" in Task 4.12); the corrected canonical rule per §8.1 is:

```ts
// lib/visibility/scopeTiles.ts — single source of truth, imported by every consumer.
export function audioScopeVisible(flags: RoleFlag[]): boolean {
  return flags.includes('A1') || flags.includes('A2') || flags.includes('LEAD');
}
export function videoScopeVisible(flags: RoleFlag[]): boolean {
  return flags.includes('V1') || flags.includes('LEAD');
}
export function lightingScopeVisible(flags: RoleFlag[]): boolean {
  // LEAD is INTENTIONALLY NOT included — spec §8.1 says lighting is a discipline LEADs don't manage hands-on.
  return flags.includes('L1');
}
```

LEAD-only viewers see Financials AND Audio scope tile AND Video scope tile (unconditional on the presence of audio/video crew on the show — LEAD has scope visibility regardless). LEAD-only viewers do **NOT** see Lighting scope tile. Compound viewers like `['LEAD','A1']` see Audio (twice-true via either predicate) + Video + Financials.

- [ ] **Step 1:** failing tests assert tiles render per the canonical rule:
  - `['A1']` viewer → Audio visible; Video and Lighting hidden.
  - `['V1']` viewer → Video visible; Audio and Lighting hidden.
  - `['L1']` viewer → Lighting visible; Audio and Video hidden.
  - `['LEAD']` viewer → Audio AND Video visible; Lighting hidden.
  - `['LEAD','A1']` viewer → Audio AND Video visible; Lighting hidden.
  - `['LEAD','L1']` viewer → Audio AND Video AND Lighting visible (Lighting from L1 atomic flag, not LEAD).
  - Aggregates `rooms[*].audio` etc. across GS / breakouts / additional.
- [ ] **Step 2:** implement using the shared `lib/visibility/scopeTiles.ts` predicates. Each tile imports its own predicate; NO ad-hoc `viewerRole === 'LEAD'` checks anywhere.
- [ ] **Step 3:** commit `feat(crew-page): scope tiles with canonical SCOPE_TILE_VISIBILITY_RULE (§8.1)`.

### Task 4.7: TransportTile (§8.1)

**Files:** Create: `components/tiles/TransportTile.tsx`.

**Visibility branches.** The Transport tile renders for **any** of these:
1. `transportation.driver_name === viewer.name` — the assigned driver.
2. The viewer's name appears in any per-day transport schedule tag — passenger or co-driver.

Earlier draft only checked branch 1. Crew assigned via schedule tags only would never see vehicle/parking/timing data — exactly the population that needs it.

**End-to-end contract dependency.** This task depends on `assigned_names: string[]` being a canonical field on every `TransportScheduleEntry` AT EVERY LAYER:
- Parser (§5.4 / Task 1.7 step 7): emits `assigned_names: string[]` on each schedule entry; empty array when no tagged names.
- Seed (§5.5 / `tests/seed/seed.ts`): seed transportation rows include `assigned_names` populated for fixture viewers who must satisfy branch-2 visibility.
- Persistence (Phase 2 / Task 2.x snapshot replacement into `transportation.schedule` JSONB): the JSONB write preserves `assigned_names` verbatim.
- `getShowForViewer` projection (Task 4.3): the helper returns `transportation.schedule[*].assigned_names[]` to the page renderer; it is NOT stripped during projection.
- TransportTile predicate (this task): consumes the projected `assigned_names[]` directly.
**If `assigned_names` is missing or stripped at any layer, branch 2 silently fails.** Add a layer-spanning fixture test (below) to catch this end-to-end.

- [ ] **Step 1: Failing tests**
  - Branch 1: tile renders when `transportation.driver_name === viewer.name`.
  - Branch 2: tile renders when viewer's name is in a transport schedule row's `assigned_names[]` (driver_name does NOT match — pure schedule-tag visibility).
  - Branch 1+2: when both true, tile renders once (no duplication).
  - Neither: tile absent.
  - **End-to-end fixture**: seed a show whose `transportation.driver_name = 'Cara'` and whose `schedule = [{ stage: 'Travel In', date: '2026-06-01', time: '09:00', assigned_names: ['Alice'] }]`. Render `/show/<slug>?crew=<alice-crewMemberId>`. Assert TransportTile is in the DOM, asserts `[data-testid=transport-tile]` is visible, AND assert (via response-payload introspection of the server-side `getShowForViewer` call) that `transportation.schedule[0].assigned_names` includes `'Alice'` — proving the field survived parser → seed → persistence → projection. A regression at ANY layer that drops `assigned_names` causes this test to fail.
- [ ] **Step 2:** implement the OR branch in the visibility predicate. Pull the schedule-tag set from `transportation.schedule[*].assigned_names[]` and OR with the driver_name match.
- [ ] **Step 3:** commit `feat(crew-page): TransportTile with driver + schedule-tag visibility + end-to-end assigned_names contract (§8.1)`.

### Task 4.8: ShowStatusTile + FinancialsTile (§8.1, AC-4.1..4.2)

**Files:** Create: `components/tiles/ShowStatusTile.tsx`, `components/tiles/FinancialsTile.tsx`.

- [ ] **Step 1: Failing tests**
  ```ts
  test('Show status tile visible to every crew viewer with COI (AC-4.1)', async ({ page }) => {
    /* navigate as A1 viewer */
    await expect(page.locator('[data-testid=show-status-tile]')).toBeVisible;
    await expect(page.locator('[data-testid=coi-status]')).toContainText(/SENT|IN PROCESS/);
  });
  test('Financials tile only for LEAD viewers (AC-4.2)', async ({ page }) => {
    /* as A1 → absent; as LEAD → present and contains PO/Proposal/Invoice */
  });
  ```
- [ ] **Step 2: Implement.** Show Status tile carries `coi_status` + dress code + venue notes. Financials carries `shows_internal.financials.{po,proposal,invoice,invoiceNotes}`.
- [ ] **Step 3: Commit** `feat(crew-page): Show status + Financials tiles (§4.4, §8.1)`.

### Task 4.9: PackListTile (§8.1, §6.10, AC-4.7..4.12)

**Files:** Create: `components/tiles/PackListTile.tsx`. Test: `tests/e2e/pack-list.spec.ts`.

- [ ] **Step 1: Failing tests** — exercise every AC-4.7..4.12 case:
  - AC-4.7: parser populates `pull_sheet` for the two fixtures with PULL SHEET; null for others.
  - AC-4.8: tile renders on **set day, travel-out day, AND strike day** for unrestricted crew when `pull_sheet IS NOT NULL`; absent on show days.
  - AC-4.9: tile absent for sheets without PULL SHEET.
  - AC-4.10: `stage_restriction` filters per-day rendering using the structured shape from §6.6: `{ kind: 'explicit', stages: ['Set', 'Strike', ...] }`. A crew member restricted to `['Set', 'Strike']` sees the tile only on days whose `ShowRow.schedule_phases[isoDate]` set intersects the restriction — set day maps to `['Set']` (or `['Load In','Set']` if same-day load-in), travel-out maps to `['Load Out']`, strike-day maps to `['Show','Strike']` or `['Strike']`. Test cases:
    - `stage_restriction.stages = ['Load In', 'Set']` → tile visible on Set day, hidden on Travel-Out + Strike.
    - `stage_restriction.stages = ['Load Out', 'Strike']` → tile hidden on Set, visible on Travel-Out + Strike.
    - `stage_restriction.stages = ['Set', 'Strike']` → tile visible on Set + Strike, hidden on Travel-Out.
  - AC-4.11: per-row partial-parse rows render rawSnippet; tile still appears.
  - AC-4.12: MI-8c stages on collapse / case drop / halved (this is exercised in M6's invariant tests; cross-check here that the tile renders the prior approved snapshot while review pending).
- [ ] **Step 2: Implement** with per-day visibility logic against the spec §6.6 stage_restriction shape AND the parser-derived schedule:
  ```ts
  // §6.6 stage_restriction shape — verbatim from spec:
  type StageRestriction =
    | { kind: 'none' } // no restriction (default)
    | { kind: 'explicit'; stages: WorkPhase[] }; // explicit work-phase set
  type WorkPhase = 'Load In' | 'Set' | 'Show' | 'Strike' | 'Load Out';

  // Today's work-phase set comes DIRECTLY from `ShowRow.schedule_phases`. NO re-derivation from `show.dates + show.schedule`
  // — that was an earlier draft that conflated two data sources. The parser owns the authoritative
  // per-day phase mapping in `schedule_phases: Record<string, WorkPhase[]>`. A single calendar
  // day can carry multiple phases (e.g., the final show day commonly carries both `Show` AND
  // `Strike`); the parser writes that compound shape into the persisted column.
  function todayWorkPhases(show: ShowRow, today: Date): WorkPhase[] {
    // derive the schedule key in the SHOW'S local timezone (NOT UTC).
    // Earlier draft used `today.toISOString.slice(0, 10)` which converts to UTC; crew near
    // midnight in non-UTC zones would hit tomorrow's key and gain/lose the Pack list tile a
    // day early/late. The corrected derivation uses date-fns-tz `formatInTimeZone` against the
    // show's venue timezone (or America/New_York as the default for FXAV's domestic-US event
    // domain — captured during the §9.0 onboarding wizard or derived from the venue address).
    const tz = show.venue?.timezone ?? 'America/New_York';
    const isoDate = formatInTimeZone(today, tz, 'yyyy-MM-dd'); // date-fns-tz; key matches schedule_phases insert-side keying
    return show.schedule_phases[isoDate] ?? []; // empty array means no work-phase activity that day
  }

  // Pack-list visibility per spec §8.1 — set day, strike day, travel-out (Load Out). NO Load In.
  // (Earlier draft included 'Load In'; spec §8.1 makes the pack-list tile visible only on
  // execution-phase days where crew need the manifest in hand. Load In is the day BEFORE
  // the manifest matters in this contract.)
  const PACK_LIST_VISIBLE_PHASES = new Set<WorkPhase>(['Set', 'Strike', 'Load Out']);

  function isPackListVisibleToday(show: ShowRow, viewer: Viewer): boolean {
    const phases = todayWorkPhases(show, today);
    if (!phases.some(p => PACK_LIST_VISIBLE_PHASES.has(p))) return false;
    const restrict = viewer.stage_restriction;
    if (restrict.kind === 'none') return true;
    // Intersect today's actual phase set with the viewer's restriction set.
    return phases.some(p => restrict.stages.includes(p));
  }
  ```
  **Three corrections from earlier draft**: 1. `stage_restriction` uses spec §6.6's `{ kind: 'none' }` | `{ kind: 'explicit'; stages[] }` discriminator — NOT `{ kind: 'work_phase'; stages[] }`. Earlier text used the wrong discriminator literal in test cases; the corrected predicate accepts only `'none'` or `'explicit'`.
  2. Today's phases come from `ShowRow.schedule_phases[isoDate]` — NOT from `show.dates + show.schedule` re-derivation. A single source of truth eliminates schedule-vs-dates drift. Earlier draft conflated those; the parser owns `schedule_phases` and the tile reads it directly.
  3. `PACK_LIST_VISIBLE_PHASES = {Set, Strike, Load Out}` — `Load In` is excluded per spec §8.1. Earlier draft included `Load In`, which would surface the tile a day too early for restricted crew.
- [ ] **Step 3: Cardinality cap** — render up to 12 cases inline; "Show more" disclosure for the rest. Items per case have no cap.
- [ ] **Step 4: Commit** `feat(crew-page): PackListTile with travel-out + stage_restriction (§6.10, §8.1)`.

### Task 4.10: NotesTile (§8.1)

- [ ] Aggregate every block-level `notes` field into a single "Things to know" tile. Truncate per-source items at 280 chars; "tap to expand"; show 8 max with "+N more notes" disclosure.
- [ ] Commit.

### Task 4.11: RightNowCard state machine (§8.2)

**Files:** Create: `components/right-now/RightNowCard.tsx`, `lib/time/rightNow.ts`. Test: `tests/time/rightNow.test.ts`, `tests/e2e/right-now.spec.ts`.

The state machine is a pure function `selectRightNowState(today, dates, viewerDateRestriction)` returning one of the §8.2 states. The card component renders the matched state.

- [ ] **Step 1: Failing unit tests** — every state-precedence case from §8.2's table, in order. Specifically:
  - `viewer_unconfirmed` wins regardless of show-wide state.
  - `viewer_after_last_day` evaluated **before** `viewer_off_day` (regression test for the "next assigned day pointing at nothing" bug §8.2 calls out).
  - Each show-wide state (`pre_travel`, `travel_in_day`, `set_day`, `show_day_n`, `travel_out_day`, `post_show`) gates on viewer being unrestricted OR today in viewer.days.
  - `unknown` and `dateless` fallbacks.
- [ ] **Step 2: Implement** the selector with explicit if/else on the table order.
- [ ] **Step 3: Failing Playwright test** that mocks `Date.now` to a fixed timestamp (e.g., the synthesized "Show Day 1" of a fixture) and asserts the card renders the expected text per AC-4.3.
- [ ] **Step 4: Implement RightNowCard component** that reads its state from `selectRightNowState` and renders per the §8.2 body specifications.
- [ ] **Step 5: Commit** `feat(crew-page): RightNow state machine (§8.2)`.

### Task 4.12: RightNowCard transition audit (§8.2 transitions, per global CLAUDE.md)

**Files:** Test: `tests/e2e/right-now-transitions.spec.ts`.

Per global CLAUDE.md: any component with multiple visual states must have a Transition audit task with **N*(N-1)/2 enumerated state-pair matrix** + compound-transition tests. Earlier drafts of this task hand-picked 7 transitions while claiming exhaustive coverage — that violates the inventory rule. The corrected scope below enumerates **all** §8.2 RightNow states pairwise and adds a separate transition audit for crew-page visibility modes.

**§8.2 RightNow states**: `pre_travel`, `travel_in_day`, `set_day`, `show_day_n`, `travel_out_day`, `post_show`, `viewer_off_day`, `viewer_off_day_pre`, `viewer_unconfirmed`, `viewer_after_last_day`, `dateless`, `unknown`.

That gives **66 pairs (12*11/2)**. Most are time-driven date rollovers; some are sync-driven (e.g., Any → `unknown`); a handful never occur naturally (e.g., `post_show → pre_travel`) and get an explicit "unreachable — no animation needed" annotation. **All 12 states get matrix coverage** — `viewer_off_day_pre` (viewer's off day BEFORE their first assigned day) and `dateless` (sheet has no parsed dates) cannot be omitted from the matrix or from Task 4.11's state-precedence tests.

- [ ] **Step 1: Pairwise matrix.** Build the 66-pair table (12 states × 11 / 2); each cell carries one of:
  - `crossfade-body` (date rollover; container `min-h-[X]` to preserve card height)
  - `morph-to-last-good` (any → `unknown` mid-show; stale tint applied)
  - `instant` (state changes that are user-initiated and acceptable as snap)
  - `unreachable` (no natural code path; assert never triggered in tests)
  Table lives in plan as a markdown grid (rows: from-state, cols: to-state); implementer copies into a TypeScript constant for the audit test to drive.
- [ ] **Step 2: Failing tests** — one assertion per pair (66 tests). Drive the from-state, mutate inputs (date prop / viewer.date_restriction / show.dates / sync error), assert the resulting animation treatment matches the matrix cell. For unreachable cells, write a `it.skip` with the reason and a regression guard that fails if the state ever transitions there. **Include `viewer_off_day_pre → set_day` (viewer's first assigned day arrives) and `dateless → unknown` / `dateless → pre_travel` (sync resolves the missing dates) — both are real production transitions.**
- [ ] **Step 3: Compound transitions** — 6 representative cases:
  - `Any → unknown` mid-`pre_travel → travel_in_day` crossfade (sync error during date rollover).
  - `viewer_off_day → show_day_n` mid-`show_day_n → show_day_n+1` (race when both fire on the same date boundary).
  - `viewer_unconfirmed → viewer_off_day` mid-`pre_travel → travel_in_day` (Doug fixes asterisk during travel rollover).
  - `Any → unknown` then `unknown → recovered` while role demotion is also pending (Task 4.13 cross-test).
  - Date prop change AND `viewer.date_restriction` change AND `crew_members.role_flags` change in same render cycle (compound state mutation).
  - Sync update mid-state with field-level pulse animation queued (verify pulse doesn't conflict with state-level crossfade).
- [ ] **Step 4: Crew-page visibility-mode transitions over `role_flags[]` capability set** — beyond RightNow states, the crew page's tile-visibility logic is driven by the **`role_flags[]` capability array** (§6.6), NOT a single role enum. Earlier draft used `viewerRole ∈ { A1, V1, L1, LEAD, admin }` — but `L1` isn't even a canonical flag, and a crew member can carry multiple flags simultaneously (`['LEAD', 'A1']`, `['A1', 'BO']`, etc.). The corrected audit drives transitions over capability predicates against the canonical §6.6 flag set:
  - **Canonical atomic flag set** — the parser decomposes composite tokens like `GS - A1` into atomic `['GS', 'A1']` and `BO - V1` into `['BO', 'V1']`. The canonical persisted `role_flags[]` contains ONLY atomic flags: `LEAD`, `A1`, `A2`, `V1`, `L1`, `BO`, `GS`, `ONLY`, `CAM_OP`, `GAV`, `FLOATER`, `FLOOR`, `STREAM`, `PTZ`, `LED`, `SHOW_CALLER`, `GREEN_ROOM`, `OWNER`, `CONTENT_CREATION`. **No composite flag literals like `GS-A1` or `BO-V1` ever appear in `role_flags[]`** — those are parser inputs, not persisted values. The transition audit drives over the atomic set; capability predicates use atomic-flag membership.
  - **Capability predicates** that drive tile visibility:
    - `hasLead = flags.includes('LEAD')` → unlocks `FinancialsTile`. **Per the canonical `SCOPE_TILE_VISIBILITY_RULE` defined in spec §8.1 and implemented in `lib/visibility/scopeTiles.ts`**, `hasLead` ALSO unlocks Audio scope tile AND Video scope tile (NOT Lighting). The shared predicates are: `audioScopeVisible = hasA1 || hasLead`, `videoScopeVisible = hasV1 || hasLead`, `lightingScopeVisible = hasL1`. LEAD-only viewers (`['LEAD']`) see Financials + Audio + Video; they do NOT see Lighting. This matrix MUST import the predicates from `lib/visibility/scopeTiles.ts` — no inline rule restatement.
    - `hasA1 = flags.includes('A1') || flags.includes('A2')` is the **atomic-membership predicate**. Per `SCOPE_TILE_VISIBILITY_RULE`, AudioScopeTile renders when `audioScopeVisible(flags) = hasA1 || hasLead`. (`GS-A1` decomposes to `['GS', 'A1']`, so `A1` membership covers it; no special-case for the composite.)
    - `hasV1 = flags.includes('V1')` is the atomic-membership predicate. VideoScopeTile renders when `videoScopeVisible(flags) = hasV1 || hasLead`. (`BO-V1` decomposes to `['BO', 'V1']`.)
    - `hasL1 = flags.includes('L1')` is the atomic-membership predicate. LightingScopeTile renders when `lightingScopeVisible(flags) = hasL1` (LEAD intentionally excluded). (`L1` is a canonical atomic flag in the v4 role-master per fixture `2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743`.)
    - Each tile-visibility predicate (`audioScopeVisible`, `videoScopeVisible`, `lightingScopeVisible`, `financialsVisible = hasLead || isAdmin`) is imported from `lib/visibility/scopeTiles.ts`. Compound viewers like `['LEAD', 'A1']` get FinancialsTile AND AudioScopeTile (both predicates true) AND VideoScopeTile (LEAD branch). LEAD-only viewers (`['LEAD']`) get FinancialsTile + AudioScopeTile + VideoScopeTile (NOT LightingScopeTile).
  - **Pairwise predicate-flip matrix**: enumerate the 5 × 4 / 2 = 10 ordered transitions across the 5 capability predicates (hasLead, hasA1, hasV1, hasL1, hasAdmin). Each transition is: 'predicate flips false → true' (tile appears) OR 'true → false' (tile disappears).
  - **Compound transitions**: include at least 3 cases where two predicates flip simultaneously in one render cycle. **Worked examples under the canonical SCOPE_TILE_VISIBILITY_RULE**: - `['LEAD','A1'] → ['A1']`: `hasLead` flips false. Tile-level: FinancialsTile disappears AND VideoScopeTile disappears (was unlocked by LEAD branch). AudioScopeTile stays visible (hasA1 still true). LightingScopeTile stays hidden.
    - `['LEAD','A1'] → ['V1']`: `hasLead` flips false, `hasA1` flips false, `hasV1` flips true. Tile-level: FinancialsTile disappears, AudioScopeTile disappears (no LEAD, no A1), VideoScopeTile stays visible (now via hasV1 branch instead of LEAD branch — net visibility unchanged but the *reason* shifted; assert tile renders without flicker).
    - `['LEAD'] → ['L1']`: `hasLead` flips false, `hasL1` flips true. Tile-level: FinancialsTile disappears, AudioScopeTile disappears, VideoScopeTile disappears, LightingScopeTile appears. Largest single-render visibility delta in the matrix.
  - **`viewer.date_restriction`** uses the spec discriminator literals `{ kind: 'none' } | { kind: 'explicit'; days: Date[] } | { kind: 'unknown_asterisk' }` — 3 states, 3 pairs (changes ScheduleTile rendering). : earlier draft used `'explicit_days'` and `'asterisk'` which don't match the parser/DB contract; the spec uses `'explicit'` and `'unknown_asterisk'`.
  - **`viewer.stage_restriction`** ∈ `{ kind: 'none' } | { kind: 'explicit'; stages: WorkPhase[] }` — at minimum cover `none ↔ explicit`. **`stage_restriction` only affects PackListTile** — it does NOT toggle Audio/Video/Lighting scope-tile filters. ScopeTile visibility is driven solely by capability predicates over `role_flags[]` (`hasA1`, `hasV1`, `hasL1`, etc., as enumerated in Step 4 above). Earlier draft incorrectly tied `stage_restriction` to ScopeTile filters.
  Each pair gets a transition treatment (crossfade tiles, instant for filters, etc.) AND a compound test where role flags + restriction change simultaneously.
- [ ] **Step 4b: TransportTile reassignment transitions over the canonical TransportationRow contract** — beyond `role_flags[]` and restriction toggles, the TransportTile's visibility predicate is OR'd over TWO branches (per §8.1 / Task 4.7): (a) `transportation.driver_name === viewer.name` AND (b) `viewer.name ∈ transportation.schedule[*].assigned_names[]` for ANY entry. Both branches can flip during a live sync update — Doug edits the sheet's transport block, the next cron pass replaces the row, the page re-renders with the new shape — and earlier drafts of this task did not enumerate transport-visibility transitions in the matrix. The corrected audit adds a 2 × 2 transition table over the two branch predicates `(driverNameMatch, anyScheduleTagMatch)`:
    - `(false, false) → (true, false)`: viewer becomes the assigned driver via sheet edit (e.g., Doug fills in `driver: <viewer.name>` in a row that previously had a different name). Transition treatment: TransportTile fades in (`AnimatePresence` mount).
    - `(false, false) → (false, true)`: viewer is added to a `schedule[*].assigned_names[]` array via sheet edit (Doug tags the viewer as a passenger / co-driver on a per-day row). Treatment: same fade-in mount.
    - `(true, false) → (false, false)`: viewer is removed as driver via sheet edit (Doug reassigns the driver field to a different name). Treatment: TransportTile fades out (`AnimatePresence` unmount). Grid reflows under the missing tile.
    - `(false, true) → (false, false)`: viewer's name is removed from every `assigned_names[]` array via sheet edit. Treatment: same fade-out unmount.
    - `(true, false) ↔ (false, true)`: the OR predicate's net result stays `true` but the *reason* changed (Doug demotes viewer from driver to passenger, or vice versa). Treatment: tile stays mounted (no AnimatePresence cycle); the schedule body inside the tile may pulse on the field that changed (driver name vs schedule entry). The tile MUST NOT flicker — assert it remains in the DOM continuously across the re-render.
    - `(true, true) → (true, false)` / `(true, true) → (false, true)`: viewer was BOTH driver AND tagged in a schedule row; one branch flips false but the other stays true. Tile stays mounted; the body pulses on the changed field. No flicker.
    - `(true, true) → (false, false)`: both branches flip false in a single sync (rare — Doug rewrites the entire transport block excluding the viewer). Tile fades out; grid reflows.
  - **Compound transitions involving transport reassignment** — at least 2 cases must be exercised against a live sync:
    - **Schedule-tag flip mid `crew_members.name` change**: a sync update simultaneously renames the viewer's `crew_members.name` AND mutates `transportation.schedule[*].assigned_names[]` referencing the old name. The OR predicate must evaluate against the new name (the `getShowForViewer` projection fetches `crew_members.name` AND `transportation.schedule[*].assigned_names[]` together; their consistency is enforced by the sync transaction's per-row replacement semantics in §5.2). Assert the tile's visibility resolves correctly post-sync (whether visible or hidden depends on whether the new name appears in `assigned_names[]`); the tile MUST NOT show stale visibility based on the old name.
    - **`role_flags[]` capability flip while transport visibility flips**: viewer's `role_flags[]` changes from `['LEAD']` to `['LEAD','A1']` in the same sync that also flips `(false, false) → (false, true)` for transport. Assert: AudioScopeTile fades in (capability transition from Step 4) AND TransportTile fades in (transport branch-2 transition from this step) — both `AnimatePresence` mounts must complete without one cancelling the other. The grid reflows once after both mounts settle.
  - **End-to-end live-sync test**: write at least ONE Playwright test that (1) seeds a show with `transportation.driver_name = 'Cara'` and `schedule[0].assigned_names = []`; renders the crew page as Alice (`driver_name` does NOT match, `assigned_names` is empty — TransportTile MUST be absent); (2) inside the test, mutates the seeded `transportation.schedule[0].assigned_names` to `['Alice']` via a direct DB write that emulates a successful Phase 2 sync (the test uses the `applyStaged` seed harness from Task 2.4 with a synthetic `transportation` UPDATE — NOT a raw SQL bypass; same path production sync uses); (3) waits for the Realtime channel `show:<id>` to fire — **a real Supabase Realtime channel mock is REQUIRED, NOT a polling fallback; see Task 4.16**; if the mock does not fire, the test fails outright (do NOT poll `getShowForViewer` as a backup); (4) asserts TransportTile is now in the DOM (`await expect(page.locator('[data-testid=transport-tile]')).toBeVisible`) within 2s of the synthetic Apply commit AND that `page.reload` was NOT called (manual refresh must NOT be the propagation path). Without this test, a regression in the projection layer that drops `assigned_names[]` during sync update (separate code path from initial render) would silently break branch-2 visibility post-sync; without the Realtime-only assertion, the suite would pass with no subscription wired at all.
- [ ] **Step 5: Implement** the transitions using framer-motion `AnimatePresence` for state swaps and ternary-based opacity transitions for in-state field updates. Card height stays fixed during crossfade by setting `min-h-[X]` on the container.
- [ ] **Step 6: Commit** `feat(crew-page): RightNow + visibility-mode transition matrix (§8.2 + §8.1)`.

### Task 4.13: Layout dimensions e2e (AC-4.4, per global CLAUDE.md "Layout dimensions" rule)

**Files:** Test: `tests/e2e/layout-dimensions.spec.ts`. Fixtures: `tests/fixtures/short-content.md`, `tests/fixtures/long-content.md`.

Per global CLAUDE.md: every component with a fixed-dimension parent containing flex/grid children must have a browser-rendered assertion calling `getBoundingClientRect` on every documented `data-testid` and asserting `child.dimension === parent.dimension` within 0.5px tolerance. Tailwind v4 does NOT default `.flex` to `align-items: stretch`.

**Full §8.4 dimensional invariants — every one MUST have a corresponding assertion.** Earlier draft of AC-4.4 only covered grid column count, tile min-height, and equal first-row heights. The full §8.4 list adds three more invariants the test must enforce:

1. **Right Now card full-width across all breakpoints**: at every tested viewport (390px, 1024px, 1200px), `[data-testid=right-now-card]`'s `getBoundingClientRect.width` equals the parent container's content-box width (within 0.5px) — i.e., the card spans the entire container minus container padding.
2. **Tile grid columns**: 2 cols < 640px, 3 cols 640–1024px, 4 cols > 1024px. Tiles within a row stretch to equal height (`align-items: stretch`) — Tailwind v4 non-default behavior.
3. **Tile min-height 96px**.
4. **240px internal-overflow rule**: any tile whose intrinsic content-height exceeds 240px MUST keep the overflow internal — `getComputedStyle(tile).overflowY ∈ {'auto', 'scroll'}` (or an equivalently scrollable container) AND a `[data-testid=tile-show-more]` disclosure control is rendered. Tiles whose content fits within 240px MUST NOT render the disclosure.
5. **Footer sticky-vs-flow behavior**: on a short-content fixture (page total content height < viewport height), the footer is fixed/sticky to the viewport bottom — `getBoundingClientRect.bottom` of the footer equals (window.innerHeight ± 0.5). On a long-content fixture (page total content height > viewport height), the footer is in the natural flow — its `bottom` position is determined by content, NOT pinned to viewport bottom; scrolling the page moves the footer with the content. Both fixtures must be exercised.

- [ ] **Step 1: Failing tests — exhaustive AC-4.4 coverage**: ```ts
  test('layout dimensions at 390px (AC-4.4)', async ({ page }) => {
    await page.goto('/show/<seeded-slug>?crew=<seeded-crew-with-A1-flag>');
    const container = page.locator('[data-testid=page-container]');
    const rightNow = page.locator('[data-testid=right-now-card]');
    const tiles = await page.locator('[data-tile]').all;
    const containerBox = await container.boundingBox;
    const rightNowBox = await rightNow.boundingBox;

    // Invariant 1: Right Now card full-width minus container padding
    expect(Math.abs(rightNowBox!.width - containerBox!.width)).toBeLessThan(0.5);

    // Invariant 2: 2-col grid at this width
    const cols = await page.evaluate( => {
      const g = document.querySelector('[data-testid=tile-grid]')!;
      return getComputedStyle(g).gridTemplateColumns.split(' ').length;
    });
    expect(cols).toBe(2);

    // Invariant 3: Tile min-height 96
    for (const t of tiles) {
      const b = await t.boundingBox;
      expect(b!.height).toBeGreaterThanOrEqual(96 - 0.5);
    }
    // First-row tiles share height (align-items: stretch verification)
    const tileHeights = (await Promise.all(tiles.slice(0, 2).map(t => t.boundingBox)))
      .map(b => b!.height);
    expect(Math.abs(tileHeights[0]! - tileHeights[1]!)).toBeLessThan(0.5);
  });

  test('Right Now full-width at all breakpoints (AC-4.4 invariant 1)', async ({ page }) => {
    for (const w of [390, 1024, 1200]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/show/<seeded-slug>?crew=<seeded-A1>');
      const container = await page.locator('[data-testid=page-container]').boundingBox;
      const rightNow = await page.locator('[data-testid=right-now-card]').boundingBox;
      expect(Math.abs(rightNow!.width - container!.width)).toBeLessThan(0.5);
    }
  });

  test('layout at 1024px is 3 cols, at 1200px is 4 cols (AC-4.4 invariant 2)', async ({ page }) => {
    for (const [w, expected] of [[1024, 3], [1200, 4]] as const) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/show/<seeded-slug>?crew=<seeded-A1>');
      const cols = await page.evaluate( => {
        const g = document.querySelector('[data-testid=tile-grid]')!;
        return getComputedStyle(g).gridTemplateColumns.split(' ').length;
      });
      expect(cols).toBe(expected);
    }
  });

  test('Tile internal overflow past 240px (AC-4.4 invariant 4)', async ({ page }) => {
    // Long-content fixture has one tile carrying long content (e.g., NotesTile with 30+ long notes
    // whose intrinsic content-height > 240px).
    await page.goto('/show/<long-content-slug>?crew=<seeded-A1>');
    const longTile = page.locator('[data-testid=notes-tile]');
    const overflowY = await longTile.evaluate(el => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflowY);
    // Disclosure visible for overflowing tile
    await expect(longTile.locator('[data-testid=tile-show-more]')).toBeVisible;
    // Short-content tile (e.g., VenueTile with name + address only): NO disclosure
    const shortTile = page.locator('[data-testid=venue-tile]');
    await expect(shortTile.locator('[data-testid=tile-show-more]')).toHaveCount(0);
  });

  test('Footer sticky on short pages, flow on long pages (AC-4.4 invariant 5)', async ({ page }) => {
    // Short-content fixture: total content < viewport
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.goto('/show/<short-content-slug>?crew=<seeded-A1>');
    const footerShort = await page.locator('[data-testid=page-footer]').boundingBox;
    expect(Math.abs(footerShort!.y + footerShort!.height - 1200)).toBeLessThan(0.5); // pinned to viewport bottom

    // Long-content fixture: total content > viewport
    await page.goto('/show/<long-content-slug>?crew=<seeded-A1>');
    const footerLongInitial = await page.locator('[data-testid=page-footer]').boundingBox;
    expect(footerLongInitial!.y + footerLongInitial!.height).toBeGreaterThan(1200 + 100); // below viewport — in flow
    // Scrolling moves the footer with content, NOT pinned to viewport bottom
    await page.evaluate( => window.scrollTo(0, 500));
    const footerLongScrolled = await page.locator('[data-testid=page-footer]').boundingBox;
    expect(footerLongScrolled!.y).toBeLessThan(footerLongInitial!.y); // moved upward as page scrolled
  });
  ```
- [ ] **Step 2: Implement** the layout primitives:
  - `[data-testid=tile-grid]` uses `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 items-stretch`. Each tile sets `min-h-24` (96px) and `h-full` to ensure it stretches per Tailwind v4's non-default stretch behavior. **Document this in a code comment** referencing the global CLAUDE.md note about Tailwind v4 not defaulting to stretch.
  - `[data-testid=right-now-card]` uses `w-full` (or equivalent fluid full-width) so it spans the container at every breakpoint.
  - Each tile component wraps its body in a container with `max-h-60 overflow-y-auto` (240px = 60 × 4px Tailwind unit) when content might exceed 240px; renders `[data-testid=tile-show-more]` disclosure control inside the tile when overflow is active.
  - `[data-testid=page-footer]` uses a sticky/flow pattern: page layout is a flex column with `min-h-screen`, the footer has `mt-auto` (so it floats to the bottom on short pages) but renders inside the natural flow (so on long pages it appears below content and scrolls with the page).
  - Both `tests/fixtures/short-content.md` (minimal content, total page < viewport) and `tests/fixtures/long-content.md` (NotesTile carrying 30+ long notes, total page > viewport at 390×1200) are added for this task's tests.
- [ ] **Step 3: Commit** `feat(crew-page): layout dimensions + full §8.4 invariant assertion (AC-4.4)`.

### Task 4.14: Empty-state discipline (AC-4.5, §8.3, §10)

**Files:** Tests across tile spec files; create `lib/visibility/emptyState.ts` for the per-field empty-treatment table.

**Per-field empty-treatment rules.** Earlier draft applied a blanket rule treating `null`, `''`, `'TBD'`, `'N/A'`, `'TBA'` (case-insensitive) as "not filled in" for ALL optional fields. That rule is wrong for `event_details.opening_reel`: spec §10 (line ~1923) explicitly says when the cell is text-only with values like `YES`, `MAYBE`, `N/A` the crew page renders a small text line "Opening reel: <value>". Blanket-hiding `N/A` would erase a documented crew-visible status. The corrected design uses a **per-field empty-treatment table** — different fields hide different sets of sentinel values.

**M4 ships URL-stripped text-only opening reel; inline `<video>` rendering defers to M7 Task 7.6.** Earlier draft of AC-4.5 required this task to render an inline `<video>` for mixed-value cells like `YES - <url>` — but the streaming source `/api/asset/reel/[show]` is created by Task 7.6 in M7. M4 cannot satisfy the inline-video assertion without exposing raw Drive URLs (forbidden by §10 / §7.3). Scope split:
- **M4 (this task)** renders **URL-stripped** text-only opening-reel status. Every non-empty/non-`TBD` cell renders as `Opening reel: <stripped value>` where the stripper removes ALL `https?://drive.google.com|docs.google.com/...` URL substrings AND orphaned ` - ` connector tokens BEFORE rendering. Mixed `YES - <drive-url>` cells render as `Opening reel: YES`. Pure-URL cells (entire cell value is a Drive URL → empty stripped residue) render NO line — empty residue is treated by the empty-state predicate as hide. Phase-1 enrichment still pins the reel (post-Apply, the `shows.opening_reel_*` columns get populated per §6.11.1) — the view layer just doesn't yet emit a `<video>` element.
- **M7 (Task 7.6 + new AC-7.25)** ADDS the inline `<video src="/api/asset/reel/<show>">` element when the post-Apply pin columns are non-NULL. M7 is purely additive: URL-stripped text status remains; `<video>` appears alongside. Pure-URL cells render ONLY the inline `<video>` at M7.

**Opening-reel render MUST strip all Drive URL substrings.** Earlier draft of this task said "render the cell value verbatim" — but a mixed-value cell like `YES - https://drive.google.com/file/d/<id>/view` would leak the raw Drive URL into crew DOM, violating the §10 proxy-only auth boundary. The corrected design strips URLs at render time. **Crew DOM MUST NEVER contain `https://` or `drive.google.com` substrings** for any opening-reel fixture (M4 baseline AND M7).

| Field | Empty values (hide entirely) | Render-as-text values | Notes |
|---|---|---|---|
| `event_details.opening_reel` (URL-stripped text rendering — M4 baseline; inline `<video>` adds in M7 Task 7.6) | `null`, `''`, `'TBD'` (case-insensitive after trim) AND any value whose URL-stripped residue is empty (the cell was a pure Drive URL — entire value matched the URL regex, OR after stripping connector tokens nothing remained). | `'YES'`, `'MAYBE'`, `'N/A'`, `'TBA'`, `'BACKUP ONLY'`, and the URL-stripped residue of mixed cells (e.g., `'YES - <url>'` → `'YES'`, `'LOOP VIDEO - <url>'` → `'LOOP VIDEO'`), and any other free-text value (per §10 / §6.5 free-text fallback). | Spec §10 names `MAYBE`, `YES`, `N/A` as crew-visible status text AND specifies the URL-strip render contract. M4 renders the URL-stripped value. M7 (Task 7.6) ADDS `<video src="/api/asset/reel/<show>">` when post-Apply `shows.opening_reel_*` columns are non-NULL. ONLY `TBD`, bare empty/null, AND pure-URL cells (empty stripped residue) are hidden at every milestone. |
| Generic optional text fields (e.g., `event_details.power`, `internet`, `keynote_requirements`, `rooms.scenic`, `notes` columns) | `null`, `''`, `'TBD'`, `'N/A'`, `'TBA'` (case-insensitive) | All other free-text values render verbatim. | Original blanket rule applies — these fields are not in spec §10's named-status list. |
| Required structural fields (e.g., `show.title`, `venue.name`) | n/a — missing required fields render the §8.3 placeholder ("Doug hasn't filled this in yet"), NEVER hidden. | n/a | §8.3 required-field discipline. |
| Whole tile missing (e.g., no transport assigned) | Tile not rendered. Grid reflows. | n/a | §8.3 / Task 4.7. |

The implementation lives in `lib/visibility/emptyState.ts` as a small dispatch table keyed by field name; tile components import the field-specific predicate. NO inline string-list duplication across tiles.

- [ ] **Step 1: Failing tests**: - Synthesize a fixture with `event_details.opening_reel = 'TBD'`. Crew page must NOT render any `Opening reel:` line (TBD is hidden for opening_reel per the table).
  - Synthesize fixtures with `event_details.opening_reel ∈ {'YES', 'MAYBE', 'N/A', 'TBA', 'BACKUP ONLY'}`. Crew page MUST render the small text line `Opening reel: <value>` for each (no URL substrings present, render as-is).
  - **URL-strip regression :** Synthesize a fixture with `event_details.opening_reel = 'YES - https://drive.google.com/file/d/abc/view'`. Crew page MUST render the URL-stripped text status line `Opening reel: YES` (NOT the raw cell value). Assert: `await expect(page.locator('[data-testid=opening-reel-tile]')).toContainText('Opening reel: YES')` AND `await expect(page.locator('main').textContent).not.toContain('https://')` AND `await expect(page.locator('main').textContent).not.toContain('drive.google.com')`. **At M4 the page MUST NOT render any `<video>` element**: assert `await expect(page.locator('video[src*="/api/asset/reel/"]')).toHaveCount(0)`. The asset route doesn't exist until M7 Task 7.6; rendering `<video>` against it from M4 would 404. M7's AC-7.25 inverts the `<video>` count assertion AND keeps the URL-absent assertion.
  - **Pure-URL cell:** Synthesize a fixture with `event_details.opening_reel = 'https://drive.google.com/file/d/abc/view'` (no surrounding text). Crew page MUST NOT render any `Opening reel:` line at M4 (entire cell value is the URL → empty stripped residue → hidden by empty-state predicate). DOM must satisfy `not.toContain('https://')` AND `not.toContain('drive.google.com')`.
  - **Other URL form:** Synthesize a fixture with `event_details.opening_reel = 'LOOP VIDEO - https://docs.google.com/document/d/abc/edit'`. Crew page MUST render `Opening reel: LOOP VIDEO`. DOM must satisfy `not.toContain('https://')` AND `not.toContain('docs.google.com')`.
  - Synthesize a fixture with `event_details.opening_reel = ''` (or `null`). Crew page MUST NOT render any `Opening reel:` line.
  - Synthesize a fixture with `event_details.power = 'N/A'`. Crew page MUST NOT render the power field (generic optional rule applies — power is NOT in spec §10's named-status list).
  - Synthesize a fixture with `event_details.power = 'House power, 20A'`. Crew page MUST render `Power: House power, 20A`.
- [ ] **Step 2: Implement** per-field empty-state predicates in `lib/visibility/emptyState.ts` AND the URL-stripping helper in `lib/visibility/openingReelText.ts`:
  ```ts
  // lib/visibility/openingReelText.ts — single source of truth for §10 URL-strip render contract.
  // Strips all https?://drive.google.com|docs.google.com/.. URL substrings AND orphaned ` - `
  // connector tokens left around them, then trims. The crew-page DOM MUST NEVER contain `https://`
  // or `drive.google.com` substrings for any opening_reel fixture — see regression test.
  const DRIVE_URL_RE = /(https?:\/\/)?(drive\.google\.com|docs\.google\.com)\/[^\s]+/g;
  export function stripOpeningReelText(value: string | null): string {
    if (value == null) return '';
    return value
      .replace(DRIVE_URL_RE, '')
      .replace(/\s+-\s+(?=\s*$)/g, '') // trailing connector
      .replace(/^\s*-\s+/, '') // leading connector
      .replace(/\s+/g, ' ')
      .trim;
  }

  // lib/visibility/emptyState.ts — per-field empty rules; see Task 4.14 table.
  import { stripOpeningReelText } from './openingReelText';
  const OPENING_REEL_HIDE = new Set(['', 'TBD']); // case-insensitive after trim
  const GENERIC_OPTIONAL_HIDE = new Set(['', 'TBD', 'N/A', 'TBA']); // case-insensitive

  export function shouldHideOpeningReel(value: string | null): boolean {
    if (value == null) return true;
    // Strip URLs FIRST, then evaluate emptiness — pure-URL cells (empty residue) hide.
    const stripped = stripOpeningReelText(value);
    return OPENING_REEL_HIDE.has(stripped.toUpperCase);
  }
  export function shouldHideGenericOptional(value: string | null): boolean {
    if (value == null) return true;
    return GENERIC_OPTIONAL_HIDE.has(value.trim.toUpperCase);
  }
  ```
  Tiles import `stripOpeningReelText` AND `shouldHideOpeningReel`; NO ad-hoc inline render of the raw cell value. Required-field placeholders per §8.3 are rendered at the tile level when the structural field is missing (separate from these predicates).
- [ ] **Step 3: Commit** `feat(crew-page): empty-state discipline + §10 opening-reel URL-strip render contract (§8.3, §10)`.

### Task 4.16: Crew-page Realtime bridge — Server Component + thin client `<ShowRealtimeBridge>` calling `router.refresh` on a server-owned Broadcast topic

**Files:** Create: `components/realtime/ShowRealtimeBridge.tsx` (client component), `lib/realtime/subscribeToShow.ts` (Supabase Broadcast channel helper), `lib/realtime/showInvalidation.ts` (server-side publish helper called from Phase 2 sync writes + auth-mutation triggers), `app/api/realtime/subscriber-token/route.ts` (mints short-lived Realtime JWTs from the `__Host-fxav_session` cookie), `app/api/show/[slug]/version/route.ts` (returns the composite `viewer_version_token`), **`lib/auth/resolveShowViewer.ts`**. Modify: `app/show/[slug]/page.tsx` to mount `<ShowRealtimeBridge showId slug renderVersion>` (the page itself stays a Server Component); every Phase 2 commit site (Tasks 6.5 / 6.11 / etc.) calls `publishShowInvalidation(tx, showId)` inside the transaction. **DB migrations land in Plan Task 2.2 as a single linked unit**: `crew_member_auth.last_changed_at` + `crew_members.last_changed_at` columns, their UPDATE triggers, AND the `viewer_version_token(show_id uuid) returns text` SQL helper. Test: `tests/realtime/showRealtimeBridge.test.tsx` AND `tests/e2e/apply-driven-refresh.spec.ts`.

**Why this task exists AND why the transport is now Broadcast.** Earlier drafts of M4 referenced "Realtime channel `show:<id>` to fire" inside Task 4.12 step 4b AND inside Tasks 6.6 / 6.10 but no task created the client-side subscription. Batches 11–13 added a thin client bridge with three `postgres_changes` filtered streams (one for `shows`, one for `crew_member_auth`, one for `crew_members`). **That design is architecturally broken for this app's auth model.** Redeemed-link viewers carry only the `__Host-fxav_session` cookie and have NO Supabase Auth session that RLS could authorize, so `postgres_changes` subscriptions cannot be authenticated for them. Even for signed-in (Google) viewers, RLS denies subscriptions to the admin-only `crew_member_auth` table per spec §4.3. Read literally, the design would either (a) silently never deliver events to redeemed-link viewers (the dominant viewer class), or (b) throw at subscribe time. Either way, an Apply that flips `crew_members.role_flags` would not propagate to a redeemed-link viewer's page; an admin "Issue new link" click would not invalidate the affected viewer's session.

**Corrected transport: single server-owned Realtime Broadcast topic, viewer-opaque payload.** Broadcast topics are gated by a custom-issued JWT verified at WebSocket-handshake time, so the bridge's auth path is the existing `__Host-fxav_session` cookie funneled through a server route that mints a short-lived Realtime JWT. No table-level RLS is involved at subscribe time. The publishers are (1) every Phase 2 commit site calling `publishShowInvalidation(tx, showId)` inside the transaction, AND (2) DB UPDATE triggers on `crew_member_auth` and `crew_members` that emit the same publish on every column change. The Broadcast payload is intentionally minimal — `{ type: 'invalidate', show_id, version_token }` — and the bridge's only response is `router.refresh`. The viewer learns nothing from a Broadcast they didn't already have permission to learn from a re-render. The earlier wording referencing TanStack/React Query is also retired in this batch — there is no client-side data cache, no `queryClient`; the data path is the same Server Component path used at first render.

**Architecture: Server-rendered + thin client bridge calling `router.refresh`.**

- (a) `app/show/[slug]/page.tsx` stays a Server Component. It continues to call `getShowForViewer` directly server-side; no client-side data fetch is introduced.
- (b) `<ShowRealtimeBridge showId={...} />` is a thin client component (`'use client'`) that mounts inside the page (or its layout) and is the ONLY new client surface this task adds. On mount it opens a Supabase Realtime subscription via `subscribeToShow(showId, onChange)`; on the `onChange` callback it calls `router.refresh` from `next/navigation`'s `useRouter`, which forces Next.js to re-execute the Server Component and re-fetch `getShowForViewer` server-side. The bridge renders nothing — it returns `null`.
- (c) NO TanStack Query, NO client-side data cache, NO client-side `getShowForViewer` call, NO `queryClient.invalidateQueries`. The data path is the same Server Component data path used at first render; the bridge merely re-triggers it.
- (d) On unmount, the bridge unsubscribes (returns `unsubscribe` from `useEffect`).
- (e) Error boundary: if the subscription fails to open (network, auth, channel error), the bridge logs `console.warn('[ShowRealtimeBridge] subscription failed', err)` and falls back to no-op. The page stays statically rendered against the last server fetch; the user can manually refresh or navigate. No retry storm — a single failed `subscribe` does NOT loop. (A v2 enhancement may add bounded backoff retry; v1 fails open.)
- (f) The bridge mounts for every viewer (signed-in OR signed-link cookie OR admin). Auth happens at server fetch time (`getShowForViewer` per §7.2), not at subscription time — so a revoked-mid-session user still triggers a `router.refresh` whose subsequent server render hits the 410 path and navigates to the bootstrap page.

**Single Broadcast topic, server-issued JWT.** The bridge subscribes to ONE topic: `show:<showId>:invalidation`. The bridge MUST NOT call `channel.on('postgres_changes', ...)` — Step 1's failing tests assert this registration count is zero (architectural-correction fence). Topic ACL: `topic ~ '^show:([0-9a-f-]{36}):invalidation$' AND ((regexp_match(topic, '^show:([0-9a-f-]{36}):invalidation$'))[1])::uuid = (auth.jwt ->> 'show_id')::uuid`. Admin sessions admit any `show:*:invalidation` topic. The topic name is intentionally non-secret; only a server-issued JWT subscribes. A `postgres_changes` filtered-streams design (one per table) is rejected: redeemed-link viewers carry no Supabase Auth session that RLS could authorize, and `crew_member_auth` is admin-only per §4.3 so RLS would deny a direct subscription anyway. Broadcast over a single, server-issued JWT is the transport.

**`POST /api/realtime/subscriber-token` route.** Verifies the request's `__Host-fxav_session` cookie via the existing `validateLinkSession` (signed-link viewers) or `validateGoogleSession` (signed-in viewers) helpers per §7.2. Derives `(showId, crewMemberId)` and signs a Realtime JWT with claims `{ show_id: <uuid>, sub: <crewMemberId>, exp: now+5min, iss: <SUPABASE_REALTIME_ISS>, role: 'authenticated' }` using `SUPABASE_JWT_SECRET`. Returns `{ jwt, exp }`. Failures (invalid/expired cookie, no crew row match) → 401 with code `SHOW_REALTIME_BROADCAST_AUTH_FAILED`. **Service-role secret never reaches the client.**

**Publish-side: `publishShowInvalidation(tx, showId)`.** Single helper in `lib/realtime/showInvalidation.ts` that runs INSIDE the supplied transaction and emits exactly one `pg_notify('realtime:broadcast', json_build_object('topic', 'show:' || $1 || ':invalidation', 'event', 'invalidate', 'payload', json_build_object('show_id', $1, 'version_token', viewer_version_token($1)))::text)`. Call sites: (1) every Phase 2 commit (Task 6.5 `applyParseResult`, Task 6.11 `applyStagedParse`, plus any other §5.2 / §5.5.1 / §6.8.3 commit) calls the helper AFTER the `UPDATE shows` and BEFORE the transaction commits. (2) DB UPDATE triggers on `crew_member_auth` and `crew_members` fire on UPDATE of any column (`WHEN (OLD.* IS DISTINCT FROM NEW.*)`); the trigger function resolves `show_id` from the row and calls `pg_notify(...)` with the same payload. **Trigger DDL lives in Plan Task 2.2 alongside the new `last_changed_at` columns and the `viewer_version_token` helper.** The publish helper is the SOLE producer of these notifies; the `realtime` schema has no other writers in app code. **Note**: the "Realtime channel `show:<id>` publish" wording (which framed the `UPDATE shows` row mutation as the publish event) is rejected — that framing belongs to the `postgres_changes` design which is not the transport.

**Composite `viewer_version_token`.** Earlier catch-up derived the token from `shows.last_synced_at` only — auth-only mutations (Issue New Link, role_flags edits without a paired `UPDATE shows`) never bump that column, so a (T0, T1) race against an Issue-New-Link click between SSR and subscribe-completion would catch-up false-positive-clean. The corrected token is composite: `viewer_version_token := GREATEST(shows.last_synced_at, MAX(crew_member_auth.last_changed_at) FOR show_id, MAX(crew_members.last_changed_at) FOR show_id)` for the show, encoded as a stringified ISO-8601 timestamp (or epoch ms) — comparable for equality and ordering. Plan Task 2.2 propagates: `crew_member_auth.last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now` (UPDATE trigger bumps to `now` on any-other-column change); `crew_members.last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now` (same trigger pattern); `viewer_version_token(show_id uuid) returns text` SECURITY-DEFINER SQL helper. The `/api/show/[slug]/version` route returns `{ version_token: <composite> }` from a single `SELECT viewer_version_token($1)` call — no auth-gated payload, single-string response. The Server Component captures the composite at SSR time and renders `<div data-render-version="<token>">`.

**Render-vs-subscribe race + reconnect catch-up.** After `subscribe` resolves AND on `system.reconnected` events, the bridge fetches `/api/show/[slug]/version`, compares to the LATEST `renderVersion` for the page, and on mismatch calls `router.refresh` once. This closes the (T0, T1) hole AND covers reconnect catch-up AND covers auth-only mutations whose Broadcast may have fired before subscribe-completion. **The catch-up MUST read the latest `renderVersion` via a `useRef` updated on every render — closure-captured stale prop values are forbidden.** The bridge holds `renderVersionRef = useRef<string>(renderVersion)` AND a render-time effect (`useEffect(() => { renderVersionRef.current = renderVersion; })`) that keeps the ref synchronized with the freshest `renderVersion` prop. The reconnect / subscribe-success / renewal-success catch-up handlers all read `renderVersionRef.current` at call time — never the closure-captured `renderVersion` from the original `useEffect([showId])` mount. Without the ref, every catch-up handler closes over the T0 `renderVersion` from the bridge's first mount; after a `router.refresh()` advances the SSR-rendered token to T1, a subsequent disconnect+reconnect would compare `serverVersion === T1` against the stale closed-over `T0` and force an unnecessary `router.refresh()` even though the page is already current. With the ref, the handler reads the live T1 value from `renderVersionRef.current` and correctly sees server-token equality.

**No polling fallback in tests.** The transport live-sync test (Task 4.12 step 4b end-to-end live-sync test) is amended to require a real Supabase Realtime Broadcast mock, NOT a polling fallback. Earlier draft of that test said "or polls `getShowForViewer` if Realtime is mocked" — replace with: "the Broadcast mock fires after the synthetic Phase 2 commit; the test asserts the page re-renders via `router.refresh` WITHIN 2s WITHOUT `page.reload`; if the mock does not fire, the test fails." Polling is NOT an acceptable backup — it would let the suite pass with no subscription wired.

**JWT renewal on disconnect / auth-failure.** The `POST /api/realtime/subscriber-token` mint signs a JWT with `exp = now+5min` — every page session that stays open longer than 5 minutes WILL eventually see the WebSocket carrying an expired token. Without an explicit renewal flow, any routine WiFi blip past the 5-minute mark drops the subscription silently and the bridge stops delivering invalidations until the user navigates. The bridge MUST listen for both Supabase `system` `disconnected` events AND any channel-level auth-failure error event (`channel.subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') .. })`) and on either signal run the renewal sequence: (a) re-`POST /api/realtime/subscriber-token` (returns a fresh JWT — the route enforces idempotency, multiple renewals within the same client session are fine); (b) call `client.realtime.setAuth(newJwt)`; (c) `removeChannel(oldChannel)` and re-create the channel via `subscribeToShow(showId, newJwt, onInvalidate)` with the same topic name `show:<showId>:invalidation`; (d) AFTER the new `subscribe` resolves successfully, run the `/api/show/[slug]/version` catch-up (same flow used post-initial-subscribe) so any invalidations missed during the disconnect window are reconciled; (e) on renewal success, the bridge clears any "stale connection" UI state it surfaced during the disconnect window — the entire flow is transparent to the user (no pop-up, no manual action). On renewal FAILURE (mint returns 401 because the cookie itself expired, OR re-subscribe returns CHANNEL_ERROR three times in a row): log `SHOW_REALTIME_JWT_RENEWED` with `outcome: 'failed'` and fall back to no-op (the next `router.refresh` or navigation hits `getShowForViewer` server-side and self-heals via the 410 → bootstrap path). Successful renewals log `SHOW_REALTIME_JWT_RENEWED` with `outcome: 'success'` so admins can trace renewal cadence; this is admin-log-only with no Doug-facing surface (added to §12.4).

**Renewal single-flight gating (mandatory).** The naive renewal flow re-triggers itself on the channel it intentionally tears down: `removeChannel(oldChannel)` synchronously fires a `'CLOSED'` status callback on the retired channel, which without gating re-enters renewal while the prior renewal is still mid-flight, producing overlapping JWT mints, overlapping `setAuth` calls, and a thrashing channel-create/destroy cycle. The bridge MUST therefore implement renewal as a single-flight state machine using TWO refs:
- `currentChannelGenerationRef = useRef<number>(0)` — monotonically increments on every new `subscribe()` call. Each channel's subscribe-status / system-event callback closure captures the generation number at creation time; the FIRST line of every status / system / disconnect callback is `if (closureGeneration !== currentChannelGenerationRef.current) return;` — straggler events on retired channels are silently dropped.
- `isRenewingRef = useRef<boolean>(false)` — set to `true` at the START of the renewal sequence (BEFORE any other renewal step) AND reset to `false` ONLY after the new channel reaches `SUBSCRIBED` (renewal-success) OR `SHOW_REALTIME_JWT_RENEWED outcome:'failed'` is logged (renewal-failure). When `true`, every additional disconnect / `'CHANNEL_ERROR'` / `'TIMED_OUT'` / `'CLOSED'` event is dropped at callback entry — the in-flight renewal owns the renewal lock.

**Mandatory ordering inside the renewal sequence:**
1. Guard: if `isRenewingRef.current === true` → return (single-flight).
2. Set `isRenewingRef.current = true`.
3. Increment `currentChannelGenerationRef.current` (NEW generation).
4. Call `removeChannel(oldChannel)`. The synchronous `'CLOSED'` callback that fires now carries the OLD generation; its callback-entry generation check returns immediately.
5. `POST /api/realtime/subscriber-token` → `client.realtime.setAuth(newJwt)`.
6. Open the new channel via `subscribeToShow(showId, newJwt, onInvalidate)`; subscribe-status callbacks on this channel capture the NEW generation.
7. After `subscribe()` resolves to `SUBSCRIBED`, run the `/api/show/[slug]/version` catch-up (also gated by the captured generation — a subsequent renewal that supersedes step 7 cancels its `router.refresh()` decision).
8. Set `isRenewingRef.current = false`.

If step 5 fails (mint 401), set `isRenewingRef.current = false` AND log `SHOW_REALTIME_JWT_RENEWED outcome:'failed'` AND return without recreating the channel. Without this gating, a rapid disconnect → reconnect → disconnect cycle (commonly observed on flaky WiFi) produces 3+ overlapping renewal flows, multiple in-flight subscriber-token mints, and channel-thrash. With it, EXACTLY ONE renewal is ever in flight regardless of how many disconnect/CLOSED events arrive during the renewal window.

**Unmount-safe cleanup ordering (mandatory).** The single-flight gating above prevents in-flight renewals from re-entering during steady-state disconnect events, but it does NOT cover the unmount path — and the unmount path produces its own re-entry via the same synchronous `removeChannel`-fires-`CLOSED`-callback mechanism. When React invokes the `useEffect([showId])` cleanup function (StrictMode dev-cycle dismount, ordinary client navigation away from the page, parent unmount during a route transition, parent unmount during HMR), the cleanup calls `removeChannel(currentChannel)`. Per Supabase JS client documented behavior, `removeChannel` synchronously fires a `'CLOSED'` status callback on the retired channel BEFORE returning. Without explicit unmount gating, that synchronous `'CLOSED'` callback enters the renewal path (single-flight `isRenewingRef.current === false` at unmount time, generation matches because the cleanup hasn't bumped it yet, callback proceeds through the renewal guard), kicking off a `POST /api/realtime/subscriber-token` for a component that has just been told to die. The renewal's mint-then-subscribe sequence then runs against an unmounted React tree — leaking a channel, leaking the JWT, and (worst case) calling `setState` on the unmounted component if any later step tries to surface a UI flag. The bridge MUST therefore add a THIRD ref `isMountedRef = useRef<boolean>(true)` AND mandate this exact cleanup ordering inside the `useEffect([showId])` cleanup function:

1. **Set `isMountedRef.current = false`** (first — every callback's first guard checks this).
2. **Increment `currentChannelGenerationRef.current`** (every captured-generation callback that fires synchronously from step 3 sees a stale generation and returns).
3. **Cancel any pending debounce timer** (`clearTimeout(pendingRefreshTimer.current)`) — also forbidden to trigger `router.refresh()` on an unmounted tree.
4. **Then** call `removeChannel(currentChannel)`. The synchronous `'CLOSED'` callback fires now: its callback-entry guard sees `isMountedRef.current === false` (or its captured generation is stale) and returns IMMEDIATELY without entering renewal.

Every status / system / disconnect / renewal-step callback's FIRST guard is `if (!isMountedRef.current || closureGeneration !== currentChannelGenerationRef.current) return;` — the boolean covers the "component is dying" case; the generation covers the "different channel" case; together they cover every re-entry vector. The mint-then-subscribe sequence inside the renewal flow ALSO checks `isMountedRef.current` after each `await` boundary (after the `fetch` for `/api/realtime/subscriber-token` resolves; after `setAuth` returns; after the new `subscribe` resolves) — if the component unmounted while the renewal `await`ed, the renewal aborts BEFORE creating the new channel, BEFORE running version catch-up, and BEFORE clearing any UI state.

**Required regression tests** (new entries in Step 1):
- **StrictMode dev-cycle unmount**: render `<ShowRealtimeBridge>` under React StrictMode (the dev-mode double-mount/unmount cycle fires the cleanup synchronously between mounts). Assert (a) `removeChannel` was called once during the StrictMode unmount; (b) the synchronous `'CLOSED'` callback that fires from `removeChannel` did NOT trigger a renewal — `fetch('/api/realtime/subscriber-token')` was called EXACTLY ONCE total across both lifecycle halves (the second mount's mint), NOT TWICE (which would prove the unmount's `'CLOSED'` re-entered renewal); (c) `mockSupabase.channel(...)` was called exactly once for the second mount, never for an unmount-spawned renewal.
- **Ordinary client navigation unmount**: render `<ShowRealtimeBridge>` inside a Next.js test harness; navigate away to a different route. Assert (a) cleanup fires; (b) NO `/api/realtime/subscriber-token` request is sent AFTER the cleanup (instrumented `fetch` mock counts requests, asserts the count after navigation equals the count before); (c) NO `mockSupabase.channel(...)` call after cleanup; (d) NO `router.refresh()` call after cleanup (proves the debounce timer was cancelled in step 3).
- **Unmount during in-flight renewal**: render the bridge, mint+subscribe successfully, emit `'CHANNEL_ERROR'` to start a renewal, mock the subscriber-token route to delay 200ms, and unmount the component DURING the renewal's mint await. Assert (a) `isMountedRef.current === false` is observed at the post-mint-await check; (b) the renewal aborts WITHOUT calling `subscribeToShow` for the new channel; (c) NO leaked channel; (d) NO `router.refresh()` call; (e) `outcome: 'failed'` is NOT logged (this is a clean unmount, not a renewal failure — the abort path is silent).

**Shared `resolveShowViewer` auth helper.** `/api/realtime/subscriber-token` and `/api/show/[slug]/version` MUST gate on a single helper `lib/auth/resolveShowViewer.ts` mirroring the `/show/<slug>` Server Component's complete auth chain. Ad-hoc per-route `validateLinkSession` / `validateGoogleSession` calls are forbidden because (a) admins authenticated only via `auth.email` allowlist (NOT `app_metadata.role='admin'`) carry no `__Host-fxav_session` cookie, so a crew-only validator chain 401s them; (b) cross-show probes (signed in for show A, requesting `/api/show/B/version`) must distinguish "wrong show" (403) from "no credentials" (401). **The discriminated-union return shape is FIVE-armed**: `resolveShowViewer(req, slug): Promise<{ kind: 'admin' | 'crew_link' | 'crew_google' | 'denied' | 'forbidden', email?: string, show_id?: string, crew_member_id?: string, reason?: string }>`. The helper runs the SAME chain `/show/<slug>` runs, in the same order: (1) resolve `slug → show_id` via `SELECT id FROM shows WHERE slug = $1` using service role; if no row, return `{ kind: 'denied', reason: 'unknown_slug' }` (denied — no credentials apply because no show exists); (2) `isAdminSession(req)` (per `lib/auth/isAdminSession.ts` — `app_metadata.role='admin'` OR canonicalized email is in the allowlist) → on `true` return `{ kind: 'admin', email, show_id }` (admins span all shows; no cross-show check applies); (3) `validateLinkSession(req)` → on `success`: if the validator's resolved `show_id` matches the slug's resolved show, return `{ kind: 'crew_link', show_id, crew_member_id }`; if it succeeds for a DIFFERENT show, return `{ kind: 'forbidden', reason: 'cross_show_link_session', show_id: <validator's-show> }` (validator chain succeeded but for the wrong show — credentials present, just wrong target); on validator non-success fall through to step 4; (4) `validateGoogleSession(req, slug)` → on `success` with show_id matching, return `{ kind: 'crew_google', email, show_id, crew_member_id }`; on `success` for a different show, return `{ kind: 'forbidden', reason: 'cross_show_google_session', email, show_id: <validator's-show> }`; on validator non-success fall through to step 5; (5) all-failed → `{ kind: 'denied', reason: 'no_credentials' }`. The helper does NOT throw; returns the sentinel; caller decides status code. **Caller-side outcome routing**: BOTH routes (`/api/realtime/subscriber-token` AND `/api/show/[slug]/version`) call the helper as their FIRST action and route per:
- `denied` → **401** (no credentials present — `WWW-Authenticate` semantics; subscriber-token uses `SHOW_REALTIME_BROADCAST_AUTH_FAILED`).
- `forbidden` → **403** (credentials valid, but for a different show — cross-show cookie reuse, cross-show subscriber-token request).
- `admin` | `crew_link` | `crew_google` → **200** (subscriber-token mints JWT carrying `viewer_kind` + `show_id` claims; version route runs `SELECT viewer_version_token($1)` and returns the composite token).

The 401-vs-403 distinction is load-bearing for downstream UX (a 401 surface re-prompts for sign-in; a 403 surface tells the viewer they're authenticated but not authorized for THIS show — different operator response, different log signal). Cross-show probes that produce `forbidden` are logged at admin-info level for security telemetry; an `denied` is logged at admin-debug only (a routine no-cookie request). The helper is the SOLE consumer of the chain in this contract — duplicate ad-hoc validator-call sites in either route are deleted.

**Per-Apply invalidation dedup via client-side debounce.** A single Apply that touches `shows` AND multiple `crew_member_auth` rows AND multiple `crew_members` rows fires the publish path 3+ times in the same transaction (1× from `publishShowInvalidation` for the `UPDATE shows`, 1× per `crew_members` row from the BEFORE-UPDATE trigger, 1× per `crew_member_auth` row from the BEFORE-UPDATE trigger). Each fires a Broadcast, each Broadcast triggers `router.refresh`, and the user sees a multi-flash refresh storm during a single Apply that touched 5 crew rows + 2 auth rows + the shows row (8 router.refresh calls in <1s). **Recommended fix: client-side 100ms debounce in `<ShowRealtimeBridge>`** — coalesces multiple `router.refresh` calls within a 100ms window into one, regardless of how many trigger / helper publishes the Apply emitted. (Server-side AFTER-STATEMENT triggers + transaction-local touched-show set were considered but rejected as overcomplicated for v1: Postgres deferred-trigger lifecycle adds a session-local `pg_temp.touched_shows_<txid>` table, commit-time `pg_notify`, and an extra failure mode if commit aborts mid-flight; the client-side debounce achieves the same UX with one `setTimeout` + one cancel.) The debounce window is 100ms (long enough to coalesce a single Apply transaction's worth of triggers, short enough that crew never perceive lag between commit and visible refresh). Implementation: the bridge's `onInvalidate` callback schedules `router.refresh` via `setTimeout` after clearing any pending timer; on unmount or render-version-mismatch the pending timer is cancelled. The catch-up `router.refresh` (subscribe-success / system.reconnected paths) bypasses the debounce — it's already a single call by construction. Test: an Apply that emits 8 invalidations within 50ms triggers exactly ONE `router.refresh`. The 100ms window is documented in the spec §8 paragraph and in this task's Step 1 failing-test list.

- [ ] **Step 1: Failing tests** (: rewritten end-to-end for the Broadcast architecture; : adds renewal + shared-helper + debounce coverage)
  - **Bridge mints subscriber JWT then opens ONE Broadcast subscription**: render the page in a test harness using a mocked `fetch` for `POST /api/realtime/subscriber-token` (returns `{ jwt: 'fake.jwt.token', exp: <future> }`) and a real `@supabase/supabase-js` client mock. Assert (a) the bridge called `fetch('/api/realtime/subscriber-token', { method: 'POST', credentials: 'same-origin' })` exactly once, (b) `mockSupabase.realtime.setAuth('fake.jwt.token')` was called, (c) `mockSupabase.channel('show:<showId>:invalidation', { config: { broadcast: { self: false } } })` was called, (d) `channel.on('broadcast', { event: 'invalidate' }, ...)` was registered, (e) `channel.subscribe` was called exactly once. Unmount; assert `mockSupabase.removeChannel` was called. **The bridge MUST NOT call `channel.on('postgres_changes', ...)` at all** — assert that registration count is zero. This is the architectural-correction fence: any future regression that re-introduces `postgres_changes` fails this test.
  - **Broadcast event triggers `router.refresh` **: subscribe; emit a Broadcast event on `show:<showId>:invalidation` with payload `{ show_id: '<showId>', version_token: '2026-04-30T00:00:01Z' }`. Assert `router.refresh` was called exactly once within 100ms. Use a `useRouter` mock from `next/navigation` (`vi.mock('next/navigation', ...)`) with a `router.refresh` spy. The test does NOT assert any `postgres_changes` registration; the test does NOT assert any `queryClient.invalidateQueries` call.
  - **Cross-show Broadcast event is ignored **: emit a Broadcast event whose payload `show_id` does NOT match the bridge's `showId`. Assert `router.refresh` was NOT called. (Topic ACL prevents this in production; the test confirms client-side defense in depth.)
  - **Subscriber-token mint failure logs SHOW_REALTIME_BROADCAST_AUTH_FAILED and falls back to no-op **: mock `fetch('/api/realtime/subscriber-token')` to return 401. Render the bridge. Assert (a) `console.warn` was called once with the `SHOW_REALTIME_BROADCAST_AUTH_FAILED` code prefix, (b) `mockSupabase.channel(...)` was NEVER called, (c) `router.refresh` was NOT called, (d) NO retry loop.
  - **Subscribe failure logs SHOW_REALTIME_SUBSCRIPTION_FAILED and falls back to no-op **: mint succeeds; instrument `channel.subscribe` to invoke its callback with status `'CHANNEL_ERROR'`. Assert (a) `console.warn` was called once with the `SHOW_REALTIME_SUBSCRIPTION_FAILED` code prefix, (b) `router.refresh` was NOT called, (c) the bridge does NOT throw to the React tree, (d) NO retry loop.
  - **Auth-only mutation trigger publishes Broadcast**: open a real Postgres connection in test; UPDATE `crew_member_auth.current_token_version` for an existing row. Assert that `pg_notify` was called on channel `realtime:broadcast` with a payload whose `topic` matches `show:<showId>:invalidation` and whose `payload.show_id` matches the row's `show_id`. Repeat for `crew_members.role_flags` UPDATE. Repeat for any other column UPDATE on either table — every UPDATE that changes any column MUST publish (catches the regression where the trigger only fires on a specific column subset).
  - **Composite version_token advances on auth-only mutation**: seed a show; capture `viewer_version_token(showId)` as `T0`; UPDATE `crew_member_auth.current_token_version` (no `shows` UPDATE); capture `viewer_version_token(showId)` as `T1`. Assert `T1 > T0`. Repeat for `crew_members.role_flags` UPDATE. Repeat for `shows.last_synced_at` UPDATE. ALL THREE sources must independently advance the composite token.
  - **Render-vs-subscribe race catch-up uses composite token **: render with `data-render-version="2026-04-30T00:00:00Z"` on the page root. Mock `/api/show/[slug]/version` to return `{ version_token: '2026-04-30T00:00:05Z' }` (an auth-only mutation landed between SSR and subscribe). Resolve `subscribe`. Assert (a) the bridge fetched `/api/show/[slug]/version` exactly once after subscribe-success, (b) `router.refresh` was called exactly once due to token mismatch. Inverse: when the API returns the SAME token, `router.refresh` is NOT called from the catch-up path.
  - **Reconnect catch-up reads the LATEST renderVersion via ref, NOT a stale closure value**: render bridge with `renderVersion="T0"`. Mint+subscribe successfully. Simulate a Broadcast invalidate that triggers `router.refresh()`; the Server Component re-renders with `renderVersion="T1"` (the new SSR'd token). Now simulate a WebSocket disconnect+reconnect cycle: emit `'disconnected'` → renewal completes → `system.reconnected` fires the catch-up. Mock `/api/show/[slug]/version` to return `{ version_token: 'T1' }` (server is also at T1, so no further refresh is needed). Assert: `router.refresh()` was NOT called from the reconnect catch-up path (catch-up read `renderVersionRef.current === 'T1'` and saw equality with the server's `'T1'`). Without the ref-based latest-renderVersion read, the catch-up handler closed over the original mount's `'T0'` value, would compare `'T0' !== 'T1'` server-side, and would force an unnecessary `router.refresh()` even though the page is already current. Negative companion: when server is at `'T2'` (a real new mutation) the catch-up correctly fires `router.refresh()` exactly once.
  - **Reconnection catch-up **: subscribe successfully; emit a `system` `reconnected` event through the channel mock; assert the bridge re-fetches `/api/show/[slug]/version` and refreshes only on token mismatch.
  - **Apply-driven role_flags restriction (end-to-end Playwright)**: seed a show with crew member Alice carrying `role_flags = ['A1']`. Render the crew page as Alice — AudioScopeTile is visible, LightingScopeTile is not. From a separate test "operator" client, perform an Apply that mutates the same `crew_members` row to `role_flags = ['A2']` (using the `applyStaged` seed harness). Within 2s the test asserts (a) AudioScopeTile is STILL visible (A2 also unlocks it), (b) `page.reload` was NOT called, (c) the bridge received a Broadcast event (instrumented). Repeat with `['A1']` → `['L1']`.
  - **Auth-only revocation end-to-end **: seed Alice with a redeemed signed-link session. Render the crew page as Alice — restricted tiles visible per role. From a separate admin client, click "Issue new link" for Alice (mutates `crew_member_auth` ONLY — `shows` row stays untouched). Within 2s, Alice's open page MUST `router.refresh` (driven by the `crew_member_auth` UPDATE trigger's Broadcast publish), and the new server render MUST hit the 410 path (her old token version no longer matches `current_token_version`) — page navigates to bootstrap. Without the auth-mutation trigger this test fails.
  - **Apply-driven viewer-name removal**: seed Alice in the show. Apply removes Alice from `crew_members`. Within 2s, the bridge receives the Broadcast (Phase 2 commit's `publishShowInvalidation`), `router.refresh` triggers a fresh Server Component render; `getShowForViewer` returns the 410 path AND the page navigates to "you've been removed from this show" instead of rendering stale tiles.
  - **JWT renewal on disconnect**: render the bridge, mint+subscribe successfully. Open the page for >5min (advance fake timers 6min). Emit a `system` `disconnected` event through the channel mock. Assert (a) bridge calls `fetch('/api/realtime/subscriber-token', ...)` a SECOND time exactly once, (b) `mockSupabase.realtime.setAuth(<newJwt>)` called, (c) `mockSupabase.removeChannel(oldChannel)` called, (d) `mockSupabase.channel('show:<showId>:invalidation', ...)` called a second time, (e) second `channel.subscribe` resolves, (f) `/api/show/[slug]/version` catch-up fetch fires AFTER second subscribe resolves, (g) `console.warn` once with `SHOW_REALTIME_JWT_RENEWED` AND `outcome: 'success'`. Repeat with `'CHANNEL_ERROR'`. Test does NOT call `page.reload`.
  - **JWT renewal failure**: same setup, but mock the second `fetch('/api/realtime/subscriber-token')` to return 401. Assert (a) `console.warn` once with `SHOW_REALTIME_JWT_RENEWED` AND `outcome: 'failed'`, (b) `mockSupabase.channel(...)` NOT called a second time, (c) `router.refresh` NOT called, (d) NO retry storm.
  - **Renewal single-flight gating — rapid disconnect/reconnect/disconnect cycle yields exactly ONE renewal in flight**: render the bridge, mint+subscribe successfully. Then within a 200ms window emit (a) `'CHANNEL_ERROR'` status callback, (b) immediately after, a second `'CHANNEL_ERROR'`, (c) immediately after, a `'CLOSED'` event, AND while the first renewal is still mid-flight a `system` `'disconnected'` event. Mock the subscriber-token route to delay 100ms before returning a fresh JWT. Mock `mockSupabase.removeChannel` to synchronously fire a `'CLOSED'` callback on the retired channel (production parity — the Supabase JS client's `removeChannel` is documented to do this). Assert (a) `fetch('/api/realtime/subscriber-token')` called EXACTLY ONCE during the window (NOT twice, NOT four times), (b) `mockSupabase.realtime.setAuth(...)` called EXACTLY ONCE, (c) `mockSupabase.channel('show:<showId>:invalidation', ...)` called EXACTLY ONCE for the new channel during the window (the synchronous `'CLOSED'` from `removeChannel(oldChannel)` does NOT re-trigger renewal because its closure-captured generation is the OLD generation and fails the gating check), (d) the bridge's internal `currentChannelGenerationRef.current` advanced by exactly 1 (NOT 2, NOT 4), (e) after the new channel reaches `SUBSCRIBED`, `isRenewingRef.current` returns to `false`, (f) `console.warn` once with `SHOW_REALTIME_JWT_RENEWED outcome: 'success'`. Without the gating, the test sees 2-4 renewal flows interleaving and fails on the EXACTLY-ONCE assertions.
  - **Renewal failure releases the lock for the next disconnect attempt**: render bridge; emit `'CHANNEL_ERROR'`; mock the FIRST subscriber-token fetch to return 401. Assert `isRenewingRef.current` returns to `false` after `outcome: 'failed'` is logged. Then emit a second `'CHANNEL_ERROR'`; assert a SECOND renewal sequence starts (a SECOND `fetch('/api/realtime/subscriber-token')` call) — proving the failed renewal correctly cleared the lock. Without the lock release on the failure path, a single mint failure would permanently disable renewal for the page session.
  - **Open page for 6min then WiFi disconnect → renewal succeeds, version catch-up fires, stale-state UI cleared**: page open >5min, then WS disconnect, then reconnect. Use Playwright + fake-timer harness OR real-clock 6-min wait. Assert: (a) renewal fires; (b) new channel subscribes; (c) version catch-up runs; (d) "stale connection" UI affordance is cleared on success; (e) test does NOT poll; (f) test does NOT call `page.reload`. Without renewal flow this test fails — original mint's `exp = now+5min` has elapsed.
  - **Allowlist-only admin can subscribe**: mock the request as a Google session with `app_metadata.role` absent / non-admin AND canonicalized email IS in allowlist. Send `POST /api/realtime/subscriber-token` for show A. Assert (a) `resolveShowViewer(req, slug)` was called, (b) helper returned `{ kind: 'admin', email: <allowlisted>, show_id: <show-A-id> }`, (c) response is 200 with JWT carrying `{ viewer_kind: 'admin', show_id: <show-A-id> }` claims, (d) response is NOT 401. Repeat for `/api/show/[slug]/version` for show A.
  - **Cross-show probe — signed-link cookie for show A → request show B → `forbidden` → 403 (NOT 401)**: requestor has fully valid signed-link cookie for show A. Send request for show B. Assert (a) `resolveShowViewer(req, 'show-B-slug')` ran; (b) helper resolved to `{ kind: 'forbidden', reason: 'cross_show_link_session', show_id: <show-A-id> }` (validator chain succeeded for show A; show A ≠ show B); (c) route returns **403** (NOT 200, NOT 401); (d) response distinguishes the 403 from the 401 path via response-body code (subscriber-token: a `forbidden` 403 surface code distinct from `denied`'s `SHOW_REALTIME_BROADCAST_AUTH_FAILED`); (e) admin-info log entry emitted carrying the cross-show probe signal. Repeat for version route. Negative companion: a request for show A from same requestor returns 200. **Repeat for cross-show Google session** (`forbidden` with `reason: 'cross_show_google_session'`).
  - **Unauthenticated request — no cookie, no session → `denied` → 401 (NOT 403)**: no `__Host-fxav_session` cookie AND no Supabase Auth session. Assert (a) helper returned `{ kind: 'denied', reason: 'no_credentials' }`; (b) both routes return **401** (NOT 403). The 401-vs-403 boundary regression: a test that synthesizes a cross-show cookie scenario MUST get 403; a test that synthesizes a no-cookie scenario MUST get 401. Asserting "either 401 or 403" is forbidden — the discrimination is load-bearing.
  - **Signed-link viewer for show A → 200**: `resolveShowViewer` returns `{ kind: 'crew_link', show_id: <show-A-id>, crew_member_id: <Alice's id> }`; JWT mint succeeds with `viewer_kind: 'crew_link'` claim; topic ACL admits `show:<show-A-id>:invalidation`. Same viewer attempting subscriber-token for show B — helper returns `{ kind: 'forbidden', reason: 'cross_show_link_session' }` and route 403's BEFORE topic-ACL evaluation (defense-in-depth: topic ACL is not the sole guard).
  - **Unknown slug → `denied` → 401**: request a slug that does NOT resolve to any `shows` row. Assert helper returns `{ kind: 'denied', reason: 'unknown_slug' }` and both routes return 401 (NOT 404 — the denied/forbidden discriminator is the route-level contract; slug-unknown is treated as "credentials cannot apply because no target exists" and folded into denied). Negative regression: an authenticated admin requesting an unknown slug ALSO receives 401 (admin precedence does not synthesize a show row).
  - **Single Apply emits 8 invalidations → exactly one router.refresh**: synthesize an Apply touching `shows` + 5 `crew_members` rows + 2 `crew_member_auth` rows in same transaction (publish path fires 1+5+2 = 8 times). Subscribe; emit 8 Broadcast events with matching `show_id`, all within a 50ms window. Assert: `router.refresh` is called EXACTLY ONCE within 200ms of the last Broadcast (debounce window 100ms; +100ms jitter tolerance). Without the 100ms debounce, test sees 8 calls and fails. **Negative regression**: re-run with 1-second gap between events; assert `router.refresh` is called 8 times.
  - **Catch-up router.refresh bypasses the debounce**: simulate subscribe-success → version mismatch (`T0` vs `T1`). Assert `router.refresh` is called immediately (NOT delayed by 100ms timer). Same for `system.reconnected` catch-up.
  - **Unmount during pending debounce cancels the timer**: schedule a Broadcast; before the 100ms window elapses, unmount. Assert `router.refresh` is NOT called.
- [ ] **Step 1.5: Implement `lib/auth/resolveShowViewer.ts`** — shared auth-chain helper consumed by BOTH `/api/realtime/subscriber-token` AND `/api/show/[slug]/version`. Signature: `export async function resolveShowViewer(req: NextRequest, slug: string): Promise<{ kind: 'admin' | 'crew_link' | 'crew_google' | 'denied' | 'forbidden', email?: string, show_id?: string, crew_member_id?: string, reason?: string }>`. The discriminated union has FIVE arms; `denied` and `forbidden` are distinct so callers can map to 401 vs 403 deterministically. Implementation runs the EXACT chain `/show/<slug>` runs, in order: (1) resolve `slug → show_id` via `SELECT id FROM shows WHERE slug = $1` using service role; if no row, return `{ kind: 'denied', reason: 'unknown_slug' }`; (2) call `isAdminSession(req)` from `lib/auth/isAdminSession.ts` — `app_metadata.role='admin'` OR canonicalized email match against allowlist; on `true`, return `{ kind: 'admin', email, show_id }` (admins span all shows; no cross-show check applies); (3) call `validateLinkSession(req)` per §7.2 — on `success` with `show_id === <slug-resolved-show-id>`, return `{ kind: 'crew_link', show_id, crew_member_id }`; on `success` for a DIFFERENT show, return `{ kind: 'forbidden', reason: 'cross_show_link_session', show_id: <validator's-resolved-show> }` (the cookie validator chain succeeded — credentials are present and valid — but for a different show; this is the cross-show cookie reuse case that 403's distinctly from the no-credentials 401); on validator non-success fall through to step 4; (4) call `validateGoogleSession(req)` per §7.2 — on `success` with `show_id === <slug-resolved-show-id>`, return `{ kind: 'crew_google', email, show_id, crew_member_id }`; on `success` for a DIFFERENT show, return `{ kind: 'forbidden', reason: 'cross_show_google_session', email, show_id: <validator's-resolved-show> }`; on validator non-success fall through to step 5; (5) fall through to `{ kind: 'denied', reason: 'no_credentials' }`. Helper does NOT throw; returns the sentinel; the caller decides the HTTP status. **Wire the new helper into `/api/realtime/subscriber-token` and `/api/show/[slug]/version` as their FIRST action; delete any previously inlined `validateLinkSession` / `validateGoogleSession` calls.** Subscriber-token route: `denied` → **401** with `SHOW_REALTIME_BROADCAST_AUTH_FAILED`; `forbidden` → **403** with a distinct `SHOW_REALTIME_CROSS_SHOW_FORBIDDEN` code (admin-info log carries the helper's `reason`); `admin` | `crew_link` | `crew_google` → 200 mint JWT with `viewer_kind` claim. Version route: `denied` → **401**; `forbidden` → **403** with `SHOW_VERSION_CROSS_SHOW_FORBIDDEN`; `admin` | `crew_link` | `crew_google` → 200 with composite token. **The 401-vs-403 distinction is enforced by Step-1 regression tests**: a no-cookie test MUST observe 401; a cross-show test MUST observe 403; a route that conflates them fails the suite.
- [ ] **Step 2: Implement** `subscribeToShow(showId, jwt, onInvalidate)` in `lib/realtime/subscribeToShow.ts` — calls `supabase.realtime.setAuth(jwt)` then `supabase.channel('show:<showId>:invalidation', { config: { broadcast: { self: false } } }).on('broadcast', { event: 'invalidate' }, ({ payload }) => { if (payload.show_id === showId) onInvalidate(payload.version_token); }).subscribe(status => { .. })`. Implement the version-catchup helper `getServerVersion(slug)` calling `GET /api/show/[slug]/version`. Implement `<ShowRealtimeBridge showId slug renderVersion>` as a `'use client'` component that calls `useRouter` from `next/navigation`, opens the subscription in `useEffect( => { .. return cleanup; }, [showId])`, and on each invalidate-callback invocation calls `router.refresh` **wrapped in a 100ms debounce timer per — bridge holds a `pendingRefreshTimer` ref; each Broadcast `onInvalidate` clears any existing timer (`clearTimeout(pendingRefreshTimer.current)`) and schedules a new one via `setTimeout( => router.refresh, 100)`; the `useEffect` cleanup MUST also `clearTimeout(pendingRefreshTimer.current)`; the version-mismatch catch-up paths (subscribe-success + system.reconnected) call `router.refresh` SYNCHRONOUSLY (no debounce)**. **Unmount-safe cleanup ordering (mandatory per the unmount-safe paragraph above):** the bridge holds `isMountedRef = useRef<boolean>(true)`, `currentChannelGenerationRef = useRef<number>(0)`, AND `pendingRefreshTimer` ref. The `useEffect` cleanup function MUST execute in this exact order: (1) `isMountedRef.current = false`; (2) `currentChannelGenerationRef.current += 1` (advance generation BEFORE removeChannel so the synchronous `'CLOSED'` callback that fires inside step 4 captures a stale generation); (3) `clearTimeout(pendingRefreshTimer.current)`; (4) `removeChannel(currentChannel)`. Every status / system / disconnect / renewal-step callback's FIRST guard MUST be `if (!isMountedRef.current || closureGeneration !== currentChannelGenerationRef.current) return;`. The mint-then-subscribe sequence inside the renewal flow ALSO checks `isMountedRef.current` after each `await` (post-mint `fetch`, post-`setAuth`, post-`subscribe`) — if the component unmounted while the renewal `await`ed, the renewal aborts BEFORE creating a new channel and BEFORE calling `router.refresh()`. **Subscribe to `system` events on the channel for both `'reconnected'` AND `'disconnected'` per — on `'disconnected'` (or any subscribe-status callback returning `'CHANNEL_ERROR'` / `'TIMED_OUT'` / `'CLOSED'`) trigger the JWT-renewal sequence: (a) re-call `POST /api/realtime/subscriber-token`; (b) on success `client.realtime.setAuth(newJwt)`; (c) `removeChannel(oldChannel)` and re-create via `subscribeToShow(showId, newJwt, onInvalidate)`; (d) AFTER new `subscribe` resolves, run version catch-up; (e) log `SHOW_REALTIME_JWT_RENEWED` `outcome: 'success'` AND clear "stale connection" UI state. On renewal mint failure: log `outcome: 'failed'` and fall back to no-op. Renewal does NOT retry-loop.** After `subscribe` resolves AND on `system.reconnected` events, run the catch-up: fetch `/api/show/[slug]/version`, compare to `renderVersionRef.current` (NOT a closure-captured `renderVersion` from the original mount — the bridge maintains `renderVersionRef = useRef(renderVersion)` updated on every render via a render-time effect so reconnect handlers always read the LATEST SSR'd token, never the T0 value from initial mount). Refresh on token mismatch. Wrap mint-then-subscribe in try/catch — on mint failure log `SHOW_REALTIME_BROADCAST_AUTH_FAILED`; on subscribe failure log `SHOW_REALTIME_SUBSCRIPTION_FAILED`. Both fall back to no-op cleanup. The component returns `null`. Mount `<ShowRealtimeBridge showId={show.id} slug={params.slug} renderVersion={data.viewer_version_token} />` inside `app/show/[slug]/page.tsx`. Implement `app/api/realtime/subscriber-token/route.ts` (the JWT mint described above) **calling `resolveShowViewer(req, slug)` per Step 1.5 as its FIRST action; on `'denied'` → 401 with `SHOW_REALTIME_BROADCAST_AUTH_FAILED`; on cross-show probe → 403; otherwise mint JWT with `viewer_kind` claim**. Implement `app/api/show/[slug]/version/route.ts` returning `{ version_token: <composite> }` from a single `SELECT viewer_version_token($1)` call **— ALSO calling `resolveShowViewer(req, slug)` as its FIRST action; on `'denied'` → 401; on cross-show probe → 403; otherwise return 200**. Implement `lib/realtime/showInvalidation.ts` exporting `publishShowInvalidation(tx, showId)` that runs the `pg_notify(...)` described above inside the supplied transaction. Wire `publishShowInvalidation` into every Phase 2 commit site (Tasks 6.5 / 6.11 / etc.). Update `lib/data/getShowForViewer.ts` to project `viewer_version_token` (single helper call). Update `app/show/[slug]/page.tsx` to render `<div data-render-version={data.viewer_version_token}>` on the page root. **DDL for `crew_member_auth.last_changed_at` + `crew_members.last_changed_at` + the two UPDATE triggers + the `viewer_version_token(uuid)` helper lives in Plan Task 2.2; this Step 2 pulls it into the migration as a single linked unit.**
- [ ] **Step 3: Replace polling fallback in Task 4.12 step 4b end-to-end live-sync test** with the Broadcast path. Update the assertion to require a real Supabase Realtime Broadcast mock to fire AND assert `router.refresh` was called WITHOUT `page.reload`. If the suite was previously written to fall back to polling, that branch must be removed. Cross-reference: this task supersedes Task 4.12's "or polls `getShowForViewer` if Realtime is mocked" carve-out.
- [ ] **Step 4: Update §5.2 / §5.5.1 / §6.8.3 publisher wording AND AC-6.12** to match the Broadcast publish-helper contract: every Phase 2 commit calls `publishShowInvalidation(tx, showId)` inside the transaction. AC-6.12's assertion changes to "verify the Phase 2 transaction calls `publishShowInvalidation` AND a Broadcast event for topic `show:<showId>:invalidation` is delivered to a subscribing client whose JWT carries the matching `show_id` claim." All `postgres_changes` references in Tasks 6.6 / 6.10 / AC-6.12 are deleted.
- [ ] **Step 5: Commit** `feat(crew-page): Server Component + ShowRealtimeBridge over Broadcast topic + composite viewer_version_token + JWT renewal + shared resolveShowViewer helper + 100ms debounce`.

### Task 4.15: M4 demo verification

- [ ] Run all parser, db, and crew-page tests: `pnpm test && pnpm test:e2e --project=mobile-safari`.
- [ ] Manually open `/show/<seeded-slug>?crew=<seeded-A1-crewMemberId>` in the dev server, screenshot, attach to demo PR. (Identity-only mock — `?role=` is explicitly ignored.)
- [ ] Commit `chore: M4 demo verified`.

---

