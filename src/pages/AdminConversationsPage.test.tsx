import { act, useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { formatAbsolute, parseInstant } from "../time/format.js";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { AdminConversationsPage } from "./AdminConversationsPage.js";
import { CONVERSATION_ERASE_PERMISSION } from "./EraseConversationButton.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `16-02`: the row-erasure action this item adds to `AdminConversationsPage`, which had no test file
 * of its own before this item (`permissionGating.test.tsx` covers this page's own `site:configure`
 * gate; nothing there exercises a row action). What matters here is specifically what `permissionGating.test.tsx`
 * does not: the "Actions" column only exists for an operator holding the narrower
 * `conversation:erase`, and a row is removed from the list only once its own poll confirms erasure -
 * never on the confirm click alone.
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
const conversationsApi = vi.hoisted(() => ({
  fetchAllConversationsForSite: vi.fn(),
  eraseConversation: vi.fn(),
  checkConversationErasure: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/conversationsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/conversationsApi.js")>("../api/conversationsApi.js");
  return { ...actual, ...conversationsApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";

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
          <AdminConversationsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function oneConversation() {
  return {
    conversationId: CONVERSATION_ID,
    visitorId: "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
    state: "Closed" as const,
    createdAt: "2026-08-27T00:00:00Z",
    operatorUnreadCount: 0,
    operatorId: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  conversationsApi.fetchAllConversationsForSite.mockResolvedValue({ conversations: [oneConversation()] });
  conversationsApi.checkConversationErasure.mockResolvedValue("pending");
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/**
 * `343`/`344`: the "started" column bypassed `time/format.ts` entirely (`new
 * Date(c.createdAt).toLocaleString()`), which rendered in whatever zone the runtime happened to be
 * in with nothing on screen saying which - `time/format.ts`'s own header names exactly this
 * construct as the defect `11-06` existed to fix everywhere else. This proves the replacement keeps
 * the zone label rather than merely "looking like a date" - a render that dropped the label would
 * still look plausible, which is why the assertion checks for the label's actual text rather than
 * just asserting the cell is non-empty.
 */
describe("the started column (343/344)", () => {
  it("renders through the zone-labelled formatter, and the zone label survives", async () => {
    // Pinned so the expectation below is deterministic regardless of the machine running this test -
    // `resolveTimeZone()` reads the real `Intl` default, which without this varies by environment.
    vi.stubEnv("TZ", "UTC");
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });

    const container = await render(page());

    const expected = formatAbsolute(parseInstant(oneConversation().createdAt), "UTC");
    expect(container.textContent).toContain(expected);
    // The regression this guards against: a translation or a future edit that renders a plausible-
    // looking date but silently drops the zone name - `date-and-time.md` rule 5 calls an unlabelled
    // timestamp a defect regardless of how correct everything around it looks.
    expect(expected).toContain("Coordinated Universal Time");
  });
});

describe("the row-erasure action", () => {
  it("adds no Actions column at all for an operator without conversation:erase", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });

    const container = await render(page());

    expect(byText(container, "th", "Actions")).toBeNull();
    expect(byText(container, "button", "Erase")).toBeNull();
  });

  it("offers it for an operator holding both site:configure and conversation:erase", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", CONVERSATION_ERASE_PERMISSION],
      siteId: SITE_ID,
    });

    const container = await render(page());

    expect(byText(container, "th", "Actions")).not.toBeNull();
    expect(byText(container, "button", "Erase")).not.toBeNull();
  });

  it("does not remove the row on the confirm click alone - only once the poll confirms it", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure", CONVERSATION_ERASE_PERMISSION],
      siteId: SITE_ID,
    });
    conversationsApi.eraseConversation.mockResolvedValue(undefined);
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase").click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Erase it").click());

    // Confirmed and accepted (202-equivalent success), but the row is still on screen - the poll has
    // not yet reported completion.
    expect(all(container, "tbody tr")).toHaveLength(1);
    expect(container.textContent).not.toContain("The conversation has been erased.");

    conversationsApi.checkConversationErasure.mockResolvedValue("erased");
    // Wrapped explicitly in `act` (unlike this file's own `interact` helper, which does not await the
    // body it runs) - the state update this tick produces climbs from `EraseConversationButton`'s own
    // poll through `onErased` into `AdminConversationsPage`'s `erasedIds`, and only an `act` scope that
    // genuinely awaits `advanceTimersByTimeAsync` guarantees that climb is committed before the
    // assertion below reads the DOM.
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(all(container, "tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain("The conversation has been erased.");
  });
});
