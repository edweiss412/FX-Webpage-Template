// lib/images/diagramKey.ts
//
// ONE definition of "a diagram asset key we minted", shared by the route's
// accept-set and the client loader.
//
// It lives in its own module because the two had drifted: the loader emitted a
// URL for any non-empty key while the route accepted a narrower set, so a
// malformed manifest row could be SELECTED by the loader — over a usable
// sibling — and then 410 at the route. A shared predicate makes that divergence
// unrepresentable.
//
// Why a shape check at all: a matched path is handed to Supabase Storage's
// `createSignedUrl`, which interpolates it into a URL and lets URL NORMALIZATION
// rewrite it. Probed against the installed client, `v?x.webp` signs `.../v`,
// `a/../b.webp` signs `.../b.webp`, `v\x.webp` signs `.../v/x.webp`, and `..`
// climbs out of the revision prefix entirely. Rejecting these at the accept-set
// means no such key is ever authorized, so there is nothing left to normalize.
//
// The alphabet is the one our own keys are built from: `embedded-<objectId>.<ext>`
// and `folder-<driveFileId>.<ext>`, plus the `@<width>.webp` variant suffix.
// Drive file ids are `[A-Za-z0-9_-]`; Slides object ids additionally permit `:`
// after the first character (Google Slides API request reference), so `:` is IN
// — leaving it out would 410 a legitimately minted variant.

const SAFE_DIAGRAM_KEY = /^[A-Za-z0-9._@:-]+$/;

export function isSafeDiagramKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length === 0) return false;
  // `.` and `..` pass the character class but are relative-path components
  // rather than object names, and URL resolution removes them before routing.
  if (key === "." || key === "..") return false;
  return SAFE_DIAGRAM_KEY.test(key);
}
