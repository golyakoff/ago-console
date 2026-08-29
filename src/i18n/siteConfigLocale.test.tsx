import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { OperatorShell } from "../shell/OperatorShell.js";
import { AdminConversationsPage } from "../pages/AdminConversationsPage.js";
import { WidgetConfigPage } from "../pages/WidgetConfigPage.js";
import { OfflineAutoReplyPage } from "../pages/OfflineAutoReplyPage.js";
import { CannedResponsesPage } from "../pages/CannedResponsesPage.js";
import { all, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `11-13`'s own Done-when, read as a DOM test rather than asserted from the string table alone -
 * `consoleLocale.test.tsx`'s/`workspaceLocale.test.tsx`'s twin for the last three `site:configure`-
 * gated screens. Same substitution those two files already make and for the same reason: inject
 * `PermissionsContext` directly rather than going through `PermissionsProvider`, because that provider
 * opens a real fetch this file has no reason to exercise (`operatorsApi`/`tenanciesApi` are not what
 * is under test here).
 *
 * Locale still travels through the real production path: `PermissionsContext.locale` ->
 * `OperatorShell`'s `getStrings(parseConsoleLocale(locale))` -> `StringsProvider` -> each page's own
 * `useStrings()`. Nothing here constructs a `StringsProvider` directly.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const conversationsApi = vi.hoisted(() => ({ fetchAllConversationsForSite: vi.fn() }));
const widgetConfigApi = vi.hoisted(() => ({ fetchWidgetConfig: vi.fn(), updateWidgetConfig: vi.fn() }));
const offlineAutoReplyApi = vi.hoisted(() => ({
  fetchOfflineAutoReply: vi.fn(),
  updateOfflineAutoReply: vi.fn(),
}));
const cannedResponsesApi = vi.hoisted(() => ({
  fetchCannedResponses: vi.fn(),
  updateCannedResponses: vi.fn(),
}));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));

vi.mock("../api/conversationsApi.js", () => conversationsApi);
// `WidgetConfigError`/`OfflineAutoReplyError` are real classes the pages do `instanceof` against -
// `permissionGating.test.tsx`'s own established pattern for these two modules, kept identical here:
// only the two network calls in each module are replaced.
vi.mock("../api/widgetConfigApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/widgetConfigApi.js")>("../api/widgetConfigApi.js");
  return { ...actual, ...widgetConfigApi };
});
vi.mock("../api/offlineAutoReplyApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/offlineAutoReplyApi.js")>(
    "../api/offlineAutoReplyApi.js",
  );
  return { ...actual, ...offlineAutoReplyApi };
});
vi.mock("../api/cannedResponsesApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/cannedResponsesApi.js")>(
    "../api/cannedResponsesApi.js",
  );
  return { ...actual, ...cannedResponsesApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONVERSATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VISITOR_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ locale, children }: { locale: string | null; children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  const permissions = useMemo<PermissionsState>(
    () => ({
      permissions: ["site:configure"],
      siteId: SITE_ID,
      locale,
      hasPermission: (p: string) => p === "site:configure",
      tenancies: [{ siteId: SITE_ID, siteName: "Тестовый сайт" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [locale],
  );

  return (
    <AuthContext.Provider value={auth}>
      <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>
    </AuthContext.Provider>
  );
}

function siteConfigAt(path: string, locale: string | null) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Signed locale={locale}>
        <Routes>
          <Route element={<OperatorShell />}>
            <Route path="/admin" element={<AdminConversationsPage />} />
            <Route path="/settings/widget" element={<WidgetConfigPage />} />
            <Route path="/settings/auto-reply" element={<OfflineAutoReplyPage />} />
            <Route path="/settings/canned-responses" element={<CannedResponsesPage />} />
          </Route>
        </Routes>
      </Signed>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  conversationsApi.fetchAllConversationsForSite.mockResolvedValue({
    conversations: [
      {
        conversationId: CONVERSATION_ID,
        visitorId: VISITOR_ID,
        state: "Waiting",
        createdAt: "2026-08-25T09:00:00+00:00",
        operatorUnreadCount: 2,
        operatorId: null,
      },
    ],
    nextBeforeId: null,
  });
  widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
    primaryColorHex: "#2F6FED",
    position: "BottomRight",
    locale: "En",
    noticeText: null,
    noticeUrl: null,
  });
  offlineAutoReplyApi.fetchOfflineAutoReply.mockResolvedValue({
    enabled: false,
    fallbackReply: "",
    rules: [],
  });
  cannedResponsesApi.fetchCannedResponses.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("the site-configuration screens for an active site with Locale = Ru", () => {
  it("renders AdminConversationsPage's table in Russian", async () => {
    const container = await render(siteConfigAt("/admin", "Ru"));

    expect(container.querySelector(".ago-page-head__title")?.textContent).toBe("Все диалоги");
    const headers = all(container, ".ago-table th").map((h) => h.textContent?.trim());
    expect(headers).toEqual(["Посетитель", "Статус", "Назначенный оператор", "Начат", "Непрочитано"]);
    // The row's own state badge - proof the raw wire value ("Waiting") is mapped through the same
    // `queueWaitingTitle` field the operator workspace uses, not left untranslated.
    expect(one(container, ".ago-table tbody tr").textContent).toContain("Ожидание");
    expect(one(container, ".ago-table tbody tr").textContent).toContain("Не назначен");
    expect(container.querySelector("caption")?.textContent).toBe("Все диалоги для этого сайта, сначала новые.");
  });

  it("renders WidgetConfigPage's form in Russian", async () => {
    const container = await render(siteConfigAt("/settings/widget", "Ru"));

    expect(container.querySelector(".ago-page-head__title")?.textContent).toBe("Внешний вид виджета");
    expect(container.querySelector(".ago-panel__title")?.textContent).toBe("Кнопка запуска");
    const labels = all(container, ".ago-field__label").map((l) => l.textContent?.trim());
    expect(labels).toEqual([
      "Основной цвет (hex, необязательно)",
      "Положение кнопки запуска",
      "Язык виджета",
      "Текст уведомления (необязательно)",
      "Ссылка на уведомление (необязательно)",
    ]);
    // `16-04`: the second panel title, proving the notice fields render under their own Russian
    // heading rather than silently inside "Кнопка запуска" above.
    const panelTitles = all(container, ".ago-panel__title").map((t) => t.textContent?.trim());
    expect(panelTitles).toEqual(["Кнопка запуска", "Уведомление об обработке данных"]);
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) => b.type === "submit");
    expect(saveButton?.textContent).toBe("Сохранить");
  });

  it("renders OfflineAutoReplyPage's form in Russian, including a rule row and its validation message", async () => {
    const container = await render(siteConfigAt("/settings/auto-reply", "Ru"));

    expect(container.querySelector(".ago-page-head__title")?.textContent).toBe("Автоответ офлайн");
    expect(container.querySelector(".ago-panel__title")?.textContent).toBe("Ответы, пока вас нет на месте");
    expect(container.querySelector("legend")?.textContent).toBe("Правила по ключевым словам");
    const labels = all(container, ".ago-field__label").map((l) => l.textContent?.trim());
    expect(labels).toEqual(["Ответ по умолчанию", "Ключевое слово 1", "Ответ 1"]);
    const removeButton = one<HTMLButtonElement>(container, "button[aria-label='Удалить правило 1']");
    expect(removeButton.textContent).toBe("Удалить");

    // The pure `validateDraft` threaded through `strings` from the submit handler, not defaulted to
    // English - enable the switch with no default reply typed and submit.
    const checkbox = one<HTMLInputElement>(container, "input[type=checkbox]");
    await interact(() => checkbox.click());
    const form = one<HTMLFormElement>(container, "form");
    await interact(() => form.requestSubmit());

    expect(container.querySelector(".ago-alert--danger")?.textContent).toContain(
      "Включённому автоответу нужно что сказать",
    );
  });

  it("renders CannedResponsesPage's form in Russian, including a response row and its validation message", async () => {
    const container = await render(siteConfigAt("/settings/canned-responses", "Ru"));

    expect(container.querySelector(".ago-page-head__title")?.textContent).toBe("Готовые ответы");
    expect(container.querySelector(".ago-panel__title")?.textContent).toBe("Готовые ответы");
    expect(container.querySelector("legend")?.textContent).toBe("Ответы");
    const labels = all(container, ".ago-field__label").map((l) => l.textContent?.trim());
    expect(labels).toEqual(["Заголовок 1", "Текст 1"]);
    const removeButton = one<HTMLButtonElement>(container, "button[aria-label='Удалить готовый ответ 1']");
    expect(removeButton.textContent).toBe("Удалить");

    // The pure `validateDraft` threaded through `strings` from the submit handler, not defaulted to
    // English - a title with no text, the same "half-filled row" case `offlineAutoReplyValidation.ts`
    // reports rather than silently drops.
    const titleInput = one<HTMLInputElement>(container, "input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(titleInput, "Тест");
    await interact(() => titleInput.dispatchEvent(new Event("input", { bubbles: true })));
    const form = one<HTMLFormElement>(container, "form");
    await interact(() => form.requestSubmit());

    expect(container.querySelector(".ago-alert--danger")?.textContent).toContain('нужен текст');
  });
});

describe("the site-configuration screens for an active site with no Locale set", () => {
  // Three separate tests, not three `render()` calls in one - `render()`/`MemoryRouter` share the
  // same root across calls, and `MemoryRouter`'s own `initialEntries` is read only on its first mount
  // (`react-router`'s own documented "uncontrolled" behaviour), so a second `render()` call reusing the
  // same root would leave the *first* route's tree on screen rather than actually navigating - found
  // live writing this test, by an assertion that read the wrong page's title. `afterEach`'s `unmount()`
  // is what gives each `it` below a fresh root.

  it("renders AdminConversationsPage's table unchanged, in English", async () => {
    const admin = await render(siteConfigAt("/admin", null));

    expect(admin.querySelector(".ago-page-head__title")?.textContent).toBe("All conversations");
    const headers = all(admin, ".ago-table th").map((h) => h.textContent?.trim());
    expect(headers).toEqual(["Visitor", "State", "Assigned operator", "Started", "Unread"]);
    expect(admin.querySelector(".ago-table tbody tr")?.textContent).toContain("Waiting");
    expect(admin.querySelector(".ago-table tbody tr")?.textContent).toContain("Unassigned");
  });

  it("renders WidgetConfigPage's form unchanged, in English", async () => {
    const widget = await render(siteConfigAt("/settings/widget", null));

    expect(widget.querySelector(".ago-page-head__title")?.textContent).toBe("Widget appearance");
    expect(widget.querySelector(".ago-panel__title")?.textContent).toBe("Launcher");
    const widgetSave = Array.from(widget.querySelectorAll("button")).find((b) => b.type === "submit");
    expect(widgetSave?.textContent).toBe("Save");
  });

  it("renders OfflineAutoReplyPage's form unchanged, in English", async () => {
    const autoReply = await render(siteConfigAt("/settings/auto-reply", null));

    expect(autoReply.querySelector(".ago-page-head__title")?.textContent).toBe("Offline auto-reply");
    expect(autoReply.querySelector("legend")?.textContent).toBe("Keyword rules");
    const removeButton = one<HTMLButtonElement>(autoReply, "button[aria-label='Remove keyword rule 1']");
    expect(removeButton.textContent).toBe("Remove");
  });

  it("renders CannedResponsesPage's form unchanged, in English", async () => {
    const cannedResponses = await render(siteConfigAt("/settings/canned-responses", null));

    expect(cannedResponses.querySelector(".ago-page-head__title")?.textContent).toBe("Canned responses");
    expect(cannedResponses.querySelector("legend")?.textContent).toBe("Responses");
    const removeButton = one<HTMLButtonElement>(cannedResponses, "button[aria-label='Remove canned response 1']");
    expect(removeButton.textContent).toBe("Remove");
  });
});
