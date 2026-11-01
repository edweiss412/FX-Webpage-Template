import { describe, expect, test } from "vitest";
import { stripCommentsForFile } from "../../../_shared/stripComments";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");

// Strip `//` line and `/* … */` block comments before scanning: the audit tests
// CODE, not prose. A source comment mentioning the word "transition" (e.g.
// "no transition class here") must NOT trip the class scan.

const tileRaw = readFileSync(join(ROOT, "components/admin/wizard/VenueMapTile.tsx"), "utf8");
const tile = stripCommentsForFile(tileRaw, "components/admin/wizard/VenueMapTile.tsx");
const sections = stripCommentsForFile(
  readFileSync(join(ROOT, "components/admin/wizard/step3ReviewSections.tsx"), "utf8"),
  "components/admin/wizard/step3ReviewSections.tsx",
);
// The Where core moved to the shared Venue body (crew page redesign PR B plan,
// Task 5); VenueBreakdown keeps the map region and its predicate (the admin's
// map slot) and the empty state, and calls the body for the rest.
const body = stripCommentsForFile(
  readFileSync(join(ROOT, "components/show-panels/VenueBody.tsx"), "utf8"),
  "components/show-panels/VenueBody.tsx",
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
  return rest.slice(0, nextFn === -1 ? undefined : nextFn);
}

describe("venue card transition inventory (spec §8 — all instant)", () => {
  test("tile: no AnimatePresence / exit / initial props (card is static)", () => {
    expect(tile).not.toMatch(/AnimatePresence|(?:^|\s)exit=|(?:^|\s)initial=/);
  });
  test("VCR-2: the map <img> is conditionally mounted on the resolved theme (no first-paint fetch), still instant", () => {
    // The <img> must render inside a `theme !== null` gate so SSR/first paint
    // has no <img> (no wrong-theme raster fetched) — §8 row is a mount, not a
    // fade. Assert the gate exists AND no opacity/transition animates it.
    expect(tile).toContain("theme !== null");
    expect(tile).not.toMatch(/\btransition(-\w+)?\b/);
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
  // VenueBreakdown (the map region, its admin slot) and the shared Venue body it
  // calls (the dock footer), not the tile. Prove they EXIST (non-tautological —
  // a broken rewrite that drops them fails here) and that each is INSTANT (no
  // transition or AnimatePresence wrapping the state change).
  test("VenueBreakdown and the Venue body: enumerated conditional renders exist and are instant", () => {
    const src = venueBreakdownSource();
    // (a) map region rendered when query OR a valid mapHref (VCR-3 link-only).
    expect(src, "map-region conditional").toContain("venue-map-region");
    // VCR-3: the region mounts on `query || mapHref` (not query alone), so a
    // link-only venue still shows a (degraded) tile. Pin the predicate.
    expect(src, "region gated on query || mapHref").toContain("query || mapHref");
    // (b) dock footer rendered only when loadingDock has content: the body's.
    expect(src, "VenueBreakdown calls the shared body").toContain("<VenueBody");
    expect(body, "dock-footer conditional").toContain("venue-dock");
    expect(body, "dock footer gated on the dock").toMatch(/\{dockLine \? \(/);
    // (c) directions target: anchor when mapHref, decorative element otherwise —
    // routed through VenueMapTile, which the card always renders.
    expect(src, "map tile mounted").toContain("VenueMapTile");
    // None of these three state changes animates: no transition/AnimatePresence
    // in the VenueBreakdown region or the body (compound transitions — e.g. dock
    // toggling while the map region is absent — are therefore instant by
    // construction).
    for (const [name, text] of [
      ["VenueBreakdown", src],
      ["VenueBody", body],
    ] as const) {
      expect(text, `no transition classes in ${name}`).not.toMatch(/\btransition(-\w+)?\b/);
      expect(text, `no AnimatePresence in ${name}`).not.toMatch(/AnimatePresence/);
    }
  });
});
