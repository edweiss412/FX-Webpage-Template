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
// REMOVED with its last user (whole-diff review round 2). `demotedRef` was the
// only row whose clearedBy was this phrase, and the review showed the claim
// behind it was false: the latch is not conservative across snapshot
// revisions, because a crew id outlives the asset it points at. Reintroduce
// this only alongside a member that genuinely has no clear path.
// export const DELIBERATELY_NONE = "deliberately none";

/**
 * Whether the availability sweep (spec §9.1) clears this member when its item
 * goes unavailable or leaves `items`.
 *
 * REQUIRED on every per-item row, and that is the whole point. Plan review found
 * FOUR members of this class in two consecutive rounds — `wantsOriginal` in R2,
 * then `activeScale`, `requestedScaleRef` and `controlsSlotRef` in R3 — each by
 * reading the code and noticing an absence. Prose `clearedBy` could not be
 * queried for "does the sweep touch this?", so every instance had to be found by
 * a human. A required field cannot be silent: a new member forces the question,
 * and `false` forces a reason.
 */
export type SweepDecision = { swept: true } | { swept: false; why: string };

export type Classification =
  | { kind: "per-item"; clearedBy: string; sweep: SweepDecision }
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
    sweep: { swept: true },
  },
  "Gallery.tsx:retrying": {
    kind: "per-item",
    clearedBy:
      "`onLoad` (retrying -> idle) and `onError` (retrying -> failed), both per item; and the availability sweep, since a slide that goes unavailable mid-flight must not return holding an overlay (spec §4, §9.1)",
    sweep: { swept: true },
  },
  "Gallery.tsx:focusWasOursRef": {
    kind: "not-per-item",
    why: "one boolean about the WHOLE GALLERY, not about any item: whether focus is currently ours. Set by a focus event rather than sampled at commit, because focus arriving on a control causes no re-render -- the commit-sampled version missed exactly that case and round 2 of the whole-diff review measured it",
  },
  "Gallery.tsx:rootRef": {
    kind: "not-per-item",
    why: "the gallery root element, scoped wider than `listRef` on purpose: the Show all / Show fewer toggle lives outside the `<ul>` and disappears on its own when the count falls to twelve",
  },
  "Gallery.tsx:focusThumbRef": {
    kind: "per-item",
    clearedBy:
      "the layout effect that consumes it, which nulls it before focusing; armed only when the in-flight overlay is the focused element",
    sweep: {
      swept: false,
      why: "a single-commit hand-off, not retained state. It is armed and consumed within one commit pair, so an item cannot go unavailable between the two -- and if the target is gone the optional-chained `.focus()` is a no-op rather than a stale focus",
    },
  },
  "Gallery.tsx:focusFailedRef": {
    kind: "per-item",
    clearedBy:
      "the retry control's own ref callback, which nulls it the moment it takes focus -- so it holds a value for exactly one commit",
    sweep: {
      swept: false,
      why: "single-shot and self-clearing, like focusRetryingRef: it names the item whose control should take focus on mount, and is nulled on read, so no sweep can find a stale id",
    },
  },
  "Gallery.tsx:restoreToControlRef": {
    kind: "per-item",
    clearedBy:
      "the retry control's ref callback, nulled as it assumes the restore duty -- one commit, same as focusFailedRef",
    sweep: {
      swept: false,
      why: "single-shot and self-clearing. Deliberately SEPARATE from focusFailedRef: the dialog's restore target must follow the failed cell even when that cell did not hold focus, which is the common case of a trigger failing while focus is inside the open dialog",
    },
  },
  "Gallery.tsx:retryingRefs": {
    kind: "per-item",
    clearedBy: "React, on unmount of each in-flight overlay (the ref callback stores null)",
    sweep: {
      swept: false,
      why: "a DOM ref map, not session state: React nulls each entry as its control unmounts, so a sweep would duplicate what the ref callback already does",
    },
  },
  "Gallery.tsx:retryControlRefs": {
    kind: "per-item",
    clearedBy: "React, on unmount of each failed control (the ref callback stores null)",
    sweep: {
      swept: false,
      why: "same shape as retryingRefs: React owns the lifetime, and the map is read only to ask whether the element it points at currently holds focus",
    },
  },
  "Gallery.tsx:focusRetryingRef": {
    kind: "per-item",
    clearedBy:
      "the hand-off effect itself, which nulls it the moment it consumes the id -- so it holds a value for exactly one commit",
    sweep: {
      swept: false,
      why: "single-shot and self-clearing: it names the item whose focus is mid-hand-off and is nulled on read, so there is no window in which a sweep could find a stale id",
    },
  },
  "Gallery.tsx:listRef": { kind: "not-per-item", why: "the grid container" },
  "Gallery.tsx:showMoreRef": { kind: "not-per-item", why: "the single toggle control" },
  "Gallery.tsx:thumbRefs": {
    kind: "per-item",
    clearedBy:
      "React, on unmount. Holds ONLY the healthy thumbnail button; the retry button has its own map (spec §7)",
    sweep: {
      swept: false,
      why: "React nulls the entry when the healthy thumbnail unmounts, which the availability flip already causes",
    },
  },
  "Gallery.tsx:restoreTargetRef": {
    kind: "per-item",
    clearedBy:
      "re-pointed on every failure that removes the current target (spec §7); AND cleared by the availability sweep. Plan review R4 showed the failure closure does NOT run on an availability flip, so the thumbnail that opened the lightbox going unavailable leaves this naming a detached node, and useDialogFocus focuses it at close and drops to `<body>`",
    sweep: { swept: true },
  },
  "Gallery.tsx:dialogMountedRef": { kind: "not-per-item", why: "one flag per dialog session" },
  "Gallery.tsx:exitBufferRef": {
    kind: "not-per-item",
    why: "a message queue for the dialog channel, keyed by nothing",
  },
  "Gallery.tsx:pendingFailuresRef": {
    kind: "per-item",
    clearedBy: "entering `retrying` (spec §4.0.1); the item going unavailable or leaving `items`",
    sweep: { swept: true },
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
      "the availability sweep, in render, when the active item is not available; ALSO the active-slide error path and a slide change. R1 finding 3: the error path alone was cited here and is a DIFFERENT path from going unavailable, so this row claimed a sweep that did not exist",
    sweep: { swept: true },
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
    sweep: { swept: true },
  },
  "GalleryLightbox.tsx:retrying": {
    kind: "per-item",
    clearedBy:
      "`onLoad` (retrying -> idle) and the retry-failure branch of `onError` (retrying -> failed), both per item; and the availability sweep, so a slide going unavailable mid-flight cannot return holding an overlay (spec §4, §9.1)",
    sweep: { swept: true },
  },
  "GalleryLightbox.tsx:retryingRefs": {
    kind: "per-item",
    clearedBy: "React, on unmount of each in-flight overlay (the ref callback stores null)",
    sweep: {
      swept: false,
      why: "a DOM ref map, not session state: React nulls each entry as its control unmounts, and it is read only to ask whether that element currently holds focus",
    },
  },
  "GalleryLightbox.tsx:retryControlRefs": {
    kind: "per-item",
    clearedBy: "React, on unmount of each retry control (the ref callback stores null)",
    sweep: {
      swept: false,
      why: "same shape as retryingRefs; React owns the lifetime",
    },
  },
  "GalleryLightbox.tsx:focusRetryTargetRef": {
    kind: "per-item",
    clearedBy: "the focus hand-off that consumes it, which nulls it on read",
    sweep: {
      swept: false,
      why: "single-shot and self-clearing: it names the item whose control should take focus after a transition, and is nulled as it is read, so no sweep can find a stale id",
    },
  },
  "GalleryLightbox.tsx:wantsOriginal": {
    kind: "per-item",
    clearedBy:
      "entering `retrying` (spec §4.0.2); the demote path, unchanged; AND the availability sweep (spec §9.1) — without that last one a zoomed slide that goes unavailable and returns re-requests the original through `pinOriginal`",
    sweep: { swept: true },
  },
  "GalleryLightbox.tsx:demotedRef": {
    kind: "per-item",
    clearedBy:
      "a change of `snapshotRevisionId`, which is the event meaning the bytes behind these ids are different. NOT cleared by the availability sweep: within one revision the id still points at the same asset, and declining a re-pin there is the conservative behaviour",
    sweep: {
      swept: false,
      why: "not swept on AVAILABILITY, deliberately -- an item going unavailable and returning inside one revision is the same asset, so the latch should survive it. The row previously said the latch was 'conservative in every direction' and that was WRONG across revisions: crew ids are stable across syncs while the asset key and variants change, so the latch silently denied full detail to a healthy replacement. Fixed by scoping it to the revision (R2 round 2 finding 2)",
    },
  },
  "GalleryLightbox.tsx:demotedNotice": {
    kind: "per-item",
    clearedBy: "its own timer; `failedKeys` gaining the id; the item going unavailable (spec §9.1)",
    sweep: { swept: true },
  },
  "GalleryLightbox.tsx:demoteTimerRef": {
    kind: "per-item",
    clearedBy: "cleared with `demotedNotice`, never separately",
    sweep: { swept: true },
  },
  "GalleryLightbox.tsx:closedAtNonce": {
    kind: "not-per-item",
    why: "one nonce per dialog session",
  },
  "GalleryLightbox.tsx:controlsSlotRef": {
    kind: "per-item",
    clearedBy:
      "React, on `TransformWrapper` unmount. The failed branch does not mount it, so it is null for the whole failed-and-retrying window",
    sweep: {
      swept: false,
      why: "React nulls it when TransformWrapper unmounts, which the unavailable render already does. The chip that would strand is hidden by sweeping activeScale instead",
    },
  },
  "GalleryLightbox.tsx:scaleOwner": {
    kind: "per-item",
    clearedBy:
      "the derived-state update in render, which re-points it the moment the active item's id changes and takes `activeScale` back to 1 with it",
    sweep: {
      swept: true,
    },
  },
  "GalleryLightbox.tsx:itemsRef": {
    kind: "not-per-item",
    why: "a mirror of the whole `items` prop, not a per-item slot. Same reason as `retryingStateRef`: the Embla `select` subscriber is registered once, so reading the prop there would consult the roster of the render that subscribed",
  },
  "GalleryLightbox.tsx:retryingStateRef": {
    kind: "not-per-item",
    why: "a whole-set mirror of `retrying`, not a per-item slot. It exists because the Embla `select` subscriber is registered once and would otherwise read the `retrying` of the render that subscribed; the sweep acts on `retrying` itself, and this follows it in an effect",
  },
  "GalleryLightbox.tsx:requestedScaleRef": {
    kind: "per-item",
    clearedBy:
      "the ref half of the availability sweep, in an effect (`react-hooks/refs` forbids writing a ref in render, and this one does not render); ALSO the error path and a slide change. Same R1 finding 3 correction as `activeScale`",
    sweep: { swept: true },
  },
  "GalleryLightbox.tsx:wasZoomedRef": {
    kind: "not-per-item",
    why: "one latch for the zoom announcement",
  },
};
