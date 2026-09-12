import { useEffect } from "react";
import type { User } from "oidc-client-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { CalendarConnectionContext, type CalendarConnectionContextValue } from "../realtime/CalendarConnectionContext.js";
import { interact, render, unmount } from "../testing/dom.js";
import { usePendingBookingsBadge } from "./usePendingBookingsBadge.js";

const calendarApi = vi.hoisted(() => ({ getPendingBookings: vi.fn() }));
vi.mock("../api/calendarApi.js", () => calendarApi);

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub" } } as unknown as User;
}

function Signed({ children }: { children: React.ReactNode }) {
  const auth: AuthState = {
    user: signedIn(),
    isLoading: false,
    isSigningOut: false,
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** A minimal stand-in for `CalendarOperatorConnection` - only the one method this hook actually
 * calls, matching `calendarOperatorConnection.test.tsx`'s own real-hub-level test at a lower level:
 * this file proves the hook's own wiring (when it fetches, when it does not), not the transport. */
function fakeConnection() {
  let listener: ((dto: unknown) => void) | null = null;
  return {
    onPendingBookingsChanged: vi.fn((l: (dto: unknown) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
    push(dto: unknown) {
      listener?.(dto);
    },
  };
}

function Probe({ onResult }: { onResult: (total: number) => void }) {
  const { pendingTotal } = usePendingBookingsBadge();
  useEffect(() => {
    onResult(pendingTotal);
  });
  return null;
}

afterEach(async () => {
  await unmount();
});

beforeEach(() => {
  calendarApi.getPendingBookings.mockReset();
});

describe("usePendingBookingsBadge", () => {
  it("fetches nothing and reports 0 when there is no calendar connection at all", async () => {
    const results: number[] = [];
    const value: CalendarConnectionContextValue = { connection: null, connectionState: "disconnected" };

    await render(
      <Signed>
        <CalendarConnectionContext.Provider value={value}>
          <Probe onResult={(total) => results.push(total)} />
        </CalendarConnectionContext.Provider>
      </Signed>,
    );

    expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
    expect(results.at(-1)).toBe(0);
  });

  it("reports 0, without throwing, when mounted outside any CalendarConnectionContext at all", async () => {
    // `25-51`: `OperatorShell` calls this hook unconditionally, including inside unit-test harnesses
    // that never mount `CalendarOperatorConnectionProvider` (`usePendingBookingsBadge.ts`'s own doc
    // comment names the list) - this is the case that matters most for keeping those harnesses green.
    const results: number[] = [];

    await render(
      <Signed>
        <Probe onResult={(total) => results.push(total)} />
      </Signed>,
    );

    expect(calendarApi.getPendingBookings).not.toHaveBeenCalled();
    expect(results.at(-1)).toBe(0);
  });

  it("fetches once on mount and reports the row count once a connection is available", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([{ bookingId: "1" }, { bookingId: "2" }, { bookingId: "3" }]);
    const results: number[] = [];
    const connection = fakeConnection();
    const value: CalendarConnectionContextValue = {
      connection: connection as unknown as CalendarConnectionContextValue["connection"],
      connectionState: "connected",
    };

    await render(
      <Signed>
        <CalendarConnectionContext.Provider value={value}>
          <Probe onResult={(total) => results.push(total)} />
        </CalendarConnectionContext.Provider>
      </Signed>,
    );

    expect(calendarApi.getPendingBookings).toHaveBeenCalledTimes(1);
    expect(results.at(-1)).toBe(3);
  });

  it("re-fetches, and the count updates, when the hub's PendingBookingsChanged push arrives", async () => {
    calendarApi.getPendingBookings.mockResolvedValueOnce([{ bookingId: "1" }]);
    const results: number[] = [];
    const connection = fakeConnection();
    const value: CalendarConnectionContextValue = {
      connection: connection as unknown as CalendarConnectionContextValue["connection"],
      connectionState: "connected",
    };

    const container = await render(
      <Signed>
        <CalendarConnectionContext.Provider value={value}>
          <Probe onResult={(total) => results.push(total)} />
        </CalendarConnectionContext.Provider>
      </Signed>,
    );
    void container;

    expect(results.at(-1)).toBe(1);

    calendarApi.getPendingBookings.mockResolvedValueOnce([{ bookingId: "1" }, { bookingId: "2" }]);
    await interact(() =>
      connection.push({ eventId: "e1", tenantId: "t1", status: "Booked", occurredAt: "2026-09-12T09:00:00+00:00", correlationId: "c1" }),
    );

    expect(calendarApi.getPendingBookings).toHaveBeenCalledTimes(2);
    expect(results.at(-1)).toBe(2);
  });

  it("never re-fetches on its own - merely rendering again with no push does not touch the count", async () => {
    // `25-51`'s own "Where this is likely to go wrong": viewing must not be confused with resolving.
    // This hook has no "I was looked at" input at all - the only two things that ever call
    // `getPendingBookings` are the initial mount and a real hub push, which this test is the negative
    // half of: nothing else that happens to this component re-triggers it.
    calendarApi.getPendingBookings.mockResolvedValue([{ bookingId: "1" }]);
    const connection = fakeConnection();
    const value: CalendarConnectionContextValue = {
      connection: connection as unknown as CalendarConnectionContextValue["connection"],
      connectionState: "connected",
    };
    const results: number[] = [];

    await render(
      <Signed>
        <CalendarConnectionContext.Provider value={value}>
          <Probe onResult={(total) => results.push(total)} />
        </CalendarConnectionContext.Provider>
      </Signed>,
    );
    expect(calendarApi.getPendingBookings).toHaveBeenCalledTimes(1);

    // Re-render the identical tree - the same "operator navigates elsewhere and back" shape a route
    // change would produce, with no push in between.
    await render(
      <Signed>
        <CalendarConnectionContext.Provider value={value}>
          <Probe onResult={(total) => results.push(total)} />
        </CalendarConnectionContext.Provider>
      </Signed>,
    );

    expect(calendarApi.getPendingBookings).toHaveBeenCalledTimes(1);
  });
});
