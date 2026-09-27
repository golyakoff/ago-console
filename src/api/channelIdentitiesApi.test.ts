import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChannelIdentities } from "./channelIdentitiesApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `channelIdentitiesApi.ts`. `fetchChannelIdentities`
 * renders the visitor's linked channels as a list whose empty state ("no linked channels") is a
 * legitimate one for a widget-only visitor - so a dropped `channelIdentities` array or a truncated row
 * would read as that same false empty rather than as a failure. It rejects a mis-shaped response as
 * `ApiProblemError('shape.mismatch')`, which `ChannelIdentitiesPanel`'s load `catch` now surfaces
 * localized via `shapeMismatchMessage`. Harness follows `conversationsApi.shape.test.ts`.
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

const identity = {
  channelIdentityId: "ci1",
  kind: "Telegram",
  address: "@someone",
  firstSeenAt: "2026-08-01T00:00:00Z",
  lastSeenAt: "2026-08-02T00:00:00Z",
  isPreferred: false,
};

describe("fetchChannelIdentities - shape validation", () => {
  it("resolves the list when every row carries its required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { channelIdentities: [identity] }));

    await expect(fetchChannelIdentities("token", "c1")).resolves.toEqual([identity]);
  });

  it("resolves an empty list as an empty list - a widget-only visitor is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { channelIdentities: [] }));

    await expect(fetchChannelIdentities("token", "c1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when one row is missing isPreferred", async () => {
    const truncated = {
      channelIdentityId: "ci2",
      kind: "Sms",
      address: "+10000000000",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-02T00:00:00Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { channelIdentities: [identity, truncated] }));

    const failure = await caught(fetchChannelIdentities("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("isPreferred");
  });

  it("throws when the channelIdentities array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await caught(fetchChannelIdentities("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const failure = await caught(fetchChannelIdentities("token", "c1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("channel-identities");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
