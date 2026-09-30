import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ManualBookingButton, MANUAL_BOOKING_PERMISSION, type ManualBookingCreateInput } from "./ManualBookingButton.js";
import {
  CalendarApiError,
  type ConfiguredCalendar,
  type ConfiguredService,
  type ConfiguredWorker,
  type ManualBookingConfirmation,
  type PersonRecognitionCandidate,
  type WorkerSlot,
} from "../api/calendarApi.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

// `RescheduleBookingButton.test.tsx`'s own pattern, restated for the same reason: `calendarErrorMessage`
// (which this component calls) imports the real `CalendarApiError` from `calendarApi.js`, which
// validates `config.ts`'s own required env vars eagerly at module load.
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
 * `26-268`/`adr/0188`: `CalendarBookingsPage`'s second `PageHead` action - «Добавить вручную». Follows
 * `RescheduleBookingButton.test.tsx`'s own established shape for a permission-gated Button+Dialog
 * component: a hand-made `PermissionsContext`, injected handlers rather than a mocked API module
 * (`ManualBookingButton`'s own doc comment gives the identical "the page owns the request" reasoning).
 * `CalendarBookingsPage.test.tsx`'s own "manual booking" describe block covers the page's wiring of the
 * real `getPersonCandidatesByPhone`/`getPersons`/`getWorkerSlots`/`createManualBooking` calls into these
 * same props; this file is the wizard's own gating, recognition, and step-by-step behaviour.
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

const SERVICES: ConfiguredService[] = [
  { serviceId: "svc-cut", name: "Haircut", durationMinutes: 60, priceMinorUnits: null, priceCurrencyCode: null, priceIsFrom: false, description: null, isActive: true },
  { serviceId: "svc-color", name: "Coloring", durationMinutes: 120, priceMinorUnits: null, priceCurrencyCode: null, priceIsFrom: false, description: null, isActive: true },
  // Archived - must never be offered by this dialog (`ConfiguredService.isActive`'s own remarks).
  { serviceId: "svc-old", name: "Retired service", durationMinutes: 30, priceMinorUnits: null, priceCurrencyCode: null, priceIsFrom: false, description: null, isActive: false },
];

// Two active workers offer "svc-cut" (`w-irina`/`w-anna`) - deliberately more than one, so the walk
// through this file's shared fixtures exercises the ordinary "several options, still shown" worker step
// (`26-323`'s own several-eligible-workers scenario is otherwise indistinguishable from a bug, since a
// single eligible worker per service is exactly the case that component now auto-skips). The dedicated
// single-eligible-worker fixtures for that skip live in the "skipping a step" describe block below.
const WORKERS: ConfiguredWorker[] = [
  { workerId: "w-irina", displayName: "Irina Sokolova", isActive: true, serviceIds: ["svc-cut"] },
  { workerId: "w-anna", displayName: "Anna Orlova", isActive: true, serviceIds: ["svc-cut"] },
  { workerId: "w-petr", displayName: "Petr Kim", isActive: true, serviceIds: ["svc-color"] },
  { workerId: "w-gone", displayName: "Departed worker", isActive: false, serviceIds: ["svc-cut"] },
];

const CALENDARS: ConfiguredCalendar[] = [
  { calendarId: "cal-1", name: "Main", timeZone: "UTC", isPublished: true, workerIds: ["w-irina", "w-petr", "w-gone"], workingHours: [] },
];

function candidate(overrides: Partial<PersonRecognitionCandidate> = {}): PersonRecognitionCandidate {
  return {
    personId: "person-1",
    phone: "+79210000000",
    masked: false,
    noShowCount: 0,
    bookingCount: 3,
    phoneVerifiedAt: null,
    phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-01-01T00:00:00+00:00",
    lastSeenAt: "2026-09-01T00:00:00+00:00",
    ...overrides,
  };
}

function slot(eventId: string, startsAt: string, endsAt: string, status: WorkerSlot["status"] = "Available"): WorkerSlot {
  return {
    eventId,
    localDate: "2026-10-02",
    weekday: 5,
    startsAt,
    endsAt,
    status,
    serviceId: "svc-cut",
    serviceName: "Haircut",
    personId: null,
    phone: null,
    masked: false,
    bookingId: null,
  };
}

function confirmation(): ManualBookingConfirmation {
  return { bookingId: "booking-1", workerId: "w-irina", startsAt: "2026-10-02T14:00:00+00:00", endsAt: "2026-10-02T15:00:00+00:00", localDate: "2026-10-02" };
}

interface Handlers {
  onSearchByPhone: Mock<(phone: string, signal: AbortSignal) => Promise<PersonRecognitionCandidate[]>>;
  onLookupNames: Mock<(personIds: string[], signal: AbortSignal) => Promise<{ personId: string; displayName: string | null }[]>>;
  onLoadSlots: Mock<(workerId: string, date: string, signal: AbortSignal) => Promise<WorkerSlot[]>>;
  onCreate: Mock<(input: ManualBookingCreateInput) => Promise<ManualBookingConfirmation>>;
  onCreated: Mock<() => void>;
}

function handlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    onSearchByPhone: vi.fn(() => Promise.resolve([])),
    onLookupNames: vi.fn(() => Promise.resolve([])),
    onLoadSlots: vi.fn(() => Promise.resolve([slot("slot-1", "2026-10-02T14:00:00+00:00", "2026-10-02T15:00:00+00:00")])),
    onCreate: vi.fn(() => Promise.resolve(confirmation())),
    onCreated: vi.fn<() => void>(),
    ...overrides,
  };
}

interface FixtureOverrides {
  services?: ConfiguredService[];
  workers?: ConfiguredWorker[];
  calendars?: ConfiguredCalendar[];
}

async function mount(permissions: string[], h: Handlers, overrides: FixtureOverrides = {}): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <ManualBookingButton
        services={overrides.services ?? SERVICES}
        workers={overrides.workers ?? WORKERS}
        calendars={overrides.calendars ?? CALENDARS}
        timeZone="UTC"
        onSearchByPhone={h.onSearchByPhone}
        onLookupNames={h.onLookupNames}
        onLoadSlots={h.onLoadSlots}
        onCreate={h.onCreate}
        onCreated={h.onCreated}
      />
    </Permitted>,
  );
}

/** Drives the wizard from a freshly-opened dialog up to and including the "Continue as new" +
 * name-entry step - the shared prefix every skip test below starts from, since none of them are about
 * the phone/client steps themselves. */
async function walkToClientStep(container: HTMLElement, name: string): Promise<void> {
  await open(container);
  await typePhone(container, "+79210000000");
  await clickFooter(container, "Find client");
  await clickFooter(container, "Continue as new");
  const nameInput = one<HTMLInputElement>(dialog(container), "input[type='text'], input:not([type])");
  await interact(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nameInput, name);
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function open(container: HTMLElement): Promise<void> {
  await interact(() => byText<HTMLButtonElement>(container, "button", "Add manually")?.click());
}

function dialog(container: HTMLElement): HTMLDialogElement {
  return one<HTMLDialogElement>(container, "dialog");
}

async function typePhone(container: HTMLElement, value: string): Promise<void> {
  const input = one<HTMLInputElement>(dialog(container), 'input[type="tel"]');
  await interact(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickFooter(container: HTMLElement, text: string): Promise<void> {
  await interact(() => byText<HTMLButtonElement>(dialog(container), "button", text)?.click());
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the control", () => {
  it("offers it to an operator holding booking:create", async () => {
    const container = await mount([MANUAL_BOOKING_PERMISSION], handlers());

    expect(byText(container, "button", "Add manually")).not.toBeNull();
  });

  it("renders nothing whatsoever for an operator without the permission - not even a dialog", async () => {
    const container = await mount(["customer:read"], handlers());

    expect(all(container, "button")).toHaveLength(0);
    expect(all(container, "dialog")).toHaveLength(0);
  });
});

describe("phone-first recognition (26-268 §3.4)", () => {
  it("searches with the typed phone, trimmed", async () => {
    const h = handlers({ onSearchByPhone: vi.fn(() => Promise.resolve([])) });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "  +7 921 000-00-00  ");
    await clickFooter(container, "Find client");

    expect(h.onSearchByPhone).toHaveBeenCalledWith("+7 921 000-00-00", expect.anything());
  });

  it("no match: offers to continue as a new client, straight past the name/email step is not skipped", async () => {
    const h = handlers({ onSearchByPhone: vi.fn(() => Promise.resolve([])) });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");

    expect(dialog(container).textContent).toContain("No client has this number");
    await clickFooter(container, "Continue as new");

    // Landed on the new-client step - the name field is present and required.
    expect(byText(dialog(container), ".ago-field__label", "Client's name")).not.toBeNull();
  });

  it("one match: shows the candidate's display-merged name and booking count, and 'It's them' reuses it", async () => {
    const h = handlers({
      onSearchByPhone: vi.fn(() => Promise.resolve([candidate({ personId: "p1", bookingCount: 3 })])),
      onLookupNames: vi.fn(() => Promise.resolve([{ personId: "p1", displayName: "Anna Kovaleva" }])),
    });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");

    expect(dialog(container).textContent).toContain("Anna Kovaleva");
    expect(dialog(container).textContent).toContain("Returning client · 3 bookings");

    await interact(() => byText<HTMLButtonElement>(dialog(container), "button", "It's them")?.click());

    // Lands on the client step, but read-only - no name/email fields to fill for a recognized client.
    expect(dialog(container).textContent).toContain("Step 2 of 6");
    expect(byText(dialog(container), ".ago-field__label", "Client's name")).toBeNull();
    expect(dialog(container).textContent).toContain("Returning client · 3 bookings");

    await clickFooter(container, "Next");

    expect(dialog(container).textContent).toContain("Step 3 of 6");
  });

  it("one match: 'New client' does not reuse the candidate, and asks for a name", async () => {
    const h = handlers({
      onSearchByPhone: vi.fn(() => Promise.resolve([candidate({ personId: "p1" })])),
      onLookupNames: vi.fn(() => Promise.resolve([{ personId: "p1", displayName: "Anna Kovaleva" }])),
    });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");
    await interact(() => byText<HTMLButtonElement>(dialog(container), "button", "New client")?.click());

    expect(byText(dialog(container), ".ago-field__label", "Client's name")).not.toBeNull();
  });

  it("several matches: lists every candidate plus a 'New client' row, and advances only once one is picked", async () => {
    const h = handlers({
      onSearchByPhone: vi.fn(() =>
        Promise.resolve([candidate({ personId: "p1" }), candidate({ personId: "p2", bookingCount: 1 })]),
      ),
      onLookupNames: vi.fn(() =>
        Promise.resolve([
          { personId: "p1", displayName: "Anna Kovaleva" },
          { personId: "p2", displayName: "Maria Kovaleva" },
        ]),
      ),
    });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");

    expect(dialog(container).textContent).toContain("Anna Kovaleva");
    expect(dialog(container).textContent).toContain("Maria Kovaleva");
    expect(all(dialog(container), '[role="radiogroup"] button')).toHaveLength(3); // two candidates + New client

    // "Next" is disabled until a row is picked.
    expect(byText<HTMLButtonElement>(dialog(container), "button", "Next")?.disabled).toBe(true);

    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Anna Kovaleva · Returning client · 3 bookings")?.click());
    await clickFooter(container, "Next");

    // Lands on the read-only client step - one more "Next" reaches service.
    expect(dialog(container).textContent).toContain("Step 2 of 6");
    await clickFooter(container, "Next");

    expect(dialog(container).textContent).toContain("Step 3 of 6");
  });

  it("surfaces a search failure and lets the operator retry", async () => {
    const h = handlers({
      onSearchByPhone: vi
        .fn()
        .mockRejectedValueOnce(new CalendarApiError("person_recognition.invalid_phone", "not a phone", 400))
        .mockResolvedValueOnce([]),
    });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "abc");
    await clickFooter(container, "Find client");

    expect(dialog(container).textContent).toContain("not a phone");

    await clickFooter(container, "Retry");

    expect(h.onSearchByPhone).toHaveBeenCalledTimes(2);
    expect(dialog(container).textContent).toContain("No client has this number");
  });
});

describe("the guided walk from client to review", () => {
  /** Drives a brand-new client all the way to the review step, picking `svc-cut`/`w-irina`/the one
   * fixture slot along the way - the shortest path every submit-shaped test below starts from. */
  async function walkToReview(container: HTMLElement, h: Handlers): Promise<void> {
    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");
    await clickFooter(container, "Continue as new");

    const nameInput = one<HTMLInputElement>(dialog(container), "input[type='text'], input:not([type])");
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nameInput, "Irina Melnikova");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickFooter(container, "Next");

    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());
    await clickFooter(container, "Next");

    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Irina Sokolova")?.click());
    await clickFooter(container, "Next");

    await interact(() => one<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button').click());
    await clickFooter(container, "Next");

    void h;
  }

  it("offers only the workers who are active and offer the chosen service", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");
    await clickFooter(container, "Continue as new");
    const nameInput = one<HTMLInputElement>(dialog(container), "input[type='text'], input:not([type])");
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nameInput, "X");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickFooter(container, "Next");
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());
    await clickFooter(container, "Next");

    // "svc-cut" is offered by "w-irina" (active) and "w-gone" (inactive) - only the active one shows.
    expect(dialog(container).textContent).toContain("Irina Sokolova");
    expect(dialog(container).textContent).not.toContain("Departed worker");
    expect(dialog(container).textContent).not.toContain("Petr Kim");
  });

  it("loads the picked worker's own day grid for today's date", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");
    await clickFooter(container, "Continue as new");
    const nameInput = one<HTMLInputElement>(dialog(container), "input[type='text'], input:not([type])");
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nameInput, "X");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickFooter(container, "Next");
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());
    await clickFooter(container, "Next");
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Irina Sokolova")?.click());

    expect(h.onLoadSlots).toHaveBeenCalledWith("w-irina", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.anything());
  });

  it("submits the new client's own name/phone/email, the resolved calendarId, and no reusePersonId", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);
    await walkToReview(container, h);

    expect(dialog(container).textContent).toContain("New");
    expect(dialog(container).textContent).toContain("not provided");

    await clickFooter(container, "Create booking");

    expect(h.onCreate).toHaveBeenCalledWith({
      calendarId: "cal-1",
      serviceId: "svc-cut",
      workerId: "w-irina",
      startEventId: "slot-1",
      name: "Irina Melnikova",
      phone: "+79210000000",
      reusePersonId: null,
      email: null,
    });
    expect(h.onCreated).toHaveBeenCalledTimes(1);
    expect(dialog(container).open).toBe(false);
  });

  it("submits an empty name and the candidate's own id for a reused client", async () => {
    const h = handlers({
      onSearchByPhone: vi.fn(() => Promise.resolve([candidate({ personId: "p1", bookingCount: 5 })])),
      onLookupNames: vi.fn(() => Promise.resolve([{ personId: "p1", displayName: "Anna Kovaleva" }])),
    });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);

    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");
    await interact(() => byText<HTMLButtonElement>(dialog(container), "button", "It's them")?.click());
    await clickFooter(container, "Next"); // client (read-only) -> service
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());
    await clickFooter(container, "Next");
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Irina Sokolova")?.click());
    await clickFooter(container, "Next");
    await interact(() => one<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button').click());
    await clickFooter(container, "Next");

    expect(dialog(container).textContent).toContain("Returning");

    await clickFooter(container, "Create booking");

    expect(h.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "", reusePersonId: "p1", phone: "+79210000000" }),
    );
  });

  it("keeps the previously picked slot when stepping back from Review and forward again", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);
    await walkToReview(container, h);

    await clickFooter(container, "Back");
    expect(dialog(container).textContent).toContain("Step 5 of 6");
    // The onLoadSlots call count must not have grown from stepping back - state, not a fresh fetch.
    const callsAfterBack = h.onLoadSlots.mock.calls.length;
    await clickFooter(container, "Next");

    expect(h.onLoadSlots.mock.calls.length).toBe(callsAfterBack);
    expect(dialog(container).textContent).toContain("Step 6 of 6");
  });

  it("names the one refusal it is taught - the slot was claimed under the operator - and keeps the dialog open", async () => {
    const h = handlers({ onCreate: vi.fn(() => Promise.reject(new CalendarApiError("booking.slot_unavailable", "server wording", 409))) });
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);
    await walkToReview(container, h);

    await clickFooter(container, "Create booking");

    expect(dialog(container).textContent).toContain("no longer available");
    expect(dialog(container).textContent).not.toContain("server wording");
    expect(dialog(container).open).toBe(true);
    expect(h.onCreated).not.toHaveBeenCalled();
  });

  it("sends a trimmed, non-empty email, and null when the field is left blank", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);
    await open(container);
    await typePhone(container, "+79210000000");
    await clickFooter(container, "Find client");
    await clickFooter(container, "Continue as new");

    const [nameInput, emailInput] = all(dialog(container), "input").filter(
      (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.type !== "date",
    );
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nameInput, "Irina Melnikova");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(emailInput, "  irina@example.com  ");
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickFooter(container, "Next");
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());
    await clickFooter(container, "Next");
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Irina Sokolova")?.click());
    await clickFooter(container, "Next");
    await interact(() => one<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button').click());
    await clickFooter(container, "Next");

    expect(dialog(container).textContent).toContain("irina@example.com");

    await clickFooter(container, "Create booking");

    expect(h.onCreate).toHaveBeenCalledWith(expect.objectContaining({ email: "irina@example.com" }));
  });
});

/**
 * `26-323` (design of record `26-321`): the first real user stalled on a "choose a master" step that
 * offered exactly one master, not realising she had to tap her own name. The service and worker steps
 * now each auto-select and skip themselves in that situation - covered here for the service step alone,
 * the worker step alone, both together, back-navigation past whichever were skipped, and confirmation
 * that a step with several real options is untouched.
 */
describe("skipping a step with exactly one option (26-323)", () => {
  const ONE_ACTIVE_SERVICE: ConfiguredService[] = [SERVICES[0]]; // svc-cut only - the archived and
  // second service are both dropped, so this fixture offers exactly one selectable service.

  // A single worker offering "svc-cut" - paired with the default (two-service) SERVICES fixture so the
  // service step itself still shows, isolating the worker-step skip from the service-step skip.
  const SOLO_WORKER: ConfiguredWorker[] = [{ workerId: "w-solo", displayName: "Solo Master", isActive: true, serviceIds: ["svc-cut"] }];
  const SOLO_CALENDARS: ConfiguredCalendar[] = [
    { calendarId: "cal-solo", name: "Main", timeZone: "UTC", isPublished: true, workerIds: ["w-solo"], workingHours: [] },
  ];

  it("one active service: auto-selects it and skips straight to the worker step", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h, { services: ONE_ACTIVE_SERVICE });
    await walkToClientStep(container, "Irina Melnikova");

    await clickFooter(container, "Next");

    // Landed directly on the worker step - the one-option service step never showed.
    expect(dialog(container).textContent).toContain("Step 4 of 6");
    expect(byText(dialog(container), "button", "Haircut · 60 min")).toBeNull();
    expect(dialog(container).textContent).toContain("Irina Sokolova");
    expect(dialog(container).textContent).toContain("Anna Orlova");

    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Irina Sokolova")?.click());
    await clickFooter(container, "Next");
    await interact(() => one<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button').click());
    await clickFooter(container, "Next");
    await clickFooter(container, "Create booking");

    // The auto-selected service made it all the way to the submitted booking.
    expect(h.onCreate).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "svc-cut", workerId: "w-irina" }));
  });

  it("one eligible worker for the chosen service: auto-selects it and skips straight to the slot step", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h, { workers: SOLO_WORKER, calendars: SOLO_CALENDARS });
    await walkToClientStep(container, "Irina Melnikova");
    await clickFooter(container, "Next");

    // Two active services, so the service step still shows.
    expect(dialog(container).textContent).toContain("Step 3 of 6");

    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());

    // Jumped straight to the slot step - "Solo Master" never had to be tapped, and no explicit "Next"
    // was needed on the service step either.
    expect(dialog(container).textContent).toContain("Step 5 of 6");
    expect(h.onLoadSlots).toHaveBeenCalledWith("w-solo", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.anything());

    await interact(() => one<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button').click());
    await clickFooter(container, "Next");
    await clickFooter(container, "Create booking");

    expect(h.onCreate).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "svc-cut", workerId: "w-solo" }));
  });

  it("back from the slot step returns to the service step when only the worker step was skipped", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h, { workers: SOLO_WORKER, calendars: SOLO_CALENDARS });
    await walkToClientStep(container, "Irina Melnikova");
    await clickFooter(container, "Next"); // client -> service
    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click()); // service -> slot, worker skipped

    expect(dialog(container).textContent).toContain("Step 5 of 6");

    await clickFooter(container, "Back");

    // Back to the service step, not the worker step it never actually saw.
    expect(dialog(container).textContent).toContain("Step 3 of 6");
    expect(byText(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")).not.toBeNull();
  });

  it("back from the slot step returns to the client step when both the service and worker steps were skipped", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h, {
      services: ONE_ACTIVE_SERVICE,
      workers: SOLO_WORKER,
      calendars: SOLO_CALENDARS,
    });
    await walkToClientStep(container, "Irina Melnikova");
    await clickFooter(container, "Next"); // client -> slot directly, both service and worker skipped

    expect(dialog(container).textContent).toContain("Step 5 of 6");

    await clickFooter(container, "Back");

    expect(dialog(container).textContent).toContain("Step 2 of 6");
  });

  it("several services and several eligible workers: both steps are still shown, unchanged", async () => {
    const h = handlers();
    const container = await mount([MANUAL_BOOKING_PERMISSION], h);
    await walkToClientStep(container, "Irina Melnikova");
    await clickFooter(container, "Next");

    expect(dialog(container).textContent).toContain("Step 3 of 6");
    expect(byText(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")).not.toBeNull();
    expect(byText(dialog(container), '[role="radiogroup"] button', "Coloring · 120 min")).not.toBeNull();

    await interact(() => byText<HTMLButtonElement>(dialog(container), '[role="radiogroup"] button', "Haircut · 60 min")?.click());

    // Still on the service step - two eligible workers for "svc-cut", so nothing auto-advances.
    expect(dialog(container).textContent).toContain("Step 3 of 6");

    await clickFooter(container, "Next");

    expect(dialog(container).textContent).toContain("Step 4 of 6");
    expect(byText(dialog(container), '[role="radiogroup"] button', "Irina Sokolova")).not.toBeNull();
    expect(byText(dialog(container), '[role="radiogroup"] button', "Anna Orlova")).not.toBeNull();
  });
});
