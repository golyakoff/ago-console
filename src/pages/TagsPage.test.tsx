import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { TagsPage } from "./TagsPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `25-53`: `/settings/tags` had no test file at all before this item - the vocabulary's own
 * one-blended-card split (a table for the existing tags, a separate "add a tag" card below) is the
 * first thing this screen is tested against. Modeled on `OperatorsTeamPage.test.tsx` for the
 * permission-gated-page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me` faked).
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
const tagsApi = vi.hoisted(() => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/tagsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/tagsApi.js")>("../api/tagsApi.js");
  return { ...actual, ...tagsApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TAG_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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
          <TagsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  tagsApi.fetchTags.mockResolvedValue([{ id: TAG_ID, name: "VIP", createdAt: "2026-01-01T00:00:00Z" }]);
  tagsApi.createTag.mockResolvedValue({ id: "new-tag", name: "New tag", createdAt: "2026-01-01T00:00:00Z" });
  tagsApi.renameTag.mockResolvedValue({ id: TAG_ID, name: "Renamed", createdAt: "2026-01-01T00:00:00Z" });
  tagsApi.deleteTag.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:configure, and never calls fetchTags", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission");
    expect(tagsApi.fetchTags).not.toHaveBeenCalled();
  });
});

describe("25-53: the vocabulary is two blocks, not one blended card", () => {
  it("lists the existing tags in a table, separate from the add-a-tag card", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("VIP");
    // Two separate panels, each with its own heading - not one card carrying both.
    const headings = all(container, "h2").map((h) => h.textContent);
    expect(headings).toContain("Tags");
    expect(headings).toContain("Add a tag");
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("creates a tag from the separate add-a-tag card, and reloads the vocabulary", async () => {
    const container = await render(page());

    const input = container.querySelector<HTMLInputElement>("input");
    await interact(() => {
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Priority");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Create tag")?.click());

    expect(tagsApi.createTag).toHaveBeenCalledWith("token", SITE_ID, "Priority");
    expect(tagsApi.fetchTags).toHaveBeenCalledTimes(2);
  });

  it("renames a tag in place from the table's own row action, and reloads", async () => {
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Rename")?.click());

    const renameInput = container.querySelector<HTMLInputElement>("table input");
    await interact(() => {
      if (renameInput) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(renameInput, "Renamed");
        renameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save")?.click());

    expect(tagsApi.renameTag).toHaveBeenCalledWith("token", SITE_ID, TAG_ID, "Renamed");
    expect(tagsApi.fetchTags).toHaveBeenCalledTimes(2);
  });

  it("deletes a tag from the table's own row action, and reloads", async () => {
    const container = await render(page());

    await interact(() =>
      all(container, "table button")
        .find((b) => b.textContent === "Delete")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(tagsApi.deleteTag).toHaveBeenCalledWith("token", SITE_ID, TAG_ID);
    expect(tagsApi.fetchTags).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state, with no table, when the site has no tags yet", async () => {
    tagsApi.fetchTags.mockResolvedValue([]);

    const container = await render(page());

    expect(container.textContent).toContain("No tags yet.");
    expect(container.querySelector("table")).toBeNull();
  });
});
