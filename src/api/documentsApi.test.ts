import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentDocument,
  getDocumentVersion,
  getRequiredDocuments,
} from "./documentsApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for the two single-document reads. `PolicyPage`
 * renders `body` straight into a `<p>`, so a dropped `body` renders a blank policy document
 * indistinguishable from one with no text - the false-empty case. Rethrown as
 * `ApiProblemError('shape.mismatch')`. `getRequiredDocuments` is out of scope - it fails open to `[]`
 * and never throws (asserted below).
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

const document = {
  documentKey: "tenant-terms",
  version: "v3",
  sequence: 3,
  title: "Terms of Service",
  body: "You agree to the terms.",
  publishedAt: "2026-09-01T00:00:00Z",
};

describe("getCurrentDocument - shape validation", () => {
  it("resolves a well-formed document", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, document));

    await expect(getCurrentDocument("tenant-terms")).resolves.toEqual(document);
  });

  it("throws shape.mismatch when body is dropped - it would render a blank policy", async () => {
    const withoutBody = without(document, "body");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutBody));

    const failure = await caught(getCurrentDocument("tenant-terms"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("body");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutBody = without(document, "body");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutBody));
    const failure = await caught(getCurrentDocument("tenant-terms"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("documents");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});

describe("getDocumentVersion - shape validation", () => {
  it("resolves a well-formed version", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, document));

    await expect(getDocumentVersion("tenant-terms", "v3")).resolves.toEqual(document);
  });

  it("throws shape.mismatch when title is dropped, naming the versioned endpoint", async () => {
    const withoutTitle = without(document, "title");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutTitle));

    const failure = await caught(getDocumentVersion("tenant-terms", "v3"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("title");
    expect((failure as ApiProblemError).message).toContain("versions/v3");
  });
});

describe("getRequiredDocuments - out of scope (fails open, not guarded)", () => {
  it("returns a mis-shaped body verbatim rather than throwing - the guard is deliberately not applied", async () => {
    // A row missing every nullable field: the reader neither throws nor validates, by its own contract.
    fetchMock.mockResolvedValue(jsonResponse(200, [{ documentKey: "tenant-terms" }]));

    await expect(getRequiredDocuments("tenant")).resolves.toEqual([{ documentKey: "tenant-terms" }]);
  });
});
