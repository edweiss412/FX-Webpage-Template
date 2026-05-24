import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";

const PRIVATE_HEADERS = { "Cache-Control": "private, max-age=0, must-revalidate" };

export type PickerAssetSessionResult =
  | { ok: true }
  | { ok: false; response: Response };

function pickerCookieFromRequest(request: Request): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "__Host-fxav_picker") return valueParts.join("=");
  }
  return undefined;
}

function unauthorized(): Response {
  return new Response(null, { status: 401, headers: PRIVATE_HEADERS });
}

function stale(error: string): Response {
  return NextResponse.json({ error }, { status: 410, headers: PRIVATE_HEADERS });
}

function infra(error: string): Response {
  return NextResponse.json({ error }, { status: 500, headers: PRIVATE_HEADERS });
}

export async function validatePickerAssetSession(
  request: NextRequest,
  showId: string,
): Promise<PickerAssetSessionResult> {
  const result = await resolvePickerSelection({
    showId,
    cookie: pickerCookieFromRequest(request),
  });

  switch (result.kind) {
    case "resolved":
      return { ok: true };
    case "show_unavailable":
      return { ok: false, response: stale("PICKER_SHOW_UNAVAILABLE") };
    case "identity_invalidated":
      return {
        ok: false,
        response: stale("PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER"),
      };
    case "infra_error":
      return { ok: false, response: infra(result.code) };
    case "no_selection":
    case "epoch_stale":
    case "removed_from_roster":
      return { ok: false, response: unauthorized() };
  }
}
