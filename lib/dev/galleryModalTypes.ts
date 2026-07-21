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
// `Assert<T>` only accepts `true`; using it in a type position fails to compile
// when its argument resolves to `false`. The `[X] extends [never]` tuple wrap
// stops `never` from distributing (a bare `never extends ...` is vacuously true
// and would mask leaks — the exact defect a naive union guard has).
export type Assert<T extends true> = T;
/**
 * True iff V (optional-stripped) is a function. The `[X] extends [never]` guard
 * is load-bearing: `NonNullable<undefined>` / `NonNullable<never>` collapse to
 * `never`, and `never extends Fn` is VACUOUSLY true — without the explicit
 * never-check an `undefined`-only prop would be misclassified as callable.
 */
export type IsFn<V> = [NonNullable<V>] extends [never]
  ? false
  : [NonNullable<V>] extends [(...a: never[]) => unknown]
    ? true
    : false;
/** Keys of T whose (optional-stripped) value is a function. */
export type FnKeys<T> = { [K in keyof T]-?: IsFn<T[K]> extends true ? K : never }[keyof T];

// (a) every ActionKeys key EXISTS on the props type.
type _KeysExist = Assert<ActionKeys extends keyof PublishedReviewModalProps ? true : false>;

// (b) every ActionKeys prop is FUNCTION-valued — the NON-function action keys
// must be `never` (one valid function can no longer mask a non-function key).
type _NonFnActionKeys = {
  [K in ActionKeys]: IsFn<PublishedReviewModalProps[K]> extends true ? never : K;
}[ActionKeys];
type _AllActionsAreFns = Assert<[_NonFnActionKeys] extends [never] ? true : false>;

// (c) GalleryModalData carries NO function-valued key — a single leaked closure
// makes `FnKeys<GalleryModalData>` non-`never`, flipping this to `false`.
type _NoFnsInData = Assert<[FnKeys<GalleryModalData>] extends [never] ? true : false>;

// Reference the guard aliases so they are not "unused" under strict lint.
export type _GalleryTypeGuards = [_KeysExist, _AllActionsAreFns, _NoFnsInData];
