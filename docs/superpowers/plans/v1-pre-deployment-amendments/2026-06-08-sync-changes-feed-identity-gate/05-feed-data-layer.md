# Phase 5 — Feed data layer (server-only service-role read)

> **Depends on:** Phases 1–4 (`sync_holds` + `show_change_log` tables, REVOKE + RLS read-lockdown, `lib/sync/holds/types.ts`, hold-aware apply writing `show_change_log` rows, MI-11 gate + undo RPCs populating holds/log).

Builds `lib/sync/feed/readShowChangeFeed.ts`: the **server-only (service-role)** read that merges `show_change_log` (most-recent *N*, default 50, `occurred_at desc`) with open `sync_holds` (pending MI-11) and shapes each row into the canonical `FeedEntry` (`00-overview.md` §"TypeScript types"). NEVER via PostgREST `from()` — service-role only (spec §6.1 read posture, finding F9; lockdown landed Phase 1). The consumer (Phase 6 UI) renders the truncation disclosure; this layer only sets `{ entries, truncated, totalShown }`.

**Canonical contracts (do not redefine — import from `00-overview.md`):**
- `FeedEntry = { id; occurredAt; status: ChangeStatus; summary; action: "undo" | "approve_reject" | "none"; entityRef: string | null; gate?: { holdId: string; disposition: Disposition }; changeLogId?: string }` — the two optional fields (`00-overview.md` resolution #17) carry the action payload so Phase 6 needs NO second query.
- `ChangeStatus = "applied" | "pending" | "rejected" | "undone" | "superseded"` (matches `00-overview.md`:86 exactly — `'superseded'` rows are feed history, `action='none'`)
- `readShowChangeFeed(showId: string, opts?: { limit?: number }): Promise<{ entries: FeedEntry[]; truncated: boolean; totalShown: number }>`
- Service-role client: `createSupabaseServiceRoleClient()` (`lib/supabase/server.ts:79`).
- Summary copy: rendered via `lib/messages` (`messageFor(code, params)` → `lib/messages/lookup.ts`), never raw codes (invariant 5). `show_change_log.summary` is already a rendered string written at apply/RPC time (spec §6.1); this layer passes it through and only renders pending-MI-11 summaries (which have no `show_change_log` row) itself.

**Shaping rules (spec §6.1/§6.2):**
- `show_change_log` row → `FeedEntry`: `id`, `occurredAt=occurred_at`, `status` (the column value), `summary` (the column value), `entityRef=entity_ref`. `action`:
  - `status='applied'` AND crew-domain `change_kind` ∈ `{'crew_added','crew_removed','crew_renamed'}` → `action='undo'` (canonical taxonomy: rename rows carry `change_kind='crew_renamed'`, NOT MI-12/13/14 — `00-overview.md` resolutions #3 + #13). **Set `changeLogId = show_change_log.id`** (the id `undo_change` takes, resolution #17). No `gate`.
  - `status='applied'` AND any other `change_kind` (`crew_email_changed` — a gate-resolved MI-11 email change, `field_changed`, `section_shrunk`, `asset_drift`, etc.) → `action='none'` (notification-only, finding F6 — `before_image` is null, no undo). NOTE: `change_kind` is NEVER an `MI-*` value (`00-overview.md` resolution #13) — `show_change_log` rows always carry structural kinds. **Neither `gate` nor `changeLogId` set.**
  - `status` ∈ `{rejected, undone, superseded}` → `action='none'` (neither optional field set). A `superseded` row (a newer same-entity change made it non-actionable — `00-overview.md`, PF21) is feed history only — even a crew-domain `change_kind` here is NEVER undoable; only `status='applied'` crew-domain rows get `action='undo'`.
- Open `sync_holds` row (`kind='mi11_pending'`) → pending `FeedEntry`: `status='pending'`, `action='approve_reject'`, derive old→proposed summary from the hold's `held_value` (old) and `proposed_value` disposition (`email_change` | `rename` | `removal`), `entityRef=entity_key`. **Set `gate = { holdId: sync_holds.id, disposition: proposed_value }`** (the canonical `Disposition`, resolution #17). No `changeLogId`. Holds whose `kind='undo_override'` are NOT pending entries (their effect already shows as an `undone`/`rejected` `show_change_log` row) — exclude them.
- **Crew-domain decision** lives in one exported helper `isCrewDomainChangeKind(kind: string): boolean` so the undo-gating set is single-sourced and testable.
- **Cap/truncation:** fetch the *N* most-recent `show_change_log` rows (`limit = opts.limit ?? 50`); query `count` of total log rows for the show. Pending MI-11 holds are **always** included (they are the actionable items) and prepended/merged into the ordered result by `occurredAt` (a hold's `created_at` is its `occurredAt`). `truncated = totalLogRows > limit`. `totalShown = entries.length`. Never a silent cut — `truncated` drives the consumer's "older changes not shown" disclosure.

---

## Task 5.1 — `isCrewDomainChangeKind` helper (single-source the undo-gating set)

- [ ] **Failing test** `tests/sync/feed/isCrewDomainChangeKind.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { isCrewDomainChangeKind } from "@/lib/sync/feed/readShowChangeFeed";

describe("isCrewDomainChangeKind", () => {
  test.each(["crew_added", "crew_removed", "crew_renamed"])(
    "crew-domain kind %s is undo-eligible",
    (kind) => expect(isCrewDomainChangeKind(kind)).toBe(true),
  );
  // Canonical taxonomy (00-overview resolutions #3 + #13): change_kind is
  // ALWAYS structural, NEVER an MI-* value. Renames are 'crew_renamed'; a
  // gate-resolved MI-11 email change logs as 'crew_email_changed' (NOT undoable).
  test.each(["crew_email_changed", "field_changed", "section_shrunk", "asset_drift"])(
    "non-crew kind %s is notification-only",
    (kind) => expect(isCrewDomainChangeKind(kind)).toBe(false),
  );
});
```
  **Failure mode caught:** a non-crew row (no captured `before_image`) is mis-gated as `action='undo'`, offering an undo button the backend can't honor (F6); or a crew rename row loses its undo button.
- [ ] **Minimal impl** — export `isCrewDomainChangeKind` from `readShowChangeFeed.ts` (a `Set` membership check over the crew-domain kinds).
- [ ] `pnpm vitest run tests/sync/feed/isCrewDomainChangeKind.test.ts`
- [ ] Commit: `feat(sync): single-source crew-domain undo-gating set for the feed`

---

## Task 5.2 — `readShowChangeFeed` shapes applied + pending rows (real-Postgres)

Seed real rows in the local Supabase DB, call the function against the **service-role** client, assert `FeedEntry` shaping. Anti-tautology: every expected value is derived from the seeded fixture (the row's own `id`/`occurred_at`/`summary`/`change_kind`), never a hardcoded literal divorced from the seed.

- [ ] **Failing test** `tests/sync/feed/readShowChangeFeed.test.ts` (psql-seeded, mirrors `tests/db/claim_oauth_identity.test.ts:1-12` harness):
```ts
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const runPsql = (sql: string) =>
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;

describe("readShowChangeFeed", () => {
  const prefix = `feed-${randomUUID()}`;
  let showId: string;

  afterEach(() => {
    runPsql(`delete from public.shows where drive_file_id like ${q(prefix + "%")};`);
  });

  test("shapes applied crew row → undo, applied non-crew row → none, open mi11 hold → pending approve_reject (old→proposed)", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-a")}, ${q(prefix + "-a")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      ),
      added as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        select id, ${q(prefix + "-a")}, now() - interval '2 min',
          'auto_apply', 'crew_added', 'Bob', 'Crew added: Bob', '{"name":"Bob"}'::jsonb, 'applied' from s
        returning id
      ),
      renamed as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        -- entity_ref = the PRIOR name (the addressing key undo restores on),
        -- NOT the new name (00-overview resolution #19). Summary still shows
        -- "Dan → Dana"; only the addressing key is the old name.
        select id, ${q(prefix + "-a")}, now() - interval '90 sec',
          'auto_apply', 'crew_renamed', 'Dan', 'Crew renamed: Dan → Dana', '{"name":"Dana"}'::jsonb, 'applied' from s
        returning id
      ),
      shrink as (
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
        select id, ${q(prefix + "-a")}, now() - interval '1 min',
          'auto_apply', 'section_shrunk', 'Hotels', 'Section shrunk: Hotels', '{}'::jsonb, 'applied' from s
        returning id
      ),
      hold as (
        insert into public.sync_holds
          (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
        select id, ${q(prefix + "-a")}, 'crew_email', 'Alice',
          '{"name":"Alice","email":"alice@old"}'::jsonb,
          '{"disposition":"email_change","name":"Alice","email":"alice@new"}'::jsonb,
          now(), 'mi11_pending', 'system' from s
        returning id
      )
      select id from s;
    `);

    const { entries, truncated, totalShown } = await readShowChangeFeed(showId);

    // Anti-tautology: assert the SHAPE keyed off seeded discriminators.
    const pending = entries.find((e) => e.status === "pending");
    expect(pending).toBeDefined();
    expect(pending!.action).toBe("approve_reject");
    expect(pending!.entityRef).toBe("Alice");
    expect(pending!.summary).toContain("alice@old"); // old, from held_value
    expect(pending!.summary).toContain("alice@new"); // proposed, from proposed_value

    const added = entries.find((e) => e.entityRef === "Bob");
    expect(added!.status).toBe("applied");
    expect(added!.action).toBe("undo"); // crew_added → crew-domain → undo

    // entity_ref for crew_renamed is the PRIOR name ('Dan'), not 'Dana' (res #19).
    const renamed = entries.find((e) => e.entityRef === "Dan");
    expect(renamed!.action).toBe("undo"); // crew_renamed → crew-domain → undo

    const shrink = entries.find((e) => e.entityRef === "Hotels");
    expect(shrink!.action).toBe("none"); // non-crew → notification-only

    // Resolution #17: action payload is inlined so Phase 6 needs no 2nd query.
    // Derive expected ids from the DB (the seeded rows' own ids), not literals.
    const holdId = runPsql(
      `select id from public.sync_holds where show_id = ${q(showId)} and entity_key = 'Alice';`,
    );
    const addedLogId = runPsql(
      `select id from public.show_change_log where show_id = ${q(showId)} and entity_ref = 'Bob';`,
    );
    const renamedLogId = runPsql(
      `select id from public.show_change_log where show_id = ${q(showId)} and entity_ref = 'Dan';`,
    );

    // approve_reject → gate{holdId, disposition}; NO changeLogId.
    expect(pending!.gate).toEqual({
      holdId,
      disposition: { disposition: "email_change", name: "Alice", email: "alice@new" },
    });
    expect(pending!.changeLogId).toBeUndefined();

    // undo → changeLogId = the show_change_log.id undo_change takes; NO gate.
    expect(added!.changeLogId).toBe(addedLogId);
    expect(added!.gate).toBeUndefined();
    expect(renamed!.changeLogId).toBe(renamedLogId);
    expect(renamed!.gate).toBeUndefined();

    // none → neither field set.
    expect(shrink!.gate).toBeUndefined();
    expect(shrink!.changeLogId).toBeUndefined();

    expect(truncated).toBe(false);
    expect(totalShown).toBe(entries.length);
  });

  test("undo_override holds are NOT pending feed entries", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-b")}, ${q(prefix + "-b")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.sync_holds
        (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
      select id, ${q(prefix + "-b")}, 'crew_identity', 'Carol',
        '{"name":"Carol"}'::jsonb, null, null, 'undo_override', 'system' from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    expect(entries.filter((e) => e.status === "pending")).toHaveLength(0);
  });

  test("a superseded crew-domain row is feed history only — status='superseded', action='none', no payload (PF21)", async () => {
    showId = runPsql(`
      with s as (
        insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
        values (${q(prefix + "-d")}, ${q(prefix + "-d")}, 'Feed Test', 'FXAV', 'v4', true)
        returning id
      )
      insert into public.show_change_log
        (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
      select id, ${q(prefix + "-d")}, now() - interval '5 min',
        'auto_apply', 'crew_renamed', 'Eve', 'Crew renamed: Ev → Eve', '{"name":"Eve"}'::jsonb, 'superseded'
      from s
      returning show_id;
    `);
    const { entries } = await readShowChangeFeed(showId);
    // Anti-tautology: a CREW-DOMAIN change_kind ('crew_renamed') that would be
    // undoable at status='applied' must NOT be undoable at status='superseded'.
    const eve = entries.find((e) => e.entityRef === "Eve");
    expect(eve).toBeDefined();
    expect(eve!.status).toBe("superseded");
    expect(eve!.action).toBe("none");
    expect(eve!.gate).toBeUndefined();
    expect(eve!.changeLogId).toBeUndefined();
  });
});
```
  **Failure modes caught:** (1) crew add offered no undo / non-crew offered undo (F6 mis-gating); (2) pending MI-11 entry missing or not rendering old→proposed (feed≠hold disposition); (3) `undo_override` leaking in as a spurious pending action row; (4) **action payload missing/cross-wired (resolution #17 PF14)** — `approve_reject` lacking `gate.holdId`/`gate.disposition`, `undo` lacking `changeLogId`, or `none` carrying either — which would force Phase 6 into a second query (or a wrong-id RPC call); (5) **superseded row offered undo (PF21)** — a `status='superseded'` crew-domain row mis-gated as `action='undo'` because the predicate only checked `change_kind` and not `status='applied'`.
- [ ] **Minimal impl** — `readShowChangeFeed`: service-role client; select `id` (→ `changeLogId` for undo rows), plus `(...).eq("show_id").order("occurred_at",{ascending:false}).limit(limit)` for the log; a separate `count` query for `truncated`; `select("id, ...").eq("show_id").eq("kind","mi11_pending")` for holds, mapping each to `gate={holdId:id, disposition:proposed_value}` (NOTE: these reads run as service-role — RLS denies anon/authenticated per Phase 1, so this layer is the only read path). Map each via the shaping rules; render pending summaries via `lib/messages` (catalog string from §12.4 — confirm the code exists; Open Question below). Merge + sort by `occurredAt desc`. Destructure `{ data, error }` on every call; throw a typed error on `error` (invariant 9).
- [ ] `pnpm vitest run tests/sync/feed/readShowChangeFeed.test.ts`
- [ ] Commit: `feat(sync): readShowChangeFeed merges change-log + pending MI-11 holds into FeedEntry`

---

## Task 5.3 — Cap at N with `truncated=true` (real-Postgres, derived from fixture count)

- [ ] **Failing test** (same file, new `test`): seed `N+5` applied `show_change_log` rows with strictly increasing `occurred_at`, call `readShowChangeFeed(showId, { limit: N })` with a **small** `N` (e.g. 3) so the assertion derives from the seed loop count, not the default 50:
```ts
test("caps at limit and sets truncated when more rows exist", async () => {
  const seeded = 8;
  const limit = 3;
  showId = runPsql(`
    with s as (
      insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
      values (${q(prefix + "-c")}, ${q(prefix + "-c")}, 'Feed Test', 'FXAV', 'v4', true)
      returning id
    )
    insert into public.show_change_log
      (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, after_image, status)
    select (select id from s), ${q(prefix + "-c")},
      now() - (g || ' min')::interval, 'auto_apply', 'crew_added', 'C' || g,
      'Crew added: C' || g, '{}'::jsonb, 'applied'
    from generate_series(1, ${"$1".replace("$1", String(8))}) g
    returning (select id from s) limit 1;
  `).split("\n")[0];

  const { entries, truncated, totalShown } = await readShowChangeFeed(showId, { limit });
  expect(entries.filter((e) => e.status === "applied")).toHaveLength(limit); // derived from limit
  expect(truncated).toBe(true);          // seeded(8) > limit(3)
  expect(totalShown).toBe(entries.length);
  // newest-first: most recent occurred_at (g=1) appears before older (g=8)
  const refs = entries.filter((e) => e.status === "applied").map((e) => e.entityRef);
  expect(refs).toEqual(["C1", "C2", "C3"]);
});
```
  **Failure mode caught:** the feed silently drops older rows with no `truncated` flag (so the UI can't render the "older changes not shown" disclosure), OR mis-orders so the *oldest* N show instead of newest N.
- [ ] **Minimal impl** — wire `limit` + the `count` comparison (already added in 5.2; confirm `truncated = totalLogRows > limit` and the `order ... desc` + `.limit(limit)` produce newest-first).
- [ ] `pnpm vitest run tests/sync/feed/readShowChangeFeed.test.ts`
- [ ] Commit: `feat(sync): cap feed at N with explicit truncated flag (no silent cut)`

---

## Task 5.4 — Reads happen via service-role, never PostgREST anon/authenticated

Structural guard: pin that `readShowChangeFeed` uses the service-role client and never constructs a cookie-bound/anon client, AND a runtime proof that an anon PostgREST read is denied (the RLS posture Phase 1 landed is the reason this layer must be service-role).

- [ ] **Failing test** `tests/sync/feed/readShowChangeFeed.serviceRole.test.ts`:
  1. **Source guard:** read `lib/sync/feed/readShowChangeFeed.ts` as text; assert it imports `createSupabaseServiceRoleClient` and does NOT reference `createSupabaseServerClient`, `createServerClient`, or a bare `.from("show_change_log")`/`.from("sync_holds")` on a cookie-bound client (regex over source). Failure mode: a refactor swaps in the cookie-bound client → crew PII (`before_image`) leaks under the caller's RLS context / read returns zero rows for a legitimately-admin server caller.
  2. **Runtime lockdown proof (real-Postgres):** using the local anon key (`createClient(url, anonKey)`), `await anon.from("show_change_log").select("*").eq("show_id", showId)` returns zero rows / RLS-denied; same for `sync_holds`. Then assert `readShowChangeFeed(showId)` (service-role) returns the seeded rows. Failure mode: RLS read-lockdown regressed and PostgREST exposes the crew PII the service-role path is supposed to gate (F9).
- [ ] **Minimal impl** — none beyond Task 5.2 if already service-role; this task exists to *pin* the posture. If the source guard fails, fix the client construction.
- [ ] `pnpm vitest run tests/sync/feed/readShowChangeFeed.serviceRole.test.ts`
- [ ] Commit: `test(sync): pin feed reads to service-role; anon PostgREST denied`

---

## Task 5.5 — Phase 5 adversarial review (cross-model)

- [ ] Run the full Phase-5 self-review (anti-tautology check: every expected value derives from seeded fixtures; numeric sweep on the cap default 50 vs the per-test small `N`; confirm `isCrewDomainChangeKind` set matches the crew-domain `change_kind`s Phase 2/3/4 actually write).
- [ ] Invoke the `adversarial-review` skill (Codex, REVIEWER ONLY — do not fix). Focus: F6 undo-gating set correctness, F9 service-role-only read posture, pending-MI-11 old→proposed shaping fidelity vs the `sync_holds` disposition, truncation honesty. Inline (not memory-cited) the do-not-relitigate contracts: undo is crew-domain-only by ratified scope (§1 non-goals + §6.2 F6); the feed reads `show_change_log` + open `sync_holds`, never `sync_audit` (§6.1 F1).
- [ ] Iterate to convergence; only escalate genuine ambiguity. Do not proceed to Phase 6 handoff until APPROVE.
