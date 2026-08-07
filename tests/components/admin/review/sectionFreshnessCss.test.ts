/**
 * tests/components/admin/review/sectionFreshnessCss.test.ts
 *
 * Structural pins for the freshness cue's stylesheet contract (spec
 * 2026-08-03-modal-freshness-cue section 11.3), mirroring the shape of
 * `tests/components/admin/showpage/shareHubFlashTransitions.test.ts`.
 *
 * WHY A STRUCTURAL TEST AND NOT A RENDER TEST. jsdom computes no animation and no
 * layout, so nothing in a component test can tell a 1600ms wash from a 2000ms one,
 * or notice that the reduced-motion override was dropped. These assertions read
 * the shipped stylesheet and the shipped module directly, which is the only place
 * that contract is observable without a real browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SECTION_FRESHNESS_FLASH_MS,
  SECTION_FRESHNESS_MAX_CUES,
} from "@/components/admin/review/sectionFreshness";
import { SECTION_FRESHNESS_FLASH_MS_E2E } from "@/tests/e2e/helpers/realtimeOracle";

const ROOT = join(__dirname, "..", "..", "..", "..");
const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const MODULE_SRC = readFileSync(join(ROOT, "components/admin/review/sectionFreshness.ts"), "utf8");
const SPEC = readFileSync(
  join(ROOT, "docs/superpowers/specs/2026-08-03-modal-freshness-cue.md"),
  "utf8",
);

/**
 * The spec's section 4.5 fence, located by CONTENT rather than by index: a
 * positional read would silently follow the wrong fence after any edit that adds
 * one earlier in the document.
 */
function normativeBlock(): string {
  const marker = "@keyframes section-freshness-flash-1";
  const start = SPEC.indexOf("```css", SPEC.indexOf(marker) - 4000);
  expect(start, "spec must carry a css fence containing the normative block").toBeGreaterThan(-1);
  const open = SPEC.indexOf("\n", start) + 1;
  const end = SPEC.indexOf("```", open);
  expect(end, "the normative fence must be closed").toBeGreaterThan(open);
  const block = SPEC.slice(open, end).trimEnd();
  expect(block, "the located fence must be the normative one").toContain(marker);
  return block;
}

/** Brace depth at `index`, so a rule nested inside an at-rule is detectable. */
function depthAt(text: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth;
}

const KEYFRAMES = ["section-freshness-flash-1", "section-freshness-flash-2"] as const;

describe("section freshness cue: stylesheet contract", () => {
  it("N1: the duration constant is 1600, asserted as a value AND as its declaration", () => {
    // Two halves on purpose. The value alone permits a refactor that computes it;
    // the source match alone permits the constant to be shadowed at the call site.
    expect(SECTION_FRESHNESS_FLASH_MS).toBe(1600);
    // The e2e mirror cannot import this module — `playwright --list` evaluates every
    // spec and this import chain throws without HASH_FOR_LOG_PEPPER. So the copy is
    // pinned from THIS side, where the env is loaded.
    expect(
      SECTION_FRESHNESS_FLASH_MS_E2E,
      "tests/e2e/helpers/realtimeOracle.ts mirrors this constant; update both together",
    ).toBe(SECTION_FRESHNESS_FLASH_MS);
    expect(MODULE_SRC).toMatch(/export const SECTION_FRESHNESS_FLASH_MS = 1600;/);
  });

  it("N2: the spec's normative block appears in globals.css byte for byte, at depth 0", () => {
    const block = normativeBlock();
    const at = CSS.indexOf(block);
    expect(at, "globals.css must contain the spec's block verbatim").toBeGreaterThan(-1);
    expect(depthAt(CSS, at), "the block must not be nested inside an at-rule").toBe(0);
    // Self-check: a stylesheet whose braces do not balance would make every depth
    // reading above meaningless rather than wrong-and-loud.
    expect(depthAt(CSS, CSS.length)).toBe(0);
  });

  it("N3: each keyframe is declared exactly once and no stray rule lives elsewhere", () => {
    const block = normativeBlock();
    for (const name of KEYFRAMES) {
      const declarations = CSS.split(`@keyframes ${name}`).length - 1;
      expect(declarations, `${name} must be declared exactly once`).toBe(1);
    }
    const inCss = CSS.split("section-freshness-flash").length - 1;
    const inBlock = block.split("section-freshness-flash").length - 1;
    expect(inCss, "no section-freshness rule may live outside the normative block").toBe(inBlock);
  });

  it("N4: the -1 and -2 keyframe bodies are identical apart from their names", () => {
    // The load-bearing one. The pair exists ONLY so re-arming a section changes
    // `animation-name` and restarts the animation without a remount. If the bodies
    // drift, one re-arm paints differently from the other and nothing else in the
    // suite would notice.
    const body = (name: string) => {
      const at = CSS.indexOf(`@keyframes ${name}`);
      expect(at, `${name} must exist`).toBeGreaterThan(-1);
      const open = CSS.indexOf("{", at);
      let depth = 0;
      let i = open;
      for (; i < CSS.length; i++) {
        if (CSS[i] === "{") depth++;
        else if (CSS[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      return CSS.slice(open, i + 1);
    };
    expect(body("section-freshness-flash-2")).toBe(body("section-freshness-flash-1"));
  });

  it("N5: reduced motion disables the animation AND pins the outline transparent", () => {
    const block = normativeBlock();
    const reduced = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced, "reduced-motion block must exist in the normative CSS").toContain(
      "[data-section-freshness-flash]",
    );
    expect(reduced).toContain("animation: none;");
    // Without this the outline would keep whatever colour the attribute rule set
    // and a reduced-motion reader would see a permanent ring, which is exactly the
    // "asserts something no longer true" state the one-shot posture rejects.
    expect(reduced).toContain("outline-color: transparent;");
  });

  it("N6: no keyframes are declared in the components this change touches", () => {
    for (const rel of [
      "components/admin/review/sectionFreshness.ts",
      "components/admin/review/ShowReviewSurface.tsx",
      "components/admin/showpage/PublishedReviewModal.tsx",
      "components/admin/wizard/step3ReviewSections.tsx",
    ]) {
      expect(
        readFileSync(join(ROOT, rel), "utf8"),
        `${rel} must not declare keyframes`,
      ).not.toContain("@keyframes");
    }
  });

  it("N10: every picked field name exists on the row type it projects", () => {
    // The failure this catches is SILENT and is the worse of the two directions.
    // The projections narrow to rendered fields by NAME, so a typo, or a field
    // renamed in `lib/parser/types.ts` without updating the list here, hashes
    // `null` forever: the section then never cues for that field, which is the
    // miss this whole feature exists to prevent. Nothing else would notice, since
    // the shape still typechecks and every existing test still passes.
    const types = readFileSync(join(ROOT, "lib/parser/types.ts"), "utf8");
    const fieldsOf = (typeName: string): Set<string> => {
      const m = new RegExp(`export type ${typeName} = \\{(.*?)\\n\\};`, "s").exec(types);
      expect(m, `${typeName} must exist in lib/parser/types.ts`).not.toBeNull();
      const body = m?.[1] ?? "";
      return new Set([...body.matchAll(/^\s*(\w+)\??:/gm)].map((x) => x[1] as string));
    };
    const keysOf = (constName: string): string[] => {
      const m = new RegExp(`const ${constName} = \\[(.*?)\\] as const;`, "s").exec(MODULE_SRC);
      expect(m, `${constName} must be declared`).not.toBeNull();
      return (m?.[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    };

    for (const [constName, typeName] of [
      ["CREW_KEYS", "CrewMemberRow"],
      ["CONTACT_KEYS", "ContactRow"],
      ["HOTEL_KEYS", "HotelReservationRow"],
      ["ROOM_KEYS", "RoomRow"],
    ] as const) {
      const declared = fieldsOf(typeName);
      const picked = keysOf(constName);
      expect(picked.length, `${constName} must not be empty`).toBeGreaterThan(0);
      for (const key of picked) {
        expect(declared.has(key), `${constName} picks "${key}", absent from ${typeName}`).toBe(
          true,
        );
      }
    }
  });

  it("N11: every render cap is IMPORTED from the renderer, never re-typed here", () => {
    // The structural close on the projection-fidelity vector, which cost three
    // consecutive review rounds one field at a time.
    //
    // The detector must hash only what a body can actually show, and every list
    // body slices to a permanent cap before rendering. The retail fix is to copy
    // the numbers across, which drifts the first time someone raises one. This
    // asserts the caps are the SAME BINDINGS the renderer applies, so raising
    // `CREW_CAP` widens the signature in the same commit and cannot be forgotten.
    //
    // Two halves, because either alone is defeatable: the import list proves the
    // bindings are in scope, and the literal scan proves none was re-typed
    // alongside them.
    const imported =
      /import \{([^}]*)\} from "@\/components\/admin\/wizard\/step3ReviewSections";/.exec(
        MODULE_SRC,
      )?.[1];
    expect(imported, "the detector must import from the renderer").toBeDefined();
    for (const cap of [
      "CREW_CAP",
      "ROOMS_CAP",
      "HOTELS_CAP",
      "PACK_LIST_CASES_CAP",
      "PACK_LIST_ITEMS_CAP",
      "SCHEDULE_DAYS_CAP",
      "SCHEDULE_ENTRIES_CAP",
      "DIAGRAM_TILE_CAP",
    ]) {
      expect(imported, `${cap} must come from the renderer`).toContain(cap);
      // And it must be USED, not merely imported: an unused import satisfies the
      // line above while the projection still hashes past the cap.
      const uses = MODULE_SRC.split(cap).length - 1;
      expect(uses, `${cap} must be imported AND applied`).toBeGreaterThan(1);
    }
    // No bare `slice(0, <number>)` anywhere in the detector: that is exactly the
    // shape a re-typed cap takes.
    expect(MODULE_SRC).not.toMatch(/\.slice\(\s*0\s*,\s*\d+\s*\)/);
  });

  it("N13: the signature buckets the SAME attention list the cards render from", () => {
    // Round-6 review found the signature reading `live` (the `doneIds`-filtered
    // list) while `bucketAttention` renders from the full `attentionItems`. A
    // resolved banner does not leave the card — it swaps to "Confirmed" in place
    // and stays mounted until the RSC reconcile — so the filtered list described
    // a card that was not on screen: resolving cued while the banner was still
    // visible, and the later removal, which a reader CAN see, cued nothing.
    //
    // Structural because the defect is a wiring choice, not a value: both lists
    // are non-empty and plausible, and a render test would have to drive a real
    // resolve through a server action to tell them apart. This asserts the two
    // call sites read the same binding, which is the actual contract.
    const modal = readFileSync(
      join(ROOT, "components/admin/showpage/PublishedReviewModal.tsx"),
      "utf8",
    );
    const bucketArg = /bucketAttention\(\s*(\w+)/.exec(modal)?.[1];
    expect(bucketArg, "bucketAttention must take a named list").toBeDefined();
    const sigLoop =
      /const attentionBySection = useMemo\(\(\) => \{[\s\S]*?for \(const item of (\w+)\)/.exec(
        modal,
      )?.[1];
    expect(sigLoop, "the signature must bucket a named list").toBeDefined();
    expect(sigLoop, "signature and cards must read the SAME list").toBe(bucketArg);
    // And it must not be the doneIds-filtered one, named so the failure message
    // says which mistake was made rather than only that two strings differ.
    expect(sigLoop, "`live` is doneIds-filtered; the cards are not").not.toBe("live");
  });

  it("N12: the detector resolves anchors through the SHIPPED href builder", () => {
    // `buildSheetDeepLink` collapses unusable anchors onto one `#gid=0` and drops
    // `gid`/`a1` on the way, so the raw anchor and the rendered link are not the
    // same value. A reimplementation of that normalization here would be a second
    // source of truth that drifts silently the first time the allowlist changes.
    expect(MODULE_SRC).toContain(
      'import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink"',
    );
    expect(MODULE_SRC).toMatch(/buildSheetDeepLink\(ANCHOR_PROBE_DFID, anchor\)/);
    // And the raw anchor must not reach the hash alongside it.
    const hashCall = MODULE_SRC.slice(MODULE_SRC.indexOf("out.set("));
    expect(hashCall.slice(0, 400)).not.toMatch(/^\s*anchor,$/m);
  });

  it("N7: the cap constant is 3 and is exported rather than repeated as a literal", () => {
    expect(SECTION_FRESHNESS_MAX_CUES).toBe(3);
    expect(MODULE_SRC).toMatch(/export const SECTION_FRESHNESS_MAX_CUES = 3;/);
  });

  it("N8: the surface only emits the attribute when a caller supplies the id map", () => {
    // The blast-radius guard for a SHARED component. `ShowReviewSurface` and
    // `step3ReviewSections` are used by the staged wizard as well, and the staged
    // caller passes no freshness prop. Both emit sites are gated on a value that
    // originates in that prop, so an absent prop cannot produce the attribute.
    //
    // Asserted structurally rather than by rendering the wizard: the wizard's own
    // harness would prove one fixture emits nothing, while this proves the emit is
    // UNREACHABLE without the prop, which is the actual contract.
    const surface = readFileSync(
      join(ROOT, "components/admin/review/ShowReviewSurface.tsx"),
      "utf8",
    );
    const sections = readFileSync(
      join(ROOT, "components/admin/wizard/step3ReviewSections.tsx"),
      "utf8",
    );

    // Exactly one emit site, and it is guarded by the chrome value.
    const emits = sections.split("data-section-freshness-flash").length - 1;
    expect(emits, "the attribute must be written in exactly one place").toBe(1);
    expect(sections).toContain(
      "chrome.sectionId !== undefined && chrome.freshnessFlash !== undefined",
    );

    // The chrome value can only come from the surface's optional prop.
    expect(surface).toContain("freshSections?: ReadonlyMap<SectionId,");
    expect(surface).toContain("freshSections?.get(s.id) !== undefined");
    // And the staged caller passes nothing: the wizard's own modal must not
    // mention the prop at all.
    const wizard = readFileSync(join(ROOT, "components/admin/wizard/Step3ReviewModal.tsx"), "utf8");
    expect(wizard).not.toContain("freshSections");
  });

  it("N9: the cue animates ONLY the outline, never a background", () => {
    // The wash was removed on design review: it overspent the accent and, because
    // cards hold opaque children, it rendered at wildly different strength per
    // section. A future edit that reintroduces it would restore both problems
    // silently, so the absence is pinned rather than merely intended.
    const block = normativeBlock();
    expect(block).not.toContain("background-color");
    expect(block).not.toContain("--color-accent-tint");
  });

  it("the attribute rule sets a transparent outline so only its colour animates", () => {
    const block = normativeBlock();
    expect(block).toContain("[data-section-freshness-flash] {");
    expect(block).toContain("outline: 2px solid transparent;");
    // Both values must select a DIFFERENT animation-name pair, which is the whole
    // restart mechanism; a shared rule would make the alternation a no-op.
    expect(block).toContain('[data-section-freshness-flash="1"] {');
    expect(block).toContain('[data-section-freshness-flash="2"] {');
  });

  it("the CSS duration matches the JS constant", () => {
    const block = normativeBlock();
    const durations = [...block.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(durations.length, "the block must state its durations").toBeGreaterThan(0);
    for (const d of durations) expect(d).toBe(SECTION_FRESHNESS_FLASH_MS);
  });
});
