import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const lockHolderRegistry = [
  {
    path: "lib/sync/lockedShowTx.ts",
    holder: "withShowLock",
    layer: "JS-side transaction wrapper",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/runScheduledCronSync.ts",
    holder: "processOneFile",
    layer: "prepares Drive data before withShowLock; processOneFile_unlocked never locks",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/runManualSyncForShow.ts",
    holder: "runManualSyncForShow",
    layer:
      "fetches Drive metadata before delegating final DB writes to withPostgresSyncPipelineLock",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/applyStaged.ts",
    holder: "applyStaged",
    layer: "delegates to withPostgresSyncPipelineLock; applyStaged_unlocked never locks",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/discardStaged.ts",
    holder: "discardStaged",
    layer: "delegates to withPostgresSyncPipelineLock; discardStaged_unlocked never locks",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/runOnboardingScan.ts",
    holder: "runOnboardingScan",
    layer: "wraps each prepared file write transaction with withShowLock; Drive prep stays outside",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/runPushSyncForShow.ts",
    holder: "runPushSyncForShow",
    layer: "delegates to processOneFile, which delegates to withShowLock; no second holder",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/assetRecovery.ts",
    holder: "assetRecovery",
    layer: "prepares verified asset bytes before delegating final DB writes to withShowLock",
    key: "hashtext('show:' || drive_file_id)",
  },
] as const;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function tsFiles(path: string): string[] {
  const absolute = join(root, path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...tsFiles(child));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}

function functionText(source: string, functionName: string): string {
  const start = source.search(new RegExp(`(?:export\\s+)?async\\s+function\\s+${functionName}\\b`));
  if (start < 0) throw new Error(`${functionName} not found`);
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) throw new Error(`${functionName} body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${functionName} body did not close`);
}

const protectedPreLockMutationPatterns = [
  {
    label: "Supabase mutator chain",
    pattern: /\.(?:delete|insert|update|upsert)\s*\(/i,
  },
  {
    label: "protected SQL mutation",
    pattern:
      /\b(?:delete\s+from|insert\s+into|update)\s+(?:public\.)?(?:deferred_ingestions|pending_syncs|pending_ingestions|shows|crew_members|crew_member_auth)\b/i,
  },
] as const;

type FunctionBody = {
  name: string;
  body: string;
};

const lockOrTxOpeners =
  /\b(?:withPostgresSyncPipelineLock|withPostgresShowLock|withShowLock|withPipelineLock|withDefaultTx|withTx|runTx|lock)\s*\(/g;

const driveInvocation =
  /\b(?:fetchDriveFileMetadata|fetchSheetAsMarkdownAtRevision|retryEmbeddedRevisionAvailability|listDriveFolder|getDriveClient|defaultDriveClient|defaultCaptureBinding|fetchMarkdownAtRevision|captureBinding|enrichWithDrivePins|driveClient)\s*\(|\bdrive\./;

function balancedSlice(source: string, openIndex: number, open: string, close: string): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }
  return source.slice(openIndex);
}

function extractExpression(source: string, start: number): string {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    if (char === ")" || char === "}" || char === "]") {
      if (depth === 0) return source.slice(start, index);
      depth -= 1;
    }
    if (depth === 0 && char === ",") return source.slice(start, index);
  }
  return source.slice(start);
}

function extractArrowBodies(callText: string): string[] {
  const bodies: string[] = [];
  let searchFrom = 0;
  while (searchFrom < callText.length) {
    const arrow = callText.indexOf("=>", searchFrom);
    if (arrow < 0) break;
    let bodyStart = arrow + 2;
    while (/\s/.test(callText[bodyStart] ?? "")) bodyStart += 1;
    if (callText[bodyStart] === "{") {
      const body = balancedSlice(callText, bodyStart, "{", "}");
      bodies.push(body);
      searchFrom = bodyStart + body.length;
    } else {
      const body = extractExpression(callText, bodyStart);
      bodies.push(body);
      searchFrom = bodyStart + body.length;
    }
  }
  return bodies;
}

function extractLockCallbackBodies(body: string): string[] {
  const callbacks: string[] = [];
  for (const match of body.matchAll(lockOrTxOpeners)) {
    const openIndex = match.index! + match[0].lastIndexOf("(");
    const callText = balancedSlice(body, openIndex, "(", ")");
    callbacks.push(...extractArrowBodies(callText));
  }
  return callbacks;
}

function extractFunctions(source: string): Map<string, FunctionBody> {
  const functions = new Map<string, FunctionBody>();
  const declarationPattern = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/g;
  for (const match of source.matchAll(declarationPattern)) {
    const name = match[1];
    if (!name) continue;
    const paramsStart = source.indexOf("(", match.index);
    const params = paramsStart >= 0 ? balancedSlice(source, paramsStart, "(", ")") : "";
    const bodyStart = source.indexOf("{", paramsStart + params.length);
    if (bodyStart < 0) continue;
    functions.set(name, {
      name,
      body: balancedSlice(source, bodyStart, "{", "}"),
    });
  }

  const constArrowPattern =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:<[^>]+>\s*)?\([^)]*\)\s*=>\s*{/g;
  for (const match of source.matchAll(constArrowPattern)) {
    const name = match[1];
    if (!name) continue;
    const arrow = source.indexOf("=>", match.index);
    const bodyStart = source.indexOf("{", arrow);
    if (bodyStart < 0) continue;
    functions.set(name, {
      name,
      body: balancedSlice(source, bodyStart, "{", "}"),
    });
  }

  return functions;
}

function calledLocalFunctions(fragment: string, functions: Map<string, FunctionBody>): string[] {
  const names = new Set<string>();
  for (const match of fragment.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (!name) continue;
    if (functions.has(name)) names.add(name);
  }
  return [...names];
}

function reachesDriveInvocation(
  fragment: string,
  functions: Map<string, FunctionBody>,
  seen = new Set<string>(),
): string | null {
  if (driveInvocation.test(fragment)) return "<locked fragment>";
  for (const name of calledLocalFunctions(fragment, functions)) {
    if (seen.has(name)) continue;
    seen.add(name);
    const reached = reachesDriveInvocation(functions.get(name)!.body, functions, seen);
    if (reached) return `${name} -> ${reached}`;
  }
  return null;
}

describe("M6 advisory-lock single-holder contract", () => {
  test("every M6 sync lock path is registered with the drive_file_id hashkey", () => {
    expect(lockHolderRegistry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          holder: "withShowLock",
          key: "hashtext('show:' || drive_file_id)",
        }),
        expect.objectContaining({
          holder: "processOneFile",
          layer: expect.stringContaining("prepares Drive data before withShowLock"),
        }),
        expect.objectContaining({
          holder: "runManualSyncForShow",
          layer: expect.stringContaining("Drive metadata before"),
        }),
        expect.objectContaining({
          holder: "applyStaged",
          layer: expect.stringContaining("applyStaged_unlocked never locks"),
        }),
        expect.objectContaining({
          holder: "discardStaged",
          layer: expect.stringContaining("discardStaged_unlocked never locks"),
        }),
        expect.objectContaining({
          holder: "runOnboardingScan",
          layer: expect.stringContaining("withShowLock"),
          key: "hashtext('show:' || drive_file_id)",
        }),
        expect.objectContaining({
          holder: "runPushSyncForShow",
          layer: expect.stringContaining("delegates to processOneFile"),
        }),
        expect.objectContaining({
          holder: "assetRecovery",
          layer: expect.stringContaining("before delegating final DB writes to withShowLock"),
          key: "hashtext('show:' || drive_file_id)",
        }),
      ]),
    );
    for (const entry of lockHolderRegistry) {
      expect(read(entry.path), `${entry.holder} registry row points at missing source`).toContain(
        entry.holder,
      );
    }
  });

  test("only lockedShowTx issues pg_advisory lock SQL in M6 runtime-owned code", () => {
    const runtimeSources = [
      ...tsFiles("lib/sync"),
      ...tsFiles("lib/drive"),
      ...tsFiles("app/api/cron"),
      ...tsFiles("app/api/drive"),
      ...tsFiles("app/api/admin/sync"),
      ...tsFiles("app/api/admin/staged"),
    ];
    const holders = runtimeSources
      .filter((path) => /\bpg_(?:try_)?advisory_xact_lock\s*\(/i.test(read(path)))
      .sort();

    expect(holders).toEqual(["lib/sync/lockedShowTx.ts"]);
    const source = read("lib/sync/lockedShowTx.ts");
    expect(source).toContain("hashtext('show:' ||");
    expect(source).not.toMatch(/show_id|slug/i);
  });

  test("registered pre-lock sync gates are read-only for protected per-show tables", () => {
    const runScheduledCronSync = read("lib/sync/runScheduledCronSync.ts");
    const runPushSyncForShow = read("lib/sync/runPushSyncForShow.ts");
    const runManualSyncForShow = read("lib/sync/runManualSyncForShow.ts");
    const runOnboardingScan = read("lib/sync/runOnboardingScan.ts");
    const surfaces = [
      {
        label: "cron/push/manual processOneFile prepareProcessOneFile",
        source: functionText(runScheduledCronSync, "prepareProcessOneFile"),
      },
      {
        label: "cron/push automatic perFileProcessor gate module",
        source: read("lib/sync/perFileProcessor.ts"),
      },
      {
        label: "push duplicate preflight",
        source: functionText(runPushSyncForShow, "readPushDuplicatePreflight"),
      },
      {
        label: "manual sync pre-lock wrapper",
        source: functionText(runManualSyncForShow, "runManualSyncForShow"),
      },
      {
        label: "onboarding Drive/parser preparation",
        source: functionText(runOnboardingScan, "prepareOnboardingFiles"),
      },
    ];

    for (const surface of surfaces) {
      for (const mutation of protectedPreLockMutationPatterns) {
        expect(
          surface.source,
          `${surface.label} must not contain pre-lock ${mutation.label}`,
        ).not.toMatch(mutation.pattern);
      }
    }
  });

  test("no advisory-lock or postgres-transaction window can reach Drive helpers", () => {
    const roots = ["lib/sync", "lib/drive", "lib/asset"];
    const violations: string[] = [];

    for (const path of roots.flatMap(tsFiles).sort()) {
      const source = read(path);
      const functions = extractFunctions(source);
      for (const fn of functions.values()) {
        const lockedFragments = [
          ...(fn.body.includes("assertShowLockHeld(") ? [fn.body] : []),
          ...extractLockCallbackBodies(fn.body),
        ];
        for (const fragment of lockedFragments) {
          const reached = reachesDriveInvocation(fragment, functions);
          if (reached) {
            violations.push(`${path}::${fn.name} reaches ${reached}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
