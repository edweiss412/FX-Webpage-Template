import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GeometryMismatchError, checkGeometry } from "@/scripts/capture-geometry";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "capture-geometry-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function png(width: number, height: number, shade = 200): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background: { r: shade, g: shade, b: shade } },
  })
    .png()
    .toBuffer();
}

async function baseline(key: string, width: number, height: number, shade = 200): Promise<string> {
  const path = join(dir, `${key}.webp`);
  writeFileSync(
    path,
    await sharp(await png(width, height, shade))
      .webp()
      .toBuffer(),
  );
  return path;
}

describe("the geometry layer fires on occurrence A's real shape", () => {
  // Occurrence A: the captured strip grew from 320x164 to 320x291 because
  // content was added. Layer 1 cannot see it -- the fault was flag-shaped and
  // returned no marked JSX.
  it("throws naming BOTH dimensions on 320x164 against 320x291", async () => {
    await baseline("strip", 320, 164);
    const error = await checkGeometry(await png(320, 291), join(dir, "strip.webp")).catch(
      (e: unknown) => e as GeometryMismatchError,
    );

    expect(error).toBeInstanceOf(GeometryMismatchError);
    expect(error.message).toContain("320x164");
    expect(error.message).toContain("320x291");
  });

  it("fires on a width change as well as a height change", async () => {
    await baseline("strip", 320, 164);
    await expect(checkGeometry(await png(390, 164), join(dir, "strip.webp"))).rejects.toThrow(
      GeometryMismatchError,
    );
  });
});

describe("the geometry layer does NOT fire on occurrence B's shape", () => {
  // Occurrence B: identical geometry, different bytes, sub-pixel rasterization
  // variance. A layer that fires on everything discriminates nothing, and this
  // is explicitly not this layer's job.
  it("passes when dimensions match but the bytes differ", async () => {
    await baseline("strip", 320, 164, 200);
    const different = await png(320, 164, 201);

    await expect(checkGeometry(different, join(dir, "strip.webp"))).resolves.toEqual({
      checked: true,
    });
  });

  it("passes when the capture is byte-identical to the baseline", async () => {
    await baseline("strip", 320, 164);
    await expect(checkGeometry(await png(320, 164), join(dir, "strip.webp"))).resolves.toEqual({
      checked: true,
    });
  });
});

describe("a missing baseline is a recorded skip, not a pass and not a failure", () => {
  // Reporting `checked: true` here would claim a comparison that never
  // happened, and every new manifest entry would silently certify itself on
  // its first run.
  it("records a skip reason", async () => {
    await expect(checkGeometry(await png(320, 164), join(dir, "absent.webp"))).resolves.toEqual({
      checked: false,
      skippedReason: "no-committed-baseline",
    });
  });
});
