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

describe("walker is read-only on locked tables (structural pin)", () => {
  // Plan-wide invariant 2 tables. The walker (and the helper modules it can
  // reach) must never mutate them — fixture rows on locked tables come ONLY
  // from the locked seed (drive_file_id prefixed seed-fixture:). Concrete
  // failure mode caught: someone re-adds an unlocked locked-table fixture
  // write to the walker (the pre-Task-11 firstSeenStagedId delete/insert on
  // pending_syncs is the exact shape this pin forbids). Invariant 2's
  // dropped M9.5 auth table is deliberately omitted from the regex: the
  // M11.5 G3 cutover removed it (tests/db/cutover-drop-m9-5.test.ts pins
  // the absence), a write would fail at the catalog, and the cross-cutting
  // no-m9-5-surfaces sweep bans spelling its name here.
  const LOCKED_TABLE_FROM_RE =
    /from\(\s*"(shows|crew_members|pending_syncs|pending_ingestions)"\s*\)/;
  const MUTATION_RE = /\.(insert|update|delete)\(/;

  // Helper exemptions — EMPTY since M12.12-DEF-2 relocated rightNow.ts's
  // crew_members date_restriction toggle into a locked psql transaction
  // (per-show advisory lock, seedWalkerFixtures.ts pattern). Any future
  // entry must be a real, justified locked-table mutation; the stale-
  // exemption assertion below forces the set to shrink when cleaned up.
  const EXEMPT_HELPERS = new Set<string>([]);

  const helpersDir = join(process.cwd(), "tests/e2e/helpers");
  const files: Array<{ name: string; path: string }> = [
    {
      name: "deep-link-walker.spec.ts",
      path: join(process.cwd(), "tests/e2e/deep-link-walker.spec.ts"),
    },
    ...readdirSync(helpersDir).map((name) => ({ name, path: join(helpersDir, name) })),
  ];

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

  it("no .insert/.update/.delete within 5 lines of a locked-table from() in the walker or its helpers", () => {
    for (const file of files) {
      if (EXEMPT_HELPERS.has(file.name)) continue;
      const hits = lockedTableMutationLines(readFileSync(file.path, "utf8"));
      expect(
        hits,
        `${file.name} mutates a locked table near line(s) ${hits.join(", ")} — walker fixtures on locked tables must come from the seed, not test-time writes`,
      ).toEqual([]);
    }
  });

  it("every exemption still corresponds to a real locked-table mutation (no stale exemptions)", () => {
    for (const name of EXEMPT_HELPERS) {
      const hits = lockedTableMutationLines(readFileSync(join(helpersDir, name), "utf8"));
      expect(
        hits.length,
        `${name} no longer mutates a locked table — remove it from EXEMPT_HELPERS`,
      ).toBeGreaterThan(0);
    }
  });

  // M12.12-DEF-2 follow-up (Codex MEDIUM): rightNow.ts's locked psql UPDATE
  // must stay scoped to the show whose advisory lock it holds — an id-only
  // WHERE would let a stale/cross-show crew id mutate a row the held lock
  // doesn't cover. Lexical pin; the behavioral proof is the helper's no-row
  // RETURNING guard (cross-show ids throw — verified by live psql smoke).
  it("rightNow.ts scopes its crew_members UPDATE to the advisory-locked show", () => {
    const src = readFileSync(join(helpersDir, "rightNow.ts"), "utf8");
    expect(src).toMatch(
      /update public\.crew_members[\s\S]{0,400}?show_id = \(select id from public\.shows where drive_file_id = \$\{sqlString\(SEED_DRIVE_FILE_ID\)\}\)/,
    );
  });
});
