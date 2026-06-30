import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const FILES = ["sentry.server.config.ts", "sentry.edge.config.ts", "instrumentation-client.ts"];
describe("Sentry no-op gate (spec §0.6/§8)", () => {
  test.each(FILES)("%s gates Sentry.init enabled on Boolean(<dsn env>)", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/Sentry\.init\(/);
    expect(src).toMatch(/enabled:\s*Boolean\(process\.env\.(NEXT_PUBLIC_)?SENTRY_DSN\)/);
  });
  test("server/edge use parseSampleRate (no raw Number())", () => {
    for (const f of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
      expect(readFileSync(f, "utf8")).toMatch(
        /parseSampleRate\(process\.env\.SENTRY_TRACES_SAMPLE_RATE\)/,
      );
    }
  });
  test("instrumentation exports register + onRequestError", () => {
    const src = readFileSync("instrumentation.ts", "utf8");
    expect(src).toMatch(/export async function register\(/);
    expect(src).toMatch(/export const onRequestError = Sentry\.captureRequestError/);
  });
});
