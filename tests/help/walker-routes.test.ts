import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(allWalkableRows).toHaveLength(concrete.length - 2); // minus the two DEFERRED_TESTIDS
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
  // toggle; the schedule-tile copy of that toggle (Codex R2 HIGH).
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
  // rightNow.ts and schedule-tile.spec.ts are deliberately NOT exempt:
  // their date_restriction mutations go through the locked psql helper.
  const EXEMPT_PREEXISTING = new Map<string, number>([
    ["admin-nav-layout-dimensions.spec.ts", 2],
    ["admin-parse-panel.spec.ts", 2],
    ["admin-route-boundaries.spec.ts", 2],
    ["crew-page.spec.ts", 2],
    ["empty-state-reachability.spec.ts", 7],
    ["empty-state.spec.ts", 2],
    ["me-page.spec.ts", 8],
    ["needs-attention-page.spec.ts", 2],
    ["notes-tile.spec.ts", 5],
    ["pack-list.spec.ts", 9],
    ["right-now.spec.ts", 1],
    ["sign-in-page.spec.ts", 5],
    ["transport-tile.spec.ts", 2],
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
  it("lockedCrewRestriction.ts scopes its crew_members UPDATE to the advisory-locked show", () => {
    const src = readFileSync(join(e2eDir, "helpers/lockedCrewRestriction.ts"), "utf8");
    expect(src).toMatch(
      /update public\.crew_members[\s\S]{0,400}?show_id = \(select id from public\.shows where drive_file_id = \$\{sqlString\(driveFileId\)\}\)/,
    );
  });
});
