import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertArrayHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `26-161`/`adr/0184`: chat's own account-scoped **Person registry**, read for display. The console
 * reads a person's name (and contact channels) by the opaque person id a calendar booking carries and
 * *display-merges* it onto the calendar's own rows client-side (`adr/0184` decision 4: "reads are
 * display-only and console-side" - there is no server-to-server person read). This is a call to
 * `Ago.Chat.Api` (`config.apiBaseUrl`), not to `Ago.Calendar.Api` - the calendar no longer holds a
 * person copy to serve (`adr/0184` decision 3), so the name comes from the one place that owns it.
 *
 * <b>Wire shape matches `Ago.Chat.Application.UseCases.GetPersons.PersonProfileDto` verbatim</b> under
 * ASP.NET Core's default camelCase policy - the same "field names are the contract" discipline every
 * other `api/*.ts` client in this console follows. `GET /api/v1/persons?ids=a,b,c` answers
 * `{ persons: [...] }`; ids that resolve to nobody in this account are simply absent from the answer,
 * so a caller must tolerate a shorter list than it asked for (`GetPersonsHandler`'s own remarks).
 *
 * <b>Operator token + active-site header</b>, the identical pair `calendarApi.ts`/`notesApi.ts` send:
 * the endpoint is `RequireOperatorIdentity`, and `X-Ago-Active-Site` is what narrows the read to the
 * operator's currently-active account (`activeSite.ts`'s own doc comment).
 *
 * <b>Failure is the caller's to absorb, not this client's to hide.</b> A non-OK response throws the
 * shared `problemDetailsFrom` shape every other chat client throws; `adr/0184`'s "degrades to 'name
 * not shown yet', never to a failed booking" behaviour lives in the display-merge hook
 * (`calendar/usePersonNames.ts`) that catches it, not here - this client stays a plain read.
 */

/** One `Phone`/`Email` contact channel chat holds for a person, masked per the account's own rung -
 * mirrors `Ago.Chat.Application.UseCases.GetPersons.PersonContactChannelDto`. Not consumed by the
 * calendar display-merge today (only `displayName` is), carried for shape fidelity and future use. */
export interface PersonContactChannel {
  id: string;
  /** `"Phone"` or `"Email"` - `VisitorContactDetailKind`'s own wire name. `Name` is folded into
   * `PersonProfile.displayName` and never listed here. */
  kind: string;
  value: string;
  /** Whether `value` is the masked display form - never inferred from the string's own shape. */
  masked: boolean;
  verified: boolean;
  assessment: string;
  recordedAt: string;
}

/** What chat's registry says about one person, for display. `personId` is the one id every product
 * references. `displayName` is `null` when nobody has recorded a name - never invented from a phone. */
export interface PersonProfile {
  personId: string;
  displayName: string | null;
  channels: PersonContactChannel[];
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * `23-118`/`23-99`: the shape each returned person promises. `displayName` is required-present
 * (`string | null` - the server always sends the key, `null` when nobody recorded a name), so a
 * *dropped* `displayName` is a shape defect, not a nameless person - `RequiredKeys` keeps the two
 * apart exactly as the interface's own `| null` does. Absence here renders as a false empty state by
 * design: `usePersonNames.ts` display-merges the name onto a calendar row, so a truncated person row
 * would read as "no name recorded yet" (the `adr/0184` degrade) rather than as a reader that did not
 * answer what it promised. `channels` is validated for presence, not per element - only `displayName`
 * is consumed today (this file's own remarks), and its own elements are a future concern.
 */
const personProfileRequiredKeys = requiredKeysOf<PersonProfile>({
  personId: true,
  displayName: true,
  channels: true,
  firstSeenAt: true,
  lastSeenAt: true,
});

/**
 * `GET /api/v1/persons?ids=` - the batch a screen needs, in one request. An empty id list short-
 * circuits to `[]` without a round trip, so a screen with no rows (or rows that carry no person id)
 * never issues a call with an empty `?ids=`. Ids are de-duplicated by the caller
 * (`usePersonNames.ts`); this client sends whatever it is given, joined by commas the way the server
 * splits them.
 */
/**
 * `26-269`: one of this person's own conversations - `Ago.Chat.Application.UseCases
 * .GetPersonConversations.PersonConversationDto` verbatim, under the same default camelCase policy
 * `PersonProfile` above already relies on.
 *
 * `isActive` restates `state` as the one boolean `CalendarClientDetailPage`'s «Открыть диалог» action
 * actually branches on (open the composer, or open read-only) - `state` stays on the wire too,
 * unreduced, the same "collapse only the presentation, keep both facts" rule
 * `phoneStatusWarningGlyph` already follows for the phone-status glyph
 * (`26-269-clients-redesign.md` §5). `closedAt` is `null` for a conversation still open.
 */
export interface PersonConversation {
  conversationId: string;
  state: string;
  isActive: boolean;
  startedAt: string;
  closedAt: string | null;
  lastActivityAt: string;
}

const personConversationRequiredKeys = requiredKeysOf<PersonConversation>({
  conversationId: true,
  state: true,
  isActive: true,
  startedAt: true,
  closedAt: true,
  lastActivityAt: true,
});

/**
 * `GET /api/v1/persons/{personId}/conversations` - `26-269`'s own new chat read: given a person id,
 * every conversation they have, ordered so `conversations[0]` is always the one to open (the active
 * one if there is one, else the most recent - `PersonConversationItem`'s own doc comment on the
 * server side). Empty, never an error, for a person with no conversations yet (a `26-268` manual
 * client, for one) - `CalendarClientDetailPage` hides its «Открыть диалог» action on an empty list
 * rather than treating it as a failure, the identical "no dialog to open yet" degrade
 * `usePersonNames`'s own "name not shown yet" already establishes the shape for (`adr/0184`
 * decision 4).
 */
export async function getPersonConversations(
  accessToken: string,
  personId: string,
  signal?: AbortSignal,
): Promise<PersonConversation[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/persons/${encodeURIComponent(personId)}/conversations`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, Accept: "application/json" }),
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { conversations?: unknown };
  try {
    assertArrayHasKeys<PersonConversation>(
      body.conversations, personConversationRequiredKeys, "GET /api/v1/persons/{personId}/conversations",
    );
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new ApiProblemError("shape.mismatch", reason.diagnostic, response.status);
    }
    throw reason;
  }
  return body.conversations;
}

export async function getPersons(
  accessToken: string,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<PersonProfile[]> {
  if (ids.length === 0) {
    return [];
  }

  const query = new URLSearchParams({ ids: ids.join(",") });
  const response = await fetch(`${config.apiBaseUrl}/api/v1/persons?${query.toString()}`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}`, Accept: "application/json" }),
    signal: signal ?? null,
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body = (await response.json()) as { persons?: unknown };
  try {
    assertArrayHasKeys<PersonProfile>(body.persons, personProfileRequiredKeys, "GET /api/v1/persons");
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new ApiProblemError("shape.mismatch", reason.diagnostic, response.status);
    }
    throw reason;
  }
  return body.persons;
}
