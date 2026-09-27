import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSiteInstallation } from "./installationApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchSiteInstallation`. A dropped
 * `allowedOrigins` renders as "no origins configured" and a dropped `state`/`publicKey` blanks the
 * install snippet - the false-empty case. Rethrown as `ApiProblemError('shape.mismatch')`, caught by
 * `InstallSnippetPage`'s load `catch` and surfaced localized via `shapeMismatchMessage`.
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

const installation = {
  publicKey: "pk_abc",
  allowedOrigins: ["https://shop.example"],
  firstSeenAt: null,
  lastSeenAt: null,
  lastRefusedOrigin: null,
  lastRefusedOriginAt: null,
  usedRecently: false,
  state: "NotSeenYet",
};

describe("fetchSiteInstallation - shape validation", () => {
  it("resolves a well-formed installation", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, installation));

    await expect(fetchSiteInstallation("token", "s-1")).resolves.toEqual(installation);
  });

  it("resolves with an empty allowedOrigins - no configured origins is not a shape mismatch", async () => {
    const empty = { ...installation, allowedOrigins: [] };
    fetchMock.mockResolvedValue(jsonResponse(200, empty));

    await expect(fetchSiteInstallation("token", "s-1")).resolves.toEqual(empty);
  });

  it("throws shape.mismatch when allowedOrigins is dropped - it would read as no origins", async () => {
    const withoutOrigins = without(installation, "allowedOrigins");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutOrigins));

    const failure = await caught(fetchSiteInstallation("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("allowedOrigins");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutState = without(installation, "state");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutState));
    const failure = await caught(fetchSiteInstallation("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("installation");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
