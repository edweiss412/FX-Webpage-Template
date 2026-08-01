// Invariant-8 closeout guard: every plans-tree unit that declares the
// impeccable dual gate (invariant 8) carries a machine-checkable closeout
// marker line, or a frozen pre-guard debt row. Restores — soundly — the
// assertion removed in a20b94457 ("descope the ledger guard to what it can
// enforce truthfully"): discovery is a filesystem walk over every unit shape
// (flat, nested, category subdirs, closeout-attach), not top-level plan.md
// dirs, and acceptance is the §3.3 grammar, not a substring scan.
//
// Spec: docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md
// (canonical; spec r3 APPROVE). Honest ceiling per spec §7: green means every
// declaring unit CARRIES a well-formed claim or a debt row — never that the
// gate actually ran. Plants here cover families M4-M6 (registry-coupled);
// M1-M3/M7/M8 live in _invariant8Closeout.walker.test.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  declaresGate,
  parseMarkers,
  partitionUnits,
  unitVerdict,
  walkPlansTree,
} from "./_invariant8Closeout";
import {
  MARKER_TEMPLATE_FILES,
  PRE_GUARD_DEBT,
  UNDATED_DECLARING_ALLOWLIST,
} from "./invariant8/preGuardDebt";

const PLANS_ROOT = join(process.cwd(), "docs/superpowers/plans");

interface UnitData {
  files: Map<string, string>;
  declares: boolean;
  verdict: ReturnType<typeof unitVerdict>;
}

interface TreeData {
  units: Map<string, UnitData>;
  undated: Map<string, string>;
}

function loadTree(): TreeData {
  const paths = walkPlansTree(PLANS_ROOT);
  const { units, undated } = partitionUnits(paths);
  const data = new Map<string, UnitData>();
  for (const [key, members] of units) {
    const files = new Map<string, string>(
      members.map((rel) => [rel, readFileSync(join(PLANS_ROOT, rel), "utf8")] as const),
    );
    data.set(key, {
      files,
      declares: declaresGate(files),
      verdict: unitVerdict(files, { templateFiles: MARKER_TEMPLATE_FILES }),
    });
  }
  const undatedTexts = new Map<string, string>(
    undated.map((rel) => [rel, readFileSync(join(PLANS_ROOT, rel), "utf8")] as const),
  );
  return { units: data, undated: undatedTexts };
}

// ---- assertion evaluators (pure over TreeData + registries, so the M4-M6
// plants below exercise EXACTLY the logic the live assertions run) ----

/** §4.1.1 — declaring units conform or carry a debt row. */
function conformanceViolations(tree: TreeData, debt: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const [key, u] of tree.units) {
    if (!u.declares) continue;
    if (u.verdict === "conforms" || debt.has(key)) continue;
    out.push(
      `${key}: declares the invariant-8 dual gate but carries no valid impeccable-gate marker line — add the marker (spec §3.3) or, for pre-guard history only, a PRE_GUARD_DEBT row with a PR-body reason`,
    );
  }
  return out.sort();
}

/** §4.1.2 — no malformed marker line anywhere (units AND undated files). */
function malformedViolations(tree: TreeData, templateFiles: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const u of tree.units.values()) {
    for (const [rel, text] of u.files) {
      const parsed = parseMarkers(text, { template: templateFiles.has(rel) });
      for (const line of parsed.malformed) out.push(`${rel}: malformed marker line: ${line}`);
    }
  }
  for (const [rel, text] of tree.undated) {
    const parsed = parseMarkers(text, { template: templateFiles.has(rel) });
    for (const line of parsed.malformed) out.push(`${rel}: malformed marker line: ${line}`);
  }
  return out.sort();
}

/** §4.1.3 — debt rows red when vanished, non-declaring, or now-conforming. */
function debtStalenessViolations(tree: TreeData, debt: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const key of debt) {
    const u = tree.units.get(key);
    if (u === undefined) out.push(`${key}: PRE_GUARD_DEBT row for a unit that no longer exists — delete the row`);
    else if (!u.declares) out.push(`${key}: PRE_GUARD_DEBT row but the unit no longer declares the gate — delete the row`);
    else if (u.verdict === "conforms") out.push(`${key}: PRE_GUARD_DEBT row but the unit now conforms via a marker — delete the row`);
  }
  return out.sort();
}

/** §4.1.4 — undated declaring files are allowlisted; allowlist rows stay live. */
function undatedViolations(tree: TreeData, allowlist: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const [rel, text] of tree.undated) {
    const declares = declaresGate(new Map([[rel, text]]));
    if (declares && !allowlist.has(rel)) {
      out.push(`${rel}: undated file declares both gate halves but is not in UNDATED_DECLARING_ALLOWLIST`);
    }
  }
  for (const rel of allowlist) {
    const text = tree.undated.get(rel);
    if (text === undefined) out.push(`${rel}: allowlist row for a missing undated file — delete the row`);
    else if (!declaresGate(new Map([[rel, text]]))) out.push(`${rel}: allowlist row but the file no longer declares — delete the row`);
  }
  return out.sort();
}

/** §4.1.6 — template files exist, carry the TEMPLATE form, and no valid/malformed markers. */
function templateFileViolations(tree: TreeData, templateFiles: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const rel of templateFiles) {
    let text: string | undefined = tree.undated.get(rel);
    if (text === undefined) {
      for (const u of tree.units.values()) {
        const found = u.files.get(rel);
        if (found !== undefined) {
          text = found;
          break;
        }
      }
    }
    if (text === undefined) {
      out.push(`${rel}: MARKER_TEMPLATE_FILES row for a missing file — delete the row`);
      continue;
    }
    const parsed = parseMarkers(text, { template: true });
    if (parsed.template === 0) out.push(`${rel}: template file carries no TEMPLATE-form marker line`);
    if (parsed.valid.length > 0 || parsed.malformed.length > 0) {
      out.push(`${rel}: template file carries a valid or malformed marker (only the TEMPLATE form is allowed here)`);
    }
  }
  return out.sort();
}

// ---- live assertions (§4.1) ----

const tree = loadTree();

describe("invariant-8 closeout guard — live tree", () => {
  it("§4.1.1 every declaring unit conforms or carries a PRE_GUARD_DEBT row", () => {
    expect(conformanceViolations(tree, PRE_GUARD_DEBT)).toEqual([]);
  });

  it("§4.1.2 no malformed marker line anywhere in the plans tree", () => {
    expect(malformedViolations(tree, MARKER_TEMPLATE_FILES)).toEqual([]);
  });

  it("§4.1.3 no stale PRE_GUARD_DEBT row", () => {
    expect(debtStalenessViolations(tree, PRE_GUARD_DEBT)).toEqual([]);
  });

  it("§4.1.4 undated declaring files are allowlisted and the allowlist is live", () => {
    expect(undatedViolations(tree, UNDATED_DECLARING_ALLOWLIST)).toEqual([]);
  });

  it("§4.1.5 the four shape canaries are units of the live walk", () => {
    for (const canary of [
      "2026-07-18-alert-copy-full-sweep.md",
      "admin/2026-06-22-validation-reset-button.md",
      "v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
      "2026-04-30-fxav-crew-pages-v1",
    ]) {
      expect(tree.units.has(canary), `canary missing from walk: ${canary}`).toBe(true);
    }
  });

  it("§4.1.6 template files carry the TEMPLATE form and nothing stronger", () => {
    expect(templateFileViolations(tree, MARKER_TEMPLATE_FILES)).toEqual([]);
  });
});

// ---- plants: M4-M6 (fixture TreeData through the SAME evaluators) ----

const DECLARING = "run /impeccable critique then /impeccable audit";
const VALID_NA = "impeccable-gate: N/A — no UI surface";
const NONE: ReadonlySet<string> = new Set();

function fixtureUnit(key: string, text: string): [string, UnitData] {
  const files = new Map([[key, text]]);
  return [key, { files, declares: declaresGate(files), verdict: unitVerdict(files, { templateFiles: NONE }) }];
}

describe("plants — registry-coupled families (M4-M6)", () => {
  it("M4a: a debt row whose unit vanished is a violation", () => {
    const t: TreeData = { units: new Map(), undated: new Map() };
    expect(debtStalenessViolations(t, new Set(["2026-01-01-ghost.md"]))).toHaveLength(1);
  });

  it("M4b: a debt row whose unit stopped declaring is a violation", () => {
    const t: TreeData = { units: new Map([fixtureUnit("2026-01-01-quiet.md", "no gate here")]), undated: new Map() };
    expect(debtStalenessViolations(t, new Set(["2026-01-01-quiet.md"]))).toHaveLength(1);
  });

  it("M4c: a debt row whose unit now conforms is a violation", () => {
    const t: TreeData = {
      units: new Map([fixtureUnit("2026-01-01-done.md", `${DECLARING}\n${VALID_NA}`)]),
      undated: new Map(),
    };
    expect(debtStalenessViolations(t, new Set(["2026-01-01-done.md"]))).toHaveLength(1);
  });

  it("M5: a declaring unit with no marker and no row reds, naming both remedies", () => {
    const t: TreeData = { units: new Map([fixtureUnit("2026-01-01-new.md", DECLARING)]), undated: new Map() };
    const violations = conformanceViolations(t, new Set());
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("marker");
    expect(violations[0]).toContain("PRE_GUARD_DEBT");
  });

  it("M5 control: the same unit with a marker (or a row) passes", () => {
    const conforming: TreeData = {
      units: new Map([fixtureUnit("2026-01-01-new.md", `${DECLARING}\n${VALID_NA}`)]),
      undated: new Map(),
    };
    expect(conformanceViolations(conforming, new Set())).toEqual([]);
    const ledgered: TreeData = { units: new Map([fixtureUnit("2026-01-01-new.md", DECLARING)]), undated: new Map() };
    expect(conformanceViolations(ledgered, new Set(["2026-01-01-new.md"]))).toEqual([]);
  });

  it("M6: an undated declaring file outside the allowlist reds; allowlisted passes", () => {
    const t: TreeData = { units: new Map(), undated: new Map([["INDEX.md", DECLARING]]) };
    expect(undatedViolations(t, new Set())).toHaveLength(1);
    expect(undatedViolations(t, new Set(["INDEX.md"]))).toEqual([]);
  });

  it("M8-live: template-file assertion reds on missing file, missing TEMPLATE form, and valid marker", () => {
    const tpl: ReadonlySet<string> = new Set(["TPL.md"]);
    const missing: TreeData = { units: new Map(), undated: new Map() };
    expect(templateFileViolations(missing, tpl)).toHaveLength(1);
    const noForm: TreeData = { units: new Map(), undated: new Map([["TPL.md", "prose only"]]) };
    expect(templateFileViolations(noForm, tpl)).toHaveLength(1);
    const withValid: TreeData = {
      units: new Map(),
      undated: new Map([
        [
          "TPL.md",
          "impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>\nimpeccable-gate: N/A — no UI surface",
        ],
      ]),
    };
    expect(templateFileViolations(withValid, tpl)).toHaveLength(1);
    const clean: TreeData = {
      units: new Map(),
      undated: new Map([
        [
          "TPL.md",
          "impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>",
        ],
      ]),
    };
    expect(templateFileViolations(clean, tpl)).toEqual([]);
  });

  it("M6 staleness: allowlist rows for missing or non-declaring files red", () => {
    const t: TreeData = { units: new Map(), undated: new Map([["quiet.md", "nothing"]]) };
    expect(undatedViolations(t, new Set(["gone.md"]))).toHaveLength(1);
    expect(undatedViolations(t, new Set(["quiet.md"]))).toHaveLength(1);
  });
});
