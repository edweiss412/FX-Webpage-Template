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

/**
 * One row per function OVERLOAD, keyed by name.
 *
 * The list is load-bearing. Keyed `name -> row`, building the map from a catalog query collapses
 * overloads last-wins, so `f(uuid)` STABLE and `f(uuid, text)` VOLATILE resolve to whichever the
 * query happened to emit second. Round-1 review found that: the safety arm could report a name
 * clean while a VOLATILE overload of it existed, and a retry decision is made on the NAME, since
 * that is all a PostgREST `/rpc/<name>` path carries. `public` holds no overloads today, which is
 * why nothing observed it; a planted pair in the suite keeps the fix from resting on that.
 */
export type Overload = { volatile: boolean; identity: string };
export type Catalog = Map<string, Overload[]>;

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

/**
 * Members the READ ONLY arm cannot reach a verdict on, each with the reason.
 *
 * The arm calls every member with NULL arguments inside a READ ONLY transaction and fails on
 * SQLSTATE 25006. A member that raises for its OWN reasons before executing any statement is not
 * a violation and not a pass either, so it is declared here rather than counted as covered.
 *
 * A row is wrong in BOTH directions: a member that raises without a row here fails, and a row
 * naming a member that now executes cleanly fails as stale. That is what stops the map from
 * quietly becoming the place unexercised members accumulate.
 */
export const READ_ONLY_INCONCLUSIVE: ReadonlyMap<string, string> = new Map([
  [
    "readfinalizeowned_b2",
    "raises 'forbidden' from its authorization check before executing any statement, so a READ ONLY transaction never observes it; the SAFETY arm and the planted VOLATILE-callee probe still cover it",
  ],
]);

/**
 * Whether `name` is listed AND carries an actual reason.
 *
 * A bare `map.has(name)` accepts an empty string, which is how an exemption gets added with the
 * justification left for later and then never written. Round-1 review flagged it; the reason is
 * the entire cost of the exemption, so an empty one is not an exemption.
 */
export function hasReasonedEntry(map: ReadonlyMap<string, string>, name: string): boolean {
  const reason = map.get(name);
  return reason !== undefined && reason.trim() !== "";
}

export const PRODUCT_ROOTS = ["app", "lib", "components"];

/**
 * Extensions the walk treats as product source.
 *
 * `.tsx?` alone was too narrow, and round-2 review probed it: `tsconfig.json` includes an `.mts` glob,
 * so an ordinary `.mts` module under one of the roots compiles as product code while the walk
 * skipped it — a module could name an RPC and the completeness arm would stay green. Zero such
 * files exist under the roots today, which is why nothing observed it.
 *
 * Deliberately wider than tsconfig's list rather than derived from it. The failure direction that
 * matters is MISSING a file: discovery is already over-inclusive by design (a spurious match only
 * forces a name into "retryable or excluded" and can never cause a retry), so an extension that
 * turns out not to be compiled costs nothing, while one that is compiled and unscanned is the gap.
 * `tests/supabase/productSourceExtensions.test.ts` asserts this covers every extension tsconfig
 * names, so a tsconfig change that adds one fails rather than silently narrowing the walk.
 */
export const PRODUCT_SOURCE_EXTENSION = /\.(?:tsx?|mtsx?|ctsx?|jsx?|mjs|cjs)$/;

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
      if (!PRODUCT_SOURCE_EXTENSION.test(entry)) continue;
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
    const rows = cat.get(name);
    if (rows === undefined || rows.length === 0) {
      out.push(`${name}: not resolvable in the catalog`);
      continue;
    }
    // ANY volatile overload condemns the name. A retry is decided from the `/rpc/<name>` path,
    // which names no argument types, so the wrapper cannot know which overload PostgREST will
    // pick — the only safe reading is the least safe overload.
    for (const row of rows.filter((r) => r.volatile)) {
      out.push(`${name}(${row.identity}): VOLATILE`);
    }
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
  for (const [name, rows] of cat) {
    // Mirror of the safety arm: a name counts as non-VOLATILE only when EVERY overload is. If any
    // is volatile the name is already unretryable, so it owes no entry in the set.
    if (rows.length === 0 || rows.some((r) => r.volatile)) continue;
    if (!literals.has(name)) continue;
    if (set.has(name) || hasReasonedEntry(exclusions, name)) continue;
    out.push(
      `${name}: non-VOLATILE and named in the product tree, but neither retryable nor excluded`,
    );
  }
  return out;
}

/** SQLSTATE for `cannot execute ... in a read-only transaction`. The arm's only true failure. */
export const READ_ONLY_SQLSTATE = "25006";

/** What executing one overload inside a READ ONLY transaction produced. */
export type ReadOnlyOutcome = {
  name: string;
  identity: string;
  /** `null` when the call completed without raising. */
  sqlstate: string | null;
  message: string | null;
  /**
   * True when the call CANNOT have executed the body — a STRICT function given a NULL argument.
   * Such a call is not evidence of anything and must never read as clean.
   */
  bodySkipped?: boolean;
};

/**
 * READ ONLY arm, as a pure classifier so planted outcomes can prove each branch fires.
 *
 * Round-1 review found the arm executing only ZERO-ARGUMENT members: it filtered on
 * `pronargs = 0` and `continue`d past the rest, leaving 8 of 13 members checked for volatility
 * alone. Volatility is necessary and not sufficient (a STABLE function writes through a VOLATILE
 * callee), so those 8 had no coverage of the property the arm exists to establish. Every overload
 * is now called with NULL arguments instead.
 *
 * Only SQLSTATE 25006 is a violation. A function that raises for its own reasons has told us
 * nothing either way, so it must be declared inconclusive with a reason — and a declaration that
 * stops being true fails too, so the map cannot rot into a skip list.
 */
export function readOnlyViolations(
  outcomes: readonly ReadOnlyOutcome[],
  inconclusive: ReadonlyMap<string, string> = READ_ONLY_INCONCLUSIVE,
): string[] {
  const out: string[] = [];

  // Whether ANY overload of a name failed to reach a verdict. Staleness is a property of the NAME,
  // because the declaration is keyed by name while outcomes are per OVERLOAD.
  //
  // Judged per-outcome, a name with one raising overload and one clean overload reported the clean
  // one as a stale declaration and failed — while the declaration was legitimately true of the
  // other. That is the SAME name-versus-overload confusion the catalog collapse was, found by
  // sweeping this round's own repair for the shape rather than the instance.
  const unreachedByName = new Map<string, boolean>();
  for (const o of outcomes) {
    unreachedByName.set(
      o.name,
      (unreachedByName.get(o.name) ?? false) || o.sqlstate !== null || o.bodySkipped === true,
    );
  }

  for (const o of outcomes) {
    if (o.sqlstate === READ_ONLY_SQLSTATE) {
      // Declaring a member inconclusive does NOT excuse this: 25006 is the arm firing, not noise.
      out.push(`${o.name}(${o.identity}): wrote inside a READ ONLY transaction (${o.message})`);
      continue;
    }
    // A STRICT function given a NULL argument never ran, so "it did not raise" says nothing. This
    // is checked BEFORE the clean path, because that path is exactly where it used to be absorbed.
    if (o.bodySkipped === true) {
      out.push(
        `${o.name}(${o.identity}): STRICT and called with a NULL argument, so PostgreSQL skipped ` +
          `the body entirely — this call is not evidence the function cannot write`,
      );
      continue;
    }
    if (o.sqlstate !== null && !hasReasonedEntry(inconclusive, o.name)) {
      out.push(
        `${o.name}(${o.identity}): raised ${o.sqlstate} (${o.message}) so READ ONLY reached no ` +
          `verdict, and it is not declared in READ_ONLY_INCONCLUSIVE with a reason`,
      );
    }
  }

  for (const [name, unreached] of unreachedByName) {
    if (!unreached && hasReasonedEntry(inconclusive, name)) {
      out.push(
        `${name}: declared inconclusive but EVERY overload executed cleanly — remove the ` +
          `READ_ONLY_INCONCLUSIVE row, it is stale`,
      );
    }
  }
  return out;
}

/** One `pg_proc` row as the catalog query returns it. */
export type CatalogRow = { proname: string; provolatile: string; identity: string };

/**
 * Group catalog rows by name, KEEPING every overload.
 *
 * Extracted from the suite's `beforeAll` because this is where the round-1 collapse lived, and
 * logic inside a `beforeAll` can only be tested through whatever the live database happens to
 * contain. `public` holds no overloaded functions today, so the fix would have rested on nothing
 * observable; a planted pair drives this directly instead.
 */
export function buildCatalog(rows: readonly CatalogRow[]): Catalog {
  const cat: Catalog = new Map();
  for (const r of rows) {
    const list = cat.get(r.proname) ?? [];
    list.push({ volatile: r.provolatile === "v", identity: r.identity });
    cat.set(r.proname, list);
  }
  return cat;
}

/**
 * A non-NULL literal for each argument type the retry set actually uses.
 *
 * Round-2 review found the arm calling every member with NULL arguments, which PostgreSQL does not
 * merely tolerate — for a `STRICT` function it SKIPS THE BODY ENTIRELY and returns NULL. The arm
 * then saw no error and recorded the member clean, so a STRICT member reached "verified read-only"
 * without one statement of it running. Probed both halves on the live stack: a STRICT function
 * wrapping a volatile writer raises NOTHING under READ ONLY when called with NULL, and raises 25006
 * when called with a non-NULL value.
 *
 * Passing real values fixes the STRICT case and is strictly better for every other case too, since
 * more of each body actually executes. The five types below are the complete current set across all
 * thirteen members; each was verified to execute cleanly under READ ONLY.
 */
const ARG_SENTINELS: ReadonlyMap<string, string> = new Map([
  ["text", "''::text"],
  ["text[]", "'{}'::text[]"],
  ["uuid", "'00000000-0000-0000-0000-000000000000'::uuid"],
  ["uuid[]", "'{}'::uuid[]"],
  ["timestamp with time zone", "now()"],
]);

export type CallArgs = {
  /** The argument list to interpolate, already typed. */
  sql: string;
  /** Types with no sentinel, which therefore fell back to NULL. */
  unsupported: string[];
};

/**
 * Build the argument list for one overload, and report any type that had to fall back to NULL.
 *
 * Pure, so the fallback path can be driven by a planted type rather than by whichever types the
 * catalog happens to hold today. The fallback is the dangerous branch: NULL is exactly what makes a
 * STRICT body skip, so the caller must refuse to call such a result clean.
 */
export function buildCallArgs(argTypes: readonly string[]): CallArgs {
  const parts: string[] = [];
  const unsupported: string[] = [];
  for (const t of argTypes) {
    const sentinel = ARG_SENTINELS.get(t);
    if (sentinel === undefined) {
      unsupported.push(t);
      parts.push(`null::${t}`);
      continue;
    }
    parts.push(sentinel);
  }
  return { sql: parts.join(", "), unsupported };
}

/**
 * Whether this call could not have executed the function's body.
 *
 * True exactly when the function is STRICT and at least one argument fell back to NULL. PostgreSQL
 * skips a STRICT body on any NULL input, so such a call proves nothing and must never be recorded
 * as a clean READ ONLY execution.
 */
export function bodyCannotHaveRun(isStrict: boolean, unsupported: readonly string[]): boolean {
  return isStrict && unsupported.length > 0;
}
