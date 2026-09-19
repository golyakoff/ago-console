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
  changeOperatorRole: vi.fn(),
  // `25-73`: the invite-list panel's own read, fetched alongside the team/summary on every mount and
  // reload - resolved to "no invites" by default so the existing assertions below, none of which are
  // about this new panel, see it render nothing extra.
  listOperatorInvites: vi.fn().mockResolvedValue({ invites: [] }),
  revokeOperatorInvite: vi.fn(),
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
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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

/** `25-73`: React tracks the DOM value it last wrote, so assigning `.value` directly is swallowed as
 * "no change" and no `onChange` fires - going through the *prototype's* setter is what makes the
 * synthetic change real, the identical workaround `BillingPage.test.tsx`'s own `setInputValue`
 * already establishes for the same reason. */
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

function fillInviteEmail(container: HTMLElement, email: string): void {
  const input = container.querySelector<HTMLInputElement>('input[type="email"]');
  if (!input) {
    throw new Error("no email input found in the invite dialog");
  }
  INPUT_VALUE_DESCRIPTOR?.set?.call(input, email);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** `25-170`: `adminLimit` defaults to 5 - high enough that no test in this file which cares only about
 * the Operator role's own limit (`seatLimit`) accidentally trips the Admin role's own over-limit
 * banner or pre-invite refusal, the same "give the other axis plenty of room" shape a two-independent-
 * limits model needs wherever a test exercises only one of them. */
function twoOperatorsAndASummary(seatLimit: number, adminLimit = 5) {
  // Both `Operator`-role rows, one with a toggled-off seat - this is what `heldSeats` (1) and the
  // pre-`25-170` seat-row-count prediction (2, `activeOperatorCount`) used to genuinely diverge on,
  // before the unified `OperatorRoleSeatCapacity` replaced that row-counting predicate with this
  // screen's own current one (`summary.roles`'s own held-seat count, matched exactly).
  operatorTeamApi.fetchOperatorTeam.mockResolvedValue({
    operators: [
      {
        operatorId: NAMED_ID, displayName: "Ada Lovelace", email: "ada@example.invalid",
        roles: [{ roleName: "Operator", holdsSeat: true }],
      },
      {
        operatorId: UNNAMED_ID, displayName: null, email: null,
        roles: [{ roleName: "Operator", holdsSeat: false }],
      },
    ],
  });
  operatorTeamApi.fetchSeatAssignmentSummary.mockResolvedValue({
    roles: [
      { roleName: "Operator", heldSeats: 1, limit: seatLimit, overLimit: 1 > seatLimit },
      { roleName: "Admin", heldSeats: 0, limit: adminLimit, overLimit: false },
    ],
  });
}

let writeTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [OPERATORS_TEAM_PERMISSION], siteId: SITE_ID });
  twoOperatorsAndASummary(2);
  // `23-70`: jsdom does not implement the Clipboard API - the same stand-in
  // `InstallSnippetPage.test.tsx`'s own `beforeEach` already uses, for the identical reason.
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
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

  // `23-72`: the role column - an operator holding "Admin" shows the Administrator badge, one holding
  // only "Operator" shows the Operator badge. Its own dedicated seed (not `twoOperatorsAndASummary`,
  // which deliberately keeps both rows "Operator" for the seat-count tests below).
  it("shows the administrator badge for an Admin-role operator, and the operator badge otherwise", async () => {
    operatorTeamApi.fetchOperatorTeam.mockResolvedValue({
      operators: [
        {
          operatorId: NAMED_ID, displayName: "Ada Lovelace", email: "ada@example.invalid",
          roles: [{ roleName: "Operator", holdsSeat: true }],
        },
        {
          operatorId: UNNAMED_ID, displayName: null, email: null,
          roles: [{ roleName: "Admin", holdsSeat: false }],
        },
      ],
    });
    operatorTeamApi.fetchSeatAssignmentSummary.mockResolvedValue({
      roles: [
        { roleName: "Operator", heldSeats: 1, limit: 2, overLimit: false },
        { roleName: "Admin", heldSeats: 0, limit: 5, overLimit: false },
      ],
    });

    const container = await render(page());

    expect(container.textContent).toContain("Administrator");
    expect(container.textContent).toContain("Operator");
  });

  it("shows the over-seats banner when the summary says overSeats, with a real link to Billing", async () => {
    twoOperatorsAndASummary(0);

    const container = await render(page());

    expect(container.textContent).toContain("Over your seat limit");
    // `23-107`: a link, not just the word "Billing" in a sentence a tenant has to go find in the nav.
    const link = byText<HTMLAnchorElement>(container, "a", "Billing");
    expect(link?.getAttribute("href")).toBe("/account/billing");
  });

  it("never shows the over-seats banner when the site is within its limit", async () => {
    const container = await render(page());

    expect(container.textContent).not.toContain("Over your seat limit");
  });

  /** `25-170`: this item's own headline generalization, proven directly - the Admin role gets the
   * identical over-limit banner the Operator role always had, on its own independent limit, shown
   * alongside (not instead of) the Operator role's own banner when both happen to be over at once. */
  it("shows a separate over-limit banner for the Admin role, independently of the Operator role", async () => {
    operatorTeamApi.fetchOperatorTeam.mockResolvedValue({
      operators: [
        {
          operatorId: NAMED_ID, displayName: "Ada Lovelace", email: "ada@example.invalid",
          roles: [{ roleName: "Operator", holdsSeat: true }, { roleName: "Admin", holdsSeat: true }],
        },
      ],
    });
    operatorTeamApi.fetchSeatAssignmentSummary.mockResolvedValue({
      roles: [
        { roleName: "Operator", heldSeats: 1, limit: 5, overLimit: false },
        { roleName: "Admin", heldSeats: 2, limit: 1, overLimit: true },
      ],
    });

    const container = await render(page());

    // Exactly one over-limit banner - the Operator role is within its own limit, so only the Admin
    // role's own over-limit condition renders, not a second, redundant one.
    const banners = all(container, ".ago-alert--info").filter((el) => el.textContent?.includes("Over your seat limit"));
    expect(banners).toHaveLength(1);
    expect(banners[0]?.textContent).toContain("Administrator");
  });

  /** `25-170`: the seats-summary line now renders once per seeded role - both are always visible,
   * not only the Operator role's own figure the pre-`25-170` single line showed. */
  it("shows the seats-occupied summary for both the Operator and Admin roles", async () => {
    const container = await render(page());

    // `twoOperatorsAndASummary`'s own default seed: Operator 1/2, Admin 0/5.
    expect(container.textContent).toContain("1/2");
    expect(container.textContent).toContain("0/5");
  });
});

describe("the pre-invite seat check", () => {
  it("refuses before ever calling createOperatorInvite, when the Operator role's own held-seat count is at its limit", async () => {
    // `25-170`: one HELD Operator seat already (`twoOperatorsAndASummary`'s own fixed seed - Ada
    // holds hers, the unnamed row does not), limit 1 - at capacity. Before this item this test used
    // limit 2 against a *row count* of two operators, matching the retired `operatorCount >= seatLimit`
    // predicate; the real check is now `OperatorRoleSeatCapacity`'s own `heldSeats >= limit`, which
    // this fixture's one held seat (not two active rows) is what actually has to meet the limit.
    twoOperatorsAndASummary(1);

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());

    expect(container.textContent).toContain("You are at your seat limit");
    expect(operatorTeamApi.createOperatorInvite).not.toHaveBeenCalled();
    // `23-107`: same fix as the over-seats banner - a real link to Billing, not just its name.
    const link = byText<HTMLAnchorElement>(container, "a", "Billing");
    expect(link?.getAttribute("href")).toBe("/account/billing");
  });

  it("sends the invite and shows a link built from the code, when there is room", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.createOperatorInvite.mockResolvedValue({
      operatorInviteId: "invite-1",
      code: "abc123",
      expiresAt: "2026-09-10T00:00:00Z",
      sendFailed: false,
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());
    // `25-18`: the dialog opens on the Operator default, so the cost line names that seat specifically.
    expect(container.textContent).toContain("This will use one more Operator seat");

    // `25-73`: required on the form now - filled before submitting, the same way the role picker
    // below is exercised in its own describe block.
    await interact(() => fillInviteEmail(container, "colleague@example.com"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Send invite").click());

    // `23-72`: the invite dialog defaults to Operator, so an ordinary invite (no role picked)
    // still asks the server for that role explicitly - there is no "no role" state on the wire.
    // `25-73`: and now also the email this invite is addressed to.
    expect(operatorTeamApi.createOperatorInvite).toHaveBeenCalledWith("token", SITE_ID, "Operator", "colleague@example.com");
    // `23-70`: a URL the colleague can be sent, not a bare token - "the invitation is a URL... that
    // can be pasted into whatever the tenant already uses" (this item's own backlog text).
    expect(container.textContent).toContain("/invite/abc123");
    // The expiry is visible on the link's own screen, not only implied by it having been created.
    expect(container.textContent).toContain("Expires");
  });

  it("copies the invite link to the clipboard and confirms it, and says the link is shown only once", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.createOperatorInvite.mockResolvedValue({
      operatorInviteId: "invite-1",
      code: "abc123",
      expiresAt: "2026-09-10T00:00:00Z",
      sendFailed: false,
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());
    await interact(() => fillInviteEmail(container, "colleague@example.com"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Send invite").click());

    // `23-70`'s own Done-when: "the screen says what to do with it and that it will not be shown
    // again" - before the copy button is even clicked. `25-73`: the panel now leads with "sent to
    // <email>" - this is the fallback-link caveat right underneath it, not the whole message.
    expect(container.textContent).toContain("colleague@example.com");
    expect(container.textContent).toContain("shown here only once");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Copy link").click());

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/invite/abc123"));
    expect(container.textContent).toContain("Copied to clipboard.");
  });
});

describe("the invite dialog's role picker", () => {
  // `23-72`: the API already took `roleName` at invite creation (`13-01`); this item adds the choice
  // to the dialog. `25-170`: the dialog opens on the Operator default - when that role's own held-
  // seat count already meets its own limit, no picker is offered at all, the same "Close only" branch
  // this page renders regardless of which role happens to be selected. The two roles are genuinely
  // independent pools now (`Site.AdminLimit` is real, `25-170`'s own design) - this test proves the
  // *default* role's own refusal is honest, not that every role would refuse (a picked-then-switched
  // Admin role with room of its own is exactly what `OperatorRoleSeatReconciler`'s own per-role
  // capacity is for; that path is `sends an Admin-role invite when there is room` below, on a
  // fixture with actual Operator-role room to open the picker in the first place).
  it("offers no role picker while the default (Operator) role is already at its own limit", async () => {
    twoOperatorsAndASummary(1);

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());
    expect(container.textContent).toContain("You are at your seat limit");

    const roleSelect = container.querySelector("select");
    expect(roleSelect).toBeNull();
    expect(operatorTeamApi.createOperatorInvite).not.toHaveBeenCalled();
  });

  it("sends an Admin-role invite when there is room", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.createOperatorInvite.mockResolvedValue({
      operatorInviteId: "invite-2",
      code: "def456",
      expiresAt: "2026-09-10T00:00:00Z",
      sendFailed: false,
    });

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());
    await interact(() => fillInviteEmail(container, "admin-invite@example.com"));

    const roleSelect = container.querySelector("select");
    await interact(() => {
      if (roleSelect) {
        roleSelect.value = "Admin";
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await interact(() => byText<HTMLButtonElement>(container, "button", "Send invite").click());
    expect(operatorTeamApi.createOperatorInvite).toHaveBeenCalledWith("token", SITE_ID, "Admin", "admin-invite@example.com");
  });

  /**
   * `25-18`: the seat-cost line names which role it is spending, and reacts live to the picker -
   * not fixed at the values the dialog opened with. Exercises both roles in one test, on the same
   * open dialog, so a message that only differed because the dialog was re-opened could not pass by
   * accident.
   */
  it("names the role being invited in the cost line, and updates it live as the picker changes", async () => {
    twoOperatorsAndASummary(5);

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Invite a colleague").click());

    // Opens on the Operator default (`23-72`'s own `inviteRoleName` initial state).
    expect(container.textContent).toContain("This will use one more Operator seat");
    expect(container.textContent).not.toContain("This will use one more Administrator seat");

    const roleSelect = container.querySelector("select");
    await interact(() => {
      if (roleSelect) {
        roleSelect.value = "Admin";
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(container.textContent).toContain("This will use one more Administrator seat");
    expect(container.textContent).not.toContain("This will use one more Operator seat");

    await interact(() => {
      if (roleSelect) {
        roleSelect.value = "Operator";
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(container.textContent).toContain("This will use one more Operator seat");
  });
});

describe("row actions", () => {
  it("changes a colleague's role, after confirming, and reloads the team", async () => {
    operatorTeamApi.changeOperatorRole.mockResolvedValue(undefined);

    const container = await render(page());
    // Ada holds only "Operator" (twoOperatorsAndASummary's own seed) - the row action offered is
    // "Make administrator".
    await interact(() =>
      byText<HTMLButtonElement>(container, "button", "Make administrator").click(),
    );
    expect(container.textContent).toContain("Ada Lovelace");
    expect(operatorTeamApi.changeOperatorRole).not.toHaveBeenCalled();

    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Change role");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(operatorTeamApi.changeOperatorRole).toHaveBeenCalledWith("token", SITE_ID, NAMED_ID, "Admin");
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledTimes(2);
  });
});

describe("row actions (seat and removal)", () => {
  it("toggles a seat and reloads the team", async () => {
    operatorTeamApi.toggleOperatorSeat.mockResolvedValue(undefined);

    const container = await render(page());
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledTimes(1);

    // `25-170`: role-qualified now - "Revoke Operator seat", since a row can show one toggle per role.
    await interact(() =>
      all(container, "button")
        .find((b) => b.textContent === "Revoke Operator seat")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(operatorTeamApi.toggleOperatorSeat).toHaveBeenCalledWith("token", SITE_ID, NAMED_ID, "Operator", false);
    expect(operatorTeamApi.fetchOperatorTeam).toHaveBeenCalledTimes(2);
  });

  /** `25-170`: the item's own headline generalization - the Admin role gets the identical manual
   * seat toggle the Operator role already had, proven with a dedicated Admin-role-holding row (not
   * `twoOperatorsAndASummary`'s own Operator-only seed). */
  it("toggles an Admin-role seat, naming the Admin role on the wire call", async () => {
    operatorTeamApi.fetchOperatorTeam.mockResolvedValue({
      operators: [
        {
          operatorId: NAMED_ID, displayName: "Ada Lovelace", email: "ada@example.invalid",
          roles: [{ roleName: "Operator", holdsSeat: true }, { roleName: "Admin", holdsSeat: true }],
        },
      ],
    });
    operatorTeamApi.fetchSeatAssignmentSummary.mockResolvedValue({
      roles: [
        { roleName: "Operator", heldSeats: 1, limit: 2, overLimit: false },
        { roleName: "Admin", heldSeats: 1, limit: 5, overLimit: false },
      ],
    });
    operatorTeamApi.toggleOperatorSeat.mockResolvedValue(undefined);

    const container = await render(page());

    await interact(() =>
      all(container, "button")
        .find((b) => b.textContent === "Revoke Administrator seat")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(operatorTeamApi.toggleOperatorSeat).toHaveBeenCalledWith("token", SITE_ID, NAMED_ID, "Admin", false);
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

/** `25-73`'s own point 7 and its own Done-when: "the invite list... renders under the operator table
 * only when at least one invite exists for the site, and revoking before acceptance is proven to
 * actually block a later redemption attempt with the stated message." This describe block is the
 * console-side half of that proof - that the panel renders (or does not) correctly, and that the
 * revoke button calls the real API and reloads the list; the server-side half (that a revoked
 * invite's own redemption attempt genuinely returns `OperatorInvite.Revoked`) is proven in `ago-chat`
 * (`RedeemOperatorInviteHandlerTests`/`OperatorInviteTests`/`Ago.Chat.Integration.Tests`), and the
 * message itself rendering is `RedeemInvitePage.test.tsx`'s own new test above. */
describe("the invite list", () => {
  it("renders nothing when no invite exists for the site", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.listOperatorInvites.mockResolvedValue({ invites: [] });

    const container = await render(page());

    expect(container.textContent).not.toContain("Invites");
  });

  /** Fails-before: rendering the panel unconditionally (dropping the `invites.length > 0` guard)
   * makes the test right above this one fail - "Invites" would appear even with an empty list. */
  it("renders every column, with the SMTP error code for a failed send, once an invite exists", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.listOperatorInvites.mockResolvedValue({
      invites: [
        {
          operatorInviteId: "invite-a",
          email: "sent@example.com",
          createdAt: "2026-09-10T00:00:00Z",
          expiresAt: "2026-09-17T00:00:00Z",
          status: "Sent",
          smtpErrorCode: null,
        },
        {
          operatorInviteId: "invite-b",
          email: "failed@example.com",
          createdAt: "2026-09-11T00:00:00Z",
          expiresAt: "2026-09-18T00:00:00Z",
          status: "SendFailed",
          smtpErrorCode: "550",
        },
        {
          operatorInviteId: "invite-c",
          email: "gone@example.com",
          createdAt: "2026-09-08T00:00:00Z",
          expiresAt: "2026-09-15T00:00:00Z",
          status: "Revoked",
          smtpErrorCode: null,
        },
      ],
    });

    const container = await render(page());

    expect(container.textContent).toContain("Invites");
    expect(container.textContent).toContain("sent@example.com");
    expect(container.textContent).toContain("failed@example.com");
    // This item's own stated wording for the failure case, minus the Russian-only literal text (that
    // exact string is asserted in `preSessionLocale.test.tsx`/`ru.ts`'s own review, not here - this
    // file mounts the English strings, `OperatorsTeamPage.test.tsx`'s own established shape).
    expect(container.textContent).toContain("550");
    expect(container.textContent).toContain("gone@example.com");

    // Only the still-live "Sent"/"SendFailed" rows offer "Revoke" - not the already-revoked one, and
    // not the (always-rendered, initially closed) confirmation dialog's own same-labelled button.
    const revokeButtons = all(container, "button:not(dialog button)").filter((b) => b.textContent === "Revoke");
    expect(revokeButtons).toHaveLength(2); // "Sent" and "SendFailed" rows, not "Revoked"
  });

  it("revokes an invite, after confirming, and reloads the list", async () => {
    twoOperatorsAndASummary(5);
    operatorTeamApi.listOperatorInvites.mockResolvedValueOnce({
      invites: [
        {
          operatorInviteId: "invite-a",
          email: "sent@example.com",
          createdAt: "2026-09-10T00:00:00Z",
          expiresAt: "2026-09-17T00:00:00Z",
          status: "Sent",
          smtpErrorCode: null,
        },
      ],
    });
    operatorTeamApi.revokeOperatorInvite.mockResolvedValue(undefined);

    const container = await render(page());
    expect(operatorTeamApi.listOperatorInvites).toHaveBeenCalledTimes(1);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Revoke").click());

    // The confirmation names the real consequence, the same "before, not after" bar
    // `RemoveOperatorButton`'s own confirmation already holds itself to.
    expect(container.textContent).toContain("sent@example.com");
    expect(operatorTeamApi.revokeOperatorInvite).not.toHaveBeenCalled();

    operatorTeamApi.listOperatorInvites.mockResolvedValue({ invites: [] });
    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Revoke");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(operatorTeamApi.revokeOperatorInvite).toHaveBeenCalledWith("token", SITE_ID, "invite-a");
    expect(operatorTeamApi.listOperatorInvites).toHaveBeenCalledTimes(2);
  });
});
