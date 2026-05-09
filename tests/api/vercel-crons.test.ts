import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Vercel cron schedules", () => {
  test("M6 installs sync and keepalive schedules", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/cron/sync", schedule: "*/5 * * * *" },
        { path: "/api/cron/keepalive", schedule: "0 12 * * *" },
      ]),
    );
  });
});
