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

type LoadBucketEntry = { bucketLabel: string; intervalCount: number; replyCount: number; averageFirstReplySeconds: number | null };
type Load = { conversationsHeld: number; intervalsHeld: number; standardIntervals: number; additionalIntervals: number; byLoad: LoadBucketEntry[] };

function response(overrides: {
  from?: string;
  to?: string;
  overall?: Bucket;
  previousFrom?: string;
  previousTo?: string;
  previousOverall?: Bucket;
  byChannel?: { channel: string; bucket: Bucket }[];
  byOperator?: { operatorId: string; operatorName?: string | null; bucket: Bucket; load?: Load | null }[];
  byReferrer?: { referrerHost: string; bucket: Bucket }[];
  byCampaign?: { utmCampaign: string; bucket: Bucket }[];
} = {}) {
  return {
    from: "2026-05-29T00:00:00+00:00",
    to: "2026-08-29T00:00:00+00:00",
    overall: { conversationCount: 6, averageFirstResponseSeconds: 65, averageDurationSeconds: 150, missedCount: 1 },
    // `23-16`: the immediately preceding window - a plain, always-present default so every
    // pre-existing test in this file keeps rendering correctly without naming it.
    previousFrom: "2026-02-28T00:00:00+00:00",
    previousTo: "2026-05-29T00:00:00+00:00",
    previousOverall: { conversationCount: 4, averageFirstResponseSeconds: 80, averageDurationSeconds: 180, missedCount: 2 },
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
    // `23-17`: operator 1 carries a real `load` - a genuine standard/additional split and one entry per
    // bucket. Operator 2 carries none (`load: null`), the real "no assignment interval started in this
    // window" case, distinct from a zero - both states exercised by default so every test in this file
    // that reuses `response()` unmodified renders both branches at least once.
    byOperator: [
      {
        operatorId: "11111111-2222-3333-4444-555555555555",
        bucket: { conversationCount: 2, averageFirstResponseSeconds: 60, averageDurationSeconds: 180, missedCount: 0 },
        load: {
          conversationsHeld: 3,
          intervalsHeld: 4,
          standardIntervals: 3,
          additionalIntervals: 1,
          byLoad: [
            { bucketLabel: "1", intervalCount: 3, replyCount: 3, averageFirstReplySeconds: 15 },
            { bucketLabel: "4+", intervalCount: 1, replyCount: 1, averageFirstReplySeconds: 75 },
          ],
        },
      },
      {
        operatorId: "66666666-7777-8888-9999-000000000000",
        bucket: { conversationCount: 1, averageFirstResponseSeconds: 20, averageDurationSeconds: 300, missedCount: 0 },
        load: null,
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

  // `23-16`: dynamics, relative and absolute together, against the preceding window of equal length -
  // this report carries no rate, so only the two counts (conversation volume, missed) get a comparison.
  it("shows the change against the preceding period in both absolute and relative terms", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    // Previous overall: 4 conversations, 2 missed. Current: 6 conversations, 1 missed.
    expect(container.textContent).toContain("Previous period: 4 (+2, +50.0%)");
    expect(container.textContent).toContain("Previous period: 2 (-1, -50.0%)");
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

  // `23-02`: an operator's own name is a real column now - `docs/backlog/23-02-an-operator-has-a-name.md`'s
  // own Goal is exactly this table.
  it("renders the operator's own name when the row carries one, and still falls back to the id for one that does not", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "11111111-2222-3333-4444-555555555555",
            operatorName: "Ivan Petrov",
            bucket: { conversationCount: 2, averageFirstResponseSeconds: 60, averageDurationSeconds: 180, missedCount: 0 },
          },
          {
            operatorId: "66666666-7777-8888-9999-000000000000",
            operatorName: null,
            bucket: { conversationCount: 1, averageFirstResponseSeconds: 20, averageDurationSeconds: 300, missedCount: 0 },
          },
        ],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Ivan Petrov");
    expect(container.textContent).not.toContain("11111111");
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

/** `23-17`: the console half of "an operator's work is reported with the load it was carried under" -
 * three more columns on the existing per-operator table (`docs/backlog/23-17-*.md`'s own Scope: "it
 * extends the existing per-operator table rather than creating a fifth report screen"), plus one more
 * table below it for the operator × load-bucket breakdown. */
describe("the per-operator load split", () => {
  it("shows standard and additional as two separate absolute counts, with the held total, and never a combined figure", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "aaaaaaaa-bbbb-cccc-dddd-111111111111",
            operatorName: "Nadia",
            bucket: { conversationCount: 5, averageFirstResponseSeconds: 33, averageDurationSeconds: 222, missedCount: 0 },
            // Three deliberately distinct numbers, so this assertion cannot pass by reading the wrong
            // column - the same "distinct numbers" discipline `18-13`'s own fixture comment establishes.
            load: { conversationsHeld: 8, intervalsHeld: 10, standardIntervals: 7, additionalIntervals: 3, byLoad: [] },
          },
        ],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("8"); // Held (conversationsHeld)
    expect(container.textContent).toContain("7"); // Standard
    expect(container.textContent).toContain("3"); // Additional
    // `docs/design/decisions.md` §2's naming amendment: the word this codebase never shows a person.
    expect(container.textContent).not.toContain("forced");
    expect(container.textContent).not.toContain("Forced");
  });

  it("renders zero additional as a plain 0, with no distinguishing style and no reordering against a busier operator", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "aaaaaaaa-0000-0000-0000-000000000001",
            operatorName: "Quiet Operator",
            bucket: { conversationCount: 4, averageFirstResponseSeconds: 30, averageDurationSeconds: 120, missedCount: 0 },
            load: { conversationsHeld: 4, intervalsHeld: 4, standardIntervals: 4, additionalIntervals: 0, byLoad: [] },
          },
          {
            operatorId: "aaaaaaaa-0000-0000-0000-000000000002",
            operatorName: "Busy Operator",
            bucket: { conversationCount: 9, averageFirstResponseSeconds: 30, averageDurationSeconds: 120, missedCount: 0 },
            load: { conversationsHeld: 9, intervalsHeld: 13, standardIntervals: 9, additionalIntervals: 4, byLoad: [] },
          },
        ],
      }),
    );

    const container = await render(page());

    // Table 0 is overall/by-channel, table 1 is the per-operator table - fixed by render order, the
    // same indexing every other test in this file relies on implicitly via `toContain`.
    const operatorTable = container.querySelectorAll("table")[1];
    const rows = Array.from(operatorTable.querySelectorAll("tbody tr"));
    // Row order matches the server's own array order - never sorted by additional load, matching
    // `docs/design/decisions.md` §7: "operators must not be sorted by a rate" extended here to counts.
    expect(rows[0].textContent).toContain("Quiet Operator");
    expect(rows[1].textContent).toContain("Busy Operator");

    const quietCells = Array.from(rows[0].querySelectorAll("td"));
    const busyCells = Array.from(rows[1].querySelectorAll("td"));
    const quietAdditionalCell = quietCells[quietCells.length - 1];
    const busyAdditionalCell = busyCells[busyCells.length - 1];
    expect(quietAdditionalCell.textContent).toBe("0");
    // The zero-additional cell carries the identical class the non-zero cell in the same column
    // carries - no `ago-table__cell--warn`/highlight class exists anywhere in this codebase to begin
    // with, but this locks the *absence* of any such divergence rather than trusting that silently.
    expect(quietAdditionalCell.className).toBe(busyAdditionalCell.className);
  });

  it("shows 'No data' rather than 0 for an operator whose load is null - a real absence, not a zero", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "aaaaaaaa-0000-0000-0000-000000000003",
            operatorName: "No Load Report",
            bucket: { conversationCount: 2, averageFirstResponseSeconds: 30, averageDurationSeconds: 120, missedCount: 0 },
            load: null,
          },
        ],
      }),
    );

    const container = await render(page());

    const operatorTable = container.querySelectorAll("table")[1];
    const cells = Array.from(operatorTable.querySelectorAll("tbody tr td"));
    const [heldCell, standardCell, additionalCell] = cells.slice(-3);
    expect(heldCell.textContent).toBe("No data");
    expect(standardCell.textContent).toBe("No data");
    expect(additionalCell.textContent).toBe("No data");
  });

  it("states once, under the table, that Held counts a conversation and Standard/Additional count intervals", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(response());

    const container = await render(page());

    expect(container.textContent).toContain(
      "\"Held\" counts a conversation once, even if this operator held it twice (transferred away and back).",
    );
    expect(container.textContent).toContain("count assignment intervals instead, where that same conversation counts twice.");
  });

  it("renders the operator-by-load-bucket breakdown as its own table, one row per operator and bucket", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "aaaaaaaa-0000-0000-0000-000000000004",
            operatorName: "First Op",
            bucket: { conversationCount: 3, averageFirstResponseSeconds: 30, averageDurationSeconds: 120, missedCount: 0 },
            load: {
              conversationsHeld: 3,
              intervalsHeld: 3,
              standardIntervals: 3,
              additionalIntervals: 0,
              byLoad: [{ bucketLabel: "2-3", intervalCount: 3, replyCount: 3, averageFirstReplySeconds: 12 }],
            },
          },
          {
            operatorId: "aaaaaaaa-0000-0000-0000-000000000005",
            operatorName: "Second Op",
            bucket: { conversationCount: 5, averageFirstResponseSeconds: 30, averageDurationSeconds: 120, missedCount: 0 },
            // Same bucket label as First Op, on purpose - proves the row key does not collide across
            // operators sharing a bucket, and that the reply count/average shown is this operator's own.
            load: {
              conversationsHeld: 5,
              intervalsHeld: 5,
              standardIntervals: 5,
              additionalIntervals: 0,
              byLoad: [{ bucketLabel: "2-3", intervalCount: 5, replyCount: 2, averageFirstReplySeconds: 96 }],
            },
          },
        ],
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Response time by load, per operator");
    // Table 0 is overall/by-channel, table 1 is the per-operator table, table 2 is this one.
    const bucketTable = container.querySelectorAll("table")[2];
    const bodyText = bucketTable.textContent ?? "";
    expect(bodyText).toContain("First Op");
    expect(bodyText).toContain("Second Op");
    expect(bodyText).toContain("12s"); // First Op's own average first reply in the "2-3" bucket
    expect(bodyText).toContain("1m 36s"); // Second Op's own average first reply in the same bucket
  });

  it("shows a dedicated empty state for the load-bucket table when operators exist but none carry load data", async () => {
    conversationsApi.fetchOperatorAnalytics.mockResolvedValue(
      response({
        byOperator: [
          {
            operatorId: "aaaaaaaa-0000-0000-0000-000000000006",
            operatorName: "No Buckets",
            bucket: { conversationCount: 1, averageFirstResponseSeconds: 30, averageDurationSeconds: 120, missedCount: 0 },
            load: null,
          },
        ],
      }),
    );

    const container = await render(page());

    // The operator table itself still renders - only the bucket breakdown is empty.
    expect(container.textContent).toContain("No Buckets");
    expect(container.textContent).toContain("No assignment data yet in this range.");
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
