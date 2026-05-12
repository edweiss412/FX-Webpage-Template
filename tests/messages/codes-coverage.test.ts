import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

const M8_SOURCE_FILES = [
  "app/api/report/route.ts",
  "app/api/cron/report-reaper/route.ts",
  "lib/github/issues.ts",
  "lib/reports/leaseProtocol.ts",
  "lib/reports/rateLimit.ts",
  "lib/reports/submit.ts",
] as const;

const M8_REQUIRED_CODES = [
  "IDEMPOTENCY_IN_FLIGHT",
  "REPORT_HORIZON_EXPIRED",
  "REPORT_RATE_LIMITED_ADMIN",
  "REPORT_RATE_LIMITED_CREW",
  "REPORT_LOOKUP_INCONCLUSIVE",
  "GITHUB_BOT_LOGIN_MISSING",
  "REPORT_DUPLICATE_LIVE_MATCHES",
  "REPORT_OPEN_ORPHAN_LABEL",
  "REPORT_LEASE_THRASHING",
  "REPORT_ORPHANED_LOST_LEASE",
  "STALE_ORPHAN_REPORT",
] as const satisfies readonly MessageCode[];

function readM8Source(): string {
  return M8_SOURCE_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
}

function emittedM8MessageCodes(): string[] {
  const source = readM8Source();
  const codes = new Set<string>();
  const pattern =
    /["'`](IDEMPOTENCY_IN_FLIGHT|STALE_ORPHAN_REPORT|GITHUB_BOT_LOGIN_MISSING|REPORT_[A-Z0-9_]+)["'`]/g;

  for (const match of source.matchAll(pattern)) {
    if (match[1]) codes.add(match[1]);
  }

  return [...codes].sort();
}

describe("M8 message-code coverage", () => {
  test("catalog contains every M8 report producer code", () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual(
      expect.arrayContaining([...M8_REQUIRED_CODES].sort()),
    );
  });

  test("every M8 report code literal emitted by backend source is in the catalog", () => {
    const missing = emittedM8MessageCodes().filter((code) => !(code in MESSAGE_CATALOG));

    expect(missing).toEqual([]);
  });

  test("every required M8 code has a producer literal in backend source", () => {
    expect(emittedM8MessageCodes()).toEqual(expect.arrayContaining([...M8_REQUIRED_CODES]));
  });
});
