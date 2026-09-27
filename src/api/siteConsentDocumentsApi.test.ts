import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SiteConsentDocumentsError,
  fetchSiteConsentAcceptances,
  fetchSiteConsentDocuments,
} from "./siteConsentDocumentsApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for the two consent-document reads. On the summary, a
 * dropped `contactConsentRequired` renders as an *off* consent gate (false negative); on the acceptances
 * list, a truncated row renders as blank columns (false empty). Both rethrow
 * `SiteConsentDocumentsError('shape.mismatch')`, caught by `DocumentsPage`'s load `catch` and surfaced
 * localized via `shapeMismatchMessage`. `publishSiteConsentDocument` (a POST echo) is out of scope.
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

const documents = {
  contact: { purpose: "Contact", documentKey: "contact", versions: [] },
  contactConsentRequired: false,
  marketing: { purpose: "Marketing", documentKey: "marketing", versions: [] },
};

const acceptance = {
  subjectKind: "visitor",
  subjectId: "v-1",
  documentVersion: "v3",
  acceptedAt: "2026-09-01T00:00:00Z",
};

describe("fetchSiteConsentDocuments - shape validation", () => {
  it("resolves a well-formed summary", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, documents));

    await expect(fetchSiteConsentDocuments("token", "s-1")).resolves.toEqual(documents);
  });

  it("throws shape.mismatch when contactConsentRequired is dropped - it would read as off", async () => {
    const withoutFlag = without(documents, "contactConsentRequired");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutFlag));

    const failure = await caught(fetchSiteConsentDocuments("token", "s-1"));

    expect(failure).toBeInstanceOf(SiteConsentDocumentsError);
    expect((failure as SiteConsentDocumentsError).code).toBe("shape.mismatch");
    expect((failure as SiteConsentDocumentsError).message).toContain("contactConsentRequired");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutFlag = without(documents, "contactConsentRequired");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutFlag));
    const failure = await caught(fetchSiteConsentDocuments("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("consent-documents");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});

describe("fetchSiteConsentAcceptances - shape validation", () => {
  it("resolves a well-formed list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [acceptance]));

    await expect(fetchSiteConsentAcceptances("token", "s-1", "Contact")).resolves.toEqual([acceptance]);
  });

  it("resolves an empty list - nobody accepted yet is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await expect(fetchSiteConsentAcceptances("token", "s-1", "Contact")).resolves.toEqual([]);
  });

  it("throws shape.mismatch when an acceptance row is missing acceptedAt", async () => {
    const withoutAt = without(acceptance, "acceptedAt");
    fetchMock.mockResolvedValue(jsonResponse(200, [acceptance, withoutAt]));

    const failure = await caught(fetchSiteConsentAcceptances("token", "s-1", "Contact"));

    expect(failure).toBeInstanceOf(SiteConsentDocumentsError);
    expect((failure as SiteConsentDocumentsError).message).toContain("acceptedAt");
    expect((failure as SiteConsentDocumentsError).message).toContain("[1]");
  });
});
