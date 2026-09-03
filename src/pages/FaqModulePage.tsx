import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { fetchModules, updateModule, ModulesError } from "../api/modulesApi.js";
import { fetchKnowledgeBase, updateKnowledgeBase, KnowledgeBaseError } from "../api/faqKnowledgeBaseApi.js";
import { parseTriggerWords, validateModuleDraft } from "./moduleConfigValidation.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
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

  // --- Module registration (Ago.Chat.Api) ---
  const [moduleLoaded, setModuleLoaded] = useState(false);
  const [moduleKey, setModuleKey] = useState(SUGGESTED_MODULE_KEY);
  const [triggerWordsInput, setTriggerWordsInput] = useState("");
  const [entryPointInput, setEntryPointInput] = useState("");
  const [moduleLoadError, setModuleLoadError] = useState<string | null>(null);
  const [moduleValidationError, setModuleValidationError] = useState<string | null>(null);
  const [moduleSubmitError, setModuleSubmitError] = useState<string | null>(null);
  const [moduleSaved, setModuleSaved] = useState(false);
  const [moduleSubmitting, setModuleSubmitting] = useState(false);

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
        setModuleKey(existing?.moduleKey ?? SUGGESTED_MODULE_KEY);
        setTriggerWordsInput(existing ? existing.triggerWords.join(", ") : "");
        setEntryPointInput(existing?.entryPoint ?? "");
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
    return (
      <>
        <PageHead title={strings.navFaqAssistant} />
        <Alert tone="danger">{strings.faqForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const handleModuleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setModuleSaved(false);
    setModuleSubmitError(null);

    const trimmedKey = moduleKey.trim();
    const triggerWords = parseTriggerWords(triggerWordsInput);
    const trimmedEntryPoint = entryPointInput.trim();

    const problem = validateModuleDraft(trimmedKey, triggerWords, trimmedEntryPoint, strings);
    setModuleValidationError(problem);
    if (problem !== null) {
      return;
    }

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in session and `siteId` arrives on the same response
      // `hasPermission` above depends on - same "reaching here is a wiring bug" reasoning
      // `WidgetConfigPage`/`OfflineAutoReplyPage` state for their own equivalent check.
      return;
    }

    setModuleSubmitting(true);
    try {
      const dto = await updateModule(accessToken, siteId, {
        moduleKey: trimmedKey,
        triggerWords,
        entryPoint: trimmedEntryPoint,
      });
      setModuleKey(dto.moduleKey);
      setTriggerWordsInput(dto.triggerWords.join(", "));
      setEntryPointInput(dto.entryPoint);
      setModuleSaved(true);
    } catch (err) {
      setModuleSubmitError(err instanceof ModulesError ? err.message : strings.faqModuleSubmitError);
    } finally {
      setModuleSubmitting(false);
    }
  };

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
          <form className="ago-stack" onSubmit={(e) => void handleModuleSubmit(e)}>
            <Field label={strings.faqModuleKeyFieldLabel} description={strings.faqModuleKeyFieldDescription}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={moduleKey}
                  onChange={(e) => setModuleKey(e.target.value)}
                  placeholder={strings.faqModuleKeyPlaceholder}
                  disabled={moduleSubmitting}
                />
              )}
            </Field>

            <Field
              label={strings.faqTriggerWordsFieldLabel}
              description={strings.faqTriggerWordsFieldDescription}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={triggerWordsInput}
                  onChange={(e) => setTriggerWordsInput(e.target.value)}
                  placeholder={strings.faqTriggerWordsPlaceholder}
                  disabled={moduleSubmitting}
                />
              )}
            </Field>

            <Field label={strings.faqEntryPointFieldLabel} description={strings.faqEntryPointFieldDescription}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="url"
                  value={entryPointInput}
                  onChange={(e) => setEntryPointInput(e.target.value)}
                  placeholder={strings.faqEntryPointPlaceholder}
                  disabled={moduleSubmitting}
                />
              )}
            </Field>

            {moduleValidationError && <Alert tone="danger">{moduleValidationError}</Alert>}
            {moduleSubmitError && <Alert tone="danger">{moduleSubmitError}</Alert>}
            {moduleSaved && <Alert tone="success">{strings.siteConfigSavedAlert}</Alert>}

            <div className="ago-row">
              <Button type="submit" variant="primary" disabled={moduleSubmitting}>
                {moduleSubmitting ? strings.siteConfigSavingButton : strings.siteConfigSaveButton}
              </Button>
            </div>
          </form>
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
