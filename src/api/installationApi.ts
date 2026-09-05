import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `10-06`'s exact wire shape (`Ago.Chat.Api.Sites.SiteInstallationEndpoints.SiteInstallationResponse`) -
 * a site's own public key (not a secret - `adr/0029` - but returned only to that site's own operators,
 * gated the same way `fetchWidgetConfig` already is) and the origin(s) `allowed_origins` currently
 * holds, so `InstallSnippetPage` can show what the widget's own browser-side origin check will compare
 * against without leaving the tenant to remember what they typed at signup.
 *
 * `23-06` adds six fields: the four raw facts, the second fact (`usedRecently` - "the product was
 * used", independent of whether the widget was ever seen), and `state` - the one resolved reading of
 * all of them, computed server-side (`SiteInstallationStateResolver`) so this screen never re-derives
 * the rule. `state` is a plain union of string literals, matching how every other server-defined
 * closed set already crosses this boundary in this codebase, rather than a TypeScript `enum`. The four
 * timestamps arrive as ISO-8601 strings, like every other instant on the wire - `parseInstant` turns
 * them into `Date`s at the point of use.
 */
export type SiteInstallationState = "NotSeenYet" | "SeenAndQuiet" | "EveryRequestRefused" | "NeverSeenButInUse";

export interface SiteInstallationDto {
  publicKey: string;
  allowedOrigins: string[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastRefusedOrigin: string | null;
  lastRefusedOriginAt: string | null;
  usedRecently: boolean;
  state: SiteInstallationState;
}

/**
 * `problemDetailsFrom`/`ApiProblemError` (`problemDetails.ts`), not `widgetConfigApi.ts`'s own older
 * `WidgetConfigError` - that file's own doc comment already names its duplication as "worth folding in
 * later" and asks that nothing new copy it forward, so this is the first `api/*.ts` module in the
 * settings-screen family to use the shared one instead of adding a fourth near-identical class.
 */
export async function fetchSiteInstallation(accessToken: string, siteId: string): Promise<SiteInstallationDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/installation`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as SiteInstallationDto;
}
