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
  const LOCKED_TABLE_FROM_RE =
    /from\(\s*"(shows|crew_members|pending_syncs|pending_ingestions)"\s*\)/;
  const MUTATION_RE = /\.(insert|update|delete)\(/;

  // Pre-existing M4/M5-era fixture-DML debt, frozen by the Codex R2 sweep
  // that broadened this guard from walker-only to the whole e2e tree.
  // These specs insert/delete whole fixture shows (and crew/pending rows)
  // through the PostgREST client; relocating them is an e2e fixture-
  // architecture change tracked as M12.12-DEF-3 in the affordance-matrix
  // DEFERRED doc. The list is SHRINK-ONLY: the stale-exemption assertion
  // below fails when a file is cleaned up (forcing its removal here), and
  // any NEW file with locked-table DML fails the main assertion — the debt
  // cannot grow. rightNow.ts and schedule-tile.spec.ts are deliberately
  // NOT exempt: their date_restriction mutations now go through the locked
  // psql helper.
  const EXEMPT_PREEXISTING = new Set<string>([
    "admin-nav-layout-dimensions.spec.ts",
    "admin-parse-panel.spec.ts",
    "admin-route-boundaries.spec.ts",
    "crew-page.spec.ts",
    "empty-state-reachability.spec.ts",
    "empty-state.spec.ts",
    "me-page.spec.ts",
    "needs-attention-page.spec.ts",
    "notes-tile.spec.ts",
    "pack-list.spec.ts",
    "right-now.spec.ts",
    "sign-in-page.spec.ts",
    "transport-tile.spec.ts",
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

  it("no .insert/.update/.delete within 5 lines of a locked-table from() anywhere under tests/e2e/", () => {
    for (const file of files) {
      if (EXEMPT_PREEXISTING.has(file.name)) continue;
      const hits = lockedTableMutationLines(readFileSync(file.path, "utf8"));
      expect(
        hits,
        `${file.name} mutates a locked table near line(s) ${hits.join(", ")} — e2e fixtures on locked tables must come from the locked seed or helpers/lockedCrewRestriction.ts, not unlocked PostgREST writes`,
      ).toEqual([]);
    }
  });

  it("every exemption still corresponds to a real locked-table mutation (no stale exemptions)", () => {
    const byName = new Map(files.map((f) => [f.name, f.path]));
    for (const name of EXEMPT_PREEXISTING) {
      const path = byName.get(name);
      expect(path, `${name} is exempt but no longer exists — remove it`).toBeDefined();
      const hits = lockedTableMutationLines(readFileSync(path!, "utf8"));
      expect(
        hits.length,
        `${name} no longer mutates a locked table — remove it from EXEMPT_PREEXISTING`,
      ).toBeGreaterThan(0);
    }
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
