import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBaseError, fetchKnowledgeBase, updateKnowledgeBase } from "./faqKnowledgeBaseApi.js";

/**
 * `19-03`: the one piece of genuinely new logic in this module, as opposed to the problem-details
 * parsing it copies from `widgetConfigApi.ts`'s own long-proven `buildError` shape (not re-tested here
 * for the same reason no sibling `*Api.ts` module in this codebase has its own test file - the copied
 * boilerplate is exercised indirectly through every page test that mocks it). `requireBaseUrl`'s
 * "not configured" guard is different: it is this file's own addition, and no page-level test exercises
 * it directly - `FaqModulePage.test.tsx` mocks `config.faqApiBaseUrl` to a real (fake) URL so the panel
 * renders its form, and `permissionGating.test.tsx` mocks `config.faqApiBaseUrl` to `null` but never
 * calls the *real* `fetchKnowledgeBase`/`updateKnowledgeBase` (those two are themselves mocked there).
 * This file is what actually proves `requireBaseUrl` throws before ever touching the network, rather
 * than the guard being asserted only by inspection.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
  },
}));

const fetchMock = vi.fn(() => {
  throw new Error("fetch should not have been called - requireBaseUrl should have thrown first");
});

describe("faqKnowledgeBaseApi, with no faqApiBaseUrl configured", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchKnowledgeBase rejects with KnowledgeBaseError.NotConfigured, without attempting a network call", async () => {
    await expect(fetchKnowledgeBase("token", "site-id")).rejects.toMatchObject({
      code: "KnowledgeBase.NotConfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchKnowledgeBase rejects with a real KnowledgeBaseError instance", async () => {
    await expect(fetchKnowledgeBase("token", "site-id")).rejects.toBeInstanceOf(KnowledgeBaseError);
  });

  it("updateKnowledgeBase rejects with KnowledgeBaseError.NotConfigured, without attempting a network call", async () => {
    await expect(updateKnowledgeBase("token", "site-id", "some text")).rejects.toMatchObject({
      code: "KnowledgeBase.NotConfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
