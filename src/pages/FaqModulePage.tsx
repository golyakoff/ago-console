import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { fetchModules, ModulesError } from "../api/modulesApi.js";
import { fetchKnowledgeBase, updateKnowledgeBase, KnowledgeBaseError } from "../api/faqKnowledgeBaseApi.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Textarea } from "../components/Textarea.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** The module key this screen suggests when nothing is registered yet - UI copy only
 * (`modulesApi.ts`'s own doc comment: the client itself carries no notion of "FAQ"). An operator is
 * free to type a different one; nothing on this screen or `Ago.Chat.Api`'s own endpoint requires it. */
const SUGGESTED_MODULE_KEY = "faq";

/**
 * `19-03`: `/settings/faq` - two independent forms on one screen, gated the same way every other
 * tenant self-service screen already is (`usePermissions()` decides whether to render at all;
 * `site:configure` on both servers is the real gate).
 *
 * <p><b>Two forms, not one, because they call two different backends.</b> The module-registration
 * panel calls `Ago.Chat.Api`'s own generic `/modules` endpoint (`modulesApi.ts`) - the same backend
 * every other screen on this page's route talks to. The knowledge-base panel calls `Ago.Faq.Api`, a
 * completely different origin on a different repository's own deploy (`ago-faq`) - because the
 * knowledge-base text is that module's own data, and `Ago.Chat.*` never proxies or understands it, the
 * same "the platform must never reference a product" boundary `CLAUDE.md` draws for the backend,
 * applied here to a second product's own module rather than to AGO Calendar. `WidgetConfigPage`'s two
 * panels share one `<form>` because one `PUT` writes every field either panel shows; that shortcut is
 * not available here - each panel has its own `<form>`, its own load/submit/error/saved state, and its
 * own save button, because saving one genuinely does not save the other. Collapsing them into a single
 * button would either fake one call out of two real ones or silently drop the correctness this split
 * exists to keep visible.</p>
 *
 * <p>The knowledge-base panel additionally handles `config.faqApiBaseUrl === null` - a real, honest
 * deployment state (`ago-faq` has no production deployment yet) - by rendering "not configured"
 * instead of attempting a call that cannot succeed. The module-registration panel has no equivalent
 * gate: it calls this console's own already-configured `Ago.Chat.Api`, the same backend every other
 * settings screen depends on.</p>
 */
export function FaqModulePage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);

  // --- Which products are on this account (Ago.Chat.Api), read-only ---
  // `23-84`: a read, not a form. `23-83` removed the tenant-facing provisioning writes entirely -
  // `adr/0151`: a tenant never turns a capability on for themselves - so the only thing left for this
  // panel to do is say what is on the account. That item deliberately kept the `GET` for exactly this.
  //
  // The form this replaces never worked, and that is established rather than assumed: it sent
  // moduleKey/triggerWords/entryPoint and the endpoint also required a credential and a provisioning
  // secret, which `ModuleCredential`'s own constructor rejects as null before any module is contacted.
  // Every submit it could make was refused from the day it shipped (`19-03`).
  const [moduleLoaded, setModuleLoaded] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [moduleKey, setModuleKey] = useState(SUGGESTED_MODULE_KEY);
  const [triggerWords, setTriggerWords] = useState<string[]>([]);
  const [moduleLoadError, setModuleLoadError] = useState<string | null>(null);

  // --- Knowledge base (Ago.Faq.Api) ---
  const [kbLoaded, setKbLoaded] = useState(false);
  const [kbText, setKbText] = useState("");
  const [kbUpdatedAt, setKbUpdatedAt] = useState<string | null>(null);
  const [kbLoadError, setKbLoadError] = useState<string | null>(null);
  const [kbSubmitError, setKbSubmitError] = useState<string | null>(null);
  const [kbSaved, setKbSaved] = useState(false);
  const [kbSubmitting, setKbSubmitting] = useState(false);

  const loadModule = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchModules(accessToken, siteId)
      .then((response) => {
        const existing = response.modules.find((m) => m.moduleKey === SUGGESTED_MODULE_KEY) ?? null;
        setModuleEnabled(existing !== null);
        setModuleKey(existing?.moduleKey ?? SUGGESTED_MODULE_KEY);
        setTriggerWords(existing?.triggerWords ?? []);
        setModuleLoaded(true);
        setModuleLoadError(null);
      })
      .catch((err: unknown) =>
        setModuleLoadError(err instanceof ModulesError ? err.message : strings.faqModuleLoadError),
      );
  }, [user?.access_token, siteId, strings]);

  const loadKnowledgeBase = useCallback(() => {
    const accessToken = user?.access_token;
    // `config.faqApiBaseUrl === null` is handled entirely by the render branch below - no call is
    // attempted, and `kbLoaded` is deliberately left `false` forever in that case since the "not
    // configured" branch never reads it.
    if (!accessToken || !siteId || config.faqApiBaseUrl === null) {
      return;
    }

    fetchKnowledgeBase(accessToken, siteId)
      .then((dto) => {
        setKbText(dto.text);
        setKbUpdatedAt(dto.updatedAt);
        setKbLoaded(true);
        setKbLoadError(null);
      })
      .catch((err: unknown) =>
        setKbLoadError(err instanceof KnowledgeBaseError ? err.message : strings.faqKnowledgeBaseLoadError),
      );
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    loadModule();
    loadKnowledgeBase();
  }, [loadModule, loadKnowledgeBase, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return <AccessRefusal title={strings.navFaqAssistant} message={strings.faqForbidden} strings={strings} />;
  }

  const handleKnowledgeBaseSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setKbSaved(false);
    setKbSubmitError(null);

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setKbSubmitting(true);
    try {
      const dto = await updateKnowledgeBase(accessToken, siteId, kbText);
      setKbText(dto.text);
      setKbUpdatedAt(dto.updatedAt);
      setKbSaved(true);
    } catch (err) {
      setKbSubmitError(err instanceof KnowledgeBaseError ? err.message : strings.faqKnowledgeBaseSubmitError);
    } finally {
      setKbSubmitting(false);
    }
  };

  const kbUpdatedAtInstant = parseInstant(kbUpdatedAt);

  return (
    <>
      <PageHead title={strings.navFaqAssistant} description={strings.faqPageDescription} />

      {moduleLoadError && <Alert tone="danger">{moduleLoadError}</Alert>}

      {!moduleLoaded && !moduleLoadError ? (
        <Panel>
          <Skeleton lines={3} label={strings.faqModuleLoadingLabel} />
        </Panel>
      ) : (
        <Panel title={strings.faqModulePanelTitle} description={strings.faqModuleDescription}>
          {moduleEnabled ? (
            <dl className="ago-stack">
              <dt>{strings.faqModuleEnabledLabel}</dt>
              <dd>{moduleKey}</dd>
              {triggerWords.length > 0 && (
                <>
                  <dt>{strings.faqModuleTriggerWordsLabel}</dt>
                  <dd>{triggerWords.join(", ")}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="ago-meta">{strings.faqModuleNotEnabled}</p>
          )}
        </Panel>
      )}

      {config.faqApiBaseUrl === null ? (
        <Panel title={strings.faqKnowledgeBasePanelTitle}>
          <Alert tone="info">{strings.faqKnowledgeBaseNotConfigured}</Alert>
        </Panel>
      ) : (
        <>
          {kbLoadError && <Alert tone="danger">{kbLoadError}</Alert>}

          {!kbLoaded && !kbLoadError ? (
            <Panel>
              <Skeleton lines={3} label={strings.faqKnowledgeBaseLoadingLabel} />
            </Panel>
          ) : (
            <Panel title={strings.faqKnowledgeBasePanelTitle} description={strings.faqKnowledgeBaseDescription}>
              <form className="ago-stack" onSubmit={(e) => void handleKnowledgeBaseSubmit(e)}>
                <Field label={strings.faqKnowledgeBaseTextFieldLabel}>
                  {(controlProps) => (
                    <Textarea
                      {...controlProps}
                      rows={10}
                      value={kbText}
                      onChange={(e) => setKbText(e.target.value)}
                      placeholder={strings.faqKnowledgeBaseTextPlaceholder}
                      disabled={kbSubmitting}
                    />
                  )}
                </Field>

                <p className="ago-field__description">
                  {kbUpdatedAtInstant
                    ? `${strings.faqKnowledgeBaseUpdatedAtPrefix} ${formatAbsolute(kbUpdatedAtInstant, timeZone, strings)}`
                    : strings.faqKnowledgeBaseNeverSaved}
                </p>

                {kbSubmitError && <Alert tone="danger">{kbSubmitError}</Alert>}
                {kbSaved && <Alert tone="success">{strings.siteConfigSavedAlert}</Alert>}

                <div className="ago-row">
                  <Button type="submit" variant="primary" disabled={kbSubmitting}>
                    {kbSubmitting ? strings.siteConfigSavingButton : strings.siteConfigSaveButton}
                  </Button>
                </div>
              </form>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
