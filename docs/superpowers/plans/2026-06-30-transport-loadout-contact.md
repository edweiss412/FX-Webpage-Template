# Transport "Load Out" secondary transporter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. TDD per task; commit per task; `--no-verify`.

**Goal:** Capture the `Load Out:` secondary-transporter contact (`transport.ts:264` skip → capture) and render it on the crew "Getting there" card + the Step-3 review modal.

**Architecture:** Parser adds 3 required-nullable fields to `TransportationRow`; a DB migration persists them (public + dev + manifest + validation); cron write/read-back + seed + projection thread them through; crew `TravelSection` + operator `Step3SheetCard` render them. Both render surfaces are UI → invariant-8 impeccable dual-gate.

**Tech Stack:** TypeScript, Vitest, Postgres/Supabase, Next 16, Tailwind v4. Spec: `docs/superpowers/specs/2026-06-30-transport-loadout-contact-design.md` (Codex-APPROVED round 2).

## Global Constraints

- Email at every boundary: `canonicalize()` (`lib/email/canonicalize.ts`) is the only function that touches raw `loadout_email`; schema CHECK is the safety net (invariant 3).
- New fields are **required-nullable** (`loadout_*: string | null`), mirroring `driver_email`. Every full `TransportationRow` literal must add them (§Task 1 shape sweep).
- Reuse existing patterns exactly (driver trio). No new warning/§12.4 code, no dedup, `isEmptyTransport` unchanged, capture only in `parseV4Transport`.
- Migration is idempotent (`add column if not exists`, `drop constraint if exists`/`add`); applied locally + validation project; manifest regenerated.
- UI files (`TravelSection.tsx`, `Step3SheetCard.tsx`) → impeccable dual-gate before Codex whole-diff review.
- Worktree: `/Users/ericweiss/fxav-transport-loadout` (branch `feat/transport-loadout`).

## Meta-test inventory & topology (declared)

- **`_metaSentinelHidingContract`** (`tests/components/tiles/`) — auto-covers the new crew reads (walks `components/crew/sections/`); the load-out reads route through `shouldHideGenericOptional`. No registry edit.
- **`validation-schema-parity`** — new columns must reach manifest (L1) + validation project (L2).
- **`x5-email-canonicalization`** — new CHECK validated once migration is added to `defaultSchemaCheckSources()`; `EMAIL_BOUNDARIES` unchanged.
- **Advisory-lock topology:** N/A — no `pg_advisory*` in any changed path.
- **Layout-dimensions task:** NOT required — the load-out `TravelRow` is a structural clone of the existing Driver row in a `flex flex-col` stack; no fixed-dimension parent, no new parent→child dimension relationship (spec §6a).
- **Transition-audit task:** NOT required — the row has only present/absent (mount/unmount), no `AnimatePresence`, instant (spec §6a).

---

## File Structure

- `lib/parser/types.ts` — +3 fields on `TransportationRow`.
- `lib/parser/blocks/transport.ts` — capture at `:264`; v4/v2/v1 returns.
- `supabase/migrations/20260630000001_transportation_loadout_contact.sql` — NEW (public + dev columns + CHECK).
- `supabase/__generated__/schema-manifest.json` — regen.
- `lib/audit/emailCanonicalization.ts` — add migration to `defaultSchemaCheckSources()`.
- `lib/sync/runScheduledCronSync.ts` — cron write (`:1365`) + read-back (`:565`).
- `supabase/seed.ts` — INSERT (`:390`).
- `lib/data/getShowForViewer.ts` — projection (`:507`).
- `components/crew/sections/TravelSection.tsx` — crew render (UI).
- `components/admin/wizard/Step3SheetCard.tsx` — modal render (UI).
- Tests: `tests/parser/blocks/transport.test.ts`, cron test, projection test, `tests/components/crew/sections/TravelSection.test.tsx`, `tests/components/admin/wizard/Step3Review.test.tsx`, plus the shape-sweep literal edits.

---

## Task 1: Type + parser capture + shape sweep

**Files:** Modify `lib/parser/types.ts`, `lib/parser/blocks/transport.ts`, `tests/parser/blocks/transport.test.ts`, + every full `TransportationRow` literal (shape sweep).

**Interfaces — Produces:** `TransportationRow.loadout_name/loadout_phone/loadout_email: string | null`.

- [ ] **Step 1: Failing parser tests** — add to `tests/parser/blocks/transport.test.ts` (v4 markdown built inline like the existing tests; the load-out row sits before the DATE header):

```ts
describe("parseV4Transport — Load Out secondary transporter (loadout coverage)", () => {
  const v4Header = "| TRANSPORTATION/Load In: | TRANSPORTATION/Tracy Edwards | PHONE/484-547-6433 | EMAIL/tedwards8033@gmail.com | LICENSE |";
  const block = (loadoutRow: string) =>
    [v4Header, loadoutRow, "| | DATE | TIME | |"].join("\n") + "\n";

  it("captures name/phone/email and canonicalizes the email", () => {
    const t = parseTransportation(block("| Load Out: | Carlos Pineda | 610-618-0111 | Carlosmpdal@GMAIL.com |"), "v4");
    expect(t!.loadout_name).toBe("Carlos Pineda");
    expect(t!.loadout_phone).toBe("610-618-0111");
    expect(t!.loadout_email).toBe("carlosmpdal@gmail.com"); // canonicalized (lowercased)
    // driver (from slash header) is unaffected
    expect(t!.driver_name).toBe("Tracy Edwards");
  });

  it("name-only load-out (exporter-xlsx corpus case): phone/email null", () => {
    const t = parseTransportation(block("| Load Out: | Carlos Pineda | | |"), "v4");
    expect(t!.loadout_name).toBe("Carlos Pineda");
    expect(t!.loadout_phone).toBeNull();
    expect(t!.loadout_email).toBeNull();
  });

  it("no load-out row: all three null", () => {
    const t = parseTransportation(block("| Vehicle | Mercedes Sprinter | | |"), "v4");
    expect(t!.loadout_name).toBeNull();
    expect(t!.loadout_phone).toBeNull();
    expect(t!.loadout_email).toBeNull();
  });

  it("multiple Load Out rows: first-wins", () => {
    const md = [v4Header,
      "| Load Out: | Carlos Pineda | 610-618-0111 | a@b.com |",
      "| Load Out: | Second Person | 999-999-9999 | c@d.com |",
      "| | DATE | TIME | |"].join("\n") + "\n";
    const t = parseTransportation(md, "v4");
    expect(t!.loadout_name).toBe("Carlos Pineda");
  });

  it("v2/v1 returns carry loadout_* = null", () => {
    // any v2 block → loadout fields present and null (type totality)
    const t2 = parseTransportation("| TRANSPORTATION | |\n| Load In: | Bob | 1 | |\n", "v2");
    expect(t2!.loadout_name).toBeNull();
    expect(t2!.loadout_email).toBeNull();
  });
});
```
(Use the real exported `parseTransportation` name + the file's existing helper style; adjust the minimal v2 block to whatever the existing v2 tests use so it returns non-null.)

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/parser/blocks/transport.test.ts -t "loadout coverage"` → FAIL (fields undefined / not captured).

- [ ] **Step 3a: Type** — `lib/parser/types.ts`, add after `driver_email` in `TransportationRow` (`:189`):
```ts
  loadout_name: string | null;
  loadout_phone: string | null;
  loadout_email: string | null; // canonicalized per §4.1.1, mirror of driver_email
```

- [ ] **Step 3b: Parser vars + capture** — `lib/parser/blocks/transport.ts`. After the driver vars (`:189-191`) add:
```ts
  let loadoutName: string | null = null;
  let loadoutPhone: string | null = null;
  let loadoutEmail: string | null = null;
```
Replace the skip (`:263-264`) with:
```ts
    // Load-out secondary transporter (col0 like "Load Out:"). Capture name/phone/email
    // mirroring the driver body-row read; canonicalize the email at this parser boundary
    // (AGENTS.md invariant 3). It is a contact, not a schedule leg — continue after.
    if (/^load\s+out\s*:/i.test(col0)) {
      if (loadoutName === null && loadoutPhone === null && loadoutEmail === null) {
        loadoutName = presence(clean(cells[1] ?? ""));
        loadoutPhone = presence(clean(cells[2] ?? ""));
        loadoutEmail = canonicalize(clean(cells[3] ?? ""));
      }
      continue;
    }
```

- [ ] **Step 3c: Returns** — v4 return (`:294-304`) add after `driver_email: driverEmail,`:
```ts
    loadout_name: loadoutName,
    loadout_phone: loadoutPhone,
    loadout_email: loadoutEmail,
```
v2 return (`:405-415`) and v1 return (`:496-506`) add after `driver_email: null,`:
```ts
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
```

- [ ] **Step 3d: Shape sweep** — run `pnpm typecheck`; it errors on every full `TransportationRow` literal missing the 3 fields. Add
```ts
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
```
to each (after `driver_email`/`driver_phone`). Known sites (typecheck is the authority — fix all it reports): `tests/visibility/scopeTiles.test.ts:151` + the `withDriver` factory `:252`; `tests/visibility/transportTransitions.test.ts:226,267,325,345`; `tests/parser/blocks/scheduleBookends.test.ts:153` (factory); `tests/components/crew/sections/TodaySection.bookends.test.tsx` + `ScheduleSection.bookends.test.tsx` (factories); `tests/invariants/mi.test.ts`; `tests/components/crew/sourceLinkCoverage.test.tsx`; `tests/components/admin/wizard/Step3Review.test.tsx`; `tests/components/crew/sectionTileError.test.tsx`; `tests/components/crew/sections/VenueSection.test.tsx`, `TodaySection.test.tsx`, `TravelSection.test.tsx`; `tests/components/tiles/SentinelHidingClass.test.tsx`; `tests/sync/phase2.test.ts`; `tests/sync/runScheduledCronSync.test.ts`; `tests/data/getShowForViewer.test.ts`; `tests/onboarding/finalizeFirstSeenFullApply.db.test.ts`; `tests/e2e/transport-tile.spec.ts`. (Factory helpers = one edit each; inline literals = one edit each.)

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/parser/blocks/transport.test.ts` → PASS. `pnpm typecheck` → clean (all literals fixed).

- [ ] **Step 5: Commit** — `feat(parser): capture transport Load-Out secondary transporter (transport-loadout-contact)`

---

## Task 2: DB migration + manifest + email-audit registration

**Files:** Modify `tests/db/schema.test.ts`; create `supabase/migrations/20260630000001_transportation_loadout_contact.sql`; modify `lib/audit/emailCanonicalization.ts`; regen `supabase/__generated__/schema-manifest.json`.

- [ ] **Step 1: Failing test** — `tests/db/schema.test.ts` statically parses migration SQL text via `expectColumn(body, name, regex)` (no DB needed). Add a `describe` for the new migration that reads `supabase/migrations/20260630000001_transportation_loadout_contact.sql` and asserts, for BOTH `public.transportation` and `dev.transportation`, the three `loadout_*` columns and the canonical CHECK:
```ts
describe("transportation loadout_* migration", () => {
  const migrationPath = "supabase/migrations/20260630000001_transportation_loadout_contact.sql";
  const sql = readFileSync(migrationPath, "utf8");
  // Assert BOTH tables independently — a public-only migration must FAIL the dev case
  // (dev-schema parity is a hard requirement; scope every assertion to the table name).
  for (const schema of ["public", "dev"] as const) {
    test(`adds loadout_{name,phone,email} + canonical CHECK to ${schema}.transportation`, () => {
      const addBlock = new RegExp(
        `alter table ${schema}\\.transportation\\s+add column if not exists loadout_name text,` +
          `\\s*add column if not exists loadout_phone text,` +
          `\\s*add column if not exists loadout_email text`,
        "i",
      );
      expect(sql, `missing loadout_* add-column block for ${schema}`).toMatch(addBlock);
      const check = new RegExp(
        `alter table ${schema}\\.transportation add constraint transportation_loadout_email_canonical ` +
          `check \\(\\s*loadout_email is null or \\(loadout_email = lower\\(trim\\(loadout_email\\)\\) ` +
          `and loadout_email <> ''\\)`,
        "i",
      );
      expect(sql, `missing canonical CHECK for ${schema}`).toMatch(check);
    });
  }
});
```
(Match the file's existing `readFileSync` import + assertion idiom. The two per-schema tests mean a migration that adds columns/CHECK only to `public.transportation` fails the `dev` case — dev-schema parity is genuinely test-first. This also pins the migration SQL to a single `alter table <schema>.transportation add column …, add column …, add column …` statement + a separate `add constraint` per table, matching Step 3.)

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/db/schema.test.ts -t "loadout"` → FAIL (migration file does not exist yet).

- [ ] **Step 3: Write the migration** — create `supabase/migrations/20260630000001_transportation_loadout_contact.sql`:
```sql
-- Surface the transport "Load Out" secondary transporter: persist loadout_{name,phone,email}.
-- Mirrors the driver_email canonical CHECK. Idempotent (apply-twice safe).
alter table public.transportation
  add column if not exists loadout_name text,
  add column if not exists loadout_phone text,
  add column if not exists loadout_email text;
alter table public.transportation drop constraint if exists transportation_loadout_email_canonical;
alter table public.transportation add constraint transportation_loadout_email_canonical check (
  loadout_email is null or (loadout_email = lower(trim(loadout_email)) and loadout_email <> '')
);

alter table dev.transportation
  add column if not exists loadout_name text,
  add column if not exists loadout_phone text,
  add column if not exists loadout_email text;
alter table dev.transportation drop constraint if exists transportation_loadout_email_canonical;
alter table dev.transportation add constraint transportation_loadout_email_canonical check (
  loadout_email is null or (loadout_email = lower(trim(loadout_email)) and loadout_email <> '')
);
```

- [ ] **Step 4: Apply locally + regen manifest** — ensure local Supabase is up (`supabase start` if needed), apply the migration to the local DB (`psql "$LOCAL_DB_URL" -f supabase/migrations/20260630000001_transportation_loadout_contact.sql` or `supabase migration up`), then:
```bash
pnpm gen:schema-manifest
```
Verify `supabase/__generated__/schema-manifest.json` `transportation` array now contains `loadout_email`, `loadout_name`, `loadout_phone` (alphabetical).

- [ ] **Step 5: Register the migration for the email CHECK audit** — `lib/audit/emailCanonicalization.ts`, in `defaultSchemaCheckSources()` (`:71-77`) add to the array:
```ts
    "supabase/migrations/20260630000001_transportation_loadout_contact.sql",
```

- [ ] **Step 6: Run the affected tests** — `pnpm vitest run tests/db/schema.test.ts tests/cross-cutting/email-canonicalization.test.ts tests/db/schema-manifest-lib.test.ts` → PASS (schema test now green; new CHECK parsed + canonical; manifest lib consistent). `pnpm typecheck` → clean.

- [ ] **Step 7: Commit** — `feat(db): add transportation loadout_* columns + canonical CHECK (transport-loadout-contact)` (stage the schema test, the migration, the regenerated manifest, and `emailCanonicalization.ts`).

*(Validation-project surgical apply happens in Task 7 Step 3, before push — `psql "$TEST_DATABASE_URL" -f <migration>` + `notify pgrst, 'reload schema';`; `TEST_DATABASE_URL` lives in the main checkout's env file `/Users/ericweiss/FX-Webpage-Template/.env.local`, NOT the worktree.)*

---

## Task 3: Cron write + read-back + seed

**Files:** Modify `lib/sync/runScheduledCronSync.ts`, `supabase/seed.ts`, the cron test.

- [ ] **Step 1: Failing cron test** — in the `runScheduledCronSync` test surface (`tests/sync/runScheduledCronSync.test.ts`), add a case asserting `replaceTransportation` persists + canonicalizes + round-trips the load-out fields. Concretely: with a `ParseResult.transportation` carrying `loadout_email: "Carlos@X.COM"` (mixed case), after the write the row's `loadout_email` reads back `"carlos@x.com"`, and `loadout_name`/`loadout_phone` round-trip; and the change-detection read-back (`buildParseResultFromDb`-style select) returns the three columns. Derive expectations from the inserted row, not a hardcode. Failure mode: a dropped INSERT column silently loses the value while parser/render tests pass.

- [ ] **Step 2: Run, verify fail** — the new assertions fail (columns absent from INSERT / read-back).

- [ ] **Step 3a: Cron write** — `runScheduledCronSync.ts` `replaceTransportation` (`:1365-1384`). Extend the INSERT column list, values, and params:
```ts
        insert into public.transportation (
          show_id, driver_name, driver_phone, driver_email, vehicle, license_plate,
          color, parking, schedule, notes, loadout_name, loadout_phone, loadout_email
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
```
params array — after `row.notes,`:
```ts
        row.loadout_name,
        row.loadout_phone,
        canonicalize(row.loadout_email),
```

- [ ] **Step 3b: Cron read-back** — the change-detection SELECT (`:565-567`) → append the three columns:
```sql
        select driver_name, driver_phone, driver_email, vehicle, license_plate, color,
               parking, schedule, notes, loadout_name, loadout_phone, loadout_email
```

- [ ] **Step 3c: Seed** — `supabase/seed.ts` `transportationInsertSql` (`:390-414`). Add to the INSERT column list (after `notes`):
```
      notes,
      loadout_name,
      loadout_phone,
      loadout_email
```
and to the `select` values (after the `notes` line):
```ts
      ${sqlNullableString(transportation.notes)},
      ${sqlNullableString(transportation.loadout_name)},
      ${sqlNullableString(transportation.loadout_phone)},
      ${sqlNullableString(transportation.loadout_email)}
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/sync/runScheduledCronSync.test.ts` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(sync): persist transport loadout_* through cron write/read-back + seed (transport-loadout-contact)`

---

## Task 4: Projection

**Files:** Modify `lib/data/getShowForViewer.ts`, the projection test.

- [ ] **Step 1: Failing test** — in the transportation projection test (`tests/data/getShowForViewer.test.ts`), assert a DB row with `loadout_name/phone/email` set projects those three onto `ShowForViewer.transportation`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `getShowForViewer.ts` `readTransportation` return (`:507-509` area). Add after `driver_email` projection:
```ts
        loadout_name: (transRes.data.loadout_name as string | null) ?? null,
        loadout_phone: (transRes.data.loadout_phone as string | null) ?? null,
        loadout_email: (transRes.data.loadout_email as string | null) ?? null,
```
(`.select("*")` already returns the columns.)

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/data/getShowForViewer.test.ts` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(crew-page): project transport loadout_* onto ShowForViewer (transport-loadout-contact)`

---

## Task 5: Crew render — TravelSection (UI)

**Files:** Modify `components/crew/sections/TravelSection.tsx`, `tests/components/crew/sections/TravelSection.test.tsx`.

- [ ] **Step 1: Failing test** — in `TravelSection.test.tsx`, add: full load-out contact → a "Load out" row with name primary + `phone · email` meta; name-only → row, no meta; sentinel email → hidden from the load-out row; absent → no "Load out" text in the DOM. **Anti-tautology:** scope assertions to the load-out row (query by the "Load out" label, or clone the card and remove the Driver row before scanning) so the Driver row can't satisfy them; derive expected meta from the fixture.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3a: Read block** — `TravelSection.tsx` after the driver reads (`:174-184`) add:
```ts
          const loadoutName =
            transportation && !shouldHideGenericOptional(transportation.loadout_name)
              ? transportation.loadout_name
              : null;
          const loadoutPhone =
            transportation && !shouldHideGenericOptional(transportation.loadout_phone)
              ? transportation.loadout_phone
              : null;
          const loadoutEmail =
            transportation && !shouldHideGenericOptional(transportation.loadout_email)
              ? transportation.loadout_email
              : null;
```

- [ ] **Step 3b: Cascade** — after `driverMetaLines` (`:236-239`) add:
```ts
          const loadoutFields = [loadoutName, loadoutPhone, loadoutEmail].filter(Boolean) as string[];
          const hasLoadout = loadoutFields.length > 0;
          const loadoutPrimary = loadoutFields[0] ?? null;
          const loadoutMetaLines = loadoutFields.slice(1);
```

- [ ] **Step 3c: `hasGettingThere`** — extend the OR-chain (`:250-251`):
```ts
          const hasGettingThere =
            hasDriver || hasLoadout || hasVehicle || legs.length > 0 || transportNotes !== null;
```

- [ ] **Step 3d: Render** — immediately after the Driver `TravelRow` (`:319-330`, inside the `<div className="flex flex-col">`) add:
```tsx
                  {hasLoadout && loadoutPrimary ? (
                    <TravelRow
                      mode="ground"
                      label="Load out"
                      primary={loadoutPrimary}
                      meta={
                        loadoutMetaLines.length > 0 ? (
                          <span className="tabular-nums">{loadoutMetaLines.join(" · ")}</span>
                        ) : undefined
                      }
                    />
                  ) : null}
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/components/crew/sections/TravelSection.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts` → PASS (sentinel meta-test auto-covers the new reads). `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(crew-page): render Load-out contact in TravelSection Getting-there card (transport-loadout-contact)`

---

## Task 6: Modal render — Step3SheetCard TransportBreakdown (UI)

**Files:** Modify `components/admin/wizard/Step3SheetCard.tsx`, `tests/components/admin/wizard/Step3Review.test.tsx`.

- [ ] **Step 1: Failing test** — in `Step3Review.test.tsx`, extend the transport-breakdown test: a transportation with load-out fields renders "Load out" / "Load out phone" / "Load out email" as-parsed; absent fields omitted; the section `count` includes the present load-out rows.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `Step3SheetCard.tsx` `TransportBreakdown` `contentRows([...])` (`:323-333`), after the driver rows (`:324-326`) add:
```ts
        ["Load out", t.loadout_name],
        ["Load out phone", t.loadout_phone],
        ["Load out email", t.loadout_email],
```
(`contentRows` drops empty values; `count` auto-updates. As-parsed — no `shouldHideGenericOptional` — the documented modal asymmetry.)

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(admin): render Load-out contact in Step-3 TransportBreakdown (transport-loadout-contact)`

---

## Task 7: Full verification + impeccable dual-gate + validation apply + screenshots

- [ ] **Step 1: Full suite + lint/format** —
```bash
pnpm vitest run
pnpm typecheck
pnpm exec eslint lib/ components/
pnpm exec prettier --check .
git diff --check origin/main...HEAD
```
All PASS/clean. (Full suite catches any missed shape-sweep literal + exact-`toEqual` on projected/parsed transportation.)

- [ ] **Step 2: Impeccable dual-gate (invariant 8)** — the UI diff is `TravelSection.tsx` + `Step3SheetCard.tsx`. Run `/impeccable critique` AND `/impeccable audit` on the affected diff with the canonical v3 preflight (PRODUCT.md → DESIGN.md → register → preflight). Fix HIGH/CRITICAL or defer via `DEFERRED.md`. Record dispositions in the PR description. (The load-out row is a structural clone of the Driver row → minimal visual surface.)

- [ ] **Step 3: Validation-project migration apply** — load `TEST_DATABASE_URL` from the main checkout's env file `/Users/ericweiss/FX-Webpage-Template/.env.local` (NOT the worktree, which has no such file), then `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260630000001_transportation_loadout_contact.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. This makes `validation-schema-parity` L2 pass in CI.

- [ ] **Step 4: screenshots-drift** — determine whether the seeded fintech crew travel route is in the screenshot manifest. If YES, the "Getting there" card now shows a "Load out" row → regenerate the affected WebP baseline **from the CI pinned-amd64 Docker artifact, never from the local arm64 host** (a pinned Docker image still produces different raster bytes on an arm64 dev machine than the x64 CI runner, so a locally-captured WebP fails the byte-exact `screenshots-drift` gate). If NO, no drift (verify the `screenshots-drift` job passes in CI at close-out). Do not commit locally-captured (arm64) screenshots.

---

## Task 8: Adversarial review (cross-model)

- [ ] **Step 1:** Sync `origin/main` (merge in if moved; re-verify with the full suite). Whole-diff cross-model review via `codex exec` (fresh-eyes, REVIEWER ONLY). Do-not-relitigate: no dedup; `isEmptyTransport` unchanged; capture only in `parseV4Transport`; crew-hides-vs-modal-shows asymmetry; email-audit reasoning (§2.3). Iterate to APPROVE (no round budget). Triage findings via deferral discipline.

---

## Task 9: Close-out — CI → merge → FF main

- [ ] **Step 1:** Push; `gh pr create` (PR body: summary, write-path, impeccable dispositions, screenshots note, email-audit reasoning).
- [ ] **Step 2:** Confirm REAL CI green (`gh pr checks <PR#> --watch`; `mergeStateStatus == CLEAN`) — especially `validation-schema-parity`, `x5-email-canonicalization`, `screenshots-drift`, `unit-suite-shard`. Re-run flakes with `gh run rerun --failed`.
- [ ] **Step 3:** `gh pr merge <PR#> --merge`.
- [ ] **Step 4:** FF local main; verify `git rev-list --left-right --count main...origin/main` == `0  0`. Remove worktree.

---

## Self-Review

- **Spec coverage:** type+parser+sweep → T1; migration+manifest+email-audit → T2; cron write/read+seed → T3; projection → T4; crew render → T5; modal render → T6; verification+impeccable+validation+screenshots → T7; adversarial → T8; close-out → T9. ✓
- **Anti-tautology:** parser tests derive from fixture rows + assert canonicalization; crew test scopes to the load-out row (not the Driver row) + derives meta from fixture; cron test asserts the INSERT column list + canonicalized round-trip (catches a dropped column) + change-detection read-back. Each states its failure mode. ✓
- **No placeholders:** exact code for every step (type, parser capture, returns, migration SQL, cron INSERT/params/read-back, seed, projection, both renders). ✓
- **Type consistency:** `loadout_name/loadout_phone/loadout_email` used identically across T1-T6; `canonicalize` applied at parser + cron write. ✓
- **Meta-tests / topology:** sentinel-hiding auto-covers (T5); validation-schema-parity (T2/T7); x5 (T2); advisory-lock N/A; no layout/transition task needed (declared). ✓
- **Impeccable:** UI (T5/T6) → dual-gate in T7 before Codex whole-diff (T8). ✓
