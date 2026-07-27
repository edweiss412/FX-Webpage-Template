/**
 * tests/e2e/screenshots-gallery-capture.spec.ts — the attention-gallery capture
 * sweep (spec docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md
 * §3 item 3 / §8.2). Runs ONLY via `pnpm screenshot:gallery` (screenshots-gallery
 * project, port-3004 prod-build server) — deliberately not CI-covered; the
 * LOCAL_ONLY_ALLOWLIST row in tests/ci/_metaE2eWorkflowCoverage.test.ts records
 * that exemption (§1.1 no-CI ratification).
 *
 * Postconditions run in-test so a silently-degenerate sweep cannot pass. They
 * BRANCH on the parsed GALLERY_SCENARIO filter (§8.2): the package script passes
 * the env through, so a user-filtered invocation reaches this same spec.
 */
// MUST be first: loads .env.local into the runner before the server imports
// below evaluate (they throw at import without HASH_FOR_LOG_PEPPER et al.).
import "./helpers/loadTestEnv";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  captureGallery,
  GALLERY_INDEX_PATH,
  GALLERY_OUTPUT_DIR,
  GALLERY_THEMES,
  GALLERY_VIEWPORT,
  parseScenarioFilter,
  type GalleryIndex,
} from "@/scripts/gallery-screenshots";
import { partitionScenarios } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";

test("captures every selected attention-gallery scenario in both themes", async () => {
  const partition = partitionScenarios();
  const filterRaw = process.env.GALLERY_SCENARIO;
  const selected = parseScenarioFilter(filterRaw, partition);
  const filtered = selected.length !== partition.rendered.length;
  const runStart = new Date().toISOString();

  await captureGallery();

  // Always-block postconditions (§8.2).
  const indexPath = join(process.cwd(), GALLERY_INDEX_PATH);
  expect(existsSync(indexPath), "index.json must exist").toBe(true);
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as GalleryIndex;

  expect(new Date(index.generatedAt).toISOString()).toBe(index.generatedAt);
  expect(index.viewport).toEqual(GALLERY_VIEWPORT);
  expect(index.themes).toEqual([...GALLERY_THEMES]);

  const outputDir = join(process.cwd(), GALLERY_OUTPUT_DIR);
  const referenced: string[] = [];
  for (const entry of index.scenarios) {
    // light/dark are REQUIRED slots; only the overflow slots are nullable (§7).
    expect(entry.files.light, `${entry.id} light slot`).not.toBeNull();
    expect(entry.files.dark, `${entry.id} dark slot`).not.toBeNull();
    expect(new Date(entry.capturedAt).toISOString(), `${entry.id} capturedAt`).toBe(
      entry.capturedAt,
    );
    for (const file of [
      entry.files.light,
      entry.files.dark,
      entry.files.lightOverflow,
      entry.files.darkOverflow,
    ]) {
      if (file === null) continue;
      referenced.push(file);
      expect(existsSync(join(outputDir, file)), `${file} must exist on disk`).toBe(true);
    }
  }

  const onDiskWebps = readdirSync(outputDir).filter((f) => f.endsWith(".webp"));
  expect(onDiskWebps.length, "no orphaned WebPs (§6 invariant)").toBe(referenced.length);

  // An overflow companion exists to show DIFFERENT content (scrolled to the
  // bottom of the pane). Byte-identical base/overflow pairs mean the scroll was
  // a no-op — the first sweep shipped exactly that via the modal panel's
  // overflow-clip false candidacy.
  for (const entry of index.scenarios) {
    for (const [base, over] of [
      [entry.files.light, entry.files.lightOverflow],
      [entry.files.dark, entry.files.darkOverflow],
    ] as const) {
      if (over === null) continue;
      const baseBytes = readFileSync(join(outputDir, base));
      const overBytes = readFileSync(join(outputDir, over));
      expect(baseBytes.equals(overBytes), `${over} must differ from ${base}`).toBe(false);
    }
  }

  if (!filtered) {
    expect(index.scenarios.length, "full sweep covers every rendered scenario").toBe(
      partition.rendered.length,
    );
  } else {
    for (const scenario of selected) {
      const entry = index.scenarios.find((e) => e.id === scenario.id);
      expect(entry, `targeted ${scenario.id} must be captured`).toBeTruthy();
      expect(
        entry!.capturedAt >= runStart,
        `targeted ${scenario.id} capturedAt must be from this run`,
      ).toBe(true);
    }
  }
});
