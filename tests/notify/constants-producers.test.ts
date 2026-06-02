import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { SYNC_PROBLEM_CODES } from "@/lib/notify/constants";

const PRODUCER_FILES = [
  "lib/sync/runScheduledCronSync.ts",
  "lib/sync/runManualSyncForShow.ts",
] as const;

describe("SYNC_PROBLEM_CODES producer existence (anti-drift, per-path, call-bound)", () => {
  for (const file of PRODUCER_FILES) {
    const src = readFileSync(file, "utf8");
    for (const code of SYNC_PROBLEM_CODES) {
      test(`${file} has an upsertAdminAlert producer for ${code}`, () => {
        const re = new RegExp(
          String.raw`upsertAdminAlert\([\s\S]{0,200}?code:\s*["'\`]${code}["'\`]`,
        );
        expect(
          re.test(src),
          `no upsertAdminAlert({ code: "${code}" }) producer call in ${file}`,
        ).toBe(true);
      });
    }
  }
});
