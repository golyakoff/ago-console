import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OperatorsTeamPage, OPERATORS_TEAM_PERMISSION } from "./OperatorsTeamPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `23-22`: `/settings/operators`. Modeled on `AccountDeletionPage.test.tsx`/`BillingPage.test.tsx` for
 * the permission-gated-page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me` faked) -
 * plus this item's own new parts: the team list renders real rows (named and unnamed alike), the
 * pre-invite check refuses before ever calling `createOperatorInvite`, and a row action reloads both
 * the list and the seat summary rather than only removing itself optimistically.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const operatorTeamApi = vi.hoisted(() => ({
  fetchOperatorTeam: vi.fn(),
  fetchSeatAssignmentSummary: vi.fn(),
  createOperatorInvite: vi.fn(),
  toggleOperatorSeat: vi.fn(),
  removeOperator: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/operatorTeamApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorTeamApi.js")>("../api/operatorTeamApi.js");
  return { ...actual, ...operatorTeamApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NAMED_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const UNNAMED_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

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

/** Wrapped in a `MemoryRouter` - the permission-refusal branch (`AccessRefusal`) renders a
 * `<Link to="/">`, which throws outside a router context, the same reason `AccountDeletionPage.test.tsx`'s
 * own `page()` helper does this. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <OperatorsTeamPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function twoOperatorsAndASummary(seatLimit: number) {
  operatorTeamApi.fetchOperatorTeam.mockResolvedValue({
    operators: [
      { operatorId: NAMED_ID, displayName: "Ada Lovelace", email: "ada@example.invalid", holdsSeat: true },
      { operatorId: UNNAMED_ID, displayName: null, email: null, holdsSeat: false },
    ],
  });
  operatorTeamApi.fetchSeatAssignmentSummary.mockResolvedValue({ heldSeats: 1, seatLimit, overSeats: 1 > seatLimit });
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [OPERATORS_TEAM_PERMISSION], siteId: SITE_ID });
  twoOperatorsAndASummary(2);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:manage_operators, and never calls fetchOperatorTeam", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to manage this site's team.");
    expect(operatorTeamApi.fetchOperatorTeam).not.toHaveBeenCalled();
  });

  it("offers it, and loads the team, to an operator holding site:manage_operators", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Ada Lovelace");
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledWith("token", SITE_ID);
    expect(operatorTeamApi.fetchSeatAssignmentSummary).toHaveBeenCalledWith("token", SITE_ID);
  });
});

describe("the team list", () => {
  it("renders a real name and email for a named operator, and the id fallback for one with neither", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Ada Lovelace");
    expect(container.textContent).toContain("ada@example.invalid");
    // The unnamed row - `UNNAMED_ID.slice(0, 8)` is "cccccccc".
    expect(container.textContent).toContain("cccccccc");
  });

  it("shows the seat badge for a holder and the no-seat badge for one who does not", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Holds a seat");
    expect(container.textContent).toContain("No seat");
  });

  it("shows the over-seats banner when the summary says overSeats", async () => {
    twoOperatorsAndASummary(0);

    const container = await render(page());

    expect(container.textContent).toContain("Over your seat limit");
  });

  it("never shows the over-seats banner when the site is within its limit", async () => {
    const container = await render(page());

    expect(container.textContent).not.toContain("Over your seat limit");
  });
});

describe("the pre-invite seat check", () => {
  it("refuses before ever calling createOperatorInvite, when the team list's own count is at the seat limit", async () => {
    // Two active operators already (named + unnamed), seatLimit 2 - at limit.
    twoOperatorsAndASummary(2);

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());

    expect(container.textContent).toContain("You are at your seat limit");
    expect(operatorTeamApi.createOperatorInvite).not.toHaveBeenCalled();
  });

  it("sends the invite and shows the code, when there is room", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.createOperatorInvite.mockResolvedValue({
      operatorInviteId: "invite-1",
      code: "abc123",
      expiresAt: "2026-09-10T00:00:00Z",
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());
    expect(container.textContent).toContain("This will use one more of your seats");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Send invite").click());

    expect(operatorTeamApi.createOperatorInvite).toHaveBeenCalledWith("token", SITE_ID);
    expect(container.textContent).toContain("abc123");
  });
});

describe("row actions", () => {
  it("toggles a seat and reloads the team", async () => {
    operatorTeamApi.toggleOperatorSeat.mockResolvedValue(undefined);

    const container = await render(page());
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledTimes(1);

    await interact(() =>
      all(container, "button")
        .find((b) => b.textContent === "Revoke seat")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(operatorTeamApi.toggleOperatorSeat).toHaveBeenCalledWith("token", SITE_ID, NAMED_ID, false);
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledTimes(2);
  });

  it("removes an operator, after confirming, and reloads the team", async () => {
    operatorTeamApi.removeOperator.mockResolvedValue(undefined);

    const container = await render(page());
    const removeButtons = all(container, "button").filter((b) => b.textContent === "Remove");
    await interact(() => removeButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // The confirmation names the real consequence.
    expect(container.textContent).toContain("released back to the waiting queue");
    expect(operatorTeamApi.removeOperator).not.toHaveBeenCalled();

    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Remove");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(operatorTeamApi.removeOperator).toHaveBeenCalledWith("token", SITE_ID, NAMED_ID);
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledTimes(2);
  });
});
