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
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { isRetryEligible, postgrestWillRetry } from "@/lib/supabase/retryEligibility";
import { PRODUCT_SOURCE_EXTENSION } from "./retryableRpcVolatilityScan";
import { premise } from "../_shared/premise";

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

  test("rpcCallsAreNotGet: no caller turns an rpc into a GET", () => {
    // The limit is only harmless while every `.rpc()` is a POST. PostgREST serves
    // `GET /rest/v1/rpc/<fn>` when asked, and such a call becomes PostgREST's under per-request
    // ownership — where a 502 is retried by nobody.
    //
    // Walked from disk so a NEW call site is covered by default. The premise is that the walk found
    // rpc calls at all; an empty scan would satisfy the assertion vacuously.
    const files = scanProductFiles(["app", "lib"]);
    const rpcFiles = files.filter((f) => readFileSync(f, "utf8").includes(".rpc("));
    premise("files containing an .rpc( call", rpcFiles.length, 0);

    const offenders = rpcFiles.filter((f) => /\bget\s*:\s*true\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
