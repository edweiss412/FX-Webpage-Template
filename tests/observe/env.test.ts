import { describe, expect, test } from "vitest";
import { resolveTarget, applyResolvedTarget } from "@/scripts/observe/env";

const local = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "k" };
const prod = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SECRET_KEY: "k" };

describe("resolveTarget", () => {
  test("default local when env undefined + loopback/unset URL", () => {
    expect(resolveTarget(undefined, {})).toMatchObject({ kind: "ok", envName: "local" });
    expect(resolveTarget(undefined, local)).toMatchObject({ kind: "ok", envName: "local" });
  });
  test("refuses non-loopback ambient URL without explicit --env", () => {
    expect(resolveTarget(undefined, prod)).toMatchObject({ kind: "error" });
  });
  test("--env prod requires non-loopback URL + key", () => {
    expect(resolveTarget("prod", prod)).toMatchObject({ kind: "ok", envName: "prod" });
    expect(resolveTarget("prod", local)).toMatchObject({ kind: "error" }); // loopback
    expect(resolveTarget("prod", { SUPABASE_URL: "https://abc.supabase.co" })).toMatchObject({
      kind: "error",
    }); // no key
  });
  test("unknown env value → error", () => {
    expect(resolveTarget("staging", prod)).toMatchObject({ kind: "error" });
  });
});

const V = {
  VALIDATION_SUPABASE_URL: "https://vzakgrxqwcalbmagufjh.supabase.co",
  VALIDATION_SUPABASE_SECRET_KEY: "k",
  VALIDATION_SUPABASE_PROJECT_REF: "vzakgrxqwcalbmagufjh",
};
describe("--env validation is VALIDATION_*-only (Codex R3 F2)", () => {
  test("full valid triple → ok + mapped pair, regardless of ambient", () => {
    const r = resolveTarget("validation", {
      ...V,
      SUPABASE_URL: "https://prod-other.supabase.co",
    });
    expect(r).toEqual({
      kind: "ok",
      envName: "validation",
      url: V.VALIDATION_SUPABASE_URL,
      key: "k",
    });
  });
  test.each([
    ["URL absent", { VALIDATION_SUPABASE_SECRET_KEY: "k", VALIDATION_SUPABASE_PROJECT_REF: "r" }],
    ["URL loopback", { ...V, VALIDATION_SUPABASE_URL: "http://127.0.0.1:54321" }],
    [
      "secret absent",
      {
        VALIDATION_SUPABASE_URL: V.VALIDATION_SUPABASE_URL,
        VALIDATION_SUPABASE_PROJECT_REF: "vzakgrxqwcalbmagufjh",
      },
    ],
    [
      "ref absent",
      { VALIDATION_SUPABASE_URL: V.VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY: "k" },
    ],
    ["ref mismatch", { ...V, VALIDATION_SUPABASE_PROJECT_REF: "otherref" }],
    [
      "branch-preview host",
      { ...V, VALIDATION_SUPABASE_URL: "https://vzakgrxqwcalbmagufjh--branch.supabase.co" },
    ],
    ["plain http", { ...V, VALIDATION_SUPABASE_URL: "http://vzakgrxqwcalbmagufjh.supabase.co" }],
  ])("%s → hard error even with valid ambient (never fall-through)", (_name, env) => {
    const r = resolveTarget("validation", {
      ...env,
      SUPABASE_URL: "https://prod-other.supabase.co",
      SUPABASE_SECRET_KEY: "ak",
    });
    expect(r.kind).toBe("error");
  });
  test("local + prod paths byte-identical to before", () => {
    expect(resolveTarget(undefined, {})).toEqual({ kind: "ok", envName: "local" });
    expect(resolveTarget(undefined, { SUPABASE_URL: "https://x.supabase.co" }).kind).toBe(
      "error",
    );
    expect(
      resolveTarget("prod", { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" }),
    ).toEqual({ kind: "ok", envName: "prod" });
    expect(resolveTarget("prod", { SUPABASE_URL: "http://127.0.0.1:54321" }).kind).toBe("error");
  });
});

describe("applyResolvedTarget (Codex R5 F2)", () => {
  test("assigns mapped pair; no-op for unmapped/local/error", () => {
    const env: Record<string, string | undefined> = {};
    applyResolvedTarget(
      { kind: "ok", envName: "validation", url: "u", key: "k" },
      env as NodeJS.ProcessEnv,
    );
    expect(env.SUPABASE_URL).toBe("u");
    expect(env.SUPABASE_SECRET_KEY).toBe("k");
    const env2: Record<string, string | undefined> = {};
    applyResolvedTarget({ kind: "ok", envName: "local" }, env2 as NodeJS.ProcessEnv);
    expect(env2.SUPABASE_URL).toBeUndefined();
  });
});
