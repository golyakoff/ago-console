import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { StoragePage } from "./StoragePage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type {
  AttachmentListItemDto,
  AttachmentListPageDto,
  AttachmentStorageSummaryDto,
} from "../api/siteAttachmentStorageApi.js";

/**
 * `23-80`/`23-82`: `/account/storage`. Modeled on `BillingPage.test.tsx`'s shape for a permission-gated,
 * data-fetching settings screen - the real `PermissionsProvider`, `GET /api/v1/operators/me` faked,
 * this screen's own API module faked for everything else.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const storageApi = vi.hoisted(() => ({
  fetchSiteAttachments: vi.fn(),
  fetchStorageSummary: vi.fn(),
  fetchAttachmentEgress: vi.fn(),
  fetchLargestConversations: vi.fn(),
  bulkDeleteAttachments: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/siteAttachmentStorageApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/siteAttachmentStorageApi.js")>(
    "../api/siteAttachmentStorageApi.js",
  );
  return { ...actual, ...storageApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ATTACHMENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <StoragePage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function anAttachment(overrides: Partial<AttachmentListItemDto> = {}): AttachmentListItemDto {
  return {
    id: ATTACHMENT_ID,
    conversationId: CONVERSATION_ID,
    contentType: "image/png",
    sizeBytes: 1_048_576,
    createdAt: "2026-01-01T12:00:00Z",
    downloadCount: 0,
    lastDownloadedAt: null,
    senderKind: "Visitor",
    senderId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    isDuplicate: false,
    ...overrides,
  };
}

function aPage(items: AttachmentListItemDto[]): AttachmentListPageDto {
  return { items, nextCursor: null };
}

function aSummary(overrides: Partial<AttachmentStorageSummaryDto> = {}): AttachmentStorageSummaryDto {
  return { usedBytes: 10 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  storageApi.fetchSiteAttachments.mockResolvedValue(aPage([anAttachment()]));
  storageApi.fetchStorageSummary.mockResolvedValue(aSummary());
  storageApi.fetchAttachmentEgress.mockResolvedValue({ periodMonth: "2026-01", downloadCount: 3, bytesOut: 3_000_000 });
  storageApi.fetchLargestConversations.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:configure, and never calls the storage API - nothing leaked", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's storage.");
    expect(storageApi.fetchSiteAttachments).not.toHaveBeenCalled();
    expect(storageApi.fetchStorageSummary).not.toHaveBeenCalled();
  });

  it("offers it to an operator holding site:configure, and shows the real quota figures", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Used: ");
    // 10 MiB used of 100 MiB total, formatted by formatByteSize (owner/ownerSites.js).
    expect(container.textContent).toContain("10.0 MiB");
    expect(container.textContent).toContain("100.0 MiB");
    expect(container.textContent).toContain("image/png");
  });
});

describe("bulk delete", () => {
  it("shows the count and total before confirming, then calls bulkDeleteAttachments with the selected id", async () => {
    storageApi.bulkDeleteAttachments.mockResolvedValue({ deletedCount: 1, freedBytes: 1_048_576, notFoundIds: [], alreadyGoneCount: 0 });

    const container = await render(page());

    const checkbox = one<HTMLInputElement>(container, "input[type=checkbox]");
    await interact(() => checkbox.click());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete selected (1)").click());

    // The pre-confirm dialog states what will be freed - "Delete 1 files, freeing 1.0 MiB".
    expect(container.textContent).toContain("1.0 MiB");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete").click());

    expect(storageApi.bulkDeleteAttachments).toHaveBeenCalledWith("token", SITE_ID, [ATTACHMENT_ID]);
    expect(container.textContent).toContain("Deleted ");
  });
});

describe("the never-downloaded and duplicate signals", () => {
  it("shows the never-downloaded badge for a zero-download attachment", async () => {
    storageApi.fetchSiteAttachments.mockResolvedValue(aPage([anAttachment({ downloadCount: 0 })]));

    const container = await render(page());

    expect(container.textContent).toContain("never");
  });

  it("shows a duplicate badge when the server marks an item as a duplicate", async () => {
    storageApi.fetchSiteAttachments.mockResolvedValue(aPage([anAttachment({ isDuplicate: true })]));

    const container = await render(page());

    expect(container.textContent).toContain("duplicate");
  });
});
