import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProblemError } from "../api/problemDetails.js";
import { InvitePreviewPage } from "./InvitePreviewPage.js";
import { consumePendingInviteCode } from "../auth/pendingInviteCode.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `23-70`: the landing page a colleague reaches by opening `/invite/{code}` before signing in at all -
 * unauthenticated on purpose (no `AuthContext.Provider`/`PermissionsProvider` anywhere in `app()`
 * below, unlike every other page test in this directory), the same "renders outside every provider"
 * property `PolicyPage`/`RedeemInvitePage` already have. What is worth testing: the three states one
 * `200` response can carry (`Valid`/`Expired`/`Redeemed`, this item's own trap: "not 404 and not
 * throw"), the genuinely-wrong-code case rendering the same way rather than an unhandled error, and
 * that "Continue" hands the code to `/redeem-invite` through `sessionStorage` rather than losing it.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorInvitesApi = vi.hoisted(() => ({ previewOperatorInvite: vi.fn() }));
vi.mock("../api/operatorInvitesApi.js", () => operatorInvitesApi);

function app(initialPath = "/invite/abc123"): ReactNode {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/invite/:code" element={<InvitePreviewPage />} />
        <Route path="/redeem-invite" element={<p>redeem screen</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(async () => {
  await unmount();
});

describe("a valid invite", () => {
  it("shows the site, who invited, and when it expires - and asks for the code by its own hash, not the plaintext appearing twice", async () => {
    operatorInvitesApi.previewOperatorInvite.mockResolvedValue({
      siteName: "Acme Support",
      invitedByDisplayName: "Ada Lovelace",
      expiresAt: "2026-09-10T00:00:00Z",
      status: "Valid",
    });

    const container = await render(app());

    expect(operatorInvitesApi.previewOperatorInvite).toHaveBeenCalledWith("abc123");
    expect(container.textContent).toContain("Acme Support");
    expect(container.textContent).toContain("Ada Lovelace");
    expect(container.textContent).toContain("This link expires");
  });

  it("omits the inviter line when the server names none, without crashing", async () => {
    operatorInvitesApi.previewOperatorInvite.mockResolvedValue({
      siteName: "Acme Support",
      invitedByDisplayName: null,
      expiresAt: "2026-09-10T00:00:00Z",
      status: "Valid",
    });

    const container = await render(app());

    expect(container.textContent).toContain("Acme Support");
    expect(container.textContent).not.toContain("Invited by");
  });

  it("saves the code and moves on to /redeem-invite when Continue is clicked", async () => {
    operatorInvitesApi.previewOperatorInvite.mockResolvedValue({
      siteName: "Acme Support",
      invitedByDisplayName: null,
      expiresAt: "2026-09-10T00:00:00Z",
      status: "Valid",
    });

    const container = await render(app());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Continue")?.click());

    expect(container.textContent).toContain("redeem screen");
    // The code survived the navigation as a *consumable* value, not left sitting in storage forever -
    // `pendingInviteCode.ts`'s own "consumed, not merely read" discipline.
    expect(consumePendingInviteCode()).toBe("abc123");
  });
});

describe("an expired or already-used invite - the case this item's own trap names", () => {
  it("says the invite has expired, as a plain 200 response, offering no Continue button", async () => {
    operatorInvitesApi.previewOperatorInvite.mockResolvedValue({
      siteName: "Acme Support",
      invitedByDisplayName: null,
      expiresAt: "2026-01-01T00:00:00Z",
      status: "Expired",
    });

    const container = await render(app());

    expect(container.textContent).toContain("expired");
    expect(container.querySelector("button")).toBeNull();
  });

  it("says the invite has already been used, offering no Continue button", async () => {
    operatorInvitesApi.previewOperatorInvite.mockResolvedValue({
      siteName: "Acme Support",
      invitedByDisplayName: null,
      expiresAt: "2026-09-10T00:00:00Z",
      status: "Redeemed",
    });

    const container = await render(app());

    expect(container.textContent).toContain("already been used");
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("a code that matches nothing at all", () => {
  it("says the link is not valid, rather than showing an unhandled error", async () => {
    operatorInvitesApi.previewOperatorInvite.mockRejectedValue(
      new ApiProblemError("OperatorInvite.NotFound", "No operator invite matches this code.", 404),
    );

    const container = await render(app());

    expect(container.textContent).toContain("We couldn't find an invitation at this link");
  });

  it("says something usable for a plain network failure", async () => {
    operatorInvitesApi.previewOperatorInvite.mockRejectedValue(new TypeError("Failed to fetch"));

    const container = await render(app());

    expect(container.textContent).toContain("We couldn't load this invitation");
  });
});
