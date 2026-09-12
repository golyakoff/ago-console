import { createContext, useContext } from "react";
import type { CalendarOperatorConnection, CalendarConnectionState } from "./calendarOperatorConnection.js";

export interface CalendarConnectionContextValue {
  /** `null` when this deployment has no calendar backend configured at all
   * (`config.calendarApiBaseUrl === null`) or the signed-in operator holds none of the permissions
   * the queue itself gates on (`hasAnyBookingActionPermission`/`calendar:configure`) - the identical
   * two guards `CalendarQueuePage` already applies, read once here instead of opening a connection
   * no screen in this console session can use. A consumer that only wants "is there a live
   * connection to react to" checks this for `null` first. */
  connection: CalendarOperatorConnection | null;
  connectionState: CalendarConnectionState;
}

export const CalendarConnectionContext = createContext<CalendarConnectionContextValue | null>(null);

/** Throws outside `CalendarOperatorConnectionProvider`, the same reasoning `useOperatorConnection`
 * already states - every route that needs this is already inside the provider (`App.tsx`'s shared
 * layout route). */
export function useCalendarConnection(): CalendarConnectionContextValue {
  const context = useContext(CalendarConnectionContext);
  if (context === null) {
    throw new Error("useCalendarConnection() called outside <CalendarOperatorConnectionProvider>.");
  }

  return context;
}
