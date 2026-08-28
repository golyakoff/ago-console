import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `10-03`: the console's own caller for `10-02`'s bootstrap endpoint (`Ago.Chat.Api.Sites.
 * SitesEndpoints`, `POST /api/v1/sites`, gated by `RequireKeycloakIdentity` per `adr/0028`). Plain
 * `fetch`, matching every other `api/*.ts` file's own established shape - no generated client exists
 * in this project.
 *
 * Field names (`siteName`, `initialAllowedOrigin`) match `SitesEndpoints.RegisterSiteRequest`'s own
 * C# record verbatim under ASP.NET Core's default camelCase JSON policy - the same convention every
 * other request/response DTO in this codebase already follows (`OperatorPermissionsResponse`, etc.).
 */
export interface RegisterSiteRequest {
  siteName: string;
  initialAllowedOrigin: string;
}

export interface RegisterSiteResponse {
  siteId: string;
  operatorId: string;
}

/**
 * Carries the server's stable `type` code (`Site.InvalidName`, `Site.InvalidOrigin`,
 * `Site.AlreadyRegistered`, `Site.RateLimited` - `ConversationErrors`, `ago-chat`) alongside the
 * human-readable `detail` text every `ErrorExtensions.ToProblem` response already carries
 * (`api-design.md`: "clients branch on `type`, never on the message"). `OnboardingPage` branches on
 * exactly one of them - `Site.AlreadyRegistered`, which is the server saying the caller is already
 * an operator and therefore a routing decision rather than an error to display - and shows
 * `message` verbatim for every other, so a new server-side rejection reaches the visitor as the
 * server worded it without this file needing to know it exists.
 */
export class RegisterSiteError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RegisterSiteError";
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

export async function registerSite(accessToken: string, request: RegisterSiteRequest): Promise<RegisterSiteResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let code = "Site.Unknown";
    let detail = `Failed to register the site: ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (isProblemDetailsBody(body)) {
        code = body.type ?? code;
        detail = body.detail ?? detail;
      }
    } catch {
      // Not problem+json (a network-level failure or a proxy error page) - fall back to the status
      // code alone, matching `attachmentsApi.ts`'s own `throwIfNotOk` precedent.
    }

    throw new RegisterSiteError(code, detail);
  }

  return (await response.json()) as RegisterSiteResponse;
}

/**
 * `16-02`: `POST /api/v1/sites/erase` - no path parameter, the site is resolved from the caller's own
 * auth, the same `X-Ago-Active-Site` header/claim resolution every other authenticated call in this
 * console already carries via `withActiveSiteHeader`. `registerSite` above is the one exception in
 * this file, and deliberately so - it runs before any site/tenancy exists for this identity to
 * resolve, which is not true here: erasing an account is only ever something an existing operator on
 * an existing site does.
 *
 * `202 Accepted`, not `204` - this starts an async `Ago.Chat.Worker` job rather than deleting
 * anything synchronously (`16-02`'s own Scope: "these touch many rows across several stores and can
 * fail halfway; they belong in Ago.Chat.Worker... not in a synchronous HTTP call that a timeout can
 * tear in half"). Nothing is actually gone when this promise resolves - `AccountDeletionPage` polls
 * `checkOperatorErasure` (`operatorsApi.ts`) separately for real completion, and must not report
 * success off this call alone.
 *
 * Throws `ApiProblemError` (`problemDetails.ts`), not this file's own older `RegisterSiteError` -
 * `problemDetails.ts`'s own doc comment already names the duplication between the two as "worth
 * folding in later" and asks that nothing new copy it forward. Nothing here currently branches on the
 * failure's `type` (only the completion *poll*'s outcome drives this flow's behaviour), but the
 * shared type is still the correct one for a new write to use.
 */
export async function eraseSite(accessToken: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/erase`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 202) {
    return;
  }

  throw await problemDetailsFrom(response);
}
