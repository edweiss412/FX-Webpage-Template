import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * RESURRECTION GUARD (M12.13) for the bearer-secret-at-rest class.
 *
 * B2 originally persisted the raw 24h undo secret into the SHOW_FIRST_PUBLISHED
 * admin_alert context object — a bearer credential at rest in a table every admin
 * session reads (exactly how a soon-to-be-revoked admin could learn it). M12.13
 * stopped writing it (the non-secret expiry window stays; the in-app alert action
 * re-reads the show row service-role-side when it needs the secret).
 *
 * The leak could silently reappear: a future change copying a stale B2 doc or
 * test fixture could re-add the secret as a context key. This guard walks the
 * WHOLE tests/sync subtree (R2 — tree-walk scope, not a named file list) plus the
 * two producer sources and FAILS if the snake-cased secret key reappears as a
 * CONTEXT-OBJECT-LITERAL key (the shape `<key>:` immediately assigned a string
 * literal, or built from a producer arg) in a SHOW_FIRST_PUBLISHED expectation or
 * write.
 *
 * Precision: the needle is the object-KEY form (`<key>:` + whitespace + quote) or
 * the producer-arg form (`<key>: args.`). It deliberately does NOT match:
 *   - SQL column refs (`select <key>::text` — the `::` double-colon has no quote),
 *   - postgres-row type decls (`<key>: string | null` — no quote after the colon),
 *   - JS property reads (`state.<key>`, `row.<key>` — no leading key+colon),
 *   - the camelCase mint/persist param (`unpublishToken`) which is a DIFFERENT
 *     identifier and is the LEGITIMATE surviving surface (the token is still minted
 *     and persisted to the shows row).
 *
 * Sibling to jsonbBoundaryRepresentation.meta.test.ts / timestampInstantSafety.meta.test.ts.
 */
const ROOT = join(__dirname, "..", "..");
const THIS_FILE = join(__dirname, "firstPublishedAlertContextNoToken.meta.test.ts");

// The forbidden snake-cased context key, assembled from fragments so the literal
// never appears verbatim anywhere in this file (the guard would otherwise flag
// itself; and AGENTS.md bans spelling banned literals).
const SECRET_KEY = ["unpublish", "token"].join("_");
// The retained, ALLOWED expiry field shares the prefix — it must NOT trip the guard.
const EXPIRY_KEY = `${SECRET_KEY}_expires_at`;

// Producer sources whose SHOW_FIRST_PUBLISHED context must never carry the secret.
const PRODUCER_SOURCES = ["lib/sync/runScheduledCronSync.ts", "lib/sync/applyStaged.ts"];

function walkSyncTests(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkSyncTests(full));
    } else if (full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// Object-key literal assigned a quoted string value, e.g. `<key>: "..."` or `<key>: '...'`.
// Capturing `:\s*["']` excludes `::text` (SQL cast) and `: string` (type decl).
const KEY_WITH_STRING_VALUE = new RegExp(`\\b${SECRET_KEY}:\\s*["']`);
// Producer-arg form, e.g. `<key>: args.unpublishToken`.
const KEY_WITH_ARG_VALUE = new RegExp(`\\b${SECRET_KEY}:\\s*args\\.`);

function offendingLines(file: string): string[] {
  if (file === THIS_FILE) return []; // never flag the guard's own fragments
  const lines = readFileSync(file, "utf8").split("\n");
  const hits: string[] = [];
  lines.forEach((line, i) => {
    // The expiry field starts with the secret prefix; strip it before matching so
    // the retained `..._expires_at: "..."` line is never a false positive.
    const sanitized = line.split(EXPIRY_KEY).join("__EXPIRY__");
    if (KEY_WITH_STRING_VALUE.test(sanitized) || KEY_WITH_ARG_VALUE.test(sanitized)) {
      hits.push(`${file.slice(ROOT.length + 1)}:${i + 1}  ${line.trim()}`);
    }
  });
  return hits;
}

describe("SHOW_FIRST_PUBLISHED alert context carries no bearer secret (resurrection guard)", () => {
  const syncTestFiles = walkSyncTests(join(ROOT, "tests", "sync"));
  const producerFiles = PRODUCER_SOURCES.map((p) => join(ROOT, p));
  const scanned = [...syncTestFiles, ...producerFiles];

  test("the scan covers the whole tests/sync subtree + both producer sources", () => {
    expect(syncTestFiles.length).toBeGreaterThan(5);
    expect(scanned).toContain(join(ROOT, "lib/sync/runScheduledCronSync.ts"));
    expect(scanned).toContain(join(ROOT, "lib/sync/applyStaged.ts"));
  });

  test("the secret key never appears as a context-object-literal key", () => {
    const offenders = scanned.flatMap(offendingLines);
    expect(
      offenders,
      "The raw 24h undo bearer secret reappeared as a SHOW_FIRST_PUBLISHED alert-context " +
        "key. M12.13 removed it: alert context carries only the non-secret expiry window " +
        "(the in-app alert action re-reads the show row service-role-side). Do not re-add " +
        "it from a stale B2 doc/fixture — the token is a credential at rest in a table " +
        "every admin session reads.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
