import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { SearchConversationsPage } from "./SearchConversationsPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `18-01`. Follows `AdminConversationsPage.test.tsx`'s own harness shape byte-for-byte (mock the APIs
 * the tree calls, wrap in `MemoryRouter` + a hand-built `AuthContext` + the real `PermissionsProvider`)
 * since this page copies that one's permission-gating byte-for-byte too - the same reasoning
 * `SearchConversationsPage`'s own doc comment gives for why.
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
const conversationsApi = vi.hoisted(() => ({ searchConversations: vi.fn(), claimConversation: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/conversationsApi.js", () => conversationsApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";
const MESSAGE_ID = "33333333-3333-3333-3333-333333333333";

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
        <PermissionsProvider>
          <SearchConversationsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function hit(overrides: {
  conversationId?: string;
  messageId?: string;
  sequence?: number;
  matchedBody?: string;
  authorKind?: "Visitor" | "Operator" | "System";
  createdAt?: string;
  conversationState?: "Waiting" | "Assigned" | "Closed";
} = {}) {
  return {
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    sequence: 7,
    matchedBody: "Where is my refund?",
    authorKind: "Visitor" as const,
    createdAt: "2026-08-20T10:00:00+00:00",
    conversationState: "Assigned" as const,
    ...overrides,
  };
}

// React swallows a direct `.value` assignment as "no change" (it patches the native setter to track
// what it last rendered); the prototype's own setter is what makes the synthetic `input` event real -
// the same workaround `OnboardingPage.test.tsx#fill` and `ConversationPage.test.tsx` already use.
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function search(container: HTMLElement, phrase: string) {
  const input = one<HTMLInputElement>(container, 'input[type="text"]');
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, phrase);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await interact(() => byText<HTMLButtonElement>(container, "button", "Search").click());
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
});

afterEach(async () => {
  await unmount();
});

describe("permission gating", () => {
  it("shows a forbidden message and no search form for an operator without site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["conversation:read"], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to search this site's conversations.");
    expect(container.querySelector("form")).toBeNull();
    expect(conversationsApi.searchConversations).not.toHaveBeenCalled();
  });
});

describe("running a search", () => {
  it("renders the results and the server-echoed date range, not a locally-guessed one", async () => {
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit()],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });

    const container = await render(page());
    await search(container, "refund");

    expect(conversationsApi.searchConversations).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ phrase: "refund" }),
    );
    expect(container.textContent).toContain("Where is my refund?");
    // The range shown comes from the response, not from the (empty) date inputs the operator never
    // touched - this item's own Done-when ("the bound is visible, not silent").
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("shows a plain empty state for zero matches in range, without implying nothing was ever said", async () => {
    conversationsApi.searchConversations.mockResolvedValue({
      results: [],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });

    const container = await render(page());
    await search(container, "nonexistent");

    expect(container.textContent).toContain("No matches in this range.");
  });

  it("surfaces a 403 from the search endpoint as a permission-denied message, not a generic error", async () => {
    conversationsApi.searchConversations.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "nope", 403),
    );

    const container = await render(page());
    await search(container, "refund");

    expect(container.textContent).toContain("You do not have permission to search this site's conversations.");
  });

  it("surfaces a 400 empty-phrase response as an invalid-query message", async () => {
    conversationsApi.searchConversations.mockRejectedValue(
      new ApiProblemError("Conversation.SearchInvalidQuery", "empty", 400),
    );

    const container = await render(page());
    await search(container, "refund");

    expect(container.textContent).toContain("Enter a search phrase.");
  });

  it("loads a further page via beforeMessageId when Load more is clicked, appending rather than replacing", async () => {
    const second = hit({ messageId: "44444444-4444-4444-4444-444444444444", matchedBody: "Second hit" });
    conversationsApi.searchConversations
      .mockResolvedValueOnce({
        results: [hit()],
        nextBeforeMessageId: MESSAGE_ID,
        searchedFrom: "2026-05-29T00:00:00+00:00",
        searchedTo: "2026-08-29T00:00:00+00:00",
      })
      .mockResolvedValueOnce({
        results: [second],
        nextBeforeMessageId: null,
        searchedFrom: "2026-05-29T00:00:00+00:00",
        searchedTo: "2026-08-29T00:00:00+00:00",
      });

    const container = await render(page());
    await search(container, "refund");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Load more").click());

    expect(conversationsApi.searchConversations).toHaveBeenLastCalledWith(
      "token",
      expect.objectContaining({ beforeMessageId: MESSAGE_ID }),
    );
    expect(container.textContent).toContain("Where is my refund?");
    expect(container.textContent).toContain("Second hit");
  });
});

describe("a result row's own openability, by conversation state", () => {
  it("renders an Assigned hit as a real link, to the conversation at its own matched sequence", async () => {
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit({ conversationState: "Assigned", sequence: 42 })],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });

    const container = await render(page());
    await search(container, "refund");

    const link = one<HTMLAnchorElement>(container, "a.ago-list__row");
    expect(link.getAttribute("href")).toBe(`/conversations/${CONVERSATION_ID}?at=42`);
  });

  it("renders a Waiting hit as non-interactive, with a note rather than a link - opening one would silently claim it", async () => {
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit({ conversationState: "Waiting" })],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });

    const container = await render(page());
    await search(container, "refund");

    expect(container.querySelector("a.ago-list__row")).toBeNull();
    expect(container.textContent).toContain("Waiting — take it to open it.");
  });

  it("hides the Claim button for a Waiting hit when the operator lacks conversation:assign", async () => {
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit({ conversationState: "Waiting" })],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });

    const container = await render(page());
    await search(container, "refund");

    expect(byText(container, "button", "Take")).toBeNull();
  });

  /**
   * `23-04`'s own reachable act, proven at this page: a `Waiting` hit gets a real `ClaimConversationButton`
   * when the operator holds `conversation:assign`, and a successful claim turns the row into the
   * `Assigned` branch above - a real link, at its own matched sequence - without a second search round
   * trip.
   */
  it("lets an operator with conversation:assign take a Waiting hit, which then renders as a real link", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", "conversation:assign"],
      siteId: SITE_ID,
    });
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit({ conversationState: "Waiting", sequence: 9 })],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });
    conversationsApi.claimConversation.mockResolvedValue(undefined);

    const container = await render(page());
    await search(container, "refund");

    const claimButton = byText<HTMLButtonElement>(container, "button", "Take");
    expect(claimButton).not.toBeNull();
    await interact(() => claimButton.click());

    expect(conversationsApi.claimConversation).toHaveBeenCalledWith("token", CONVERSATION_ID);
    const link = one<HTMLAnchorElement>(container, "a.ago-list__row");
    expect(link.getAttribute("href")).toBe(`/conversations/${CONVERSATION_ID}?at=9`);
  });

  /** The loser's own outcome, told plainly rather than swallowed - `ClaimConversationButton`'s own
   * doc comment on why there is no code-by-code mapping here. */
  it("shows the server's own message inline when a claim loses a race, and keeps the row Waiting", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", "conversation:assign"],
      siteId: SITE_ID,
    });
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit({ conversationState: "Waiting" })],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });
    conversationsApi.claimConversation.mockRejectedValue(
      new ApiProblemError("Conversation.InvalidState", "already taken by someone else", 409),
    );

    const container = await render(page());
    await search(container, "refund");
    const claimButton = byText<HTMLButtonElement>(container, "button", "Take");
    expect(claimButton).not.toBeNull();
    await interact(() => claimButton.click());

    expect(container.textContent).toContain("already taken by someone else");
    expect(container.querySelector("a.ago-list__row")).toBeNull();
  });

  it("renders a Closed hit as non-interactive, with its own note - nobody can rejoin a closed conversation", async () => {
    conversationsApi.searchConversations.mockResolvedValue({
      results: [hit({ conversationState: "Closed" })],
      nextBeforeMessageId: null,
      searchedFrom: "2026-05-29T00:00:00+00:00",
      searchedTo: "2026-08-29T00:00:00+00:00",
    });

    const container = await render(page());
    await search(container, "refund");

    expect(container.querySelector("a.ago-list__row")).toBeNull();
    expect(container.textContent).toContain("Closed — a closed conversation cannot be reopened as a live thread.");
  });
});
