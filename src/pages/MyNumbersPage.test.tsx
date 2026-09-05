import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { MyNumbersPage } from "./MyNumbersPage.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `23-18`. Follows `OperatorAnalyticsPage.test.tsx`'s own harness shape (mock the API the tree calls,
 * wrap in `MemoryRouter` + a hand-built `AuthContext`) - **with no `PermissionsProvider`, unlike that
 * file**, because this page calls `usePermissions()` nowhere at all: the whole point under test is
 * that an operator reaches their own numbers without one.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const conversationsApi = vi.hoisted(() => ({ fetchOwnAnalytics: vi.fn() }));
vi.mock("../api/conversationsApi.js", () => conversationsApi);

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
        <MyNumbersPage />
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

type LoadBucketEntry = { bucketLabel: string; intervalCount: number; replyCount: number; averageFirstReplySeconds: number | null };
type Load = { conversationsHeld: number; intervalsHeld: number; standardIntervals: number; additionalIntervals: number; byLoad: LoadBucketEntry[] };
type Conversion = {
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
  bucket?: Bucket;
  load?: Load | null;
  conversion?: Conversion | null;
} = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    bucket: { conversationCount: 5, averageFirstResponseSeconds: 42, averageDurationSeconds: 300, missedCount: 1 },
    load: {
      conversationsHeld: 5,
      intervalsHeld: 5,
      standardIntervals: 4,
      additionalIntervals: 1,
      byLoad: [
        { bucketLabel: "1", intervalCount: 3, replyCount: 3, averageFirstReplySeconds: 20 },
        { bucketLabel: "2-3", intervalCount: 2, replyCount: 1, averageFirstReplySeconds: 90 },
      ],
    },
    conversion: {
      convertedCount: 2,
      notConvertedCount: 1,
      followUpNeededCount: 0,
      unsetCount: 2,
      recordedCount: 3,
      conversionRate: 2 / 3,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("no permission gate", () => {
  it("loads and renders with no permissions check at all - the whole point of this screen", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchOwnAnalytics).toHaveBeenCalledWith("token", {});
    expect(container.textContent).not.toContain("You do not have permission");
  });
});

describe("loading the report", () => {
  it("loads the server's default window on first render, with no range named", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(conversationsApi.fetchOwnAnalytics).toHaveBeenCalledWith("token", {});
    expect(container.textContent).toContain("29 May 2026");
    expect(container.textContent).toContain("29 Aug 2026");
  });

  it("renders the operator's own conversation bucket exactly as the server reports it", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response());

    const container = await render(page());

    // 5 conversations, 42s average (42s), 300s duration (5m), 1 missed.
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("42s");
    expect(container.textContent).toContain("5m");
  });

  it("shows the standard/additional split as two separate counts, never combined", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("1");
    // Neither label used anywhere - `docs/design/decisions.md` §2's naming amendment.
    expect(container.textContent).not.toContain("forced");
    expect(container.textContent).not.toContain("Forced");
  });

  it("shows the response-time-by-load buckets", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("2-3");
    expect(container.textContent).toContain("20s");
    expect(container.textContent).toContain("1m 30s");
  });

  it("shows the conversion figures with the rate paired to its own fraction, and the not-a-verified-sale banner", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain("66.7% (2 of 3)");
    expect(container.textContent).toContain("not from a verified sale");
  });
});

describe("independent no-data states", () => {
  it("shows a real 'no assignment data' message when load is null, without hiding the rest of the page", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response({ load: null }));

    const container = await render(page());

    expect(container.textContent).toContain("No assignment data yet in this range.");
    // The conversation bucket and conversion figures still render.
    expect(container.textContent).toContain("66.7% (2 of 3)");
  });

  it("shows a real 'no recorded outcome' message when conversion is null, without hiding the rest of the page", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(response({ conversion: null }));

    const container = await render(page());

    expect(container.textContent).toContain("Nothing you handled has a recorded outcome yet in this range.");
    expect(container.textContent).toContain("4"); // standardIntervals still renders
  });

  it("shows one honest empty message when the operator did nothing at all in the range", async () => {
    conversationsApi.fetchOwnAnalytics.mockResolvedValue(
      response({ bucket: { conversationCount: 0, averageFirstResponseSeconds: null, averageDurationSeconds: null, missedCount: 0 }, load: null, conversion: null }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("You held no conversations in this range.");
  });
});

describe("errors", () => {
  it("shows the shared invalid-range message for Analytics.InvalidRange", async () => {
    conversationsApi.fetchOwnAnalytics.mockRejectedValue(new ApiProblemError("Analytics.InvalidRange", "bad range", 400));

    const container = await render(page());

    expect(container.textContent).toContain("The start of the range must be before its end.");
  });

  it("shows a generic load error for anything else", async () => {
    conversationsApi.fetchOwnAnalytics.mockRejectedValue(new Error("network down"));

    const container = await render(page());

    expect(container.textContent).toContain("Failed to load analytics.");
  });
});
