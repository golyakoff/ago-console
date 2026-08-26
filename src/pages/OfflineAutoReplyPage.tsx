import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchOfflineAutoReply,
  updateOfflineAutoReply,
  OfflineAutoReplyError,
} from "../api/offlineAutoReplyApi.js";
import {
  MAX_RULES,
  toRequestRules,
  validateDraft,
  type DraftRule,
} from "./offlineAutoReplyValidation.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";

const EMPTY_RULE: DraftRule = { keyword: "", reply: "" };

/**
 * `14-04`: `/settings/auto-reply` - the tenant's own switch for the offline auto-reply, and the
 * editor for what it says.
 *
 * <p>Gated exactly the way `WidgetConfigPage` established: `usePermissions()` decides whether to
 * render the form at all (client-side, UX only, and the shell's navigation entry is hidden by the
 * same check), while `14-04`'s server-side `site:configure` check on both `GET` and `PUT` is the
 * actual gate. An operator who reaches this route some other way still gets a real `403`, surfaced
 * as text rather than hidden.</p>
 *
 * <p>The editor keeps one blank rule row at the bottom to type into and drops blank rows on save -
 * simpler than an explicit "add rule" button, and it makes the common case (one or two rules) a
 * single interaction. Order is preserved and stated in the UI, because it is behaviour: the server
 * matches first-rule-wins.</p>
 */
export function OfflineAutoReplyPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [fallbackReply, setFallbackReply] = useState("");
  const [rules, setRules] = useState<DraftRule[]>([EMPTY_RULE]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchOfflineAutoReply(accessToken, siteId)
      .then((dto) => {
        setEnabled(dto.enabled);
        setFallbackReply(dto.fallbackReply);
        setRules([...dto.rules, EMPTY_RULE]);
        setLoaded(true);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(
          err instanceof OfflineAutoReplyError ? err.message : "Failed to load the offline auto-reply.",
        ),
      );
  }, [user?.access_token, siteId]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label="Checking your permissions…" />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title="Offline auto-reply" />
        <Alert tone="danger">You do not have permission to configure this site&apos;s offline auto-reply.</Alert>
        <p>
          <Link to="/">Back to queue</Link>
        </p>
      </>
    );
  }

  const editRule = (index: number, patch: Partial<DraftRule>) => {
    setRules((current) => {
      const next = current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
      // Always one blank row to type into, and never two.
      const last = next[next.length - 1];
      if (last && (last.keyword.trim().length > 0 || last.reply.trim().length > 0) && next.length < MAX_RULES + 1) {
        next.push(EMPTY_RULE);
      }

      return next;
    });
  };

  const removeRule = (index: number) => {
    setRules((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length === 0 ? [EMPTY_RULE] : next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(null);

    const problem = validateDraft(enabled, fallbackReply, rules);
    setValidationError(problem);
    if (problem !== null) {
      return;
    }

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in session and `siteId` arrives on the same response
      // `hasPermission` above depends on - same "reaching here is a wiring bug" reasoning
      // `WidgetConfigPage` states for its own equivalent check.
      return;
    }

    setSubmitting(true);
    try {
      const dto = await updateOfflineAutoReply(accessToken, siteId, {
        enabled,
        fallbackReply: fallbackReply.trim(),
        rules: toRequestRules(rules),
      });
      setEnabled(dto.enabled);
      setFallbackReply(dto.fallbackReply);
      setRules([...dto.rules, EMPTY_RULE]);
      setSaved(true);
    } catch (err) {
      setSubmitError(
        err instanceof OfflineAutoReplyError ? err.message : "Failed to save the offline auto-reply.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHead
        title="Offline auto-reply"
        /* Stated on the screen because it is the single most surprising property of the feature, and
           an operator who does not know it will read a missing reply as a bug. */
        description="When this is on and nobody on your team is online, a visitor's first message gets an automatic reply instead of silence. It never replies while someone is online - a colleague who is simply busy still counts as online - and it never replies to a conversation somebody has already picked up."
      />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {!loaded && !loadError ? (
        <Panel>
          <Skeleton lines={3} label="Loading the offline auto-reply…" />
        </Panel>
      ) : (
        <Panel title="Replies while you are away">
          <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
            <label className="ago-row">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={submitting}
              />
              <span>Reply automatically when nobody is online</span>
            </label>

            <Field
              label="Default reply"
              description="Sent when no keyword below matches. This is what most visitors will see."
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={3}
                  value={fallbackReply}
                  onChange={(e) => setFallbackReply(e.target.value)}
                  placeholder="Thanks for writing - we are closed right now and will reply in the morning."
                  disabled={submitting}
                />
              )}
            </Field>

            <fieldset className="ago-stack">
              <legend>Keyword rules</legend>
              <p>
                If the visitor&apos;s message contains a keyword, that rule&apos;s reply is sent instead of the
                default. The first matching rule wins, so put the more specific ones first. Leave a row blank
                to drop it.
              </p>
              {rules.map((rule, index) => (
                // Index as the key: these rows have no id of their own, and the list is only ever
                // edited in place or truncated - never reordered by the UI - so an index key cannot
                // mismatch state to a row here.
                <div className="ago-row" key={index}>
                  <Field label={`Keyword ${index + 1}`}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        value={rule.keyword}
                        onChange={(e) => editRule(index, { keyword: e.target.value })}
                        placeholder="refund"
                        disabled={submitting}
                      />
                    )}
                  </Field>
                  <Field label={`Reply ${index + 1}`}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        value={rule.reply}
                        onChange={(e) => editRule(index, { reply: e.target.value })}
                        placeholder="Refunds take three working days."
                        disabled={submitting}
                      />
                    )}
                  </Field>
                  <Button
                    type="button"
                    onClick={() => removeRule(index)}
                    disabled={submitting}
                    aria-label={`Remove keyword rule ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </fieldset>

            {validationError && <Alert tone="danger">{validationError}</Alert>}
            {submitError && <Alert tone="danger">{submitError}</Alert>}
            {saved && <Alert tone="success">Saved.</Alert>}

            <div className="ago-row">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
