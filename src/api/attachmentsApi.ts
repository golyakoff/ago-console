import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `5-08`: the console's own calls onto `5-03`/`5-04`'s attachment REST surface
 * (`Ago.Chat.Api.Attachments.AttachmentEndpoints`) plus the new delete route this item adds. Plain
 * `fetch`/`XMLHttpRequest`, matching `conversationsApi.ts`'s own established shape (auth header,
 * `config.apiBaseUrl`, typed response) - no generated client exists in this project.
 *
 * `uploadToPresignedUrl` is the one call here that is deliberately *not* `fetch`: the backlog wants
 * real upload progress, "from the PUT itself, not a fake progress bar" - `fetch`'s request body has
 * no standard progress event in any browser today, `XMLHttpRequest.upload.onprogress` does, so this
 * is the one place in the console that reaches for the older API on purpose.
 */

export interface CreateAttachmentResponse {
  attachmentId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface AttachmentDownloadResponse {
  url: string;
  contentType: string;
  thumbnailUrl?: string | null;
  expiresAt: string;
}

/**
 * Every failure here is `Results.Problem` (RFC 7807 `application/problem+json`,
 * `Ago.Chat.Api.Http.ErrorExtensions.ToProblem`) - `detail` carries the same message text every
 * `HubException` in this codebase already forwards verbatim (`ConversationErrors`'s own doc
 * comment), so reading it gives a real reason ("Declared size ... exceeds the ...-byte limit") instead
 * of just a status code. Falls back to the status code alone if the body is not what was expected -
 * a network-level failure or a proxy error page is not problem+json.
 */
interface ProblemDetailsBody {
  detail?: string;
}

function isProblemDetailsBody(value: unknown): value is ProblemDetailsBody {
  return typeof value === "object" && value !== null;
}

async function throwIfNotOk(response: Response, fallbackAction: string): Promise<void> {
  if (response.ok) {
    return;
  }

  let detail: string | null = null;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body) && typeof body.detail === "string") {
      detail = body.detail;
    }
  } catch {
    // Not problem+json (a network-level failure or a proxy error page) - fall back below.
  }

  throw new Error(detail ?? `${fallbackAction}: ${response.status}`);
}

export async function createAttachment(
  accessToken: string,
  conversationId: string,
  contentType: string,
  sizeBytes: number,
): Promise<CreateAttachmentResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/attachments`, {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ contentType, sizeBytes }),
  });

  await throwIfNotOk(response, "Failed to start the upload");

  return (await response.json()) as CreateAttachmentResponse;
}

/**
 * `file-storage.md`'s "file bytes never pass through the API process" - this PUT goes straight to
 * object storage (MinIO locally) using the presigned URL `createAttachment` returned, the same
 * browser-to-storage path every other client of this API takes. `onProgress` is called with a
 * 0-100 integer, driven by the browser's own `ProgressEvent.loaded`/`total` for the request body
 * actually leaving the client - not a timer, not a guess.
 *
 * `13-07`: deliberately never carries `withActiveSiteHeader` (or `Authorization` at all) - this PUT
 * goes straight to object storage using the presigned URL, never to `Ago.Chat.Api`, so there is no
 * `OperatorIdentityClaimsTransformation` on the other end for an active-site signal to reach.
 */
export function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed: network error."));
    xhr.onabort = () => reject(new Error("Upload aborted."));

    xhr.send(file);
  });
}

export async function confirmAttachment(accessToken: string, attachmentId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/attachments/${attachmentId}/confirm`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  await throwIfNotOk(response, "Failed to confirm the upload");
}

export async function getAttachmentDownload(accessToken: string, attachmentId: string): Promise<AttachmentDownloadResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/attachments/${attachmentId}`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  await throwIfNotOk(response, "Failed to load the attachment");

  return (await response.json()) as AttachmentDownloadResponse;
}

/**
 * `5-08`: `attachment:delete`, operator-only (`DeleteAttachmentHandler`'s own remarks - a visitor
 * never held this permission). A 403 here means the signed-in operator's roles do not grant
 * `attachment:delete` - the console surfaces that as an ordinary error, it never hides the delete
 * button based on a *guess*; `usePermissions()` is what decides whether to show the button at all.
 */
export async function deleteAttachment(accessToken: string, attachmentId: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  await throwIfNotOk(response, "Failed to delete the attachment");
}
