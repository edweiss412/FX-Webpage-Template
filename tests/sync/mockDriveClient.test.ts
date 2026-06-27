/**
 * tests/sync/mockDriveClient.test.ts (agenda Phase B, Task 9)
 *
 * The dev/test mockDriveClient implements the two agenda Drive methods with a
 * deterministic fixture map, including the infra_error / unavailable branches so
 * the dev-preview path and the enrichAgenda unit tests have full coverage of the
 * discriminated unions.
 */
import { describe, expect, test } from "vitest";
import {
  mockDriveClient,
  MOCK_AGENDA_SPREADSHEET_INFRA,
  MOCK_AGENDA_FILE_UNAVAILABLE,
  MOCK_AGENDA_FILE_INFRA,
} from "@/lib/sync/mocks/mockDriveClient";

describe("mockDriveClient — agenda methods", () => {
  test("exposes both agenda Drive methods", () => {
    expect(typeof mockDriveClient.getAgendaChips).toBe("function");
    expect(typeof mockDriveClient.downloadFileBytes).toBe("function");
  });

  test("getAgendaChips: default spreadsheet → deterministic { kind: 'rows' }", async () => {
    const result = await mockDriveClient.getAgendaChips!("any-sheet");
    expect(result.kind).toBe("rows");
    expect(result.kind === "rows" && result.rows.length).toBeGreaterThanOrEqual(1);
  });

  test("getAgendaChips: infra fixture → { kind: 'infra_error' }", async () => {
    expect(await mockDriveClient.getAgendaChips!(MOCK_AGENDA_SPREADSHEET_INFRA)).toEqual({
      kind: "infra_error",
    });
  });

  test("downloadFileBytes: default fileId → { kind: 'bytes' } with non-empty bytes", async () => {
    const result = await mockDriveClient.downloadFileBytes!("any-file");
    expect(result.kind).toBe("bytes");
    expect(result.kind === "bytes" && result.bytes.length).toBeGreaterThan(0);
  });

  test("downloadFileBytes: unavailable fixture → { kind: 'unavailable' }", async () => {
    expect(await mockDriveClient.downloadFileBytes!(MOCK_AGENDA_FILE_UNAVAILABLE)).toEqual({
      kind: "unavailable",
    });
  });

  test("downloadFileBytes: infra fixture → { kind: 'infra_error' }", async () => {
    expect(await mockDriveClient.downloadFileBytes!(MOCK_AGENDA_FILE_INFRA)).toEqual({
      kind: "infra_error",
    });
  });
});
