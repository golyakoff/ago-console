import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBaseError, fetchKnowledgeBase } from "./faqKnowledgeBaseApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchKnowledgeBase`. A dropped `text` renders as
 * a blank editor indistinguishable from a genuinely empty knowledge base - the false-empty case.
 * Rethrown as `KnowledgeBaseError('shape.mismatch')`, caught by `FaqModulePage`'s load `catch` and
 * surfaced localized via `shapeMismatchMessage`.
 *
 * Own file (not `faqKnowledgeBaseApi.test.ts`): that file mocks `config.faqApiBaseUrl` to `null` to
 * prove `requireBaseUrl` throws before the network; this one needs it set so the read reaches the body.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: "https://faq.test.invalid",
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

const knowledgeBase = { text: "Our hours are 9-5.", updatedAt: "2026-09-01T00:00:00Z" };

describe("fetchKnowledgeBase - shape validation", () => {
  it("resolves a well-formed knowledge base", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, knowledgeBase));

    await expect(fetchKnowledgeBase("token", "s-1")).resolves.toEqual(knowledgeBase);
  });

  it("resolves an empty text - a genuinely empty KB is not a shape mismatch", async () => {
    const empty = { text: "", updatedAt: null };
    fetchMock.mockResolvedValue(jsonResponse(200, empty));

    await expect(fetchKnowledgeBase("token", "s-1")).resolves.toEqual(empty);
  });

  it("throws shape.mismatch when text is dropped - it would render as a blank editor", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { updatedAt: null }));

    const failure = await caught(fetchKnowledgeBase("token", "s-1"));

    expect(failure).toBeInstanceOf(KnowledgeBaseError);
    expect((failure as KnowledgeBaseError).code).toBe("shape.mismatch");
    expect((failure as KnowledgeBaseError).message).toContain("text");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { updatedAt: null }));
    const failure = await caught(fetchKnowledgeBase("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("knowledge-base");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
