import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "app");
const HELP_ROOT = join(ROOT, "app", "help");
const SCREENSHOTS_DIR = join(ROOT, "public", "help", "screenshots");
const MANIFEST_PATH = join(ROOT, "scripts", "help-screenshots.manifest.ts");
const SCREENSHOT_NAME_RE = /(<Screenshot)\s+[^>]*name=["']([^"']*)["']/g;

// §4.11: crew-page screenshots are drift-CI-only. The crew page is not in the
// admin help tree, so these keys have NO `<Screenshot name>` MDX consumer by
// design — they exist solely so the drift-capture pipeline baselines the crew
// experience. They are excluded from the "every manifest key is consumed by a
// help MDX <Screenshot name>" assertion below. The bounding meta-meta check
// ("CREW_DRIFT_ONLY_KEYS pins exactly the three crew-preview-* keys") prevents
// this exemption from silently growing to hide a real admin screenshot that
// lost its MDX consumer.
const CREW_DRIFT_ONLY_KEYS: ReadonlySet<string> = new Set([
  "crew-preview-today-mobile",
  "crew-preview-gear-mobile",
  "crew-preview-schedule-mobile",
]);

type ScreenshotRef = {
  file: string;
  line: number;
  name: string;
};

function walkMdx(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMdx(path));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      files.push(path);
    }
  }
  return files;
}

function collectScreenshotRefs(): ScreenshotRef[] {
  if (!existsSync(HELP_ROOT)) return [];

  const refs: ScreenshotRef[] = [];
  for (const abs of walkMdx(HELP_ROOT)) {
    const rel = abs.slice(ROOT.length + 1);
    const source = readFileSync(abs, "utf8");
    for (const match of source.matchAll(SCREENSHOT_NAME_RE)) {
      if (match.index === undefined) continue;
      refs.push({
        file: rel,
        line: source.slice(0, match.index).split("\n").length,
        name: match[2] ?? "",
      });
    }
  }
  return refs;
}

function sha1(path: string): string {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

function fixtureExists(fixture: string): boolean {
  return (
    existsSync(join(ROOT, "fixtures", "shows", "raw", `${fixture}.md`)) ||
    existsSync(join(ROOT, "fixtures", "shows", "pdf-only", `${fixture}__INFO.md`))
  );
}

function appPageForRoute(route: string): string | null {
  const pathname = route.split("?")[0]?.replace(/^\/+|\/+$/g, "") ?? "";
  const segments = pathname === "" ? [] : pathname.split("/");
  let dir = APP_ROOT;

  for (const segment of segments) {
    const exact = join(dir, segment);
    if (existsSync(exact) && statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }

    const dynamic = readdirSync(dir, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && /^\[[^\]]+\]$/.test(entry.name),
    );
    if (!dynamic) return null;
    dir = join(dir, dynamic.name);
  }

  const pageTsx = join(dir, "page.tsx");
  if (existsSync(pageTsx)) return pageTsx;

  const pageMdx = join(dir, "page.mdx");
  if (existsSync(pageMdx)) return pageMdx;

  return null;
}

function screenshotsDirActive(): boolean {
  if (!existsSync(SCREENSHOTS_DIR)) return false;
  if (!statSync(SCREENSHOTS_DIR).isDirectory()) return false;
  return readdirSync(SCREENSHOTS_DIR).some((entry) => entry.endsWith(".webp"));
}

describe("help screenshot manifest integrity (Task F.7 / test #9)", () => {
  it("every manifest fixture resolves to a raw or pdf-only INFO fixture", () => {
    const missing = MANIFEST.filter((entry) => !fixtureExists(entry.fixture)).map(
      (entry) => `${entry.key}: ${entry.fixture}`,
    );

    expect(missing, `Missing screenshot fixtures:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every manifest route resolves to a real App Router page", () => {
    const missing = MANIFEST.filter((entry) => appPageForRoute(entry.route) === null).map(
      (entry) => `${entry.key}: ${entry.route}`,
    );

    expect(missing, `Routes without App Router pages:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every manifest entry has light + dark WebPs once screenshots exist", () => {
    if (!screenshotsDirActive()) return;

    const missing: string[] = [];
    for (const entry of MANIFEST) {
      // §4.11: crew-page baselines are drift-CI-only and captured separately by
      // the docker drift pipeline (not committed alongside the manifest entry).
      // They are expected absent until that capture runs, so they do not gate
      // this assertion. Once present, the orphan check (keyed off MANIFEST, which
      // includes them) and the drift gate cover them.
      if (CREW_DRIFT_ONLY_KEYS.has(entry.key)) continue;
      for (const theme of ["light", "dark"] as const) {
        const path = join(SCREENSHOTS_DIR, `${entry.key}-${theme}.webp`);
        if (!existsSync(path)) missing.push(`${entry.key}-${theme}.webp`);
      }
    }

    expect(missing, `Missing screenshot WebPs:\n${missing.join("\n")}`).toEqual([]);
  });

  it("same-key light and dark WebPs are byte-distinct for both-theme captures", () => {
    if (!screenshotsDirActive()) return;

    const identical: string[] = [];
    for (const entry of MANIFEST) {
      if (entry.theme === "light" || entry.theme === "dark") continue;

      const lightPath = join(SCREENSHOTS_DIR, `${entry.key}-light.webp`);
      const darkPath = join(SCREENSHOTS_DIR, `${entry.key}-dark.webp`);
      if (!existsSync(lightPath) || !existsSync(darkPath)) continue;

      const light = readFileSync(lightPath);
      const dark = readFileSync(darkPath);
      if (light.equals(dark)) {
        identical.push(`${entry.key}-light.webp == ${entry.key}-dark.webp`);
      }
    }

    expect(
      identical,
      `Theme application failed: ${identical.join(
        ", ",
      )} are byte-identical — dark theme may not be applying`,
    ).toEqual([]);
  });

  it("does not contain orphan WebPs outside the manifest key set", () => {
    if (!screenshotsDirActive()) return;

    const keys = new Set(MANIFEST.map((entry) => entry.key));
    const orphans = readdirSync(SCREENSHOTS_DIR)
      .filter((entry) => entry.endsWith(".webp"))
      .filter((entry) => {
        const match = /^(.*)-(?:light|dark)\.webp$/.exec(entry);
        return !match || !keys.has(match[1] ?? "");
      });

    expect(orphans, `Orphan screenshot WebPs:\n${orphans.join("\n")}`).toEqual([]);
  });

  it("every manifest key is consumed by at least one help MDX <Screenshot name>", () => {
    const referenced = new Set(collectScreenshotRefs().map((ref) => ref.name));
    const unreferenced = MANIFEST.map((entry) => entry.key)
      // §4.11: crew-page screenshots are drift-CI-only — no admin help MDX
      // consumer by design (the crew page is not in the admin help tree).
      .filter((key) => !CREW_DRIFT_ONLY_KEYS.has(key))
      .filter((key) => !referenced.has(key));

    expect(
      unreferenced,
      `Manifest screenshot keys without help MDX consumers:\n${unreferenced.join("\n")}`,
    ).toEqual([]);
  });

  it("CREW_DRIFT_ONLY_KEYS pins exactly the three §4.11 crew-preview keys (no silent growth)", () => {
    // Bounding meta-meta check: the MDX-consumer exemption must NOT grow to hide
    // a real admin screenshot that lost its MDX consumer. If a crew section is
    // added/removed this list is updated deliberately — never to mask drift.
    expect([...CREW_DRIFT_ONLY_KEYS].sort()).toEqual(
      ["crew-preview-gear-mobile", "crew-preview-schedule-mobile", "crew-preview-today-mobile"].sort(),
    );

    // Every exempted key must actually exist in the manifest — an exemption for a
    // non-existent key would be dead weight that could later shadow a real key.
    const manifestKeys = new Set(MANIFEST.map((entry) => entry.key));
    const danglingExemptions = [...CREW_DRIFT_ONLY_KEYS].filter((key) => !manifestKeys.has(key));
    expect(
      danglingExemptions,
      `CREW_DRIFT_ONLY_KEYS references keys absent from MANIFEST:\n${danglingExemptions.join("\n")}`,
    ).toEqual([]);
  });

  it("every crew-preview-* entry uses the admin-preview route, never the plain tokenized crew route", () => {
    // GUARD (§4.11): the harness signs in as ADMIN, so the plain tokenized crew
    // route would baseline the WRONG (plain-admin) branch via resolveShowPageAccess.
    // The admin-preview route renders CrewShell as the previewed crew. Pin the
    // route shape so a future edit can't silently swap to the crew route.
    const PREVIEW_ROUTE_RE = /^\/admin\/show\/.+\/preview\/.+\?s=/;
    const violations = MANIFEST.filter((entry) => entry.key.startsWith("crew-preview-"))
      .filter((entry) => !PREVIEW_ROUTE_RE.test(entry.route))
      .map((entry) => `${entry.key}: ${entry.route}`);

    expect(
      violations,
      `crew-preview-* entries must use /admin/show/<slug>/preview/<crewId>?s=<section>:\n${violations.join(
        "\n",
      )}`,
    ).toEqual([]);

    // And the exempted set must cover exactly the crew-preview-* manifest keys —
    // no crew-preview-* key may exist without a matching drift-only exemption.
    const crewPreviewKeys = MANIFEST.map((entry) => entry.key)
      .filter((key) => key.startsWith("crew-preview-"))
      .sort();
    expect([...CREW_DRIFT_ONLY_KEYS].sort()).toEqual(crewPreviewKeys);
  });

  it("MDX-referenced screenshots do not share byte-identical light/dark WebPs", () => {
    if (!screenshotsDirActive()) return;

    const referenced = [...new Set(collectScreenshotRefs().map((ref) => ref.name))].sort();
    const duplicates: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      const byHash = new Map<string, string[]>();
      for (const key of referenced) {
        const path = join(SCREENSHOTS_DIR, `${key}-${theme}.webp`);
        if (!existsSync(path)) continue;
        const hash = sha1(path);
        byHash.set(hash, [...(byHash.get(hash) ?? []), `${key}-${theme}.webp`]);
      }
      for (const names of byHash.values()) {
        if (names.length > 1) duplicates.push(names.join(" == "));
      }
    }

    expect(
      duplicates,
      `Byte-identical MDX-referenced screenshot WebPs:\n${duplicates.join("\n")}`,
    ).toEqual([]);
  });

  it("derives the preview-as-crew UUID from the seeded fixture crew identity", () => {
    const source = readFileSync(MANIFEST_PATH, "utf8");

    expect(source).toContain("stableUuid(");
    expect(source).toContain("RPAS_CENTRAL_2026_PREVIEW_CREW_NAME");
    expect(source).not.toMatch(
      /RPAS_CENTRAL_2026_PREVIEW_CREW_ID\s*=\s*["'][0-9a-f-]{36}["']/i,
    );
  });
});
