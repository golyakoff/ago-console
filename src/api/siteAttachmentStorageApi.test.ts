import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SiteAttachmentStorageError,
  fetchAttachmentEgress,
  fetchLargestConversations,
  fetchSiteAttachments,
  fetchStorageSummary,
} from "./siteAttachmentStorageApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for the four reads behind `StoragePage`. The list/
 * page readers reject a dropped element field (a real attachment reads as a blank row) and the two
 * stat readers reject a dropped byte figure (a blank/`NaN` quota bar) - the false-empty/blank cases the
 * bound names. Each rejects as `SiteAttachmentStorageError('shape.mismatch')`, surfaced localized by
 * that page's load `catch` via `shapeMismatchMessage`. Harness mirrors `maxChannelApi.test.ts`.
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

const listOptions = { sort: "sizeDesc", filter: "none" } as const;

const item = {
  id: "a-1",
  conversationId: "c-1",
  contentType: "image/png",
  sizeBytes: 1024,
  createdAt: "2026-08-01T00:00:00Z",
  downloadCount: 2,
  lastDownloadedAt: "2026-08-02T00:00:00Z",
  senderKind: "visitor",
  senderId: "v-1",
  isDuplicate: false,
};

const page = { items: [item], nextCursor: null };

describe("fetchSiteAttachments - shape validation", () => {
  it("resolves a well-formed page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, page));

    await expect(fetchSiteAttachments("token", "s1", listOptions)).resolves.toEqual(page);
  });

  it("resolves an empty page - no items is not a shape mismatch", async () => {
    const empty = { items: [], nextCursor: null };
    fetchMock.mockResolvedValue(jsonResponse(200, empty));

    await expect(fetchSiteAttachments("token", "s1", listOptions)).resolves.toEqual(empty);
  });

  it("throws SiteAttachmentStorageError('shape.mismatch') when the page envelope is missing items", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { nextCursor: null }));

    const failure = await caught(fetchSiteAttachments("token", "s1", listOptions));

    expect(failure).toBeInstanceOf(SiteAttachmentStorageError);
    expect((failure as SiteAttachmentStorageError).code).toBe("shape.mismatch");
    expect((failure as SiteAttachmentStorageError).message).toContain("items");
  });

  it("throws when an item is missing sizeBytes - the bulk-delete total would silently under-count", async () => {
    const withoutSize = without(item, "sizeBytes");
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [item, withoutSize], nextCursor: null }));

    const failure = await caught(fetchSiteAttachments("token", "s1", listOptions));

    expect(failure).toBeInstanceOf(SiteAttachmentStorageError);
    expect((failure as SiteAttachmentStorageError).message).toContain("sizeBytes");
    expect((failure as SiteAttachmentStorageError).message).toContain("[1]");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { nextCursor: null }));
    const failure = await caught(fetchSiteAttachments("token", "s1", listOptions));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("attachments");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});

describe("fetchLargestConversations - shape validation", () => {
  const largest = { conversationId: "c-1", totalBytes: 4096, attachmentCount: 3 };

  it("resolves a well-formed list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [largest]));

    await expect(fetchLargestConversations("token", "s1")).resolves.toEqual([largest]);
  });

  it("throws when a row is missing totalBytes", async () => {
    const withoutBytes = without(largest, "totalBytes");
    fetchMock.mockResolvedValue(jsonResponse(200, [withoutBytes]));

    const failure = await caught(fetchLargestConversations("token", "s1"));

    expect(failure).toBeInstanceOf(SiteAttachmentStorageError);
    expect((failure as SiteAttachmentStorageError).message).toContain("totalBytes");
  });
});

describe("fetchStorageSummary - shape validation", () => {
  it("resolves a well-formed summary", async () => {
    const summary = { usedBytes: 100, totalBytes: 1000 };
    fetchMock.mockResolvedValue(jsonResponse(200, summary));

    await expect(fetchStorageSummary("token", "s1")).resolves.toEqual(summary);
  });

  it("throws when totalBytes is dropped - the quota bar would render NaN%", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { usedBytes: 100 }));

    const failure = await caught(fetchStorageSummary("token", "s1"));

    expect(failure).toBeInstanceOf(SiteAttachmentStorageError);
    expect((failure as SiteAttachmentStorageError).message).toContain("totalBytes");
  });
});

describe("fetchAttachmentEgress - shape validation", () => {
  it("resolves a well-formed egress figure", async () => {
    const egress = { periodMonth: "2026-08", downloadCount: 5, bytesOut: 2048 };
    fetchMock.mockResolvedValue(jsonResponse(200, egress));

    await expect(fetchAttachmentEgress("token", "s1")).resolves.toEqual(egress);
  });

  it("throws when bytesOut is dropped", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { periodMonth: "2026-08", downloadCount: 5 }));

    const failure = await caught(fetchAttachmentEgress("token", "s1"));

    expect(failure).toBeInstanceOf(SiteAttachmentStorageError);
    expect((failure as SiteAttachmentStorageError).message).toContain("bytesOut");
  });
});
