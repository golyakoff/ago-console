import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `11-01`'s exact wire shape (`WidgetConfigEndpoints.WidgetConfigResponse`/`UpdateWidgetConfigRequest`,
 * `ago-chat`) - `position` crosses the wire as the `Position` enum's PascalCase member name
 * (`"BottomRight"`/`"BottomLeft"`), the same convention `sitesApi.ts`'s own remarks note for other
 * enum-shaped fields in this codebase. A named union, not a bare `string`, so a typo in this file
 * cannot silently compile.
 */
export type WidgetPosition = "BottomRight" | "BottomLeft";

/**
 * `11-10`: `Ago.Chat.Domain.Locale`'s own PascalCase member names on the wire
 * (`WidgetConfigEndpoints.WidgetConfigResponse`/`UpdateWidgetConfigRequest`, `ago-chat`) - the
 * identical convention `WidgetPosition` above already uses for its own enum. A named union, not a
 * bare `string`, for the same reason `WidgetPosition` is one: a typo in this file cannot silently
 * compile.
 */
export type WidgetLocale = "En" | "Ru";

export interface WidgetConfigDto {
  primaryColorHex: string | null;
  position: WidgetPosition;
  locale: WidgetLocale;
}

/**
 * Carries the server's stable `type` code (`WidgetConfig.InvalidColor`, `WidgetConfig.InvalidPosition`,
 * `Conversation.Forbidden` - `ConversationErrors`, `ago-chat`) alongside the human-readable `detail`
 * text every `ErrorExtensions.ToProblem` response already carries, the same split `RegisterSiteError`
 * (`sitesApi.ts`) already established for this codebase's other write endpoint.
 */
export class WidgetConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WidgetConfigError";
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

// A `throw await ...` at each call site, not a helper that throws internally - keeps TypeScript's
// control-flow analysis unambiguous (a bare `throw` statement) rather than relying on a `never`
// return type propagating through an un-returned `await`, the same reasoning `sitesApi.ts` avoids by
// inlining its own equivalent instead of factoring it out; here it's used from two call sites (GET and
// PUT), so factoring the body while keeping `throw` at the call site is worth the small duplication it
// removes.
async function buildError(response: Response, fallbackCode: string, fallbackDetail: string): Promise<WidgetConfigError> {
  let code = fallbackCode;
  let detail = `${fallbackDetail}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json (a network-level failure or a proxy error page) - fall back to the status
    // code alone, matching `sitesApi.ts`'s own `RegisterSiteError` precedent.
  }

  return new WidgetConfigError(code, detail);
}

export async function fetchWidgetConfig(accessToken: string, siteId: string): Promise<WidgetConfigDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/widget-config`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "WidgetConfig.Unknown", "Failed to load the widget configuration");
  }

  return (await response.json()) as WidgetConfigDto;
}

export async function updateWidgetConfig(
  accessToken: string,
  siteId: string,
  request: WidgetConfigDto,
): Promise<WidgetConfigDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/widget-config`, {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await buildError(response, "WidgetConfig.Unknown", "Failed to save the widget configuration");
  }

  return (await response.json()) as WidgetConfigDto;
}
