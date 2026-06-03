import { describe, expect, test } from "vitest";
import * as C from "@/lib/notify/constants";

describe("notify constants", () => {
  test("values", () => {
    expect(C.SYNC_PROBLEM_THRESHOLD_MS).toBe(3_600_000);
    expect(C.STALENESS_THRESHOLD_MS).toBe(3_600_000);
    expect(C.DIGEST_HOUR_LOCAL).toBe(7);
    expect(C.DIGEST_TIMEZONE).toBe("America/New_York");
    expect(C.DIGEST_RETRY_WINDOW_HOURS).toBe(3);
    expect(C.DIGEST_MAX_SHOWS).toBe(12);
    expect(C.DIGEST_MAX_ITEMS_PER_SHOW).toBe(5);
    expect(C.SEND_RETRY_CAP).toBe(3);
  });
});
