import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { problemDetailsFrom } from "./problemDetails.js";

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
 * `GET /api/v1/persons?ids=` - the batch a screen needs, in one request. An empty id list short-
 * circuits to `[]` without a round trip, so a screen with no rows (or rows that carry no person id)
 * never issues a call with an empty `?ids=`. Ids are de-duplicated by the caller
 * (`usePersonNames.ts`); this client sends whatever it is given, joined by commas the way the server
 * splits them.
 */
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

  const body = (await response.json()) as { persons: PersonProfile[] };
  return body.persons;
}
