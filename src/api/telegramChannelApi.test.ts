import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTelegramChannelStatus } from "./telegramChannelApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `telegramChannelApi.ts#fetchTelegramChannelStatus`.
 * This is the channel-connection-status object the `23-99` bound names explicitly as in scope: a dropped
 * `connected` reads as `false` and `TelegramChannelPage` renders "not connected" for a shop whose bot is
 * live - a false negative. It rejects a mis-shaped response as `ApiProblemError('shape.mismatch')`,
 * surfaced localized by that page's load `catch` via `shapeMismatchMessage`. Harness follows
 * `conversationsApi.shape.test.ts`.
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

const status = {
  connected: true,
  channelCredentialId: "cred-1",
  createdAt: "2026-08-01T00:00:00Z",
  verified: true,
  unreachable: false,
  refusalReason: null,
  checkedAt: "2026-08-02T00:00:00Z",
};

describe("fetchTelegramChannelStatus - shape validation", () => {
  it("resolves when every field is present (nullable values allowed)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, status));

    await expect(fetchTelegramChannelStatus("token", "s1")).resolves.toEqual(status);
  });

  it("resolves a disconnected status (nullable fields null) - not connected is not a shape mismatch", async () => {
    const disconnected = {
      connected: false,
      channelCredentialId: null,
      createdAt: null,
      verified: null,
      unreachable: false,
      refusalReason: null,
      checkedAt: "2026-08-02T00:00:00Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, disconnected));

    await expect(fetchTelegramChannelStatus("token", "s1")).resolves.toEqual(disconnected);
  });

  it("throws ApiProblemError('shape.mismatch') when verified is dropped - an absent field reads as 'never verified'", async () => {
    const withoutVerified = {
      connected: true,
      channelCredentialId: "cred-1",
      createdAt: "2026-08-01T00:00:00Z",
      unreachable: false,
      refusalReason: null,
      checkedAt: "2026-08-02T00:00:00Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, withoutVerified));

    const failure = await caught(fetchTelegramChannelStatus("token", "s1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("verified");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutVerified = {
      connected: true,
      channelCredentialId: "cred-1",
      createdAt: "2026-08-01T00:00:00Z",
      unreachable: false,
      refusalReason: null,
      checkedAt: "2026-08-02T00:00:00Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, withoutVerified));
    const failure = await caught(fetchTelegramChannelStatus("token", "s1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("channels/telegram");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
