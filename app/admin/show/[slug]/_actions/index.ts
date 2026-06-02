/**
 * app/admin/show/[slug]/_actions/index.ts (M12.2 Phase B2 Task 7.1)
 *
 * Re-export barrel for the three per-show lifecycle server actions. Each
 * underlying module carries its own `"use server"` directive, so this plain
 * barrel preserves the server-action boundary while giving callers a single
 * import site.
 */
export { archiveShowAction } from "./archive";
export { publishShowAction } from "./publish";
export { unarchiveShowAction } from "./unarchive";
