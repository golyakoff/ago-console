import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `23-80`/`23-82`: the console's own read/write surface for `SiteAttachmentStorageEndpoints`
 * (`ago-chat`) - "Администрирование -> Хранилище". Same wire shapes the server hands back,
 * `siteConsentDocumentsApi.ts`'s own precedent for "cross the wire in the server's own shape,
 * translate at the boundary if a screen ever needs otherwise".
 */
export type AttachmentListSort = "sizeDesc" | "typeAsc" | "ageAsc" | "conversationAsc" | "senderAsc";

export type AttachmentListFilter = "none" | "neverDownloaded" | "duplicates";

export interface AttachmentListItemDto {
  id: string;
  conversationId: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  downloadCount: number;
  lastDownloadedAt: string | null;
  senderKind: string | null;
  senderId: string | null;
  isDuplicate: boolean;
}

export interface AttachmentListCursorDto {
  value: string;
  attachmentId: string;
}

export interface AttachmentListPageDto {
  items: AttachmentListItemDto[];
  nextCursor: AttachmentListCursorDto | null;
}

export interface LargestConversationDto {
  conversationId: string;
  totalBytes: number;
  attachmentCount: number;
}

export interface AttachmentStorageSummaryDto {
  usedBytes: number;
  totalBytes: number;
}

export interface AttachmentEgressDto {
  periodMonth: string;
  downloadCount: number;
  bytesOut: number;
}

export interface BulkDeleteAttachmentsResultDto {
  deletedCount: number;
  freedBytes: number;
  notFoundIds: string[];
  alreadyGoneCount: number;
}

/** Carries the server's stable `type` code, the same split `SiteConsentDocumentsError` already
 * establishes for its own neighbouring settings screen. */
export class SiteAttachmentStorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SiteAttachmentStorageError";
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

async function buildError(response: Response, fallbackDetail: string): Promise<SiteAttachmentStorageError> {
  let code = "SiteAttachmentStorage.Unknown";
  let detail = `${fallbackDetail}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json - fall back to the status code alone.
  }

  return new SiteAttachmentStorageError(code, detail);
}

/**
 * `23-118`/`23-99`: the runtime shapes the four reads on this screen promise. All are in scope under
 * the bound - three list/page readers plus two small stat objects whose absent field renders as a
 * blank byte figure rather than a thrown error:
 * - `attachmentListItemRequiredKeys`: one row of the attachments table, every element checked.
 * - `attachmentListPageRequiredKeys`: the page envelope (`items`/`nextCursor`) - a dropped `items`
 *   reads as an empty table for a tenant that actually holds attachments.
 * - `largestConversationRequiredKeys`: one row of the largest-conversations list.
 * - `storageSummaryRequiredKeys`/`attachmentEgressRequiredKeys`: the quota bar and the month's egress
 *   figures - a dropped `usedBytes`/`totalBytes`/`bytesOut` renders as a blank or `NaN` figure.
 */
const attachmentListItemRequiredKeys = requiredKeysOf<AttachmentListItemDto>({
  id: true,
  conversationId: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  downloadCount: true,
  lastDownloadedAt: true,
  senderKind: true,
  senderId: true,
  isDuplicate: true,
});

const attachmentListPageRequiredKeys = requiredKeysOf<AttachmentListPageDto>({
  items: true,
  nextCursor: true,
});

const largestConversationRequiredKeys = requiredKeysOf<LargestConversationDto>({
  conversationId: true,
  totalBytes: true,
  attachmentCount: true,
});

const storageSummaryRequiredKeys = requiredKeysOf<AttachmentStorageSummaryDto>({
  usedBytes: true,
  totalBytes: true,
});

const attachmentEgressRequiredKeys = requiredKeysOf<AttachmentEgressDto>({
  periodMonth: true,
  downloadCount: true,
  bytesOut: true,
});

/**
 * `23-118`: rethrows a `shape.mismatch` as `SiteAttachmentStorageError` - the same type this file's
 * own reads already throw and `StoragePage`'s `catch` already renders, so no second error vocabulary
 * is needed (mirrors `maxChannelApi.ts#rethrowAsApiProblem`). The `shape.mismatch` code is what
 * `apiErrorMessage.ts#shapeMismatchMessage` duck-types on to localize the surfacing.
 */
function rethrowAsStorageError(reason: unknown): never {
  if (reason instanceof ShapeMismatchError) {
    throw new SiteAttachmentStorageError("shape.mismatch", reason.diagnostic);
  }
  throw reason;
}

export async function fetchSiteAttachments(
  accessToken: string,
  siteId: string,
  options: { sort: AttachmentListSort; filter: AttachmentListFilter; cursor?: AttachmentListCursorDto | null },
): Promise<AttachmentListPageDto> {
  const params = new URLSearchParams({ sort: options.sort, filter: options.filter });
  if (options.cursor) {
    params.set("cursorValue", options.cursor.value);
    params.set("cursorAttachmentId", options.cursor.attachmentId);
  }

  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments?${params.toString()}`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load this site's attachments");
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<AttachmentListPageDto>(body, attachmentListPageRequiredKeys, "GET /api/v1/sites/{siteId}/attachments");
    assertArrayHasKeys<AttachmentListItemDto>(
      body.items,
      attachmentListItemRequiredKeys,
      "GET /api/v1/sites/{siteId}/attachments (items)",
    );
  } catch (reason) {
    rethrowAsStorageError(reason);
  }
  return body;
}

export async function fetchLargestConversations(accessToken: string, siteId: string): Promise<LargestConversationDto[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/largest-conversations`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load the largest conversations");
  }

  const body: unknown = await response.json();
  try {
    assertArrayHasKeys<LargestConversationDto>(
      body,
      largestConversationRequiredKeys,
      "GET /api/v1/sites/{siteId}/attachments/largest-conversations",
    );
  } catch (reason) {
    rethrowAsStorageError(reason);
  }
  return body;
}

export async function fetchStorageSummary(accessToken: string, siteId: string): Promise<AttachmentStorageSummaryDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/storage-summary`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load the storage summary");
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<AttachmentStorageSummaryDto>(
      body,
      storageSummaryRequiredKeys,
      "GET /api/v1/sites/{siteId}/attachments/storage-summary",
    );
  } catch (reason) {
    rethrowAsStorageError(reason);
  }
  return body;
}

export async function fetchAttachmentEgress(accessToken: string, siteId: string): Promise<AttachmentEgressDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/egress`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load this month's download figures");
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<AttachmentEgressDto>(body, attachmentEgressRequiredKeys, "GET /api/v1/sites/{siteId}/attachments/egress");
  } catch (reason) {
    rethrowAsStorageError(reason);
  }
  return body;
}

export async function bulkDeleteAttachments(
  accessToken: string,
  siteId: string,
  attachmentIds: string[],
): Promise<BulkDeleteAttachmentsResultDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/bulk-delete`, {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ attachmentIds }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to delete the selected attachments");
  }

  return (await response.json()) as BulkDeleteAttachmentsResultDto;
}
