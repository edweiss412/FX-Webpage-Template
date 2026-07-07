import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");

// Strip `//` line and `/* … */` block comments before scanning: the audit tests
// CODE, not prose. A source comment mentioning the word "transition" (e.g.
// "no transition class here") must NOT trip the class scan.
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const tileRaw = readFileSync(join(ROOT, "components/admin/wizard/VenueMapTile.tsx"), "utf8");
const tile = stripComments(tileRaw);
const sections = readFileSync(
  join(ROOT, "components/admin/wizard/step3ReviewSections.tsx"),
  "utf8",
);

// Slice out ONLY the VenueBreakdown function body so the assertions cannot be
// satisfied (or violated) by unrelated sections in this large shared file.
function venueBreakdownSource(): string {
  const start = sections.indexOf("function VenueBreakdown");
  expect(start, "VenueBreakdown function not found").toBeGreaterThan(-1);
  // Next top-level declaration terminates the slice. The very next function in
  // live code is `export function TransportBreakdown`, so the terminator MUST
  // accept the optional `export ` prefix or the slice overruns into transport.
  const rest = sections.slice(start + "function VenueBreakdown".length);
  const nextFn = rest.search(/\n(?:export )?function \w/);
  return stripComments(rest.slice(0, nextFn === -1 ? undefined : nextFn));
}

describe("venue card transition inventory (spec §8 — all instant)", () => {
  test("tile: no AnimatePresence / exit / initial props (card is static)", () => {
    expect(tile).not.toMatch(/AnimatePresence|(?:^|\s)exit=|(?:^|\s)initial=/);
  });
  test("tile: no transition classes at all — fully instant (§8)", () => {
    // §8 declares every state pair instant, incl. image load (no fade) and the
    // onError visibility swap. A `transition-*` class would be inert (the
    // component performs no opacity/transform state change) and dishonest.
    expect(tile).not.toMatch(/\btransition(-\w+)?\b/);
    // The fallback swap is a visibility flip in onError, not an animation
    // (scan the RAW source — the assertion string is real code, not a comment).
    expect(tileRaw).toContain('style.visibility = "hidden"');
  });

  // The three enumerated conditional renders of the venue card (§8) live in
  // VenueBreakdown, not the tile. Prove they EXIST (non-tautological — a broken
  // rewrite that drops them fails here) and that each is INSTANT (no transition
  // or AnimatePresence wrapping the state change).
  test("VenueBreakdown: enumerated conditional renders exist and are instant", () => {
    const src = venueBreakdownSource();
    // (a) map region rendered only when the geocode query is non-empty.
    expect(src, "map-region conditional").toContain("venue-map-region");
    // (b) dock footer rendered only when loadingDock has content.
    expect(src, "dock-footer conditional").toContain("venue-dock");
    // (c) directions target: anchor when mapHref, decorative element otherwise —
    // routed through VenueMapTile, which the card always renders.
    expect(src, "map tile mounted").toContain("VenueMapTile");
    // None of these three state changes animates: no transition/AnimatePresence
    // in the VenueBreakdown region (compound transitions — e.g. dock toggling
    // while the map region is absent — are therefore instant by construction).
    expect(src, "no transition classes in VenueBreakdown").not.toMatch(
      /\btransition(-\w+)?\b/,
    );
    expect(src, "no AnimatePresence in VenueBreakdown").not.toMatch(/AnimatePresence/);
  });
});
