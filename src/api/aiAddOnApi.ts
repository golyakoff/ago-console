import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `25-04`'s exact wire shape (`AiAddOnEndpoints.AiAddOnStatusResponse`, `ago-chat`).
 *
 * <p>`acceptedVersion`/`acceptedAt` and `declaredBy`/`declaredAt` are two independent pairs, and this
 * client keeps them that way rather than folding them into one `ready` boolean: accepting AGO's terms
 * and declaring a lawful basis about one's own visitors are two statements, and the screen has to be
 * able to show that one was made and the other was not.</p>
 */
export interface AiAddOnStatusDto {
  purchased: boolean;
  enabled: boolean;
  effectiveFrom: string | null;
  documentKey: string;
  currentVersion: string | null;
  currentTitle: string | null;
  currentBody: string | null;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  declaredBy: string | null;
  declaredAt: string | null;
}

/** Carries the server's stable `type` code (`AiAddOn.NotPurchased`, `AiAddOn.AgreementNotAccepted`,
 * `AiAddOn.BasisNotDeclared`, ...) alongside the readable detail - the same split
 * `OfflineAutoReplyError` established for the neighbouring settings screen. */
export class AiAddOnError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiAddOnError";
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

async function buildError(response: Response, fallbackDetail: string): Promise<AiAddOnError> {
  let code = "AiAddOn.Unknown";
  let detail = `${fallbackDetail}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json - fall back to the status alone, `offlineAutoReplyApi.ts`'s own precedent.
  }

  return new AiAddOnError(code, detail);
}

function url(siteId: string, suffix = ""): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/ai-add-on${suffix}`;
}

export async function fetchAiAddOnStatus(accessToken: string, siteId: string): Promise<AiAddOnStatusDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load the AI add-on status");
  }

  return (await response.json()) as AiAddOnStatusDto;
}

async function post(accessToken: string, siteId: string, suffix: string, body?: unknown): Promise<void> {
  const response = await fetch(url(siteId, suffix), {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    throw await buildError(response, `Failed to ${suffix.replace("/", "")} the AI add-on`);
  }
}

/** Three separate calls, never one - see `AiAddOnEndpoints`' own remarks for why collapsing them
 * would destroy the very distinction the records exist to keep. */
export const acceptAiAddOnAgreement = (accessToken: string, siteId: string, version: string) =>
  post(accessToken, siteId, "/acceptance", { version });

export const declareAiProcessingBasis = (accessToken: string, siteId: string) =>
  post(accessToken, siteId, "/declaration");

export const enableAiAddOn = (accessToken: string, siteId: string) => post(accessToken, siteId, "/enable");

export const disableAiAddOn = (accessToken: string, siteId: string) => post(accessToken, siteId, "/disable");
