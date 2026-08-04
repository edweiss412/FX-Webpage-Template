/**
 * Preflight's live-claims step.
 *
 * The positive assertion comes FIRST and everything else is conditional on it:
 * not wiring claims in at all satisfies every "survives a claims failure"
 * assertion, since unmodified preflight exits 0 and never spawns the child.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SENTINEL = "CLAIMS-CHILD-RAN";

/**
 * Every var preflight hard-requires, with values its live validators accept.
 * CI has no tracked `.env.local`, so without these preflight exits during its
 * env checks — which run BEFORE the claims step — and never reaches the thing
 * under test.
 */
const REQUIRED_ENV: Record<string, string> = {
  HASH_FOR_LOG_PEPPER: "x".repeat(48), // validator: >= 32 chars
  PICKER_COOKIE_SIGNING_KEY: "test-signing-key",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  SUPABASE_ANON_KEY: "test-anon",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x@y.z", private_key: "k" }),
};

/**
 * A stub `pnpm` earlier on PATH, so the claims child is observable without
 * touching the network. It records that it ran, echoes its argv, and honours
 * CLAIMS_STUB_MODE.
 */
const STUB_DIR = mkdtempSync(join(tmpdir(), "preflight-claims-"));
mkdirSync(STUB_DIR, { recursive: true });
writeFileSync(
  join(STUB_DIR, "pnpm"),
  `#!/bin/sh
echo "${SENTINEL} $@"
case "$CLAIMS_STUB_MODE" in
  fail) exit 1 ;;
  hang) sleep 60 ;;
esac
exit 0
`,
  { mode: 0o755 },
);
chmodSync(join(STUB_DIR, "pnpm"), 0o755);

afterAll(() => {
  // tmpdir cleanup is the OS's problem; nothing here leaks into the repo.
});

function runPreflight(args: string[], env: Record<string, string | undefined> = {}) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/preflight-env.mjs"), ...args], {
    // process.execPath, never the bare name "node": one case replaces PATH with
    // the stub dir, and spawnSync("node", ...) would fail ENOENT before
    // preflight ever started.
    cwd: ROOT,
    encoding: "utf8",
    timeout: 90_000,
    env: {
      ...process.env,
      ...REQUIRED_ENV,
      // Cleared explicitly: this file runs in the `serial` project, which has
      // CI=true in Actions, and the claims step is suppressed under CI. Without
      // this the one assertion that makes this file non-vacuous is green
      // locally and red in CI.
      CI: undefined,
      GITHUB_ACTIONS: undefined,
      PATH: `${STUB_DIR}:${process.env.PATH ?? ""}`,
      ...env,
    },
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("preflight spawns the claims child on every success path", () => {
  it.each([
    ["default (DB probe runs)", [] as string[]],
    ["--no-db, which exits before the DB probe", ["--no-db"]],
  ])("%s", (_label, args) => {
    expect(runPreflight(args).out).toContain(SENTINEL);
  });

  it("psql absent from PATH, which exits before the DB probe too", () => {
    // The third exit that prints `env ✓`: scripts/preflight-env.mjs's
    // psql-ENOENT path. PATH holds only the stub dir, so psql is unfindable
    // while the stub pnpm remains reachable.
    expect(runPreflight([], { PATH: STUB_DIR }).out).toContain(SENTINEL);
  });

  it("passes --no-fetch, so it never touches the network", () => {
    // The stub echoes argv, so this asserts the flag actually reaches the child
    // rather than merely appearing in the source.
    expect(runPreflight([]).out).toContain("--no-fetch");
  });

  it("the REAL reader under --no-fetch makes no fetch and no ls-remote", () => {
    // Argv alone is not the contract (spec §7.5 rejects that test shape): an
    // implementation that accepts the flag and fetches anyway passes it. This
    // runs the real CLI with a `git` shim earlier on PATH that records every
    // invocation, so the assertion is over what was actually executed.
    const shim = mkdtempSync(join(tmpdir(), "git-shim-"));
    const logFile = join(shim, "calls.log");
    writeFileSync(
      join(shim, "git"),
      `#!/bin/sh
printf '%s\n' "$*" >> "${logFile}"
exec /usr/bin/git "$@"
`,
      { mode: 0o755 },
    );
    chmodSync(join(shim, "git"), 0o755);

    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", join(ROOT, "scripts/ledger-claims.ts"), "--no-fetch"],
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env, PATH: `${shim}:${process.env.PATH ?? ""}` },
      },
    );
    expect(r.status, `reader failed: ${r.stderr}`).toBe(0);

    const calls = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
    expect(calls.length, "the git shim recorded nothing — it was not on PATH").toBeGreaterThan(0);
    expect(calls, "--no-fetch must not fetch").not.toMatch(/^fetch/m);
    expect(calls, "--no-fetch must not contact the remote").not.toMatch(/^ls-remote/m);
  });
});

describe("preflight suppression does not spawn the child", () => {
  it.each([
    ["CI=true", [] as string[], { CI: "true" }],
    ["--no-claims", ["--no-claims"], {}],
    ["PREFLIGHT_NO_CLAIMS=1", [], { PREFLIGHT_NO_CLAIMS: "1" }],
  ])("%s", (_label, args, env) => {
    // Asserts NON-SPAWN, not absent output: a suppression that runs the child
    // and discards its stdout would pass an output-only assertion.
    expect(runPreflight(args, env).out).not.toContain(SENTINEL);
  });
});

describe("a claims failure never takes preflight down", () => {
  it("exits 0 when the claims child exits non-zero", () => {
    const r = runPreflight(["--no-db"], { CLAIMS_STUB_MODE: "fail" });
    expect(r.status).toBe(0);
  });

  it("exits 0 when the claims child hangs past its budget", () => {
    const r = runPreflight(["--no-db"], { CLAIMS_STUB_MODE: "hang" });
    expect(r.status).toBe(0);
  });
});
