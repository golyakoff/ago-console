import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllConversationsForSite,
  fetchBookingFlowReport,
  fetchConversationOutcome,
  fetchConversionReport,
  fetchOperatorAnalytics,
  fetchOperatorQueue,
  fetchOwnAnalytics,
  fetchTagBreakdownReport,
  fetchVisitorHistory,
  searchConversations,
} from "./conversationsApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `23-118`/`23-99`: the API-boundary shape validation for `conversationsApi.ts`'s readers. Each of
 * these renders a list or a count where a dropped field would read as a false empty state (an empty
 * queue, a "no more pages", a zeroed report) - so each rejects a mis-shaped response as
 * `ApiProblemError('shape.mismatch')`, the same type and the same `catch` its own screen already uses
 * for every other failure. `conversationsApi.search.test.ts`'s own `fetchMock`/`jsonResponse` shape is
 * reused here for the identical reason.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = {
  conversationId: "c1",
  visitorId: "v1",
  state: "Waiting",
  createdAt: "2026-08-01T00:00:00Z",
  operatorUnreadCount: 0,
};

const bucket = {
  conversationCount: 0,
  averageFirstResponseSeconds: null,
  averageDurationSeconds: null,
  missedCount: 0,
};

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((reason: unknown) => reason);
}

describe("fetchOperatorQueue - shape validation", () => {
  it("resolves both lists when every entry carries its required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { waiting: [summary], assignedToMe: [] }));

    await expect(fetchOperatorQueue("token")).resolves.toEqual({ waiting: [summary], assignedToMe: [] });
  });

  it("resolves two empty lists as two empty lists - a quiet queue is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { waiting: [], assignedToMe: [] }));

    await expect(fetchOperatorQueue("token")).resolves.toEqual({ waiting: [], assignedToMe: [] });
  });

  it("throws ApiProblemError('shape.mismatch') when one waiting entry is missing operatorUnreadCount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { waiting: [summary, { conversationId: "c2", visitorId: "v2", state: "Waiting", createdAt: "x" }], assignedToMe: [] }),
    );

    const failure = await caught(fetchOperatorQueue("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("operatorUnreadCount");
  });

  it("throws when the assignedToMe array is dropped entirely, not only when an entry is truncated", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { waiting: [] }));

    const failure = await caught(fetchOperatorQueue("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
  });
});

describe("fetchAllConversationsForSite - shape validation", () => {
  it("resolves the page when the container and every row carry their required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [summary], nextBeforeId: null }));

    await expect(fetchAllConversationsForSite("token")).resolves.toEqual({ conversations: [summary], nextBeforeId: null });
  });

  it("throws when nextBeforeId is dropped - a missing cursor reads as 'no more pages'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [] }));

    const failure = await caught(fetchAllConversationsForSite("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("nextBeforeId");
  });

  it("throws when a row is missing visitorId", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { conversations: [{ conversationId: "c1", state: "Waiting", createdAt: "x", operatorUnreadCount: 0 }], nextBeforeId: null }),
    );

    expect(((await caught(fetchAllConversationsForSite("token"))) as ApiProblemError).message).toContain("visitorId");
  });
});

describe("fetchVisitorHistory - shape validation", () => {
  const row = {
    conversationId: "c1",
    state: "Closed",
    startedAt: "2026-08-01T00:00:00Z",
    closedAt: null,
    previewBody: null,
    previewAuthorKind: null,
    previewCreatedAt: null,
  };

  it("resolves when the container and every row carry their required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [row], nextBeforeId: null }));

    await expect(fetchVisitorHistory("token", "c1")).resolves.toEqual({ conversations: [row], nextBeforeId: null });
  });

  it("throws when a row is missing previewAuthorKind", async () => {
    const truncated = {
      conversationId: "c1",
      state: "Closed",
      startedAt: "2026-08-01T00:00:00Z",
      closedAt: null,
      previewBody: null,
      previewCreatedAt: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [truncated], nextBeforeId: null }));

    const failure = await caught(fetchVisitorHistory("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("previewAuthorKind");
  });
});

describe("searchConversations - shape validation", () => {
  const hit = {
    conversationId: "c1",
    messageId: "m1",
    sequence: 5,
    matchedBody: "refund please",
    authorKind: "Visitor",
    createdAt: "2026-08-01T00:00:00Z",
    conversationState: "Closed",
  };

  it("resolves when the container and every hit carry their required keys", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { results: [hit], nextBeforeMessageId: null, searchedFrom: "a", searchedTo: "b" }),
    );

    await expect(searchConversations("token", { phrase: "refund" })).resolves.toMatchObject({ results: [hit] });
  });

  it("throws when searchedFrom is dropped - the effective bound must be visible, never silent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [], nextBeforeMessageId: null, searchedTo: "b" }));

    const failure = await caught(searchConversations("token", { phrase: "refund" }));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("searchedFrom");
  });

  it("throws when a hit is missing sequence", async () => {
    const truncated = {
      conversationId: "c1",
      messageId: "m1",
      matchedBody: "refund please",
      authorKind: "Visitor",
      createdAt: "2026-08-01T00:00:00Z",
      conversationState: "Closed",
    };
    fetchMock.mockResolvedValue(
      jsonResponse(200, { results: [truncated], nextBeforeMessageId: null, searchedFrom: "a", searchedTo: "b" }),
    );

    expect(((await caught(searchConversations("token", { phrase: "x" }))) as ApiProblemError).message).toContain("sequence");
  });
});

describe("fetchConversationOutcome - shape validation", () => {
  it("resolves when outcome is present", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { outcome: "Unset" }));

    await expect(fetchConversationOutcome("token", "c1")).resolves.toEqual({ outcome: "Unset" });
  });

  it("throws when outcome is dropped - an absent field reads identically to 'Unset'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await caught(fetchConversationOutcome("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("outcome");
  });
});

describe("analytics report readers - shape validation", () => {
  const operatorAnalytics = {
    from: "a",
    to: "b",
    overall: bucket,
    previousFrom: "a",
    previousTo: "b",
    previousOverall: bucket,
    byChannel: [],
    byOperator: [],
    byReferrer: [],
    byCampaign: [],
  };

  it("fetchOperatorAnalytics resolves a complete report and throws when byChannel is dropped", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, operatorAnalytics));
    await expect(fetchOperatorAnalytics("token", {})).resolves.toMatchObject({ byChannel: [] });

    const truncated = {
      from: "a",
      to: "b",
      overall: bucket,
      previousFrom: "a",
      previousTo: "b",
      previousOverall: bucket,
      byOperator: [],
      byReferrer: [],
      byCampaign: [],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, truncated));
    const failure = await caught(fetchOperatorAnalytics("token", {}));
    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("byChannel");
  });

  it("fetchOwnAnalytics resolves a complete report (null load/conversion allowed) and throws when bucket is dropped", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { from: "a", to: "b", bucket, load: null, conversion: null }));
    await expect(fetchOwnAnalytics("token", {})).resolves.toMatchObject({ load: null });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { from: "a", to: "b", load: null, conversion: null }));
    expect(((await caught(fetchOwnAnalytics("token", {}))) as ApiProblemError).message).toContain("bucket");
  });

  it("fetchConversionReport throws when previousOverall is dropped", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { from: "a", to: "b", overall: bucket, previousFrom: "a", previousTo: "b", byOperator: [] }));
    expect(((await caught(fetchConversionReport("token", {}))) as ApiProblemError).code).toBe("shape.mismatch");
  });

  it("fetchTagBreakdownReport throws when percentageTagged is dropped", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        from: "a",
        to: "b",
        totalConversationCount: 0,
        taggedConversationCount: 0,
        previousFrom: "a",
        previousTo: "b",
        previousTotalConversationCount: 0,
        previousTaggedConversationCount: 0,
        previousPercentageTagged: null,
        byTag: [],
      }),
    );
    expect(((await caught(fetchTagBreakdownReport("token", {}))) as ApiProblemError).message).toContain("percentageTagged");
  });

  it("fetchBookingFlowReport resolves a complete report and throws when flowsClosed is dropped", async () => {
    const report = {
      from: "a",
      to: "b",
      flowsStarted: 0,
      flowsClosed: 0,
      previousFrom: "a",
      previousTo: "b",
      previousFlowsStarted: 0,
      previousFlowsClosed: 0,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, report));
    await expect(fetchBookingFlowReport("token", {})).resolves.toMatchObject({ flowsStarted: 0 });

    const truncated = {
      from: "a",
      to: "b",
      flowsStarted: 0,
      previousFrom: "a",
      previousTo: "b",
      previousFlowsStarted: 0,
      previousFlowsClosed: 0,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, truncated));
    expect(((await caught(fetchBookingFlowReport("token", {}))) as ApiProblemError).message).toContain("flowsClosed");
  });
});
