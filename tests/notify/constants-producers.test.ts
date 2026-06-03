import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { SYNC_PROBLEM_CODES } from "@/lib/notify/constants";

const SHARED_DELEGATED_PRODUCER_FILE = "lib/sync/runScheduledCronSync.ts";
const MANUAL_PRE_DELEGATION_PRODUCERS = [
  {
    code: "DRIVE_FETCH_FAILED",
    file: "lib/sync/runManualSyncForShow.ts",
    reason: "manual watched-folder/metadata failure before processOneFile delegation",
  },
  {
    code: "SHEET_UNAVAILABLE",
    file: "lib/sync/runManualSyncForShow.ts",
    reason: "manual source-gone/parent-mismatch failure before processOneFile delegation",
  },
] as const;

function producerCallFor(code: string): RegExp {
  return new RegExp(String.raw`upsertAdminAlert\([\s\S]{0,260}?code:\s*["'\`]${code}["'\`]`);
}

describe("SYNC_PROBLEM_CODES producer existence (anti-drift, per-path, call-bound)", () => {
  const sharedSrc = readFileSync(SHARED_DELEGATED_PRODUCER_FILE, "utf8");

  for (const code of SYNC_PROBLEM_CODES) {
    test(`${SHARED_DELEGATED_PRODUCER_FILE} has the delegated default producer for ${code}`, () => {
      expect(
        producerCallFor(code).test(sharedSrc),
        `no delegated upsertAdminAlert({ code: "${code}" }) producer call in ${SHARED_DELEGATED_PRODUCER_FILE}`,
      ).toBe(true);
    });
  }

  for (const { code, file, reason } of MANUAL_PRE_DELEGATION_PRODUCERS) {
    test(`${file} has the manual pre-delegation producer for ${code}: ${reason}`, () => {
      const src = readFileSync(file, "utf8");
      expect(
        producerCallFor(code).test(src),
        `no manual pre-delegation upsertAdminAlert({ code: "${code}" }) producer call in ${file}`,
      ).toBe(true);
    });
  }

  test("manual hard_fail wrapper backfills only injected processOneFile producers", () => {
    const src = readFileSync("lib/sync/runManualSyncForShow.ts", "utf8");

    expect(src).toMatch(/const usesInjectedProcessOneFile = Boolean\(deps\.processOneFile\)/);
    expect(src).toMatch(
      /usesInjectedProcessOneFile &&[\s\S]{0,160}?result\.outcome === "hard_fail"[\s\S]{0,160}?emitManualParseErrorAlert_unlocked/,
    );
  });
});
