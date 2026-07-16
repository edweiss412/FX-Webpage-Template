/**
 * tests/admin/_showReviewReadPathPin.test.ts
 *
 * THE PROBLEM:
 *   The consolidated admin show page (spec §3.3a) is fed by ONE read entry
 *   point: `readShowReviewSnapshot` over the `get_admin_show_review_snapshot`
 *   RPC, which returns a statement-level-consistent snapshot of the show plus
 *   its crew_members / rooms / hotel_reservations / transportation / contacts.
 *   If a later task (10-13) hand-rolls a direct `.from("crew_members")` (etc.)
 *   read inside the review surface, it (a) escapes the single-statement
 *   snapshot's consistency guarantee and (b) bypasses the RPC's is_admin()
 *   SECURITY DEFINER gate. Either is a correctness/security regression.
 *
 * THE META-DISCIPLINE (fails-by-default, class-sweep form):
 *   Walk the ENTIRE published-review read surface on the filesystem at test
 *   time — not a hardcoded file list — so a NEW file added under any walked
 *   root is picked up automatically. Assert:
 *     1. no walked file issues a `.from("<review table>")` builder call,
 *        except an explicit allowlist of PRE-EXISTING non-review reads
 *        (each row: file + table + one-line reason);
 *     2. `lib/admin/readShowReviewSnapshot.ts` contains exactly ONE
 *        `.rpc("get_admin_show_review_snapshot"` call, and NO other walked
 *        module calls that RPC (single entry point).
 *
 *   Roots that do not exist yet (components/admin/showpage/ is created in a
 *   later task) are tolerated (skipped), but MUST be scanned once present.
 */
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

// The whole published-review read surface. Dir roots are walked recursively;
// the single-file root is included directly. Missing roots are skipped.
const WALKED_DIR_ROOTS = [
  "app/admin/show/[slug]",
  "components/admin/showpage",
  "components/admin/review",
];
const WALKED_FILE_ROOTS = ["lib/admin/readShowReviewSnapshot.ts"];

const REVIEW_TABLES = [
  "crew_members",
  "rooms",
  "hotel_reservations",
  "transportation",
  "contacts",
] as const;

const RPC_NAME = "get_admin_show_review_snapshot";

// Pre-existing non-review `.from("<table>")` reads under the walked roots.
// Each row is file + table + one-line reason. Any review-table read NOT listed
// here fails the pin. (Populated by grepping the current tree at Task 7.)
const FROM_ALLOWLIST: ReadonlyArray<{ file: string; table: string; reason: string }> = [
  {
    file: "app/admin/show/[slug]/page.tsx",
    table: "crew_members",
    reason:
      "Per-show admin landing page's existing crew roster read (predates the consolidated review surface); not the snapshot read path.",
  },
  {
    file: "app/admin/show/[slug]/preview/[crewId]/page.tsx",
    table: "crew_members",
    reason:
      "Preview-as impersonation page's lookupCrewMember (spec §preview); an independent single-row lookup, not the review snapshot.",
  },
];

function walkTsFiles(absRoot: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absRoot, { withFileTypes: true })) {
    const abs = join(absRoot, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(abs));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(abs);
    }
  }
  return out;
}

function collectWalkedFiles(): string[] {
  const files: string[] = [];
  for (const root of WALKED_DIR_ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      files.push(...walkTsFiles(abs));
    }
  }
  for (const root of WALKED_FILE_ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (existsSync(abs)) files.push(abs);
  }
  return files;
}

function relFromRepo(abs: string): string {
  return relative(REPO_ROOT, abs).split("\\").join("/");
}

function fromCallRegexFor(table: string): RegExp {
  // `.from(` + optional whitespace + quote + table + quote. Matches single or
  // double quotes and arbitrary inner whitespace.
  return new RegExp(`\\.from\\(\\s*["']${table}["']`, "g");
}

describe("published-review read-path pin", () => {
  test("the walk actually covers files (roots resolve; not a vacuous pass)", () => {
    const files = collectWalkedFiles();
    const relFiles = files.map(relFromRepo);
    // At minimum the helper file + the existing per-show page are present.
    expect(files.length).toBeGreaterThan(0);
    expect(relFiles).toContain("lib/admin/readShowReviewSnapshot.ts");
    // A typo'd root would silently skip forever (existsSync tolerance is meant
    // for roots that don't exist YET, not a permanently misspelled path) — pin
    // one known-existing file from each currently-present dir root so a typo
    // in WALKED_DIR_ROOTS fails loud instead of quietly walking nothing.
    expect(relFiles).toContain("components/admin/review/sectionData.ts");
    expect(relFiles).toContain("app/admin/show/[slug]/page.tsx");
  });

  test("no walked file reads a review table via .from(), except allowlisted pre-existing reads", () => {
    const violations: string[] = [];
    for (const abs of collectWalkedFiles()) {
      const rel = relFromRepo(abs);
      const source = readFileSync(abs, "utf8");
      for (const table of REVIEW_TABLES) {
        if (!fromCallRegexFor(table).test(source)) continue;
        const allowed = FROM_ALLOWLIST.some((r) => r.file === rel && r.table === table);
        if (!allowed) {
          violations.push(
            `${rel} issues .from("${table}") — route review-surface reads through readShowReviewSnapshot (the get_admin_show_review_snapshot RPC), or add an allowlist row with a reason if this is a genuine non-review read.`,
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("every allowlist row still resolves to a real file + a live .from() call (no stale rows)", () => {
    for (const row of FROM_ALLOWLIST) {
      const abs = join(REPO_ROOT, row.file);
      expect(existsSync(abs), `allowlist row points at missing file ${row.file}`).toBe(true);
      const source = readFileSync(abs, "utf8");
      expect(
        fromCallRegexFor(row.table).test(source),
        `allowlist row ${row.file} / ${row.table} no longer matches a live .from() call — remove the stale row`,
      ).toBe(true);
      expect(row.reason.length).toBeGreaterThan(0);
    }
  });

  test("readShowReviewSnapshot.ts is the single RPC entry point (exactly one call; no other walked module calls it)", () => {
    const helperRel = "lib/admin/readShowReviewSnapshot.ts";
    const rpcCallRe = new RegExp(`\\.rpc\\(\\s*["']${RPC_NAME}["']`, "g");

    const helperAbs = join(REPO_ROOT, helperRel);
    const helperSource = readFileSync(helperAbs, "utf8");
    const helperMatches = helperSource.match(rpcCallRe) ?? [];
    expect(helperMatches.length, `${helperRel} must call ${RPC_NAME} exactly once`).toBe(1);

    for (const abs of collectWalkedFiles()) {
      const rel = relFromRepo(abs);
      if (rel === helperRel) continue;
      const source = readFileSync(abs, "utf8");
      expect(
        rpcCallRe.test(source),
        `${rel} calls ${RPC_NAME} directly — the RPC has a single entry point (readShowReviewSnapshot); import that helper instead.`,
      ).toBe(false);
    }
  });
});
