// tests/adminAlerts/_metaAlertProducerScope.test.ts
//
// Producer-scope registry guard (attention-alert-routing §3.0, §7). AST discovery
// over the NAMED producer surface: any CallExpression whose callee's rightmost
// identifier is `upsertAdminAlert`, plus `upsert_admin_alert(` INVOCATIONS in
// supabase/**/*.sql. A new call site through that surface fails by default; a
// renamed import / destructured alias / raw table INSERT is the acknowledged
// §3.0 residual risk and is not discovered.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  PRODUCER_SCOPE,
  perShowReachableCodes,
  FROZEN_REACHABLE,
} from "./alertProducerScope.registry";
import {
  readContextShape,
  calleeName,
  propertyKeyName,
  type ContextShape,
} from "./producerScopeAst";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

const ROOTS = ["lib", "app"];
function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!p.includes("node_modules")) walk(p, exts, out);
    } else if (
      exts.some((x) => p.endsWith(x)) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

type Hit = { site: string; code: string | null; context: ContextShape | null };

function discoverTs(): Hit[] {
  const hits: Hit[] = [];
  for (const root of ROOTS)
    for (const file of walk(root, [".ts", ".tsx"])) {
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          // calleeName sees through parentheses, casts, non-null assertions and
          // string-keyed element access — all of which invoke the same producer
          // surface as a plain call (producerScopeAst.ts).
          const name = calleeName(n.expression);
          if (name === "upsertAdminAlert") {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            let code: string | null = null;
            const a1 = n.arguments[1];
            if (a1 && ts.isStringLiteral(a1)) code = a1.text;
            const a0 = n.arguments[0];
            let context: ContextShape | null = null;
            // Two live call shapes (verified 2026-07-24):
            //  (a) object form  upsertAdminAlert({ showId, code, context })
            //  (b) positional   upsertAdminAlert(db, showId, code, context)
            //      — lib/reports/submit.ts:759, lib/sync/assetRecovery.ts:482
            // In (b) the context is the LAST argument.
            // Property names go through propertyKeyName so a QUOTED key reads as
            // the same key as a bare one. Comparing raw source text meant
            // `{ "code": … }` matched neither branch, the call was misread as
            // positional, and the whole options object was then taken for the
            // context literal.
            const objForm =
              a0 !== undefined &&
              ts.isObjectLiteralExpression(a0) &&
              a0.properties.some((pr) => {
                const nm =
                  ts.isShorthandPropertyAssignment(pr) || ts.isPropertyAssignment(pr)
                    ? propertyKeyName(pr.name, sf)
                    : undefined;
                return nm === "code" || nm === "context";
              });
            if (!objForm && n.arguments.length > 0) {
              const last = n.arguments[n.arguments.length - 1]!;
              context = readContextShape(last, sf);
            }
            if (objForm && a0 && ts.isObjectLiteralExpression(a0)) {
              for (const prop of a0.properties) {
                if (ts.isShorthandPropertyAssignment(prop)) {
                  // `{ code, context }` — the value is a variable, so the
                  // walker cannot read its keys (spec §6: computed).
                  if (prop.name.text === "context") context = { kind: "computed" };
                  continue;
                }
                if (!ts.isPropertyAssignment(prop)) continue;
                const key = propertyKeyName(prop.name, sf);
                if (!code && key === "code" && ts.isStringLiteral(prop.initializer))
                  code = prop.initializer.text;
                if (key === "context") context = readContextShape(prop.initializer, sf);
              }
            }
            // No readable `context:` property at all (a wrapper form that
            // forwards its own argument) is treated as computed — conservative,
            // never silently unclassified (spec §6 totality).
            hits.push({
              site: `${file}:${line + 1}`,
              code,
              context: context ?? { kind: "computed" },
            });
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  return hits;
}
function discoverSql(): string[] {
  const out: string[] = [];
  for (const file of walk("supabase", [".sql"])) {
    const text = readFileSync(file, "utf8");
    // Scan the whole file (not per-line): the call name and its `(` may sit on
    // separate lines, which a per-line regex would miss (review R2 finding 6).
    const re = /upsert_admin_alert\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const nl = text.indexOf("\n", m.index);
      const line = text.slice(lineStart, nl === -1 ? undefined : nl);
      // Keep invocations; skip CREATE/DROP/REVOKE/GRANT ... FUNCTION DDL.
      if (/(drop|create|replace|revoke|grant)\b[\s\S]*function/i.test(line)) continue;
      out.push(`${file}:${text.slice(0, m.index).split("\n").length}`);
    }
  }
  return [...new Set(out)];
}

describe("_metaAlertProducerScope", () => {
  const tsHits = discoverTs();
  const allSites = [...tsHits.map((h) => h.site), ...discoverSql()];

  it("every discovered site (ts + tsx + sql invocation) is registered", () => {
    const reg = new Set(PRODUCER_SCOPE.map((r) => r.site));
    const missing = allSites.filter((s) => !reg.has(s));
    expect(missing, `unregistered producer sites: ${missing.join(", ")}`).toEqual([]);
  });

  it("no registered site is stale (registered ⊆ discovered)", () => {
    const disc = new Set(allSites);
    const stale = PRODUCER_SCOPE.filter((r) => !disc.has(r.site)).map((r) => r.site);
    expect(stale, `stale registry rows: ${stale.join(", ")}`).toEqual([]);
  });

  it("STATIC-literal sites: registry rows equal the AST literals, no duplicates, none dynamic", () => {
    const hits = tsHits.filter((h) => h.code != null);
    const staticSites = new Set(hits.map((h) => h.site));
    const astPairs = [...new Set(hits.map((h) => `${h.site}::${h.code}`))].sort();
    const staticRows = PRODUCER_SCOPE.filter((r) => staticSites.has(r.site));
    const wrongDynamic = staticRows.filter((r) => r.dynamic).map((r) => `${r.site}::${r.code}`);
    expect(wrongDynamic, "dynamic:true on AST-static sites").toEqual([]);
    const rawPairs = staticRows.map((r) => `${r.site}::${r.code}`);
    const staticDupes = rawPairs.filter((v, i) => rawPairs.indexOf(v) !== i);
    expect(staticDupes, "duplicate static rows").toEqual([]);
    expect([...new Set(rawPairs)].sort()).toEqual(astPairs);
  });

  it("dynamic rows carry dynamic:true + a provenance note", () => {
    const dynamicSites = new Set(tsHits.filter((h) => h.code == null).map((h) => h.site));
    for (const site of dynamicSites)
      for (const r of PRODUCER_SCOPE.filter((x) => x.site === site)) {
        expect(r.dynamic, `${site} must be dynamic`).toBe(true);
        expect((r.note ?? "").length, `${site} needs a provenance note`).toBeGreaterThan(0);
      }
  });

  it("literal context sites: registry contextKeys match the AST, no drift (spec §6)", () => {
    const mismatches: string[] = [];
    for (const hit of tsHits) {
      if (!hit.context || hit.context.kind !== "literal") continue;
      for (const row of PRODUCER_SCOPE.filter((r) => r.site === hit.site)) {
        if (row.computedContext) {
          mismatches.push(`${hit.site}: computedContext:true but the AST context IS a literal`);
          continue;
        }
        const declaredReq = [...(row.contextKeys ?? [])].sort();
        const declaredOpt = [...(row.optionalContextKeys ?? [])].sort();
        const astReq = [...hit.context.required].sort();
        const astOpt = [...hit.context.optional].sort();
        if (JSON.stringify(declaredReq) !== JSON.stringify(astReq))
          mismatches.push(
            `${hit.site}: contextKeys ${JSON.stringify(declaredReq)} != AST ${JSON.stringify(astReq)}`,
          );
        if (JSON.stringify(declaredOpt) !== JSON.stringify(astOpt))
          mismatches.push(
            `${hit.site}: optionalContextKeys ${JSON.stringify(declaredOpt)} != AST ${JSON.stringify(astOpt)}`,
          );
      }
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("computed context sites carry computedContext:true + a provenance note (spec §6)", () => {
    const bad: string[] = [];
    for (const hit of tsHits) {
      if (!hit.context || hit.context.kind !== "computed") continue;
      for (const row of PRODUCER_SCOPE.filter((r) => r.site === hit.site)) {
        if (!row.computedContext)
          bad.push(`${hit.site}: context is computed but computedContext is not set`);
        else if (!(row.note ?? "").length)
          bad.push(`${hit.site}: computedContext needs a provenance note`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("computed rows declare a NON-EMPTY contextKeys set (spec §6)", () => {
    // A computed row's keys are hand-authored — the walker cannot derive them —
    // and BOTH aggregations then treat them as authoritative. Omitting them is
    // silently destructive in two directions at once: `allowedKeys` loses every
    // key of that code (so, for a single-row code, the subset rule starts
    // rejecting contexts it should permit) and `guaranteedKeys` collapses its
    // intersection to []. Neither shows up as a failure anywhere else, so the
    // emptiness is pinned here.
    //
    // This does NOT verify the keys are CORRECT — that needs the helper
    // executed, which the walker cannot do. The provenance note asserted above
    // is what carries that burden, and the promoted producer-context fixtures
    // in producerContexts.ts are where a wrong key surfaces behaviorally.
    //
    // SQL sites are carved out: a migration's producer is a generic helper whose
    // `code` is a BIND PARAMETER (`p_code`), not an alert code, so it never
    // feeds allowedKeys/guaranteedKeys for any real code and has no key set to
    // declare. The carve-out is pinned below so a TypeScript row cannot drift
    // into it.
    const isSqlSite = (site: string): boolean => /\.sql:\d+$/.test(site);
    const keyless = PRODUCER_SCOPE.filter(
      (r) => r.computedContext && (r.contextKeys ?? []).length === 0,
    );
    const bad = keyless
      .filter((r) => !isSqlSite(r.site))
      .map((r) => `${r.site} (${r.code}): computedContext row declares no contextKeys`);
    expect(bad, bad.join("\n")).toEqual([]);
    // The carve-out is exactly the SQL rows — nothing else may be keyless.
    expect(keyless.every((r) => isSqlSite(r.site))).toBe(true);
  });

  it("SQL sites are classified computedContext with a note — never left TypeScript-shaped (spec §6)", () => {
    const sqlSites = new Set(discoverSql());
    const bad = PRODUCER_SCOPE.filter((r) => sqlSites.has(r.site)).filter(
      (r) => !r.computedContext || !(r.note ?? "").length,
    );
    expect(
      bad.map((r) => r.site),
      "SQL rows must be computedContext:true with a note (no SQL context extraction is attempted)",
    ).toEqual([]);
  });

  it("no exact-duplicate (site,code) rows anywhere in the registry", () => {
    const all = PRODUCER_SCOPE.map((r) => `${r.site}::${r.code}`);
    const dupes = all.filter((v, i) => all.indexOf(v) !== i);
    expect(dupes, `duplicate registry rows: ${dupes.join(", ")}`).toEqual([]);
  });

  it("reachability = per-show AND not-health; frozen set matches", () => {
    const reach = [...perShowReachableCodes()].sort();
    expect(reach, `regenerate FROZEN_REACHABLE to: ${JSON.stringify(reach)}`).toEqual(
      FROZEN_REACHABLE,
    );
    for (const g of [
      "ONBOARDING_SHEET_UNREADABLE",
      "WATCH_CHANNEL_ORPHANED",
      "SYNC_STALLED",
      "LIVE_ROW_CONFLICT",
    ])
      expect(reach).not.toContain(g);
    expect(reach).toContain("DRIVE_FETCH_FAILED");
    for (const h of HEALTH_CODES) expect(reach).not.toContain(h);
  });
});
