import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetConfigError, fetchWidgetConfig } from "./widgetConfigApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchWidgetConfig`. The widget-config screen is
 * a form of toggles, so a dropped boolean would render as an *off* switch indistinguishable from a
 * tenant who really turned it off - the false-negative case the bound targets. A mis-shaped `200` body
 * is rethrown as `WidgetConfigError('shape.mismatch')`, caught by `WidgetConfigPage`'s load `catch` and
 * surfaced localized via `shapeMismatchMessage`. Harness mirrors `ownerApi.test.ts`.
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

const widgetConfig = {
  primaryColorHex: "#123456",
  position: "BottomRight",
  locale: "En",
  noticeText: null,
  noticeUrl: null,
  requireContactConsent: false,
  attractAttention: false,
  autoOpenEnabled: false,
  autoOpenDelaySeconds: 30,
  autoOpenGreetingText: null,
  acceptUnverifiedPhone: false,
  allowAttachmentUploadsByDefault: false,
  contactCaptureConfirmationText: null,
  channelSwitcherPlacement: "AboveComposer",
  channelSwitcherIconSize: "Medium",
  panelTitle: null,
};

describe("fetchWidgetConfig - shape validation", () => {
  it("resolves a well-formed config", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, widgetConfig));

    await expect(fetchWidgetConfig("token", "s-1")).resolves.toEqual(widgetConfig);
  });

  it("throws shape.mismatch when a boolean toggle is dropped - it would render as silently off", async () => {
    const withoutFlag = without(widgetConfig, "autoOpenEnabled");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutFlag));

    const failure = await caught(fetchWidgetConfig("token", "s-1"));

    expect(failure).toBeInstanceOf(WidgetConfigError);
    expect((failure as WidgetConfigError).code).toBe("shape.mismatch");
    expect((failure as WidgetConfigError).message).toContain("autoOpenEnabled");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutFlag = without(widgetConfig, "autoOpenEnabled");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutFlag));
    const failure = await caught(fetchWidgetConfig("token", "s-1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("widget-config");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
