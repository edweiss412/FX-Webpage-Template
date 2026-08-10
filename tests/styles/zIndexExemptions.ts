/**
 * tests/styles/zIndexExemptions.ts
 *
 * Reasons-required exemption registry for the semantic z-index band guard
 * (BL-ADMIN-SEMANTIC-Z-INDEX-SCALE). A numeric z-index site that maps to no
 * band is a DESIGN QUESTION resolved in the PR that introduces it — a row
 * here records that resolution; an empty registry is the expected steady
 * state (the M-wave 2 census mapped 1:1 onto the band set).
 */

export type ZIndexExemption = {
  /** Repo-relative path, as the scanner reports it. */
  readonly file: string;
  /** The exact token, e.g. `z-45` or `zIndex: 45`. */
  readonly token: string;
  /** Why this site stays numeric. Never blank. */
  readonly reason: string;
};

export const Z_INDEX_EXEMPTIONS: readonly ZIndexExemption[] = [];
