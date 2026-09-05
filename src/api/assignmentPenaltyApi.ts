import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `23-05`'s exact wire shape (`AssignmentPenaltyEndpoints.AssignmentPenaltyResponse`/
 * `AssignmentPenaltyRequest`, `ago-chat`) - the same `GET`/`PUT` pair `offlineAutoReplyApi.ts`
 * established for its own sibling settings screen, one field instead of a whole settings object.
 */
export interface AssignmentPenaltyDto {
  penaltySeconds: number;
}

/**
 * Carries the server's stable `type` code (`AssignmentPenalty.Invalid`, `Conversation.Forbidden`,
 * `Site.NotFound` - `ConversationErrors`, `ago-chat`) alongside the human-readable `detail` text, the
 * same split `OfflineAutoReplyError`/`WidgetConfigError` already established for their own
 * neighbouring settings screens.
 */
export class AssignmentPenaltyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssignmentPenaltyError";
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
): Promise<AssignmentPenaltyError> {
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

  return new AssignmentPenaltyError(code, detail);
}

function url(siteId: string): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/assignment-penalty`;
}

export async function fetchAssignmentPenalty(accessToken: string, siteId: string): Promise<AssignmentPenaltyDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "AssignmentPenalty.Unknown", "Failed to load the assignment penalty");
  }

  return (await response.json()) as AssignmentPenaltyDto;
}

export async function updateAssignmentPenalty(
  accessToken: string,
  siteId: string,
  request: AssignmentPenaltyDto,
): Promise<AssignmentPenaltyDto> {
  const response = await fetch(url(siteId), {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await buildError(response, "AssignmentPenalty.Unknown", "Failed to save the assignment penalty");
  }

  return (await response.json()) as AssignmentPenaltyDto;
}
