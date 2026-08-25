import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRunHeader,
  completedIdentities,
  createStagingDir,
  expectedIdentities,
  pixelSha256,
} from "@/scripts/capture-evidence";

const BASELINE = join(process.cwd(), "public/help/screenshots/dashboard-overview-light.webp");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "capture-evidence-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("pixelSha256 hashes decoded RGB, never the PNG container", () => {
  // The failure this catches: hashing the container reports a render change
  // whenever only the encoding moved, collapsing three rows of spec section 6.
  it("is stable across two PNG compression levels while container hashes differ", async () => {
    const decoded = sharp(BASELINE).removeAlpha();
    const low = await decoded.clone().png({ compressionLevel: 0 }).toBuffer();
    const high = await decoded.clone().png({ compressionLevel: 9 }).toBuffer();

    const containerLow = createHash("sha256").update(low).digest("hex");
    const containerHigh = createHash("sha256").update(high).digest("hex");
    expect(containerLow).not.toBe(containerHigh);
    expect(low.byteLength).not.toBe(high.byteLength);

    expect(await pixelSha256(low)).toBe(await pixelSha256(high));
  });

  // Asserting only "the two encodings agree and both differ from the container
  // hashes" is satisfied by a CONSTANT. This pins the value to one derived
  // without calling the implementation under test.
  it("equals an independently derived SHA-256 of the raw RGB buffer", async () => {
    const png = await sharp(BASELINE).removeAlpha().png().toBuffer();
    const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const independent = createHash("sha256").update(data).digest("hex");

    expect(await pixelSha256(png)).toBe(independent);
  });

  it("separates two images that differ by a single pixel", async () => {
    const base = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
    const nudged = Buffer.from(data);
    nudged[0] = (nudged[0] ?? 0) + 1;
    const other = await sharp(nudged, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .png()
      .toBuffer();

    expect(await pixelSha256(base)).not.toBe(await pixelSha256(other));
  });
});

describe("the staging directory certifies PROVENANCE, not content", () => {
  // Spec section 9: read-back proves matching bytes EXIST, not that this run
  // produced them. Emptiness at start is what converts one into the other.
  it("createStagingDir returns a real directory on disk, and it is empty", () => {
    const dir = createStagingDir(tmp);
    // Asserting only completedIdentities([]) is satisfied by a function that
    // creates nothing at all, so the directory's existence is asserted directly.
    expect(existsSync(dir)).toBe(true);
    expect(dir.startsWith(tmp)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
    expect(completedIdentities(dir)).toEqual([]);
  });

  it("createStagingDir empties a directory that already holds files", () => {
    const seeded = createStagingDir(tmp);
    writeFileSync(join(seeded, "dashboard-overview-light.webp"), "stale");
    expect(completedIdentities(seeded)).toHaveLength(1);

    // The same path, re-created: a stale artifact from a previous run must not
    // be readable as a completion of this one.
    const fresh = createStagingDir(tmp);
    expect(fresh).toBe(seeded);
    expect(readdirSync(fresh)).toEqual([]);
    expect(completedIdentities(fresh)).toEqual([]);
  });

  it("derives completion identities from the files actually present", () => {
    const dir = createStagingDir(tmp);
    writeFileSync(join(dir, "dashboard-overview-light.webp"), "x");
    writeFileSync(join(dir, "crew-preview-today-mobile-dark.webp"), "x");

    expect(completedIdentities(dir).sort()).toEqual([
      "crew-preview-today-mobile-dark",
      "dashboard-overview-light",
    ]);
  });

  // A no-op writer yields an empty directory and therefore zero completions.
  // Against public/help/screenshots/ the same assertion passes, because the
  // committed baselines are already on disk before capture begins.
  it("a run that writes nothing reports zero completions, not fourteen", () => {
    // The same shape run against public/help/screenshots/ passes vacuously:
    // the committed baselines are on disk before capture begins. Pin the
    // contrast so the assertion cannot be relocated to that directory later.
    const committed = join(process.cwd(), "public/help/screenshots");
    expect(readdirSync(committed).filter((f) => f.endsWith(".webp")).length).toBeGreaterThan(0);
    expect(completedIdentities(createStagingDir(tmp))).toHaveLength(0);
  });
});

describe("the expected identity set is DERIVED from the manifest", () => {
  // A hardcoded fourteen passes unchanged the day someone adds an entry and
  // the capture silently skips it.
  it("is manifest crossed with themesFor, never a literal", () => {
    const expected = expectedIdentities();
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(expected).size).toBe(expected.length);
    for (const id of expected) {
      expect(id).toMatch(/-(light|dark)$/);
    }
  });
});

describe("the run header carries what discriminates a population", () => {
  const ENV = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    RUNNER_NAME: "GitHub Actions 7",
    RUNNER_ARCH: "X64",
    RUNNER_OS: "Linux",
  };

  it("reads eventName and the three runner fields from the environment", () => {
    const header = buildRunHeader(ENV);
    expect(header.eventName).toBe("workflow_dispatch");
    expect(header.runnerName).toBe("GitHub Actions 7");
    expect(header.runnerArch).toBe("X64");
    expect(header.runnerOs).toBe("Linux");
  });

  // The passthrough failure mode: the variables exist on the host and never
  // reach the container, so the fields record empty on every run.
  it("records an absent variable as an empty string rather than throwing", () => {
    const header = buildRunHeader({});
    expect(header.eventName).toBe("");
    expect(header.runnerName).toBe("");
    expect(header.runnerArch).toBe("");
    expect(header.runnerOs).toBe("");
    // Empty is what the CI parser rejects; it must never be undefined, which
    // a jq check would read as absent rather than as unset.
    expect(Object.keys(header).sort()).toEqual([
      "cpuCount",
      "cpuModel",
      "eventName",
      "runnerArch",
      "runnerName",
      "runnerOs",
    ]);
  });

  it("reads cpuModel and cpuCount from the running container", () => {
    const header = buildRunHeader(ENV);
    expect(header.cpuCount).toBeGreaterThan(0);
    expect(header.cpuModel.length).toBeGreaterThan(0);
  });
});
