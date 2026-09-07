import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `23-37`: the console's own read/write surface for `SiteConsentDocumentEndpoints`
 * (`ago-chat`) - the screen `24-05` shipped no console for, per that item's own "What is not built".
 * Same wire shapes the server hands back, `WidgetConfigDto`'s own precedent for "cross the wire in
 * the server's own shape, translate at the boundary if a screen ever needs otherwise".
 */
export type ConsentPurpose = "Contact" | "Marketing";

export interface PublishedVersionSummary {
  version: string;
  sequence: number;
  title: string;
  publishedAt: string;
}

export interface SiteConsentDocumentSummary {
  purpose: ConsentPurpose;
  documentKey: string;
  versions: PublishedVersionSummary[];
}

export interface SiteConsentDocumentsDto {
  contact: SiteConsentDocumentSummary;
  /** Whether `Site.WidgetConfig.RequireContactConsent` is on for this site right now - a fact about
   * the widget's own configuration, not about the document, which is why it rides beside `contact`
   * rather than inside it (`GetSiteConsentDocumentsHandler`'s own remarks). A published Contact
   * document binds nobody while this is `false`. */
  contactConsentRequired: boolean;
  marketing: SiteConsentDocumentSummary;
}

export interface SiteConsentAcceptanceDto {
  subjectKind: string;
  subjectId: string;
  documentVersion: string;
  acceptedAt: string;
}

/**
 * Carries the server's stable `type` code (`Conversation.Forbidden`, `Document.Invalid`,
 * `Document.InvalidPurpose`, `Site.NotFound` - `ConversationErrors`/`PublishedDocumentErrors`,
 * `ago-chat`) alongside the human-readable `detail` text, the same split `WidgetConfigError`/
 * `OfflineAutoReplyError` already establish for their own neighbouring settings screens.
 */
export class SiteConsentDocumentsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SiteConsentDocumentsError";
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
): Promise<SiteConsentDocumentsError> {
  let code = fallbackCode;
  let detail = `${fallbackDetail}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json - fall back to the status code alone, the same `widgetConfigApi.ts` precedent.
  }

  return new SiteConsentDocumentsError(code, detail);
}

export async function fetchSiteConsentDocuments(accessToken: string, siteId: string): Promise<SiteConsentDocumentsDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/consent-documents`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "SiteConsentDocuments.Unknown", "Failed to load the site's consent documents");
  }

  return (await response.json()) as SiteConsentDocumentsDto;
}

export async function publishSiteConsentDocument(
  accessToken: string,
  siteId: string,
  purpose: ConsentPurpose,
  title: string,
  body: string,
): Promise<PublishedVersionSummary> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/consent-documents/${purpose}`, {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ title, body }),
  });

  if (!response.ok) {
    throw await buildError(response, "SiteConsentDocuments.Unknown", "Failed to publish the consent document");
  }

  return (await response.json()) as PublishedVersionSummary;
}

export async function fetchSiteConsentAcceptances(
  accessToken: string,
  siteId: string,
  purpose: ConsentPurpose,
): Promise<SiteConsentAcceptanceDto[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/consent-documents/${purpose}/acceptances`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "SiteConsentDocuments.Unknown", "Failed to load who accepted this document");
  }

  return (await response.json()) as SiteConsentAcceptanceDto[];
}
