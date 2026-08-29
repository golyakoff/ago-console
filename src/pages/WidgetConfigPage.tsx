import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchWidgetConfig,
  updateWidgetConfig,
  WidgetConfigError,
  type WidgetConfigDto,
  type WidgetLocale,
  type WidgetPosition,
} from "../api/widgetConfigApi.js";
import { isValidHexColor, isValidNoticeUrl } from "./widgetConfigValidation.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/** `11-13`: a function of `strings` rather than a module-level `Record`, for the same reason
 * `AdminConversationsPage`'s `buildColumns` moved - a literal built outside the component cannot call
 * `useStrings()`. Called inline from render rather than through a `useMemo`: it is a two-entry lookup
 * built on every render either way, and a `useMemo` here would cost more to read than the allocation
 * it avoids. */
function positionLabels(strings: ConsoleStrings): Record<WidgetPosition, string> {
  return {
    BottomRight: strings.widgetPositionBottomRight,
    BottomLeft: strings.widgetPositionBottomLeft,
  };
}

// `11-10`: the same closed-set-of-two shape `POSITION_LABELS` already established for this page's
// only other `<select>` - see `Select.tsx`'s own comment on why this project has exactly two.
// Found live: labelled in English exonyms ("Russian") rather than each language's own name for
// itself - every language names itself the way its own speakers would recognise it, regardless of
// which language the console's own chrome happens to be in today.
const LOCALE_LABELS: Record<WidgetLocale, string> = {
  En: "English",
  Ru: "Русский",
};

const DEFAULT_SWATCH_COLOR = "#2f6fed";

/**
 * `11-02`: `/settings/widget` - the console's first tenant self-service configuration screen.
 * `adr/0023` names "tenant self-service configuration, starting with `6-03`'s webhook endpoint
 * registration and delivery history" as one of the three surfaces that justified React, but `6-03`
 * shipped only the API and explicitly deferred its own UI as future work. That UI still does not
 * exist, so this screen - not `6-03`'s eventual follow-up - is the first tenant self-service
 * configuration screen actually built in `ago-console`.
 *
 * Gated the same way `AdminConversationsPage` already established: `usePermissions()` decides whether
 * to render the form at all (client-side, UX only - the shell's own entry point is hidden the same
 * way) while `11-01`'s own server-side `site:configure` check on both `GET`/`PUT` is the actual gate.
 * An operator who reaches this route some other way without the permission still gets a real `403`
 * from the fetch, surfaced as `loadError`/`submitError` text, never hidden as if the call had
 * succeeded.
 *
 * `11-05` landed after this screen and adopts it, per that item's own "whichever lands second adopts
 * the other's result" note: restyled onto the shell and the component set, with the entry point that
 * `11-02` added to the queue screen folded into the shell's permission-gated navigation - the same
 * `usePermissions()` gate, in one place instead of two. The screen's own internal gate above is
 * untouched and remains what stops a direct URL from rendering the form.
 */
export function WidgetConfigPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const POSITION_LABELS = positionLabels(strings);
  const [current, setCurrent] = useState<WidgetConfigDto | null>(null);
  const [colorInput, setColorInput] = useState("");
  const [position, setPosition] = useState<WidgetPosition>("BottomRight");
  const [locale, setLocale] = useState<WidgetLocale>("En");
  const [noticeTextInput, setNoticeTextInput] = useState("");
  const [noticeUrlInput, setNoticeUrlInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [noticeUrlValidationError, setNoticeUrlValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchWidgetConfig(accessToken, siteId)
      .then((dto) => {
        setCurrent(dto);
        setColorInput(dto.primaryColorHex ?? "");
        setPosition(dto.position);
        setLocale(dto.locale);
        setNoticeTextInput(dto.noticeText ?? "");
        setNoticeUrlInput(dto.noticeUrl ?? "");
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof WidgetConfigError ? err.message : strings.widgetLoadError),
      );
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title={strings.navWidgetAppearance} />
        {/* `role="alert"` preserved through `Alert tone="danger"` - see `AdminConversationsPage`'s
            identical branch. */}
        <Alert tone="danger">{strings.widgetForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(null);

    const trimmed = colorInput.trim();
    // UX-only - `11-01`'s `UpdateWidgetConfigHandler` is the real, authoritative gate
    // (`widgetConfigValidation.ts`'s own doc comment has the detail). An empty value means "no
    // override, use the widget's own built-in default", matching `WidgetConfig.PrimaryColorHex`'s own
    // nullable semantics (`Ago.Chat.Domain`).
    if (trimmed.length > 0 && !isValidHexColor(trimmed)) {
      setValidationError(strings.widgetColorValidation);
      return;
    }
    setValidationError(null);

    // `16-04`: the same UX-only posture as the color check above - `Ago.Chat.Domain.WidgetConfig`'s
    // own constructor is the real, authoritative gate (`widgetConfigValidation.ts`'s own doc comment
    // on `isValidNoticeUrl`). Notice text has no client-side format to check beyond what the textarea
    // itself already enforces (nothing) - a whitespace-only or over-length value is left to the
    // server's own `WidgetConfig.InvalidNoticeText`, surfaced as `submitError` like any other rejection.
    const trimmedNoticeUrl = noticeUrlInput.trim();
    if (trimmedNoticeUrl.length > 0 && !isValidNoticeUrl(trimmedNoticeUrl)) {
      setNoticeUrlValidationError(strings.widgetNoticeUrlValidation);
      return;
    }
    setNoticeUrlValidationError(null);

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in session, and `siteId` arrives on the same response
      // `hasPermission` above already depends on - same "reaching here is a wiring bug" reasoning
      // `OnboardingPage`/`PermissionsProvider` already state for their own equivalent checks.
      return;
    }

    const trimmedNoticeText = noticeTextInput.trim();

    setSubmitting(true);
    try {
      const dto = await updateWidgetConfig(accessToken, siteId, {
        primaryColorHex: trimmed.length > 0 ? trimmed : null,
        position,
        locale,
        noticeText: trimmedNoticeText.length > 0 ? trimmedNoticeText : null,
        noticeUrl: trimmedNoticeUrl.length > 0 ? trimmedNoticeUrl : null,
      });
      setCurrent(dto);
      setColorInput(dto.primaryColorHex ?? "");
      setPosition(dto.position);
      setLocale(dto.locale);
      setNoticeTextInput(dto.noticeText ?? "");
      setNoticeUrlInput(dto.noticeUrl ?? "");
      setSaved(true);
    } catch (err) {
      setSubmitError(err instanceof WidgetConfigError ? err.message : strings.widgetSubmitError);
    } finally {
      setSubmitting(false);
    }
  };

  const swatchColor = isValidHexColor(colorInput.trim()) ? colorInput.trim() : DEFAULT_SWATCH_COLOR;

  return (
    <>
      <PageHead
        title={strings.navWidgetAppearance}
        /* `adr/0029`: config is read once, at bootstrap - stated here so the operator making the
           change knows why an already-open visitor tab will not reflect it immediately. `11-10`:
           this sentence's scope already covered color/position and now covers language on the same
           terms - the widget reads its language at the same bootstrap moment, not live, so the
           existing "next page load" wording is extended rather than duplicated into a second notice. */
        description={strings.widgetDescription}
      />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {current === null && !loadError ? (
        <Panel>
          <Skeleton lines={3} label={strings.widgetLoadingLabel} />
        </Panel>
      ) : (
        // `16-04`: one `<form>` now spans both panels below - a single PUT still writes every field
        // (`Ago.Chat.Api.WidgetConfig.WidgetConfigEndpoints`), and one `<form>`/one Save button is what
        // makes that visible instead of implying two independent saves. `Panel` stays split in two
        // regardless: "Launcher" is an appearance choice, "Processing notice" is the tenant's own
        // statement about data handling, and a reviewer scanning panel titles should be able to tell
        // the two apart at a glance even though saving either one saves both.
        <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
          <Panel title={strings.widgetPanelTitle}>
            <div className="ago-stack">
              <Field
                label={strings.widgetColorFieldLabel}
                description={strings.widgetColorFieldDescription}
                error={validationError}
                adornment={
                  <span
                    className="ago-widget-swatch"
                    aria-hidden="true"
                    title={strings.widgetColorPreviewTitle}
                    // The one inline style left in the console, and it has to be: the value is the
                    // operator's own live input, so it cannot come from a token or a class. Its
                    // dimensions and border moved into `.ago-widget-swatch` in `index.css`; only the
                    // colour itself stays here.
                    style={{ background: swatchColor }}
                  />
                }
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={colorInput}
                    onChange={(e) => setColorInput(e.target.value)}
                    // Not translated - a hex code (`#2F6FED`) is a format example, not language-bearing
                    // text, the same reasoning `shortcuts.ts`'s own `Shortcut.label` gives for its key
                    // names never going through `strings`.
                    placeholder="#2F6FED"
                    disabled={submitting}
                  />
                )}
              </Field>

              <Field label={strings.widgetPositionFieldLabel}>
                {(controlProps) => (
                  <Select
                    {...controlProps}
                    value={position}
                    onChange={(e) => setPosition(e.target.value as WidgetPosition)}
                    disabled={submitting}
                  >
                    <option value="BottomRight">{POSITION_LABELS.BottomRight}</option>
                    <option value="BottomLeft">{POSITION_LABELS.BottomLeft}</option>
                  </Select>
                )}
              </Field>

              {/* `11-10`: modeled byte-for-byte on the launcher-position `Select` just above - the
                  same gate (this page's own `site:configure` check), no new permission. */}
              <Field label={strings.widgetLanguageFieldLabel}>
                {(controlProps) => (
                  <Select
                    {...controlProps}
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as WidgetLocale)}
                    disabled={submitting}
                  >
                    {/* `LOCALE_LABELS` itself is untouched - `11-13`'s own scope explicitly excludes it
                        (`4-06` already fixed these to endonyms, correct in every UI language). */}
                    <option value="En">{LOCALE_LABELS.En}</option>
                    <option value="Ru">{LOCALE_LABELS.Ru}</option>
                  </Select>
                )}
              </Field>
            </div>
          </Panel>

          <Panel title={strings.widgetNoticePanelTitle}>
            <div className="ago-stack">
              <Field
                label={strings.widgetNoticeTextFieldLabel}
                description={strings.widgetNoticeTextFieldDescription}
              >
                {(controlProps) => (
                  <Textarea
                    {...controlProps}
                    rows={3}
                    value={noticeTextInput}
                    onChange={(e) => setNoticeTextInput(e.target.value)}
                    placeholder={strings.widgetNoticeTextPlaceholder}
                    disabled={submitting}
                  />
                )}
              </Field>

              <Field
                label={strings.widgetNoticeUrlFieldLabel}
                description={strings.widgetNoticeUrlFieldDescription}
                error={noticeUrlValidationError}
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="url"
                    value={noticeUrlInput}
                    onChange={(e) => setNoticeUrlInput(e.target.value)}
                    // Not translated - an example URL is a format example, not language-bearing text,
                    // the same reasoning the hex-color placeholder above already gives.
                    placeholder="https://example.com/privacy"
                    disabled={submitting}
                  />
                )}
              </Field>
            </div>
          </Panel>

          {submitError && <Alert tone="danger">{submitError}</Alert>}
          {/* Was a bare `<p>Saved.</p>` with no live-region role at all before `11-05` - `Alert
              tone="success"` gives it `role="status"`, polite rather than assertive, so it is
              announced without interrupting. */}
          {saved && <Alert tone="success">{strings.siteConfigSavedAlert}</Alert>}

          <div className="ago-row">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? strings.siteConfigSavingButton : strings.siteConfigSaveButton}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
