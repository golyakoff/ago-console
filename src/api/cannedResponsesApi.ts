import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `18-03`'s exact wire shape (`CannedResponseEndpoints.CannedResponsesResponse`/
 * `CannedResponsesRequest`, `ago-chat`). Flat `{title, body}` objects - `title` is a human label to
 * browse by, `body` is the text inserted into the composer verbatim; unlike
 * `OfflineAutoReplyRuleDto`'s `keyword`, nothing here is matched against a visitor's message.
 */
export interface CannedResponseDto {
  title: string;
  body: string;
}

/**
 * Carries the server's stable `type` code (`CannedResponse.Invalid`, `Conversation.Forbidden`,
 * `Site.NotFound` - `ConversationErrors`, `ago-chat`) alongside the human-readable `detail` text, the
 * same split `OfflineAutoReplyError`/`WidgetConfigError` already established for the neighbouring
 * settings screens.
 */
export class CannedResponsesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CannedResponsesError";
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
): Promise<CannedResponsesError> {
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
    // code alone, matching `offlineAutoReplyApi.ts`'s own precedent.
  }

  return new CannedResponsesError(code, detail);
}

function url(siteId: string): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/canned-responses`;
}

/**
 * `23-118`/`23-99`: the shape each canned response promises. `CannedResponsesPage` renders this list,
 * and an empty list is a legitimate "none configured yet" - so a dropped `title`/`body`, or a dropped
 * list, would read as that empty rather than as a reader that did not answer. Rejected as
 * `CannedResponsesError('shape.mismatch')` - the same `code`-carrying type every other rejection in
 * this file produces, which `shapeMismatchMessage` localizes. Only the list read guards this; the
 * `updateCannedResponses` write echoes what the operator just saved and is out of scope.
 */
const cannedResponseRequiredKeys = requiredKeysOf<CannedResponseDto>({ title: true, body: true });

export async function fetchCannedResponses(accessToken: string, siteId: string): Promise<CannedResponseDto[]> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "CannedResponses.Unknown", "Failed to load the canned responses");
  }

  const body = (await response.json()) as { responses?: unknown };
  try {
    assertArrayHasKeys<CannedResponseDto>(body.responses, cannedResponseRequiredKeys, "GET /api/v1/sites/{siteId}/canned-responses");
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new CannedResponsesError("shape.mismatch", reason.diagnostic);
    }
    throw reason;
  }
  return body.responses;
}

export async function updateCannedResponses(
  accessToken: string,
  siteId: string,
  responses: CannedResponseDto[],
): Promise<CannedResponseDto[]> {
  const response = await fetch(url(siteId), {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ responses }),
  });

  if (!response.ok) {
    throw await buildError(response, "CannedResponses.Unknown", "Failed to save the canned responses");
  }

  const body = (await response.json()) as { responses: CannedResponseDto[] };
  return body.responses;
}
