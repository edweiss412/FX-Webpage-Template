/**
 * tests/e2e/_diagramRetryLiveEntry.tsx
 * (spec 2026-08-29-diagram-failure-retry §4.0.5; plan Task 2, AC-1 + AC-2)
 *
 * Browser ENTRY for the LIVE retry harness: mounts the REAL <Gallery> so the
 * two claims jsdom cannot reach are measured in a real engine.
 *
 *   AC-1  the node that loads is the node the idle cell then shows, asserted by
 *         tagging the element and re-reading the tag -- a remounted image is
 *         also "an image", which is why presence cannot stand in for identity.
 *   AC-2  one tap issues exactly ONE request for the asset, the `srcSet`
 *         candidate set is unchanged across the transition, and for a laddered
 *         entry it contains no original-tier URL.
 *
 * The request count is the whole reason this is a browser test: jsdom issues no
 * requests at all, so what makes a retry actually re-fetch is invisible to every
 * jsdom assertion (probed: removing it leaves 196/196 green).
 *
 * This said "the remount key" until whole-diff review round 3. No remount key
 * ships and none may be added: §4.0.5 requires the loaded node to SURVIVE, since
 * the asset route carries no validator and a remount is a second unconditional
 * GET. This file was not among the sites the finding cited — it turned up only
 * because the repair enumerated every mention of the dead mechanisms rather than
 * fixing the ones named, which is the difference between sweeping a class and
 * patching instances. See §0 of the design spec.
 *
 * The item is LADDERED on purpose. An originals-only entry has no clamped tier,
 * so "no original-tier URL in the candidate set" would hold vacuously and the
 * assertion would prove nothing about the loader's choice.
 *
 * NEVER imported by a Playwright spec -- Playwright's babel transform rewrites
 * JSX in spec-imported .tsx into component-testing payloads react-dom cannot
 * render. diagram-retry.spec.ts bundles this out-of-process with a
 * version-pinned esbuild and serves it, mirroring _compactAlertCardLiveEntry.
 */
import { createRoot } from "react-dom/client";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

const KEY = "embedded-obj-1.png";

const items: GalleryItem[] = [
  {
    id: "embedded:obj-1",
    key: KEY,
    alt: "Stage left truss",
    available: true,
    // A real ladder, so the clamped choice is a choice.
    variants: [
      { width: 256, key: `${KEY}@256.webp` },
      { width: 512, key: `${KEY}@512.webp` },
      { width: 1024, key: `${KEY}@1024.webp` },
    ],
  },
  {
    id: "embedded:obj-2",
    key: "embedded-obj-2.png",
    alt: "Diagram 2",
    available: true,
    variants: [{ width: 256, key: "embedded-obj-2.png@256.webp" }],
  },
];

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <div style={{ width: 390, padding: 8 }}>
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />
    </div>,
  );
}
