import { afterAll, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);

const TTL_LINE =
  "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";
const TTL_FAIL = {
  onCall: 1,
  actions: [
    { type: "stderr", text: TTL_LINE },
    { type: "exit", code: 0 },
  ],
};
const THEN_OK = {
  onCall: 2,
  actions: [
    { type: "lastMessage", text: "VERDICT: APPROVE\n" },
    { type: "exit", code: 0 },
  ],
};

describe("codex-guard cache lock lifecycle (§6)", () => {
  it("18a: unreadable cache → backup fails → skipped, cache intact, lock released", async () => {
    const run = mkRun();
    const cache = join(run.codexHome, "models_cache.json");
    chmodSync(cache, 0o000);
    try {
      writeScenario(run, [TTL_FAIL, THEN_OK]);
      const res = await runGuard(run);
      expect(res.code).toBe(0);
      const r = readResult(run);
      expect(r.attempts[0]!.recovery).toBe("cache_ttl_skipped");
      expect(existsSync(cache)).toBe(true);
      expect(existsSync(join(run.codexHome, ".codex-guard-cache-lock"))).toBe(false);
    } finally {
      chmodSync(cache, 0o644);
    }
  });

  it("18b: stale lock → broken AND cleaned, rung skipped this run", async () => {
    const run = mkRun();
    const lock = join(run.codexHome, ".codex-guard-cache-lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), "99999");
    const old = (Date.now() - 3600 * 1000) / 1000;
    utimesSync(lock, old, old);
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl_skipped");
    expect(existsSync(lock)).toBe(false);
    expect(
      readdirSync(run.codexHome).filter((f) => f.startsWith(".codex-guard-cache-lock.stale-")),
    ).toEqual([]);
  });

  it("18c: fresh foreign lock → skipped, cap consumed, lock survives wrapper exit", async () => {
    const run = mkRun();
    const lock = join(run.codexHome, ".codex-guard-cache-lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), "99999");
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl_skipped");
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(join(lock, "owner"), "utf8")).toBe("99999");
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  });

  it("scenario 19a: literal-tilde CODEX_HOME expands against HOME", async () => {
    const run = mkRun();
    const customHome = join(run.home, "custom-codex");
    mkdirSync(customHome, { recursive: true });
    writeFileSync(join(customHome, "models_cache.json"), JSON.stringify({ custom: true }));
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run, [], { CODEX_HOME: "~/custom-codex" });
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl");
    expect(existsSync(join(customHome, "models_cache.json"))).toBe(false);
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  });

  it("scenario 19b: unset CODEX_HOME falls back to HOME/.codex", async () => {
    const run = mkRun();
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run, [], { CODEX_HOME: "" });
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl");
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(false);
  });
});
