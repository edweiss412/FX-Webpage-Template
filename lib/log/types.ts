// lib/log/types.ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  source: string;
  code?: string;
  showId?: string | null;
  driveFileId?: string | null;
  requestId?: string | null;
  actorHash?: string | null;
  error?: unknown;
  persist?: boolean;
  [key: string]: unknown;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  source: string;
  code: string | null;
  requestId: string | null;
  showId: string | null;
  driveFileId: string | null;
  actorHash: string | null;
  context: Record<string, unknown>;
}

export type Sink = (record: LogRecord, persist: boolean) => void | Promise<void>;
