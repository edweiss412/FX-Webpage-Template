/**
 * tests/e2e/_controlOutlineContrastLiveEntry.tsx
 *
 * Browser ENTRY for the control-outline contrast harness: the REAL
 * <Step3ReviewModal> tree, with the ONE fixture field the shared harness leaves
 * null that §14's venue pair needs.
 *
 * Never imported by a spec (Playwright's transform rewrites JSX in every
 * spec-imported .tsx). Bundled by `_step3ReviewModalBundle.mjs`, which replaces
 * `"use server"` modules with throwing stubs by class and empties node
 * builtins, so the tree's server-only reach drops out exactly as Next drops it
 * from a client bundle.
 *
 * The crew contact icons need nothing: the shared fixture's twelve members
 * already carry phone and email, so their tel/mailto anchors mount as they are.
 */
import { createRoot } from "react-dom/client";
import { buildSectionData, modalElement } from "./_step3ReviewModalHarness";

/**
 * `venue` is null in the shared fixture, and the venue tile is gated on
 * `query || mapHref` where query is "name, address" and mapHref is a parseable
 * `venue.googleLink` (step3ReviewSections). Supplying all three is what makes
 * <VenueMapTile> mount with its Directions visual.
 */
const data = {
  ...(buildSectionData() as unknown as Record<string, unknown>),
  venue: {
    name: "Waldorf Astoria",
    address: "301 Park Ave, New York, NY",
    googleLink: "https://www.google.com/maps/search/?api=1&query=Waldorf+Astoria",
  },
} as unknown as Parameters<typeof modalElement>[0];

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("contrast harness page is missing #root");
createRoot(rootEl).render(modalElement(data, { onRequestSetChecked: async () => true }));
