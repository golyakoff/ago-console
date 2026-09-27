import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

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

/**
 * `23-118`/`23-99`: rethrows a `shape.mismatch` as `SiteConsentDocumentsError` (the file's own error
 * type, carrying the `shape.mismatch` code `apiErrorMessage.ts#shapeMismatchMessage` duck-types on to
 * localize) - the same "answered, but not as promised" case every other failure on this reader already
 * throws as, caught by `DocumentsPage`'s existing load `catch`.
 */
function rethrowConsentShapeMismatch(reason: unknown): never {
  if (reason instanceof ShapeMismatchError) {
    throw new SiteConsentDocumentsError("shape.mismatch", reason.diagnostic);
  }
  throw reason;
}

/**
 * `23-118`/`23-99`: the runtime shapes these two reads promise. On the documents summary, the in-scope
 * field is `contactConsentRequired`: a dropped boolean renders as an *off* consent gate
 * indistinguishable from a site that really has it off (the `23-99` false-negative case), and a dropped
 * `contact`/`marketing` reads as a document group with no published versions. Top-level presence only,
 * the same bound `ownerApi.ts` draws for its own nested arrays - the per-`versions` element shape is not
 * checked here. On the acceptances read, a dropped element field (`acceptedAt`, `subjectId`) renders as
 * a blank cell in the "who accepted" list, so each element is checked. `publishSiteConsentDocument` is a
 * POST echo acted on immediately, out of scope per the bound.
 */
const siteConsentDocumentsRequiredKeys = requiredKeysOf<SiteConsentDocumentsDto>({
  contact: true,
  contactConsentRequired: true,
  marketing: true,
});
const siteConsentAcceptanceRequiredKeys = requiredKeysOf<SiteConsentAcceptanceDto>({
  subjectKind: true,
  subjectId: true,
  documentVersion: true,
  acceptedAt: true,
});

export async function fetchSiteConsentDocuments(accessToken: string, siteId: string): Promise<SiteConsentDocumentsDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/consent-documents`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "SiteConsentDocuments.Unknown", "Failed to load the site's consent documents");
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<SiteConsentDocumentsDto>(
      body,
      siteConsentDocumentsRequiredKeys,
      `GET /api/v1/sites/${siteId}/consent-documents`,
    );
  } catch (reason) {
    rethrowConsentShapeMismatch(reason);
  }
  return body;
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

  const body: unknown = await response.json();
  try {
    assertArrayHasKeys<SiteConsentAcceptanceDto>(
      body,
      siteConsentAcceptanceRequiredKeys,
      `GET /api/v1/sites/${siteId}/consent-documents/${purpose}/acceptances`,
    );
  } catch (reason) {
    rethrowConsentShapeMismatch(reason);
  }
  return body;
}
