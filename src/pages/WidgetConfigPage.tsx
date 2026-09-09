import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchWidgetConfig,
  updateWidgetConfig,
  WidgetConfigError,
  type AutoOpenDelaySeconds,
  type WidgetConfigDto,
  type WidgetLocale,
  type WidgetPosition,
} from "../api/widgetConfigApi.js";
import { isValidHexColor, isValidNoticeUrl } from "./widgetConfigValidation.js";
import { truncateToLines } from "./textTruncation.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
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

// `23-64`: a third closed-set-of-<N> map on this page, the same shape `POSITION_LABELS`/`LOCALE_LABELS`
// already establish - a function of `strings` for the identical reason `positionLabels` is (a
// module-level `Record` cannot call `useStrings()`).
function autoOpenDelayLabels(strings: ConsoleStrings): Record<AutoOpenDelaySeconds, string> {
  return {
    15: strings.widgetAutoOpenDelay15,
    30: strings.widgetAutoOpenDelay30,
    45: strings.widgetAutoOpenDelay45,
    60: strings.widgetAutoOpenDelay60,
    90: strings.widgetAutoOpenDelay90,
    120: strings.widgetAutoOpenDelay120,
  };
}

const AUTO_OPEN_DELAY_OPTIONS: readonly AutoOpenDelaySeconds[] = [15, 30, 45, 60, 90, 120];

const DEFAULT_SWATCH_COLOR = "#2f6fed";

// `25-24`: the consent-notice card's own read-only preview - the item's own Scope names this exact
// number ("truncated to the first 10 lines").
const NOTICE_TEXT_PREVIEW_LINES = 10;

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
  const AUTO_OPEN_DELAY_LABELS = autoOpenDelayLabels(strings);
  const [current, setCurrent] = useState<WidgetConfigDto | null>(null);
  const [colorInput, setColorInput] = useState("");
  const [position, setPosition] = useState<WidgetPosition>("BottomRight");
  const [locale, setLocale] = useState<WidgetLocale>("En");
  const [noticeTextInput, setNoticeTextInput] = useState("");
  const [noticeUrlInput, setNoticeUrlInput] = useState("");
  const [requireContactConsent, setRequireContactConsent] = useState(false);
  // `25-24`: the consent-notice card defaults to its read-only current-text view; editing the text or
  // the link is a deliberate secondary action this toggle reveals, the same `formOpen`/`formVisible`
  // shape `25-21`'s `ConsentDocumentPanel` already established for the identical problem one screen
  // over (a form that used to render unconditionally beside a read view of what already exists).
  const [noticeEditOpen, setNoticeEditOpen] = useState(false);
  // Independent of `noticeEditOpen` above: this is the "показать полностью" control over the *read*
  // view's own truncation, not a second way to reach the editor.
  const [noticeTextExpanded, setNoticeTextExpanded] = useState(false);
  // `23-63`: off by default until the load call resolves - matches the server's own "off unless the
  // tenant turns it on" default, so a slow load never briefly implies the toggle is already on.
  const [attractAttention, setAttractAttention] = useState(false);
  // `23-64`: the same "off until the load call resolves" default as `attractAttention` above, for the
  // identical reason - plus the delay's own server-side default (`AutoOpenDelay.Seconds30`) so the
  // select never briefly renders with nothing selected.
  const [autoOpenEnabled, setAutoOpenEnabled] = useState(false);
  const [autoOpenDelaySeconds, setAutoOpenDelaySeconds] = useState<AutoOpenDelaySeconds>(30);
  const [autoOpenGreetingTextInput, setAutoOpenGreetingTextInput] = useState("");
  // `25-39`: off by default until the load call resolves - the identical "off unless the tenant turns
  // it on" posture `attractAttention`/`requireContactConsent` already establish for themselves, so a
  // slow load never briefly implies a real, verified-phone guarantee has already been relaxed.
  const [acceptUnverifiedPhone, setAcceptUnverifiedPhone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [noticeUrlValidationError, setNoticeUrlValidationError] = useState<string | null>(null);
  const [autoOpenGreetingValidationError, setAutoOpenGreetingValidationError] = useState<string | null>(null);
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
        setRequireContactConsent(dto.requireContactConsent);
        setAttractAttention(dto.attractAttention);
        setAutoOpenEnabled(dto.autoOpenEnabled);
        setAutoOpenDelaySeconds(dto.autoOpenDelaySeconds);
        setAutoOpenGreetingTextInput(dto.autoOpenGreetingText ?? "");
        setAcceptUnverifiedPhone(dto.acceptUnverifiedPhone);
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
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return (
      <AccessRefusal title={strings.navWidgetAppearance} message={strings.widgetForbidden} strings={strings} />
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

    // `23-64`: UX-only mirror of `Ago.Chat.Domain.WidgetConfig`'s own "auto-open enabled requires a
    // greeting" guard - the identical posture the two checks above already take toward their own
    // server-side rule. `UpdateWidgetConfigHandler`'s `WidgetConfig.InvalidAutoOpenGreetingText` is
    // the real, authoritative gate; a false "looks fine" here just means the server rejects it
    // instead and this page surfaces that `detail` text unchanged, same as every other field.
    const trimmedAutoOpenGreetingText = autoOpenGreetingTextInput.trim();
    if (autoOpenEnabled && trimmedAutoOpenGreetingText.length === 0) {
      setAutoOpenGreetingValidationError(strings.widgetAutoOpenGreetingRequiredValidation);
      return;
    }
    setAutoOpenGreetingValidationError(null);

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
        requireContactConsent,
        attractAttention,
        autoOpenEnabled,
        autoOpenDelaySeconds,
        autoOpenGreetingText: trimmedAutoOpenGreetingText.length > 0 ? trimmedAutoOpenGreetingText : null,
        acceptUnverifiedPhone,
      });
      setCurrent(dto);
      setColorInput(dto.primaryColorHex ?? "");
      setPosition(dto.position);
      setLocale(dto.locale);
      setNoticeTextInput(dto.noticeText ?? "");
      setNoticeUrlInput(dto.noticeUrl ?? "");
      setRequireContactConsent(dto.requireContactConsent);
      setAttractAttention(dto.attractAttention);
      setAutoOpenEnabled(dto.autoOpenEnabled);
      setAutoOpenDelaySeconds(dto.autoOpenDelaySeconds);
      setAutoOpenGreetingTextInput(dto.autoOpenGreetingText ?? "");
      setAcceptUnverifiedPhone(dto.acceptUnverifiedPhone);
      // `25-24`: collapses the notice editor back behind its toggle now that the read view above it
      // has the freshly saved text to show instead - the same "the read view is what replaces the
      // form, so the form does not need to stay open next to it" reasoning `ConsentDocumentPanel`'s
      // own `onPublished` already applies in `25-21`. A no-op when the card had no notice at all
      // (`noticeEditOpen` plays no part in `formVisible` there - see the render below).
      setNoticeEditOpen(false);
      setSaved(true);
    } catch (err) {
      setSubmitError(err instanceof WidgetConfigError ? err.message : strings.widgetSubmitError);
    } finally {
      setSubmitting(false);
    }
  };

  const swatchColor = isValidHexColor(colorInput.trim()) ? colorInput.trim() : DEFAULT_SWATCH_COLOR;

  // `25-24`: read from `current` (the last successfully loaded/saved config), never from the
  // controlled `noticeTextInput`/`noticeUrlInput` draft state above - the card's job is to say what
  // is *actually* in effect right now, which a half-typed, unsaved edit is not. `current` can still
  // be `null` here (the load call failed rather than never having run - the outer skeleton guard
  // above only covers "still loading", not "errored"), so every read goes through `?.`.
  const hasNotice = Boolean(current?.noticeText || current?.noticeUrl);
  const noticeTextPreview = truncateToLines(current?.noticeText ?? "", NOTICE_TEXT_PREVIEW_LINES);
  // The editor is the only thing to show when nothing has been set yet (nothing to default to
  // instead), and otherwise only when the toggle above has been opened - `25-21`'s own
  // `formVisible = current === null || formOpen` restated for this screen's equivalent case.
  const noticeFormVisible = !hasNotice || noticeEditOpen;

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
        // `16-04`: one `<form>` now spans every panel below - a single PUT still writes every field
        // (`Ago.Chat.Api.WidgetConfig.WidgetConfigEndpoints`), and one `<form>`/one Save button is what
        // makes that visible instead of implying independent saves. `Panel` stays split regardless:
        // "Launcher" is an appearance choice, "Consent notice" is the tenant's own statement about data
        // handling, and (`25-24`) "Contact consent" is a different question again - whether accepting
        // something is mandatory before contact data is collected - so a reviewer scanning panel titles
        // can tell all three apart at a glance even though saving any one of them saves all three.
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

              {/* `23-63`: same "label with sibling text, no separate Field description" shape
                  OfflineAutoReplyPage's own enabled toggle already uses - the one sentence worth
                  saying (prefers-reduced-motion overrides this regardless) lives in the label's own
                  sibling text. */}
              <label className="ago-row">
                <input
                  type="checkbox"
                  checked={attractAttention}
                  onChange={(e) => setAttractAttention(e.target.checked)}
                  disabled={submitting}
                />
                <span>{strings.widgetAttractAttentionLabel}</span>
              </label>
              <p className="ago-meta">{strings.widgetAttractAttentionDescription}</p>

              {/* `23-64`: same "label with sibling text, no separate Field description" shape as
                  `attractAttention` just above - the checkbox itself, then the delay/greeting controls
                  that only matter once it is checked, always rendered (not conditionally hidden) the
                  same way `noticeText`/`noticeUrl` stay visible regardless of whether either is
                  filled in - one form, no branching on this screen's own layout. */}
              <label className="ago-row">
                <input
                  type="checkbox"
                  checked={autoOpenEnabled}
                  onChange={(e) => setAutoOpenEnabled(e.target.checked)}
                  disabled={submitting}
                />
                <span>{strings.widgetAutoOpenLabel}</span>
              </label>
              <p className="ago-meta">{strings.widgetAutoOpenDescription}</p>

              <Field label={strings.widgetAutoOpenDelayFieldLabel}>
                {(controlProps) => (
                  <Select
                    {...controlProps}
                    value={autoOpenDelaySeconds}
                    onChange={(e) => setAutoOpenDelaySeconds(Number(e.target.value) as AutoOpenDelaySeconds)}
                    disabled={submitting}
                  >
                    {AUTO_OPEN_DELAY_OPTIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {AUTO_OPEN_DELAY_LABELS[seconds]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label={strings.widgetAutoOpenGreetingFieldLabel}
                description={strings.widgetAutoOpenGreetingFieldDescription}
                error={autoOpenGreetingValidationError}
              >
                {(controlProps) => (
                  <Textarea
                    {...controlProps}
                    rows={2}
                    value={autoOpenGreetingTextInput}
                    onChange={(e) => setAutoOpenGreetingTextInput(e.target.value)}
                    placeholder={strings.widgetAutoOpenGreetingPlaceholder}
                    disabled={submitting}
                  />
                )}
              </Field>
            </div>
          </Panel>

          {/*
            `25-24`: this card used to hold the notice text/link fields *and* `requireContactConsent`
            together, which reads as if accepting the notice is what turns contact-detail collection
            on or off. They are two different questions - what the notice says, and whether accepting
            something is mandatory before contact data is collected - so the checkbox now gets its own
            card below, and this one is only ever about the notice's own current text and link.
          */}
          <Panel title={strings.widgetNoticePanelTitle}>
            <div className="ago-stack">
              {hasNotice ? (
                <>
                  <div>
                    <strong>{strings.widgetNoticeCurrentLabel}</strong>
                    <p className="ago-notice-preview">
                      {noticeTextExpanded ? current?.noticeText : noticeTextPreview.visible}
                    </p>
                    {noticeTextPreview.truncated && (
                      <Button type="button" variant="secondary" onClick={() => setNoticeTextExpanded((v) => !v)}>
                        {noticeTextExpanded ? strings.widgetNoticeShowLess : strings.widgetNoticeShowFully}
                      </Button>
                    )}
                  </div>
                  {current?.noticeUrl && (
                    <div>
                      <strong>{strings.widgetNoticeUrlCurrentLabel}</strong>{" "}
                      <a href={current.noticeUrl} target="_blank" rel="noreferrer">
                        {current.noticeUrl}
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <p>{strings.widgetNoticeNotSetLabel}</p>
              )}

              {/* `25-21`'s own `formOpen`/`formVisible` shape, restated here: a toggle only when
                  there is a read view to toggle away from - nothing published yet leaves the editor
                  as the only thing to show, exactly as `ConsentDocumentPanel` treats `current === null`. */}
              {hasNotice && (
                <div>
                  <Button type="button" variant="secondary" onClick={() => setNoticeEditOpen((open) => !open)}>
                    {noticeEditOpen ? strings.cancelButton : strings.widgetNoticeEditButton}
                  </Button>
                </div>
              )}

              {noticeFormVisible && (
                <>
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
                </>
              )}
            </div>
          </Panel>

          {/* `25-24`: `requireContactConsent` moved out of the card above - it gates whether contact
              details are collected at all, a different question from what the notice says, and its
              own `widgetRequireContactConsentDescription` already names the document (`/account/documents`,
              `23-37`) that actually does the gating, not this notice's text. */}
          <Panel title={strings.widgetContactConsentPanelTitle}>
            <div className="ago-stack">
              {/* `23-108`: the control the documents screen has been telling tenants to switch on
                  since it shipped, and which existed nowhere in this console. `label` wraps the input
                  rather than using `Field`, because `Field` renders a label *above* its control and a
                  checkbox reads as caption-then-box - the same shape `WorkerCard` already uses. */}
              <label className="ago-row">
                <input
                  type="checkbox"
                  checked={requireContactConsent}
                  disabled={submitting}
                  onChange={(e) => setRequireContactConsent(e.target.checked)}
                />
                <span>{strings.widgetRequireContactConsentLabel}</span>
              </label>
              <p className="ago-field__description">{strings.widgetRequireContactConsentDescription}</p>
            </div>
          </Panel>

          {/* `25-39`: a fourth panel, kept separate from "Launcher"/"Consent notice"/"Contact consent" -
              this is not an appearance choice or a data-handling statement, it is a temporary
              workaround for a missing SMS/voice gateway account (`14-15`), and the panel title plus
              description say so plainly rather than reading like an ordinary feature toggle. */}
          <Panel title={strings.widgetBookingPanelTitle}>
            <div className="ago-stack">
              <label className="ago-row">
                <input
                  type="checkbox"
                  checked={acceptUnverifiedPhone}
                  disabled={submitting}
                  onChange={(e) => setAcceptUnverifiedPhone(e.target.checked)}
                />
                <span>{strings.widgetAcceptUnverifiedPhoneLabel}</span>
              </label>
              <p className="ago-field__description">{strings.widgetAcceptUnverifiedPhoneDescription}</p>
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
