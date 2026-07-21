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

type Hit = { site: string; code: string | null };
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
          const c = n.expression;
          const name = ts.isIdentifier(c)
            ? c.text
            : ts.isPropertyAccessExpression(c)
              ? c.name.text
              : undefined;
          if (name === "upsertAdminAlert") {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            let code: string | null = null;
            const a1 = n.arguments[1];
            if (a1 && ts.isStringLiteral(a1)) code = a1.text;
            const a0 = n.arguments[0];
            if (!code && a0 && ts.isObjectLiteralExpression(a0)) {
              for (const prop of a0.properties)
                if (
                  ts.isPropertyAssignment(prop) &&
                  prop.name.getText(sf) === "code" &&
                  ts.isStringLiteral(prop.initializer)
                )
                  code = prop.initializer.text;
            }
            hits.push({ site: `${file}:${line + 1}`, code });
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
