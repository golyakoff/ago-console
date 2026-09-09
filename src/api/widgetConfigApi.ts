import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `11-01`'s exact wire shape (`WidgetConfigEndpoints.WidgetConfigResponse`/`UpdateWidgetConfigRequest`,
 * `ago-chat`) - `position` crosses the wire as the `Position` enum's PascalCase member name
 * (`"BottomRight"`/`"BottomLeft"`), the same convention `sitesApi.ts`'s own remarks note for other
 * enum-shaped fields in this codebase. A named union, not a bare `string`, so a typo in this file
 * cannot silently compile.
 */
export type WidgetPosition = "BottomRight" | "BottomLeft";

/**
 * `11-10`: `Ago.Chat.Domain.Locale`'s own PascalCase member names on the wire
 * (`WidgetConfigEndpoints.WidgetConfigResponse`/`UpdateWidgetConfigRequest`, `ago-chat`) - the
 * identical convention `WidgetPosition` above already uses for its own enum. A named union, not a
 * bare `string`, for the same reason `WidgetPosition` is one: a typo in this file cannot silently
 * compile.
 */
export type WidgetLocale = "En" | "Ru";

/**
 * `23-64`: `Ago.Chat.Domain.AutoOpenDelay`'s own six legal values, crossing the wire as the plain
 * `int` they already are - unlike `WidgetPosition`/`WidgetLocale`, this enum's wire spelling is
 * already its own value (`AutoOpenDelay`'s own remarks), so a numeric union is the "named union, not
 * a bare number" this field needs, without inventing a second PascalCase-string convention to parse.
 * A typo (`21`) is a TypeScript compile error here, the same protection `WidgetPosition` already
 * gives its own field.
 */
export type AutoOpenDelaySeconds = 15 | 30 | 45 | 60 | 90 | 120;

export interface WidgetConfigDto {
  primaryColorHex: string | null;
  position: WidgetPosition;
  locale: WidgetLocale;
  /**
   * `16-04`: the tenant's own sentence about who processes what a visitor is about to write - never
   * written by AGO. `null` (every site before this item, and any site that leaves it blank) means the
   * widget shows no notice at all.
   */
  noticeText: string | null;
  /** `16-04`: where the notice points for detail - the tenant's own policy page. `null` alongside
   * `noticeText` is the same "show nothing" default; either field may be set without the other. */
  noticeUrl: string | null;
  /**
   * `23-108`: **this field was missing from this interface while the server has always had it**, and
   * that was not merely an omission. `updateWidgetConfig` below `JSON.stringify`s this object as the
   * whole PUT body, and the server's `UpdateWidgetConfigRequest` takes a non-nullable `bool` - so an
   * absent property bound to `false`, and saving a colour would have silently switched off a consent
   * gate the API genuinely enforces. It was harmless only because nothing in the console could turn it
   * on in the first place, which is the other half of the same defect.
   */
  requireContactConsent: boolean;
  /**
   * `23-63`: whether the launcher draws attention to itself while the panel is closed - off by
   * default, and off until the tenant turns it on (the item's own Decision). `ago-widget`'s own
   * `scheduleAttractAttention` (`ui/widget.ts`) is what actually decides whether to animate on any
   * given page load - a visitor with `prefers-reduced-motion: reduce` never animates regardless of
   * this value, so this field states the tenant's own choice, never the effective outcome.
   */
  attractAttention: boolean;
  /**
   * `23-64`/`adr/0148`: off by default, and off until the tenant turns it on - the identical "a
   * schema default must not change a visitor-facing behaviour for every existing site" posture
   * `attractAttention` already states for itself. `ago-widget`'s own auto-open timer (`ui/widget.ts`)
   * is what actually decides whether to draw the greeting on any given page load - this field states
   * only the tenant's own configured choice, not the effective outcome (a returning visitor who has
   * already been shown it this session sees nothing further, regardless of this value).
   */
  autoOpenEnabled: boolean;
  /** `23-64`: the closed set `AutoOpenDelaySeconds` fixes - `30` (`Ago.Chat.Domain.AutoOpenDelay.Seconds30`)
   * for every site that has never configured one, including every row that predates this field. */
  autoOpenDelaySeconds: AutoOpenDelaySeconds;
  /** `23-64`: the tenant's own greeting line - never sent to the server until the visitor writes
   * (`adr/0148`), and never an AGO-authored default the way `noticeText`'s own remarks already state
   * for the tenant's processing notice. `null` for every site that has not configured one. */
  autoOpenGreetingText: string | null;
  /**
   * `25-39`: a temporary, off-by-default relaxation of the booking module's own verified-phone
   * requirement, for as long as `14-15` has no live SMS/voice gateway account provisioned. While on,
   * a chat-driven booking either completes straight away with a phone number the visitor already gave
   * earlier in the conversation, or - if none was given yet - still asks for one without requiring
   * proof of control over it. Never silently recorded as verified either way
   * (`Ago.Calendar.Application.UseCases.ChatModuleTask.ReplyToModuleTaskHandler`'s own remarks); this
   * is chat-module-only today, `20-10`'s public booking widget is unaffected regardless of this value.
   */
  acceptUnverifiedPhone: boolean;
}

/**
 * Carries the server's stable `type` code (`WidgetConfig.InvalidColor`, `WidgetConfig.InvalidPosition`,
 * `Conversation.Forbidden` - `ConversationErrors`, `ago-chat`) alongside the human-readable `detail`
 * text every `ErrorExtensions.ToProblem` response already carries, the same split `RegisterSiteError`
 * (`sitesApi.ts`) already established for this codebase's other write endpoint.
 */
export class WidgetConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WidgetConfigError";
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

// A `throw await ...` at each call site, not a helper that throws internally - keeps TypeScript's
// control-flow analysis unambiguous (a bare `throw` statement) rather than relying on a `never`
// return type propagating through an un-returned `await`, the same reasoning `sitesApi.ts` avoids by
// inlining its own equivalent instead of factoring it out; here it's used from two call sites (GET and
// PUT), so factoring the body while keeping `throw` at the call site is worth the small duplication it
// removes.
async function buildError(response: Response, fallbackCode: string, fallbackDetail: string): Promise<WidgetConfigError> {
  let code = fallbackCode;
  let detail = `${fallbackDetail}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json (a network-level failure or a proxy error page) - fall back to the status
    // code alone, matching `sitesApi.ts`'s own `RegisterSiteError` precedent.
  }

  return new WidgetConfigError(code, detail);
}

export async function fetchWidgetConfig(accessToken: string, siteId: string): Promise<WidgetConfigDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/widget-config`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "WidgetConfig.Unknown", "Failed to load the widget configuration");
  }

  return (await response.json()) as WidgetConfigDto;
}

export async function updateWidgetConfig(
  accessToken: string,
  siteId: string,
  request: WidgetConfigDto,
): Promise<WidgetConfigDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/widget-config`, {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await buildError(response, "WidgetConfig.Unknown", "Failed to save the widget configuration");
  }

  return (await response.json()) as WidgetConfigDto;
}
