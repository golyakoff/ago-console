import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { hasAnyBookingActionPermission } from "../calendar/calendarPermissions.js";
import { CalendarOperatorConnection, type CalendarConnectionState } from "./calendarOperatorConnection.js";
import { CalendarConnectionContext, type CalendarConnectionContextValue } from "./CalendarConnectionContext.js";

/**
 * `25-63`: `OperatorConnectionProvider`'s own shape, built for `CalendarOperatorHub` instead of
 * `ago-chat`'s operator hub - one `CalendarOperatorConnection` for the operator's whole signed-in
 * session, mounted once at the shared layout route (`App.tsx`) so navigating between calendar screens
 * never tears down and reopens the connection.
 *
 * <b>Two guards `OperatorConnectionProvider` does not need, because this hub is optional where
 * `ago-chat`'s is not.</b> Every operator of every tenant uses conversations; not every deployment has
 * AGO Calendar configured at all, and not every operator holds a calendar permission even where it
 * is. So this provider never calls `connection.start()` unless both are true:
 *
 * <ul>
 * <li><c>config.calendarApiBaseUrl !== null</c> - the identical check every calendar screen in this
 * console already makes (`CalendarQueuePage`'s own render, `config.calendarApiBaseUrl === null` ->
 * "not configured").</li>
 * <li>the caller holds at least one of the permissions `CalendarQueuePage` itself gates on
 * (<c>hasAnyBookingActionPermission</c> or <c>calendar:configure</c>) - opening a connection to a hub
 * whose one push exists to tell a screen this operator can never see to re-read a queue they can
 * never read would be a connection with no honest reason to be open.</li>
 * </ul>
 *
 * When either is false, <c>connection</c> in the published context value is <c>null</c> and nothing
 * ever connects - <c>useCalendarConnection()</c>'s own doc comment states this is the intended,
 * checked case, not a loading state to wait out.
 */
export function CalendarOperatorConnectionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const { tenancies, hasPermission } = usePermissions();
  const [connectionState, setConnectionState] = useState<CalendarConnectionState>("connecting");

  const accessTokenRef = useRef(accessToken);
  useLayoutEffect(() => {
    accessTokenRef.current = accessToken;
  });

  if (!accessToken) {
    // The same wiring contract OperatorConnectionProvider's own remarks state: RequireAuth guarantees
    // a signed-in user by the time children render, so reaching here is a mounting bug, not a state
    // this component renders around.
    throw new Error("CalendarOperatorConnectionProvider requires an authenticated user - mount it inside RequireAuth.");
  }

  const canUseCalendarHub =
    config.calendarApiBaseUrl !== null &&
    (hasPermission("calendar:configure") || hasAnyBookingActionPermission(hasPermission));

  // Built once, only when this operator can actually use it - never rebuilt across renders even
  // though canUseCalendarHub is read fresh above, because the permission check it closes over
  // (hasPermission) cannot legitimately flip false-to-true or back within one signed-in session
  // (PermissionsProvider resolves it once per accessToken, the same fact OperatorConnectionProvider's
  // own tenancies-gating comment already relies on).
  const connection = useMemo(
    () => (canUseCalendarHub ? new CalendarOperatorConnection(accessTokenRef) : null),
    [canUseCalendarHub],
  );

  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (connection === null || tenancies === null || hasStartedRef.current) {
      // `tenancies === null`: the active-site signal (src/api/activeSite.ts) is not reliably known
      // until PermissionsProvider's own first resolution - OperatorConnectionProvider's own remarks
      // explain the race this delay avoids, and it applies identically here since this connection
      // reads the same signal at its own first start().
      return;
    }

    hasStartedRef.current = true;

    connection.onStateChange(setConnectionState);
    connection.start().catch((error: unknown) => {
      console.error("Calendar operator hub connection failed to start", error);
      setConnectionState("disconnected");
    });

    // No connection.stop() here - the identical "this provider sits at the layout-route level for
    // the operator's whole session, and React StrictMode's dev-only mount/cleanup/remount would race
    // a real stop() against an in-flight start()" reasoning OperatorConnectionProvider's own remarks
    // give in full.
  }, [connection, tenancies]);

  const value = useMemo<CalendarConnectionContextValue>(
    () => ({ connection, connectionState: connection === null ? "disconnected" : connectionState }),
    [connection, connectionState],
  );

  return <CalendarConnectionContext.Provider value={value}>{children}</CalendarConnectionContext.Provider>;
}
