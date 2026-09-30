import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { disableModule, enableModule, fetchModules, setModuleTriggerWords, ModulesError } from "../api/modulesApi.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Spinner } from "../components/Spinner.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { useStrings } from "../i18n/StringsContext.js";
import { shapeMismatchMessage } from "./apiErrorMessage.js";

/**
 * The bookings (calendar) module's own key and the trigger word its widget booking chip opens with.
 *
 * <p>`"calendar"` is a word from the platform's own schema (`Ago.Chat.Domain.ModuleKey`); the console is
 * allowed to name it - `ProductsPage`/`calendarAccess.tsx` already read the identical key - because it is
 * the console, not `Ago.Chat.*`, that knows what a calendar is (`adr/0065` decision 2 forbids only the
 * backend from learning it). This is the one place this screen names it.</p>
 *
 * <p>`/записаться` is the site's booking trigger word - the phrase the widget's own booking chip sends
 * (`ago-widget`'s `bookingChipSpec`, `25-131`), and the value the stand and the backend's own visitor-
 * session tests already use for the calendar. The tenant toggles the module with one click and never
 * types a trigger word, so the console supplies this default; the backend stores it opaquely.</p>
 */
const BOOKINGS_MODULE_KEY = "calendar";
const BOOKINGS_TRIGGER_WORDS = ["/записаться"];

/**
 * `26-320`: splits the free-text trigger-words field into the list the endpoint takes. A person types the
 * words the way the description tells them to - separated by a comma or a space - so this accepts either and
 * drops empty runs; the server owns every real rule (reserved word, cross-module collision, count and
 * length bounds) and words them back, so this stays a plain tokeniser, not a second copy of that validation.
 */
function parseTriggerWords(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

/**
 * `26-316` (author decision в, self-serve): `/account/bookings-module` - the admin settings section
 * «Модуль «Записи»» with a Вкл/Выкл toggle. A tenant admin turns the bookings/calendar module on and off
 * for their own site, with no platform-owner action; the owner grant stays available as an override.
 *
 * <p>Gated the way every other `/account/*` settings screen is (`AiAddOnPage`, `FaqModulePage`):
 * `usePermissions()` decides whether to render at all (UX only), while the server's own `site:configure`
 * check on `PUT`/`DELETE .../modules/{moduleKey}` is the real gate. `PRODUCTS_PERMISSION` on
 * `ProductsPage` is the same `site:configure` proxy for "may act for the tenant as a whole".</p>
 *
 * <p><b>Reads its state from the same `GET .../modules` the console already had</b> - the module is on
 * when a `"calendar"` row is present. No new read: `23-01`'s listing already carries `grantedByOwner`,
 * which is what tells an owner-granted module (an override the tenant cannot switch off here) apart from
 * the tenant's own self-serve one.</p>
 *
 * <p><b>A full document navigation after a successful toggle</b>, the same `PermissionsContext.switchTenancy`
 * precedent: enabling seeds `calendar:configure` and adds the `"calendar"` module to
 * `GET /operators/me`'s `enabledModules`, both of which the whole console (the «Записи» nav section, every
 * calendar screen's access gate) reads once per session from `PermissionsProvider`. A full reload is the
 * simple, bulletproof way to re-bootstrap all of that, exactly as the tenancy switcher already does -
 * disabling still reloads in place. `26-329`/`26-318` decision 1: a successful *enable* instead
 * navigates to `/calendar/setup/guide`, the guided setup wizard's own route - still a full document
 * navigation (`window.location.href`), so the newly-enabled module is in effect by the time the wizard's
 * own `calendar:configure` gate runs, just landing somewhere more useful than this same settings page.</p>
 */
export function BookingsModulePage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();

  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [grantedByOwner, setGrantedByOwner] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // `26-320`: the trigger-words editor's own state - the editable text, its save-in-flight flag, and the
  // inline error/confirmation. Kept apart from the enable/disable `busy`/`actionError` above: editing the
  // words is a different write, and it does not reload the page (trigger words feed only routing, not the
  // nav or a permission gate), so its outcome is shown in place rather than swept away by a reload.
  const [triggerInput, setTriggerInput] = useState("");
  const [savingTriggers, setSavingTriggers] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSaved, setTriggerSaved] = useState(false);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchModules(accessToken, siteId)
      .then((response) => {
        const row = response.modules.find((m) => m.moduleKey === BOOKINGS_MODULE_KEY) ?? null;
        setEnabled(row !== null);
        setGrantedByOwner(row?.grantedByOwner ?? false);
        // `26-320`: seed the editor from the stored words - the console already receives them on this same
        // read (`23-01`'s listing), so no extra request is needed to show what they currently are.
        setTriggerInput((row?.triggerWords ?? []).join(", "));
        setTriggerError(null);
        setTriggerSaved(false);
        setLoaded(true);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(
          shapeMismatchMessage(err, strings) ?? (err instanceof ModulesError ? err.message : strings.bookingsModuleLoadError),
        ),
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
    return <AccessRefusal title={strings.navBookingsModule} message={strings.bookingsModuleForbidden} strings={strings} />;
  }

  const run = (action: (accessToken: string, siteId: string) => Promise<void>, onSuccess?: () => void) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setBusy(true);
    setActionError(null);
    action(accessToken, siteId)
      // A full reload re-bootstraps the nav and every calendar screen's gate - see this component's own
      // remarks. The finally below never runs after a successful reload; on failure it clears `busy`.
      //
      // `26-329`/`26-318` decision 1: a successful *enable* navigates to the guided setup wizard
      // instead of reloading in place - `onSuccess` below, passed only by the enable button. That is
      // still a full document navigation (`window.location.href`, not `useNavigate()`), for the
      // identical reason a plain reload is: `PermissionsProvider`'s nav/gate state has to re-bootstrap
      // from the newly-enabled module before the wizard's own `calendar:configure` check would pass.
      .then(() => (onSuccess ?? (() => window.location.reload()))())
      .catch((err: unknown) => {
        setActionError(err instanceof ModulesError ? err.message : strings.bookingsModuleActionError);
        setBusy(false);
      });
  };

  // `26-320`: save the edited trigger words. Unlike `run` above, this does not reload - it updates the field
  // in place from the server's echo and shows a confirmation, because the words feed only visitor routing,
  // nothing the console re-bootstraps on load. The server owns the real validation and words its refusals,
  // so those (reserved word, cross-module collision, bounds) surface verbatim from `ModulesError.message`.
  const saveTriggerWords = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    const words = parseTriggerWords(triggerInput);
    if (words.length === 0) {
      setTriggerError(strings.bookingsModuleTriggerWordsEmpty);
      setTriggerSaved(false);
      return;
    }

    setSavingTriggers(true);
    setTriggerError(null);
    setTriggerSaved(false);
    setModuleTriggerWords(accessToken, siteId, BOOKINGS_MODULE_KEY, words)
      .then((saved) => {
        setTriggerInput(saved.join(", "));
        setTriggerSaved(true);
        setSavingTriggers(false);
      })
      .catch((err: unknown) => {
        setTriggerError(err instanceof ModulesError ? err.message : strings.bookingsModuleTriggerWordsError);
        setSavingTriggers(false);
      });
  };

  return (
    <>
      <PageHead title={strings.navBookingsModule} description={strings.bookingsModuleIntro} />
      {loadError !== null && <Alert tone="danger">{loadError}</Alert>}
      {actionError !== null && <Alert tone="danger">{actionError}</Alert>}

      <Panel title={strings.bookingsModulePanelTitle}>
        {!loaded && loadError === null ? (
          <Spinner label={strings.bookingsModulePanelTitle} />
        ) : (
          <div className="ago-stack">
            <p>
              <Badge tone={enabled ? "success" : "neutral"} dot>
                {enabled ? strings.bookingsModuleStatusOn : strings.bookingsModuleStatusOff}
              </Badge>
            </p>

            {enabled ? (
              grantedByOwner ? (
                <Alert tone="info">{strings.bookingsModuleManagedByOwner}</Alert>
              ) : (
                <>
                  {/* `26-320`: the trigger-words editor - only for a module the tenant enabled themselves.
                      An owner-granted module keeps owner-managed triggers (the branch above), the mirror of
                      the disable refusal, so the field is never offered in that state. */}
                  <Field
                    label={strings.bookingsModuleTriggerWordsLabel}
                    description={strings.bookingsModuleTriggerWordsDescription}
                    error={triggerError}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={triggerInput}
                        disabled={savingTriggers}
                        onChange={(event) => {
                          setTriggerInput(event.target.value);
                          setTriggerSaved(false);
                          setTriggerError(null);
                        }}
                      />
                    )}
                  </Field>
                  {triggerSaved && <Alert tone="success">{strings.bookingsModuleTriggerWordsSaved}</Alert>}
                  <div className="ago-row">
                    <Button variant="primary" disabled={savingTriggers} onClick={saveTriggerWords}>
                      {strings.bookingsModuleTriggerWordsSaveLabel}
                    </Button>
                  </div>

                  <p className="ago-meta">{strings.bookingsModuleDisableDescription}</p>
                  <div className="ago-row">
                    <Button variant="secondary" disabled={busy} onClick={() => run((token, site) => disableModule(token, site, BOOKINGS_MODULE_KEY))}>
                      {strings.bookingsModuleDisableLabel}
                    </Button>
                  </div>
                </>
              )
            ) : (
              <>
                <p className="ago-meta">{strings.bookingsModuleEnableDescription}</p>
                <div className="ago-row">
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        (token, site) => enableModule(token, site, BOOKINGS_MODULE_KEY, BOOKINGS_TRIGGER_WORDS),
                        () => {
                          window.location.href = "/calendar/setup/guide";
                        },
                      )
                    }
                  >
                    {strings.bookingsModuleEnableLabel}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
