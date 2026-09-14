import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { AiAddOnPage } from "./AiAddOnPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `25-04`: the screen's own promise - <b>accepting the agreement and declaring a lawful basis are two
 * separate acts</b>, each with its own control, its own request and its own recorded date, and neither
 * one on its own is enough to turn the feature on.
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
  acceptAiAddOnAgreement: vi.fn(),
  declareAiProcessingBasis: vi.fn(),
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
    currentBody: "Подключая этот модуль, вы поручаете AGO передавать текст переписки...",
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

function page(): ReactNode {
  return (
    <Signed>
      <PermissionsProvider>
        <AiAddOnPage />
      </PermissionsProvider>
    </Signed>
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
  aiAddOnApi.acceptAiAddOnAgreement.mockResolvedValue(undefined);
  aiAddOnApi.declareAiProcessingBasis.mockResolvedValue(undefined);
  aiAddOnApi.enableAiAddOn.mockResolvedValue(undefined);
  aiAddOnApi.disableAiAddOn.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("the AI add-on screen", () => {
  it("offers two separate controls - accept, and declare - and neither does the other's job", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(status());
    const container = await render(page());

    const accept = buttonLabelled(container, "I have read and accept this agreement");
    const declare = buttonLabelled(container, "I declare that we hold a lawful basis");
    expect(accept).not.toBeNull();
    expect(declare).not.toBeNull();

    await interact(() => accept.click());

    expect(aiAddOnApi.acceptAiAddOnAgreement).toHaveBeenCalledTimes(1);
    // The acceptance names the version the tenant was shown, and it did not also declare anything.
    expect(aiAddOnApi.acceptAiAddOnAgreement).toHaveBeenCalledWith("token", SITE_ID, "v1");
    expect(aiAddOnApi.declareAiProcessingBasis).not.toHaveBeenCalled();
    expect(aiAddOnApi.enableAiAddOn).not.toHaveBeenCalled();
  });

  it("declaring does not accept anything either", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(status());
    const container = await render(page());

    await interact(() => buttonLabelled(container, "I declare that we hold a lawful basis").click());

    expect(aiAddOnApi.declareAiProcessingBasis).toHaveBeenCalledTimes(1);
    expect(aiAddOnApi.acceptAiAddOnAgreement).not.toHaveBeenCalled();
  });

  it("will not let the tenant turn it on with only one of the two facts recorded", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({ acceptedVersion: "v1", acceptedAt: "2026-09-14T12:00:00+00:00" }),
    );
    const container = await render(page());

    const enable = buttonLabelled(container, "Turn AI features on");
    expect(enable).not.toBeNull();
    expect(enable.disabled).toBe(true);
    expect(container.textContent).toContain("Accept the agreement and make the declaration first");
  });

  it("enables once both facts are recorded", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(
      status({
        acceptedVersion: "v1",
        acceptedAt: "2026-09-14T12:00:00+00:00",
        declaredBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        declaredAt: "2026-09-14T12:07:00+00:00",
      }),
    );
    const container = await render(page());

    const enable = buttonLabelled(container, "Turn AI features on");
    expect(enable.disabled).toBe(false);
    await interact(() => enable.click());

    expect(aiAddOnApi.enableAiAddOn).toHaveBeenCalledTimes(1);
  });

  it("shows the cut-off once it is on, because that is what bounds what is ever sent", async () => {
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

    expect(container.textContent).toContain("Only conversations created from this moment on are ever sent");
    expect(container.textContent).toContain("2026-09-14T12:10:00+00:00");
    expect(buttonLabelled(container, "Turn AI features off")).not.toBeNull();
  });

  it("says so plainly when the workspace has not bought the add-on", async () => {
    aiAddOnApi.fetchAiAddOnStatus.mockResolvedValue(status({ purchased: false }));
    const container = await render(page());

    expect(container.textContent).toContain("This workspace does not have the AI add-on");
  });
});
