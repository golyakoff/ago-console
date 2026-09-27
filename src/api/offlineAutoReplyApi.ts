import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

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

/**
 * `23-118`/`23-99`: the runtime shapes this read promises. `enabled` dropped renders as an *off*
 * auto-reply indistinguishable from a site that really turned it off (the `23-99` false-negative case);
 * `rules` dropped renders as "no rules" (false empty); `fallbackReply` dropped renders blank. Each rule
 * element is checked, since a rule missing `keyword`/`reply` renders as an empty row. `rules` order is
 * behaviour (first-rule-wins), but that is orthogonal to presence, which is all this guard checks.
 * `updateOfflineAutoReply` is a PUT echo acted on immediately, out of scope per the bound.
 */
const offlineAutoReplyRequiredKeys = requiredKeysOf<OfflineAutoReplyDto>({ enabled: true, fallbackReply: true, rules: true });
const offlineAutoReplyRuleRequiredKeys = requiredKeysOf<OfflineAutoReplyRuleDto>({ keyword: true, reply: true });

export async function fetchOfflineAutoReply(accessToken: string, siteId: string): Promise<OfflineAutoReplyDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "OfflineAutoReply.Unknown", "Failed to load the offline auto-reply");
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<OfflineAutoReplyDto>(body, offlineAutoReplyRequiredKeys, `GET /api/v1/sites/${siteId}/offline-auto-reply`);
    assertArrayHasKeys<OfflineAutoReplyRuleDto>(
      body.rules,
      offlineAutoReplyRuleRequiredKeys,
      `GET /api/v1/sites/${siteId}/offline-auto-reply (rules)`,
    );
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      // The neutral endpoint+field diagnostic, surfaced localized by `apiErrorMessage.ts#shapeMismatchMessage`.
      throw new OfflineAutoReplyError("shape.mismatch", reason.diagnostic);
    }
    throw reason;
  }
  return body;
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
