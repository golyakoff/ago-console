import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchOwnerSiteDetail,
  grantOwnerModule,
  revokeOwnerModule,
  updateOwnerSiteAllowedOrigins,
  type OwnerSiteDetail,
  type OwnerSiteModule,
} from "../api/ownerApi.js";
import { en } from "../i18n/en.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { buildTenantNavSections } from "../shell/consoleNav.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Panel } from "../components/Panel.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Textarea } from "../components/Textarea.js";
import { isValidEntryPointUrl, parseTriggerWords } from "../pages/moduleConfigValidation.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import {
  describeRecentWindow,
  formatByteSize,
  formatCount,
  formatModuleExpiry,
  formatModuleStatus,
  formatNoRecentActivity,
  formatRecentMessagesHeader,
} from "./ownerSites.js";

/** `23-65`: whether the grant form's expiry has been chosen at all. `"unset"` is the form's own
 * initial state and blocks submission - `adr/0150`'s own "a grant with no expiry is a discount
 * nobody remembers giving" applies to the screen exactly as it did to the runbook's own required-
 * and-nullable wire field, so this screen must not default to either "never" or a date; the platform
 * owner has to pick one. */
type ExpiryChoice = "unset" | "never" | "date";

/** What the server has said so far about this caller's access to `23-14`'s endpoint, and whether the
 * named site exists at all - the same `OwnerAccess` shape `OwnerSitesPage` uses, plus `"not-found"`
 * for a real 404 (the platform owner may legitimately name a site that does not exist, which is a
 * different fact from "you may not see this"). */
type OwnerDetailAccess = "unknown" | "granted" | "refused" | "not-found";

/**
 * `23-14`: the platform owner's per-tenant detail read - `GET /api/v1/owner/sites/{siteId}`. The
 * drill-down `ui-inventory.md` §8.1 recorded as absent from `/owner`: the same eight facts
 * `OwnerSitesPage`'s table already shows for a page of sites, for exactly the one a row was clicked
 * for, plus that tenant's entitlements - which module it holds, whether the platform owner granted it
 * or the tenant enabled it themselves, and when each grant ends (or that it never does).
 *
 * **Read-only, exactly like its sibling.** `decisions.md` §6: granting or revoking stays a runbook
 * for now (`23-15`), because both writes need the deployment-wide provisioning secret in the request
 * body and a console form would put that secret in a browser. This screen adds no button that acts.
 *
 * **Mounted outside the operator layout**, the identical reasoning `OwnerSitesPage`'s own doc comment
 * gives: the platform owner may hold no `operators` row at all, so nothing here may assume one.
 *
 * **Deliberately hardcoded English**, matching `OwnerSitesPage` and `ui-inventory.md` §8.1's recorded
 * decision - `/owner` is not scoped to one tenant, so it cannot follow one tenant's language. This
 * page passes the built-in `en` table for its nav, exactly like its sibling, and writes every other
 * string in this file as plain English rather than calling `useStrings()`.
 */
export function OwnerSiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { user, logout } = useAuth();
  const { siteId: ownSiteId, hasPermission, enabledModules } = usePermissions();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerDetailAccess>("unknown");
  const [site, setSite] = useState<OwnerSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `23-48`: the allowed-origins editor's own state - a plain textarea draft (one origin per line)
  // rather than a dynamic list of text inputs, matching `OfflineAutoReplyPage`'s own "simplest
  // control that can hold the value" judgement for a small, rarely-edited list.
  const [originsDraft, setOriginsDraft] = useState("");
  const [originsError, setOriginsError] = useState<string | null>(null);
  const [originsSaved, setOriginsSaved] = useState(false);
  const [originsSaving, setOriginsSaving] = useState(false);

  // `23-65`: the grant form's own state. `expiryChoice` starts `"unset"` - neither "never" nor a real
  // date - so the platform owner has to pick one before this form can submit at all; see this file's
  // own `ExpiryChoice` remarks.
  const [moduleKeyInput, setModuleKeyInput] = useState("");
  const [triggerWordsInput, setTriggerWordsInput] = useState("");
  const [entryPointInput, setEntryPointInput] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>("unset");
  const [expiryDateInput, setExpiryDateInput] = useState("");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSaved, setGrantSaved] = useState(false);
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // `23-65`: the revoke confirmation's own state - which module (if any) the dialog is open for,
  // and the reason draft it collects when that module is a tenant's own purchase
  // (`module.grantedByOwner === false`). `revokingModule` doubles as the dialog's `open` flag, the
  // same "the row being acted on is the state" shape `RemoveOperatorButton`'s own confirmation uses,
  // adapted here because the trigger is one column of a shared table rather than a component with its
  // own row.
  const [revokingModule, setRevokingModule] = useState<OwnerSiteModule | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  const timeZone = useMemo(() => resolveTimeZone(), []);

  // `23-65`: extracted out of the load effect below so a successful grant or revoke can re-run the
  // identical read rather than splice a locally-built row into `site.modules` - `GrantModuleResponse`
  // does not even carry `isActive`/`grantedByOwner`, and this screen's own Done-when requires
  // `isActive` to come from the server's own live comparison, never be recomputed here (`buildModuleColumns`'s
  // own remarks below).
  const loadSiteDetail = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchOwnerSiteDetail(accessToken, siteId)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          setAccess("refused");
          return;
        }

        if (outcome.status === "not-found") {
          setAccess("not-found");
          return;
        }

        setAccess("granted");
        setSite(outcome.site);
        setOriginsDraft(outcome.site.allowedOrigins.join("\n"));
      })
      .catch((err: unknown) => {
        // Same "the API is broken" vs. "you may not see this" split every owner screen makes.
        setError(err instanceof Error ? err.message : "Failed to load this site's detail.");
      });
  }, [accessToken, siteId]);

  useEffect(() => {
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in user, and this route only ever mounts with a `:siteId`
      // segment (`App.tsx`) - the same "reaching here without one is a wiring bug" reasoning the
      // other pages state for their own preconditions.
      return;
    }

    loadSiteDetail();
    // `loadSiteDetail` is recreated only when `accessToken`/`siteId` change, so this still runs
    // exactly once per those - the identical effect this file had before extracting the loader, minus
    // the `cancelled` guard a single mount-time call never needed once `loadSiteDetail` itself is the
    // thing re-invoked deliberately (by the grant/revoke handlers below), not raced by an unmount.
  }, [accessToken, siteId, loadSiteDetail]);

  const moduleColumns = useMemo(
    () =>
      buildModuleColumns(timeZone, (module) => {
        setRevokingModule(module);
        setRevokeReason("");
        setRevokeError(null);
      }),
    [timeZone],
  );

  const handleSaveOrigins = () => {
    if (!accessToken || !siteId) {
      return;
    }

    // Blank lines are a typing artifact (an extra Enter at the end), not a value to send - dropped
    // client-side so the common case (paste, hit save) does not first bounce off the server's own
    // "an entry cannot be empty" guard for a line the person never meant as a real entry.
    const origins = originsDraft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setOriginsSaving(true);
    setOriginsError(null);
    setOriginsSaved(false);

    updateOwnerSiteAllowedOrigins(accessToken, siteId, origins)
      .then((outcome) => {
        if (outcome.status === "ok") {
          setSite((current) => (current ? { ...current, allowedOrigins: outcome.allowedOrigins } : current));
          setOriginsDraft(outcome.allowedOrigins.join("\n"));
          setOriginsSaved(true);
          return;
        }

        if (outcome.status === "invalid") {
          setOriginsError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session: the token expired, or the tenant was removed
        // while this screen was open - both genuinely unexpected here (the page itself already
        // proved `granted` and a real site to reach this form at all), so this is reported the same
        // plain way the page's own load-time `error` state is, not folded into the field-level
        // `originsError` a caller can fix by retyping.
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setOriginsError(err instanceof Error ? err.message : "Failed to save the allowed origins.");
      })
      .finally(() => {
        setOriginsSaving(false);
      });
  };

  // `23-65`: the grant form's own submit. Client-side validation mirrors
  // `moduleConfigValidation.ts`'s own floor (well-formed, non-empty) - the server is still the real
  // gate on everything else (reserved/conflicting trigger words, entry-point reachability, expiry
  // bounds), the identical split every other form on this console already keeps.
  const handleGrantSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setGrantSaved(false);
    setGrantError(null);

    const trimmedKey = moduleKeyInput.trim();
    const triggerWords = parseTriggerWords(triggerWordsInput);
    const trimmedEntryPoint = entryPointInput.trim();
    const trimmedCredential = credentialInput.trim();

    if (trimmedKey.length === 0) {
      setGrantError("Enter a module key.");
      return;
    }
    if (triggerWords.length === 0) {
      setGrantError("Enter at least one trigger word.");
      return;
    }
    if (trimmedEntryPoint.length === 0 || !isValidEntryPointUrl(trimmedEntryPoint)) {
      setGrantError("Enter a valid https entry point.");
      return;
    }
    if (trimmedCredential.length === 0) {
      setGrantError("Enter the module's own per-site credential.");
      return;
    }

    // `adr/0150`'s own "a grant with no expiry is a discount nobody remembers giving": this form
    // will not submit at all until the platform owner has actively chosen one of the two options
    // below - there is no default that reaches the request body.
    let expiresAt: string | null;
    if (expiryChoice === "unset") {
      setGrantError("Choose whether this grant expires - \"Never\" is a choice too, not a default.");
      return;
    } else if (expiryChoice === "never") {
      expiresAt = null;
    } else {
      if (expiryDateInput.trim().length === 0) {
        setGrantError("Enter the date and time this grant expires.");
        return;
      }
      const parsed = new Date(expiryDateInput);
      if (Number.isNaN(parsed.getTime())) {
        setGrantError("That expiry date and time could not be read.");
        return;
      }
      expiresAt = parsed.toISOString();
    }

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setGrantSubmitting(true);
    grantOwnerModule(accessToken, siteId, {
      moduleKey: trimmedKey,
      triggerWords,
      entryPoint: trimmedEntryPoint,
      credential: trimmedCredential,
      expiresAt,
    })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setGrantSaved(true);
          setModuleKeyInput("");
          setTriggerWordsInput("");
          setEntryPointInput("");
          setCredentialInput("");
          setExpiryChoice("unset");
          setExpiryDateInput("");
          // Re-read rather than splice a locally-built row in - `outcome.module` carries no
          // `isActive`/`grantedByOwner` (`GrantOwnerModuleOutcome`'s own remarks), and this table
          // renders only what the server itself computed.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid" || outcome.status === "unavailable") {
          setGrantError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // `handleSaveOrigins` above gives its own equivalent outcomes.
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setGrantError(err instanceof Error ? err.message : "Failed to grant the module.");
      })
      .finally(() => {
        setGrantSubmitting(false);
      });
  };

  // `23-65`/`adr/0118`: the revoke dialog's own confirm. `force`/`reason` are derived from
  // `revokingModule.grantedByOwner`, never typed by the platform owner directly - the dialog already
  // shows which case this is (`renderRevokeDialogBody` below), so asking them to also tick a "force"
  // box would be asking them to restate a fact the screen already told them, the same redundancy
  // `RemoveOperatorButton`'s own confirm avoids by not exposing mechanics the caller cannot change.
  const handleRevokeConfirm = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !revokingModule) {
      return;
    }

    const isPurchase = !revokingModule.grantedByOwner;
    const trimmedReason = revokeReason.trim();
    if (isPurchase && trimmedReason.length === 0) {
      setRevokeError("Write the reason you would be willing to show this tenant.");
      return;
    }

    setRevokeSubmitting(true);
    setRevokeError(null);

    revokeOwnerModule(accessToken, siteId, revokingModule.moduleKey, {
      force: isPurchase,
      reason: isPurchase ? trimmedReason : null,
    })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRevokingModule(null);
          setRevokeReason("");
          loadSiteDetail();
          return;
        }

        if (
          outcome.status === "requires-force" ||
          outcome.status === "invalid" ||
          outcome.status === "unavailable"
        ) {
          setRevokeError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the module (or the site) is gone by the time
        // this was confirmed. Reported the same page-level way `handleSaveOrigins`'s own equivalent
        // case is.
        setRevokingModule(null);
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setRevokeError(err instanceof Error ? err.message : "Failed to revoke the module.");
      })
      .finally(() => {
        setRevokeSubmitting(false);
      });
  };

  return (
    <AppShell
      // The identical sections `OwnerSitesPage` builds - "Platform sites" stays present as
      // `pinnedItem` and, unlike that page's own `end: true`, is highlighted while on this sub-route
      // too (`end: false`): this screen is still part of the platform-sites section, one tenant deep
      // into it.
      sections={ownSiteId ? buildTenantNavSections(hasPermission, en, enabledModules ?? []) : []}
      // `23-43`: only once the server has actually accepted this caller, exactly as
      // `demoNoticeAudience` below already is. The demo console's operator login is published,
      // so anyone can sign in and type `/owner`; drawing a rail link to a view they were just
      // refused tells a stranger that a platform-operations view exists and where it lives.
      // "unknown" draws nothing either - a link that appears for a moment and then vanishes on
      // the refusal has already said it.
      pinnedItem={access === "granted" ? { to: "/owner", label: en.navPlatformSites, end: false } : undefined}
      // `23-45`: as OwnerSitesPage - see that file, and `PublicDemoNotice`'s own remarks.
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={ownSiteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label="Opening this tenant's detail…" />}

      {access === "refused" && (
        <>
          <PageHead title="Platform operations" />
          {/* `23-43`: says that the caller was refused, and no longer says by what. "Restricted to
              the platform owner" told a reader who is not one that such a role exists on this
              deployment - which on a console whose operator login is published means telling
              anybody. Refusing without naming the thing refused is the smaller disclosure and is
              equally true; the reader who *is* the owner never sees this branch. */}
          <Alert tone="danger" title="Not authorized">
            This view is not available to you. The server refused the request, so no site data was
            loaded.
          </Alert>
        </>
      )}

      {access === "not-found" && (
        <>
          <PageHead title="Platform sites" />
          <Alert tone="danger" title="No such site">
            No site matches this id. It may have been mistyped, or the tenant no longer exists.
          </Alert>
          <p>
            <Link to="/owner">Back to the site list</Link>
          </p>
        </>
      )}

      {error !== null && access !== "refused" && access !== "not-found" && (
        <>
          {access === "unknown" && <PageHead title="Platform sites" />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && site !== null && (
        <>
          <PageHead
            title={site.name.trim().length > 0 ? site.name : "Unnamed site"}
            description={`Read-only - this screen shows this tenant's actual state, it changes nothing. Message volume and last activity cover ${describeRecentWindow(site.recentWindowDays)} - the window the API itself reports; seats, conversations and stored bytes are all-time.`}
          />

          <dl className="ago-owner-detail-facts">
            <div>
              <dt>Site id</dt>
              <dd>
                <Badge tone="neutral" mono>
                  {site.siteId}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd>
                <Badge tone="neutral">{site.tier}</Badge>
              </dd>
            </div>
            <div>
              <dt>Seats</dt>
              <dd>{formatCount(site.seatCount)}</dd>
            </div>
            <div>
              <dt>Conversations</dt>
              <dd>{formatCount(site.conversationCount)}</dd>
            </div>
            <div>
              <dt>{formatRecentMessagesHeader(site.recentWindowDays)}</dt>
              <dd>{formatCount(site.recentMessageCount)}</dd>
            </div>
            <div>
              <dt>Attachments</dt>
              <dd>
                <span title={`${formatCount(site.attachmentBytes)} bytes`}>
                  {formatByteSize(site.attachmentBytes)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{renderDateFact(site.createdAt, timeZone, "Not recorded", "This site predates the platform recording creation dates, so its creation date is genuinely unknown.")}</dd>
            </div>
            <div>
              <dt>Last activity</dt>
              <dd>
                {renderDateFact(
                  site.lastMessageAt,
                  timeZone,
                  formatNoRecentActivity(site.recentWindowDays),
                  `This is the most recent message within ${describeRecentWindow(site.recentWindowDays)} only. An older message may exist; the API does not report one, deliberately.`,
                )}
              </dd>
            </div>
          </dl>

          {/* `23-48`: the platform owner's own editor - the only place any of it may be changed at
              all. Neither the tenant's own console nor this screen's read-only entitlements table
              below gets a form; this is the one field on this page that writes anything. */}
          <Panel
            title="Allowed origins"
            description="The pages this tenant's widget is allowed to run on. Only the platform owner may change this - a tenant who needs a different address still has to ask."
          >
            <Field
              label="Origins, one per line"
              description="Scheme and host only - e.g. https://shop.example. No path, no trailing slash: this is compared literally against the browser's own Origin header."
              error={originsError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={4}
                  value={originsDraft}
                  onChange={(event) => {
                    setOriginsDraft(event.target.value);
                    setOriginsSaved(false);
                  }}
                />
              )}
            </Field>
            <p>
              <Button onClick={handleSaveOrigins} disabled={originsSaving}>
                {originsSaving ? "Saving…" : "Save allowed origins"}
              </Button>
            </p>
            {originsSaved && !originsError && (
              <Alert tone="success">Saved. The widget honours this on its very next request - no restart needed.</Alert>
            )}
          </Panel>

          <h2>Entitlements</h2>

          {/* The expiry warning, in words (`flows.md` 5.2, this item's own Done-when): `expiresAt`
              binds the granting side only. Chat stops offering a lapsed module the instant it
              expires, but the module itself is never told - so a screen presenting expiry as a clean
              end date would be lying to its own author. Shown once, above the table, rather than
              repeated per row. */}
          <Alert tone="info">
            An expiry date only stops chat from offering a module to this tenant - the module itself is
            never told when a grant lapses, and does not independently refuse a call it can still
            verify. "Expired" below means chat has stopped offering it, not that the module has been
            informed.
          </Alert>

          {site.modules.length === 0 ? (
            <p className="ago-empty">This tenant has no modules enabled.</p>
          ) : (
            <Table
              caption="Every module this tenant has ever had enabled, including any that have since expired."
              columns={moduleColumns}
              rows={site.modules}
              rowKey={(module) => module.moduleKey}
            />
          )}

          {/* `23-65`/`adr/0150`: the grant form itself. No `provisioningSecret` field anywhere on
              this page - the browser never holds `adr/0095`'s deployment-wide secret, `Ago.Chat.Api`
              supplies it from its own configuration, and this form's own request body has no field
              to carry one even if someone tried. */}
          <Panel
            title="Grant a module"
            description="Gives this tenant a module with no payment - a sales trial, or restoring what a failed payment should have provisioned. The tenant cannot tell a grant apart from their own purchase in ordinary use; only this screen and the audit trail can."
          >
            <form className="ago-stack" onSubmit={handleGrantSubmit}>
              <Field label="Module key" description="calendar, faq">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={moduleKeyInput}
                    onChange={(event) => setModuleKeyInput(event.target.value)}
                    placeholder="calendar"
                    disabled={grantSubmitting}
                  />
                )}
              </Field>

              <Field label="Trigger words" description="What a visitor types to reach the module. Comma- or newline-separated.">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={triggerWordsInput}
                    onChange={(event) => setTriggerWordsInput(event.target.value)}
                    placeholder="/booking"
                    disabled={grantSubmitting}
                  />
                )}
              </Field>

              <Field label="Entry point" description="Where the module is reached - an absolute https URL.">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="url"
                    value={entryPointInput}
                    onChange={(event) => setEntryPointInput(event.target.value)}
                    placeholder="https://calendar.example.com"
                    disabled={grantSubmitting}
                  />
                )}
              </Field>

              <Field label="Credential" description="The module's own per-site credential. Never shown again once saved.">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="password"
                    autoComplete="off"
                    value={credentialInput}
                    onChange={(event) => setCredentialInput(event.target.value)}
                    disabled={grantSubmitting}
                  />
                )}
              </Field>

              {/* `adr/0150`'s own "a grant with no expiry is a discount nobody remembers giving":
                  neither radio starts selected, so submitting with neither chosen is the one thing
                  this form refuses before it ever reaches the server - see handleGrantSubmit's own
                  check. */}
              <fieldset>
                <legend>Expiry</legend>
                <label className="ago-row">
                  <input
                    type="radio"
                    name="owner-module-expiry"
                    checked={expiryChoice === "never"}
                    onChange={() => setExpiryChoice("never")}
                    disabled={grantSubmitting}
                  />
                  <span>Never expires</span>
                </label>
                <label className="ago-row">
                  <input
                    type="radio"
                    name="owner-module-expiry"
                    checked={expiryChoice === "date"}
                    onChange={() => setExpiryChoice("date")}
                    disabled={grantSubmitting}
                  />
                  <span>Expires on</span>
                  <input
                    type="datetime-local"
                    value={expiryDateInput}
                    onFocus={() => setExpiryChoice("date")}
                    onChange={(event) => {
                      setExpiryChoice("date");
                      setExpiryDateInput(event.target.value);
                    }}
                    disabled={grantSubmitting}
                  />
                </label>
              </fieldset>

              {grantError && <Alert tone="danger">{grantError}</Alert>}
              {grantSaved && !grantError && <Alert tone="success">Granted. The tenant has it now.</Alert>}

              <div className="ago-row">
                <Button type="submit" variant="primary" disabled={grantSubmitting}>
                  {grantSubmitting ? "Granting…" : "Grant module"}
                </Button>
              </div>
            </form>
          </Panel>
        </>
      )}

      {/* `23-65`/`adr/0118`: provenance is shown here, before the confirm - never left for after,
          since it is not recoverable once the row is gone (this item's own Done-when). */}
      <Dialog
        open={revokingModule !== null}
        title={revokingModule ? `Revoke ${revokingModule.moduleKey}` : "Revoke module"}
        onClose={() => {
          if (!revokeSubmitting) {
            setRevokingModule(null);
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokingModule(null)} disabled={revokeSubmitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRevokeConfirm} disabled={revokeSubmitting}>
              {revokeSubmitting ? "Revoking…" : "Revoke"}
            </Button>
          </>
        }
      >
        {revokingModule && (
          <>
            {revokingModule.grantedByOwner ? (
              <p>
                <Badge tone="accent">Platform owner</Badge> granted this module. Revoking it takes back
                something we gave away - nothing more is needed.
              </p>
            ) : (
              <>
                <p>
                  <Badge tone="neutral">Tenant</Badge> purchased this module themselves. Revoking it
                  overrides something they paid for - `adr/0118` requires a reason, stored verbatim, so
                  the tenant can be told why later.
                </p>
                <Field
                  label="Reason"
                  description={'Write the reason you would be willing to show this tenant. "Cleanup" or "asked to" are not reasons.'}
                  error={revokeError}
                >
                  {(controlProps) => (
                    <Textarea
                      {...controlProps}
                      rows={3}
                      value={revokeReason}
                      onChange={(event) => setRevokeReason(event.target.value)}
                      disabled={revokeSubmitting}
                    />
                  )}
                </Field>
              </>
            )}
            {revokingModule.grantedByOwner && revokeError && <Alert tone="danger">{revokeError}</Alert>}
          </>
        )}
      </Dialog>
    </AppShell>
  );
}

/** `createdAt`/`lastMessageAt` share the identical "null means something specific, say what" shape
 * `OwnerSitesPage`'s own table columns already establish for these two fields - reused here rather
 * than re-derived, since drilling into a row must not disagree with what the row itself said. */
function renderDateFact(
  value: string | null,
  timeZone: string | null,
  emptyLabel: string,
  emptyTitle: string,
) {
  const parsed = parseInstant(value);
  if (parsed === null) {
    return (
      <span className="ago-meta" title={emptyTitle}>
        {emptyLabel}
      </span>
    );
  }

  return <span title={formatAbsolute(parsed, timeZone)}>{formatDateStamp(parsed, timeZone)}</span>;
}

function buildModuleColumns(
  timeZone: string | null,
  onRevoke: (module: OwnerSiteModule) => void,
): TableColumn<OwnerSiteModule>[] {
  return [
    {
      key: "module",
      header: "Module",
      render: (module) => <Badge tone="neutral">{module.moduleKey}</Badge>,
    },
    {
      key: "triggerWords",
      header: "Trigger words",
      render: (module) => module.triggerWords.join(", "),
    },
    {
      key: "grantedBy",
      header: "Granted by",
      render: (module) => (
        // `23-14`'s own Done-when: a module the tenant enabled is distinguishable from one the owner
        // granted - never the same badge, never left to a tooltip alone to say the difference.
        <Badge tone={module.grantedByOwner ? "accent" : "neutral"}>
          {module.grantedByOwner ? "Platform owner" : "Tenant"}
        </Badge>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      render: (module) => {
        const explicit = formatModuleExpiry(module.expiresAt);
        if (explicit !== null) {
          // A grant with no expiry renders as an explicit statement, never a blank cell.
          return <span className="ago-meta">{explicit}</span>;
        }

        const parsed = parseInstant(module.expiresAt);
        if (parsed === null) {
          // Unreachable in practice (formatModuleExpiry already handled null), but a garbled value
          // has nothing truthful to render either - the same defensive shape the site list's own
          // date columns use.
          return <span className="ago-meta">Unknown</span>;
        }

        return <span title={formatAbsolute(parsed, timeZone)}>{formatDateStamp(parsed, timeZone)}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (module) => (
        // Rendered directly from the server's own `isActive` - matching what the live read-store
        // query already decided, never recomputed here by comparing `expiresAt` against this
        // browser's own clock (this item's own Done-when).
        <Badge tone={module.isActive ? "success" : "danger"}>{formatModuleStatus(module.isActive)}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      // `23-65`: revoke reads provenance off `module.grantedByOwner` before anything is sent - the
      // confirmation dialog this opens is where the reason/force asymmetry actually lives, not here.
      render: (module) => (
        <Button size="sm" variant="ghost" onClick={() => onRevoke(module)}>
          Revoke
        </Button>
      ),
    },
  ];
}
