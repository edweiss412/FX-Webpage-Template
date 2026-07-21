/**
 * lib/dev/galleryModalTypes.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §Type & ownership map)
 *
 * The shared, CLIENT-SAFE types + constants for the attention modal switcher
 * gallery. This module has NO runtime dependency on the server-only derivation
 * (`buildBlockProps` / `deriveScenarioAttention` / catalog), so the client
 * switcher can import it without pulling server code into the client bundle,
 * and the later deletion of `buildBlockProps.ts` cannot break it.
 *
 * The 8 action props of `PublishedReviewModalProps` are functions and therefore
 * NOT React-Flight-serializable; the server page must pass only the DATA half
 * (`GalleryModalData`), and the client switcher owns the action closures. The
 * type-level assertions below make a stray function prop a COMPILE error.
 */
import type { PublishedReviewModalProps } from "@/components/admin/showpage/PublishedReviewModal";

/** The 8 server-action prop names — the only non-serializable keys. */
export type ActionKeys =
  | "setPublished"
  | "archiveAction"
  | "unarchiveAction"
  | "undoAction"
  | "acceptAction"
  | "acceptAllAction"
  | "approveAction"
  | "rejectAction";

/** The serializable DATA half the server page passes to the client switcher. */
export type GalleryModalData = Omit<PublishedReviewModalProps, ActionKeys>;

/** One rendered scenario: serializable data + display metadata. */
export type GallerySwitcherScenario = {
  id: string;
  tier: 1 | 2;
  label: string;
  codes: string[];
  data: GalleryModalData;
};

/** A scenario excluded from the modal (card-only structural probe). */
export type ExcludedScenario = { id: string; label: string };

/** Fixed so relative-time copy is stable across reloads (matches buildBlockProps). */
export const GALLERY_NOW = new Date("2026-07-01T18:00:00.000Z");
export const GALLERY_SLUG = "gallery";

// ── Compile-time guards (no runtime cost) ───────────────────────────────────
// (a) every ActionKeys key EXISTS on the props type.
type _KeysExist = ActionKeys extends keyof PublishedReviewModalProps ? true : never;
const _keysExist: _KeysExist = true;
void _keysExist;

// (b) every ActionKeys prop is FUNCTION-valued (so it is right to strip them).
type _AllFns = {
  [K in ActionKeys]: PublishedReviewModalProps[K] extends (...a: never[]) => unknown ? true : never;
}[ActionKeys];
const _allFns: _AllFns = true;
void _allFns;

// (c) GalleryModalData carries NO function-valued key — a leaked function makes
// this union non-`never`, and assigning `never` fails to compile.
type _FnKeysInData = {
  [K in keyof GalleryModalData]: GalleryModalData[K] extends (...a: never[]) => unknown ? K : never;
}[keyof GalleryModalData];
const _noFnKeys: _FnKeysInData = undefined as never;
void _noFnKeys;
