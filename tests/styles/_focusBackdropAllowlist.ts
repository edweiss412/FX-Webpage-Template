/**
 * The backdrop-family tokens a `ring-offset-<token>` companion may name, and
 * simultaneously the families the focus-ring contrast meta-test verifies.
 * Spec 2026-08-01 §3/§4.3: allowlist = contrast-matrix identity by construction
 * (focusRingContrast.test.ts imports this constant; noBareRingOffset.test.ts
 * validates companions against it). Extending it means adding a §3 matrix row.
 * `info-bg` is a member via the §3.1 token nudge (#F1EDE7).
 */
export const FOCUS_BACKDROP_ALLOWLIST = [
  "surface",
  "surface-raised",
  "surface-sunken",
  "bg",
  "warning-bg",
  "info-bg",
  "stale-tint",
  "accent-tint",
  "danger-bg",
] as const;
export type FocusBackdrop = (typeof FOCUS_BACKDROP_ALLOWLIST)[number];
