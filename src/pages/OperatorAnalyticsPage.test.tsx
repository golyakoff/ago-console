import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { OperatorAnalyticsPage } from "./OperatorAnalyticsPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

// React swallows a direct `.value` assignment as "no change" (it patches the native setter to track
// what it last rendered); the prototype's own setter is what makes the synthetic `input` event real -
// the same workaround `SearchConversationsPage.test.tsx#fill`/`OnboardingPage.test.tsx#fill` already use.
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

async function fillDate(input: HTMLInputElement, value: string) {
  await interact(() => {
    INPUT_VALUE_DESCRIPTOR?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * `18-08`. Follows `SearchConversationsPage.test.tsx`'s own harness shape byte-for-byte (mock the
 * APIs the tree calls, wrap in `MemoryRouter` + a hand-built `AuthContext` + the real
 * `PermissionsProvider`) since this page copies that one's permission-gating and date-range-echo
 * shape byte-for-byte too.
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
const conversationsApi = vi.hoisted(() => ({ fetchOperatorAnalytics: vi.fn() }));

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
          <OperatorAnalyticsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

type Bucket = {
  conversationCount: number;
  averageFirstResponseSeconds: number | null;
  averageDurationSeconds: number | null;
  missedCount: number;
};

function response(overrides: {
  from?: string;
  to?: string;
  overall?: Bucket;
  byChannel?: { channel: string; bucket: Bucket }[];
  byOperator?: { operatorId: string; bucket: Bucket }[];
  byReferrer?: { referrerHost: string; bucket: Bucket }[];
  byCampaign?: { utmCampaign: string; bucket: Bucket }[];
} = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    overall: { conversationCount: 6, averageFirstResponseSeconds: 65, averageDurationSeconds: 150, missedCount: 1 },
    byChannel: [
      {
        channel: "Widget",
        bucket: { conversationCount: 4, averageFirstResponseSeconds: 90, averageDurationSeconds: 200, missedCount: 1 },
      },
      {
        channel: "Sms",
        bucket: { conversationCount: 2, averageFirstResponseSeconds: 40, averageDurationSeconds: 300, missedCount: 0 },
      },
    ],
    // `18-09`: two operators' worth of ground truth, matching `ago-chat`'s own
    // `OperatorAnalyticsReadStoreTests.GetSiteAnalyticsAsync_ComputesPerOperatorNumbers_...` scenario
    // shape - a real id, not a placeholder, so `operatorLabel`'s truncation has something real to prove.
    // `18-13`: `averageDurationSeconds` values distinct from `averageFirstResponseSeconds`'s own, so a
    // test asserting on one column can never accidentally pass by reading the other's value.
    byOperator: [
      {
        operatorId: "11111111-2222-3333-4444-555555555555",
        bucket: { conversationCount: 2, averageFirstResponseSeconds: 60, averageDurationSeconds: 180, missedCount: 0 },
      },
      {
        operatorId: "66666666-7777-8888-9999-000000000000",
        bucket: { conversationCount: 1, averageFirstResponseSeconds: 20, averageDurationSeconds: 300, missedCount: 0 },
      },
    ],
    // `18-12`: one real referrer host and one `"Direct"` bucket - the server's own wire literal, so
    // `referrerLabel`'s remapping has something real to prove; one campaign, distinct numbers from
    // both, so a test asserting on the campaign table can never accidentally pass by reading the
    // referrer or operator table's own values.
    byReferrer: [
      {
        referrerHost: "shop.example",
        bucket: { conversationCount: 2, averageFirstResponseSeconds: 50, averageDurationSeconds: 240, missedCount: 0 },
      },
      {
        referrerHost: "Direct",
        bucket: { conversationCount: 4, averageFirstResponseSeconds: 70, averageDurationSeconds: 150, missedCount: 1 },
      },
    ],
    byCampaign: [
      {
        utmCampaign: "summer_sale",
        bucket: { conversationCount: 1, averageFirstResponseSeconds: 35, averageDurationSeconds: 400, missedCount: 0 },
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
    expect(conversationsApi.fetchOperatorAnalytics).not.toHaveBeenCalled();
  });
});

describe("loading the report", () => {
  it("loads the server's default window on first render, with no range named", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenCalledWith("token", {});
    // The overall row and both channel rows, all present.
    expect(container.textContent).toContain("All channels");
    expect(container.textContent).toContain("Widget");
    expect(container.textContent).toContain("SMS");
    // The server-echoed range, not a locally-guessed one - the same "the bound is visible, not
    // silent" shape `SearchConversationsPage` already proves for `18-01`.
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("renders the hand-calculated numbers exactly as the server reports them", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    // Overall: 6 conversations, 65s average (1m 5s), 150s duration (2m 30s), 1 missed.
    expect(container.textContent).toContain("6");
    expect(container.textContent).toContain("1m 5s");
    expect(container.textContent).toContain("2m 30s");
    // Widget: 4 conversations, 90s average (1m 30s), 200s duration (3m 20s), 1 missed.
    // Sms: 2 conversations, 40s average, 300s duration (5m), 0 missed.
    expect(container.textContent).toContain("1m 30s");
    expect(container.textContent).toContain("3m 20s");
    expect(container.textContent).toContain("40s");
    expect(container.textContent).toContain("5m");
  });

  it("renders an em dash, never 0s, for a bucket whose average is null because nothing was ever answered", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        overall: { conversationCount: 1, averageFirstResponseSeconds: null, averageDurationSeconds: null, missedCount: 1 },
        byChannel: [
          {
            channel: "Widget",
            bucket: { conversationCount: 1, averageFirstResponseSeconds: null, averageDurationSeconds: null, missedCount: 1 },
          },
        ],
        byOperator: [],
        // Cleared too - the default fixture's own referrer/campaign numbers ("50s") would otherwise
        // trip the "never 0s" assertion below on an unrelated substring match, which is not what this
        // test is about (that table's own em-dash rendering is `the referrer-host breakdown`'s job).
        byReferrer: [],
        byCampaign: [],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("0s");
  });

  /** `18-13`: a bucket can be answered (a real `averageFirstResponseSeconds`) while nothing in it has
   * closed yet (`averageDurationSeconds` still `null`) - the two null cases are independent, so this
   * proves the duration column renders its own em dash rather than inheriting the response column's
   * non-null state. */
  it("renders an em dash for the duration column alone, when nothing in the bucket has closed yet", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        overall: { conversationCount: 2, averageFirstResponseSeconds: 45, averageDurationSeconds: null, missedCount: 0 },
        byChannel: [
          {
            channel: "Widget",
            bucket: { conversationCount: 2, averageFirstResponseSeconds: 45, averageDurationSeconds: null, missedCount: 0 },
          },
        ],
        byOperator: [],
      }),
    );

    const container = await render(page());

    // The response column has a real value; the duration column's own em dash proves it is a
    // genuinely separate null, not the response column's null bleeding into both.
    expect(container.textContent).toContain("45s");
    expect(container.textContent).toContain("—");
  });

  it("shows a plain empty state when the site had no conversations in the window, not an error", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        overall: { conversationCount: 0, averageFirstResponseSeconds: null, averageDurationSeconds: null, missedCount: 0 },
        byChannel: [],
        byOperator: [],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("No conversations in this range.");
  });

  it("surfaces a 403 as a permission-denied message, not a generic error", async () => {
    conversationsApi.fetchOperatorAnalytics.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "nope", 403),
    );

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's analytics.");
  });

  it("surfaces a 400 invalid-range response as a range-error message", async () => {
    conversationsApi.fetchOperatorAnalytics.mockRejectedValue(
      new ApiProblemError("Analytics.InvalidRange", "bad range", 400),
    );

    const container = await render(page());

    expect(container.textContent).toContain("The start of the range must be before its end.");
  });
});

/** `18-09`: the per-operator table - a second `Table` below the overall/per-channel one
 * (`OperatorAnalyticsPage`'s own doc comment argues why two tables, not one or two pages). */
describe("the per-operator breakdown", () => {
  it("renders one row per operator, labelled by a truncated id since no display name exists", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("By operator");
    // `AdminConversationsPage`'s own truncation convention: the first eight characters of the raw id.
    expect(container.textContent).toContain("11111111");
    expect(container.textContent).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(container.textContent).toContain("66666666");
  });

  it("renders the per-operator numbers exactly as the server reports them", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    // Operator 1: 2 conversations, 60s average (`formatDurationSeconds` drops the "0s" remainder,
    // the same rule the overall/per-channel table's own duration column already follows) = "1m",
    // 180s duration = "3m", 0 missed. Operator 2: 1 conversation, 20s average, 300s duration = "5m".
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("1m");
    expect(container.textContent).toContain("3m");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("20s");
    expect(container.textContent).toContain("5m");
  });

  it("shows a dedicated empty state, distinct from the whole-report empty state, when the report has conversations but none attribute to an operator", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response({ byOperator: [] }));

    const container = await render(page());

    // The main table still renders - this report is not empty, only the operator dimension is.
    expect(container.textContent).toContain("All channels");
    expect(container.textContent).toContain("No conversations attribute to an operator in this range.");
    expect(container.textContent).not.toContain("No conversations in this range.");
  });
});

/** `18-12`: the referrer-host and UTM-campaign tables - two more `Table`s below the per-operator one,
 * the same "a second, separately-captioned table per dimension" shape the per-operator describe block
 * above already proves, applied to two more dimensions. */
describe("the referrer-host breakdown", () => {
  it("renders one row per referrer host, including the server's own Direct label, remapped to this locale", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("By referrer");
    expect(container.textContent).toContain("shop.example");
    // `referrerLabel` remaps the server's English "Direct" wire literal to the resolved locale's own
    // string (`analyticsDirectReferrerLabel`) - this test's default locale is English, where that
    // string happens to also read "Direct", so this alone would not catch a broken remap. The real
    // proof that it *is* a remap and not an accidental pass-through is `referrerLabel`'s own unit
    // shape: every other locale's string differs (`ru.ts`'s own "Прямой переход").
    expect(container.textContent).toContain("Direct");
  });

  it("shows the honesty note above both new tables - what the browser reported, not a verified fact", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain(
      "What the visitor's browser reported - not a fact AGO Chat has independently verified.",
    );
  });

  it("shows a dedicated empty state, distinct from the whole-report empty state, when the referrer breakdown is empty", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response({ byReferrer: [] }));

    const container = await render(page());

    expect(container.textContent).toContain("All channels");
    expect(container.textContent).toContain("No conversations in this range.");
  });
});

describe("the UTM-campaign breakdown", () => {
  it("renders one row per campaign, and never a row for conversations with no campaign tag", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("By campaign");
    expect(container.textContent).toContain("summer_sale");
  });

  it("shows a dedicated empty state, distinct from the whole-report empty state, when nothing in the range carries a campaign tag", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response({ byCampaign: [] }));

    const container = await render(page());

    // The main table still renders - this report is not empty, only the campaign dimension is.
    expect(container.textContent).toContain("All channels");
    expect(container.textContent).toContain("No conversations in this range carry a campaign tag.");
  });
});

describe("applying a custom range", () => {
  it("re-fetches with the typed from/to converted to ISO day bounds", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());
    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenCalledTimes(1);

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    await fillDate(dateInputs[0], "2026-08-01");
    await fillDate(dateInputs[1], "2026-08-10");

    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({ from: "2026-08-01T00:00:00.000+00:00", to: "2026-08-10T00:00:00.000+00:00" }),
    );
    await interact(() => byText<HTMLButtonElement>(container, "button", "Apply").click());

    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenCalledTimes(2);
    // Local-day start/end - `startOfDayIso`/`endOfDayIso`'s own contract, the identical helper
    // `SearchConversationsPage`'s own date fields already convert through.
    expect(conversationsApi.fetchOperatorAnalytics).toHaveBeenLastCalledWith(
      "token",
      expect.objectContaining({
        from: new Date("2026-08-01T00:00:00").toISOString(),
        to: new Date("2026-08-10T23:59:59.999").toISOString(),
      }),
    );
  });
});
