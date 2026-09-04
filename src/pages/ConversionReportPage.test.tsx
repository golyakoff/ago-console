import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { ConversionReportPage } from "./ConversionReportPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

/** `18-10`. Follows `OperatorAnalyticsPage.test.tsx`'s own harness shape byte-for-byte, since this
 * page copies that one's permission-gating and date-range-echo shape byte-for-byte too. */
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
const conversationsApi = vi.hoisted(() => ({ fetchConversionReport: vi.fn() }));

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
          <ConversionReportPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

type Bucket = {
  convertedCount: number;
  notConvertedCount: number;
  followUpNeededCount: number;
  unsetCount: number;
  recordedCount: number;
  conversionRate: number | null;
};

function response(overrides: {
  from?: string;
  to?: string;
  overall?: Bucket;
  previousFrom?: string;
  previousTo?: string;
  previousOverall?: Bucket;
  byOperator?: { operatorId: string; operatorName?: string | null; bucket: Bucket }[];
} = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    overall: {
      convertedCount: 3,
      notConvertedCount: 1,
      followUpNeededCount: 1,
      unsetCount: 1,
      recordedCount: 4,
      conversionRate: 0.75,
    },
    // `23-16`: the immediately preceding window - a plain, always-present fixture default so every
    // existing test in this file (none of which name `previousOverall`) keeps rendering the
    // comparison line without having to know about it; the tests below override it deliberately.
    previousFrom: "2026-02-28T00:00:00+00:00",
    previousTo: "2026-05-29T00:00:00+00:00",
    previousOverall: {
      convertedCount: 2,
      notConvertedCount: 2,
      followUpNeededCount: 0,
      unsetCount: 0,
      recordedCount: 4,
      conversionRate: 0.5,
    },
    byOperator: [
      {
        operatorId: "11111111-2222-3333-4444-555555555555",
        bucket: { convertedCount: 2, notConvertedCount: 0, followUpNeededCount: 0, unsetCount: 1, recordedCount: 2, conversionRate: 1 },
      },
      {
        operatorId: "66666666-7777-8888-9999-000000000000",
        bucket: { convertedCount: 1, notConvertedCount: 1, followUpNeededCount: 0, unsetCount: 1, recordedCount: 2, conversionRate: 0.5 },
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
    expect(conversationsApi.fetchConversionReport).not.toHaveBeenCalled();
  });
});

describe("the honesty framing", () => {
  it("renders the not-a-verified-sale banner unconditionally, above the numbers", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("not the same claim as");
    expect(container.textContent).toContain("verified sale");
  });
});

describe("loading the report", () => {
  it("loads the server's default window on first render, with no range named", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchConversionReport).toHaveBeenCalledWith("token", {});
    expect(container.textContent).toContain("Whole site");
    // The server-echoed range, not a locally-guessed one.
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("renders the hand-calculated counts and rate exactly as the server reports them", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    // Overall: 3 converted, 1 not converted, 1 follow-up needed, 1 unset, rate 75.0%.
    expect(container.textContent).toContain("75.0%");
  });

  // `23-16`: a rate is never printed without the figures it came from - the fraction rides inline with
  // the percentage, not four columns away.
  it("pairs the overall rate with its own numerator and denominator, inline", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("75.0% (3 of 4)");
  });

  it("pairs a 100% rate with its own fraction too, not just a bare percentage", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    // Operator 1's own bucket: 2 converted of 2 recorded.
    expect(container.textContent).toContain("100.0% (2 of 2)");
  });

  // `23-16`: dynamics, relative and absolute together, against the preceding window of equal length.
  it("shows the change against the preceding period in both absolute and relative terms", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    // Previous overall: 2 converted, 4 recorded, rate 50.0%. Current: 3 converted, 4 recorded, rate 75.0%.
    expect(container.textContent).toContain("Previous period: 2 (+1, +50.0%)");
    expect(container.textContent).toContain("Previous period: 50.0% (+25.0 pp)");
  });

  it("renders an em dash, never 0%, when the bucket's own rate is null because nothing has been recorded", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(
      response({
        overall: { convertedCount: 0, notConvertedCount: 0, followUpNeededCount: 0, unsetCount: 5, recordedCount: 0, conversionRate: null },
        // `23-16`: the previous period is deliberately also nothing-recorded here - this test is about
        // the *current* bucket's own null rate never reading as 0%, not about a previous period's real
        // rate (which legitimately could contain the digits "0%", e.g. "50.0%", without that being the
        // bug this test exists to catch).
        previousOverall: { convertedCount: 0, notConvertedCount: 0, followUpNeededCount: 0, unsetCount: 0, recordedCount: 0, conversionRate: null },
        byOperator: [],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("0%");
  });

  it("shows a plain empty state when the site had no conversations at all in the window, not an error", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(
      response({
        overall: { convertedCount: 0, notConvertedCount: 0, followUpNeededCount: 0, unsetCount: 0, recordedCount: 0, conversionRate: null },
        byOperator: [],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("No conversations in this range.");
  });

  it("surfaces a 403 as a permission-denied message, not a generic error", async () => {
    conversationsApi.fetchConversionReport.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "nope", 403),
    );

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's analytics.");
  });

  it("surfaces a 400 invalid-range response as a range-error message", async () => {
    conversationsApi.fetchConversionReport.mockRejectedValue(
      new ApiProblemError("Analytics.InvalidRange", "bad range", 400),
    );

    const container = await render(page());

    expect(container.textContent).toContain("The start of the range must be before its end.");
  });
});

describe("the per-operator breakdown", () => {
  it("renders one row per operator, labelled by a truncated id since no display name exists", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("By operator");
    expect(container.textContent).toContain("11111111");
    expect(container.textContent).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(container.textContent).toContain("66666666");
    // Operator 1's own rate (100%) and operator 2's own rate (50%).
    expect(container.textContent).toContain("100.0%");
    expect(container.textContent).toContain("50.0%");
  });

  // `23-02`: an operator's own name is a real column now - `docs/backlog/23-02-an-operator-has-a-name.md`'s
  // own Goal is exactly this table.
  it("renders the operator's own name when the row carries one, and still falls back to the id for one that does not", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "11111111-2222-3333-4444-555555555555",
            operatorName: "Ivan Petrov",
            bucket: { convertedCount: 2, notConvertedCount: 0, followUpNeededCount: 0, unsetCount: 1, recordedCount: 2, conversionRate: 1 },
          },
          {
            operatorId: "66666666-7777-8888-9999-000000000000",
            operatorName: null,
            bucket: { convertedCount: 1, notConvertedCount: 1, followUpNeededCount: 0, unsetCount: 1, recordedCount: 2, conversionRate: 0.5 },
          },
        ],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Ivan Petrov");
    expect(container.textContent).not.toContain("11111111");
    expect(container.textContent).toContain("66666666");
  });

  it("shows a dedicated empty state, distinct from the whole-report empty state, when the report has conversations but none attribute to an operator", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response({ byOperator: [] }));

    const container = await render(page());

    expect(container.textContent).toContain("Whole site");
    expect(container.textContent).toContain("No recorded outcomes attribute to an operator in this range.");
    expect(container.textContent).not.toContain("No conversations in this range.");
  });
});

describe("date-range presets", () => {
  it("resolves 'this month' client-side and re-fetches with concrete from/to", async () => {
    conversationsApi.fetchConversionReport.mockResolvedValue(response());

    const container = await render(page());
    expect(conversationsApi.fetchConversionReport).toHaveBeenCalledTimes(1);

    await interact(() => byText<HTMLButtonElement>(container, "button", "This month").click());

    expect(conversationsApi.fetchConversionReport).toHaveBeenCalledTimes(2);
    const [, params] = conversationsApi.fetchConversionReport.mock.calls[1] as [string, { from?: string; to?: string }];
    expect(params.from).toBeDefined();
    expect(params.to).toBeDefined();
    // `from` is the first of the current month at local midnight - never later than `to`.
    expect(new Date(params.from).getTime()).toBeLessThanOrEqual(new Date(params.to).getTime());
  });
});
