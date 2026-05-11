import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Vercel cron schedules", () => {
  test("M6 installs sync, keepalive, and watch lifecycle schedules", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/cron/sync", schedule: "*/5 * * * *" },
        { path: "/api/cron/keepalive", schedule: "0 12 * * *" },
        { path: "/api/cron/refresh-watch", schedule: "0 * * * *" },
        { path: "/api/cron/gc-watch", schedule: "15 * * * *" },
        { path: "/api/cron/asset-recovery", schedule: "*/15 * * * *" },
        { path: "/api/cron/diagram-gc", schedule: "30 * * * *" },
      ]),
    );
  });
});
