import { Gaxios, type GaxiosOptions, type GaxiosResponse } from "gaxios";
import { google, type drive_v3 } from "googleapis";

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export class DriveConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveConfigError";
  }
}

type GoogleAuthOptions = NonNullable<ConstructorParameters<typeof google.auth.GoogleAuth>[0]>;
type ServiceAccountCredentials = NonNullable<GoogleAuthOptions["credentials"]>;

function readServiceAccountCredentials(): ServiceAccountCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new DriveConfigError("GOOGLE_SERVICE_ACCOUNT_JSON is required for Drive sync");
  }

  try {
    return JSON.parse(raw) as ServiceAccountCredentials;
  } catch (cause) {
    throw new DriveConfigError(
      `GOOGLE_SERVICE_ACCOUNT_JSON must be valid service-account JSON: ${
        cause instanceof Error ? cause.message : "invalid JSON"
      }`,
    );
  }
}

export function getDriveClient(): drive_v3.Drive {
  const auth = getDriveAuth();

  return google.drive({ version: "v3", auth });
}

/**
 * Bounds ONLY the service-account token POST (gtoken → oauth2.googleapis.com);
 * every other request through the auth client's transporter passes through
 * untouched. A flat transporter-level default is WRONG here: the same
 * transporter carries every authenticated API request (googleapis-common
 * routes them through authClient.request), so a blanket timeout would abort
 * healthy stream bodies. Healthy token round-trips are sub-second; 10s is
 * ~10x headroom. Design + probes: drive-timeout-cluster spec 1.2/3.3.
 */
export const GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000;
const GOOGLE_TOKEN_HOST = "oauth2.googleapis.com";

/**
 * URL-scoped transporter: injects the token budget only when the request
 * targets the token host AND the caller set no timeout of its own. The
 * `tokenHost` parameter is a test seam (a local stalled server); production
 * always uses the default.
 */
export class TokenBoundGaxios extends Gaxios {
  constructor(
    readonly tokenTimeoutMs: number,
    readonly tokenHost: string = GOOGLE_TOKEN_HOST,
  ) {
    super();
  }

  override async request<T = unknown>(opts: GaxiosOptions = {}): Promise<GaxiosResponse<T>> {
    let host = "";
    try {
      host = new URL(String(opts.url ?? "")).host;
    } catch {
      // non-URL request shape: pass through unchanged
    }
    if (host === this.tokenHost && opts.timeout == null) {
      return super.request<T>({ ...opts, timeout: this.tokenTimeoutMs });
    }
    return super.request<T>(opts);
  }
}

export function getDriveAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  return new google.auth.GoogleAuth({
    credentials: readServiceAccountCredentials(),
    scopes: GOOGLE_DRIVE_SCOPES,
    clientOptions: { transporter: new TokenBoundGaxios(GOOGLE_AUTH_TOKEN_TIMEOUT_MS) },
  });
}

export async function getDriveAccessToken(): Promise<string> {
  const token = await getDriveAuth().getAccessToken();
  if (!token) {
    throw new DriveConfigError("Google service account did not return an access token");
  }

  return token;
}
