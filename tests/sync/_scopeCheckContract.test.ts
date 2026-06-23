import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";

type CallSite = {
  filePath: string;
  line: number;
  functionName: string;
  callee: string;
  functionText: string;
};

const ROOTS = ["lib/sync", "lib/drive", "app/api"];

const INTENTIONAL_EXCEPTIONS = new Map<string, string>([
  [
    "lib/drive/fetch.ts::fetchFileForExport",
    "raw Drive export wrapper; callers must perform scope admission before processing",
  ],
  [
    "lib/drive/fetch.ts::fetchDriveFileMetadata",
    "raw Drive metadata wrapper; entrypoints that process sheets must scope-check its result",
  ],
  [
    "lib/drive/fetch.ts::driveFilesGetCall",
    "raw transient-retry thunk over drive.files.get (BL-ONBOARDING-SCAN-TRANSIENT-THROTTLE-RETRY); the named fetch* wrappers it backs are themselves exempt and their callers perform scope admission",
  ],
  [
    "lib/drive/fetch.ts::fetchSheetAsMarkdown",
    "test-only helper documented @internal; production sync uses revision-bound fetches",
  ],
  [
    "lib/sync/runScheduledCronSync.ts::defaultCaptureBinding",
    "cron files arrive from listDriveFolder(watched_folder_id); this helper only captures a revision token",
  ],
  [
    "lib/sync/runScheduledCronSync.ts::getFile",
    "asset metadata lookup during enrichment, not sheet admission by drive_file_id",
  ],
  [
    "lib/sync/runOnboardingScan.ts::getFile",
    "asset metadata lookup during onboarding enrichment, not sheet admission by drive_file_id",
  ],
  [
    "lib/sync/verifyReelOnApply.ts::getFileMetadata",
    "opening-reel metadata re-verification during apply; this does not admit a sheet by drive_file_id",
  ],
  [
    "app/api/asset/reel/[show]/route.ts::GET",
    "opening-reel asset route streams a persisted immutable revision; this does not process sheets",
  ],
  [
    "app/api/asset/reel/[show]/route.ts::authorizeReelRequest",
    "reel-route auth helper extracted from GET; looks up metadata for a persisted opening_reel_drive_file_id pin and does not admit sheets",
  ],
  [
    "app/api/asset/agenda/[show]/[id]/route.ts::GET",
    "agenda PDF asset route streams bytes for a fileId already bound to shows.agenda_links; this does not admit or process sheets",
  ],
  [
    "app/api/asset/agenda/[show]/[id]/route.ts::authorizeAgendaRequest",
    "agenda-route auth helper extracted from GET; looks up metadata for a fileId already bound to shows.agenda_links and does not admit sheets",
  ],
  [
    "app/api/admin/onboarding/scan/route.ts::defaultVerifyFolder",
    "onboarding verify-folder route checks a folder id before any sheet admission; runOnboardingScan lists sheets from that pending_folder_id",
  ],
  [
    "lib/sync/holds/mi11GateActions.ts::approveMi11Hold",
    "MI-11 gate F13 two-stage Drive re-check: reads modifiedTime for an AUTHORITATIVE drive_file_id already bound to an existing sync_holds/shows row (resolved server-side, never client-supplied per PF23). This is a staleness re-verification of an already-admitted show, NOT sheet admission by drive_file_id — it never parses/processes the sheet, only compares the modtime inside the lock-taking RPC.",
  ],
]);

function walkTsFiles(dir: string): string[] {
  const entries = readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walkTsFiles(fullPath);
    if (stat.isFile() && /\.tsx?$/.test(entry)) return [fullPath];
    return [];
  });
  return entries.sort();
}

function lineFor(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function functionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node)) return node.name?.text ?? "<anonymous>";
  if (ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    if (node.parent && ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    if ("name" in node && node.name && ts.isIdentifier(node.name)) return node.name.text;
    return "<anonymous>";
  }
  return null;
}

function containingFunction(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isSingleSheetMetadataFetch(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  const callee = node.expression.getText(sourceFile);
  if (callee.includes("fetchDriveFileMetadata")) return true;
  if (callee === "fetchDriveFileMetadata") return true;
  if (callee.endsWith(".fetchDriveFileMetadata")) return true;
  if (callee === "fetchMetadata") return true;
  if (callee.endsWith(".files.get")) return true;
  return false;
}

function collectCallSites(filePath: string): CallSite[] {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const callSites: CallSite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isSingleSheetMetadataFetch(node, sourceFile)) {
      const container = containingFunction(node);
      const name = container ? functionName(container) : null;
      callSites.push({
        filePath,
        line: lineFor(sourceFile, node.getStart(sourceFile)),
        functionName: name ?? "<top-level>",
        callee: node.expression.getText(sourceFile),
        functionText: container?.getText(sourceFile) ?? sourceText,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return callSites;
}

function hasScopeCheck(functionText: string): boolean {
  const readsActiveFolder =
    /getActiveWatchedFolderId|readWatchedFolderId|readPendingFolderId|watchedFolderId|pendingFolderId/.test(
      functionText,
    );
  const checksParents =
    /parents\.includes\(\s*(watchedFolderId|pendingFolderId)\s*\)/.test(functionText) ||
    /metadata\.parents\.includes\(\s*(watchedFolderId|pendingFolderId)\s*\)/.test(functionText) ||
    /fileMeta\.parents\.includes\(\s*watchedFolderId\s*\)/.test(functionText);
  return readsActiveFolder && checksParents;
}

describe("single-sheet metadata fetch scope contract", () => {
  test("sheet-processing entrypoints verify Drive parents against watched or pending folder before processing", () => {
    const callSites = ROOTS.flatMap((root) => walkTsFiles(root)).flatMap(collectCallSites);
    const violations = callSites.filter((site) => {
      const exceptionKey = `${site.filePath}::${site.functionName}`;
      return !INTENTIONAL_EXCEPTIONS.has(exceptionKey) && !hasScopeCheck(site.functionText);
    });

    expect(
      violations.map((site) => ({
        filePath: site.filePath,
        line: site.line,
        functionName: site.functionName,
        callee: site.callee,
      })),
    ).toEqual([]);
  });
});
