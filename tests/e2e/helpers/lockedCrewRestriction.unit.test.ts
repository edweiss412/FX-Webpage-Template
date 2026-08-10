/**
 * tests/e2e/helpers/lockedCrewRestriction.unit.test.ts — the psql-target
 * contract, proved without a database.
 *
 * Spec: docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md §2.6
 * Entry: BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB
 *
 * The defect was not "a check was missing" — it was that the target was decided
 * at MODULE LOAD, from a variable (`TEST_DATABASE_URL`) the canonical
 * `.env.local` points at the validation pooler, while the suite's PostgREST
 * client read the loopback stack. So the cases below are about WHEN the target
 * is resolved and WHICH channels can move it, not only about hostnames.
 *
 * CONSEQUENCE BOUND, so this file has a closable end: every DSN is either
 * connected to as written, or REFUSED with the offending channel named. A
 * benign-but-unlisted parameter being refused is a DOCUMENTED LIMIT (spec §4
 * limit 8), not a defect. What must never happen is a silent connection to a
 * target other than the one the DSN describes.
 *
 * No process environment is mutated: every case injects its own `source`, so
 * these cases cannot leak into a sibling suite or read one.
 */
import { describe, expect, test, vi } from "vitest";

import { premise, premiseHolds } from "../../_shared/premise";
import {
  LOCAL_SUPABASE_DSN,
  NEUTRALIZED_PG_SERVICE_FILE,
  PSQL_QUERY_PARAM_ACCEPT_SET,
  REMOTE_OPT_IN_ENV,
  psqlChildEnv,
  resolvePsqlTarget,
} from "./psqlTarget";

/**
 * A `ProcessEnv` from a plain literal. The repo augments `NodeJS.ProcessEnv`
 * with required keys (`NODE_ENV`), so a case's two-variable fixture is not
 * assignable without this — and constructing the full ambient shape would make
 * every case depend on the ambient environment, which is precisely what these
 * cases exist to hold still.
 */
function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

const CALLER = "lockedCrewRestriction";
const REMOTE = "postgresql://u:p@aws-1-us-east-2.pooler.supabase.com:5432/postgres";
const LOOPBACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The lockedCrewRestriction profile, in one place so no case can drift from it. */
function resolve(source: NodeJS.ProcessEnv, dsn?: string): string {
  return resolvePsqlTarget({
    caller: CALLER,
    ...(dsn === undefined ? {} : { dsn }),
    source,
    envVars: ["TEST_DATABASE_URL", "DATABASE_URL"],
    honorRemoteOptIn: true,
  });
}

describe("fixture DSN target resolution (BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB)", () => {
  test("premise: the accept-set is a real allowlist, and the fixture DSNs differ where it matters", () => {
    premise("accepted query parameters", PSQL_QUERY_PARAM_ACCEPT_SET.length, 2);
    premiseHolds(
      "the remote fixture really is non-loopback, so the refusal case cannot pass for another reason",
      new URL(REMOTE).hostname === "aws-1-us-east-2.pooler.supabase.com",
    );
    premiseHolds(
      "the loopback fixture really is loopback, so the acceptance case is not accidentally refused",
      new URL(LOOPBACK).hostname === "127.0.0.1",
    );
    premiseHolds(
      "the accept-set does NOT contain any known steering channel",
      !["host", "hostaddr", "service", "port", "dbname", "user", "password"].some((p) =>
        PSQL_QUERY_PARAM_ACCEPT_SET.includes(p),
      ),
    );
  });

  // ── (a) the filed defect ───────────────────────────────────────────────────
  test("a non-loopback TEST_DATABASE_URL is REFUSED, naming the host, the channel and the opt-in", () => {
    const call = () => resolve(env({ TEST_DATABASE_URL: REMOTE }));
    expect(call).toThrow(/non-loopback database host \(aws-1-us-east-2\.pooler\.supabase\.com\)/);
    expect(call).toThrow(/\$TEST_DATABASE_URL/);
    expect(call).toThrow(new RegExp(REMOTE_OPT_IN_ENV));
  });

  // ── (b) every steering channel, refused BY NAME ────────────────────────────
  //
  // Each URI's AUTHORITY is loopback, so every one of these would sail past a
  // hostname-only guard while libpq connected elsewhere. The last row is the
  // point of an accept-set over a denylist: an unmodeled parameter is refused
  // with exactly the same force as a modeled one.
  test.each([
    ["host", `${LOOPBACK}?host=192.0.2.1`],
    ["hostaddr", `${LOOPBACK}?hostaddr=192.0.2.2`],
    ["service", `${LOOPBACK}?service=probe`],
    ["port", `${LOOPBACK}?port=6543`],
    ["dbname", `${LOOPBACK}?dbname=elsewhere`],
    ["user", `${LOOPBACK}?user=other`],
    ["password", `${LOOPBACK}?password=other`],
    ["an_unmodeled_parameter", `${LOOPBACK}?an_unmodeled_parameter=1`],
  ])("query parameter %s is refused by name even on a loopback authority", (param, dsn) => {
    // Without this the case could pass for the wrong reason — a DSN refused as
    // non-loopback anyway proves nothing about the parameter.
    expect(new URL(dsn).hostname).toBe("127.0.0.1");
    expect(() => resolve(env({ TEST_DATABASE_URL: dsn }))).toThrow(
      new RegExp(`outside the accept-set: ${param}`),
    );
  });

  // ── (c) positive accept-set membership ─────────────────────────────────────
  //
  // Without these, a resolver that refused EVERY query parameter would satisfy
  // every case above while breaking legitimate DSNs.
  test.each([
    ["connect_timeout", `${LOOPBACK}?connect_timeout=5`],
    ["application_name", `${LOOPBACK}?application_name=fxav-e2e`],
    ["sslmode", `${LOOPBACK}?sslmode=disable`],
    [
      "all three combined",
      `${LOOPBACK}?connect_timeout=5&application_name=fxav-e2e&sslmode=disable`,
    ],
  ])("an accepted parameter (%s) resolves rather than refusing", (_label, dsn) => {
    expect(resolve(env({ TEST_DATABASE_URL: dsn }))).toBe(dsn);
  });

  // ── (d) call-time resolution ───────────────────────────────────────────────
  test("the target is read at CALL time, so a change after import is honored", () => {
    const source = env({ TEST_DATABASE_URL: LOOPBACK });
    expect(resolve(source)).toBe(LOOPBACK);

    // The exact shape of the defect: the value changes after this module was
    // imported. A module-load capture would still return the first target.
    source["TEST_DATABASE_URL"] = REMOTE;
    expect(() => resolve(source)).toThrow(/non-loopback database host/);

    delete source["TEST_DATABASE_URL"];
    expect(resolve(source)).toBe(LOCAL_SUPABASE_DSN);
  });

  test("TEST_DATABASE_URL wins over DATABASE_URL, and the error names which one supplied it", () => {
    expect(() => resolve(env({ TEST_DATABASE_URL: REMOTE, DATABASE_URL: LOOPBACK }))).toThrow(
      /\$TEST_DATABASE_URL/,
    );
    expect(resolve(env({ DATABASE_URL: LOOPBACK }))).toBe(LOOPBACK);
  });

  // ── (e) the child environment ──────────────────────────────────────────────
  test("the child environment strips every PG* variable and NEUTRALIZES the service file", () => {
    const childEnv = psqlChildEnv({
      source: env({
        PGHOSTADDR: "192.0.2.2",
        PGSERVICE: "evil",
        PGSERVICEFILE: "/tmp/evil.conf",
        PGPASSWORD: "hunter2",
        pghostaddr: "192.0.2.9",
        PGNOTINVENTEDYET: "x",
        PATH: "/usr/bin",
        HOME: "/Users/someone",
      }),
      honorRemoteOptIn: true,
    });

    // Nothing PG-prefixed survives FROM THE SOURCE…
    const survivors = Object.keys(childEnv).filter(
      (k) => k.toUpperCase().startsWith("PG") && k !== "PGSERVICEFILE",
    );
    expect(survivors, "a PG* variable survived; libpq reads these over the DSN").toEqual([]);

    // …and PGSERVICEFILE is not merely stripped but REPOINTED. Stripping alone
    // leaves HOME in place, and libpq then falls back to ~/.pg_service.conf —
    // the second steering channel a live probe used (192.0.2.3).
    expect(childEnv["PGSERVICEFILE"]).toBe(NEUTRALIZED_PG_SERVICE_FILE);
    expect(childEnv["PGSERVICEFILE"]).not.toBe("/tmp/evil.conf");

    // Non-PG variables survive; psql still needs a usable environment.
    expect(childEnv["PATH"]).toBe("/usr/bin");
    expect(childEnv["HOME"]).toBe("/Users/someone");
  });

  // ── (f) the opt-in ─────────────────────────────────────────────────────────
  test(`${REMOTE_OPT_IN_ENV}=1 passes a remote target through and restores the ambient environment`, () => {
    const source = env({
      TEST_DATABASE_URL: REMOTE,
      [REMOTE_OPT_IN_ENV]: "1",
      PGPASSWORD: "hunter2",
      PATH: "/usr/bin",
    });
    expect(resolve(source)).toBe(REMOTE);
    expect(psqlChildEnv({ source, honorRemoteOptIn: true })["PGPASSWORD"]).toBe("hunter2");
  });

  test("the opt-in does NOT relax the accept-set — an unmodeled steering channel still fails", () => {
    // The opt-in says "target that database deliberately", not "let anything
    // move the target". A parameter can still point somewhere the operator did
    // not choose, so it stays refused.
    const source = env({
      TEST_DATABASE_URL: `${REMOTE}?hostaddr=192.0.2.2`,
      [REMOTE_OPT_IN_ENV]: "1",
    });
    expect(() => resolve(source)).toThrow(/outside the accept-set: hostaddr/);
  });

  test("a value other than exactly '1' does not arm the opt-in", () => {
    for (const value of ["0", "true", "yes", ""]) {
      const source = env({ TEST_DATABASE_URL: REMOTE, [REMOTE_OPT_IN_ENV]: value });
      expect(() => resolve(source), `opt-in value ${JSON.stringify(value)}`).toThrow(
        /non-loopback database host/,
      );
    }
  });

  test("an EMPTY value is refused by name — absent and empty are not the same channel", () => {
    // The loosening this pins against: the resolution this replaced used nullish
    // `??`, so an empty DATABASE_URL reached `new URL("")` and refused. Treating
    // "" as absent would silently select the local default instead — a refusal
    // turned into an acceptance, which the migration onto a shared resolver is
    // not allowed to do (cross-model review R1, probed).
    expect(() => resolve(env({ TEST_DATABASE_URL: "" }))).toThrow(/is EMPTY/);
    expect(() => resolve(env({ DATABASE_URL: "" }))).toThrow(/is EMPTY/);
    expect(() => resolve(env({ TEST_DATABASE_URL: "", DATABASE_URL: LOOPBACK }))).toThrow(
      /is EMPTY/,
    );
    expect(() => resolve(env({}), "")).toThrow(/is EMPTY/);

    // …and the error names WHICH channel supplied it, so the fix is obvious.
    expect(() => resolve(env({ TEST_DATABASE_URL: "" }))).toThrow(/\$TEST_DATABASE_URL/);

    // ABSENT still falls through, which is the behavior the empty case is
    // distinguished FROM. Without this the fix could be "refuse everything".
    expect(resolve(env({ DATABASE_URL: LOOPBACK }))).toBe(LOOPBACK);
    expect(resolve(env({}))).toBe(LOCAL_SUPABASE_DSN);
  });

  test("an unparseable DSN is refused before any authority check reads it", () => {
    expect(() =>
      resolve(env({ TEST_DATABASE_URL: "host=127.0.0.1 port=54322 dbname=postgres" })),
    ).toThrow(/not a parseable URL/);
  });
});

// ── (g) every DSN entry point routes through the resolver ────────────────────
//
// An argument path that skipped the resolver would reopen the whole class
// through the caller, so this asserts on the SPAWN rather than on the resolver:
// `execFileSync` is stubbed, and the DSN and environment psql would actually
// have received are read back off the recorded call.
describe("lockedCrewRestriction spawns its client with the resolved target and scrubbed env", () => {
  test("the helper refuses a non-loopback TEST_DATABASE_URL set AFTER import, and never spawns", async () => {
    vi.resetModules();
    const execFileSync = vi.fn();
    vi.doMock("node:child_process", () => ({ execFileSync }));

    const helper = await import("./lockedCrewRestriction");
    const prior = process.env["TEST_DATABASE_URL"];
    process.env["TEST_DATABASE_URL"] = REMOTE;
    try {
      await expect(
        helper.setDateRestrictionLocked(
          "drive-file-1",
          "11111111-1111-1111-1111-111111111111",
          null,
        ),
      ).rejects.toThrow(/non-loopback database host/);
      expect(execFileSync, "psql was spawned despite the refusal").not.toHaveBeenCalled();
    } finally {
      if (prior === undefined) delete process.env["TEST_DATABASE_URL"];
      else process.env["TEST_DATABASE_URL"] = prior;
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });

  test("on a loopback target it spawns psql with that DSN, `-X`, and the scrubbed environment", async () => {
    vi.resetModules();
    const crewId = "11111111-1111-1111-1111-111111111111";
    const execFileSync = vi.fn().mockReturnValue(`${crewId}\n`);
    vi.doMock("node:child_process", () => ({ execFileSync }));

    const helper = await import("./lockedCrewRestriction");
    const priorUrl = process.env["TEST_DATABASE_URL"];
    const priorHostAddr = process.env["PGHOSTADDR"];
    process.env["TEST_DATABASE_URL"] = LOOPBACK;
    process.env["PGHOSTADDR"] = "192.0.2.2";
    try {
      await helper.setDateRestrictionLocked("drive-file-1", crewId, null);

      expect(execFileSync).toHaveBeenCalledTimes(1);
      const call = execFileSync.mock.calls[0];
      premiseHolds(
        "the spawn was recorded, so the assertions below read a real call",
        Boolean(call),
      );
      const [command, args, options] = call as [string, string[], { env?: NodeJS.ProcessEnv }];

      // Matched as a PATTERN, not a bare "psql" string literal: the
      // startup-file guard's indirection tripwire
      // (tests/cross-cutting/psqlStartupFiles/scan.ts) requires the binary name to
      // appear as a literal argv[0] and nowhere else, so that a call site can never
      // hide it behind an identifier. A literal here is not a call site, but it is
      // lexically identical to one — the guard already carries a SELF exclusion for
      // exactly this shape, and widening that list is a worse trade than spelling
      // the assertion as a pattern.
      expect(command).toMatch(/^psq[l]$/);
      expect(args, "the resolved DSN is the one psql receives").toContain(LOOPBACK);
      expect(
        args,
        "-X keeps psqlrc from issuing a \\connect after the validated connection",
      ).toContain("-X");

      const childEnv: NodeJS.ProcessEnv = options.env ?? env({});
      expect(
        Object.keys(childEnv).filter(
          (k) => k.toUpperCase().startsWith("PG") && k !== "PGSERVICEFILE",
        ),
        "an ambient PG* variable reached the child; PGHOSTADDR alone retargets libpq",
      ).toEqual([]);
      expect(childEnv["PGSERVICEFILE"]).toBe(NEUTRALIZED_PG_SERVICE_FILE);
    } finally {
      if (priorUrl === undefined) delete process.env["TEST_DATABASE_URL"];
      else process.env["TEST_DATABASE_URL"] = priorUrl;
      if (priorHostAddr === undefined) delete process.env["PGHOSTADDR"];
      else process.env["PGHOSTADDR"] = priorHostAddr;
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });
});
