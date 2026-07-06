import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as driveList from "@/lib/drive/list";
import { log } from "@/lib/log";
import { emitUnexpectedParentWarning } from "@/lib/sync/logUnexpectedParent";

const WARNING = {
  code: "UNEXPECTED_PARENT" as const,
  driveFileId: "file-1",
  folderId: "folder-1",
  parents: ["other-folder"],
};

describe("Unit A — UNEXPECTED_PARENT coded log", () => {
  it("emitUnexpectedParentWarning writes the coded log.warn (shared helper)", () => {
    const warnSpy = vi.spyOn(log, "warn").mockResolvedValue(undefined);
    emitUnexpectedParentWarning(WARNING);
    expect(warnSpy).toHaveBeenCalledWith(
      "Dropped sheet with unexpected parent folder",
      expect.objectContaining({
        source: "sync.list",
        code: "UNEXPECTED_PARENT",
        drive_file_id: "file-1",
        folder_id: "folder-1",
        parents: ["other-folder"],
      }),
    );
    warnSpy.mockRestore();
  });

  it("prepareOnboardingFiles default branch wires onWarning into the real drive listing", async () => {
    const warnSpy = vi.spyOn(log, "warn").mockResolvedValue(undefined);
    // Spy the real lib/drive/list.listFolder (aliased as listDriveFolder in the module): emit a
    // phantom-parent warning, return an empty list so the rest of the scan short-circuits.
    const listSpy = vi
      .spyOn(driveList, "listFolder")
      .mockImplementation(async (folderId: string, opts?: driveList.ListFolderOptions) => {
        // Invoke whatever onWarning the PRODUCTION default branch passed — NOT the helper directly.
        // If the wiring is absent, opts is undefined → onWarning never fires → warnSpy not called.
        opts?.onWarning?.({ ...WARNING, folderId });
        return [] as never;
      });
    const { prepareOnboardingFiles } = await import("@/lib/sync/runOnboardingScan");
    // deps OMITS listFolder → exercises the default branch. The warning fires synchronously during
    // the awaited listFolder (:949), before any later dep (e.g. defaultDriveClient) can throw — so
    // catch any downstream throw; the assertion is on the already-emitted warning.
    await prepareOnboardingFiles("folder-1", {} as never).catch(() => undefined);
    expect(warnSpy).toHaveBeenCalledWith(
      "Dropped sheet with unexpected parent folder",
      expect.objectContaining({ code: "UNEXPECTED_PARENT", drive_file_id: "file-1" }),
    );
    listSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // Cron site: full runScheduledCronSync setup is prohibitive (folder resolution, live-show reads).
  // Per the plan, assert the default-branch WIRING at its own site — that the cron listing default
  // routes emitUnexpectedParentWarning as onWarning (a showId:null-style regression would drop it).
  it("runScheduledCronSync default listing branch wires emitUnexpectedParentWarning", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    expect(src).toMatch(
      /deps\.listFolder \?\?[\s\S]{0,120}?listDriveFolder\([\s\S]{0,40}?onWarning:\s*emitUnexpectedParentWarning/,
    );
    expect(src).toContain("import { emitUnexpectedParentWarning }");
  });
});
