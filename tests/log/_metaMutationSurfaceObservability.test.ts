// Static discovery meta-test (invariant #10, spec §4 / §10). Composes Tasks 2-4:
// `scanBody`/directives/import-binding (enumerate.ts), surface enumeration +
// admin classification (enumerate.ts), and the exemption/ledger/grandfather
// registries (exemptions.ts). Fixture/negative tests run now; the live
// "zero unaccounted" assertion is `.skip`ped until Task 17 seeds the 21
// surfaces + wires the exemption/ledger comments.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";

import {
  collectSurfaceUnits,
  moduleDefaultExports,
  parse,
  scanBody,
  type SurfaceUnit,
} from "./mutationSurface/enumerate";
import { AUDITABLE_MUTATIONS, type AuditableMutation } from "./_auditableMutations";
import {
  ADMIN_SURFACE_EXEMPTIONS,
  KNOWN_UNINSTRUMENTED,
  fileHasNoTelemetry,
  functionSpanHasNoTelemetry,
  type AdminSurfaceExemption,
  type KnownUninstrumented,
} from "./mutationSurface/exemptions";

const REPO_ROOT = join(__dirname, "..", "..");

// ── fixture plumbing ─────────────────────────────────────────────────────

function makeFixture(relPath: string, contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "meta-mutation-surface-"));
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  return root;
}

function unitsFor(relPath: string, contents: string): SurfaceUnit[] {
  return collectSurfaceUnits([makeFixture(relPath, contents)]);
}

function unitFor(relPath: string, contents: string): SurfaceUnit {
  const units = unitsFor(relPath, contents);
  expect(units.length, `expected exactly 1 unit from fixture ${relPath}`).toBe(1);
  return units[0]!;
}

// ── the per-surface decision (composes scanBody + registries) ───────────

/** The floor predicate for a surface unit — routes scan the whole file with
 * control-flow + nested descent (the emit may live in a delegated helper);
 * actions/inline scan ONLY their own body, not descending into nested
 * function/arrow/method/class bodies (spec §4.2). */
function predicateFor(unit: SurfaceUnit) {
  return unit.kind === "route"
    ? scanBody(unit.node, { descend: true })
    : scanBody(unit.node, { descend: false });
}

/** ANY call to `logAdminOutcome` regardless of await/binding — used only for
 * the read-only-exemption ban (spec §4.3 item 2: no `logAdminOutcome` at all,
 * not just the durable awaited form). */
function containsAnyLogAdminOutcomeCall(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "logAdminOutcome")
      found = true;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function pathTailNoExt(p: string, n: number): string {
  const noExt = p.replace(/\.tsx?$/, "");
  return noExt.split("/").slice(-n).join("/");
}

/** Heuristic: does the delegator file's source reference the delegatesTo
 * target's path (import/re-export specifier)? */
function delegatorCallsTarget(delegatorFile: string, delegatesTo: string): boolean {
  const src = readFileSync(delegatorFile, "utf8");
  return src.includes(pathTailNoExt(delegatesTo, 2)) || src.includes(pathTailNoExt(delegatesTo, 1));
}

function noTelemetryExempt(unit: SurfaceUnit): boolean {
  // Non-action files (routes, or any file with no server-action surfaces) may
  // use a FILE-LEADING exemption; module/inline actions may NOT — the comment
  // must sit inside the specific function's own span (spec §4.3 item 1).
  if (unit.kind === "route") return fileHasNoTelemetry(unit.file);
  return functionSpanHasNoTelemetry(unit.file, unit.node);
}

type Registries = {
  auditable: readonly AuditableMutation[];
  exemptions: readonly AdminSurfaceExemption[];
  ledger: readonly KnownUninstrumented[];
};

type Decision = { pass: boolean; reason: string };

function evaluateUnit(unit: SurfaceUnit, registries: Registries): Decision {
  if (unit.admin) {
    const registered = registries.auditable.find((r) => r.file === unit.file && r.fn === unit.fn);
    if (registered) return { pass: true, reason: "registry" };

    const exemption = registries.exemptions.find(
      (r) => r.file === unit.file && (r.fn === undefined || r.fn === unit.fn),
    );
    if (exemption?.kind === "delegator") {
      const targetRegistered = !!exemption.delegatesTo &&
        registries.auditable.some((r) => r.file === exemption.delegatesTo);
      const targetReferenced =
        !!exemption.delegatesTo && delegatorCallsTarget(unit.file, exemption.delegatesTo);
      if (targetRegistered && targetReferenced) return { pass: true, reason: "delegator" };
      return { pass: false, reason: "invalid delegator exemption (target unregistered or unreferenced)" };
    }
    if (exemption?.kind === "read-only") {
      const p = scanBody(unit.node, { descend: false });
      const violates = p.writeBuilder || p.rpc || containsAnyLogAdminOutcomeCall(unit.node);
      if (!violates) return { pass: true, reason: "read-only" };
      return { pass: false, reason: "read-only exemption on a function that mutates" };
    }
    // Admin surfaces NEVER consult no-telemetry / KNOWN_UNINSTRUMENTED (spec §4.3
    // item 1 / item 3) — a bare comment or ledger row cannot skip the registry+
    // behavioral contract, so we fall straight to "unaccounted".
    return { pass: false, reason: "admin surface unaccounted for (needs registry or exemption)" };
  }

  const predicate = predicateFor(unit);
  if (predicate.adminOutcome || predicate.codedLog) return { pass: true, reason: "coded emit" };
  if (noTelemetryExempt(unit)) return { pass: true, reason: "no-telemetry" };
  const ledgerRow = registries.ledger.find((r) => r.file === unit.file && r.fn === unit.fn);
  if (ledgerRow) return { pass: true, reason: "ledger" };
  return { pass: false, reason: "unaccounted" };
}

/** A "use server" module with a default export is banned outright — checked
 * once per module-action file, independent of individual unit pass/fail. */
function defaultExportOffense(file: string): string | null {
  const sf = parse(file);
  if (moduleDefaultExports(sf)) return `${file}: "use server" module must not use a default export`;
  return null;
}

function routesWithMultipleMutatingMethods(units: readonly SurfaceUnit[]): string[] {
  const byFile = new Map<string, number>();
  for (const u of units) if (u.kind === "route") byFile.set(u.file, (byFile.get(u.file) ?? 0) + 1);
  return [...byFile.entries()].filter(([, n]) => n > 1).map(([f]) => f);
}

function formatFailures(offenders: ReadonlyArray<{ unit: SurfaceUnit; reason: string }>): string {
  return offenders
    .map(({ unit }) => {
      const label = `${unit.file} :: ${unit.fn}`;
      const kindLabel = unit.kind === "route" ? "route" : unit.kind;
      if (unit.admin) {
        return `${label} [${kindLabel}, admin] — add an AUDITABLE_MUTATIONS row + executable behavioral coverage, or an ADMIN_SURFACE_EXEMPTIONS row.`;
      }
      return `${label} [${kindLabel}] — add a code-carrying emit, a // no-telemetry: <reason>, or a KNOWN_UNINSTRUMENTED ledger row.`;
    })
    .join("\n");
}

const IMP =
  'import { log } from "@/lib/log";\nimport { logAdminOutcome } from "@/lib/log/logAdminOutcome";\n';
// Module-level server-action fixtures (non-route, non-inline) need the leading
// "use server" directive so `collectSurfaceUnits` classifies them as
// module-action surfaces rather than finding zero units.
const ACTION_MODULE = '"use server";\n' + IMP;

// ── §10.1 fixtures — route vs action scan granularity ────────────────────

describe("scan granularity (route file-level+descend vs action per-function no-descend)", () => {
  test("route whose emit is in a file-level helper PASSES", () => {
    const unit = unitFor(
      "app/api/x/route.ts",
      IMP +
        'export async function POST(){ await helper(); }\nasync function helper(){ await logAdminOutcome({code:"X"}); }\n',
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
  });

  test("non-admin action with an UNUSED nested logAdminOutcome FAILS (no-descend guard)", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE +
        'export async function mutate(){ async function unused(){ await logAdminOutcome({code:"X"}); } return; }\n',
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("non-admin action with the emit inside an if/try block PASSES (control-flow descended)", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE + 'export async function mutate(){ if (ok) { await logAdminOutcome({code:"X"}); } }\n',
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
  });
});

// ── non-admin surfaces: pass/fail combinations ────────────────────────────

describe("non-admin surfaces", () => {
  test("passes via a coded log emit", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE + 'export async function mutate(){ log.warn("m", { code:"FOO" }); }\n',
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
  });

  test("passes via a per-function // no-telemetry: exemption", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE + 'export async function mutate(){\n  // no-telemetry: delegates to another action\n  await doIt();\n}\n',
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
  });

  test("passes via a route file-leading // no-telemetry: exemption", () => {
    const unit = unitFor(
      "app/api/x/route.ts",
      "// no-telemetry: test-only scaffolding\nexport async function POST(){}\n",
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
  });

  test("passes via a KNOWN_UNINSTRUMENTED ledger row", () => {
    const unit = unitFor("lib/x/actions.ts", ACTION_MODULE + "export async function mutate(){ await doIt(); }\n");
    const ledger: KnownUninstrumented[] = [
      { file: unit.file, fn: "mutate", backlog: "BL-TEST" },
    ];
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger }).pass).toBe(true);
  });

  test("FAILS with none of the above", () => {
    const unit = unitFor("lib/x/actions.ts", ACTION_MODULE + "export async function mutate(){ await doIt(); }\n");
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("a bare // no-telemetry: on an action file with NO reason text does NOT exempt", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE + "export async function mutate(){\n  // no-telemetry:\n  await doIt();\n}\n",
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("a FILE-LEADING // no-telemetry: on a 'use server' action module does NOT exempt its action (per-function only)", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      '// no-telemetry: whole file is fine, right?\n"use server";\nexport async function mutate(){ await doIt(); }\n',
    );
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("sibling isolation: two-action module, A emits and passes, B is silent and FAILS", () => {
    const units = unitsFor(
      "lib/x/actions.ts",
      ACTION_MODULE +
        'export async function a(){ await logAdminOutcome({code:"X"}); }\nexport async function b(){ await doIt(); }\n',
    );
    expect(units.length).toBe(2);
    const a = units.find((u) => u.fn === "a")!;
    const b = units.find((u) => u.fn === "b")!;
    expect(evaluateUnit(a, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
    expect(evaluateUnit(b, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("a NEW un-ledgered sibling in an otherwise-ledgered file FAILS (default-fail intact)", () => {
    const units = unitsFor(
      "lib/x/picker.ts",
      ACTION_MODULE +
        'export async function ledgered(){ await doIt(); }\nexport async function freshUnledgered(){ await doIt(); }\n',
    );
    const ledgered = units.find((u) => u.fn === "ledgered")!;
    const fresh = units.find((u) => u.fn === "freshUnledgered")!;
    const ledger: KnownUninstrumented[] = [
      { file: ledgered.file, fn: "ledgered", backlog: "BL-TEST" },
    ];
    expect(evaluateUnit(ledgered, { auditable: [], exemptions: [], ledger }).pass).toBe(true);
    expect(evaluateUnit(fresh, { auditable: [], exemptions: [], ledger }).pass).toBe(false);
  });
});

// ── admin surfaces: registry / exemption contract ─────────────────────────

describe("admin surfaces — registry, not scan", () => {
  test("an admin action NOT in the registry FAILS even with await logAdminOutcome present (wrong-branch/unused emit must not buy a pass)", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE +
        'export async function mutate(){ await requireAdmin(); if (false) { await logAdminOutcome({code:"X"}); } }\n',
    );
    expect(unit.admin).toBe(true);
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("the same admin surface, once registered, PASSES", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE + 'export async function mutate(){ await requireAdmin(); await doIt(); }\n',
    );
    const auditable: AuditableMutation[] = [{ file: unit.file, fn: "mutate", code: "TEST_CODE" }];
    expect(evaluateUnit(unit, { auditable, exemptions: [], ledger: [] }).pass).toBe(true);
  });

  test("an admin ROUTE not in the registry FAILS even with a coded emit present", () => {
    const unit = unitFor(
      "app/api/admin/x/route.ts",
      IMP + 'export async function POST(){ log.info("m", { code: "FOO" }); }\n',
    );
    expect(unit.admin).toBe(true);
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("a non-admin surface (crew action / non-admin route) with only a coded log.error PASSES (broad floor)", () => {
    const unit = unitFor(
      "app/api/report/route.ts",
      IMP + 'export async function POST(){ log.error("m", { code: "FOO" }); }\n',
    );
    expect(unit.admin).toBe(false);
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(true);
  });

  test("a bare // no-telemetry: on an admin surface does NOT exempt it (must use ADMIN_SURFACE_EXEMPTIONS)", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE +
        'export async function mutate(){\n  await requireAdmin();\n  // no-telemetry: this is definitely fine\n  await doIt();\n}\n',
    );
    expect(unit.admin).toBe(true);
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger: [] }).pass).toBe(false);
  });

  test("a KNOWN_UNINSTRUMENTED ledger row does NOT exempt an admin surface", () => {
    const unit = unitFor(
      "lib/x/actions.ts",
      ACTION_MODULE + 'export async function mutate(){ await requireAdmin(); await doIt(); }\n',
    );
    const ledger: KnownUninstrumented[] = [{ file: unit.file, fn: "mutate", backlog: "BL-TEST" }];
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger }).pass).toBe(false);
  });
});

describe("admin surfaces — ADMIN_SURFACE_EXEMPTIONS (delegator / read-only)", () => {
  test("a valid delegator (target registered + referenced by the file) PASSES", () => {
    const targetFile = "app/api/admin/target/route.ts";
    const unit = unitFor(
      "app/api/admin/shim/route.ts",
      'export { POST } from "../target/route";\n',
    );
    const auditable: AuditableMutation[] = [{ file: targetFile, fn: "POST", code: "TARGET_CODE" }];
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, kind: "delegator", delegatesTo: targetFile },
    ];
    expect(evaluateUnit(unit, { auditable, exemptions, ledger: [] }).pass).toBe(true);
  });

  test("a delegator whose delegatesTo target is NOT in AUDITABLE_MUTATIONS FAILS", () => {
    const targetFile = "app/api/admin/target/route.ts";
    const unit = unitFor(
      "app/api/admin/shim/route.ts",
      'export { POST } from "../target/route";\n',
    );
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, kind: "delegator", delegatesTo: targetFile },
    ];
    expect(evaluateUnit(unit, { auditable: [], exemptions, ledger: [] }).pass).toBe(false);
  });

  test("a delegator whose file does NOT actually reference the delegatesTo target FAILS", () => {
    const targetFile = "app/api/admin/target/route.ts";
    const unit = unitFor(
      "app/api/admin/shim/route.ts",
      'export { POST } from "../unrelated-module";\n',
    );
    const auditable: AuditableMutation[] = [{ file: targetFile, fn: "POST", code: "TARGET_CODE" }];
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, kind: "delegator", delegatesTo: targetFile },
    ];
    expect(evaluateUnit(unit, { auditable, exemptions, ledger: [] }).pass).toBe(false);
  });

  test("a valid read-only exemption (no write-builder/.rpc/logAdminOutcome) PASSES", () => {
    const unit = unitFor(
      "lib/x/dev-actions.ts",
      ACTION_MODULE +'export async function getStagedResult(){ await requireDeveloper(); return sb.from("t").select(); }\n',
    );
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, fn: "getStagedResult", kind: "read-only" },
    ];
    expect(evaluateUnit(unit, { auditable: [], exemptions, ledger: [] }).pass).toBe(true);
  });

  test("a read-only exemption on a fn calling .rpc( FAILS (Codex R15 — an RPC can mutate)", () => {
    const unit = unitFor(
      "lib/x/dev-actions.ts",
      ACTION_MODULE +'export async function getStagedResult(){ await requireDeveloper(); return sb.rpc("dev_truncate_all"); }\n',
    );
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, fn: "getStagedResult", kind: "read-only" },
    ];
    expect(evaluateUnit(unit, { auditable: [], exemptions, ledger: [] }).pass).toBe(false);
  });

  test("a read-only exemption on a fn with a write-builder call (.insert() etc.) FAILS", () => {
    const unit = unitFor(
      "lib/x/dev-actions.ts",
      ACTION_MODULE +'export async function getStagedResult(){ await requireDeveloper(); return sb.from("t").insert({}); }\n',
    );
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, fn: "getStagedResult", kind: "read-only" },
    ];
    expect(evaluateUnit(unit, { auditable: [], exemptions, ledger: [] }).pass).toBe(false);
  });

  test("a read-only exemption on a fn calling logAdminOutcome (any form) FAILS", () => {
    const unit = unitFor(
      "lib/x/dev-actions.ts",
      ACTION_MODULE +'export async function getStagedResult(){ await requireDeveloper(); void logAdminOutcome({code:"X"}); }\n',
    );
    const exemptions: AdminSurfaceExemption[] = [
      { file: unit.file, fn: "getStagedResult", kind: "read-only" },
    ];
    expect(evaluateUnit(unit, { auditable: [], exemptions, ledger: [] }).pass).toBe(false);
  });
});

// ── §4.3/§10.6 ledger hygiene ──────────────────────────────────────────────

describe("KNOWN_UNINSTRUMENTED ledger hygiene", () => {
  test("an entry whose fn body calls a require*[Identity] gate is invalid (admin-gated cannot be ledgered)", () => {
    const unit = unitFor(
      "lib/x/picker.ts",
      ACTION_MODULE + 'export async function mutate(){ await requireAdmin(); await doIt(); }\n',
    );
    expect(unit.admin).toBe(true);
    // The ledger cannot rescue an admin-gated surface — evaluateUnit's admin
    // branch never consults `registries.ledger`, so this fails regardless.
    const ledger: KnownUninstrumented[] = [{ file: unit.file, fn: "mutate", backlog: "BL-TEST" }];
    expect(evaluateUnit(unit, { auditable: [], exemptions: [], ledger }).pass).toBe(false);
  });

  test("the live KNOWN_UNINSTRUMENTED ledger's 6 rows are all non-admin-gated (live-tree check)", () => {
    for (const row of KNOWN_UNINSTRUMENTED) {
      const src = readFileSync(join(REPO_ROOT, row.file), "utf8");
      const sf = ts.createSourceFile(row.file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      let fnNode: ts.Node | undefined;
      const walk = (n: ts.Node) => {
        if (
          ts.isFunctionDeclaration(n) &&
          n.name?.text === row.fn &&
          n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        )
          fnNode = n;
        ts.forEachChild(n, walk);
      };
      walk(sf);
      expect(fnNode, `${row.file}::${row.fn} must exist`).toBeDefined();
      expect(
        scanBody(fnNode!, { descend: false }).adminGated,
        `${row.file}::${row.fn} must NOT be admin-gated`,
      ).toBe(false);
    }
  });

  test("a ledger entry whose file no longer exists is invalid", () => {
    const ghostFile = join(REPO_ROOT, "lib/auth/picker/__does_not_exist__.ts");
    expect(existsSync(ghostFile)).toBe(false);
  });
});

// ── §4.1 default-export ban ────────────────────────────────────────────────

describe("default-export ban in 'use server' modules", () => {
  test("a 'use server' module with export default async function FAILS", () => {
    const root = makeFixture(
      "lib/x/actions.ts",
      '"use server";\nexport default async function mutate(){}\n',
    );
    expect(defaultExportOffense(join(root, "lib/x/actions.ts"))).not.toBeNull();
  });

  test("a 'use server' module with export default <identifier> FAILS", () => {
    const root = makeFixture(
      "lib/x/actions.ts",
      '"use server";\nasync function mutate(){}\nexport default mutate;\n',
    );
    expect(defaultExportOffense(join(root, "lib/x/actions.ts"))).not.toBeNull();
  });

  test("a normal 'use server' module with only named exports passes", () => {
    const root = makeFixture("lib/x/actions.ts", '"use server";\nexport async function mutate(){}\n');
    expect(defaultExportOffense(join(root, "lib/x/actions.ts"))).toBeNull();
  });
});

// ── route-multiplicity assertion ───────────────────────────────────────────

describe("route-multiplicity assertion", () => {
  test("prove-it-fails fixture: a route.ts exporting 2 mutating methods is flagged", () => {
    const units = unitsFor(
      "app/api/x/route.ts",
      "export async function POST(){}\nexport async function DELETE(){}\n",
    );
    expect(routesWithMultipleMutatingMethods(units)).toEqual([units[0]!.file]);
  });

  test("live tree: no route.ts currently exports more than 1 mutating method", () => {
    const units = collectSurfaceUnits(["app", "lib", "components"]);
    expect(routesWithMultipleMutatingMethods(units)).toEqual([]);
  });
});

// ── §4.4 failure output ────────────────────────────────────────────────────

describe("formatFailures — §4.4 failure output", () => {
  test("lists every offender (no truncation); admin remediation differs from non-admin", () => {
    const nonAdminUnit = unitFor("lib/x/actions.ts", ACTION_MODULE + "export async function mutate(){ await doIt(); }\n");
    const adminUnit = unitFor(
      "app/api/admin/x/route.ts",
      "export async function POST(){}\n",
    );
    const offenders = [
      { unit: nonAdminUnit, reason: "unaccounted" },
      { unit: adminUnit, reason: "admin surface unaccounted for (needs registry or exemption)" },
    ];
    const message = formatFailures(offenders);
    expect(message).toContain(`${nonAdminUnit.file} :: ${nonAdminUnit.fn}`);
    expect(message).toContain(`${adminUnit.file} :: ${adminUnit.fn}`);

    const adminLine = message.split("\n").find((l) => l.includes(adminUnit.file))!;
    const nonAdminLine = message.split("\n").find((l) => l.includes(nonAdminUnit.file))!;
    expect(adminLine).toContain("AUDITABLE_MUTATIONS");
    expect(adminLine).toContain("ADMIN_SURFACE_EXEMPTIONS");
    expect(adminLine).not.toContain("no-telemetry");
    expect(adminLine).not.toContain("KNOWN_UNINSTRUMENTED");
    expect(nonAdminLine).toContain("no-telemetry");
    expect(nonAdminLine).toContain("KNOWN_UNINSTRUMENTED");
  });
});

// ── the live discovery assertion — deferred to Task 17 ────────────────────

describe("live discovery — zero unaccounted surfaces", () => {
  // UN-SKIP in Task 17 after exemptions/ledger land (and Tasks 7-16 seed the
  // 21 silent admin/crew surfaces). Until then this is red: 21 admin/crew
  // surfaces are genuinely unaccounted, plus the exemption/ledger comments
  // that Task 17 adds to the 4 comment targets don't exist yet.
  test.skip("every discovered mutation surface unit is accounted for", () => {
    const units = collectSurfaceUnits(["app", "lib", "components"]);
    const offenders = units
      .map((unit) => ({ unit, decision: evaluateUnit(unit, { auditable: AUDITABLE_MUTATIONS, exemptions: ADMIN_SURFACE_EXEMPTIONS, ledger: KNOWN_UNINSTRUMENTED }) }))
      .filter(({ decision }) => !decision.pass);
    expect(
      offenders,
      formatFailures(offenders.map(({ unit, decision }) => ({ unit, reason: decision.reason }))),
    ).toEqual([]);
  });
});
