import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineAutoReplyError, fetchOfflineAutoReply } from "./offlineAutoReplyApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchOfflineAutoReply`. A dropped `enabled`
 * renders as an *off* auto-reply (false negative); a dropped `rules` renders as "no rules" and a
 * truncated rule as an empty row (false empty). Rethrown as `OfflineAutoReplyError('shape.mismatch')`,
 * caught by `OfflineAutoReplyPage`'s load `catch` and surfaced localized via `shapeMismatchMessage`.
 * `updateOfflineAutoReply` (a PUT echo) is out of scope.
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

function without(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const autoReply = {
  enabled: true,
  fallbackReply: "We are away, back soon.",
  rules: [{ keyword: "hours", reply: "9-5" }],
};

describe("fetchOfflineAutoReply - shape validation", () => {
  it("resolves a well-formed config", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, autoReply));

    await expect(fetchOfflineAutoReply("token", "s-1")).resolves.toEqual(autoReply);
  });

  it("resolves an empty rules list - no rules is not a shape mismatch", async () => {
    const empty = { ...autoReply, rules: [] };
    fetchMock.mockResolvedValue(jsonResponse(200, empty));

    await expect(fetchOfflineAutoReply("token", "s-1")).resolves.toEqual(empty);
  });

  it("throws shape.mismatch when enabled is dropped - it would read as off", async () => {
    const withoutEnabled = without(autoReply, "enabled");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutEnabled));

    const failure = await caught(fetchOfflineAutoReply("token", "s-1"));

    expect(failure).toBeInstanceOf(OfflineAutoReplyError);
    expect((failure as OfflineAutoReplyError).code).toBe("shape.mismatch");
    expect((failure as OfflineAutoReplyError).message).toContain("enabled");
  });

  it("throws shape.mismatch when a rule is missing reply, naming the index", async () => {
    const withoutReply = without(autoReply.rules[0], "reply");
    fetchMock.mockResolvedValue(jsonResponse(200, { ...autoReply, rules: [withoutReply] }));

    const failure = await caught(fetchOfflineAutoReply("token", "s-1"));

    expect(failure).toBeInstanceOf(OfflineAutoReplyError);
    expect((failure as OfflineAutoReplyError).message).toContain("reply");
    expect((failure as OfflineAutoReplyError).message).toContain("[0]");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutEnabled = without(autoReply, "enabled");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutEnabled));
    const failure = await caught(fetchOfflineAutoReply("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("offline-auto-reply");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
