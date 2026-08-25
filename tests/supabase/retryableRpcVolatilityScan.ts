/**
 * tests/supabase/retryableRpcVolatilityScan.ts — the decision logic behind
 * `_metaRetryableRpcVolatility.test.ts`, extracted so it can be scored.
 *
 * It lives in a module rather than in the suite because the source-mutation runner overlays a
 * target only when a Vitest suite IMPORTS it, so logic written inside a `.test.ts` is
 * unenrollable by construction. The registry holds no row ending in `.test.ts`; the nineteen
 * rows that do point into `tests/` all name an extracted module of exactly this shape
 * (`tests/db/_destructiveFileAnalysis.ts`, `tests/ci/modalWaitHelper/scan.ts`,
 * `tests/mutation/source/premiseScan.ts`).
 *
 * Everything here is pure. The catalog query, the connection, and the READ ONLY arm stay in the
 * suite, because they are environment rather than decision.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Catalog = Map<string, { volatile: boolean }>;

/**
 * Names deliberately kept OUT of the retry set, each with its reason.
 *
 * Both entries are the completeness arm working as designed rather than a weakening of it.
 * Discovery matches literals against the catalog instead of recognizing call sites, which is
 * deliberately OVER-inclusive: a spurious match forces a name into "retryable or excluded" and
 * can never cause a retry on its own. These two are named in prose and in an audit query's SQL
 * text, never invoked as an RPC from a client, so exclusion is the correct disposition.
 *
 * Excluding is also the SAFE direction if that ever changes: an excluded name is simply not
 * retried.
 */
export const EXCLUSIONS: ReadonlyMap<string, string> = new Map([
  [
    "canonicalize_email",
    "named inside an audit query's SQL text (lib/audit/emailCanonicalization.ts), never called as an RPC",
  ],
  [
    "can_read_show",
    "named in parser prose about RLS readability (lib/parser/blocks/hotels.ts), never called as an RPC",
  ],
]);

export const PRODUCT_ROOTS = ["app", "lib", "components"];

/** Every string literal in the product tree, so discovery never recognizes a CALL. */
export function literalsInProductTree(roots: readonly string[] = PRODUCT_ROOTS): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      for (const m of readFileSync(full, "utf8").matchAll(/["'`]([A-Za-z0-9_]+)["'`]/g)) {
        found.add(m[1]!);
      }
    }
  };
  for (const root of roots) walk(root);
  return found;
}

/** SAFETY arm, as a pure function so a planted input can prove it fails. */
export function safetyViolations(names: Iterable<string>, cat: Catalog): string[] {
  const out: string[] = [];
  for (const name of names) {
    const row = cat.get(name);
    if (row === undefined) {
      out.push(`${name}: not resolvable in the catalog`);
      continue;
    }
    if (row.volatile) out.push(`${name}: VOLATILE`);
  }
  return out;
}

/** COMPLETENESS arm, likewise pure. */
export function completenessViolations(
  literals: Set<string>,
  cat: Catalog,
  set: ReadonlySet<string>,
  exclusions: ReadonlyMap<string, string>,
): string[] {
  const out: string[] = [];
  for (const [name, row] of cat) {
    if (row.volatile) continue;
    if (!literals.has(name)) continue;
    if (set.has(name) || exclusions.has(name)) continue;
    out.push(
      `${name}: non-VOLATILE and named in the product tree, but neither retryable nor excluded`,
    );
  }
  return out;
}
