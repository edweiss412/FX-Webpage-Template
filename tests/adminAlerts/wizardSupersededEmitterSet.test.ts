import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * tests/adminAlerts/wizardSupersededEmitterSet.test.ts (Task 7 / Codex P13)
 *
 * THE PROBLEM:
 *   tests/messages/_metaAdminAlertCatalog.test.ts already pins a LOOSE raise-site
 *   registry for WIZARD_SESSION_SUPERSEDED_RACE (retry + discard routes only —
 *   it predates the apply and manifest-ignore routes joining as producers). That
 *   registry answers "does this named file still contain this code somewhere",
 *   which is satisfied by ANY occurrence — including a stale comment — and does
 *   not enumerate ALL FOUR current emitters or assert anything about their
 *   `context` shape.
 *
 * THE STRUCTURAL GUARD:
 *   This test walks every source file under app/ and lib/, finds every
 *   `upsertAdminAlert({ ... })` call-block, filters to blocks whose `code` is
 *   the literal "WIZARD_SESSION_SUPERSEDED_RACE", and asserts:
 *     1. The set of files containing such a block is EXACTLY the four known
 *        routes (retry / staged-apply / staged-discard / manifest-ignore).
 *     2. Every such block's `context` object literal contains a `file_name` key
 *        (Task 7: the sheet-identity field the alert renderer reads).
 *
 *   A future 5th emitter, or an emitter whose context forgets `file_name`,
 *   fails this test. This is a SEPARATE, stricter guard from the existing
 *   _metaAdminAlertCatalog.test.ts registry — it does not replace it.
 */

const ROOTS = ["app", "lib"];
const EXTENSIONS = [".ts", ".tsx"];

const KNOWN_EMITTER_FILES = new Set([
  join("app", "api", "admin", "onboarding", "pending_ingestions", "[id]", "retry", "route.ts"),
  join(
    "app",
    "api",
    "admin",
    "onboarding",
    "staged",
    "[wizardSessionId]",
    "[driveFileId]",
    "apply",
    "route.ts",
  ),
  join(
    "app",
    "api",
    "admin",
    "onboarding",
    "staged",
    "[wizardSessionId]",
    "[driveFileId]",
    "discard",
    "route.ts",
  ),
  join(
    "app",
    "api",
    "admin",
    "onboarding",
    "manifest",
    "[wizardSessionId]",
    "[driveFileId]",
    "ignore",
    "route.ts",
  ),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, out);
    } else if (EXTENSIONS.some((ext) => full.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const WIZARD_RACE_CODE = /code:\s*"WIZARD_SESSION_SUPERSEDED_RACE"/g;
const FILE_NAME_KEY = /\bfile_name\s*:/;

/**
 * Given the index of a `code: "WIZARD_SESSION_SUPERSEDED_RACE"` match, find the
 * enclosing object-literal block (the `{ showId, code, context }` argument
 * object). Callers in this codebase invoke upsertAdminAlert via
 * `(routeDeps.upsertAdminAlert ?? defaultUpsertAdminAlert)({...})` — the call
 * paren does NOT immediately follow the literal text "upsertAdminAlert(", so a
 * regex anchored on that text misses every real call site. Walking outward from
 * the code-literal match via brace-depth counting is robust to that (and to any
 * other wrapper shape) while staying specific: the code string itself is unique
 * enough that no other admin_alerts producer or catalog entry collides with it
 * (catalog.ts keys the code as an OBJECT KEY, not a `code:` property, so it
 * never matches this regex at all).
 */
function findEnclosingBlock(source: string, matchIndex: number): string | null {
  let depth = 0;
  let openIndex = -1;
  for (let i = matchIndex; i >= 0; i--) {
    const ch = source[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        openIndex = i;
        break;
      }
      depth--;
    }
  }
  if (openIndex === -1) return null;
  depth = 1;
  let i = openIndex + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(openIndex, i);
}

// Every real admin_alerts producer call passes { showId, code, context }, so
// requiring a sibling `context:` key excludes the UNRELATED lib/messages/
// catalog.ts entry, which shares the code as its own `code:` self-reference
// field (`WIZARD_SESSION_SUPERSEDED_RACE: { code: "WIZARD_SESSION_SUPERSEDED_RACE",
// dougFacing: ..., ... }` — catalog metadata, never an admin_alerts write).
const CONTEXT_KEY = /\bcontext\s*:/;

function findWizardRaceBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(WIZARD_RACE_CODE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const block = findEnclosingBlock(source, match.index);
    if (block && CONTEXT_KEY.test(block)) blocks.push(block);
  }
  return blocks;
}

describe("WIZARD_SESSION_SUPERSEDED_RACE emitter-set structural guard", () => {
  const filesWithBlocks: Array<{ path: string; blocks: string[] }> = [];

  for (const root of ROOTS) {
    for (const path of walk(root)) {
      const source = readFileSync(path, "utf8");
      const blocks = findWizardRaceBlocks(source);
      if (blocks.length > 0) filesWithBlocks.push({ path, blocks });
    }
  }

  test("the auditor extracts the enclosing block through the real (x ?? default)({...}) call shape (self-test)", () => {
    const source = [
      "await (routeDeps.upsertAdminAlert ?? defaultUpsertAdminAlert)({",
      "  showId: null,",
      '  code: "WIZARD_SESSION_SUPERSEDED_RACE",',
      "  context: { attempted_action: 'apply', drive_file_id: 'x', file_name: 'y' },",
      "});",
    ].join("\n");
    const blocks = findWizardRaceBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/code:\s*"WIZARD_SESSION_SUPERSEDED_RACE"/);
    expect(blocks[0]).toMatch(FILE_NAME_KEY);
  });

  test("the auditor does NOT match the catalog.ts key-style entry (self-test)", () => {
    const source = [
      "export const MESSAGE_CATALOG = {",
      "  WIZARD_SESSION_SUPERSEDED_RACE: { dougFacing: 'x', adminFacing: 'y' },",
      "};",
    ].join("\n");
    expect(findWizardRaceBlocks(source)).toHaveLength(0);
  });

  test("exactly the four known routes emit WIZARD_SESSION_SUPERSEDED_RACE — a 5th emitter fails this test", () => {
    const emittingFiles = new Set(filesWithBlocks.map((f) => f.path));
    expect(emittingFiles, `emitting files: ${[...emittingFiles].join(", ")}`).toEqual(
      KNOWN_EMITTER_FILES,
    );
  });

  test("every WIZARD_SESSION_SUPERSEDED_RACE emission's context literal includes a file_name key", () => {
    const missing: string[] = [];
    for (const { path, blocks } of filesWithBlocks) {
      blocks.forEach((block, index) => {
        if (!FILE_NAME_KEY.test(block)) {
          missing.push(`${path} (block #${index + 1})`);
        }
      });
    }
    expect(missing, `blocks missing file_name: ${missing.join(", ")}`).toEqual([]);
  });

  test("sanity: at least one emitter was found (guards against a broken walk/regex silently passing)", () => {
    expect(filesWithBlocks.length).toBeGreaterThan(0);
  });
});
