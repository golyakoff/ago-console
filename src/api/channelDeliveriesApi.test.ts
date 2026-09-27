import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChannelDeliveries } from "./channelDeliveriesApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `channelDeliveriesApi.ts`. `fetchChannelDeliveries`
 * renders a list whose empty state is a legitimate, expected one (a widget conversation has no channel
 * deliveries - `Thread`'s own caption says so), so a dropped `deliveries` array or a truncated row would
 * read as that same "expected empty" rather than as a failure. It therefore rejects a mis-shaped
 * response as `ApiProblemError('shape.mismatch')`, the same type every other rejection in that file
 * already produces. Harness follows `conversationsApi.shape.test.ts`'s own `fetchMock`/`jsonResponse`.
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

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((reason: unknown) => reason);
}

const delivery = {
  id: "d1",
  messageId: "m1",
  channelKind: "Telegram",
  status: "Delivered",
  providerMessageId: "p1",
  failureReason: null,
  attemptedAt: "2026-08-01T00:00:00Z",
};

describe("fetchChannelDeliveries - shape validation", () => {
  it("resolves the list when every row carries its required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { deliveries: [delivery] }));

    await expect(fetchChannelDeliveries("token", "c1")).resolves.toEqual([delivery]);
  });

  it("resolves an empty list as an empty list - a widget conversation with no deliveries is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { deliveries: [] }));

    await expect(fetchChannelDeliveries("token", "c1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when one row is missing status", async () => {
    const truncated = { id: "d2", messageId: "m2", channelKind: "Sms", attemptedAt: "2026-08-01T00:00:00Z" };
    fetchMock.mockResolvedValue(jsonResponse(200, { deliveries: [delivery, truncated] }));

    const failure = await caught(fetchChannelDeliveries("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("status");
  });

  it("throws when the deliveries array is dropped entirely - an absent list reads as 'no deliveries, expected'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await caught(fetchChannelDeliveries("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const failure = await caught(fetchChannelDeliveries("token", "c1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("channel-deliveries");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
