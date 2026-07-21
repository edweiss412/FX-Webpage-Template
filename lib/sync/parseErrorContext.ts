// lib/sync/parseErrorContext.ts
//
// Builds the PARSE_ERROR_LAST_GOOD alert context. `message` is accepted so the
// caller's variable can be passed without a second thought and is GUARANTEED
// never persisted (spec 2026-07-20-attention-alert-routing §3.1 privacy posture).
// Only an allowlisted failure code contributes `error_code`; everything else
// omits the key so a repeated raise never leaves a stale reason behind.
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";

export function buildParseErrorContext(args: {
  driveFileId: string;
  sheetName: string;
  failureCode: string | null | undefined;
  message?: string | null;
}): Record<string, unknown> {
  const errorCode =
    args.failureCode && PARSE_FAILURE_ALLOWLIST.has(args.failureCode)
      ? args.failureCode
      : undefined;
  return {
    drive_file_id: args.driveFileId,
    sheet_name: args.sheetName,
    ...(errorCode ? { error_code: errorCode } : {}),
  };
}
