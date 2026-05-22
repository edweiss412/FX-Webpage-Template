// Structural meta-test: every cross-page `/help/...#fragment` reference used
// anywhere under `app/help/**/*.mdx` must resolve to an explicit rendered
// anchor on the destination page. Markdown `## Heading` does NOT count — the
// project's @next/mdx pipeline (next.config.ts) ships without rehype-slug, so
// only explicit `<h2 id="...">` or `<RefAnchor id="...">` produce real DOM ids.
//
// Origin: M11 Phase E R4 (Codex). `[crew preview links list](/help/admin/per-show-panel#crew-preview-links)`
// in preview-as-crew + sharing-links landed at the top of per-show-panel
// because the destination heading was plain `## Crew preview links`. This
// meta-test catches that whole class going forward.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const APP_HELP = join(process.cwd(), "app/help");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".mdx")) out.push(p);
  }
  return out;
}

function urlToFile(urlPath: string): string | null {
  const rel = urlPath.replace(/^\/help\/?/, "");
  const baseDir = rel === "" ? APP_HELP : join(APP_HELP, rel);
  for (const ext of ["page.mdx", "page.tsx"]) {
    const candidate = join(baseDir, ext);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not found, try next extension
    }
  }
  return null;
}

function helpHrefToFile(helpHref: string): string | null {
  const [urlPath] = helpHref.split("#");
  if (!urlPath) return null;
  const viaRoute = urlToFile(urlPath);
  if (viaRoute) return viaRoute;

  const fsPath = urlPath.replace(/^\/help/, "app/help");
  const directMdx = join(process.cwd(), `${fsPath}.mdx`);
  const directTsx = join(process.cwd(), `${fsPath}.tsx`);
  if (existsSync(directMdx)) return directMdx;
  if (existsSync(directTsx)) return directTsx;
  return null;
}

interface FragmentRef {
  sourceFile: string;
  urlPath: string;
  fragment: string;
}

const PATH_FRAG_RE = /(\/help\/[a-z0-9/-]*?)#([a-zA-Z0-9_-]+)/g;

function collectFragmentRefs(): FragmentRef[] {
  const files = walk(APP_HELP);
  const refs: FragmentRef[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    PATH_FRAG_RE.lastIndex = 0;
    while ((m = PATH_FRAG_RE.exec(src)) !== null) {
      const urlPath = m[1];
      const fragment = m[2];
      if (urlPath === undefined || fragment === undefined) continue;
      refs.push({
        sourceFile: relative(process.cwd(), file),
        urlPath: urlPath.replace(/\/$/, ""),
        fragment,
      });
    }
  }
  return refs;
}

describe("help cross-page fragment resolver (meta-test)", () => {
  it("every /help/<path>#<fragment> reference resolves to an explicit anchor on the destination page", () => {
    const refs = collectFragmentRefs();
    expect(refs.length).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const ref of refs) {
      // /help/errors#<CODE> resolves dynamically via the catalog iterator
      // in app/help/errors/page.tsx (every code emits <RefAnchor id={code}>).
      if (ref.urlPath === "/help/errors") continue;

      const destFile = urlToFile(ref.urlPath);
      if (!destFile) {
        failures.push(
          `BROKEN: ${ref.sourceFile} -> ${ref.urlPath}#${ref.fragment} (destination page not found)`,
        );
        continue;
      }
      const dest = readFileSync(destFile, "utf8");
      const explicitH2 = new RegExp(
        `<h2[^>]*\\bid=["']${ref.fragment}["']`,
      ).test(dest);
      const refAnchor = new RegExp(
        `<RefAnchor[^>]*\\bid=["']${ref.fragment}["']`,
      ).test(dest);
      const explicitH2Brace = new RegExp(
        `<h2[^>]*\\bid=\\{["']${ref.fragment}["']\\}`,
      ).test(dest);
      if (!(explicitH2 || refAnchor || explicitH2Brace)) {
        failures.push(
          `BROKEN: ${ref.sourceFile} -> ${ref.urlPath}#${ref.fragment} (destination ${relative(
            process.cwd(),
            destFile,
          )} has no <h2 id="${ref.fragment}"> or <RefAnchor id="${ref.fragment}">)`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("pins the originating regression: per-show-panel exposes #crew-preview-links via explicit <h2>", () => {
    const dest = readFileSync(
      join(APP_HELP, "admin/per-show-panel/page.mdx"),
      "utf8",
    );
    expect(dest).toMatch(/<h2[^>]*id=["']crew-preview-links["']/);
    // negative: a bare `## Crew preview links` markdown heading would silently
    // re-introduce the bug; pin the explicit JSX form.
    expect(dest).not.toMatch(/^## Crew preview links\b/m);
  });
});

describe("catalog helpHref anchor resolver (test #1)", () => {
  const entries = Object.values(MESSAGE_CATALOG).filter(
    (entry) => entry.helpHref !== null,
  );

  it("derives a non-empty set of catalog entries with helpHref", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    it(`${entry.code}: helpHref resolves to a real page + anchor`, () => {
      const href = entry.helpHref;
      expect(href).not.toBeNull();
      const file = helpHrefToFile(href!);
      expect(
        file,
        `helpHref ${href} does not resolve to a real page file`,
      ).not.toBeNull();

      const fragment = href!.includes("#") ? href!.split("#")[1] : null;
      if (!fragment) return;

      const dest = readFileSync(file!, "utf8");
      const dynamicErrorsAnchor =
        href!.startsWith("/help/errors#") &&
        dest.includes("<RefAnchor id={entry.code}");
      const refAnchor = new RegExp(
        `<RefAnchor[^>]*\\bid=["']${fragment}["']`,
      ).test(dest);
      const explicitId = new RegExp(`\\bid=["']${fragment}["']`).test(dest);
      const explicitBraceId = new RegExp(
        `\\bid=\\{["']${fragment}["']\\}`,
      ).test(dest);

      expect(
        dynamicErrorsAnchor || refAnchor || explicitId || explicitBraceId,
        `helpHref ${href} fragment "${fragment}" not found in ${relative(
          process.cwd(),
          file!,
        )}`,
      ).toBe(true);
    });
  }
});
