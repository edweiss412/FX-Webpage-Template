// Shared severity map for finalize / finalize-cas per-row hard-fail telemetry (Observability PR-2
// S2). A per-row terminal code is either an INFRA fault (`DRIVE_FETCH_FAILED` — the Drive export
// itself failed → log.error, operator must retry/inspect infra) or recoverable staleness
// (revision race / out-of-scope / unsupported reviewer-choices version / corrupt review items /
// superseded session / Phase-D outdated → log.warn, resolved by re-apply). Both routes route
// their POST-COMMIT flush through this ONE map so a `DRIVE_FETCH_FAILED` that ever reaches the
// finalize-cas path is correctly classified as an error, never under-logged as a warn.
export function severityForFinalizeRowCode(code: string): "error" | "warn" {
  return code === "DRIVE_FETCH_FAILED" ? "error" : "warn";
}
