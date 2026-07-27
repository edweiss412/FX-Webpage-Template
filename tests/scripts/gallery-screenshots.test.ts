/**
 * tests/scripts/gallery-screenshots.test.ts — DB-free unit tests for the
 * attention-gallery capture sweep's pure core (spec
 * docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md §8.1;
 * plan Task 2). The browser flow is exercised by the env-bound
 * tests/e2e/screenshots-gallery-capture.spec.ts, not here.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildIndex,
  buildScenarioMismatchError,
  deriveIndexEntries,
  loadPriorIndex,
  parseScenarioFilter,
  pickScrollContainer,
  prepareRun,
  reconcile,
  runGallerySweep,
  scenarioLabelMatches,
  type GalleryFsAdapter,
  type GalleryIndex,
  type GalleryIndexEntry,
} from "@/scripts/gallery-screenshots";
import { partitionScenarios } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { T2_MULTI_HOLD } from "@/lib/dev/attentionScenarios/tier2";

const NOW = "2026-07-26T12:00:00.000Z";
const partition = partitionScenarios();

function entryFor(id: string, overrides: Partial<GalleryIndexEntry> = {}): GalleryIndexEntry {
  return {
    id,
    label: `label ${id}`,
    tier: 2,
    group: "overview",
    codes: [],
    capturedAt: NOW,
    files: {
      light: `${id}-light.webp`,
      dark: `${id}-dark.webp`,
      lightOverflow: null,
      darkOverflow: null,
    },
    ...overrides,
  };
}

describe("parseScenarioFilter", () => {
  it("empty/unset filter selects the full rendered set in catalog order", () => {
    expect(parseScenarioFilter(undefined, partition).map((s) => s.id)).toEqual(
      partition.rendered.map((s) => s.id),
    );
    expect(parseScenarioFilter("", partition).map((s) => s.id)).toEqual(
      partition.rendered.map((s) => s.id),
    );
  });

  it("splits on commas, trims, drops empties, dedups", () => {
    const [a, b] = [partition.rendered[0]!.id, partition.rendered[1]!.id];
    const out = parseScenarioFilter(` ${b} ,, ${a} , ${b} `, partition);
    expect(out.map((s) => s.id)).toEqual([a, b]);
  });

  it("preserves rendered (group-sorted) order even for a reversed filter", () => {
    const ids = partition.rendered.slice(0, 3).map((s) => s.id);
    const reversed = [...ids].reverse().join(",");
    expect(parseScenarioFilter(reversed, partition).map((s) => s.id)).toEqual(ids);
  });

  it("unknown id throws naming the id and listing valid ids", () => {
    expect(() => parseScenarioFilter("no-such-scenario", partition)).toThrowError(
      /no-such-scenario[\s\S]*valid ids/i,
    );
  });

  it("excluded id throws naming the exclusion reason", () => {
    const excluded = partition.excluded[0]!;
    expect(() => parseScenarioFilter(excluded.id, partition)).toThrowError(
      new RegExp(`${excluded.id}[\\s\\S]*${excluded.reason}`),
    );
  });

  it("empty rendered set (catalog regression) throws", () => {
    expect(() =>
      parseScenarioFilter(undefined, { rendered: [], excluded: partition.excluded }),
    ).toThrowError(/rendered/i);
  });
});

describe("prepareRun", () => {
  const env = { TEST_AUTH_SECRET: "test-secret-fixture" };

  it("throws without TEST_AUTH_SECRET", () => {
    expect(() => prepareRun({}, partition, NOW)).toThrowError(/TEST_AUTH_SECRET/);
  });

  it("defaults baseUrl to http://localhost:3004 and honors SCREENSHOT_BASE_URL", () => {
    expect(prepareRun(env, partition, NOW).baseUrl).toBe("http://localhost:3004");
    expect(
      prepareRun({ ...env, SCREENSHOT_BASE_URL: "http://127.0.0.1:9999" }, partition, NOW).baseUrl,
    ).toBe("http://127.0.0.1:9999");
  });

  it("applies GALLERY_SCENARIO and derives entries for the selection only", () => {
    const target = partition.rendered[0]!;
    const run = prepareRun({ ...env, GALLERY_SCENARIO: target.id }, partition, NOW);
    expect(run.selected.map((s) => s.id)).toEqual([target.id]);
    expect(run.entries.map((e) => e.id)).toEqual([target.id]);
  });
});

describe("buildScenarioMismatchError", () => {
  it("names the scenario id and the stale-server remedy", () => {
    const err = buildScenarioMismatchError("t2-multi-hold", "Multiple holds", "Other label");
    expect(err.message).toContain("t2-multi-hold");
    expect(err.message).toMatch(/stale server on :3004; stop it or rebuild/);
  });
});

describe("scenarioLabelMatches", () => {
  it("exact match only - a superstring label must NOT pass (guard soundness)", () => {
    expect(scenarioLabelMatches("Multiple holds", "Multiple holds")).toBe(true);
    expect(scenarioLabelMatches("  Multiple holds \n", "Multiple holds")).toBe(true);
    expect(scenarioLabelMatches("Multiple holds pending review", "Multiple holds")).toBe(false);
    expect(scenarioLabelMatches("Other", "Multiple holds")).toBe(false);
  });
});

describe("deriveIndexEntries", () => {
  it("yields one entry per rendered scenario with derived names and injected capturedAt", () => {
    const entries = deriveIndexEntries(partition.rendered, NOW);
    expect(entries.length).toBe(partition.rendered.length);
    for (const e of entries) {
      expect(e.files.light).toBe(`${e.id}-light.webp`);
      expect(e.files.dark).toBe(`${e.id}-dark.webp`);
      expect(e.files.lightOverflow).toBeNull();
      expect(e.files.darkOverflow).toBeNull();
      expect(e.capturedAt).toBe(NOW);
    }
    const multiHold = entries.find((e) => e.id === T2_MULTI_HOLD);
    expect(multiHold, "known catalog id must be present").toBeTruthy();
    expect(multiHold!.label).toBe(partition.rendered.find((s) => s.id === T2_MULTI_HOLD)!.label);
  });
});

describe("buildIndex", () => {
  it("carries the full §7 root shape", () => {
    const entries = deriveIndexEntries(partition.rendered.slice(0, 2), NOW);
    const index = buildIndex(entries, partition.excluded, NOW);
    expect(index.generatedAt).toBe(NOW);
    expect(index.viewport).toEqual({ width: 1280, height: 800 });
    expect(index.themes).toEqual(["light", "dark"]);
    expect(index.scenarios).toEqual(entries);
    expect(index.excluded).toEqual(partition.excluded);
  });
});

describe("pickScrollContainer", () => {
  const scroller = (w: number, h: number, sh: number) => ({
    scrollHeight: sh,
    clientHeight: h,
    clientWidth: w,
  });

  it("returns null when nothing overflows", () => {
    expect(pickScrollContainer([scroller(240, 500, 500), scroller(900, 500, 501)])).toBeNull();
  });

  it("selects the single overflowing candidate", () => {
    expect(pickScrollContainer([scroller(240, 500, 500), scroller(900, 500, 900)])).toBe(1);
  });

  it("height tie between narrow rail and wide content pane selects the pane (round-1 defect)", () => {
    // Rail first in document order, same clientHeight, both overflow.
    expect(pickScrollContainer([scroller(240, 600, 1200), scroller(900, 600, 1500)])).toBe(1);
  });

  it("area tie breaks toward the LAST in document order", () => {
    expect(pickScrollContainer([scroller(600, 600, 900), scroller(600, 600, 800)])).toBe(1);
  });
});

describe("loadPriorIndex", () => {
  const validIndex = JSON.stringify(
    buildIndex(deriveIndexEntries(partition.rendered.slice(0, 1), NOW), [], NOW),
  );

  it("absent file -> null prior, null warning", () => {
    expect(loadPriorIndex(() => null, "x/index.json")).toEqual({ prior: null, warning: null });
  });

  it("valid file -> parsed prior, null warning", () => {
    const out = loadPriorIndex(() => validIndex, "x/index.json");
    expect(out.warning).toBeNull();
    expect(out.prior?.scenarios.length).toBe(1);
  });

  it("unreadable -> null prior + one-line warning naming the file", () => {
    const out = loadPriorIndex(() => {
      throw new Error("EACCES");
    }, "x/index.json");
    expect(out.prior).toBeNull();
    expect(out.warning).toContain("x/index.json");
    expect(out.warning).not.toContain("\n");
  });

  it("a multiline read error still yields a ONE-LINE warning", () => {
    const out = loadPriorIndex(() => {
      throw new Error("EACCES\n  at somewhere\n  at elsewhere");
    }, "x/index.json");
    expect(out.warning).toContain("x/index.json");
    expect(out.warning).not.toContain("\n");
  });

  it("rejects entries with invalid capturedAt, wrong-typed fields, or missing root fields", () => {
    // Structurally loose clone type: the whole point is writing INVALID shapes.
    type LooseIndex = {
      generatedAt: unknown;
      themes?: unknown;
      viewport?: unknown;
      excluded?: unknown;
      scenarios: {
        capturedAt: unknown;
        codes: unknown;
        tier: unknown;
        files: { lightOverflow: unknown };
      }[];
    };
    const good = JSON.parse(validIndex) as LooseIndex;
    const mutate = (fn: (d: LooseIndex) => void) => {
      const d = JSON.parse(JSON.stringify(good)) as LooseIndex;
      fn(d);
      return loadPriorIndex(() => JSON.stringify(d), "x/index.json");
    };
    expect(mutate((d) => (d.scenarios[0]!.capturedAt = "not-a-date")).prior).toBeNull();
    expect(mutate((d) => (d.generatedAt = "yesterday")).prior).toBeNull();
    expect(mutate((d) => delete d.themes).prior).toBeNull();
    expect(mutate((d) => delete d.viewport).prior).toBeNull();
    expect(mutate((d) => (d.excluded = "nope")).prior).toBeNull();
    expect(mutate((d) => (d.scenarios[0]!.codes = "A")).prior).toBeNull();
    expect(mutate((d) => (d.scenarios[0]!.tier = "one")).prior).toBeNull();
    expect(mutate((d) => (d.scenarios[0]!.files.lightOverflow = 7)).prior).toBeNull();
    // Strictness beyond primitives (whole-diff scope-A round 2): JS-normalized
    // and non-round-trip timestamps, out-of-union tier, theme permutations,
    // non-positive viewport, malformed excluded rows.
    expect(
      mutate((d) => (d.scenarios[0]!.capturedAt = "2026-02-30T00:00:00.000Z")).prior,
    ).toBeNull();
    expect(mutate((d) => (d.generatedAt = "Sun, 26 Jul 2026 12:00:00 GMT")).prior).toBeNull();
    expect(mutate((d) => (d.scenarios[0]!.tier = 4)).prior).toBeNull();
    expect(mutate((d) => (d.themes = ["dark", "light"])).prior).toBeNull();
    expect(mutate((d) => (d.themes = ["light"])).prior).toBeNull();
    expect(mutate((d) => (d.viewport = { width: 0, height: 800 })).prior).toBeNull();
    expect(mutate((d) => (d.excluded = [{ id: "x" }])).prior).toBeNull();
    expect(
      mutate((d) => (d.excluded = [{ id: "x", label: "X", reason: "whim" }])).prior,
    ).toBeNull();
  });

  it("malformed JSON and schema-invalid JSON -> null prior + warning", () => {
    expect(loadPriorIndex(() => "{nope", "x/index.json").prior).toBeNull();
    expect(loadPriorIndex(() => "{nope", "x/index.json").warning).toContain("x/index.json");
    const invalid = JSON.stringify({ scenarios: "not-an-array" });
    expect(loadPriorIndex(() => invalid, "x/index.json").prior).toBeNull();
    expect(loadPriorIndex(() => invalid, "x/index.json").warning).toContain("x/index.json");
  });
});

describe("reconcile", () => {
  // A tiny synthetic catalog: reconciliation joins prior entries against it.
  const renderedCatalog = [
    { id: "alpha", label: "Alpha NEW", tier: 1 as const, group: "overview" as const, codes: ["A"] },
    { id: "beta", label: "Beta", tier: 2 as const, group: "crew" as const, codes: [] as string[] },
  ];

  const priorAlpha = entryFor("alpha", {
    label: "Alpha OLD",
    capturedAt: "2026-07-20T00:00:00.000Z",
    files: {
      light: "alpha-light.webp",
      dark: "alpha-dark.webp",
      lightOverflow: "alpha-light-overflow.webp",
      darkOverflow: null,
    },
  });
  const prior: GalleryIndex = buildIndex(
    [priorAlpha, entryFor("removed-id")],
    [],
    "2026-07-20T00:00:00.000Z",
  );

  it("null prior = empty prior: index holds only captured entries", () => {
    const captured = [entryFor("beta")];
    const out = reconcile(
      null,
      captured,
      renderedCatalog,
      ["beta-light.webp", "beta-dark.webp"],
      [],
      NOW,
    );
    expect(out.index.scenarios.map((e) => e.id)).toEqual(["beta"]);
    expect(out.filesToDelete).toEqual([]);
  });

  it("carries a non-targeted prior entry with metadata REFRESHED and capturedAt preserved", () => {
    const disk = [
      "alpha-light.webp",
      "alpha-dark.webp",
      "alpha-light-overflow.webp",
      "beta-light.webp",
      "beta-dark.webp",
    ];
    const out = reconcile(prior, [entryFor("beta")], renderedCatalog, disk, [], NOW);
    const alpha = out.index.scenarios.find((e) => e.id === "alpha");
    expect(alpha).toBeTruthy();
    expect(alpha!.label).toBe("Alpha NEW"); // refreshed from current catalog
    expect(alpha!.codes).toEqual(["A"]);
    expect(alpha!.capturedAt).toBe("2026-07-20T00:00:00.000Z"); // preserved
    expect(alpha!.files.lightOverflow).toBe("alpha-light-overflow.webp");
  });

  it("prunes prior entries whose id left the rendered catalog and deletes their files", () => {
    const disk = [
      "alpha-light.webp",
      "alpha-dark.webp",
      "alpha-light-overflow.webp",
      "removed-id-light.webp",
      "removed-id-dark.webp",
      "beta-light.webp",
      "beta-dark.webp",
    ];
    const out = reconcile(prior, [entryFor("beta")], renderedCatalog, disk, [], NOW);
    expect(out.index.scenarios.some((e) => e.id === "removed-id")).toBe(false);
    expect(out.filesToDelete).toContain("removed-id-light.webp");
    expect(out.filesToDelete).toContain("removed-id-dark.webp");
  });

  it("drops a carried entry whose referenced file is missing and deletes its survivors", () => {
    const disk = ["alpha-light.webp", "beta-light.webp", "beta-dark.webp"]; // alpha-dark missing
    const out = reconcile(prior, [entryFor("beta")], renderedCatalog, disk, [], NOW);
    expect(out.index.scenarios.some((e) => e.id === "alpha")).toBe(false);
    expect(out.filesToDelete).toContain("alpha-light.webp");
  });

  it("deletes unreferenced WebPs; index.json itself is exempt from the file universe", () => {
    const disk = ["beta-light.webp", "beta-dark.webp", "stray.webp"];
    const out = reconcile(null, [entryFor("beta")], renderedCatalog, disk, [], NOW);
    expect(out.filesToDelete).toEqual(["stray.webp"]);
  });

  it("stale overflow slot: recapture without overflow nulls the slot and deletes the old file", () => {
    const capturedAlpha = entryFor("alpha", { label: "Alpha NEW", codes: ["A"] });
    const disk = ["alpha-light.webp", "alpha-dark.webp", "alpha-light-overflow.webp"];
    const out = reconcile(prior, [capturedAlpha], renderedCatalog, disk, [], NOW);
    const alpha = out.index.scenarios.find((e) => e.id === "alpha")!;
    expect(alpha.files.lightOverflow).toBeNull();
    expect(alpha.capturedAt).toBe(NOW);
    expect(out.filesToDelete).toContain("alpha-light-overflow.webp");
  });

  it("never-captured rendered id is omitted (partial index), no placeholder", () => {
    const out = reconcile(
      null,
      [entryFor("beta")],
      renderedCatalog,
      ["beta-light.webp", "beta-dark.webp"],
      [],
      NOW,
    );
    expect(out.index.scenarios.some((e) => e.id === "alpha")).toBe(false);
  });

  it("a captured entry whose id is not in the rendered catalog is pruned and its files deleted", () => {
    const disk = ["ghost-light.webp", "ghost-dark.webp", "beta-light.webp", "beta-dark.webp"];
    const out = reconcile(
      null,
      [entryFor("ghost"), entryFor("beta")],
      renderedCatalog,
      disk,
      [],
      NOW,
    );
    expect(out.index.scenarios.map((e) => e.id)).toEqual(["beta"]);
    expect(out.filesToDelete).toContain("ghost-light.webp");
    expect(out.filesToDelete).toContain("ghost-dark.webp");
  });
});

describe("runGallerySweep (recording-fake protocol order)", () => {
  type Op =
    | { op: "read"; path: string }
    | { op: "mkdir"; path: string }
    | { op: "write"; path: string }
    | { op: "rename"; from: string; to: string }
    | { op: "delete"; path: string }
    | { op: "list"; path: string };

  function makeFake(initial: { canonical: string[]; staging: string[]; index?: string }) {
    const ops: Op[] = [];
    const fs: GalleryFsAdapter = {
      read: (path) => {
        ops.push({ op: "read", path });
        return path.endsWith("index.json") ? (initial.index ?? null) : null;
      },
      mkdir: (path) => void ops.push({ op: "mkdir", path }),
      write: (path) => void ops.push({ op: "write", path }),
      rename: (from, to) => void ops.push({ op: "rename", from, to }),
      delete: (path) => void ops.push({ op: "delete", path }),
      list: (path) => {
        ops.push({ op: "list", path });
        return path.includes(".staging") ? initial.staging : initial.canonical;
      },
    };
    return { ops, fs };
  }

  const twoScenarios = partition.rendered.slice(0, 2);
  const runPartition = { rendered: twoScenarios, excluded: partition.excluded };
  const env = { TEST_AUTH_SECRET: "test-secret-fixture", GALLERY_SCENARIO: undefined };
  const buffer = Buffer.from("webp");

  async function runFull(fake: ReturnType<typeof makeFake>, opts?: { abortAt?: number }) {
    let calls = 0;
    const warn = vi.fn();
    await runGallerySweep({
      fs: fake.fs,
      warn,
      partition: runPartition,
      env,
      now: NOW,
      capture: async () => {
        calls += 1;
        if (opts?.abortAt !== undefined && calls > opts.abortAt) {
          throw new Error("mid-capture abort");
        }
        return { shot: buffer, overflow: null };
      },
    });
    return { warn };
  }

  it("full-run order: staging discard first, staging-only writes, renames+deletes, index LAST", async () => {
    const fake = makeFake({ canonical: ["stray.webp"], staging: ["leftover.webp"] });
    await runFull(fake);

    const ops = fake.ops;
    const firstWrite = ops.findIndex((o) => o.op === "write" && !o.path.endsWith("index.json"));
    const stagingDiscard = ops.findIndex((o) => o.op === "delete" && o.path.includes(".staging"));
    expect(stagingDiscard, "staging discard must exist").toBeGreaterThan(-1);
    expect(stagingDiscard).toBeLessThan(firstWrite);

    // Every non-index write targets the staging dir; zero canonical writes pre-finalize.
    for (const o of ops) {
      if (o.op === "write" && !o.path.endsWith("index.json")) {
        expect(o.path).toContain(".staging");
      }
    }

    // Rename DIRECTION: always staging → canonical, never the reverse (a
    // canonical→staging rename would mutate the artifact yet pass a
    // destination-only check).
    for (const o of ops) {
      if (o.op === "rename") {
        expect(o.from, "rename source must be staged").toContain(".staging");
        expect(o.to, "rename target must be canonical").not.toContain(".staging");
      }
    }

    const lastRename = ops.map((o) => o.op).lastIndexOf("rename");
    const strayDelete = ops.findIndex((o) => o.op === "delete" && o.path.includes("stray.webp"));
    const indexWrite = ops.findIndex((o) => o.op === "write" && o.path.endsWith("index.json"));
    expect(indexWrite, "index write must exist").toBeGreaterThan(-1);
    expect(lastRename, "finalize renames must exist").toBeGreaterThan(-1);
    expect(lastRename).toBeLessThan(indexWrite);
    expect(strayDelete).toBeGreaterThan(-1);
    expect(strayDelete).toBeLessThan(indexWrite);
    expect(
      ops
        .slice(indexWrite + 1)
        .filter((o) => o.op === "write" || o.op === "rename" || o.op === "delete"),
      "index write is the LAST mutating effect",
    ).toEqual([]);
  });

  it("mid-capture abort leaves every canonical path untouched", async () => {
    const fake = makeFake({ canonical: ["keep-light.webp"], staging: [] });
    await expect(runFull(fake, { abortAt: 1 })).rejects.toThrow("mid-capture abort");
    // An aborted run never reaches finalize: NO renames at all (either
    // direction — a canonical→staging rename would also be a mutation), no
    // index write, and every write/delete confined to staging.
    expect(fake.ops.filter((o) => o.op === "rename")).toEqual([]);
    for (const o of fake.ops) {
      if (o.op === "write") {
        expect(o.path, "aborted-run write outside staging").toContain(".staging");
        expect(o.path.endsWith("index.json"), "index write after abort").toBe(false);
      }
      if (o.op === "delete") {
        expect(o.path, "aborted-run delete outside staging").toContain(".staging");
      }
    }
  });

  it("emits exactly one warn line when the prior index is malformed", async () => {
    const fake = makeFake({ canonical: [], staging: [], index: "{malformed" });
    const { warn } = await runFull(fake);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("index.json");
  });
});
