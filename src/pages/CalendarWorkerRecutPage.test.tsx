import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarWorkerRecutPage } from "./CalendarWorkerRecutPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";
import type { RecutBookingPreview, RecutDayPreview } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar/workers/:workerId/recut` - moved from `ago-calendar-console`'s own
 * `WorkerRecutPage.test.tsx`, adapted to this console's own harness.
 */
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

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const calendarApi = vi.hoisted(() => ({ previewRecutSchedule: vi.fn(), recutSchedule: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter initialEntries={["/calendar/workers/w1/recut"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/calendar/workers/:workerId/recut" element={<CalendarWorkerRecutPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function radioByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll("label")).find((l) => (l.textContent ?? "").includes(text));
  const input = label?.querySelector("input[type=radio]");
  if (!input) {
    throw new Error(`no radio labelled '${text}' found`);
  }
  return input as HTMLInputElement;
}

function day(overrides: Partial<RecutDayPreview> = {}): RecutDayPreview {
  return { localDate: "2026-05-05", availableSlotsToDelete: 0, bookings: [], ...overrides };
}

function booking(overrides: Partial<RecutBookingPreview> = {}): RecutBookingPreview {
  return {
    bookingId: "b1",
    startsAt: "2026-05-05T09:00:00Z",
    endsAt: "2026-05-05T09:45:00Z",
    status: "PendingConfirmation",
    serviceId: "s1",
    serviceName: "Haircut",
    customerId: "c1",
    customerDisplayName: null,
    phone: null,
    canDecide: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.recutSchedule.mockResolvedValue({ recutDays: ["2026-05-05"], skippedDays: [], slotsDeleted: 9, slotsInserted: 18, bookingsCancelled: 0 });
});

afterEach(async () => {
  await unmount();
});

describe("the re-cut schedule screen", () => {
  it("shows an affected day's slot count once previewed", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({ days: [day({ availableSlotsToDelete: 9 })], fingerprint: "fp-1" });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());

    expect(container.textContent).toContain("2026-05-05");
    expect(container.textContent).toMatch(/9 free slot/);
  });

  it("offers a cancel/keep control for a decidable booking, and shows name and phone when permitted", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({
      days: [day({ bookings: [booking({ customerDisplayName: "Dana", phone: "+79990000001" })] })],
      fingerprint: "fp-1",
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());

    expect(container.textContent).toContain("Dana");
    expect(container.textContent).toContain("+79990000001");
    expect(() => radioByLabel(container, "Cancel")).not.toThrow();
    expect(() => radioByLabel(container, "Keep")).not.toThrow();
  });

  it("shows 'hidden', not the name, when the server withheld contact data", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({
      days: [day({ bookings: [booking({ customerId: "c1", customerDisplayName: null, phone: null })] })],
      fingerprint: "fp-1",
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());

    const hiddenCount = (container.textContent?.match(/hidden/g) ?? []).length;
    expect(hiddenCount).toBe(2);
  });

  it("offers no control at all for a no-show, and says why", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({
      days: [day({ bookings: [booking({ status: "NoShow", canDecide: false })] })],
      fingerprint: "fp-1",
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());

    expect(container.textContent).toMatch(/cannot be cancelled/);
    expect(container.querySelector("input[type=radio]")).toBeNull();
  });

  it("keeps 'Review & confirm' disabled until every decidable booking has a decision", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({
      days: [day({ bookings: [booking({ bookingId: "b1" }), booking({ bookingId: "b2" })] })],
      fingerprint: "fp-1",
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());

    const confirmButton = byText<HTMLButtonElement>(container, "button", "Review & confirm");
    expect(confirmButton?.disabled).toBe(true);

    const cancelRadios = all(container, "label").filter((l) => (l.textContent ?? "").includes("Cancel")).map((l) => l.querySelector("input"));
    await interact(() => cancelRadios[0]?.click());
    expect(confirmButton?.disabled).toBe(true);

    await interact(() => cancelRadios[1]?.click());
    expect(confirmButton?.disabled).toBe(false);
  });

  it("names the counts before the destructive call, and only fires it on the second click", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({
      days: [day({ availableSlotsToDelete: 9, bookings: [booking({ bookingId: "b1" })] }), day({ localDate: "2026-05-06", availableSlotsToDelete: 18 })],
      fingerprint: "fp-1",
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());
    await interact(() => radioByLabel(container, "Cancel").click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Review & confirm")?.click());

    expect(container.textContent).toContain("Confirm re-cut");
    expect(calendarApi.recutSchedule).not.toHaveBeenCalled();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Confirm re-cut")?.click());

    expect(calendarApi.recutSchedule).toHaveBeenCalledTimes(1);
    const [token, workerId, body] = calendarApi.recutSchedule.mock.calls[0] as [string, string, { from: string; fingerprint: string; decisions: unknown }];
    expect(token).toBe("token");
    expect(workerId).toBe("w1");
    expect(typeof body.from).toBe("string");
    expect(body.fingerprint).toBe("fp-1");
    expect(body.decisions).toEqual([{ bookingId: "b1", decision: "Cancel" }]);
  });

  it("shows the result summary once the recut actually applies", async () => {
    calendarApi.previewRecutSchedule.mockResolvedValue({ days: [day()], fingerprint: "fp-1" });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Review & confirm")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Confirm re-cut")?.click());

    expect(container.textContent).toContain("Done");
    expect(container.textContent).toMatch(/1 day\(s\) re-cut/);
  });

  it("sends the operator back to a fresh preview, rather than retrying, when the booking set went stale", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.previewRecutSchedule.mockResolvedValue({ days: [day()], fingerprint: "fp-1" });
    calendarApi.recutSchedule.mockRejectedValue(
      new CalendarApiError("recut.stale", "The bookings in this range changed since the preview was generated.", 409),
    );

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Preview")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Review & confirm")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Confirm re-cut")?.click());

    expect(container.textContent).toMatch(/bookings in this range changed/);
    expect(container.textContent).not.toContain("Confirm re-cut");
  });
});
