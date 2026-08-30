import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { TagBreakdownReportPage } from "./TagBreakdownReportPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

/** `18-11`. Follows `ConversionReportPage.test.tsx`'s own harness shape byte-for-byte, since this page
 * copies that one's permission-gating and date-range-echo shape byte-for-byte too. */
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
const conversationsApi = vi.hoisted(() => ({ fetchTagBreakdownReport: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/conversationsApi.js", () => conversationsApi);

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
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <TagBreakdownReportPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

type Bucket = {
  tagId: string;
  tagName: string;
  conversationCount: number;
  convertedCount: number;
  notConvertedCount: number;
  recordedCount: number;
  conversionRate: number | null;
};

function response(overrides: {
  from?: string;
  to?: string;
  totalConversationCount?: number;
  taggedConversationCount?: number;
  percentageTagged?: number | null;
  byTag?: Bucket[];
} = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    totalConversationCount: 10,
    taggedConversationCount: 6,
    percentageTagged: 0.6,
    byTag: [
      {
        tagId: "11111111-2222-3333-4444-555555555555",
        tagName: "Billing",
        conversationCount: 4,
        convertedCount: 2,
        notConvertedCount: 1,
        recordedCount: 3,
        conversionRate: 2 / 3,
      },
      {
        tagId: "66666666-7777-8888-9999-000000000000",
        tagName: "Shipping",
        conversationCount: 3,
        convertedCount: 0,
        notConvertedCount: 1,
        recordedCount: 1,
        conversionRate: 0,
      },
    ],
    ...overrides,
  };
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
  it("shows a forbidden message and no report for an operator without site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["conversation:read"], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's analytics.");
    expect(container.querySelector("form")).toBeNull();
    expect(conversationsApi.fetchTagBreakdownReport).not.toHaveBeenCalled();
  });
});

describe("the honesty framing", () => {
  it("renders the percentage-tagged coverage figure and the per-tag breakdown together, not one without the other", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(response());

    const container = await render(page());

    // The coverage honesty check - the load-bearing assertion this item's own Done-when names.
    expect(container.textContent).toContain("6 / 10");
    expect(container.textContent).toContain("60.0%");
    // The breakdown itself, rendered alongside it, not instead of it.
    expect(container.textContent).toContain("Billing");
    expect(container.textContent).toContain("Shipping");
  });

  it("still renders the coverage figure prominently when it is low, never suppressing it", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(
      response({ totalConversationCount: 100, taggedConversationCount: 2, percentageTagged: 0.02 }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("2 / 100");
    expect(container.textContent).toContain("2.0%");
  });

  it("renders the multi-tag counting-rule note alongside the breakdown table", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("counts once per tag it holds");
  });

  it("shows a coverage-unknown message, never a misleading percentage, when there are no conversations to compute one from", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(
      response({ totalConversationCount: 5, taggedConversationCount: 0, percentageTagged: null, byTag: [] }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("No conversations in this range to compute tagging coverage from.");
    expect(container.textContent).not.toContain("0%");
  });
});

describe("loading the report", () => {
  it("loads the server's default window on first render, with no range named", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchTagBreakdownReport).toHaveBeenCalledWith("token", {});
    // The server-echoed range, not a locally-guessed one.
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("renders each tag's own conversation count, converted/not-converted counts, and rate exactly as the server reports them", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("66.7%"); // Billing's own rate, 2/3
    expect(container.textContent).toContain("0.0%"); // Shipping's own rate, 0/1
  });

  it("renders an em dash, never 0%, when a tag's own rate is null because nothing has been recorded", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(
      response({
        byTag: [
          {
            tagId: "11111111-2222-3333-4444-555555555555",
            tagName: "VIP",
            conversationCount: 2,
            convertedCount: 0,
            notConvertedCount: 0,
            recordedCount: 0,
            conversionRate: null,
          },
        ],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("—");
  });

  it("shows a plain empty state when the site had no conversations at all in the window, not an error", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(
      response({ totalConversationCount: 0, taggedConversationCount: 0, percentageTagged: null, byTag: [] }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("No conversations in this range.");
  });

  it("shows a dedicated empty state, distinct from the whole-report empty state, when there are conversations but none carry a tag", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(
      response({ totalConversationCount: 8, taggedConversationCount: 0, percentageTagged: 0, byTag: [] }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("No conversation in this range carries a tag.");
    expect(container.textContent).not.toContain("No conversations in this range.");
  });

  it("surfaces a 403 as a permission-denied message, not a generic error", async () => {
    conversationsApi.fetchTagBreakdownReport.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "nope", 403),
    );

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's analytics.");
  });

  it("surfaces a 400 invalid-range response as a range-error message", async () => {
    conversationsApi.fetchTagBreakdownReport.mockRejectedValue(
      new ApiProblemError("Analytics.InvalidRange", "bad range", 400),
    );

    const container = await render(page());

    expect(container.textContent).toContain("The start of the range must be before its end.");
  });
});

describe("date-range presets", () => {
  it("resolves 'this month' client-side and re-fetches with concrete from/to", async () => {
    conversationsApi.fetchTagBreakdownReport.mockResolvedValue(response());

    const container = await render(page());
    expect(conversationsApi.fetchTagBreakdownReport).toHaveBeenCalledTimes(1);

    await interact(() => byText<HTMLButtonElement>(container, "button", "This month").click());

    expect(conversationsApi.fetchTagBreakdownReport).toHaveBeenCalledTimes(2);
    const [, params] = conversationsApi.fetchTagBreakdownReport.mock.calls[1] as [string, { from?: string; to?: string }];
    expect(params.from).toBeDefined();
    expect(params.to).toBeDefined();
    expect(new Date(params.from).getTime()).toBeLessThanOrEqual(new Date(params.to).getTime());
  });
});
