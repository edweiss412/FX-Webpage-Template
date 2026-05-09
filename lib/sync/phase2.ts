import type { DriveListedFile } from "@/lib/drive/list";
import { deriveSlug } from "@/lib/parser/slug";
import type { ParseResult } from "@/lib/parser/types";
import { applyParseResult, type ApplyParseResultTx } from "@/lib/sync/applyParseResult";
import type { Phase1Binding } from "@/lib/sync/phase1";
import type { ResolvedSyncMode } from "@/lib/sync/perFileProcessor";

export type Phase2Mode = Exclude<ResolvedSyncMode, "asset_recovery">;
export type StaleWriteCode =
  | "STALE_WRITE_ABORTED"
  | "STALE_PUSH_ABORTED"
  | "STALE_MANUAL_REPLAY_ABORTED";

export type Phase2Tx = ApplyParseResultTx & {
  applyShowSnapshot(args: {
    driveFileId: string;
    modifiedTime: string;
    staleGuard: "strict_less_than" | "less_than_or_equal";
    parseResult: ParseResult;
    slug: string;
    skipDiagramsWrite?: boolean;
  }): Promise<
    | {
        outcome: "updated";
        showId: string;
        previousCrewNames: string[];
      }
    | {
        outcome: "stale";
      }
  >;
};

export type Phase2Args = {
  driveFileId: string;
  mode: Phase2Mode;
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  binding: Phase1Binding;
  skipDiagramsWrite?: boolean;
};

export type Phase2Result =
  | {
      outcome: "applied";
      showId: string;
    }
  | {
      outcome: "stale";
      code: StaleWriteCode;
    };

export class Phase2InfraError extends Error {
  readonly operation: string;
  override readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Phase 2 transaction-port failure during ${operation}`);
    this.name = "Phase2InfraError";
    this.operation = operation;
    this.cause = cause;
  }
}

async function callTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    throw new Phase2InfraError(operation, cause);
  }
}

function staleGuardForMode(mode: Phase2Mode): "strict_less_than" | "less_than_or_equal" {
  return mode === "cron" || mode === "push" ? "strict_less_than" : "less_than_or_equal";
}

function staleCodeForMode(mode: Phase2Mode): StaleWriteCode {
  if (mode === "push") return "STALE_PUSH_ABORTED";
  if (mode === "manual") return "STALE_MANUAL_REPLAY_ABORTED";
  return "STALE_WRITE_ABORTED";
}

export async function runPhase2(tx: Phase2Tx, args: Phase2Args): Promise<Phase2Result> {
  const snapshot = await callTx("applyShowSnapshot", () =>
    tx.applyShowSnapshot({
      driveFileId: args.driveFileId,
      modifiedTime: args.binding.modifiedTime,
      staleGuard: staleGuardForMode(args.mode),
      parseResult: args.parseResult,
      slug: deriveSlug(args.parseResult, []),
      skipDiagramsWrite: args.skipDiagramsWrite ?? false,
    }),
  );

  if (snapshot.outcome === "stale") {
    return { outcome: "stale", code: staleCodeForMode(args.mode) };
  }

  await callTx("applyParseResult", () =>
    applyParseResult(tx, {
      driveFileId: args.driveFileId,
      parseResult: args.parseResult,
      snapshot,
    }),
  );

  return { outcome: "applied", showId: snapshot.showId };
}
