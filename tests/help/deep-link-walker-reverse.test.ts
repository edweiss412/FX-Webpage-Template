import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AFFORDANCE_MATRIX, type ConcreteRow } from "@/app/help/_affordanceMatrix";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { messageFor } from "@/lib/messages/lookup";

const ROOT = process.cwd();
const APP_HELP = join(ROOT, "app/help");
const SOURCE_ROOTS = ["app", "components"].map((p) => join(ROOT, p));
const HELP_AFFORDANCE_RE = /data-testid=["'](help-affordance--[^"']+)["']/g;
const FAMILY_TESTID_RE = /^help-affordance--error-message--[a-z0-9-]+--learn-more$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mdx)$/.test(p)) out.push(p);
  }
  return out;
}

function collectHelpAffordanceTestids(): Array<{ file: string; testid: string }> {
  const found: Array<{ file: string; testid: string }> = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      HELP_AFFORDANCE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = HELP_AFFORDANCE_RE.exec(src)) !== null) {
        const testid = match[1];
        if (!testid) continue;
        found.push({ file: relative(ROOT, file), testid });
      }
    }
  }
  return found;
}

function helpRouteToFile(route: string): string | null {
  const path = route.split("#")[0] ?? route;
  const rel = path.replace(/^\/help\/?/, "");
  const baseDir = rel === "" ? APP_HELP : join(APP_HELP, rel);
  for (const page of ["page.mdx", "page.tsx"]) {
    const candidate = join(baseDir, page);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function hasFragment(file: string, fragment: string): boolean {
  const src = readFileSync(file, "utf8");
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`<RefAnchor[^>]*\\bid=["']${escaped}["']`).test(src) ||
    new RegExp(`<RefAnchor[^>]*\\bid=\\{["']${escaped}["']\\}`).test(src) ||
    new RegExp(`\\bid=["']${escaped}["']`).test(src) ||
    new RegExp(`\\bid=\\{["']${escaped}["']\\}`).test(src)
  );
}

function isDocumentedEntry(entry: MessageCatalogEntry): boolean {
  return (
    (entry.severity ?? "warning") !== "info" &&
    entry.dougFacing !== null &&
    entry.title !== null &&
    entry.longExplanation !== null &&
    entry.helpHref !== null
  );
}

const concreteRows = AFFORDANCE_MATRIX.filter((row): row is ConcreteRow =>
  row.kind === "concrete",
);

describe("deep-link walker reverse and target resolution (Task G.5)", () => {
  it("every help-affordance testid literal in source is represented by the matrix or template family", () => {
    const concreteTestids = new Set(concreteRows.map((row) => row.testid));
    const failures = collectHelpAffordanceTestids()
      .filter(({ testid }) => !concreteTestids.has(testid) && !FAMILY_TESTID_RE.test(testid))
      .map(({ file, testid }) => `${file}: ${testid}`);

    expect(failures).toEqual([]);
  });

  it("every concrete matrix target resolves to a help page and explicit fragment", () => {
    expect(concreteRows.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const row of concreteRows) {
      const [path, fragment] = row.target.split("#");
      const file = helpRouteToFile(path ?? row.target);
      if (!file) {
        failures.push(`${row.testid}: missing destination page ${path}`);
        continue;
      }
      if (fragment && !hasFragment(file, fragment)) {
        failures.push(
          `${row.testid}: ${relative(ROOT, file)} missing explicit #${fragment} anchor`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("every documented catalog helpHref resolves to a help page and explicit fragment", () => {
    const entries = Object.values(MESSAGE_CATALOG).filter(isDocumentedEntry);
    expect(entries.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const entry of entries) {
      const href = messageFor(entry.code).helpHref;
      if (!href) {
        failures.push(`${entry.code}: missing helpHref`);
        continue;
      }

      const [path, fragment] = href.split("#");
      if (path === "/help/errors") {
        const file = helpRouteToFile(path);
        if (!file) {
          failures.push(`${entry.code}: missing destination page ${path}`);
          continue;
        }
        const src = readFileSync(file, "utf8");
        if (!/<RefAnchor[^>]*\bid=\{entry\.code\}/.test(src)) {
          failures.push(`${entry.code}: ${relative(ROOT, file)} does not emit dynamic code anchors`);
        }
        continue;
      }

      const file = helpRouteToFile(path ?? href);
      if (!file) {
        failures.push(`${entry.code}: missing destination page ${path}`);
        continue;
      }
      if (fragment && !hasFragment(file, fragment)) {
        failures.push(`${entry.code}: ${relative(ROOT, file)} missing explicit #${fragment} anchor`);
      }
    }

    expect(failures).toEqual([]);
  });
});
