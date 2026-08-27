import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `14-04`'s exact wire shape (`OfflineAutoReplyEndpoints.OfflineAutoReplyResponse`/
 * `OfflineAutoReplyRequest`, `ago-chat`). Flat `{keyword, reply}` objects, and `rules` is ordered -
 * the server matches first-rule-wins, so the array's order is behaviour, not presentation.
 */
export interface OfflineAutoReplyRuleDto {
  keyword: string;
  reply: string;
}

export interface OfflineAutoReplyDto {
  enabled: boolean;
  fallbackReply: string;
  rules: OfflineAutoReplyRuleDto[];
}

/**
 * Carries the server's stable `type` code (`OfflineAutoReply.Invalid`, `Conversation.Forbidden`,
 * `Site.NotFound` - `ConversationErrors`, `ago-chat`) alongside the human-readable `detail` text,
 * the same split `WidgetConfigError` already established for the neighbouring settings screen.
 */
export class OfflineAutoReplyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OfflineAutoReplyError";
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

async function buildError(
  response: Response,
  fallbackCode: string,
  fallbackDetail: string,
): Promise<OfflineAutoReplyError> {
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
    // code alone, matching `widgetConfigApi.ts`'s own precedent.
  }

  return new OfflineAutoReplyError(code, detail);
}

function url(siteId: string): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/offline-auto-reply`;
}

export async function fetchOfflineAutoReply(accessToken: string, siteId: string): Promise<OfflineAutoReplyDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "OfflineAutoReply.Unknown", "Failed to load the offline auto-reply");
  }

  return (await response.json()) as OfflineAutoReplyDto;
}

export async function updateOfflineAutoReply(
  accessToken: string,
  siteId: string,
  request: OfflineAutoReplyDto,
): Promise<OfflineAutoReplyDto> {
  const response = await fetch(url(siteId), {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await buildError(response, "OfflineAutoReply.Unknown", "Failed to save the offline auto-reply");
  }

  return (await response.json()) as OfflineAutoReplyDto;
}
