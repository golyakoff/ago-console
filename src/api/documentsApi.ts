import { config } from "../config.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `24-03`: the console's own caller for `24-02`'s published surface (`Ago.Chat.Api.Documents.DocumentEndpoints`)
 * and this item's own addition to it. Both routes are `AllowAnonymous` on the server - `24-02`'s own
 * Scope: "somebody who has not yet accepted anything has no account to read it from" - so neither
 * function here sends an `Authorization` header, unlike every other file under `api/`.
 *
 * Uses `problemDetailsFrom` (`problemDetails.ts`), not `sitesApi.ts`'s own older
 * `RegisterSiteError`/hand-rolled body reader - that file's own doc comment already names its
 * duplication as "worth folding in later" and asks that nothing new copy it forward.
 */

export interface DocumentVersionResponse {
  documentKey: string;
  version: string;
  sequence: number;
  title: string;
  body: string;
  publishedAt: string;
}

/** `24-03`'s own wire shape (`DocumentEndpoints.RequiredDocumentResponse`). `version`/`title`/
 * `publishedAt` are `null` when the key is required but nothing has been published under it yet -
 * `RegisterSiteHandler`'s own `Site.AgreementUnavailable` case, on the server side of this same gap. */
export interface RequiredDocumentSummary {
  documentKey: string;
  version: string | null;
  title: string | null;
  publishedAt: string | null;
}

/** The subject kinds `Ago.Chat.Domain.AcceptanceSubjectKind` names - lowercase, matching
 * `Enum.TryParse(..., ignoreCase: true)` on the server (`DocumentEndpoints.HandleGetRequiredDocumentsAsync`). */
export type AcceptanceSubjectKind = "tenant" | "operator" | "visitor";

/** `GET /api/v1/documents/{documentKey}` - the current version. Throws {@link ApiProblemError}
 * (`Document.NotFound` if nothing has ever been published under this key). */
export async function getCurrentDocument(documentKey: string): Promise<DocumentVersionResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/documents/${encodeURIComponent(documentKey)}`);

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as DocumentVersionResponse;
}

/**
 * `GET /api/v1/documents/{documentKey}/versions/{version}` - a specific, immutable version, the same
 * one a support conversation or an `AcceptanceRecord` names.
 */
export async function getDocumentVersion(documentKey: string, version: string): Promise<DocumentVersionResponse> {
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/documents/${encodeURIComponent(documentKey)}/versions/${encodeURIComponent(version)}`,
  );

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as DocumentVersionResponse;
}

/**
 * `GET /api/v1/documents/required/{subjectKind}` - which documents `subjectKind` must accept today,
 * and what each currently says. Never throws: a read that fails (a network error, a rate limit) fails
 * open to an empty list rather than blocking the screen that called it - the server's own
 * `RegisterSiteHandler` is the actual authority on what registration requires, so a stale or missing
 * read here costs a missing link on the form, never an incorrect registration outcome.
 */
export async function getRequiredDocuments(subjectKind: AcceptanceSubjectKind): Promise<RequiredDocumentSummary[]> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/v1/documents/required/${subjectKind}`);
    if (!response.ok) {
      return [];
    }

    return (await response.json()) as RequiredDocumentSummary[];
  } catch {
    return [];
  }
}
