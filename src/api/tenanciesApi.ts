import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `13-07`/`adr/0068`: `GET /api/v1/me/tenancies` (`Ago.Chat.Api.Me.MeEndpoints`, an addition this
 * item made to `ago-chat`) - every `Site` the calling identity administers, for the console's own
 * tenancy switcher. Gated by `RequireKeycloakIdentity`, not `RequireOperatorIdentity` - the same
 * reason `resolveOperatorState` below already calls a route under that weaker policy: an identity
 * with zero or several tenancies has no resolvable `OperatorId`/`SiteId` claim pair yet, so a
 * stricter gate would refuse the very call meant to find that out.
 */
export interface TenancyDto {
  siteId: string;
  siteName: string;
}

export interface TenanciesResponse {
  tenancies: TenancyDto[];
}

/**
 * Carries the server's stable `type` code alongside the human-readable `detail` text every
 * `ErrorExtensions.ToProblem` response already carries - the same split `WidgetConfigError`
 * (`widgetConfigApi.ts`) already established, followed here for the identical reason.
 */
export class TenanciesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TenanciesError";
    this.code = code;
  }
}

interface ProblemDetailsBody {
  type?: string;
  detail?: string;
}

function isProblemDetailsBody(value: unknown): value is ProblemDetailsBody {
  return typeof value === "object" && value !== null;
}

async function buildError(response: Response): Promise<TenanciesError> {
  let code = "Tenancies.Unknown";
  let detail = `Failed to load your tenancies: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json - fall back to the status code alone, matching widgetConfigApi.ts's own
    // buildError precedent.
  }

  return new TenanciesError(code, detail);
}

/**
 * `23-99`: this is `PermissionsProvider`'s own first call - it decides how many shops a person sees
 * at all, and `TenancySwitcher` only mounts once `tenancies.length > 1` (that component's own doc
 * comment). A response that dropped the `tenancies` array, or dropped a field off one entry in it,
 * would previously read exactly like an identity with one shop or none - the pre-onboarding case this
 * provider already treats as ordinary - rather than as a call that did not answer what it promised.
 */
const tenancyRequiredKeys = requiredKeysOf<TenancyDto>({ siteId: true, siteName: true });

export async function fetchMyTenancies(accessToken: string): Promise<TenanciesResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/me/tenancies`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  const body = (await response.json()) as { tenancies?: unknown };
  try {
    assertArrayHasKeys<TenancyDto>(body.tenancies, tenancyRequiredKeys, "GET /api/v1/me/tenancies");
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new TenanciesError("shape.mismatch", reason.message);
    }
    throw reason;
  }
  return { tenancies: body.tenancies };
}
