import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarContactsPage } from "./CalendarContactsPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { Contact } from "../api/calendarApi.js";
import type { PersonProfile } from "../api/personsApi.js";

/**
 * `22-06`: `/calendar/contacts` - moved from `ago-calendar-console`'s own `ContactsPage.test.tsx`,
 * adapted to this console's own harness. `26-161`/`adr/0184`: the customer name and notes no longer
 * live on the calendar row - the name is display-merged from chat's Person registry (`personsApi.js`,
 * mocked here), and the `23-60` merge UI is gone entirely.
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
const calendarApi = vi.hoisted(() => ({
  getContacts: vi.fn(),
  revealCustomerPhone: vi.fn(),
}));
const personsApi = vi.hoisted(() => ({ getPersons: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});
vi.mock("../api/personsApi.js", () => personsApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <CalendarContactsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

/** `26-161`: a Person-registry profile the display-merge reads a name through, keyed on `personId`. */
function person(personId: string, displayName: string | null): PersonProfile {
  return { personId, displayName, channels: [], firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00" };
}

const contacts: Contact[] = [
  {
    personId: "c1", phone: "+79990000001", masked: false,
    noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
  },
  {
    personId: "c2", phone: "+79990000002", masked: false,
    noShowCount: 2, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-04-01T09:00:00+00:00", lastSeenAt: "2026-04-01T09:00:00+00:00",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getContacts.mockResolvedValue(contacts);
  // `26-161`: chat holds "Anna" for c1; c2 has no recorded name. The page reads both by id.
  personsApi.getPersons.mockResolvedValue([person("c1", "Anna"), person("c2", null)]);
});

afterEach(async () => {
  await unmount();
});

describe("the contacts report", () => {
  it("lists every contact's phone and the name read from chat's Person registry", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("+79990000001");
    expect(container.textContent).toContain("Anna");
    // `26-161`: the name is fetched by the contact's person id, not taken off the calendar row.
    expect(personsApi.getPersons).toHaveBeenCalledWith("token", ["c1", "c2"], expect.anything());
  });

  it("shows an honest placeholder for a person with no name recorded in chat, not a blank cell", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("+79990000002");
    expect(container.textContent).toContain("not recorded");
  });

  it("degrades to 'name not shown yet' when chat's Person API is unreachable, without failing the screen", async () => {
    personsApi.getPersons.mockRejectedValue(new Error("chat down"));

    const container = await render(page());

    // The booking data still renders - the phone is here - and the name column degrades rather than blanks.
    expect(container.textContent).toContain("+79990000001");
    expect(container.textContent).toContain("name not shown yet");
  });

  it("shows a no-show pill only for a customer with at least one no-show", async () => {
    const container = await render(page());

    // `26-269`: c2 has 2 no-shows - a pill naming the count, not a bare number.
    const pilledRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("+79990000002"));
    expect(pilledRow?.textContent).toContain("2 no-shows");

    // c1 has zero - the quiet default: no pill, and the word never appears on its row at all.
    const zeroRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("+79990000001"));
    expect(zeroRow?.textContent).not.toContain("no-show");
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getContacts.mockRejectedValue(new CalendarApiError("contacts.forbidden", "This operator does not hold 'customer:read' for this tenant.", 403));

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });

  it("shows the empty state when there are no contacts yet", async () => {
    calendarApi.getContacts.mockResolvedValue([]);

    const container = await render(page());

    expect(container.querySelector("table")).toBeNull();
  });
});

/** `23-30`/`23-12`: a masked phone gets a Reveal button, never the real number, until the server's
 * own reveal response arrives. `26-161`: keyed on the person id now. */
describe("revealing a masked phone (23-30)", () => {
  const maskedContact: Contact = {
    personId: "c3", phone: "+7999•••0003", masked: true,
    noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: null,
    firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
  };

  it("shows the masked value and a Reveal button, never the real number, before reveal", async () => {
    calendarApi.getContacts.mockResolvedValue([maskedContact]);
    personsApi.getPersons.mockResolvedValue([person("c3", "Petra")]);

    const container = await render(page());

    expect(container.textContent).toContain("+7999•••0003");
    expect(container.textContent).not.toContain("+79990000003");
    expect(byText(container, "button", "Reveal")).not.toBeNull();
  });

  it("replaces the masked row with the server's own unmasked response on Reveal", async () => {
    calendarApi.getContacts.mockResolvedValue([maskedContact]);
    personsApi.getPersons.mockResolvedValue([person("c3", "Petra")]);
    calendarApi.revealCustomerPhone.mockResolvedValue({ phone: "+79990000003" });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal")?.click());

    expect(calendarApi.revealCustomerPhone).toHaveBeenCalledWith("token", "c3", "ConsoleContacts");
    expect(container.textContent).toContain("+79990000003");
    expect(container.textContent).not.toContain("+7999•••0003");
    expect(byText(container, "button", "Reveal")).toBeNull();
  });

  it("does not offer a Reveal button when the row already carries the real value", async () => {
    calendarApi.getContacts.mockResolvedValue(contacts);

    const container = await render(page());

    expect(byText(container, "button", "Reveal")).toBeNull();
  });
});

/** `26-269`/`decisions.md` §5: the two full-sentence verification-badge columns are gone, replaced by
 * one warning glyph shown only in the single actionable state - neither an SMS code nor an operator's
 * "I called and it is them" is on file. The two underlying facts stay two facts on the wire
 * (`phoneVerifiedAt`/`phoneConfirmedByOperatorAt`, unchanged); this only asserts the collapsed
 * *row presentation* the redesign asks for. */
describe("the phone-status warning glyph (26-269)", () => {
  it("shows the warning glyph for a customer with neither fact on file", async () => {
    calendarApi.getContacts.mockResolvedValue(contacts); // c1, c2: both null/null

    const container = await render(page());

    const glyph = container.querySelector(".ago-phone-status-warning");
    expect(glyph).not.toBeNull();
    // The glyph itself is a bare "!" - the accessible name and hover hint live in the attributes,
    // not as visible text (`phoneStatusWarningGlyph`'s own doc comment).
    expect(glyph?.getAttribute("aria-label")).toBe("Phone not verified");
    expect(glyph?.getAttribute("title")).toBe("Phone not verified");
  });

  it("shows no glyph once the phone is verified by SMS code alone", async () => {
    calendarApi.getContacts.mockResolvedValue([
      {
        personId: "c4", phone: "+79990000004", masked: false,
        noShowCount: 0, phoneVerifiedAt: "2026-05-01T09:00:00+00:00", phoneConfirmedByOperatorAt: null,
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
      },
    ]);
    personsApi.getPersons.mockResolvedValue([person("c4", "Дана")]);

    const container = await render(page());

    expect(container.querySelector(".ago-phone-status-warning")).toBeNull();
  });

  it("shows no glyph once the phone is confirmed by the operator alone", async () => {
    calendarApi.getContacts.mockResolvedValue([
      {
        personId: "c5", phone: "+79990000005", masked: false,
        noShowCount: 0, phoneVerifiedAt: null, phoneConfirmedByOperatorAt: "2026-05-02T09:00:00+00:00",
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
      },
    ]);
    personsApi.getPersons.mockResolvedValue([person("c5", "Дана")]);

    const container = await render(page());

    expect(container.querySelector(".ago-phone-status-warning")).toBeNull();
  });

  it("shows no glyph when verified both ways", async () => {
    calendarApi.getContacts.mockResolvedValue([
      {
        personId: "c6", phone: "+79990000006", masked: false,
        noShowCount: 0, phoneVerifiedAt: "2026-05-01T09:00:00+00:00", phoneConfirmedByOperatorAt: "2026-05-02T09:00:00+00:00",
        firstSeenAt: "2026-03-01T09:00:00+00:00", lastSeenAt: "2026-05-01T09:00:00+00:00",
      },
    ]);
    personsApi.getPersons.mockResolvedValue([person("c6", "Дана")]);

    const container = await render(page());

    expect(container.querySelector(".ago-phone-status-warning")).toBeNull();
  });
});

/** `26-269`/`26-269-clients-redesign.md` §1.5.3: client-side search over the already-loaded,
 * already name-merged list, by name or by phone, live as the operator types. No new backend read. */
describe("the client-side search field (26-269)", () => {
  /** `PhoneInput.test.tsx`'s own idiom: React tracks the last value it set on the DOM node, so
   * assigning `input.value` directly and dispatching a plain `input` event is a no-op - the native
   * setter has to be called first to bypass that tracker, the same way a real keystroke would. */
  function typeInto(input: HTMLInputElement, value: string): void {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("filters the list by name as the operator types", async () => {
    const container = await render(page());
    expect(container.textContent).toContain("Anna");

    const search = one<HTMLInputElement>(container, "input[type='search']");
    await interact(() => typeInto(search, "anna"));

    expect(container.textContent).toContain("Anna");
    expect(container.textContent).not.toContain("+79990000002");
  });

  it("filters the list by phone as the operator types", async () => {
    const container = await render(page());

    const search = one<HTMLInputElement>(container, "input[type='search']");
    await interact(() => typeInto(search, "0000002"));

    expect(container.textContent).toContain("+79990000002");
    expect(container.textContent).not.toContain("+79990000001");
  });

  it("shows an explicit no-results state, distinct from the no-contacts-at-all state, and clears back to the full list", async () => {
    const container = await render(page());

    const search = one<HTMLInputElement>(container, "input[type='search']");
    await interact(() => typeInto(search, "no such customer"));

    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("No matches");
    expect(container.textContent).toContain("no such customer");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Clear search")?.click());

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.textContent).toContain("+79990000001");
    expect(container.textContent).toContain("+79990000002");
  });
});
