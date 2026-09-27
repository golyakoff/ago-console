import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { RescheduleBookingButton, RESCHEDULE_BOOKING_PERMISSION } from "./RescheduleBookingButton.js";
import { CalendarApiError, type WorkerSlot } from "../api/calendarApi.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

// `23-34`'s own pattern, restated here for the same reason every calendar-adjacent test file already
// carries it: `CalendarApiError` is a real (non type-only) import from `calendarApi.ts`, which imports
// `config.ts`, which validates its own required env vars eagerly at module load - so anything reaching
// that module from a test has to stand this mock in front of it first (`CalendarQueuePage.test.tsx`'s
// identical block).
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
  },
}));

/**
 * `26-210`/`adr/0187`: `CalendarBookingsPage`'s first row action - «Перенести». This file follows
 * `CloseConversationButton.test.tsx`'s own established shape for a permission-gated Button+Dialog
 * component (a hand-made `PermissionsContext`, injected handlers rather than a mocked API module,
 * since `RescheduleBookingButtonProps` already takes `onLoadSlots`/`onReschedule` as plain functions -
 * see that component's own doc comment for why: "the page owns the request, this owns the interaction
 * around it"). What is under test here is this component's own gating, its own courtesy-read/pick/
 * submit flow, and its own error mapping; `CalendarBookingsPage.test.tsx` covers the page's own wiring
 * of the real `getWorkerSlots`/`rescheduleBooking` calls into these same props.
 */
const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
      credentialsArePublished: false,
      hasPermission: (permission: string) => permissions.includes(permission),
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

function slot(overrides: Partial<WorkerSlot> = {}): WorkerSlot {
  return {
    eventId: "event-1",
    localDate: "2026-09-08",
    weekday: 2,
    startsAt: "2026-09-08T09:00:00+00:00",
    endsAt: "2026-09-08T09:30:00+00:00",
    status: "Available",
    serviceId: "s1",
    serviceName: "Haircut",
    personId: null,
    phone: null,
    masked: false,
    bookingId: null,
    ...overrides,
  };
}

interface Handlers {
  onLoadSlots: Mock<(date: string, signal: AbortSignal) => Promise<WorkerSlot[]>>;
  onReschedule: Mock<(newStartEventId: string) => Promise<void>>;
  onRescheduled: Mock<() => void>;
}

function handlers(slots: WorkerSlot[] = [slot()]): Handlers {
  return {
    onLoadSlots: vi.fn(() => Promise.resolve(slots)),
    onReschedule: vi.fn(() => Promise.resolve()),
    onRescheduled: vi.fn<() => void>(),
  };
}

async function mount(permissions: string[], h: Handlers): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <RescheduleBookingButton
        initialDate="2026-09-08"
        timeZone="UTC"
        onLoadSlots={h.onLoadSlots}
        onReschedule={h.onReschedule}
        onRescheduled={h.onRescheduled}
      />
    </Permitted>,
  );
}

/** Opens the dialog and waits for its own load to settle. */
async function open(container: HTMLElement): Promise<void> {
  await interact(() => byText<HTMLButtonElement>(container, "button", "Reschedule")?.click());
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the control", () => {
  it("offers it to an operator holding booking:reschedule", async () => {
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], handlers());

    expect(byText(container, "button", "Reschedule")).not.toBeNull();
  });

  it("does not render it at all for an operator without the permission - not even disabled", async () => {
    const container = await mount(["customer:read"], handlers());

    expect(byText(container, "button", "Reschedule")).toBeNull();
    expect(all(container, "button[disabled]")).toHaveLength(0);
  });

  it("renders nothing whatsoever, not an empty wrapper", async () => {
    const container = await mount([], handlers());

    expect(all(container, "button")).toHaveLength(0);
    expect(all(container, "dialog")).toHaveLength(0);
  });
});

describe("picking a slot", () => {
  it("loads the chosen worker's own day the moment the dialog opens, keyed on the row's own date", async () => {
    const h = handlers([slot({ eventId: "e1" })]);
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);

    expect(h.onLoadSlots).toHaveBeenCalledTimes(1);
    expect(h.onLoadSlots.mock.calls[0]?.[0]).toBe("2026-09-08");
  });

  it("offers only the Available rows, never one already Booked or Blocked", async () => {
    const h = handlers([
      slot({ eventId: "free", status: "Available" }),
      slot({ eventId: "taken", status: "Booked" }),
      slot({ eventId: "closed", status: "Blocked" }),
    ]);
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);

    expect(all(container, '[role="radiogroup"] button')).toHaveLength(1);
  });

  it("shows an honest empty state when the worker has no available slot left that day", async () => {
    const h = handlers([]);
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);

    expect(container.textContent).toContain("no available slot left");
  });

  it("shows a load error, and no slot list, when the day's own grid fails to load", async () => {
    const h = handlers();
    h.onLoadSlots.mockRejectedValue(new Error("network down"));
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);

    expect(container.textContent).toContain("The console could not reach AGO Calendar.");
    expect(all(container, '[role="radiogroup"] button')).toHaveLength(0);
  });

  it("re-loads the grid when the date field changes", async () => {
    const h = handlers([slot()]);
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);
    const dateField = one<HTMLInputElement>(container, 'input[type="date"]');
    await interact(() => {
      // `CalendarAvailabilityPage.test.tsx`'s own pattern: a controlled input's `value` has to go
      // through the native setter, not the JSX prop's own tracked one, or React never sees the change.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dateField, "2026-09-09");
      dateField.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(h.onLoadSlots).toHaveBeenCalledTimes(2);
    expect(h.onLoadSlots.mock.calls[1]?.[0]).toBe("2026-09-09");
  });
});

describe("confirming the move", () => {
  function submitButton(container: ParentNode): HTMLButtonElement {
    const button = byText<HTMLButtonElement>(one(container, "dialog"), "button", "Reschedule");
    if (button === null) {
      throw new Error("the reschedule dialog has no submit control");
    }
    return button;
  }

  it("disables the submit control until a slot is picked", async () => {
    const h = handlers([slot()]);
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);

    expect(submitButton(container).disabled).toBe(true);
  });

  it("sends the picked slot's own eventId, tells the page it moved, and closes", async () => {
    const h = handlers([slot({ eventId: "e42" })]);
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);
    await interact(() => one<HTMLButtonElement>(container, '[role="radiogroup"] button').click());
    await interact(() => submitButton(container).click());

    expect(h.onReschedule).toHaveBeenCalledWith("e42");
    expect(h.onRescheduled).toHaveBeenCalledTimes(1);
    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(false);
  });

  it("names the one refusal it is taught - the slot was claimed under the operator - and keeps the dialog open", async () => {
    const h = handlers([slot({ eventId: "e1" })]);
    h.onReschedule.mockRejectedValue(new CalendarApiError("booking.slot_unavailable", "server wording", 409));
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);
    await interact(() => one<HTMLButtonElement>(container, '[role="radiogroup"] button').click());
    await interact(() => submitButton(container).click());

    expect(container.textContent).toContain("no longer available");
    expect(container.textContent).not.toContain("server wording");
    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(true);
    expect(h.onRescheduled).not.toHaveBeenCalled();
  });

  it("surfaces the server's own detail verbatim for a refusal it has not been taught, e.g. a different worker", async () => {
    const h = handlers([slot({ eventId: "e1" })]);
    h.onReschedule.mockRejectedValue(
      new CalendarApiError("booking.invalid_state", "The target belongs to a different worker.", 409),
    );
    const container = await mount([RESCHEDULE_BOOKING_PERMISSION], h);

    await open(container);
    await interact(() => one<HTMLButtonElement>(container, '[role="radiogroup"] button').click());
    await interact(() => submitButton(container).click());

    expect(container.textContent).toContain("The target belongs to a different worker.");
    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(true);
  });
});
