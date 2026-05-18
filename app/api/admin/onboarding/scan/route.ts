import { randomUUID as defaultRandomUUID } from "node:crypto";
import postgres from "postgres";
import { NextResponse } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import {
  runOnboardingScan as defaultRunOnboardingScan,
  type OnboardingScanResult,
} from "@/lib/sync/runOnboardingScan";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_FOLDER_FIELDS = "id, name, mimeType, trashed";

export type FolderVerificationResult =
  | { ok: true; folderId: string; folderName: string }
  | {
      ok: false;
      status: 400 | 403 | 404;
      code:
        | "INVALID_FOLDER_URL"
        | "FOLDER_NOT_SHARED"
        | "FOLDER_NOT_FOUND"
        | "OPERATOR_ERROR_NOT_FOLDER"
        | "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA";
    };

export type OnboardingScanRouteTx = {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export type ScanRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  randomUUID?: () => string;
  verifyFolder?: (folderId: string) => Promise<FolderVerificationResult>;
  withTx?: <R>(fn: (tx: OnboardingScanRouteTx) => Promise<R>) => Promise<R>;
  runOnboardingScan?: (folderId: string, wizardSessionId: string) => Promise<OnboardingScanResult>;
};

type AppSettingsForScan = {
  pending_wizard_session_id: string | null;
  pending_wizard_session_at: string | null;
  pending_folder_id: string | null;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding scan route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies OnboardingScanRouteTx;
}

async function defaultWithTx<R>(fn: (tx: OnboardingScanRouteTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function parseDriveFolderId(folderUrl: unknown): string | null {
  if (typeof folderUrl !== "string" || folderUrl.trim().length === 0) return null;
  let url: URL;
  try {
    url = new URL(folderUrl);
  } catch {
    return null;
  }
  if (!/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;

  const folderPathMatch = /^\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/.exec(url.pathname);
  const id = folderPathMatch?.[1] ?? url.searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function driveStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown; code?: unknown }).status ?? (error as { code?: unknown }).code;
  return typeof status === "number" ? status : null;
}

export async function defaultVerifyFolder(folderId: string): Promise<FolderVerificationResult> {
  const drive = getDriveClient();
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: DRIVE_FOLDER_FIELDS,
      supportsAllDrives: true,
    });
    const folder = response.data;
    if (folder.trashed) return { ok: false, status: 404, code: "FOLDER_NOT_FOUND" };
    if (!folder.id || !folder.name || !folder.mimeType) {
      return { ok: false, status: 400, code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA" };
    }
    if (folder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      return { ok: false, status: 400, code: "OPERATOR_ERROR_NOT_FOLDER" };
    }
    return { ok: true, folderId: folder.id, folderName: folder.name };
  } catch (error) {
    const status = driveStatus(error);
    if (status === 403) return { ok: false, status: 403, code: "FOLDER_NOT_SHARED" };
    if (status === 404) return { ok: false, status: 404, code: "FOLDER_NOT_FOUND" };
    return { ok: false, status: 400, code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA" };
  }
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

function depsWithDefaults(deps: ScanRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    randomUUID: deps.randomUUID ?? defaultRandomUUID,
    verifyFolder: deps.verifyFolder ?? defaultVerifyFolder,
    withTx: deps.withTx ?? defaultWithTx,
    runOnboardingScan: deps.runOnboardingScan ?? defaultRunOnboardingScan,
  };
}

async function readBody(request: Request): Promise<{ folderUrl?: unknown }> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as { folderUrl?: unknown }) : {};
  } catch {
    return {};
  }
}

async function reserveWizardSession(input: {
  tx: OnboardingScanRouteTx;
  folderId: string;
  folderName: string;
  adminEmail: string;
  randomUUID: () => string;
}): Promise<string> {
  const { rows } = await input.tx.query<AppSettingsForScan>(
    `
      select pending_wizard_session_id, pending_wizard_session_at, pending_folder_id
        from public.app_settings
       where id = 'default'
       for update
    `,
  );
  const settings = rows[0];
  const wizardSessionId = settings?.pending_wizard_session_id ?? input.randomUUID();
  const isMint = settings?.pending_wizard_session_id == null;

  await input.tx.query<AppSettingsForScan>(
    `
      update public.app_settings
         set pending_wizard_session_id = $1::uuid,
             pending_folder_id = $2,
             pending_folder_name = $3,
             pending_folder_set_by_email = $4,
             pending_folder_set_at = now(),
             pending_wizard_session_at = ${isMint ? "now()" : "pending_wizard_session_at"},
             updated_at = now()
       where id = 'default'
       returning pending_wizard_session_id, pending_wizard_session_at, pending_folder_id
    `,
    [wizardSessionId, input.folderId, input.folderName, input.adminEmail],
  );

  await input.tx.query(`delete from public.pending_syncs where wizard_session_id = $1::uuid`, [
    wizardSessionId,
  ]);
  await input.tx.query(`delete from public.pending_ingestions where wizard_session_id = $1::uuid`, [
    wizardSessionId,
  ]);
  await input.tx.query(
    `delete from public.onboarding_scan_manifest where wizard_session_id = $1::uuid`,
    [wizardSessionId],
  );

  return wizardSessionId;
}

export async function handleOnboardingScan(
  request: Request,
  deps: ScanRouteDeps = {},
): Promise<Response> {
  const runtime = depsWithDefaults(deps);
  let admin: { email: string };
  try {
    admin = await runtime.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const body = await readBody(request);
  const folderId = parseDriveFolderId(body.folderUrl);
  if (!folderId) return errorResponse(400, "INVALID_FOLDER_URL");

  const folder = await runtime.verifyFolder(folderId);
  if (!folder.ok) return errorResponse(folder.status, folder.code);

  const wizardSessionId = await runtime.withTx((tx) =>
    reserveWizardSession({
      tx,
      folderId: folder.folderId,
      folderName: folder.folderName,
      adminEmail: admin.email,
      randomUUID: runtime.randomUUID,
    }),
  );

  const result = await runtime.runOnboardingScan(folder.folderId, wizardSessionId);
  return NextResponse.json(result);
}

export async function POST(request: Request): Promise<Response> {
  return await handleOnboardingScan(request);
}
