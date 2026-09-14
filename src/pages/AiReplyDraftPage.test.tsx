import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { AiReplyDraftPage } from "./AiReplyDraftPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `23-38`: this screen's own promise - a tenant who has bought the AI add-on and already finished
 * `25-04`'s two declarations can turn the reply draft on and off here, and reads what it sends before
 * deciding; a tenant who has not is told why, in each of those two distinct shapes, rather than shown
 * a second copy of the accept/declare controls `AiAddOnPage` already owns.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: "",
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const aiAddOnApi = vi.hoisted(() => ({
  fetchAiAddOnStatus: vi.fn(),
  enableAiAddOn: vi.fn(),
  disableAiAddOn: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/aiAddOnApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/aiAddOnApi.js")>("../api/aiAddOnApi.js");
  return { ...actual, ...aiAddOnApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function status(overrides: Partial<import("../api/aiAddOnApi.js").AiAddOnStatusDto> = {}) {
  return {
    purchased: true,
    enabled: false,
    effectiveFrom: null,
    documentKey: "ai-processing-addendum",
    currentVersion: "v1",
    currentTitle: "AI addendum",
    currentBody: "Подключая этот модуль...",
    acceptedVersion: null,
    acceptedAt: null,
    declaredBy: null,
    declaredAt: null,
    ...overrides,
  };
}

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({
      user: signedIn(),
      isLoading: false,
      isSigningOut: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Wrapped in a `MemoryRouter` for the same reason `ProductsPage.test.tsx`'s `page` is - the
 * not-purchased and setup-incomplete branches each render a `<Link>` to `/account/ai`, which throws
 * outside a router context. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <AiReplyDraftPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function buttonLabelled(container: HTMLElement, label: string): HTMLButtonElement | null {
  return byText<HTMLButtonElement>(container, "button", label);
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  aiAddOnApi.enableAiAddOn.mockResolvedValue(undefined);
  aiAddOnApi.disableAiAddOn.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("the reply-draft screen", () => {
  it("states what leaves the deployment on screen, not only inside an agreement", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(status());
    const container = await render(page());

    expect(container.textContent).toContain("YandexGPT");
    expect(container.textContent).toContain("recent messages");
  });

  it("explains rather than disappears when the workspace has not bought the add-on, offering no switch", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(status({ purchased: false }));
    const container = await render(page());

    expect(container.textContent).toContain("This workspace has not bought the AI add-on");
    expect(buttonLabelled(container, "Turn reply drafts on")).toBeNull();
    expect(buttonLabelled(container, "Turn reply drafts off")).toBeNull();
    expect(byText(container, "a", "Go to AI features")).not.toBeNull();
  });

  it("points at the AI features page, not a duplicate accept/declare control, when purchased but not yet accepted", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(status({ purchased: true }));
    const container = await render(page());

    expect(container.textContent).toContain("accept the AI features agreement");
    expect(byText(container, "a", "Go to AI features")).not.toBeNull();
    expect(container.textContent).not.toContain("I have read and accept this agreement");
    expect(buttonLabelled(container, "Turn reply drafts on")).toBeNull();
  });

  it("still withholds the switch when accepted but not yet declared", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({ acceptedVersion: "v1", acceptedAt: "2026-09-14T12:00:00+00:00" }),
    );
    const container = await render(page());

    expect(container.textContent).toContain("accept the AI features agreement");
    expect(buttonLabelled(container, "Turn reply drafts on")).toBeNull();
  });

  it("offers the switch, off, once both facts are recorded", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({
        acceptedVersion: "v1",
        acceptedAt: "2026-09-14T12:00:00+00:00",
        declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        declaredAt: "2026-09-14T12:07:00+00:00",
      }),
    );
    const container = await render(page());

    const enable = buttonLabelled(container, "Turn reply drafts on");
    expect(enable).not.toBeNull();
    expect(container.textContent).toContain("Off");

    await interact(() => enable.click());

    expect(aiAddOnApi.enableAiAddOn).toHaveBeenCalledTimes(1);
    expect(aiAddOnApi.enableAiAddOn).toHaveBeenCalledWith("token", SITE_ID);
  });

  it("does not show the switch as on until the server confirms it - no optimistic flip", async () => {
    const ready = status({
      acceptedVersion: "v1",
      acceptedAt: "2026-09-14T12:00:00+00:00",
      declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      declaredAt: "2026-09-14T12:07:00+00:00",
    });
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValueOnce(ready);
    let resolveEnable: () => void = () => undefined;
    aiAddOnApi.enableAiAddOn.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEnable = resolve;
      }),
    );
    const container = await render(page());

    const enable = buttonLabelled(container, "Turn reply drafts on");
    await interact(() => enable.click());

    // The request is in flight - still "Off", not flipped ahead of the server.
    expect(container.textContent).toContain("Off");

    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValueOnce({
      ...ready,
      enabled: true,
      effectiveFrom: "2026-09-14T12:10:00+00:00",
    });
    await interact(() => resolveEnable());

    expect(container.textContent).toContain("On");
    expect(buttonLabelled(container, "Turn reply drafts off")).not.toBeNull();
  });

  it("turns it off again, only after the server confirms", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({
        enabled: true,
        effectiveFrom: "2026-09-14T12:10:00+00:00",
        acceptedVersion: "v1",
        acceptedAt: "2026-09-14T12:00:00+00:00",
        declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        declaredAt: "2026-09-14T12:07:00+00:00",
      }),
    );
    const container = await render(page());

    const disable = buttonLabelled(container, "Turn reply drafts off");
    await interact(() => disable.click());

    expect(aiAddOnApi.disableAiAddOn).toHaveBeenCalledTimes(1);
    expect(aiAddOnApi.disableAiAddOn).toHaveBeenCalledWith("token", SITE_ID);
  });

  it("names this as the same switch as the AI features page, so a tenant is not surprised by the categoriser stopping too", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({
        acceptedVersion: "v1",
        acceptedAt: "2026-09-14T12:00:00+00:00",
        declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        declaredAt: "2026-09-14T12:07:00+00:00",
      }),
    );
    const container = await render(page());

    expect(container.textContent).toContain("same switch as the one on the AI features page");
  });

  it("surfaces a failed enable call as an error, and does not report success", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({
        acceptedVersion: "v1",
        acceptedAt: "2026-09-14T12:00:00+00:00",
        declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        declaredAt: "2026-09-14T12:07:00+00:00",
      }),
    );
    const { AiAddOnError } = await import("../api/aiAddOnApi.js");
    aiAddOnApi.enableAiAddOn.mockRejectedValue(new AiAddOnError("AiAddOn.Unknown", "The provider refused the request."));
    const container = await render(page());

    const enable = buttonLabelled(container, "Turn reply drafts on");
    await interact(() => enable.click());

    expect(container.textContent).toContain("The provider refused the request.");
    expect(container.textContent).toContain("Off");
  });

  it("surfaces a failed disable call as an error, and leaves the state showing on", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({
        enabled: true,
        effectiveFrom: "2026-09-14T12:10:00+00:00",
        acceptedVersion: "v1",
        acceptedAt: "2026-09-14T12:00:00+00:00",
        declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        declaredAt: "2026-09-14T12:07:00+00:00",
      }),
    );
    const { AiAddOnError } = await import("../api/aiAddOnApi.js");
    aiAddOnApi.disableAiAddOn.mockRejectedValue(new AiAddOnError("AiAddOn.Unknown", "Could not reach the server."));
    const container = await render(page());

    const disable = buttonLabelled(container, "Turn reply drafts off");
    await interact(() => disable.click());

    expect(container.textContent).toContain("Could not reach the server.");
    expect(container.textContent).toContain("On");
  });
});
