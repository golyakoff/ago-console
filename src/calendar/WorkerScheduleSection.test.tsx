import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { WorkerScheduleSection } from "./WorkerScheduleSection.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { WorkerSchedule } from "../api/calendarApi.js";

/**
 * `22-06`: moved from `ago-calendar-console`'s own `WorkerScheduleSection.test.tsx`, adapted to this
 * console's own harness. `useStrings()` needs no provider here - `StringsContext`'s own default is
 * the console's built-in English (`StringsContext.tsx`'s own doc comment), which is exactly what this
 * component's real callers (`WorkerCard`, mounted inside the operator layout) already get before an
 * active tenant's own locale resolves.
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

const calendarApi = vi.hoisted(() => ({ getWorkerSchedule: vi.fn(), saveWorkerSchedule: vi.fn() }));

vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});

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
    <MemoryRouter>
      <Signed>
        <WorkerScheduleSection workerId="w1" />
      </Signed>
    </MemoryRouter>
  );
}

function fieldByLabel<T extends HTMLElement>(container: HTMLElement, label: string): T {
  const labelEl = byText<HTMLLabelElement>(container, ".ago-field__label", label);
  if (labelEl === null) {
    throw new Error(`no '${label}' field label found`);
  }
  const id = labelEl.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (field === null) {
    throw new Error(`'${label}' field has no control with id='${id}'`);
  }
  return field as T;
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

const weekly: WorkerSchedule = {
  scheduleId: "sched-1",
  workerId: "w1",
  kind: "Weekly",
  cycleAnchor: null,
  cycleWorkingDays: null,
  cycleRestDays: null,
  cycleStartsAt: null,
  cycleEndsAt: null,
  slotMinutes: 45,
  bufferMinutes: 10,
  horizonDays: 30,
  materializeFrom: "2026-03-02",
  createdAt: "2026-03-02T09:00:00Z",
  updatedAt: "2026-03-02T09:00:00Z",
  buffersCountTowardServiceDuration: true,
};

beforeEach(async () => {
  vi.clearAllMocks();
  const { CalendarApiError } = await import("../api/calendarApi.js");
  calendarApi.getWorkerSchedule.mockRejectedValue(new CalendarApiError("configuration.no_schedule", "Worker w1 has no schedule yet.", 404));
  calendarApi.saveWorkerSchedule.mockImplementation((_token: string, _workerId: string, body: Record<string, unknown>) =>
    Promise.resolve({ ...weekly, ...body, scheduleId: "sched-1", workerId: "w1" }),
  );
});

afterEach(async () => {
  await unmount();
});

describe("the worker schedule section", () => {
  it("shows a 'no schedule yet' state for a worker who has none", async () => {
    const container = await render(page());

    expect(container.textContent).toMatch(/materialises nothing until one is saved/);
    expect(byText<HTMLButtonElement>(container, "button", "Create schedule")).not.toBeNull();
  });

  it("prefills the form from an existing schedule", async () => {
    calendarApi.getWorkerSchedule.mockResolvedValue(weekly);

    const container = await render(page());

    expect(byText<HTMLButtonElement>(container, "button", "Save schedule")).not.toBeNull();
    expect(fieldByLabel<HTMLInputElement>(container, "Slot length (minutes)").value).toBe("45");
    expect(fieldByLabel<HTMLInputElement>(container, "Buffer between slots (minutes)").value).toBe("10");
  });

  it("creates a weekly schedule with the numbers a human typed", async () => {
    const container = await render(page());

    await interact(() => setValue(fieldByLabel(container, "Slot length (minutes)"), "30"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Create schedule")?.click());

    expect(calendarApi.saveWorkerSchedule).toHaveBeenCalledWith(
      "token",
      "w1",
      expect.objectContaining({ kind: "Weekly", cycleAnchor: null, cycleWorkingDays: null, cycleRestDays: null, cycleStartsAt: null, cycleEndsAt: null, slotMinutes: 30 }),
    );
  });

  it("switching to Cycle reveals the cycle fields and sends them, not the weekly ones", async () => {
    const container = await render(page());

    await interact(() => setValue(fieldByLabel(container, "Template"), "Cycle"));
    expect(() => fieldByLabel(container, "Working days")).not.toThrow();

    await interact(() => setValue(fieldByLabel(container, "Working days"), "1"));
    await interact(() => setValue(fieldByLabel(container, "Rest days"), "3"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Create schedule")?.click());

    expect(calendarApi.saveWorkerSchedule).toHaveBeenCalledWith("token", "w1", expect.objectContaining({ kind: "Cycle", cycleWorkingDays: 1, cycleRestDays: 3 }));
  });

  it("warns before a save that would switch a cycle schedule back to weekly", async () => {
    calendarApi.getWorkerSchedule.mockResolvedValue({
      ...weekly,
      kind: "Cycle",
      cycleAnchor: "2026-03-02",
      cycleWorkingDays: 2,
      cycleRestDays: 2,
      cycleStartsAt: "09:00",
      cycleEndsAt: "18:00",
    });

    const container = await render(page());
    expect(byText<HTMLButtonElement>(container, "button", "Save schedule")).not.toBeNull();

    await interact(() => setValue(fieldByLabel(container, "Template"), "Weekly"));

    expect(container.textContent).toMatch(/clears the cycle settings/);
  });

  it("defaults the buffers-count toggle to checked, matching the aggregate's own default", async () => {
    const container = await render(page());

    expect(one<HTMLInputElement>(container, "input[type=checkbox]").checked).toBe(true);
  });

  it("shows the 70/30/10 arithmetic note, both ways, for the item's own numbers", async () => {
    const container = await render(page());

    await interact(() => setValue(fieldByLabel(container, "Slot length (minutes)"), "30"));
    await interact(() => setValue(fieldByLabel(container, "Buffer between slots (minutes)"), "10"));

    expect(container.textContent).toMatch(/a 70-minute service takes 2 slots, 12:00–13:10/);

    await interact(() => one<HTMLInputElement>(container, "input[type=checkbox]").click());

    expect(container.textContent).toMatch(/a 70-minute service takes 3 slots, 12:00–13:50/);
  });

  it("sends the buffers-count toggle's own value on save", async () => {
    const container = await render(page());

    await interact(() => one<HTMLInputElement>(container, "input[type=checkbox]").click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Create schedule")?.click());

    expect(calendarApi.saveWorkerSchedule).toHaveBeenCalledWith("token", "w1", expect.objectContaining({ buffersCountTowardServiceDuration: false }));
  });

  it("shows the server's own refusal, such as a horizon above the cap", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.saveWorkerSchedule.mockRejectedValue(new CalendarApiError("configuration.invalid", "A horizon above 180 days is refused.", 400));

    const container = await render(page());

    await interact(() => setValue(fieldByLabel(container, "Horizon (days ahead kept generated)"), "999"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Create schedule")?.click());

    expect(container.textContent).toContain("A horizon above 180 days is refused.");
  });
});
