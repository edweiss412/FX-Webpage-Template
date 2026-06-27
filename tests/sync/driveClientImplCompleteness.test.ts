/**
 * tests/sync/driveClientImplCompleteness.test.ts (agenda Phase B, Task 11)
 *
 * Structural meta-test (spec §4.5.3 / §9): the agenda Drive methods are OPTIONAL
 * on the DriveClient interface (so existing impls compile), but required-ness is
 * enforced at runtime here — every concrete DriveClient impl (the real
 * defaultDriveClient + the dev/test mockDriveClient) MUST expose both
 * `downloadFileBytes` and `getAgendaChips`, so a new caller can't silently skip
 * them (the failure mode enrichAgenda's optional-method guard would otherwise hide).
 */
import { describe, expect, test } from "vitest";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import { defaultDriveClient } from "@/lib/sync/runScheduledCronSync";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";

const IMPLS: ReadonlyArray<{ name: string; client: DriveClient }> = [
  { name: "defaultDriveClient (real)", client: defaultDriveClient() },
  { name: "mockDriveClient (dev/test)", client: mockDriveClient },
];

describe("DriveClient impl completeness — agenda methods", () => {
  test.each(IMPLS)("$name exposes downloadFileBytes + getAgendaChips", ({ client }) => {
    expect(typeof client.downloadFileBytes).toBe("function");
    expect(typeof client.getAgendaChips).toBe("function");
  });
});
