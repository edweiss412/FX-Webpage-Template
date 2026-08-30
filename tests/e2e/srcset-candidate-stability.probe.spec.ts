/**
 * tests/e2e/srcset-candidate-stability.probe.spec.ts
 *
 * Probe P4 — settles spec §1.4 row U-4.
 *
 * THE CLAIM. The retry draws from the same candidate set the failed render
 * offered, and for a laddered entry that set never contains the original — so
 * the cost is bounded by the largest ladder tier, never the multi-megabyte
 * source. Spec §3's bound rests on this.
 *
 * WHAT THIS PROBE DOES NOT PROVE, per plan review R4. Both contexts receive the
 * SAME constant HTML string, so `srcset` equality and the absence of an
 * original-tier URL are guaranteed by the fixture and hold no matter what
 * `next/image`, `makeDiagramLoader` or variant normalization do. That half is
 * tautological as an APPLICATION claim. What it does prove is the BROWSER half:
 * given a set, the browser's pick stays inside it and moves with device scale.
 * The application half — that the app renders a stable, original-free set — is
 * ratified by feature Task 2 against the real component, and spec §1.4's U-4 row
 * is split accordingly.
 *
 * TWO ORACLES, because either alone is insufficient. The rendered `srcset`
 * ATTRIBUTE is what the app produces; if it differs across renders the candidate
 * set is not stable and the claim fails at the source. The REQUESTED URL is what
 * the browser picks from it; a change there is permitted by §3's bound, an
 * original-tier URL is not. An earlier draft asserted only the second, which
 * could pass while the set changed underneath it.
 *
 * DPR IS CONTEXT CONFIGURATION, not a mid-page mutation — plan round 1 was right
 * that the earlier draft implied otherwise. Two contexts at different
 * `deviceScaleFactor` are compared.
 *
 * FIXTURE FIDELITY. The ladder is 256/512/1024, mirroring DIAGRAM_VARIANT_WIDTHS
 * (lib/sync/diagramVariants.ts:13). The `sizes` string is copied verbatim from
 * DEFAULT_THUMBNAIL_SIZES (components/diagrams/Gallery.tsx:106), because
 * selection is a function of srcset, sizes and DPR together and a different
 * `sizes` answers a different question. An ORIGINAL url is deliberately absent
 * from the set, which is what `servingVariants` guarantees in the real loader.
 */
import { expect, test } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Verbatim from components/diagrams/Gallery.tsx:106. */
const SIZES = "(min-width: 1200px) 280px, (min-width: 640px) 23vw, 30vw";
const LADDER = [256, 512, 1024];

const FIXTURE = `<!doctype html>
<html><body style="margin:0">
  <img id="live" sizes="${SIZES}"
       srcset="${LADDER.map((w) => `http://probe.test/tier-${w}.png ${w}w`).join(", ")}"
       src="http://probe.test/tier-1024.png" style="width:30vw">
</body></html>`;

async function sample(dpr: number, browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  const requested: string[] = [];
  await page.route("http://probe.test/index.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: FIXTURE }),
  );
  // A PREDICATE, not a glob. Playwright's glob matcher treats the URL as a path
  // pattern and the first run matched nothing, so the image never loaded and the
  // premise failed for a reason unrelated to the claim.
  await page.route(
    (url) => url.hostname === "probe.test" && url.pathname.startsWith("/tier-"),
    async (route) => {
      requested.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    },
  );
  await page.goto("http://probe.test/index.html");
  // READINESS IS `currentSrc`, NOT `naturalWidth`. With `w` descriptors the
  // browser density-corrects `naturalWidth` by the selected candidate's width
  // over the layout width, so a 1x1 source reports 0 even on a clean decode —
  // the first run of this probe failed on exactly that and it had nothing to do
  // with the claim. `currentSrc` is also the better oracle here on the merits:
  // this probe is about WHICH URL the browser selects, not whether it renders.
  await page.waitForFunction(() => {
    const img = document.getElementById("live") as HTMLImageElement | null;
    return !!img && img.currentSrc !== "";
  });
  const srcset = await page.getAttribute("#live", "srcset");
  await context.close();
  return { srcset, requested };
}

test("the candidate SET is identical across device-scale factors, and excludes the original", async ({
  browser,
}) => {
  const at1 = await sample(1, browser);
  const at3 = await sample(3, browser);

  // PREMISE: both renders actually requested something, or comparing their
  // request lists compares two empty lists and proves nothing.
  expect(at1.requested.length, "DPR 1 requested a tier").toBeGreaterThan(0);
  expect(at3.requested.length, "DPR 3 requested a tier").toBeGreaterThan(0);

  expect(at3.srcset, "the app-rendered candidate set does not depend on DPR").toBe(at1.srcset);
  for (const path of [...at1.requested, ...at3.requested]) {
    expect(
      LADDER.some((w) => path === `/tier-${w}.png`),
      `${path} is a ladder tier`,
    ).toBe(true);
  }
});

test("a device-scale change DOES move the browser's pick, so the fixture discriminates", async ({
  browser,
}) => {
  const at1 = await sample(1, browser);
  const at3 = await sample(3, browser);

  // Reported rather than required. If the picks matched, this fixture could not
  // tell a stable selection from an insensitive one, and §3's bound would rest
  // on an oracle with no discriminating power — which the plan says to surface
  // rather than read as stability.
  expect(
    at1.requested[0],
    `DPR1 picked ${at1.requested[0]} and DPR3 picked ${at3.requested[0]}; if these are equal this fixture does not discriminate`,
  ).not.toBe(at3.requested[0]);
});
