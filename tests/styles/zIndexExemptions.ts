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
  /** 1-based line of the site. Part of the key: a row exempts ONE site, never every
   *  identical token in the file (whole-diff review r2 F2). */
  readonly line: number;
  /** The exact token, e.g. `z-45` or `zIndex: 45`. */
  readonly token: string;
  /** Why this site stays numeric. Never blank. */
  readonly reason: string;
};

export const Z_INDEX_EXEMPTIONS: readonly ZIndexExemption[] = [];
