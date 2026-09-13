import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `16-03`'s own console screen: the two calls behind "Скачать данные" -
 * `POST /api/v1/sites/{siteId}/exports` (trigger) and `GET /api/v1/sites/{siteId}/exports` (history),
 * `Ago.Chat.Api.Sites.SitesEndpoints`'s own `HandleRequestExportAsync`/`HandleGetExportHistoryAsync`.
 * Its own file, not folded into `sitesApi.ts` - the same "own port, own file" precedent
 * `siteConsentDocumentsApi.ts` already sets for a second site-scoped concern living beside the first.
 *
 * <b>`siteId` in the URL path, not left to `withActiveSiteHeader` alone.</b> The backend route is
 * `{siteId:guid}` (`SitesEndpoints`'s own remarks: "siteId from the route, not `user.GetSiteId()`" -
 * an operator's own active-tenancy claim is not necessarily the site being exported, for the same
 * `13-07` multi-tenancy reason `PermissionChecker.HasPermissionAsync` checks the specific
 * `(OperatorId, SiteId)` pair the route names, not whichever site a token happens to be scoped to).
 * `withActiveSiteHeader` is still attached on every call below, matching every other authenticated
 * call in this codebase, but it is not what the server actually keys this request on - the real site
 * id comes from `usePermissions().activeSiteId`, the same tenancy the console's own switcher lets an
 * operator pick and the value that header itself carries. This is a **deliberate departure** from
 * `sitesApi.ts`'s own `eraseSite`, which builds `/api/v1/sites/erase` with no site id in the path at
 * all - that call predates (or was written past) the same `{siteId:guid}` route convention its own
 * backend endpoint documents, and now does not match it; flagged as a found defect in this item's own
 * report rather than fixed here (out of this item's scope, and `16-02`'s own account-deletion flow is
 * not part of this change).
 */

/** `25-72`: adds `"Processing"` - a request a `Worker` replica has atomically claimed and is
 * currently building/uploading, between `"Pending"` (not yet claimed) and `"Ready"`/`"Failed"` (done).
 * `Ago.Chat.Domain.ExportStatus`'s own remarks on that state explain why it exists; this union just
 * mirrors its member names, the same "server names the state, client spells it the same way" contract
 * the other four values already establish. */
export type SiteExportStatus = "Pending" | "Processing" | "Ready" | "Failed" | "Expired";

/** Wire shape of `Ago.Chat.Api.Sites.SitesEndpoints.SiteExportHistoryItemResponse`, one row per past
 * export request, newest first - `GetSiteExportHistoryHandler`'s own remarks on why `expiresAt` is
 * populated only for a `"Ready"` row. */
export interface SiteExportHistoryItemDto {
  exportId: string;
  status: SiteExportStatus;
  requestedAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
  failureReason: string | null;
}

/** `GET /api/v1/sites/{siteId}/exports` - every export request this site has ever made, newest first.
 * A bare array (`GetSiteExportHistoryHandler`'s own "small and bounded, no pagination" reasoning),
 * the same shape `getPhoneReveals`' sibling calls return a page of, only without a cursor here. */
export async function getSiteExportHistory(accessToken: string, siteId: string): Promise<SiteExportHistoryItemDto[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/exports`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as SiteExportHistoryItemDto[];
}

export interface RequestSiteExportResponseDto {
  exportId: string;
}

/** `POST /api/v1/sites/{siteId}/exports` - `202 Accepted`, the same "accepted, not yet done" shape
 * `eraseSite`'s own doc comment states for its own sibling write: nothing is ready when this promise
 * resolves, only queued (`Ago.Chat.Worker`'s `SiteExportJob` builds the archive off its own timer).
 * The caller (`SiteExportPage`) reloads the history list after this resolves, which is what shows the
 * new `Pending` row - this function itself does not poll. */
export async function requestSiteExport(accessToken: string, siteId: string): Promise<RequestSiteExportResponseDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/exports`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status !== 202) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as RequestSiteExportResponseDto;
}
