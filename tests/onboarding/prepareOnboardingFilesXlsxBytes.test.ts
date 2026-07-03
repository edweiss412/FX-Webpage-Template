import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import type { ParseResult, ParsedSheet } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";

const sampleXlsx = (): ArrayBuffer => {
  const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

const file: DriveListedFile = {
  driveFileId: "show-1",
  name: "show-1.xlsx",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-05-08T12:00:00.000Z",
  parents: ["folder-1"],
};

type Ctx = { xlsxBytes?: ArrayBuffer };

function harness(bytes?: ArrayBuffer) {
  let captured: Ctx | undefined;
  const enrichWithDrivePins = vi.fn(async (_p: ParsedSheet, _c: unknown, ctx: Ctx) => {
    captured = ctx;
    return { warnings: [] } as unknown as ParseResult;
  });
  const deps = {
    listFolder: vi.fn(async () => [file]),
    fetchMarkdownWithBinding: vi.fn(async () => ({
      binding: { bindingToken: "tok-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
      markdown: "md",
      ...(bytes ? { bytes } : {}),
    })),
    parseSheet: vi.fn(() => ({}) as unknown as ParsedSheet),
    enrichWithDrivePins,
    listSheetGids: vi.fn(async () => new Map<string, number>()),
    driveClient: {} as never,
  };
  return { deps, getCtx: () => captured };
}

describe("prepareOnboardingFiles — xlsx bytes reach enrich (onboarding + wizard-restage path)", () => {
  it("forwards the fetched xlsx bytes into enrichWithDrivePins ctx.xlsxBytes", async () => {
    const bytes = sampleXlsx();
    const { deps, getCtx } = harness(bytes);
    await prepareOnboardingFiles("folder-1", deps);
    // The concrete failure this catches: the onboarding/wizard-restage path drops
    // embedded diagrams by not threading the export bytes into the enrich ctx.
    expect(getCtx()?.xlsxBytes).toBe(bytes);
  });

  it("omits xlsxBytes when the fetch returns no bytes (absent, not undefined)", async () => {
    const { deps, getCtx } = harness(undefined);
    await prepareOnboardingFiles("folder-1", deps);
    const ctx = getCtx()!;
    expect("xlsxBytes" in ctx).toBe(false);
  });
});
