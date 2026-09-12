import { useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { getPendingBookings } from "../api/calendarApi.js";
import { CalendarConnectionContext } from "../realtime/CalendarConnectionContext.js";

export interface PendingBookingsBadge {
  /** How many bookings, tenant-wide, are still awaiting confirmation - the same list
   * `CalendarQueuePage` renders as rows, counted rather than shown. Never derived from viewing a row:
   * `docs/backlog/25-51-*.md`'s own "Where this is likely to go wrong" is explicit that this count
   * must only fall when a booking actually leaves `PendingConfirmation` (confirmed, rejected,
   * cancelled, or aged into a no-show), never when an operator merely looks at the queue - which is
   * exactly what this hook does not read `CalendarQueuePage`'s own local list for, only
   * `getPendingBookings` itself. */
  pendingTotal: number;
}

/**
 * `25-51`: the "Записи" section's own badge count - deliberately **not** the chat-side
 * `ConversationsAttentionContext`'s mechanism reused. That mechanism exists to track *read state on
 * messages*, adjusted locally the instant an operator opens a conversation; a pending booking has no
 * such per-viewer read state at all - the fact this badge counts is a tenant-wide business condition
 * (`PendingConfirmation` vs. not) that every operator of the tenant sees identically, and it changes
 * only when `Ago.Calendar.Api` says it changed. Sharing one abstraction between the two would either
 * wrongly clear this count when a booking is merely viewed, or wrongly leave the chat badge unable to
 * clear on read - the item's own "Where this is likely to go wrong" names this failure mode directly.
 *
 * **No optimistic local count.** Unlike `attention.ts`'s overlay (which counts a locally-observed
 * arrival before the next queue fetch confirms it), every way a booking can leave
 * `PendingConfirmation` - this operator's own reject/cancel/no-show action on `CalendarQueuePage`, a
 * colleague's identical action, or the server's own auto-confirm sweep - reaches this hook through the
 * *same* channel: `CalendarOperatorHub`'s `PendingBookingsChanged` push, which this repository already
 * treats as a bare "something changed, re-read" signal carrying no count of its own
 * (`BookingPendingStateChanged`'s own remarks, `Ago.Calendar.Contracts`; `CalendarQueuePage`'s own
 * identical `reload()`-on-push wiring). There is therefore no client-observable case this hook could
 * shortcut with a local decrement without first receiving that same push anyway - so it does not try,
 * and simply re-fetches `getPendingBookings` (the identical call `CalendarQueuePage` already makes)
 * whenever the push arrives.
 *
 * **No periodic poll, matching `CalendarQueuePage`'s own existing precedent** (mount-fetch plus
 * push-triggered reload, no `setInterval`) rather than importing the chat workspace's own 15-second
 * fallback poll (`WorkspaceLayout`'s `WAITING_REFRESH_INTERVAL_MS`). A missed push would leave this
 * badge stale until the next one arrives - accepted here for consistency with the one calendar screen
 * that already makes the identical tradeoff, not decided fresh for this item.
 *
 * **Reads `CalendarConnectionContext` directly (`useContext`), not the throwing `useCalendarConnection()`
 * wrapper.** That wrapper is correct for `CalendarQueuePage`, a route reached only once
 * `CalendarOperatorConnectionProvider` is known to be mounted. This hook is called from `OperatorShell`,
 * which renders on every route - including inside several unit-test harnesses
 * (`WorkspaceLayout.test.tsx` and its siblings) that wire up `AuthContext`/`PermissionsContext`/
 * `OperatorConnectionContext` directly and were never given a reason to also mount
 * `CalendarOperatorConnectionProvider`, since nothing they exercise today reads it. For this hook, "the
 * provider was never mounted" and "this operator's session genuinely has no calendar hub to use" are
 * the identical fact either way - `CalendarOperatorConnectionProvider` itself already publishes
 * `connection: null` for the ordinary, real case of an operator holding no calendar permission
 * (`CalendarConnectionContext`'s own doc comment) - so treating an absent provider the same way is not
 * a silent degrade, it is the answer this hook already has to give for the common case.
 */
export function usePendingBookingsBadge(): PendingBookingsBadge {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const calendarConnection = useContext(CalendarConnectionContext);
  const connection = calendarConnection?.connection ?? null;
  const [pendingTotal, setPendingTotal] = useState(0);

  const refresh = useCallback(() => {
    if (!accessToken) {
      return;
    }

    getPendingBookings(accessToken)
      .then((rows) => setPendingTotal(rows.length))
      .catch((err: unknown) => {
        // Never surfaced to the operator - a nav badge that failed to refresh once is a cosmetic
        // staleness the next push (or the next mount) corrects, the same "never surfaced here" posture
        // `WorkspaceLayout`'s own `markRead` failure already takes for the identical reason.
        console.warn("Failed to refresh the pending-bookings nav badge", err);
      });
  }, [accessToken]);

  useEffect(() => {
    // No `setPendingTotal(0)` branch here for a `null` connection - unlike a genuinely bidirectional
    // toggle, `CalendarOperatorConnectionProvider`'s own doc comment states this identity's
    // `connection` cannot legitimately flip from real back to `null` within one signed-in session (the
    // permission check it closes over is resolved once per `accessToken`), so the only transition this
    // effect ever actually sees is `null` -> a real connection, never the reverse - `useState(0)`'s own
    // initial value already is the right answer for every render before that happens, and there is no
    // render after it where `0` would need restating.
    if (connection === null) {
      return;
    }

    refresh();
    return connection.onPendingBookingsChanged(() => refresh());
  }, [connection, refresh]);

  return { pendingTotal };
}
