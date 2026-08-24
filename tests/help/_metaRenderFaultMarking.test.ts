// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ACCEPTED_FORMS, scanCandidates, scanRoots } from "./_renderFaultScan";

// One scan for the file: the walk is over every .ts/.tsx under the derived
// roots and is the expensive part.
const CANDIDATES = scanCandidates();
const ACCEPTED = CANDIDATES.filter((c) => c.form !== "unknown");
const RESIDUE = CANDIDATES.filter((c) => c.form === "unknown");

/**
 * Fault branches whose guard matches NONE of the six accepted forms.
 *
 * Reported by name rather than silently dropped, which is the accept-set
 * discipline's own test: a recognizer that enumerates known forms is a
 * denylist, and the honest response to an unrecognized form is to name it.
 * Layer 0 and layer 2 are what actually cover these; layer 1 does not pretend
 * to. A new unknown form fails this test rather than passing unnoticed.
 */
const REPORTED_RESIDUE: Record<string, string> = {
  "app/admin/layout.tsx:83":
    "instanceof on an error class, not a kind comparison. The admin shell's failure screen — layer 0 catches it, because the capture selector disappears with the shell.",
  "app/admin/wizard/preview/[stagedId]/page.tsx:102":
    "a kind comparison against decode_error, not infra_error. Renders the same marked FailureSurface, so the DOM carries the marker even though the guard is outside the accept-set.",
  "components/admin/UseRawControl.tsx:433":
    "a string-state comparison against legacy-unavailable. Not reachable from any manifest entry.",
  "components/admin/wizard/step3ReviewSections.tsx:3750":
    "a bare boolean named `failed`, one hop from no resolvable infra source.",
  "components/tiles/OpeningReelVideo.tsx:33":
    "a media-element error flag, not a data-loading fault. Different fault domain from the one this instrument measures.",
};

describe("the population is DERIVED from the manifest, not written down", () => {
  it("scans components plus the manifest's own app segments", () => {
    expect(scanRoots()).toEqual(["app/admin", "components"]);
  });

  it("finds a non-trivial population, so a silently empty scan cannot pass", () => {
    // Every assertion below is vacuously true over an empty set. This is the
    // premise those assertions discriminate under, stated executably.
    expect(ACCEPTED.length).toBeGreaterThan(20);
    expect(new Set(ACCEPTED.map((c) => c.file)).size).toBeGreaterThan(10);
  });

  /**
   * A form in the accept-set that no live branch exercises is a rule nothing
   * tests. Each such form is DECLARED with why it is unreachable today, so the
   * gap is visible rather than inferred from a passing suite.
   */
  const UNEXERCISED: Record<string, string> = {
    "switch-case":
      "the live switch on a result kind is app/show/[slug]/[shareToken]/page.tsx:220, under app/show. No manifest entry routes there today, so app/show is not a derived root and the branch is outside the scan. It becomes exercised the day a crew-show entry is added — which is the point of deriving roots rather than listing them.",
  };

  it("exercises every accepted guard form, or declares why it cannot", () => {
    const seen = new Set(ACCEPTED.map((c) => c.form));
    for (const form of ACCEPTED_FORMS) {
      if (seen.has(form)) continue;
      expect(
        UNEXERCISED[form],
        `the ${form} form is accepted but no live branch exercises it, and it is not declared unexercised`,
      ).toBeTruthy();
    }
  });

  it("does not declare a form unexercised while a live branch exercises it", () => {
    // The stale-declaration direction: a form that BECOMES reachable must lose
    // its excuse, or the excuse outlives the gap it described.
    const seen = new Set(ACCEPTED.map((c) => c.form));
    for (const form of Object.keys(UNEXERCISED)) {
      expect(seen, `${form} is exercised now; drop its UNEXERCISED entry`).not.toContain(form);
    }
  });
});

describe("every JSX-returning fault branch carries the marker", () => {
  it("leaves none unmarked", () => {
    const unmarked = ACCEPTED.filter((c) => !c.marked).map(
      (c) => `${c.file}:${c.line} (${c.form})`,
    );
    expect(unmarked).toEqual([]);
  });
});

describe("the residue is reported by name, never silently dropped", () => {
  it("pins every unrecognized form with a reason", () => {
    const found = RESIDUE.map((c) => `${c.file}:${c.line}`).sort();
    expect(found).toEqual(Object.keys(REPORTED_RESIDUE).sort());
  });

  it("gives each residue member a non-empty reason", () => {
    for (const [site, reason] of Object.entries(REPORTED_RESIDUE)) {
      expect(reason.length, `${site} needs a reason`).toBeGreaterThan(20);
    }
  });
});
