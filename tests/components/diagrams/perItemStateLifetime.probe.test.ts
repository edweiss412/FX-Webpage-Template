/**
 * tests/components/diagrams/perItemStateLifetime.probe.test.ts
 *
 * Probe P5 — settles spec §1.4 row U-5, and ships the meta-test the class
 * defense rests on (AC-17).
 *
 * THE CLAIM. A parser enumerating EVERY `useState`/`useRef` is a cover where the
 * rejected grep was not, so a per-item member added later fails by default.
 *
 * TWO SEPARATE ASSERTIONS PER PLANTED CASE, and the second is the one that
 * matters. That the scanner SEES the declaration, and that the registry check
 * REDS while it is unclassified. A scanner that enumerates perfectly behind a
 * gate that never fails is not a cover, and "the scanner found it" is exactly
 * the tautology this file has to avoid.
 *
 * The planted shapes are the ones the rejected grep missed, plus one it caught
 * as a positive control that the scanner has not simply stopped working.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scanStateDeclarations } from "./perItemStateScanner";
import { DELIBERATELY_NONE, PER_ITEM_STATE_REGISTRY } from "./perItemStateRegistry";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const COMPONENTS = ["Gallery.tsx", "GalleryLightbox.tsx"] as const;
const ROOT = join(process.cwd(), "components/diagrams");

function sourceOf(basename: string): string {
  return readFileSync(join(ROOT, basename), "utf8");
}

/** The unclassified declarations across both components — the gate's verdict. */
function unclassified(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [basename, text] of Object.entries(sources)) {
    for (const decl of scanStateDeclarations(text, basename)) {
      const key = `${basename}:${decl.name}`;
      if (!(key in PER_ITEM_STATE_REGISTRY)) out.push(`${key} (line ${decl.line})`);
    }
  }
  return out;
}

function liveSources(): Record<string, string> {
  return Object.fromEntries(COMPONENTS.map((b) => [b, sourceOf(b)]));
}

describe("per-item state lifetime — the live tree", () => {
  it("every `useState`/`useRef` in both components is classified", () => {
    const sources = liveSources();
    // PREMISE: the scanner must actually be finding declarations. An empty
    // enumeration classifies vacuously and would pass forever.
    const total = Object.entries(sources).reduce(
      (n, [b, t]) => n + scanStateDeclarations(t, b).length,
      0,
    );
    premise("the scanner enumerates declarations in the live components", total, 20);

    expect(unclassified(sources)).toEqual([]);
  });

  it("every per-item row states a clear path, or says so in exactly those words", () => {
    const perItem = Object.entries(PER_ITEM_STATE_REGISTRY).filter(
      ([, c]) => c.kind === "per-item",
    );
    premise("there are per-item rows to check", perItem.length, 5);

    const bad = perItem
      .filter(([, c]) => c.kind === "per-item" && c.clearedBy.trim() === "")
      .map(([k]) => k);
    // An empty clearedBy would satisfy "classified" while documenting nothing,
    // which is the hole round 3 found in the earlier AC-17.
    expect(bad, "per-item rows with an empty clear path").toEqual([]);

    // `demotedRef` is the row whose correct value is the literal phrase, so the
    // phrase has to be reachable rather than merely allowed.
    const literal = perItem.filter(
      ([, c]) => c.kind === "per-item" && c.clearedBy === DELIBERATELY_NONE,
    );
    expect(
      literal.length,
      "the deliberately-none form is in use, not just permitted",
    ).toBeGreaterThan(0);
  });
});

describe("per-item state lifetime — the gate REDS on a planted member", () => {
  const PLANTS: Array<{ label: string; decl: string; name: string }> = [
    {
      label: "a Record, which the rejected grep could not see",
      decl: "  const [plantedRecord, setPlantedRecord] = useState<Record<string, number>>({});",
      name: "plantedRecord",
    },
    {
      label: "an object literal, likewise invisible to the grep",
      decl: "  const plantedObjRef = useRef({});",
      name: "plantedObjRef",
    },
    {
      label: "POSITIVE CONTROL: a ReadonlySet, which the grep DID catch",
      decl: "  const [plantedSet, setPlantedSet] = useState<ReadonlySet<string>>(() => new Set());",
      name: "plantedSet",
    },
    {
      label: "a multi-line generic, to prove parsing beats pattern matching",
      decl: "  const plantedMultiline = useRef<\n    Map<string, number> | null\n  >(null);",
      name: "plantedMultiline",
    },
  ];

  for (const plant of PLANTS) {
    it(`sees AND rejects: ${plant.label}`, () => {
      const base = sourceOf("Gallery.tsx");
      // Insert immediately after the real `failedKeys` declaration, inside the
      // component body, so the plant is in a position the scanner must reach.
      const anchor = base.indexOf("const [failedKeys, setFailedKeys]");
      premiseHolds("the anchor declaration exists to plant beside", anchor > 0);
      const cut = base.indexOf("\n", anchor) + 1;
      const planted = base.slice(0, cut) + plant.decl + "\n" + base.slice(cut);

      const seen = scanStateDeclarations(planted, "Gallery.tsx").map((d) => d.name);
      expect(seen, "the scanner enumerates the planted declaration").toContain(plant.name);

      const verdict = unclassified({ "Gallery.tsx": planted });
      expect(
        verdict.some((row) => row.startsWith(`Gallery.tsx:${plant.name}`)),
        "the gate REDS while the planted member is unclassified — enumeration alone is not a cover",
      ).toBe(true);
    });
  }

  it("the three members the rejected grep missed are all enumerated", () => {
    // Named in spec §4.0.3 as the concrete evidence that a lexical scan fails.
    const seen = scanStateDeclarations(sourceOf("GalleryLightbox.tsx"), "GalleryLightbox.tsx").map(
      (d) => d.name,
    );
    for (const name of ["activeScale", "requestedScaleRef", "controlsSlotRef"]) {
      expect(seen, `${name} is enumerated`).toContain(name);
    }
  });
});
