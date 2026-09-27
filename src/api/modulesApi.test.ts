import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModulesError, fetchModules } from "./modulesApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchModules`. A dropped `modules` list renders
 * as "no modules enabled" and a truncated module row renders as one with no trigger words - the
 * false-empty case. Rethrown as `ModulesError('shape.mismatch')`, caught by `FaqModulePage`'s load
 * `catch` and surfaced localized via `shapeMismatchMessage`. `updateModule` (a PUT echo) is out of scope.
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

const moduleRow = { moduleKey: "faq", triggerWords: ["help"], entryPoint: "https://faq.example" };

describe("fetchModules - shape validation", () => {
  it("resolves a well-formed list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { modules: [moduleRow] }));

    await expect(fetchModules("token", "s-1")).resolves.toEqual({ modules: [moduleRow] });
  });

  it("resolves an empty list - no modules is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { modules: [] }));

    await expect(fetchModules("token", "s-1")).resolves.toEqual({ modules: [] });
  });

  it("throws shape.mismatch when the modules key is dropped - a site would read as having none", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await caught(fetchModules("token", "s-1"));

    expect(failure).toBeInstanceOf(ModulesError);
    expect((failure as ModulesError).code).toBe("shape.mismatch");
    expect((failure as ModulesError).message).toContain("modules");
  });

  it("throws shape.mismatch when a module row is missing triggerWords, naming the index", async () => {
    const withoutTriggers = without(moduleRow, "triggerWords");
    fetchMock.mockResolvedValue(jsonResponse(200, { modules: [moduleRow, withoutTriggers] }));

    const failure = await caught(fetchModules("token", "s-1"));

    expect(failure).toBeInstanceOf(ModulesError);
    expect((failure as ModulesError).message).toContain("triggerWords");
    expect((failure as ModulesError).message).toContain("[1]");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const failure = await caught(fetchModules("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("modules");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
