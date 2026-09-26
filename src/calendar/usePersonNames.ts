import { useEffect, useMemo, useState } from "react";
import { getPersons } from "../api/personsApi.js";

/**
 * `26-161`/`adr/0184`: the console-side **display-merge** of chat's Person registry onto the
 * calendar's own booking/contact rows. A calendar row carries only an opaque `personId`
 * (`adr/0184` decision 3 - the calendar holds no person copy); this hook fetches the names for a
 * screen's whole set of person ids in one batch from chat's `GET /api/v1/persons?ids=` and hands the
 * render helpers a per-id lookup.
 *
 * <b>Degrades, never blanks or crashes.</b> `adr/0184`'s named consequence: "calendar person-display
 * depends on chat's Person API being reachable - a display GET, not a write... degrades to 'name not
 * shown yet', never to a failed booking." So a rejected fetch resolves every row to `"unavailable"`
 * rather than throwing up through the page, and a booking's own data (time, service, phone) still
 * renders. The alternative - letting the throw reach the page's own error state - would blank the
 * whole screen over a display nicety, exactly what the ADR forbids.
 *
 * <b>Batch, keyed on the id set, not per row.</b> The ids are de-duplicated and sorted into a stable
 * key so re-renders that don't change *which* people are shown (an in-place phone reveal, a busy-state
 * toggle) never refetch. A screen whose rows change identity (a new date range, a reload) refetches
 * once for the new set. One request per screen-load, not one per row - the "fetch person names by id
 * (batch after loading each screen)" the item asks for.
 */

/** The resolved state of one person's name, as a render helper consumes it. `"loading"` while the
 * batch this id belongs to is in flight; `"unavailable"` when chat's API could not be reached (the
 * whole batch failed); `"resolved"` otherwise, with `displayName` `null` when chat holds no name for
 * this person (rendered as "not recorded", distinct from "not shown yet"). */
export type PersonNameState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "resolved"; displayName: string | null };

export interface PersonNames {
  /** The state for one person id. An id that was never part of the requested set resolves the same
   * way an id chat did not know does - `{ status: "resolved", displayName: null }` - so a row whose
   * id somehow escaped the batch reads as "not recorded" rather than hanging on "loading". */
  lookup(personId: string): PersonNameState;
}

type BatchStatus = "idle" | "loading" | "loaded" | "unavailable";

/**
 * @param accessToken the operator's current token, or `undefined` before sign-in resolves - no fetch
 *   is issued without one (the batch stays `"idle"`, which lookups read as "resolved, no name").
 * @param personIds every person id visible on the screen right now, in any order, with duplicates -
 *   this hook de-duplicates them. Derive it from the loaded rows (`null`/loading rows contribute
 *   none), so it is empty until the calendar's own data arrives and the batch waits for it.
 */
export function usePersonNames(accessToken: string | undefined, personIds: readonly string[]): PersonNames {
  const idsKey = useMemo(() => Array.from(new Set(personIds)).sort().join(","), [personIds]);
  const [status, setStatus] = useState<BatchStatus>("idle");
  const [names, setNames] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    const ids = idsKey === "" ? [] : idsKey.split(",");
    if (!accessToken || ids.length === 0) {
      // Nothing to fetch - present as "loaded" over an empty map so lookups read as "resolved, no
      // name" (a row with no person id never reaches a lookup anyway) rather than a stuck "loading".
      // This is React's own "adjust state to props" shape, not a data fetch - a deliberate synchronous
      // set, the same per-line suppression the calendar pages use for their own mount effects.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("loaded");
      setNames(new Map());
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    // Fetches every visible person's name in one batch. Deliberately swallows the failure into an
    // "unavailable" state rather than rethrowing - see this hook's own doc comment: chat being
    // unreachable must degrade the name column, never fail the booking screen around it. Every
    // `setState` below runs after the `await`, never synchronously in the effect body.
    void (async () => {
      try {
        const profiles = await getPersons(accessToken, ids, controller.signal);
        const next = new Map<string, string | null>();
        for (const profile of profiles) {
          next.set(profile.personId, profile.displayName);
        }
        setNames(next);
        setStatus("loaded");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setStatus("unavailable");
      }
    })();

    return () => controller.abort();
  }, [accessToken, idsKey]);

  return useMemo<PersonNames>(
    () => ({
      lookup(personId: string): PersonNameState {
        if (status === "loading") {
          return { status: "loading" };
        }
        if (status === "unavailable") {
          return { status: "unavailable" };
        }
        return { status: "resolved", displayName: names.get(personId) ?? null };
      },
    }),
    [status, names],
  );
}
