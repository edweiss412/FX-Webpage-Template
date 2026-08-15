/**
 * DB-free unit cases for tests/cross-cutting/pgCronSmokes.ts.
 *
 * The dispatch-origin comparator exists because the pg-cron suite already HAD the
 * answer and threw it away: the firing smoke reads `net.http_request_queue.url` under
 * its own xid and the census parsed it with `new URL(...)` — then asserted `pathname +
 * search` only, leaving `protocol` and `host` in hand and unchecked
 * (BL-PG-CRON-HOST-ASSERTION).
 *
 * The two modes carry DIFFERENT contracts, and that is not a flag inference:
 *
 *   local      — compare the dispatch origin to `app.fxav_vercel_url` read over the SAME
 *                connection that read the queue. Both sides come from the database
 *                actually connected.
 *   validation — that GUC is UNREADABLE there. Supabase managed Postgres denies
 *                `ALTER DATABASE … SET app.*` to `postgres`, so the migration used a
 *                session-scoped `set_config` and the value evaporated with that session
 *                (Phase-0.A-block-1-closeout.md:39-49, F1; re-probed empty 2026-08-14).
 *                A GUC comparison there would be VACUOUS — worse than none, because it
 *                would read as coverage. The expected value is the deployment contract
 *                instead: https, no explicit port, and the stable production alias.
 *
 * This file is also the referring suite for the module's source-mutation enrolment, so
 * it exercises `firingSmokeSql` and `queuedUrlsFromSmokeOutput` directly as well.
 */
import { describe, expect, it } from "vitest";

import {
  assertCronDispatchOrigin,
  firingSmokeSql,
  GUC_PROBE_SQL,
  gucFromSmokeOutput,
  NO_OP_MUTANT_COMMAND,
  queuedUrlsFromSmokeOutput,
} from "@/tests/cross-cutting/pgCronSmokes";
import { PRODUCTION_HOST } from "@/scripts/lib/validation-smoke-target";

describe("assertCronDispatchOrigin (spec §5.2-§5.3)", () => {
  it("accepts the production alias in validation mode", () => {
    const r = assertCronDispatchOrigin(
      new URL(`https://${PRODUCTION_HOST}/api/cron/sync`),
      "validation",
      null,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects http scheme in validation mode", () => {
    // The entry's first objection: "a host check that passes http:// against an https://
    // GUC would be worse than none, because it would read as coverage."
    const r = assertCronDispatchOrigin(new URL(`http://${PRODUCTION_HOST}/x`), "validation", null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/is not https/);
  });

  it("rejects a preview host in validation mode (cron dispatches to the stable alias)", () => {
    // Accepted by assertValidationSmokeBaseUrl, and correctly so for a smoke. A cron
    // command baked against a per-deployment preview host is stale by construction.
    const r = assertCronDispatchOrigin(
      new URL("https://fxav-crew-pages-validation-c3b1d2e-eric-weiss-projects.vercel.app/x"),
      "validation",
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/is not the stable alias/);
  });

  it("rejects an explicit port in validation mode", () => {
    const r = assertCronDispatchOrigin(
      new URL(`https://${PRODUCTION_HOST}:8443/x`),
      "validation",
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/explicit port/);
  });

  it("rejects a foreign host in validation mode", () => {
    const r = assertCronDispatchOrigin(
      new URL("https://attacker.example.com/x"),
      "validation",
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/is not the stable alias/);
  });

  it("local mode compares origins, so a trailing slash and a differing path cannot matter", () => {
    // The entry's second and third objections at once: `URL.origin` has no path
    // component, so neither a trailing slash nor a base path can reach the comparison.
    const r = assertCronDispatchOrigin(
      new URL("http://host.docker.internal:3000/api/cron/sync"),
      "local",
      "http://host.docker.internal:3000/",
    );
    expect(r.ok).toBe(true);
  });

  it("local mode rejects a scheme mismatch against the GUC", () => {
    const r = assertCronDispatchOrigin(
      new URL("http://host.docker.internal:3000/x"),
      "local",
      "https://host.docker.internal:3000",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/dispatch origin .* != GUC origin/);
  });

  it("local mode rejects a port mismatch against the GUC", () => {
    // Origin is scheme + host + PORT. Without this case the comparison could be reading
    // hostname alone and every assertion above would still pass.
    const r = assertCronDispatchOrigin(
      new URL("http://host.docker.internal:3001/x"),
      "local",
      "http://host.docker.internal:3000",
    );
    expect(r.ok).toBe(false);
  });

  it("local mode fails loudly on an empty GUC rather than vacuously passing", () => {
    // A silent bootstrap regression is exactly what a GUC comparison must NOT absorb:
    // comparing against "" would make every dispatch origin equal to nothing at all.
    for (const guc of [null, ""]) {
      const r = assertCronDispatchOrigin(
        new URL("http://host.docker.internal:3000/x"),
        "local",
        guc,
      );
      expect(r.ok, JSON.stringify(guc)).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/GUC is empty/);
    }
  });

  it("local mode rejects a GUC that is not a URL", () => {
    const r = assertCronDispatchOrigin(
      new URL("http://host.docker.internal:3000/x"),
      "local",
      "not a url",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/is not a URL/);
  });
});

describe("firingSmokeSql", () => {
  it("wraps the command in a transaction that always rolls back", () => {
    const sql = firingSmokeSql("select net.http_get(url := 'https://x.test/api/cron/sync')");
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("ROLLBACK;")).toBe(true);
  });

  it("reads back only rows queued by THIS transaction, in queue order", () => {
    // xid identity, not max-id arithmetic: a real cron fires every minute against both
    // targets, and an id-window probe would read its rows or miss its own.
    const sql = firingSmokeSql("select 1");
    expect(sql).toContain("xmin = pg_current_xact_id()::xid");
    expect(sql).toContain("ORDER BY id");
  });

  it("strips exactly one trailing semicolon from the stored command", () => {
    expect(firingSmokeSql("select 1;")).toContain("\nselect 1;\n");
    expect(firingSmokeSql("  select 1  ")).toContain("\nselect 1;\n");
  });
});

/** The literal separator firingSmokeSql joins on; spelled out so it is visible in source. */
const SEP = "\u001f";

describe("gucFromSmokeOutput", () => {
  it("reads the value the batch itself saw", () => {
    expect(gucFromSmokeOutput("SMOKE_URLS:x\nSMOKE_GUC:http://host.docker.internal:3000")).toBe(
      "http://host.docker.internal:3000",
    );
  });

  it("reports an unset GUC as empty, which the comparator then rejects loudly", () => {
    // Not a null-vs-absent confusion: unset comes back as an EMPTY probe line, and the
    // comparator turns that into a named failure rather than a vacuous pass.
    expect(gucFromSmokeOutput("SMOKE_GUC:")).toBe("");
    expect(assertCronDispatchOrigin(new URL("http://x.test/y"), "local", "").ok).toBe(false);
  });

  it("throws when the batch never reached its GUC statement", () => {
    expect(() => gucFromSmokeOutput("SMOKE_URLS:x")).toThrow(/no SMOKE_GUC probe/);
  });

  it("is an appendable statement, so expected and actual share one invocation", () => {
    // The premise of the local-mode leg: both sides come from the same psql call. If
    // GUC_PROBE_SQL stopped being a standalone appendable statement, this notices first.
    expect(GUC_PROBE_SQL.trim().endsWith(";")).toBe(true);
    expect(GUC_PROBE_SQL).toContain("current_setting('app.fxav_vercel_url', true)");
  });
});

describe("queuedUrlsFromSmokeOutput", () => {
  it("returns every queued url, unit-separator split, in queue order", () => {
    const raw = `x\nSMOKE_URLS:https://a.test/one${SEP}https://b.test/two\nROLLBACK`;
    expect(queuedUrlsFromSmokeOutput(raw)).toEqual(["https://a.test/one", "https://b.test/two"]);
  });

  it("returns [] for a command that queued nothing — the planted-mutant premise", () => {
    expect(queuedUrlsFromSmokeOutput("SMOKE_URLS:")).toEqual([]);
    // The mutant that motivates the smoke: a commented-out net.http_get body, which
    // every text pin on cron.job.command accepts.
    expect(NO_OP_MUTANT_COMMAND).toContain("-- net.http_get(");
  });

  it("takes the LAST probe line, so an echoed command cannot shadow the real one", () => {
    const raw = "SMOKE_URLS:https://stale.test/x\nSMOKE_URLS:https://real.test/y";
    expect(queuedUrlsFromSmokeOutput(raw)).toEqual(["https://real.test/y"]);
  });

  it("throws when the output carries no probe line at all", () => {
    // Absent probe means the SQL never reached its probe statement. Returning [] there
    // would report "queued nothing" for a run that never ran.
    expect(() => queuedUrlsFromSmokeOutput("ERROR:  syntax error")).toThrow(/no SMOKE_URLS probe/);
  });
});
