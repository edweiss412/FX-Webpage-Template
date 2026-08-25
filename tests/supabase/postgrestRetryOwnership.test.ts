/**
 * tests/supabase/postgrestRetryOwnership.test.ts
 *
 * Which layer owns a REQUEST, over the whole input space — including the dimension that was missing.
 *
 * The first version of this file crossed methods with outcomes and reported 0 double-retries and 0
 * orphaned declines. Round 3 found a real orphan anyway, because ownership was decided per (method,
 * outcome) while the wrapper is installed as the WHOLE CLIENT's fetch. PostgREST's retry loop lives
 * in PostgrestBuilder and only runs for `/rest/v1/` requests, so declining an Auth GET handed it to
 * a layer that is not in its call chain: measured `calls=1 emits=0` on `auth.getUser()` for 503, 520
 * and a network rejection. A table that does not model URL cannot see that, and mine did not.
 *
 * It also could not see round 3's other finding: a request is a SEQUENCE of outcomes, so per-pair
 * exclusivity bounds a pair and not a request. A 502 we retried followed by a 503 we declined
 * composed both loops back to twelve calls.
 *
 * Ownership is therefore decided ONCE PER REQUEST, from (url, method) alone, and this file asserts
 * that over the cross product of both dimensions.
 */
import { createRequire } from "node:module";
import ts from "typescript";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { isRetryEligible, postgrestWillRetry } from "@/lib/supabase/retryEligibility";
import { PRODUCT_ROOTS, PRODUCT_SOURCE_EXTENSION } from "./retryableRpcVolatilityScan";
import { premise } from "../_shared/premise";

/**
 * The `rpc()` options that make the request non-POST. DERIVED from the installed client, not
 * enumerated from memory: `PostgrestClient.rpc()` computes `method = head ? 'HEAD' : 'GET'` under
 * `head || get`, and defaults both to false. Pinned against that source by "the installed client
 * changes an rpc's method for exactly these options" below, so a version bump adding a third such
 * option FAILS here rather than silently widening the unowned-502 gap.
 */
const METHOD_CHANGING_RPC_OPTIONS = ["get", "head"] as const;

/**
 * The `.rpc()` calls in one file that pass a method-changing option as `true`.
 *
 * Structural on purpose. A text match for `head: true` reads the whole FILE, and
 * `components/admin/Dashboard.tsx` both calls `.rpc()` and, separately, runs three
 * `.select("id", { count: "exact", head: true })` count queries — a legitimate table read that has
 * nothing to do with rpc method selection. Scanning text flagged it, so the guard's first widened
 * run failed on a file containing no offender at all. A guard that cries wolf gets narrowed by the
 * next person who trips it, which is how the real gap would have been reopened.
 *
 * Walking the AST removes the whole class rather than this one instance: comments are not nodes,
 * and a `.select()` argument is not a `.rpc()` argument. Node's own parser decides, not a pattern.
 *
 * DOCUMENTED LIMIT: it reads a literal `true` (through `as const` and parentheses) and nothing else.
 * `{ get: someFlag }`, `{ ...opts }`, and shorthand `{ get }` carry values no static walk can know,
 * so they are not flagged. That is deliberate rather than an oversight: the threat fence here is
 * ordinary authoring mistakes, where the option is written inline, and the alternative — flagging
 * every unresolvable value — reintroduces exactly the false-positive class this walk replaced. A
 * guard that fires on safe code gets narrowed by whoever trips it next, which is how the real gap
 * would reopen.
 */
function rpcMethodChangingOptions(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "rpc"
    ) {
      for (const arg of node.arguments) {
        if (!ts.isObjectLiteralExpression(arg)) continue;
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const name = prop.name.getText(src).replace(/^["']|["']$/g, "");
          if (!METHOD_CHANGING_RPC_OPTIONS.some((o) => o === name)) continue;
          // Unwrap `as const` / `as boolean` / parentheses before asking whether the value is
          // literally true. `{ get: true as const }` is ordinary authoring, and a bare kind check
          // reads its initializer as an AsExpression and lets it through.
          let value: ts.Expression = prop.initializer;
          while (ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) {
            value = value.expression;
          }
          if (value.kind === ts.SyntaxKind.TrueKeyword) {
            hits.push(`${file}:${name}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return hits;
}

/** The installed PostgrestClient source, resolved the way the contract test resolves common.ts. */
function installedClientSource(): string {
  const require = createRequire(import.meta.url);
  const supabaseJs = require.resolve("@supabase/supabase-js/package.json");
  const pkgJson = createRequire(supabaseJs).resolve("@supabase/postgrest-js/package.json");
  return readFileSync(join(dirname(pkgJson), "src/PostgrestClient.ts"), "utf8");
}

const H = "http://127.0.0.1:54321";
const URLS = [
  { label: "rpc (retryable)", url: `${H}/rest/v1/rpc/is_admin`, postgrest: true },
  { label: "rpc (not in set)", url: `${H}/rest/v1/rpc/some_writer`, postgrest: true },
  { label: "table read", url: `${H}/rest/v1/shows?select=*`, postgrest: true },
  { label: "auth getUser", url: `${H}/auth/v1/user`, postgrest: false },
  { label: "auth token", url: `${H}/auth/v1/token?grant_type=refresh_token`, postgrest: false },
  { label: "storage", url: `${H}/storage/v1/object/x`, postgrest: false },
] as const;
const METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE"] as const;

/** The wrapper's rule, mirrored from its call site: own it only if eligible AND PostgREST will not. */
const weOwn = (url: string, method: string): boolean =>
  isRetryEligible(url, method) && !postgrestWillRetry(url, method);

describe("ownership is decided per REQUEST, across url AND method", () => {
  test("the table is non-degenerate on both dimensions", () => {
    // no-premise: literal inputs.
    premise("url x method pairs", URLS.length * METHODS.length, 1);
    // Both dimensions must actually change the answer, or the table proves nothing about either.
    const byUrl = new Set(URLS.map((u) => weOwn(u.url, "GET")));
    // The rpc path, not a table path: on a TABLE url the answer is false for every method (writes
    // are ineligible, reads are PostgREST's), so a table would make this pass vacuously. On an rpc
    // url POST is ours and GET is PostgREST's, which is exactly the discrimination being claimed.
    const byMethod = new Set(METHODS.map((m) => weOwn(`${H}/rest/v1/rpc/is_admin`, m)));
    expect(byUrl.size, "url must matter").toBeGreaterThan(1);
    expect(byMethod.size, "method must matter").toBeGreaterThan(1);
  });

  test("PostgREST's loop is claimed ONLY for /rest/v1/ requests", () => {
    // no-premise: literal inputs. This is the assertion the old table could not express, and the
    // one whose absence orphaned every Auth GET failure.
    for (const u of URLS) {
      for (const m of METHODS) {
        const idempotent = ["GET", "HEAD", "OPTIONS"].includes(m);
        expect(postgrestWillRetry(u.url, m), `${u.label} ${m}`).toBe(u.postgrest && idempotent);
      }
    }
  });

  test("NO request is left to a layer that is not in its call chain", () => {
    // no-premise: literal inputs.
    //
    // The orphan direction, now stated over urls: a request we decline must be one PostgREST
    // actually handles. Auth and storage are never PostgREST's, so we must never decline them.
    const orphaned = URLS.flatMap((u) =>
      METHODS.filter(
        (m) => isRetryEligible(u.url, m) && !weOwn(u.url, m) && !postgrestWillRetry(u.url, m),
      ).map((m) => `${u.label} ${m}`),
    );
    expect(orphaned).toEqual([]);
  });

  test("NO request is claimed by both layers", () => {
    // no-premise: literal inputs. Per REQUEST, so a sequence of outcomes cannot compose them.
    const both = URLS.flatMap((u) =>
      METHODS.filter((m) => weOwn(u.url, m) && postgrestWillRetry(u.url, m)).map(
        (m) => `${u.label} ${m}`,
      ),
    );
    expect(both).toEqual([]);
  });

  test("the arc's own path stays ours: POST to a retryable rpc", () => {
    // no-premise: literal inputs.
    //
    // The whole point of the wrapper. Every caller in this repo invokes .rpc() without { get: true },
    // so these are POSTs, and PostgREST never retries POST — no overlap has ever existed here.
    expect(weOwn(`${H}/rest/v1/rpc/is_admin`, "POST")).toBe(true);
    expect(postgrestWillRetry(`${H}/rest/v1/rpc/is_admin`, "POST")).toBe(false);
  });

  test("Auth GETs are ours, because nothing else would retry them", () => {
    // no-premise: literal inputs. Declining these is what round 3 measured as calls=1 emits=0.
    expect(weOwn(`${H}/auth/v1/user`, "GET")).toBe(true);
    expect(postgrestWillRetry(`${H}/auth/v1/user`, "GET")).toBe(false);
  });

  test("a PostgREST table read is theirs alone", () => {
    // no-premise: literal inputs. Reverting these to PostgREST is the pre-arc behaviour and is what
    // removes the multiplication at the root instead of adjudicating it per outcome.
    expect(weOwn(`${H}/rest/v1/shows?select=*`, "GET")).toBe(false);
    expect(postgrestWillRetry(`${H}/rest/v1/shows?select=*`, "GET")).toBe(true);
  });

  test("DOCUMENTED LIMIT: a GET-served retryable rpc would be PostgREST's, which does not retry 502", () => {
    // no-premise: literal inputs.
    //
    // The narrowing's honest edge. PostgREST serves `GET /rest/v1/rpc/<fn>` for non-volatile
    // functions, and under per-request ownership such a call belongs to PostgREST — which retries
    // 503 and 520 but NOT 502, the very fault this arc exists to absorb.
    //
    // It cannot arise today: no caller passes `{ get: true }`, so every .rpc() is a POST, and
    // `rpcCallsAreNotGet` below fails the moment that stops being true. Recording the limit here
    // rather than widening ownership to cover a case nothing produces — widening is what round 3
    // showed composes the loops back together.
    expect(weOwn(`${H}/rest/v1/rpc/is_admin`, "GET")).toBe(false);
    expect(postgrestWillRetry(`${H}/rest/v1/rpc/is_admin`, "GET")).toBe(true);
  });

  test("an unparseable url is kept, never orphaned", () => {
    // no-premise: literal inputs. Guessing PostgREST is involved would hand it to nobody.
    expect(postgrestWillRetry("not a url", "GET")).toBe(false);
  });
});

/** Walk the given roots and return every file the guard's own extension rule accepts. */
function scanProductFiles(roots: readonly string[]): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        walk(full);
        continue;
      }
      // The SHARED constant, not a private regex. Round-4 review found this scanning only .ts/.tsx
      // while the approved product walker covers the JS family, so a `lib/*.mts` GET rpc reached the
      // documented 502 gap with this guard green — the same extension gap I had repaired in the
      // walker one round earlier, instance fixed and shape left alone. Importing it rather than
      // re-widening it is the class repair: both walkers now move together and cannot diverge.
      if (PRODUCT_SOURCE_EXTENSION.test(entry)) files.push(full);
    }
  };
  for (const r of roots) walk(r);
  return files;
}

describe("the documented limit stays unreachable", () => {
  test("the walk REACHES every compiled extension, proved on a fixture", () => {
    // no-premise: the fixture is created here and asserted non-empty below.
    //
    // Without this the guard passes VACUOUSLY when its walk is narrowed: planting `.tsx?` back and
    // dropping a `.mts` file carrying `get: true` into lib/ left all ten cases green, because a file
    // the walk never opens can carry anything. The premise has to be that the walk SEES the file.
    const root = mkdtempSync(join(tmpdir(), "rpc-ext-"));
    try {
      const exts = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
      for (const e of exts) writeFileSync(join(root, `probe.${e}`), "// probe\n");
      writeFileSync(join(root, "notes.md"), "not source\n");

      const seen = scanProductFiles([root]).map((f) => f.split(".").pop()!);
      expect(seen.length).toBeGreaterThan(0);
      for (const e of exts) expect(seen, `.${e} must be walked`).toContain(e);
      expect(seen, "markdown must not be walked").not.toContain("md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the detector separates a method-changing rpc option from everything that looks like one", () => {
    // Both directions, because each failed in a different way. Text matching FIRED on a file whose
    // only `head: true` was a count query and a comment; and before it was widened, the same guard
    // was SILENT on `head: true` in an rpc call. A guard that only proves it stays quiet cannot tell
    // "nothing is wrong" from "I cannot see anything".
    const dir = mkdtempSync(join(tmpdir(), "rpc-opt-"));
    try {
      const f = join(dir, "sample.ts");
      writeFileSync(
        f,
        [
          "// a comment mentioning head: true, which is not a node",
          "export async function a(c) {",
          '  await c.select("id", { count: "exact", head: true });',
          '  await c.rpc("plain_one", { p: 1 });',
          '  await c.rpc("getter", {}, { get: true });',
          '  await c.rpc("header", {}, { head: true });',
          '  await c.rpc("explicitly_false", {}, { get: false });',
          '  await c.rpc("as_const", {}, { get: true as const });',
          '  await c.rpc("dynamic", {}, { get: someFlag });',
          "}",
        ].join("\n"),
        "utf8",
      );

      // "as_const" IS caught (the unwrap), "dynamic" is NOT (the documented limit), and the
      // select option, the comment and `get: false` stay quiet.
      const hits = rpcMethodChangingOptions(f).map((h) => h.split(":").pop());
      expect(hits.sort()).toEqual(["get", "get", "head"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the installed client changes an rpc's method for exactly these options", () => {
    // The tripwire below is only as wide as METHOD_CHANGING_RPC_OPTIONS, so that list is read back
    // out of the vendor's OWN branch condition rather than trusted. Enumerating it by hand is what
    // left `head: true` uncovered for a round; deriving it means the next option the client adds
    // reds this test instead of quietly reopening the gap.
    const src = installedClientSource();
    const branch = /else if \(([^)]+)\)\s*\{\s*method = head \? 'HEAD' : 'GET'/.exec(src);
    premise("the method-selection branch was located in the installed client", branch ? 1 : 0, 0);

    const condition = branch?.[1] ?? "";
    const named = Array.from(new Set(condition.match(/[A-Za-z_$][\w$]*/g) ?? [])).sort();
    expect(named).toEqual([...METHOD_CHANGING_RPC_OPTIONS].sort());
  });

  test("rpcCallsAreNotGet: no caller turns an rpc into a GET", () => {
    // The limit is only harmless while every `.rpc()` is a POST. PostgREST serves
    // `GET /rest/v1/rpc/<fn>` when asked, and such a call becomes PostgREST's under per-request
    // ownership — where a 502 is retried by nobody.
    //
    // Walked from disk so a NEW call site is covered by default. The premise is that the walk found
    // rpc calls at all; an empty scan would satisfy the assertion vacuously.
    // Roots come from PRODUCT_ROOTS, not a private list. The private list said ["app", "lib"] while
    // PRODUCT_ROOTS says ["app", "lib", "components"], so every `.rpc()` under components/ was
    // unscanned — and components/admin/Dashboard.tsx ALREADY calls readfinalizeowned_b2, which put a
    // live call site one ordinary edit from the unowned-502 gap with this guard green. Same repair
    // as the extension list one round earlier: share the constant so the two cannot diverge again.
    const files = scanProductFiles(PRODUCT_ROOTS);
    const rpcFiles = files.filter((f) => readFileSync(f, "utf8").includes(".rpc("));
    premise("files containing an .rpc( call", rpcFiles.length, 0);

    // Both method-changing options, derived from the installed client rather than enumerated by
    // hand: PostgrestClient's rpc() computes `method = head ? 'HEAD' : 'GET'` when `head || get`,
    // so exactly these two turn an rpc into a non-POST. Matching only `get` left `head: true` —
    // equally ordinary, equally unowned, since HEAD is in PostgREST's retryable METHODS while 502
    // is not in its retryable STATUSES. METHOD_CHANGING_RPC_OPTIONS is pinned against the installed
    // source below, so a version bump that adds a third option fails instead of silently widening
    // the gap.
    const offenders = rpcFiles.flatMap((f) => rpcMethodChangingOptions(f));
    expect(offenders).toEqual([]);
  });
});
