import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripCommentsForFile } from "../_shared/stripComments";
import { AFFORDANCE_MATRIX, DEFERRED_TESTIDS } from "@/app/help/_affordanceMatrix";
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
    expect(
      prepKindFor("/admin?bucket=archived", "help-affordance--dashboard-archived-shows--tooltip"),
    ).toBe("dashboard");
    expect(prepKindFor("/admin?step=2", "help-affordance--wizard-step2--tooltip")).toBe("wizard");
    expect(prepKindFor("/admin", "help-affordance--dashboard-active-shows--tooltip")).toBe(
      "dashboard",
    );
    expect(prepKindFor("/admin/settings", "help-affordance--settings-preferences--tooltip")).toBe(
      "none",
    );
  });

  it("walksAt partitions by visibleAt; allWalkableRows registers every non-deferred row (R7 pin)", () => {
    const desktopOnly = allWalkableRows.find(
      (r) => r.testid === "help-affordance--dashboard-needs-attention--tooltip",
    );
    expect(
      desktopOnly,
      "desktop-only row must be REGISTERED (skip at runtime, never absent)",
    ).toBeDefined();
    expect(walksAt(desktopOnly!, "desktop")).toBe(true);
    expect(walksAt(desktopOnly!, "mobile")).toBe(false);
    const concrete = AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete");
    // Walkable = every concrete row MINUS the deferred ones (preview-banner +
    // the Task-13 per-show crew/sync/data-quality tooltips pending re-homing).
    expect(allWalkableRows).toHaveLength(concrete.length - DEFERRED_TESTIDS.size);
    for (const r of allWalkableRows)
      expect(walksAt(r, "mobile") || walksAt(r, "desktop")).toBe(true);
  });
});

describe("e2e suite holds no unlocked PostgREST DML on locked tables (structural pin)", () => {
  // Plan-wide invariant 2 tables. NO file under tests/e2e/ may mutate them
  // through the service-role PostgREST client — fixture rows on locked
  // tables come from the locked seed (supabase/seed.ts /
  // seedWalkerFixtures.ts) or the shared locked psql helper
  // (tests/e2e/helpers/lockedCrewRestriction.ts). Concrete failure modes
  // caught: the pre-Task-11 firstSeenStagedId delete/insert on
  // pending_syncs; the pre-M12.12-DEF-2 rightNow.ts date_restriction
  // toggle; and a copy of that toggle in the former schedule-tile.spec.ts
  // (Codex R2 HIGH). That last spec was deleted 2026-08-09 as superseded —
  // it was 100% describe.skip against the retired ?crew= viewer mock and a
  // route that 404s (spec docs/superpowers/specs/ci/
  // 2026-08-09-resurrect-mobile-safari-e2e-design.md §2.3). The failure mode
  // it demonstrated is historical; the guard below still pins the class.
  // Invariant 2's dropped M9.5 auth table is deliberately omitted from the
  // regex: the M11.5 G3 cutover removed it (tests/db/cutover-drop-m9-5
  // pins the absence), a write would fail at the catalog, and the
  // cross-cutting no-m9-5-surfaces sweep bans spelling its name here.
  // Codex R4: the matcher accepts all THREE literal quote forms (double,
  // single, backtick) so quote style can't bypass the count pins. HONEST
  // LIMITATION: a table name reaching from() through a constant or
  // variable (`from(TABLE_NAME)`) is out of reasonable regex reach —
  // lexical scanning can't resolve identifiers. Prettier normalizes the
  // repo to double quotes, so literal-quote variants are the realistic
  // accidental bypass; identifier indirection would be deliberate and is
  // a review-time concern.
  const LOCKED_TABLE_FROM_RE =
    /from\(\s*["'`](shows|crew_members|pending_syncs|pending_ingestions)["'`]\s*\)/;
  const MUTATION_RE = /\.(insert|update|delete)\(/;

  // Pre-existing M4/M5-era fixture-DML debt, frozen by the Codex R2 sweep
  // that broadened this guard from walker-only to the whole e2e tree.
  // These specs insert/delete whole fixture shows (and crew/pending rows)
  // through the PostgREST client; relocating them is an e2e fixture-
  // architecture change tracked as M12.12-DEF-3 in the affordance-matrix
  // DEFERRED doc. Codex R3 hardened the freeze from a skip-set to EXACT
  // per-file violation COUNTS, so exempt files are still scanned:
  //   - count GROWS → fail loudly (new debt inside an exempt file blocked);
  //   - count DROPS → fail with "shrink the entry" (cleanup must lower the
  //     pin in the same commit — the shrink-only signal);
  //   - non-exempt file with ANY hit → fails the main assertion as before.
  // rightNow.ts is deliberately NOT exempt: its date_restriction mutations
  // go through the locked psql helper. (schedule-tile.spec.ts held the same
  // property and was deleted 2026-08-09 as superseded — see the header note.)
  const EXEMPT_PREEXISTING = new Map<string, number>([
    ["admin-nav-layout-dimensions.spec.ts", 2],
    ["admin-parse-panel.spec.ts", 2],
    ["admin-route-boundaries.spec.ts", 2],
    // claimStamp.ts / seedShowWithCrew.ts / picker-flow.spec.ts write locked tables
    // (crew_members, shows) via the SERVICE-ROLE admin client (helpers/supabaseAdmin.ts)
    // — elevated test setup/cleanup that bypasses the PostgREST DML lockdown by design
    // (the lockdown REVOKEs from authenticated, not service_role). Frozen at their
    // current counts; these are seed/cleanup/claim-stamp writes, distinct from the
    // date_restriction locked-seed concern this pin guards.
    ["claimStamp.ts", 1],
    // seedShowWithCrew.ts: REPAIRED 2026-08-10 (M-wave 2 W-E2E, spec §2.4) — its three
    // locked-table writes (shows delete/insert, crew_members insert) moved into ONE
    // psql transaction holding the per-show advisory lock (the lockedCrewRestriction
    // pattern), so the exemption row is removed per the shrink-only contract.
    ["picker-flow.spec.ts", 1],
    // realtime-refresh (2026-07-19): the drivability probe + realtime e2e drive a
    // crew_members.role UPDATE via the SERVICE-ROLE admin client — the PINNED
    // broadcast stimulus (statement trigger + bump_last_changed_at fence; spec
    // §8.4). Same elevated-seed class as claimStamp/seedShowWithCrew above.
    ["_realtimeDrivabilityProbe.ts", 1],
    ["published-review-modal.realtime.spec.ts", 1],
    // closeFreshness (2026-07-20): renames the seeded show via a SERVICE-ROLE
    // admin-client shows.title UPDATE while the modal is open, to prove the
    // dashboard reconciles after a prefetched close. Same elevated-seed class
    // as realtime above (the lockdown REVOKEs from authenticated, not
    // service_role); a lifecycle action would call revalidatePath("/admin")
    // and mask the very reconcile the test asserts.
    ["published-review-modal.closeFreshness.spec.ts", 1],
    // crew-layout-dimensions.spec.ts: the unified show-day timeline (Today Mode A)
    // needs a high-confidence agenda for the seeded show day so the MERGED timeline
    // mounts. Its beforeAll seeds shows.agenda_links and afterAll restores it — 2
    // SERVICE-ROLE admin-client writes (seed + restore), the same by-design elevated
    // fixture pattern as above (the lockdown REVOKEs from authenticated, not
    // service_role), alongside the file's existing shows_internal.run_of_show seed
    // (shows_internal is not a locked table, so it is not counted here).
    ["crew-layout-dimensions.spec.ts", 2],
    // crew-page.spec.ts: the crew-redesign §4.9/§4.10/nav rewrite (Phase 4) replaced
    // the legacy today-band blocks that carried the 2 frozen locked-table fixture
    // writes with seeded-slug + signInAs flows that perform NO unlocked PostgREST
    // DML, so the count dropped to 0 and the (now-stale) exemption is removed.
    ["empty-state-reachability.spec.ts", 7],
    ["me-page.spec.ts", 8],
    ["needs-attention-page.spec.ts", 2],
    ["sign-in-page.spec.ts", 5],
  ]);

  const e2eDir = join(process.cwd(), "tests/e2e");

  function walkTsFiles(dir: string): Array<{ name: string; path: string }> {
    const out: Array<{ name: string; path: string }> = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkTsFiles(path));
        continue;
      }
      if (entry.name.endsWith(".ts")) out.push({ name: entry.name, path });
    }
    return out;
  }

  const files = walkTsFiles(e2eDir);

  function lockedTableMutationLines(source: string): number[] {
    const lines = source.split("\n");
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!LOCKED_TABLE_FROM_RE.test(lines[i] ?? "")) continue;
      const window = lines.slice(i, i + 6).join("\n");
      if (MUTATION_RE.test(window)) hits.push(i + 1);
    }
    return hits;
  }

  it("locked-table DML matches the frozen per-file counts everywhere under tests/e2e/ (0 for non-exempt files)", () => {
    for (const file of files) {
      const hits = lockedTableMutationLines(readFileSync(file.path, "utf8"));
      const expected = EXEMPT_PREEXISTING.get(file.name) ?? 0;
      if (hits.length === expected) continue;
      const where = hits.length ? ` (line(s) ${hits.join(", ")})` : "";
      const message =
        hits.length > expected
          ? `${file.name} has ${hits.length} locked-table mutation(s)${where} but only ${expected} are frozen — new e2e fixtures on locked tables must use the locked seed or helpers/lockedCrewRestriction.ts, not unlocked PostgREST writes`
          : `${file.name} now has ${hits.length} locked-table mutation(s)${where}, below its frozen count of ${expected} — shrink its EXEMPT_PREEXISTING entry (or remove it at 0) in the same commit`;
      expect.fail(message);
    }
  });

  it("every exemption entry maps to an existing file with a nonzero frozen count", () => {
    const names = new Set(files.map((f) => f.name));
    for (const [name, count] of EXEMPT_PREEXISTING) {
      expect(names.has(name), `${name} is exempt but no longer exists — remove its entry`).toBe(
        true,
      );
      expect(
        count,
        `${name} has a frozen count of ${count} — a zero/negative pin is a stale entry; remove it`,
      ).toBeGreaterThan(0);
    }
  });

  // Codex R4 — prove the scanner catches the non-double-quote literal
  // forms (the bypass vector the original "-only regex left open). These
  // fixture strings exercise lockedTableMutationLines directly; if the
  // matcher regresses to a single quote form, these fail.
  it("scanner catches single-quote, template-literal, and double-quote from() forms", () => {
    const singleQuote = `await admin.from('crew_members')\n  .update({ date_restriction: null })\n  .eq('id', x);`;
    const templateLiteral =
      "await admin.from(`pending_syncs`)\n  .delete()\n  .eq(`drive_file_id`, x);";
    const doubleQuote = `await admin.from("shows")\n  .insert({ slug: "x" });`;
    expect(lockedTableMutationLines(singleQuote)).toEqual([1]);
    expect(lockedTableMutationLines(templateLiteral)).toEqual([1]);
    expect(lockedTableMutationLines(doubleQuote)).toEqual([1]);
    // Reads stay unflagged regardless of quote form.
    expect(lockedTableMutationLines(`await admin.from('shows').select('id');`)).toEqual([]);
  });

  // M12.12-DEF-2 follow-up (Codex MEDIUM): the shared locked psql UPDATE
  // must stay scoped to the show whose advisory lock it holds — an id-only
  // WHERE would let a stale/cross-show crew id mutate a row the held lock
  // doesn't cover. Lexical pin; the behavioral proof is the helper's no-row
  // RETURNING guard (cross-show ids throw — verified by live psql smoke).
  it("all locked crew_members writes share ONE lock-held transaction, and every helper delegates to it", () => {
    // Arc C diff review R4, R5 (2), R6 — four P0s, every one of them a different
    // way a PER-HELPER copy of the transaction block can be wrong while a
    // lexical guard still passes:
    //
    //   R4:  a whole-file regex satisfied by the first helper, so the second
    //        inherited a proof it never earned.
    //   R5a: presence without ORDER — a lock moved below the UPDATE.
    //   R5b: case-sensitive discovery — an uppercase third helper never walked,
    //        while the "at least 2" floor was satisfied by the two that were.
    //   R6:  order without HELD-NESS — `commit;` between the lock and the
    //        UPDATE releases the lock, then the UPDATE runs unlocked.
    //
    // Recognizing a fourth paraphrase would have been the fourth round of the
    // same argument. The helper instead collapsed to ONE `runLockedCrewUpdate`
    // owning the entire begin/lock/update/returning/commit block, with each
    // exported helper supplying only a SET fragment. So this guard now pins that
    // single shape, and separately requires every exported helper to DELEGATE —
    // which is what makes the paraphrase question closed rather than endless:
    // there is no second copy of the shape to paraphrase.
    // Comments are STRIPPED before any of this runs. The helper's own header
    // discusses `begin;` and `commit;` in prose, and scanning the raw text found
    // that prose first — a use-versus-mention error that failed the guard on a
    // correct file. A doc comment describing the invariant must never be able to
    // satisfy or break the check for it.
    const lockedHelperPath = join(e2eDir, "helpers/lockedCrewRestriction.ts");
    const src = stripCommentsForFile(readFileSync(lockedHelperPath, "utf8"), lockedHelperPath);

    // Exactly one place writes the UPDATE at all.
    const updates = [...src.matchAll(/update\s+public\.crew_members/gi)];
    expect(updates.length, "crew_members UPDATE must exist in exactly ONE place").toBe(1);

    const lockRe =
      /pg_advisory_xact_lock\(hashtext\('show:' \|\| \$\{sqlString\(driveFileId\)\}\)\)/gi;
    const locks = [...src.matchAll(lockRe)];
    // Single-holder rule (invariant 2): zero is unlocked; two nested holders on
    // one hashkey deadlock under burst.
    expect(locks.length, "exactly one advisory-lock acquisition").toBe(1);

    const beginAt = src.search(/\bbegin;/i);
    const lockAt = locks[0]!.index!;
    const updateAt = updates[0]!.index!;
    // EVERY statement PostgreSQL documents as ending a transaction block, taken
    // from the grammar rather than from the ones a reviewer happened to name:
    //
    //   COMMIT   [WORK | TRANSACTION] [AND [NO] CHAIN]
    //   END      [WORK | TRANSACTION] [AND [NO] CHAIN]   (synonym for COMMIT)
    //   ROLLBACK [WORK | TRANSACTION] [AND [NO] CHAIN]
    //   ABORT    [WORK | TRANSACTION] [AND [NO] CHAIN]   (synonym for ROLLBACK)
    //   PREPARE TRANSACTION 'gid'
    //
    // Enumerated in one go deliberately. R8 added `commit transaction;` after
    // the bare `commit;` form let it through, and R9 then added `abort;` — one
    // synonym per round is the drip this project charges to the author, not the
    // reviewer. The set is closed because the grammar is documented and finite;
    // any of these between the lock and the UPDATE releases the lock and leaves
    // the UPDATE running unlocked.
    const TXN_END = /\b(commit|rollback|end|abort|prepare\s+transaction)\b[^;]*;/gi;
    const commitAt = src.search(/\b(commit|rollback|end|abort|prepare\s+transaction)\b[^;]*;/i);
    expect(beginAt, "the block must open a transaction").toBeGreaterThanOrEqual(0);
    expect(commitAt, "the block must commit").toBeGreaterThanOrEqual(0);
    expect(beginAt, "begin before the lock").toBeLessThan(lockAt);
    expect(lockAt, "lock before the UPDATE").toBeLessThan(updateAt);
    // R6's mutant: a commit BETWEEN the lock and the UPDATE ends the transaction
    // and releases the lock, so the UPDATE runs in a fresh implicit one. Taking
    // the lock before the update is not the same as holding it for the update.
    expect(updateAt, "the UPDATE must land inside the locked transaction").toBeLessThan(commitAt);
    expect(
      [...src.slice(lockAt, updateAt).matchAll(TXN_END)].length,
      "nothing may end the transaction between taking the lock and running the UPDATE",
    ).toBe(0);

    expect(
      src,
      "the UPDATE must be scoped to the locked show (an id-only WHERE lets a stale or cross-show crew id mutate a row the held lock does not cover)",
    ).toMatch(
      /update\s+public\.crew_members[\s\S]{0,400}?show_id = \(select id from public\.shows where drive_file_id = \$\{sqlString\(driveFileId\)\}\)/i,
    );
    expect(src, "a no-row match must throw, not pass quietly").toMatch(
      /returning id;[\s\S]*?if \(!stdout\.includes\(crewId\)\)[\s\S]*?throw new Error/i,
    );

    // Every EXPORTED helper delegates. Reconciled, not floored: a floor is
    // answered by the compliant helpers on behalf of the one that is not.
    const exported = src
      .split(/^export async function /m)
      .slice(1)
      .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf("(")), body: chunk }));
    const touching = exported.filter((f) => /crew_members|runLockedCrewUpdate/i.test(f.body));
    expect(
      touching.length,
      "no exported crew_members helper found — the walk parsed nothing, so it proved nothing",
    ).toBeGreaterThanOrEqual(2);
    for (const { name, body } of touching) {
      expect(body, `${name} must delegate to runLockedCrewUpdate`).toMatch(/runLockedCrewUpdate\(/);
      expect(
        /\b(begin|start\s+transaction|commit|rollback|end|abort|prepare\s+transaction)\b[^;]*;|pg_advisory_xact_lock|update\s+public\./i.test(
          body,
        ),
        `${name} must not write its own SQL — the transaction shape lives in exactly one place`,
      ).toBe(false);
    }
  });
});
