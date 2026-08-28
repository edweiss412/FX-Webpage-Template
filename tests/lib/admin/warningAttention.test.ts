/**
 * tests/lib/admin/warningAttention.test.ts
 * (wizard-review-attention-menu spec §2 / §12.2 — Task 3)
 *
 * `deriveWarningAttention` is the one partition both review modals read, so the
 * failure this file exists to catch is a pill that disagrees with the rail or
 * with the badge. Every count below is derived — from the real section registry
 * (`step3Sections`), from `warningsBySection`, from `summarizeDataGaps` — never
 * restated, so a fixture that stops routing cannot quietly satisfy an assertion.
 */
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { deriveWarningAttention } from "@/lib/admin/warningAttention";
import { GAP_CLASSES, summarizeDataGaps } from "@/lib/parser/dataGaps";
import { AMBIGUITY_CODES, isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import { KIND_TO_SECTION, sectionStatus, warningsBySection } from "@/lib/admin/step3SectionStatus";
import { ASSET_WARN_CODES, BENIGN_WARN_CODES } from "@/tests/parser/_dataGapBuckets";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { buildStagedSectionData } from "@/components/admin/review/sectionData";
import { sectionDataArgs } from "@/tests/components/admin/wizard/_step3ReviewFixture";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

// The REAL registry, so labels are read from production, never restated here.
const DEFS = step3Sections(buildStagedSectionData(sectionDataArgs()));
const SECTIONS = DEFS.map((d) => ({ id: d.id, label: d.label }));
const labelOf = (id: SectionId) => DEFS.find((d) => d.id === id)!.label;

const warn = (code: string, kind = "crew"): ParseWarning => ({
  severity: "warn",
  code,
  message: "",
  blockRef: { kind },
});

/** Route through the production router, exactly as both callers do. */
const route = (ws: ParseWarning[]) =>
  [...warningsBySection(ws, new Set(SECTIONS.map((s) => s.id)))]
    .flatMap(([sectionId, list]) =>
      list.map((e) => ({
        id: `warning:${e.index}`,
        sectionId,
        warning: e.warning,
        index: e.index,
      })),
    )
    .sort((a, b) => a.index - b.index);

describe("deriveWarningAttention", () => {
  it("partitions by isAmbiguityCode and keeps input order", () => {
    premiseHolds(
      "ROOM_HEADER_SPLIT_AMBIGUOUS is ambiguity",
      isAmbiguityCode("ROOM_HEADER_SPLIT_AMBIGUOUS"),
    );
    const r = deriveWarningAttention(
      route([
        warn("UNKNOWN_FIELD"),
        warn("ROOM_HEADER_SPLIT_AMBIGUOUS", "rooms"),
        warn("UNKNOWN_FIELD"),
      ]),
      SECTIONS,
    );
    expect(r.needsLook.map((e) => e.index)).toEqual([0, 2]);
    expect(r.judgment.map((e) => e.index)).toEqual([1]);
    expect(r.all.map((e) => e.index)).toEqual([0, 1, 2]);
    // label READ from the registry, not asserted as a literal
    expect(r.all[1]!.sectionLabel).toBe(labelOf(r.all[1]!.sectionId));

    // The function reads the SUPPLIED registry rather than a hardcoded map: a
    // synthetic registry proves it. An UNMAPPED kind routes to the warnings
    // bucket, so one fixture proves both the registry read AND the unmapped case.
    const synthetic = SECTIONS.map((x) => ({ ...x, label: `Zz ${x.id}` }));
    premiseHolds("kind is unmapped", !("nope" in KIND_TO_SECTION));
    expect(
      deriveWarningAttention(route([warn("UNKNOWN_FIELD", "nope")]), synthetic).all[0]!
        .sectionLabel,
    ).toBe("Zz warnings");
    expect(
      deriveWarningAttention(route([warn("UNKNOWN_FIELD", "nope")]), SECTIONS).all[0]!.sectionLabel,
    ).toBe(labelOf("warnings" as SectionId));
  });

  it("I-1: never counts fewer than the badge, across every known code, typed and severity-less", () => {
    const codes = [
      ...GAP_CLASSES.map((g) => g.code),
      ...AMBIGUITY_CODES,
      ...BENIGN_WARN_CODES,
      ...ASSET_WARN_CODES,
      // The one explicit warn emitter outside both the gap set and the two
      // named sets (spec §2, read 2026-08-27).
      "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    ];
    premise("non-gap warn corpus", BENIGN_WARN_CODES.size + ASSET_WARN_CODES.size, 0);
    for (const code of codes) {
      const typed = warn(code);
      const { severity: _s, ...legacy } = typed;
      premiseHolds("legacy has no severity key", !("severity" in legacy));
      for (const w of [typed, legacy as unknown as ParseWarning]) {
        const r = deriveWarningAttention(route([w]), SECTIONS);
        expect(r.all.length, code).toBeGreaterThanOrEqual(summarizeDataGaps([w]).total);
      }
    }
  });

  it("I-2: per section and per shape, flagged iff a needsLook entry, judgment iff only judgment entries, clean iff none", () => {
    // Every registry section a warning can route to (KIND_TO_SECTION keys) times
    // four shapes. A mutant that always returns "flagged" fails on the
    // judgment-only and clean shapes; one that never returns "judgment" fails on
    // judgment-only.
    const kinds = Object.entries(KIND_TO_SECTION) as Array<[string, SectionId]>;
    premise("routable kinds", kinds.length, 3);
    const shapes = {
      needs: (k: string) => [warn("UNKNOWN_FIELD", k)],
      judg: (k: string) => [warn("ROOM_HEADER_SPLIT_AMBIGUOUS", k)],
      mixed: (k: string) => [warn("UNKNOWN_FIELD", k), warn("ROOM_HEADER_SPLIT_AMBIGUOUS", k)],
      none: (_k: string) => [] as ParseWarning[],
    };
    for (const [kind, sid] of kinds) {
      for (const [name, make] of Object.entries(shapes)) {
        const ws = make(kind);
        const rendered = new Set(SECTIONS.map((x) => x.id));
        const by = warningsBySection(ws, rendered);
        const r = deriveWarningAttention(route(ws), SECTIONS);
        const target = rendered.has(sid) ? sid : ("warnings" as SectionId);
        const st = sectionStatus((by.get(target) ?? []).map((e) => e.warning));
        const hasNeeds = r.needsLook.some((e) => e.sectionId === target);
        const hasJudg = r.judgment.some((e) => e.sectionId === target);
        expect(st, `${kind}/${name}`).toBe(hasNeeds ? "flagged" : hasJudg ? "judgment" : "clean");
        expect(r.all.length, `${kind}/${name}`).toBe(ws.length);
      }
    }
  });

  it("I-3: any warn-severity input yields a non-empty `all`", () => {
    expect(deriveWarningAttention(route([warn("SOME_UNKNOWN_CODE")]), SECTIONS).all).toHaveLength(
      1,
    );
  });

  it("throws on an info entry and on an unlabelable section", () => {
    const info = { ...warn("UNKNOWN_FIELD"), severity: "info" as const };
    expect(() =>
      deriveWarningAttention(
        [{ id: "x", sectionId: "crew" as SectionId, warning: info }],
        SECTIONS,
      ),
    ).toThrow();
    expect(() => deriveWarningAttention(route([warn("UNKNOWN_FIELD")]), [])).toThrow();
  });
});
