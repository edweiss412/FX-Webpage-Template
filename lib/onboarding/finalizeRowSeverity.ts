// Shared severity map for finalize / finalize-cas per-row hard-fail telemetry (Observability PR-2
// S2). A per-row terminal code is either an INFRA fault (`DRIVE_FETCH_FAILED` — the Drive export
// itself failed → log.error, operator must retry/inspect infra) or recoverable staleness
// (revision race / out-of-scope / unsupported reviewer-choices version / corrupt review items /
// superseded session / Phase-D outdated → log.warn, resolved by re-apply). Both routes route
// their POST-COMMIT flush through this ONE map so a `DRIVE_FETCH_FAILED` that ever reaches the
// finalize-cas path is correctly classified as an error, never under-logged as a warn.
//
// `STAGED_PARSE_FAILED` (the inline re-parse's sheet-content branch, spec
// 2026-07-24-test-safety-hardening-batch §4.5) is deliberately a WARN: a sheet whose structure
// the parser cannot read is recovered by Doug editing the sheet and re-applying, exactly like
// the staleness codes. It reached this map as an `error` only because that fault used to be
// reported as `DRIVE_FETCH_FAILED`; splitting the codes puts it in its correct severity.
export function severityForFinalizeRowCode(code: string): "error" | "warn" {
  return code === "DRIVE_FETCH_FAILED" ? "error" : "warn";
}
