/**
 * tests/sync/prepareOnboardingFilesErrorKind.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §4.2, §5 test 12)
 *
 * prepareOnboardingFiles fails for two materially different reasons, and both used
 * to reach Doug as "we couldn't fetch this from Google Drive, check your share
 * settings" (BL-RESCAN-PREPARE-ERROR-GRANULARITY). This pins which faults are
 * re-classified as sheet-content faults and — just as important — which are NOT.
 *
 * The deliberate asymmetry (whole-diff R2 finding 7): only a POSITIVELY identified
 * sheet-content fault becomes `parse`. A bug inside a post-parse helper is not
 * something Doug can fix by editing his sheet, so it keeps today's code rather than
 * acquiring a new, differently wrong instruction.
 */
import { describe, expect, test } from "vitest";

import {
  synthesizeMarkdownFromXlsx,
  WorkbookSynthesisError,
} from "@/lib/drive/exportSheetToMarkdown";
import { DriveFetchError } from "@/lib/drive/fetch";
import { buildXlsx } from "../helpers/buildXlsx";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import {
  prepareOnboardingFiles,
  PrepareOnboardingFileError,
  type RunOnboardingScanDeps,
} from "@/lib/sync/runOnboardingScan";

const SHEET: DriveListedFile = {
  driveFileId: "sheet-1",
  name: "II - Fixture Show",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-07-24T00:00:00.000Z",
  parents: ["folder-1"],
  headRevisionId: "rev-1",
  md5Checksum: "",
};

const EMPTY_PARSE = {
  show: { title: "Fixture" },
  crew: [],
  warnings: [],
  archivedPullSheetTabs: [],
} as unknown as ParsedSheet;

/** Deps where every leaf succeeds; individual tests replace exactly one. */
function baseDeps(overrides: Partial<RunOnboardingScanDeps> = {}): RunOnboardingScanDeps {
  return {
    listFolder: async () => [SHEET],
    fetchMarkdownWithBinding: async () => ({
      binding: { bindingToken: "rev-1", modifiedTime: SHEET.modifiedTime },
      markdown: "| SHOW | Fixture |",
      bytes: undefined,
      archivedPullSheetTabs: [],
    }),
    parseSheet: () => EMPTY_PARSE,
    enrichWithDrivePins: async (parsed) => parsed as unknown as ParseResult,
    readPullSheetOverride: async () => null,
    readRoleTokenMappings: async () => [],
    listSheetGids: async () => new Map<string, number>(),
    ...overrides,
  } as RunOnboardingScanDeps;
}

async function kindOfFailure(deps: RunOnboardingScanDeps): Promise<{
  kind: string;
  cause: unknown;
  thrown: unknown;
  isPrepareError: boolean;
}> {
  try {
    await prepareOnboardingFiles("folder-1", deps);
    throw new Error("expected prepareOnboardingFiles to throw");
  } catch (err) {
    const isPrepareError = err instanceof PrepareOnboardingFileError;
    return {
      kind: isPrepareError ? (err as PrepareOnboardingFileError).kind : "NOT_CLASSIFIED",
      cause: isPrepareError ? (err as PrepareOnboardingFileError).cause : err,
      thrown: err,
      isPrepareError,
    };
  }
}

describe("prepareOnboardingFiles fault classification (spec §4.2)", () => {
  test("the happy path is untouched", async () => {
    const prepared = await prepareOnboardingFiles("folder-1", baseDeps());
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.kind).toBe("sheet");
  });

  test("a parser throw is a PARSE fault, with the cause preserved", async () => {
    const boom = new Error("unexpected section header");
    const result = await kindOfFailure(
      baseDeps({
        parseSheet: () => {
          throw boom;
        },
      }),
    );
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("parse");
    expect(result.cause).toBe(boom);
  });

  test("a NON-Error thrown by the parser is still a PARSE fault", async () => {
    // Site classification must not depend on the thrown value's type; an earlier
    // draft contradicted itself here (whole-diff R1 finding 2).
    const result = await kindOfFailure(
      baseDeps({
        parseSheet: () => {
          throw "boom";
        },
      }),
    );
    expect(result.kind).toBe("parse");
  });

  test("a corrupt workbook raised from INSIDE the Drive export is a PARSE fault", async () => {
    // THE case a site-only classifier gets wrong (whole-diff R1 finding 1):
    // synthesizeMarkdownFromXlsx runs inside fetchSheetMarkdownWithBinding, so this
    // throw happens after Drive has already succeeded.
    const result = await kindOfFailure(
      baseDeps({
        fetchMarkdownWithBinding: async () => {
          throw new WorkbookSynthesisError("workbook could not be read: bad zip");
        },
      }),
    );
    expect(result.kind).toBe("parse");
  });

  test("a Drive export transport failure is a DRIVE_FETCH fault", async () => {
    const result = await kindOfFailure(
      baseDeps({
        fetchMarkdownWithBinding: async () => {
          throw new Error("socket hang up");
        },
      }),
    );
    expect(result.kind).toBe("drive_fetch");
  });

  test("a folder-listing failure is a DRIVE_FETCH fault", async () => {
    const result = await kindOfFailure(
      baseDeps({
        listFolder: async () => {
          throw new Error("403 insufficient permissions");
        },
      }),
    );
    expect(result.kind).toBe("drive_fetch");
  });

  test("an enrichment failure is a DRIVE_FETCH fault (it is a Drive-pin read)", async () => {
    const result = await kindOfFailure(
      baseDeps({
        enrichWithDrivePins: async () => {
          throw new Error("drive pins unavailable");
        },
      }),
    );
    expect(result.kind).toBe("drive_fetch");
  });

  test("a throwing onProgress adapter is classified, not leaked raw", async () => {
    // whole-diff R2 finding 6: a synchronous callback fault used to escape the
    // contract entirely, so a caller matching on `kind` saw an unclassified error.
    const result = await kindOfFailure(
      baseDeps({
        onProgress: () => {
          throw new Error("stream closed");
        },
      }),
    );
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("drive_fetch");
  });

  test("a synchronously throwing readRoleTokenMappings is classified too", async () => {
    // The default degrades via .catch(), but that only covers a REJECTED promise —
    // an adapter that throws at invocation propagates (whole-diff R2 finding 6).
    const result = await kindOfFailure(
      baseDeps({
        readRoleTokenMappings: (): never => {
          throw new Error("adapter exploded");
        },
      }),
    );
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("drive_fetch");
  });

  test("a REJECTED readRoleTokenMappings still degrades to no overlay (best-effort, unchanged)", async () => {
    // Distinct from the synchronous-throw case above: the default loader's
    // `.catch(() => [])` covers a rejected promise, and that must stay true — the
    // overlay is best-effort and must never wedge the pre-lock prepare.
    const prepared = await prepareOnboardingFiles(
      "folder-1",
      baseDeps({
        readRoleTokenMappings: async () => {
          throw new Error("mapping read failed");
        },
      }),
    );
    expect(prepared).toHaveLength(1);
  });

  test("an applyRoleTokenMappings fault is an INTERNAL fault, not Drive and not fix-your-sheet", async () => {
    // BL-PREPARE-INTERNAL-FAULT-KIND (spec 2026-08-09-m-wave-2-design §2.3):
    // applyRoleTokenMappings runs on an ALREADY-PARSED result (it structuredClones
    // it first). A fault there is recovered by a code fix, not by Doug editing his
    // sheet OR his share settings — both prior labels were wrong instructions.
    // A non-cloneable parse result reproduces exactly that internal fault.
    const nonCloneable = { ...EMPTY_PARSE, onSomething: () => undefined } as unknown as ParsedSheet;
    const result = await kindOfFailure(baseDeps({ parseSheet: () => nonCloneable }));
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("internal");
  });

  test("a finalizeArchivedTabs fault is an INTERNAL fault", async () => {
    // finalizeArchivedTabs pushes archived-tab warnings onto the parse result; a
    // frozen warnings array reproduces an internal fault at exactly that step
    // (after enrich succeeded, before any override reconcile).
    const result = await kindOfFailure(
      baseDeps({
        enrichWithDrivePins: async (parsed) =>
          ({
            ...parsed,
            warnings: Object.freeze([]) as unknown as ParseResult["warnings"],
          }) as unknown as ParseResult,
        fetchMarkdownWithBinding: async () => ({
          binding: { bindingToken: "rev-1", modifiedTime: SHEET.modifiedTime },
          markdown: "| SHOW | Fixture |",
          bytes: undefined,
          // One NOT-included archived tab → emitArchivedTabWarnings produces a
          // warning → the push into the frozen array throws inside finalize.
          archivedPullSheetTabs: [
            {
              tabName: "OLD PULL SHEET",
              headerPreviews: ["RIA - CHICAGO, IL"],
              fingerprint: "f".repeat(64),
              included: false,
              contentChangedSinceAccept: false,
            },
          ],
        }),
      }),
    );
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("internal");
  });

  test("a reconcileIncludedTab fault is an INTERNAL fault", async () => {
    // A poisoned tab list whose `filter` works (finalize passes) but whose `find`
    // throws reproduces an internal fault at exactly the reconcile step.
    const poisonedTabs = {
      filter: () => [],
      find: () => {
        throw new Error("reconcile exploded");
      },
    } as unknown as never[];
    const result = await kindOfFailure(
      baseDeps({
        readPullSheetOverride: async () => ({
          tabName: "OLD PULL SHEET",
          fingerprint: "f".repeat(64),
          acceptedBy: "doug@example.com",
          acceptedAt: "2026-08-01T00:00:00.000Z",
        }),
        fetchMarkdownWithBinding: async () => ({
          binding: { bindingToken: "rev-1", modifiedTime: SHEET.modifiedTime },
          markdown: "| SHOW | Fixture |",
          bytes: undefined,
          archivedPullSheetTabs: poisonedTabs,
        }),
      }),
    );
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("internal");
  });

  test("a fault inside discardAndRerun's re-parse fix-up path is an INTERNAL fault", async () => {
    // Drive the I5b discard path for real: an accepted override whose fingerprint
    // drifted (content_changed) over real workbook bytes, then a frozen warnings
    // array on the REPARSE result reproduces an internal fault inside the
    // discard-and-rerun helper (its re-finalize/fix-up work), after the wrapped
    // synthesize+parse steps succeeded.
    const bytes = buildXlsx([
      {
        name: "OLD PULL SHEET",
        grid: [
          ["PULL SHEET", "PULL SHEET"],
          ["RIA - CHICAGO, IL"],
          [],
          ["QTY", "ITEM"],
          ["2", "Shure SM58"],
        ],
      },
    ]);
    const liveTab = synthesizeMarkdownFromXlsx(bytes).archivedPullSheetTabs[0];
    if (!liveTab) throw new Error("fixture workbook produced no archived tab");
    let enrichCalls = 0;
    const result = await kindOfFailure(
      baseDeps({
        readPullSheetOverride: async () => ({
          tabName: liveTab.tabName,
          fingerprint: "0".repeat(64), // ≠ live fingerprint → content_changed
          acceptedBy: "doug@example.com",
          acceptedAt: "2026-08-01T00:00:00.000Z",
        }),
        fetchMarkdownWithBinding: async () => ({
          binding: { bindingToken: "rev-1", modifiedTime: SHEET.modifiedTime },
          markdown: "| SHOW | Fixture |",
          bytes,
          archivedPullSheetTabs: [liveTab],
        }),
        enrichWithDrivePins: async (parsed) => {
          enrichCalls += 1;
          if (enrichCalls === 1) return parsed as unknown as ParseResult;
          // The reparse inside discardAndRerun: freeze warnings so the helper's
          // own post-parse work (re-finalize + content-changed fix-up) throws.
          return {
            ...parsed,
            warnings: Object.freeze([]) as unknown as ParseResult["warnings"],
          } as unknown as ParseResult;
        },
      }),
    );
    expect(enrichCalls).toBe(2);
    expect(result.isPrepareError).toBe(true);
    expect(result.kind).toBe("internal");
  });

  test("identity still beats the internal site: a DriveFetchError from a helper stays drive_fetch", async () => {
    // The internal wrap must not swallow identity classification — a real Drive
    // fault surfacing through a wrapped helper is still a Drive fault.
    const poisonedTabs = {
      filter: () => [],
      find: () => {
        throw new DriveFetchError("revision token changed");
      },
    } as unknown as never[];
    const result = await kindOfFailure(
      baseDeps({
        readPullSheetOverride: async () => ({
          tabName: "OLD PULL SHEET",
          fingerprint: "f".repeat(64),
          acceptedBy: "doug@example.com",
          acceptedAt: "2026-08-01T00:00:00.000Z",
        }),
        fetchMarkdownWithBinding: async () => ({
          binding: { bindingToken: "rev-1", modifiedTime: SHEET.modifiedTime },
          markdown: "| SHOW | Fixture |",
          bytes: undefined,
          archivedPullSheetTabs: poisonedTabs,
        }),
      }),
    );
    expect(result.kind).toBe("drive_fetch");
  });

  test("a DriveFetchError escaping a PARSE site is still a drive fault (whole-diff finding 6)", async () => {
    // Identity has to beat site in both directions: an injected parser that fetches
    // would otherwise persist a transport failure as STAGED_PARSE_FAILED and tell
    // Doug to fix his sheet's structure.
    const result = await kindOfFailure(
      baseDeps({
        parseSheet: () => {
          throw new DriveFetchError("revision token changed");
        },
      }),
    );
    expect(result.kind).toBe("drive_fetch");
  });

  test("an already-classified fault is never re-wrapped", async () => {
    const original = new PrepareOnboardingFileError("parse", "already classified");
    const result = await kindOfFailure(
      baseDeps({
        fetchMarkdownWithBinding: async () => {
          throw original;
        },
      }),
    );
    // Identity, not just kind: re-wrapping with the same kind and an empty cause
    // would satisfy a kind-only assertion.
    expect(result.thrown).toBe(original);
    expect(result.kind).toBe("parse");
  });
});
