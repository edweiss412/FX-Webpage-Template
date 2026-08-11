/**
 * tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts
 *
 * Structural guard: every anchored, internally-scrolling OVERLAY under
 * `components/**` carries an explicit decision about how it survives a
 * clipping ancestor (see `popoverOverlayRegistry.ts` for the why, and
 * `_popoverOverlayExtract.ts` for the recognizer and its documented fence).
 *
 * Filesystem-walked, so a NEW overlay fails by default rather than inheriting
 * a silent pass. This is the invariant-9/10 registry idiom, not a new
 * mechanism.
 *
 * RE-KEYED PER OVERLAY 2026-08-10 (BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-
 * ONLY): the prior guard compared detected FILES, so a second undispositioned
 * overlay in a registered file was invisible, and its text classifier read
 * only the Tailwind idiom, so inline-style overlays were never detected. Both
 * reviewer probes from that entry are standing self-tests below.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { extractAnchoredOverlays } from "./_popoverOverlayExtract";
import {
  POPOVER_OVERLAY_REGISTRY,
  UNCLASSIFIED_STYLE_EXEMPTIONS,
  type OverlayRow,
} from "./popoverOverlayRegistry";

const IMPORT_FOR_DISPOSITION: Partial<Record<OverlayRow["disposition"], RegExp>> = {
  "placement-module": /from\s+"@\/lib\/popover\/position"/,
  // Requires the SHARED-MODULE import, not merely the identifier. The old
  // /useFitWithinClip/ also matched a file that declared its own local copy, so
  // a consumer could silently fork the hook and stay "registered as fit-within-
  // clip" (spec §4.1; the escaping mutant is quoted in this task's commit).
  "fit-within-clip": /from\s+"@\/components\/admin\/useFitWithinClip"/,
};

type LiveOverlay = { file: string; marker: string; line: number };
type LiveUnclassified = { file: string; marker: string | null; line: number; reason: string };

function liveExtraction(): {
  overlays: LiveOverlay[];
  unclassified: LiveUnclassified[];
  needsMarker: { file: string; line: number }[];
} {
  const overlays: LiveOverlay[] = [];
  const unclassified: LiveUnclassified[] = [];
  const needsMarker: { file: string; line: number }[] = [];
  for (const file of walkSourceFiles(["components"], { extensions: [".tsx"] })) {
    const report = extractAnchoredOverlays(readFileSync(file, "utf8"), file);
    for (const o of report.overlays) overlays.push({ file, marker: o.marker, line: o.line });
    for (const u of report.unclassified) unclassified.push({ file, ...u });
    for (const n of report.needsMarker) needsMarker.push({ file, line: n.line });
  }
  return { overlays, unclassified, needsMarker };
}

const overlayKey = (file: string, marker: string) => `${file} :: ${marker}`;

/** Wrap a className/style fragment as a minimal component source. */
const asComponent = (attrs: string) =>
  `export const Probe = () => (\n  <div data-testid="probe-overlay" ${attrs} />\n);`;

describe("anchored-scroller recognition (per element, both idioms)", () => {
  // Guards the guard: a recognizer that matched nothing would make the whole
  // meta-test vacuously green. Same accept/reject table as the pre-re-key
  // string classifier, now exercised through the AST extractor.
  it.each([
    [
      "top-full + overflow-y-auto + arbitrary cap",
      'className="absolute top-full overflow-y-auto max-h-[30rem]"',
    ],
    ["Tailwind scale cap", 'className="absolute top-[calc(100%+8px)] max-h-96 overflow-y-auto"'],
    ["semantic token cap", 'className="absolute top-[8px] max-h-panel-max-mobile overflow-y-auto"'],
    [
      "inline style cap",
      'className="absolute bottom-full overflow-auto" style={{ maxHeight: "40vh" }}',
    ],
    ["no cap at all", 'className="absolute bottom-[4px] overflow-y-scroll"'],
    ["fixed rather than absolute", 'className="fixed top-full overflow-y-auto"'],
    [
      "fully inline-style idiom",
      'style={{ position: "absolute", top: "100%", overflowY: "auto" }}',
    ],
  ])("matches %s", (_label, attrs) => {
    const { overlays } = extractAnchoredOverlays(asComponent(attrs), "components/Probe.tsx");
    expect(overlays.map((o) => o.marker)).toContain("probe-overlay");
  });

  it.each([
    ["no scroller", 'className="absolute top-full max-h-96"'],
    ["no edge anchor and no self-scroll", 'className="absolute inset-0 max-h-96"'],
    ["not positioned", 'className="top-full overflow-y-auto"'],
    ["inline style without overflow", 'style={{ position: "absolute", top: "100%" }}'],
  ])("does not match %s", (_label, attrs) => {
    const { overlays } = extractAnchoredOverlays(asComponent(attrs), "components/Probe.tsx");
    expect(overlays).toEqual([]);
  });

  it("fires on the live ShareHub popover, by marker", () => {
    const source = readFileSync("components/admin/showpage/ShareHub.tsx", "utf8");
    const { overlays } = extractAnchoredOverlays(source, "components/admin/showpage/ShareHub.tsx");
    expect(overlays.map((o) => o.marker)).toContain("share-hub-popover");
  });
});

describe("accept-set branch coverage (mutation-gate hardening, 2026-08-10)", () => {
  // Every row below kills a surviving mutant the source-mutation gate found on
  // first enrollment (score 0.692 vs floor 0.9): each exercises an accept-set
  // branch the live tree happens not to reach. The gate's survivor list is the
  // derivation; these are not decorative.
  it("a module TEMPLATE-LITERAL const referenced by className classifies", () => {
    const source = [
      "const T = `absolute top-full overflow-y-auto`;",
      'export const P = () => <div data-testid="tpl-const" className={T} />;',
    ].join("\n");
    const { overlays } = extractAnchoredOverlays(source, "components/P.tsx");
    expect(overlays.map((o) => o.marker)).toEqual(["tpl-const"]);
  });

  it("a clsx() module const AND an inline clsx() className both classify", () => {
    const viaConst = [
      'const C = clsx("absolute top-full overflow-y-auto");',
      'export const P = () => <div data-testid="clsx-const" className={C} />;',
    ].join("\n");
    expect(
      extractAnchoredOverlays(viaConst, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["clsx-const"]);
    const inline =
      'export const Q = () => <div data-testid="clsx-inline" className={clsx("absolute top-full", "overflow-y-auto")} />;';
    expect(
      extractAnchoredOverlays(inline, "components/Q.tsx").overlays.map((o) => o.marker),
    ).toEqual(["clsx-inline"]);
  });

  it("an uninitialized module binding does not derail extraction", () => {
    // The const-collector must SKIP a binding with no initializer, not read
    // through it; the surviving connector flip crashed here.
    const source = [
      "let pending;",
      'export const P = () => <div data-testid="after-bare-let" className="absolute top-full overflow-y-auto" />;',
    ].join("\n");
    expect(
      extractAnchoredOverlays(source, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["after-bare-let"]);
  });

  it("template interpolation is a token SEPARATOR: fragments never concatenate", () => {
    // "overflow-" + "y-auto" across an unresolved interpolation must NOT form
    // a scroller token.
    const source =
      'export const P = ({ x }: { x: string }) => <div data-testid="split-token" className={`absolute overflow-${x}y-auto top-full`} />;';
    const report = extractAnchoredOverlays(source, "components/P.tsx");
    expect(report.overlays).toEqual([]);
  });

  it("a template TAIL after a resolved const interpolation still contributes", () => {
    const source = [
      'const POS = cn("absolute top-full");',
      'export const P = () => <div data-testid="tpl-tail" className={`${POS} overflow-y-auto`} />;',
    ].join("\n");
    expect(
      extractAnchoredOverlays(source, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["tpl-tail"]);
  });

  it.each([
    ["fixed + overflow auto", '{ position: "fixed", overflow: "auto" }', true],
    ["absolute + overflowY scroll", '{ position: "absolute", overflowY: "scroll" }', true],
    ["static is not positioned", '{ position: "static", top: "100%", overflowY: "auto" }', false],
    ["overflowY visible is no scroller", '{ position: "absolute", overflowY: "visible" }', false],
    ["overflow hidden is no scroller", '{ position: "absolute", overflow: "hidden" }', false],
  ])("style accept-set: %s", (_label, style, detected) => {
    const source = `export const P = () => <div data-testid="style-probe" style={${style}} />;`;
    const { overlays } = extractAnchoredOverlays(source, "components/P.tsx");
    expect(overlays.length > 0).toBe(detected);
  });

  it("style-bottom anchoring with a scrolling DESCENDANT classifies (edge-anchored path)", () => {
    const source = [
      "export const P = () => (",
      '  <div data-testid="style-bottom-anchor" style={{ position: "absolute", bottom: "100%" }}>',
      '    <div className="overflow-y-auto" />',
      "  </div>",
      ");",
    ].join("\n");
    const { overlays } = extractAnchoredOverlays(source, "components/P.tsx");
    expect(overlays.map((o) => o.via)).toEqual(["anchored-descendant-scroller"]);
  });

  it("a scroller GRANDCHILD still qualifies the anchored wrapper", () => {
    const source = [
      "export const P = () => (",
      '  <div data-testid="deep-subtree" className="absolute top-full">',
      "    <section>",
      '      <div className="overflow-y-auto" />',
      "    </section>",
      "  </div>",
      ");",
    ].join("\n");
    expect(
      extractAnchoredOverlays(source, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["deep-subtree"]);
  });

  it("a SPREAD property inside a style object is reported unclassified", () => {
    const source =
      'export const P = ({ base }: { base: object }) => <div data-testid="style-spread" className="absolute" style={{ ...base, top: "100%" }} />;';
    const { unclassified } = extractAnchoredOverlays(source, "components/P.tsx");
    expect(unclassified).toHaveLength(1);
    expect(unclassified[0]!.marker).toBe("style-spread");
  });

  it("a spread ATTRIBUTE on the overlay element neither derails nor hides it", () => {
    const source =
      'export const P = (rest: object) => <div {...rest} data-testid="spread-attr" className="absolute top-full overflow-y-auto" />;';
    expect(
      extractAnchoredOverlays(source, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["spread-attr"]);
  });

  it("a SUBSTITUTION template module const still classifies through its static chunks", () => {
    // NoSubstitutionTemplateLiteral is StringLiteralLike and takes the first
    // collector branch; only a template WITH spans reaches the template branch.
    const source = [
      'const T = `absolute ${"x"} top-full overflow-y-auto`;',
      'export const P = () => <div data-testid="tpl-span-const" className={T} />;',
    ].join("\n");
    expect(
      extractAnchoredOverlays(source, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["tpl-span-const"]);
  });

  it("an INLINE cn() className classifies (not only clsx)", () => {
    const source =
      'export const P = () => <div data-testid="cn-inline" className={cn("absolute top-full", "overflow-y-auto")} />;';
    expect(
      extractAnchoredOverlays(source, "components/P.tsx").overlays.map((o) => o.marker),
    ).toEqual(["cn-inline"]);
  });

  it("a COMPUTED style key is reported unclassified", () => {
    const source =
      'export const P = () => <div data-testid="computed-key" className="absolute" style={{ ["top"]: "100%" }} />;';
    const { unclassified } = extractAnchoredOverlays(source, "components/P.tsx");
    expect(unclassified).toHaveLength(1);
    expect(unclassified[0]!.marker).toBe("computed-key");
  });

  it("reports the overlay's 1-based line exactly", () => {
    const source = [
      "// filler line",
      "export const P = () => (",
      '  <div data-testid="line-pin" className="absolute top-full overflow-y-auto" />',
      ");",
    ].join("\n");
    const { overlays } = extractAnchoredOverlays(source, "components/P.tsx");
    expect(overlays[0]!.line).toBe(3);
  });
});

describe("per-overlay extraction (BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY)", () => {
  // The entry's reviewer probe (a), as a standing self-test: a second,
  // undispositioned overlay appended to an ALREADY-REGISTERED file must
  // surface as its own unregistered overlay. Under the shipped per-FILE key,
  // the detected file set was unchanged and the guard stayed green.
  it("a second overlay appended to a registered file is detected as its OWN overlay", () => {
    const real = readFileSync("components/admin/showpage/ShareHub.tsx", "utf8");
    const before = extractAnchoredOverlays(real, "components/admin/showpage/ShareHub.tsx");
    const mutated = real.replace(
      /export function ShareHub/,
      'const UndispositionedSecondOverlay = () => (\n  <div\n    data-testid="undispositioned-second-overlay"\n    className="absolute top-full overflow-y-auto"\n  />\n);\nexport function ShareHub',
    );
    expect(mutated).not.toBe(real);
    const after = extractAnchoredOverlays(mutated, "components/admin/showpage/ShareHub.tsx");
    expect(
      after.overlays.length,
      "the appended overlay must be its own detection, not absorbed by the file's existing row",
    ).toBe(before.overlays.length + 1);
    expect(after.overlays.map((o) => o.marker)).toContain("undispositioned-second-overlay");
  });

  // The entry's reviewer probe (b): the inline-style idiom is genuinely an
  // anchored scroller and was not detected at all by the class-only regex.
  it("an inline-style anchored scroller is detected (structural accept-set)", () => {
    const source = [
      "export const InlineMutant = () => (",
      "  <div",
      '    data-testid="inline-style-mutant"',
      '    style={{ position: "absolute", top: "100%", overflowY: "auto" }}',
      "  />",
      ");",
    ].join("\n");
    const { overlays } = extractAnchoredOverlays(source, "components/admin/InlineMutant.tsx");
    expect(overlays.map((o) => o.marker)).toContain("inline-style-mutant");
  });

  it("a qualifying overlay with NO data-testid is refused, not silently keyed", () => {
    const source =
      'export const Bare = () => (\n  <div className="absolute top-full overflow-y-auto" />\n);';
    const report = extractAnchoredOverlays(source, "components/Bare.tsx");
    expect(report.overlays).toEqual([]);
    expect(report.needsMarker).toHaveLength(1);
  });

  it("a positioned element with a runtime-assembled style is REPORTED unclassified", () => {
    const source =
      'export const Dyn = ({ s }: { s: object }) => (\n  <div data-testid="dyn" className="absolute" style={s} />\n);';
    const { unclassified } = extractAnchoredOverlays(source, "components/Dyn.tsx");
    expect(unclassified).toHaveLength(1);
    expect(unclassified[0]!.marker).toBe("dyn");
  });
});

describe("popover overlay registry", () => {
  const live = liveExtraction();

  it("has a row for every detected overlay", () => {
    const registered = new Set(POPOVER_OVERLAY_REGISTRY.map((r) => overlayKey(r.file, r.overlay)));
    const unregistered = live.overlays
      .map((o) => overlayKey(o.file, o.marker))
      .filter((key) => !registered.has(key));
    expect(
      unregistered,
      "New anchored, internally-scrolling overlay under components/. Decide how it survives a clipping ancestor " +
        "(the review-modal panel is overflow-clip and is NOT a scroll container), then add a row to " +
        "tests/components/admin/showpage/popoverOverlayRegistry.ts.",
    ).toEqual([]);
  });

  it("has no unused rows", () => {
    const detected = new Set(live.overlays.map((o) => overlayKey(o.file, o.marker)));
    const stale = POPOVER_OVERLAY_REGISTRY.filter(
      (r) => !detected.has(overlayKey(r.file, r.overlay)),
    ).map((r) => overlayKey(r.file, r.overlay));
    expect(stale, "Registry row no longer matches any overlay; delete the stale row.").toEqual([]);
  });

  it("every detected overlay carries a data-testid marker", () => {
    expect(
      live.needsMarker,
      "Anchored scroller with no data-testid — the registry keys on it; add one in the same commit.",
    ).toEqual([]);
  });

  it("every unreadable-style site is exempted with a reason, and no exemption is stale", () => {
    const exempted = new Set(
      UNCLASSIFIED_STYLE_EXEMPTIONS.map((r) => overlayKey(r.file, r.overlay)),
    );
    const keyOf = (u: LiveUnclassified) =>
      overlayKey(u.file, u.marker ?? `(no marker, line ${u.line})`);
    const unexempted = live.unclassified.map(keyOf).filter((key) => !exempted.has(key));
    expect(
      unexempted,
      "Positioned element with a runtime-assembled style. Either move it into the structural accept-set " +
        "or add an UNCLASSIFIED_STYLE_EXEMPTIONS row with the reason the dynamic style is correct.",
    ).toEqual([]);
    const liveKeys = new Set(live.unclassified.map(keyOf));
    const stale = UNCLASSIFIED_STYLE_EXEMPTIONS.map((r) => overlayKey(r.file, r.overlay)).filter(
      (key) => !liveKeys.has(key),
    );
    expect(stale, "Exemption no longer matches any unreadable-style site; delete it.").toEqual([]);
    for (const row of UNCLASSIFIED_STYLE_EXEMPTIONS) {
      expect(row.reason.trim().length, `${row.file} exemption needs a reason`).toBeGreaterThan(0);
    }
  });

  it("every row states a reason", () => {
    for (const row of POPOVER_OVERLAY_REGISTRY) {
      expect(row.reason.trim().length, `${row.file} needs a reason`).toBeGreaterThan(0);
    }
  });

  it("rows claiming a mechanism actually import it", () => {
    for (const row of POPOVER_OVERLAY_REGISTRY) {
      const required = IMPORT_FOR_DISPOSITION[row.disposition];
      if (!required) continue;
      const source = readFileSync(row.file, "utf8");
      expect(
        required.test(source),
        `${row.file} is registered as "${row.disposition}" but does not import it`,
      ).toBe(true);
    }
  });

  it("every unverified-gap row carries a backlog reference", () => {
    for (const row of POPOVER_OVERLAY_REGISTRY) {
      if (row.disposition !== "unverified-gap") continue;
      expect(row.reason, `${row.file} must name its backlog entry`).toMatch(/BL-[A-Z0-9-]+/);
    }
  });
});
