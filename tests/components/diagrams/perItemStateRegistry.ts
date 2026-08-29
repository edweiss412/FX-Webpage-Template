/**
 * tests/components/diagrams/perItemStateRegistry.ts
 *
 * The classification half of spec §4.0.3's cover. The scanner enumerates; this
 * decides. A declaration the scanner finds and this file does not classify reds
 * the meta-test, which is what makes a member added later fail by default rather
 * than being silently exempt.
 *
 * `clearedBy` is the field spec §4.0.3's table publishes. A per-item row must say
 * how its entry goes away, or say `deliberately none` in exactly those words —
 * `demotedRef` is precisely a row whose correct value is the literal phrase, and
 * an empty string would document nothing while still counting as "classified".
 */
export const DELIBERATELY_NONE = "deliberately none";

export type Classification =
  | { kind: "per-item"; clearedBy: string }
  | { kind: "not-per-item"; why: string };

/** Keyed by `<basename>:<declared name>`. */
export const PER_ITEM_STATE_REGISTRY: Record<string, Classification> = {
  // ── Gallery.tsx ────────────────────────────────────────────────────────────
  "Gallery.tsx:expanded": { kind: "not-per-item", why: "one boolean for the whole grid" },
  "Gallery.tsx:lightboxIndex": { kind: "not-per-item", why: "a position, not an item identity" },
  "Gallery.tsx:openNonce": { kind: "not-per-item", why: "one counter per dialog session" },
  "Gallery.tsx:failedKeys": {
    kind: "per-item",
    clearedBy: "entering `retrying`; the item going unavailable or leaving `items` (spec §9.1)",
  },
  "Gallery.tsx:listRef": { kind: "not-per-item", why: "the grid container" },
  "Gallery.tsx:showMoreRef": { kind: "not-per-item", why: "the single toggle control" },
  "Gallery.tsx:thumbRefs": {
    kind: "per-item",
    clearedBy:
      "React, on unmount. Holds ONLY the healthy thumbnail button; the retry button has its own map (spec §7)",
  },
  "Gallery.tsx:restoreTargetRef": {
    kind: "per-item",
    clearedBy: "re-pointed on every failure that removes the current target (spec §7)",
  },
  "Gallery.tsx:dialogMountedRef": { kind: "not-per-item", why: "one flag per dialog session" },
  "Gallery.tsx:exitBufferRef": {
    kind: "not-per-item",
    why: "a message queue for the dialog channel, keyed by nothing",
  },
  "Gallery.tsx:pendingFailuresRef": {
    kind: "per-item",
    clearedBy: "entering `retrying` (spec §4.0.1); the item going unavailable or leaving `items`",
  },
  "Gallery.tsx:lightboxOpenRef": { kind: "not-per-item", why: "one flag for the dialog" },

  // ── GalleryLightbox.tsx ────────────────────────────────────────────────────
  "GalleryLightbox.tsx:transformScaleRef": {
    kind: "not-per-item",
    why: "the live gesture's scale",
  },
  "GalleryLightbox.tsx:dialogRef": { kind: "not-per-item", why: "the dialog element" },
  "GalleryLightbox.tsx:closeRef": { kind: "not-per-item", why: "the single Close control" },
  "GalleryLightbox.tsx:prevRef": { kind: "not-per-item", why: "the single Previous chevron" },
  "GalleryLightbox.tsx:nextRef": { kind: "not-per-item", why: "the single Next chevron" },
  "GalleryLightbox.tsx:activeIndex": { kind: "not-per-item", why: "a position, not an identity" },
  // FOUND BY THE SCANNER ON ITS FIRST RUN, and missed by every hand-derivation
  // before it — including the grep spec §4.0.3 rejected AND the tightened grep
  // used to draft that section. Both required a setter (`const [x, setX] =`);
  // this is `const [prefersReducedMotion] = useState(...)`, a single-element
  // destructure with none. Exactly the shape a lexical scan cannot be trusted for.
  "GalleryLightbox.tsx:prefersReducedMotion": {
    kind: "not-per-item",
    why: "one OS preference, read once at mount for the whole component",
  },
  "GalleryLightbox.tsx:activeScale": {
    kind: "per-item",
    clearedBy:
      "the active-slide error path already resets it (`GalleryLightbox.tsx:1112`); a retry returning the slide to idle leaves it at 1, correct for a freshly loaded clamped tier",
  },
  "GalleryLightbox.tsx:liveRegionText": { kind: "not-per-item", why: "one live region" },
  "GalleryLightbox.tsx:navigatedRef": { kind: "not-per-item", why: "one flag per session" },
  "GalleryLightbox.tsx:wasAnnouncedZoomedRef": {
    kind: "not-per-item",
    why: "one announcement latch",
  },
  "GalleryLightbox.tsx:failedKeys": {
    kind: "per-item",
    clearedBy: "entering `retrying`; the item going unavailable or leaving `items` (spec §9.1)",
  },
  "GalleryLightbox.tsx:wantsOriginal": {
    kind: "per-item",
    clearedBy:
      "entering `retrying` (spec §4.0.2); the demote path, unchanged; AND the availability sweep (spec §9.1) — without that last one a zoomed slide that goes unavailable and returns re-requests the original through `pinOriginal`",
  },
  "GalleryLightbox.tsx:demotedRef": {
    kind: "per-item",
    clearedBy: DELIBERATELY_NONE,
  },
  "GalleryLightbox.tsx:demotedNotice": {
    kind: "per-item",
    clearedBy: "its own timer; `failedKeys` gaining the id; the item going unavailable (spec §9.1)",
  },
  "GalleryLightbox.tsx:demoteTimerRef": {
    kind: "per-item",
    clearedBy: "cleared with `demotedNotice`, never separately",
  },
  "GalleryLightbox.tsx:closedAtNonce": {
    kind: "not-per-item",
    why: "one nonce per dialog session",
  },
  "GalleryLightbox.tsx:controlsSlotRef": {
    kind: "per-item",
    clearedBy:
      "React, on `TransformWrapper` unmount. The failed branch does not mount it, so it is null for the whole failed-and-retrying window",
  },
  "GalleryLightbox.tsx:requestedScaleRef": {
    kind: "per-item",
    clearedBy: "the active-slide error path already resets it (`GalleryLightbox.tsx:1110`)",
  },
  "GalleryLightbox.tsx:wasZoomedRef": {
    kind: "not-per-item",
    why: "one latch for the zoom announcement",
  },
};
