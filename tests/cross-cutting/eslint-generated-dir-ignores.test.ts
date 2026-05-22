import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ESLINT_CONFIG_PATH = join(ROOT, "eslint.config.mjs");

describe("ESLint generated-directory ignores", () => {
  it("ignores the screenshot help Next.js build output", () => {
    const config = readFileSync(ESLINT_CONFIG_PATH, "utf8");

    expect(
      config,
      "eslint.config.mjs must ignore .next-screenshots-help/** so capture artifacts do not enter pnpm lint",
    ).toContain('".next-screenshots-help/**"');
  });
});
