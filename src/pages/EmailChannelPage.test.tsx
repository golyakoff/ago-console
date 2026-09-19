import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { EmailChannelPage, EMAIL_CHANNEL_PERMISSION } from "./EmailChannelPage.js";
import { ApiProblemError } from "../api/emailChannelApi.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `25-160`: `/channels/email` - a settings form, not a connect/disconnect flow (`EmailChannelPage`'s
 * own doc comment), so this file is modeled on `WidgetConfigPage.test.tsx`'s shape more than
 * `VkChannelPage.test.tsx`'s - one screen, one permission (`site:configure`), two independent writes.
 * `validateLogoFileClientSide` is mocked rather than exercised for real - jsdom has no real image
 * decoder behind `Image`/`URL.createObjectURL`, and this item's own client-side check is a courtesy
 * layer with its own dedicated unit coverage elsewhere (a future addition; not built as part of this
 * page-level test).
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
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const emailChannelApi = vi.hoisted(() => ({
  fetchSiteBranding: vi.fn(),
  updateSiteBrandCompanyName: vi.fn(),
  uploadSiteLogo: vi.fn(),
}));
const logoValidation = vi.hoisted(() => ({ validateLogoFileClientSide: vi.fn() }));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/emailChannelApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/emailChannelApi.js")>("../api/emailChannelApi.js");
  return { ...actual, ...emailChannelApi };
});
vi.mock("./emailChannelLogoValidation.js", async () => {
  const actual = await vi.importActual<typeof import("./emailChannelLogoValidation.js")>("./emailChannelLogoValidation.js");
  return { ...actual, ...logoValidation };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
          <EmailChannelPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function branding(overrides: Partial<{ brandCompanyName: string | null; logoUrl: string | null; logoStatus: string; logoRejectionReason: string | null }> = {}) {
  emailChannelApi.fetchSiteBranding.mockResolvedValue({
    brandCompanyName: null,
    logoUrl: null,
    logoStatus: "None",
    logoRejectionReason: null,
    ...overrides,
  });
}

function companyNameField(container: HTMLElement): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Company name");
  if (label === null) {
    throw new Error("no 'Company name' field label found");
  }
  const id = label.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (!(field instanceof HTMLInputElement)) {
    throw new Error("'Company name' field is not an <input>");
  }
  return field;
}

function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("no file input found");
  }
  return input;
}

function chooseFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [EMAIL_CHANNEL_PERMISSION], siteId: SITE_ID });
  branding();
  logoValidation.validateLogoFileClientSide.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:configure, and never calls fetchSiteBranding", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You don't have permission to configure this site's branding.");
    expect(emailChannelApi.fetchSiteBranding).not.toHaveBeenCalled();
  });

  it("offers it, and loads branding, to an operator holding site:configure", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Company name");
    expect(emailChannelApi.fetchSiteBranding).toHaveBeenCalledWith("token", SITE_ID);
  });
});

describe("company name", () => {
  it("saves the typed name and shows a success message", async () => {
    emailChannelApi.updateSiteBrandCompanyName.mockResolvedValue({ brandCompanyName: "Acme Repairs LLC" });

    const container = await render(page());
    await interact(() => setTextValue(companyNameField(container), "Acme Repairs LLC"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save").click());

    expect(emailChannelApi.updateSiteBrandCompanyName).toHaveBeenCalledWith("token", SITE_ID, "Acme Repairs LLC");
    expect(container.textContent).toContain("Saved.");
  });

  it("shows the server's own error message when the save is refused", async () => {
    emailChannelApi.updateSiteBrandCompanyName.mockRejectedValue(
      new ApiProblemError("Site.BrandCompanyNameTooLong", "Brand company name is 250 characters; the limit is 200.", 400),
    );

    const container = await render(page());
    await interact(() => setTextValue(companyNameField(container), "x".repeat(250)));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save").click());

    expect(container.textContent).toContain("Brand company name is 250 characters; the limit is 200.");
  });
});

describe("logo upload", () => {
  it("runs the client-side check first, and uploads only when it passes", async () => {
    emailChannelApi.uploadSiteLogo.mockResolvedValue({ logoStatus: "Pending" });
    branding({ logoStatus: "Pending" });

    const container = await render(page());
    const file = new File(["fake-bytes"], "logo.png", { type: "image/png" });
    await interact(() => chooseFile(fileInput(container), file));

    expect(logoValidation.validateLogoFileClientSide).toHaveBeenCalledWith(file);
    expect(emailChannelApi.uploadSiteLogo).toHaveBeenCalledWith("token", SITE_ID, file);
    expect(container.textContent).toContain("Checking…");
  });

  it("never calls the upload endpoint when the client-side check fails", async () => {
    logoValidation.validateLogoFileClientSide.mockResolvedValue({ ok: false, reason: "invalid-dimensions" });

    const container = await render(page());
    const file = new File(["fake-bytes"], "logo.png", { type: "image/png" });
    await interact(() => chooseFile(fileInput(container), file));

    expect(emailChannelApi.uploadSiteLogo).not.toHaveBeenCalled();
    expect(container.textContent).toContain("That image is larger than 100x100 pixels.");
  });

  it("shows a rejected badge and the server's own reason when the logo was rejected", async () => {
    branding({ logoStatus: "Rejected", logoRejectionReason: "Animated images are not supported." });

    const container = await render(page());

    expect(container.textContent).toContain("Rejected");
    expect(container.textContent).toContain("Animated images are not supported.");
  });

  it("shows the public logo URL directly once ready", async () => {
    branding({ logoStatus: "Ready", logoUrl: "https://files.test.invalid/attachments/site/logo/one.png" });

    const container = await render(page());

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://files.test.invalid/attachments/site/logo/one.png");
  });
});
