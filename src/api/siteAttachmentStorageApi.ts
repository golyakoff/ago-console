import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

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

  return (await response.json()) as AttachmentListPageDto;
}

export async function fetchLargestConversations(accessToken: string, siteId: string): Promise<LargestConversationDto[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/largest-conversations`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load the largest conversations");
  }

  return (await response.json()) as LargestConversationDto[];
}

export async function fetchStorageSummary(accessToken: string, siteId: string): Promise<AttachmentStorageSummaryDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/storage-summary`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load the storage summary");
  }

  return (await response.json()) as AttachmentStorageSummaryDto;
}

export async function fetchAttachmentEgress(accessToken: string, siteId: string): Promise<AttachmentEgressDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/attachments/egress`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Failed to load this month's download figures");
  }

  return (await response.json()) as AttachmentEgressDto;
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
