/**
 * Role-mapping overlay + always-written consumed-token stamp at the wizard staging
 * chokepoint (spec 2026-07-16-role-vocab-staging-overlay §3.1-§3.2 / §7 items 1-5).
 *
 * All assertions target the PREPARED PARSE DATA (warnings / role_flags / stamp),
 * never a renderer (anti-tautology). Expected grants derive from the injected
 * mapping fixture, never hardcoded elsewhere.
 */
import { describe, expect, it, vi } from "vitest";

import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import type { ParseResult, ParseWarning, ParsedSheet } from "@/lib/parser/types";
import type { RoleTokenMapping } from "@/lib/sync/roleMappingOverlay";
import type { DriveListedFile } from "@/lib/drive/list";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { crew, parseResult as buildParseResult } from "@/tests/sync/_holdAwareTestkit";
import { buildXlsx } from "../helpers/buildXlsx";

const attachSpy = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/sync/attachWarningAnchors", () => ({ attachWarningAnchors: attachSpy }));

const TOKEN = "NEWROLE";

const mapping = (): RoleTokenMapping => ({
  token: TOKEN,
  grants: ["A1"],
  decidedBy: "doug@fxav.com",
  decidedAt: "2026-07-16T00:00:00.000Z",
});

function unknownWarning(index: number, name: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `Unrecognized role "${TOKEN}"`,
    rawSnippet: TOKEN,
    roleToken: TOKEN,
    blockRef: { kind: "crew", index, name },
  };
}

/** A fresh warning-bearing parse for each enrich call (the overlay clones, but keep inputs independent). */
function warnedParse(): ParseResult {
  const pr = buildParseResult([crew("Pat", { role_flags: [] })]);
  pr.warnings = [unknownWarning(0, "Pat")];
  return pr;
}

const sheetFile = (id: string): DriveListedFile => ({
  driveFileId: id,
  name: `${id}.xlsx`,
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-07-16T12:00:00.000Z",
  parents: ["folder-1"],
});

function harness(opts: {
  files?: DriveListedFile[];
  mappings?: () => Promise<RoleTokenMapping[]>;
  parse?: () => ParseResult;
}) {
  const readRoleTokenMappings = vi.fn(opts.mappings ?? (async () => [mapping()]));
  const deps = {
    listFolder: vi.fn(async () => opts.files ?? [sheetFile("show-1")]),
    fetchMarkdownWithBinding: vi.fn(async () => ({
      binding: { bindingToken: "tok-1", modifiedTime: "2026-07-16T12:00:00.000Z" },
      markdown: "md",
    })),
    parseSheet: vi.fn(() => ({}) as unknown as ParsedSheet),
    enrichWithDrivePins: vi.fn(async () => (opts.parse ?? warnedParse)()),
    listSheetGids: vi.fn(async () => new Map<string, number>()),
    driveClient: {} as never,
    readPullSheetOverride: vi.fn(async () => null),
    readRoleTokenMappings,
  };
  return { deps, readRoleTokenMappings };
}

describe("prepareOnboardingFiles — overlay + stamp (spec §3.2)", () => {
  it("consumes the mapped warning, unions grants, and stamps the consumed token", async () => {
    const { deps } = harness({});
    const [prepared] = await prepareOnboardingFiles("folder-1", deps);
    if (prepared!.kind !== "sheet") throw new Error("expected sheet");
    expect(prepared.parseResult.warnings.some((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toBe(false);
    expect(prepared.parseResult.crewMembers[0]!.role_flags).toContain("A1");
    expect(prepared.parseResult.appliedRoleMappings).toEqual([{ token: TOKEN, grants: ["A1"] }]);
  });

  it("loads the vocabulary ONCE per scan (multi-sheet folder)", async () => {
    const { deps, readRoleTokenMappings } = harness({
      files: [sheetFile("show-1"), sheetFile("show-2")],
    });
    await prepareOnboardingFiles("folder-1", deps);
    expect(readRoleTokenMappings).toHaveBeenCalledTimes(1);
  });

  it("loader fault degrades to no-overlay (warning kept, no grants) with the [] stamp", async () => {
    const { deps } = harness({
      mappings: async () => {
        throw new Error("db down");
      },
    });
    // The DEFAULT loader catches its own faults; the dep contract mirrors it — the
    // chokepoint must also survive a throwing injected loader (belt and suspenders).
    const [prepared] = await prepareOnboardingFiles("folder-1", deps);
    if (prepared!.kind !== "sheet") throw new Error("expected sheet");
    expect(prepared.parseResult.warnings.some((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toBe(true);
    expect(prepared.parseResult.crewMembers[0]!.role_flags).not.toContain("A1");
    expect(prepared.parseResult.appliedRoleMappings).toEqual([]);
  });

  it("stamps [] (key present) when nothing is consumed", async () => {
    const { deps } = harness({ mappings: async () => [] });
    const [prepared] = await prepareOnboardingFiles("folder-1", deps);
    if (prepared!.kind !== "sheet") throw new Error("expected sheet");
    expect(prepared.parseResult.appliedRoleMappings).toEqual([]);
  });

  it("the discard-rerun (I5b) branch output is ALSO post-overlay + stamped", async () => {
    // Real OLD-tab bytes so reconcileIncludedTab sees content drift vs the accepted fingerprint.
    const bytes = buildXlsx([
      {
        name: "OLD PULL SHEET",
        grid: [["PULL SHEET", "PULL SHEET"], ["RIA"], [], ["QTY", "ITEM"], ["2", "Shure SM58"]],
      },
    ]);
    const tabs = synthesizeMarkdownFromXlsx(bytes).archivedPullSheetTabs;
    const { deps } = harness({});
    deps.fetchMarkdownWithBinding = vi.fn(async () => ({
      binding: { bindingToken: "tok-1", modifiedTime: "2026-07-16T12:00:00.000Z" },
      markdown: "md",
      bytes,
      archivedPullSheetTabs: tabs,
    })) as never;
    deps.readPullSheetOverride = vi.fn(async () => ({
      tabName: "OLD PULL SHEET",
      fingerprint: "stale-fingerprint-forcing-content-changed",
      acceptedBy: "doug@fxav.com",
      acceptedAt: "2026-07-16T00:00:00.000Z",
    }));
    const [prepared] = await prepareOnboardingFiles("folder-1", deps);
    if (prepared!.kind !== "sheet") throw new Error("expected sheet");
    // The re-parse (no-override) path produced a fresh warned parse; the overlay must
    // still have consumed it — the R13 bug shape is overlay-on-normal-branch-only.
    expect(prepared.parseResult.warnings.some((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toBe(false);
    expect(prepared.parseResult.appliedRoleMappings).toEqual([{ token: TOKEN, grants: ["A1"] }]);
    expect(prepared.pullSheetOverrideCleared).toBe(true);
  });

  it("anchor attachment receives the POST-overlay warnings (consumed warning never gets anchor work)", async () => {
    attachSpy.mockClear();
    const { deps } = harness({
      parse: () => {
        const pr = warnedParse();
        pr.warnings.push({
          severity: "warn",
          code: "FIELD_UNREADABLE",
          message: "kept",
          rawSnippet: "x",
        } as ParseWarning);
        return pr;
      },
    });
    const [prepared] = await prepareOnboardingFiles("folder-1", deps);
    if (prepared!.kind !== "sheet") throw new Error("expected sheet");
    const [warningsArg] = attachSpy.mock.calls[0]! as unknown as [ParseWarning[]];
    expect(warningsArg.some((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toBe(false);
    expect(warningsArg.some((w) => w.code === "FIELD_UNREADABLE")).toBe(true);
    expect(warningsArg).toBe(prepared.parseResult.warnings); // same array the staged parse carries
  });
});
