/**
 * tests/db/_metaConnectionCensusGuard.test.ts
 *
 * The LIVE gate: every file under `tests/` that opens a database connection through the
 * `postgres` driver is in a named class, or it is REPORTED here by name and carries a
 * disposition row. The forbidden direction is silence — a connection-opening file the
 * census neither classifies nor names.
 *
 * WHY THIS FILE IS NOT ITS OWN RED. A meta-test over the live tree authored AFTER the
 * disposition rows exist passes the moment it is written, and one authored BEFORE them
 * goes green by editing a registry — a manufactured red either way. Every BEHAVIOUR it
 * relies on is red-then-green on constructed sources in `connectionCensus.test.ts`; what
 * this file adds is the measurement over the real corpus, plus the both-directions proof
 * recorded in its commit message.
 *
 * Discovery is filesystem-walked, not a file list: a new connecting test is in the census
 * without anyone remembering to register it.
 */
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";

import { REPO_ALIAS } from "@/vitest.projects";
import { premise, premiseHolds } from "@/tests/_shared/premise";

import {
  type FileClass,
  type ImportResolver,
  type Report,
  attachAffected,
  channelReports,
  classCounts,
  classifyFile,
  discoveredByDestructiveGuard,
  SOURCE_EXTENSIONS,
  propagateThroughImports,
  reconcileDispositions,
  renderReport,
} from "./_connectionCensus";
import { CONNECTION_CENSUS_DISPOSITIONS } from "./_connectionCensusDispositions";

const ROOT = process.cwd();
const TESTS_ROOT = join(ROOT, "tests");

/**
 * `__generated__` is walked here, deliberately unlike the destructive guard: a generated
 * TypeScript module under `tests/` is a file that can acquire the driver, and excluding it
 * would leave every edge INTO it reporting as a population gap — two such edges are live
 * (`tests/db/__generated__/postgresExecutionMethods.ts`). Skipping a directory the corpus
 * imports from turns a complete population into a false report.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(TESTS_ROOT).map((absolute) => ({
  path: relative(ROOT, absolute),
  source: readFileSync(absolute, "utf8"),
}));

const records = files.map(({ path, source }) => classifyFile(path, source));
const population = new Set(records.map((r) => r.file));

/**
 * Resolution is injected, and it stats the DISK rather than reading `git ls-files`: an
 * untracked scratch file under `tests/` is visible to the census, which is the
 * conservative direction — a file that exists can run.
 */
const aliases = REPO_ALIAS(ROOT);
const resolveSpecifier: ImportResolver = (fromFile, specifier) => {
  let base: string | null = null;
  if (specifier.startsWith(".")) {
    base = resolvePath(dirname(join(ROOT, fromFile)), specifier);
  } else if (specifier.startsWith("/")) {
    base = join(ROOT, specifier);
  } else {
    for (const [key, target] of Object.entries(aliases)) {
      if (specifier.startsWith(`${key}/`)) {
        base = join(target, specifier.slice(key.length + 1));
        break;
      }
    }
  }
  if (base === null) return null;
  // NodeNext authoring writes the EMITTED extension: `./_resetRpcSource.js` names
  // `_resetRpcSource.ts`, and five live specifiers in this corpus do exactly that. A
  // resolver that only tries the literal path reports every one of them as unresolvable.
  const rewritten = base.replace(/\.(js|mjs|cjs|jsx)$/, "");
  const candidates = [
    base,
    ...["ts", "mts", "cts", "tsx"].map((extension) => `${rewritten}.${extension}`),
    ...["ts", "mts", "cts", "tsx", "js", "mjs", "cjs", "jsx"].map(
      (extension) => `${base}.${extension}`,
    ),
    ...["index.ts", "index.mts", "index.tsx", "index.js"].map((entry) => join(base, entry)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(ROOT, candidate);
  }
  return null;
};

// PASS 1 derives the edge reports (unresolved specifiers, unrecognised loaders); they are
// part of the report set the rows must cover, so they have to exist before reconciliation.
const edgePass = propagateThroughImports(
  records.map((r) => ({ file: r.file, sf: r.sf, own: [] as FileClass[] })),
  resolveSpecifier,
  ROOT,
);

const discovered = discoveredByDestructiveGuard(files);
const channel = channelReports(discovered, population);

const allReports: Report[] = [
  ...records.flatMap((r) => r.reports),
  ...edgePass.reports,
  ...channel,
];

const reconciliation = reconcileDispositions(allReports, CONNECTION_CENSUS_DISPOSITIONS);
const undisposedKeys = new Set(
  reconciliation.undisposed.map((r) => `${r.file}\u0000${r.line}\u0000${r.site}`),
);

const byPath = new Map(records.map((r) => [r.file, r]));

/** A file's OWN classes: accepted site classes, plus how each reported site was disposed. */
function ownClassesOf(file: string): FileClass[] {
  // Indexed, not searched: this runs once per walked file, and a linear scan inside it
  // makes the pass quadratic over a 2560-file corpus for no reason.
  const record = byPath.get(file);
  if (record === undefined) return [];
  const own = new Set<FileClass>();
  for (const site of record.sites) {
    if (site.cls === "unclassifiable" || site.cls === "remote-literal") {
      const key = `${file}\u0000${site.line}\u0000${site.argText}`;
      own.add(undisposedKeys.has(key) ? "undisposed" : "dispositioned");
    } else {
      own.add(site.cls);
    }
  }
  return [...own];
}

// PASS 2 propagates the RESOLVED classes, so a consumer of a helper whose only site is
// dispositioned inherits `dispositioned` and owes nothing.
const propagation = propagateThroughImports(
  records.map((r) => ({ file: r.file, sf: r.sf, own: ownClassesOf(r.file) })),
  resolveSpecifier,
  ROOT,
);

const counts = classCounts(records.flatMap((r) => r.sites));
const connectingFiles = records.filter((r) => r.sites.length > 0).map((r) => r.file);
const isSuiteFile = (path: string): boolean => /\.(test|spec)\./.test(path);
const connectingHelpers = connectingFiles.filter((path) => !isSuiteFile(path));
const inheritingFiles = [...propagation.classes.entries()].filter(
  ([file, classes]) => classes.size > 0 && !connectingFiles.includes(file),
);
const reported = attachAffected(reconciliation.undisposed, propagation.affected);

describe("connection census — the live tree", () => {
  test("the population premises hold, so every assertion below ranges over a real corpus", () => {
    premise("files walked under tests/", files.length, 1000);
    premise(
      "files holding a driver binding",
      records.filter((r) => r.bindings.length > 0).length,
      100,
    );
    premise(
      "connect sites",
      records.reduce((n, r) => n + r.sites.length, 0),
      100,
    );
    premise("connecting helper modules", connectingHelpers.length, 2);
    premiseHolds(
      "tests/db/_b2Helpers.ts is one of the connecting helpers",
      connectingHelpers.includes("tests/db/_b2Helpers.ts"),
    );
    premise("guard-bound sites", counts["guard-bound"], 0);
    premise("validation-env sites", counts["validation-env"], 0);
    premise("loopback-literal sites", counts["loopback-literal"], 0);
    premise("files the destructive guard discovers", discovered.length, 3);
    premise("files inheriting a class through the helper graph", inheritingFiles.length, 0);

    // Printed, not merely counted: a zero renders beside its population, so `0 of 0`
    // cannot read as a pass.
    console.log(
      `connection census: ${files.length} files walked, ${population.size} in the population, ` +
        `${records.reduce((n, r) => n + r.sites.length, 0)} connect sites, ` +
        `${connectingHelpers.length} connecting helpers, ${inheritingFiles.length} inheriting files, ` +
        `${discovered.length} destructive-discovered, ${reported.length} undisposed, ` +
        `${CONNECTION_CENSUS_DISPOSITIONS.length} disposition rows, ` +
        `${[...propagation.productionEdges.values()].reduce((a, b) => a + b, 0)} production edges\n` +
        renderReport([], counts),
    );
  });

  test("every reported site, acquisition and edge carries a disposition row", () => {
    expect(
      reported.map((r) => `${r.file}:${r.line} ${r.kind}`),
      renderReport(reported, counts),
    ).toEqual([]);
  });

  test("no disposition row is stale, ambiguous, or inadmissible for what it excuses", () => {
    expect(reconciliation.stale.map((r) => `${r.file} ${r.site}`)).toEqual([]);
    expect(reconciliation.ambiguous.map((r) => `${r.file} ${r.site}`)).toEqual([]);
    expect(
      reconciliation.inadmissible.map((r) => `${r.row.file} ${r.row.site}: ${r.reason}`),
    ).toEqual([]);
  });

  test("no site is a hard-coded remote literal", () => {
    const remote = records.flatMap((r) =>
      r.sites.filter((s) => s.cls === "remote-literal").map((s) => `${r.file}:${s.line}`),
    );
    expect(remote).toEqual([]);
  });

  test("every file the destructive guard discovers is in the census population", () => {
    // The premise keeps the subset claim from holding vacuously: an empty discovered set
    // is a subset of anything.
    premise("files the destructive guard discovers", discovered.length, 3);
    expect(channel.map((r) => r.site)).toEqual([]);
  });

  test("the anti-vacuity names are where the census says they are", () => {
    // The dynamic-acquisition file: the earlier design reported the acquisition and lost
    // every site it produced, so a remote literal at the call would have been invisible
    // behind a green row. Asserted by SHAPE, not by line: a line pinned in a file this arc
    // does not own is a re-key charged to every unrelated edit.
    const parity = records.find((r) => r.file === "tests/db/validation-schema-parity.test.ts");
    premiseHolds("validation-schema-parity.test.ts is in the walk", parity !== undefined);
    expect(parity?.bindings.map((b) => b.form)).toEqual(["const-acquisition"]);
    premise("sites in validation-schema-parity.test.ts", parity?.sites.length ?? 0, 0);
    expect([...new Set(parity?.sites.map((s) => s.cls))]).toEqual(["validation-env"]);
    expect(parity?.reports).toEqual([]);

    const gallery = allReports.filter((r) => r.site.startsWith("galleryDatabaseUrl("));
    expect(gallery.map((r) => `${r.file} ${r.site}`).sort()).toEqual([
      "tests/admin/step3StateGallery.test.ts galleryDatabaseUrl()",
      "tests/e2e/helpers/devCaptureStaged.ts galleryDatabaseUrl(dsn)",
    ]);

    const b2 = records.find((r) => r.file === "tests/db/_b2Helpers.ts");
    premise("sites in tests/db/_b2Helpers.ts", b2?.sites.length ?? 0, 0);
    expect([...new Set(b2?.sites.map((s) => s.cls))]).toEqual(["validation-env"]);
  });

  test("the three devCaptureStaged consumers inherit `dispositioned` and appear in no report", () => {
    const consumers = [
      "tests/admin/galleryDatabaseUrl.test.ts",
      "tests/e2e/dev-capture.spec.ts",
      "tests/e2e/tap-target-inline-controls.layout.spec.ts",
    ];
    for (const consumer of consumers) {
      const classes = propagation.classes.get(consumer);
      premiseHolds(`${consumer} is in the walk`, classes !== undefined);
      expect([...(classes ?? [])], consumer).toContain("dispositioned");
      expect(
        reported.map((r) => r.file),
        consumer,
      ).not.toContain(consumer);
    }
  });
});
