// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
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
  "app/admin/wizard/preview/[stagedId]/page.tsx:126":
    "a kind comparison against decode_error, not infra_error. Renders the same marked FailureSurface, so the DOM carries the marker even though the guard is outside the accept-set.",
  "components/admin/UseRawControl.tsx:433":
    "a string-state comparison against legacy-unavailable. Not reachable from any manifest entry.",
  "components/admin/wizard/step3ReviewSections.tsx:3750":
    "a bare boolean named `failed`, one hop from no resolvable infra source.",
  "components/tiles/OpeningReelVideo.tsx:33":
    "a media-element error flag, not a data-loading fault. Different fault domain from the one this instrument measures.",
};

/**
 * Shape-4 residue: the branch ASSIGNS a flag and a later return renders it.
 *
 * These are invisible to the scanner by construction — the guard site returns
 * no JSX, so it is not a candidate, and it appears in neither the enforced set
 * nor REPORTED_RESIDUE. Tracing a flag to the JSX that consumes it is dataflow
 * analysis this arc does not carry (spec §4.2), so the registry is the honest
 * substitute: each flag named, with the capture output it can reach.
 *
 * Two entries are marked BY HAND. The scanner cannot enforce them and never
 * will under this design, but the flag was right there at authoring time and
 * the strip would otherwise encode "Unavailable" with nothing refusing.
 */
const FLAG_RESIDUE: Record<string, string> = {
  "components/admin/Dashboard.tsx:ignoredDegraded":
    "reaches dashboard-overview: adds a notice and removes warning badges. Not marked — the render site is a disclosure far from the assignment.",
  "components/admin/Dashboard.tsx:dataGapsDegraded":
    "reaches dashboard-overview: a shows_internal read failure removes data-quality badges. Not marked, same reason.",
  "components/admin/telemetry/TelemetryOverviewStrip.tsx:SystemHealthCard.unavailable":
    "reaches no manifest capture today (/admin/dev/telemetry is unrouted), but renders Unavailable / Health check failed. MARKED BY HAND via the renderFault prop.",
  "components/admin/telemetry/TelemetryOverviewStrip.tsx:EventsCard.isInfra":
    "same surface, renders Unavailable. MARKED BY HAND via the renderFault prop.",
  "app/admin/layout.tsx:inOnboarding":
    "assigns a routing flag and returns no JSX from that branch; fails open by design.",
};

describe("the flag-shaped residue is named, since no scan can reach it", () => {
  it("gives every registered flag a reason naming what it reaches", () => {
    expect(Object.keys(FLAG_RESIDUE).length).toBeGreaterThan(0);
    for (const [site, reason] of Object.entries(FLAG_RESIDUE)) {
      expect(reason.length, `${site} needs a reason`).toBeGreaterThan(20);
      expect(site, `${site} must name a file and a flag`).toContain(":");
    }
  });

  it("the two hand-marked flags really do carry the marker", () => {
    // Without this the registry could claim a marking that was never made, or
    // that a later edit removed -- the stale-declaration failure mode.
    const strip = readFileSync(
      join(process.cwd(), "components/admin/telemetry/TelemetryOverviewStrip.tsx"),
      "utf8",
    );
    // Whitespace-normalized before matching. The assertion is about the marking,
    // not its column: pinning the exact source text makes a Prettier reflow of
    // that attribute a red CI run with no behavior change, and the line-pinned
    // residue registry in this same file has already moved twice for exactly
    // that reason.
    const flat = strip.replace(/\s+/g, " ");
    expect(flat).toContain('renderFault={unavailable ? "telemetry-system-health" : undefined}');
    expect(flat).toContain('renderFault={isInfra ? "telemetry-events" : undefined}');
  });
});

describe("the population is DERIVED from the manifest, not written down", () => {
  it("scans components plus the manifest's own app segments", () => {
    expect(scanRoots()).toEqual(["app/admin", "components"]);
  });

  it("finds a non-trivial population, so a silently empty scan cannot pass", () => {
    // Every assertion in this file is vacuously true over an empty set. This is
    // the premise they discriminate under, stated executably. It goes through
    // the shared helper so a premise failure reads as one -- "the scan found
    // nothing" is a different fact from "a branch is unmarked", and an
    // ordinary expect() reports them in the same voice.
    premise("the derived scan reaches accepted fault branches", ACCEPTED.length, 20);
    premise(
      "those branches span more than one file",
      new Set(ACCEPTED.map((c) => c.file)).size,
      10,
    );
  });

  /**
   * A form in the accept-set that no live branch exercises is a rule nothing
   * tests. Each such form is DECLARED with why it is unreachable today, so the
   * gap is visible rather than inferred from a passing suite.
   */
  const UNEXERCISED: Record<string, string> = {
    "switch-case":
      "the live switch on a result kind is app/show/[slug]/[shareToken]/page.tsx:220, under app/show. No manifest entry routes there today, so app/show is not a derived root and the branch is outside the scan. It becomes exercised the day a crew-show entry is added — which is the point of deriving roots rather than listing them. Consequence worth naming, since it is an asymmetry a reader will otherwise read as an oversight: components/auth/TerminalFailure.tsx carries no marker, while components/crew/SectionTileError.tsx does. Both live under a derived root, but the marker belongs to a GUARD, and SectionTileError has ten guarded call sites inside the scan while TerminalFailure's only guard is that unreachable switch. Marking the component anyway would assert a fault the scan cannot corroborate. The same crew-show manifest entry re-arms both.",
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
