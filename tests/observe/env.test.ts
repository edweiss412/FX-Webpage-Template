import { describe, expect, test } from "vitest";
import { resolveTarget } from "@/scripts/observe/env";

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
