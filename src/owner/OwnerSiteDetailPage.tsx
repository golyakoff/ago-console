import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchOwnerSiteDetail,
  grantOwnerModule,
  grantOwnerModuleQuantity,
  restoreOwnerOperatorSeat,
  revokeOwnerModule,
  updateOwnerSiteAllowedOrigins,
  type OwnerSiteDetail,
  type OwnerSiteModule,
  type OwnerSiteOperator,
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
import { parseTriggerWords } from "../pages/moduleConfigValidation.js";
import { generateModuleCredential } from "./generateModuleCredential.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import {
  describeRecentWindow,
  formatByteSize,
  formatCount,
  formatModuleExpiry,
  formatModuleQuantity,
  formatModuleStatus,
  formatNoRecentActivity,
  formatRecentMessagesHeader,
  moduleStatusTone,
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
  const [credentialInput, setCredentialInput] = useState("");
  // `23-94`: whether the credential field currently shows its value in the clear. Starts hidden
  // (`type="password"`, matching the field's own "never shown again once saved" description) and
  // switches to visible only once a value has actually been generated - typing one's own credential by
  // hand keeps the field masked, exactly as before this item.
  const [credentialRevealed, setCredentialRevealed] = useState(false);
  const [credentialCopied, setCredentialCopied] = useState(false);
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

  // `23-66`: the quantity dialog's own state - `quantityModule` doubles as the dialog's `open` flag,
  // the same shape `revokingModule` already establishes above. `quantityStage` is what makes lowering
  // a different act from raising one (this item's own Scope): "edit" is the ordinary form, and a
  // submit that would lower an already-granted quantity moves to "confirm" instead of submitting -
  // the impact is stated before the request is sent, never after.
  const [quantityModule, setQuantityModule] = useState<OwnerSiteModule | null>(null);
  const [quantityInput, setQuantityInput] = useState("");
  const [quantityStage, setQuantityStage] = useState<"edit" | "confirm">("edit");
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [quantitySaved, setQuantitySaved] = useState<{ moduleKey: string; quantity: number } | null>(null);
  const [quantitySubmitting, setQuantitySubmitting] = useState(false);

  // `23-68`: the operator roster's own restore-seat action. `restoringOperatorId` is which row's own
  // button shows a busy state, not a dialog flag - the ordinary restore (within the seat limit, this
  // item's own headline scenario) needs no dialog at all, matching `handleGenerateCredential`'s own
  // "the simplest control that can hold the value" judgement. `forceDialogOperator` opens only once
  // the server itself says the seat limit would be exceeded (`"requires-force"`) - the identical
  // "try first, escalate only once the server says so" shape `handleRevokeConfirm`'s own force/reason
  // asymmetry uses, except there the asymmetry is known up front from `grantedByOwner` and here it is
  // not knowable client-side at all (this screen has no seat-count arithmetic of its own - `CLAUDE.md`
  // rule 8: a compare-and-set read belongs to the database, not a browser guess).
  const [restoringOperatorId, setRestoringOperatorId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSaved, setRestoreSaved] = useState<{ operatorId: string; overrodeSeatLimit: boolean } | null>(null);
  const [forceDialogOperator, setForceDialogOperator] = useState<OwnerSiteOperator | null>(null);
  const [forceDialogMessage, setForceDialogMessage] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [forceError, setForceError] = useState<string | null>(null);
  const [forceSubmitting, setForceSubmitting] = useState(false);

  const timeZone = useMemo(() => resolveTimeZone(), []);

  // `23-65`: extracted out of the load effect below so a successful grant or revoke can re-run the
  // identical read rather than splice a locally-built row into `site.modules` - `GrantModuleResponse`
  // does not even carry `status`/`grantedByOwner`, and this screen's own Done-when requires
  // `status` to come from the server's own live comparison, never be recomputed here (`buildModuleColumns`'s
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
      buildModuleColumns(
        timeZone,
        (module) => {
          setRevokingModule(module);
          setRevokeReason("");
          setRevokeError(null);
        },
        (module) => {
          setQuantityModule(module);
          // Pre-filled with the current value (or blank when never granted) - the platform owner is
          // changing a number, not starting from zero every time.
          setQuantityInput(module.quantity === null ? "" : String(module.quantity));
          setQuantityStage("edit");
          setQuantityError(null);
          setQuantitySaved(null);
        },
      ),
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

  // `23-94`: mints a fresh, high-entropy value and puts it straight into the field the form will
  // actually submit - the same `credentialInput` state `handleGrantSubmit` below reads, never a
  // separate "generated value" the form has to be told to adopt. That is what keeps generating and
  // saving the same act: there is no second place for the two to drift apart.
  const handleGenerateCredential = () => {
    setCredentialInput(generateModuleCredential());
    setCredentialRevealed(true);
    setCredentialCopied(false);
  };

  // `23-94`: this is the one moment the value can be seen at all - the field is masked again the
  // instant the page is left or the grant succeeds, and the server never echoes a credential back
  // (`OwnerModuleEndpoints.GrantModuleRequest`'s own remarks). Copying it here is the platform owner's
  // only chance to record it somewhere else, if they need to.
  const handleCopyCredential = () => {
    void navigator.clipboard.writeText(credentialInput);
    setCredentialCopied(true);
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
    const trimmedCredential = credentialInput.trim();

    if (trimmedKey.length === 0) {
      setGrantError("Enter a module key.");
      return;
    }
    if (triggerWords.length === 0) {
      setGrantError("Enter at least one trigger word.");
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
      credential: trimmedCredential,
      expiresAt,
    })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setGrantSaved(true);
          setModuleKeyInput("");
          setTriggerWordsInput("");
          setCredentialInput("");
          setCredentialRevealed(false);
          setCredentialCopied(false);
          setExpiryChoice("unset");
          setExpiryDateInput("");
          // Re-read rather than splice a locally-built row in - `outcome.module` carries no
          // `status`/`grantedByOwner` (`GrantOwnerModuleOutcome`'s own remarks), and this table
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

  // `23-66`: the quantity dialog's own submit. Parses and validates the input, then - the one thing
  // that makes lowering a different act from raising one - checks whether the new number is below
  // what is currently granted; if it is, and the caller has not already confirmed, this stops short
  // of the network call and moves the dialog to its "confirm" stage instead. The actual request is
  // identical either way; only whether the impact was stated first differs.
  const handleQuantitySubmit = () => {
    if (!quantityModule) {
      return;
    }

    setQuantityError(null);

    const trimmed = quantityInput.trim();
    if (trimmed.length === 0) {
      setQuantityError("Enter a quantity.");
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setQuantityError("Enter a whole number, zero or more.");
      return;
    }

    const current = quantityModule.quantity;
    const isLowering = current !== null && parsed < current;
    if (isLowering && quantityStage === "edit") {
      setQuantityStage("confirm");
      return;
    }

    submitQuantity(quantityModule.moduleKey, parsed);
  };

  const submitQuantity = (moduleKey: string, quantity: number) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setQuantitySubmitting(true);
    setQuantityError(null);

    grantOwnerModuleQuantity(accessToken, siteId, moduleKey, quantity)
      .then((outcome) => {
        if (outcome.status === "ok") {
          setQuantityModule(null);
          setQuantityStage("edit");
          setQuantitySaved({ moduleKey: outcome.moduleKey, quantity: outcome.quantity });
          // Re-read rather than splice a locally-built row in - the same "the server's own read is
          // the only source for this table" reasoning `handleGrantSubmit`'s own remarks give. Chat's
          // own row reflects the grant immediately; the calendar's own projection of it does not
          // (the success message above states that bound), so this reload shows what chat now holds,
          // not yet what the calendar has applied.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid") {
          setQuantityError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // every other write on this page gives its own equivalent outcomes.
        setQuantityModule(null);
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setQuantityError(err instanceof Error ? err.message : "Failed to grant the quantity.");
      })
      .finally(() => {
        setQuantitySubmitting(false);
      });
  };

  // `23-68`: the ordinary restore - tried with `force: false` first, always. Success and "already
  // held it" both land here as a plain confirmation; only "requires-force" branches into the dialog
  // below, and only that dialog ever sends `force: true`.
  const handleRestoreSeat = (operator: OwnerSiteOperator) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setRestoringOperatorId(operator.operatorId);
    setRestoreError(null);
    setRestoreSaved(null);

    restoreOwnerOperatorSeat(accessToken, siteId, operator.operatorId, { force: false, reason: null })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRestoreSaved({ operatorId: operator.operatorId, overrodeSeatLimit: outcome.result.overrodeSeatLimit });
          // Re-read rather than splice a locally-built row in - the same "the server's own read is
          // the only source for this table" reasoning `handleGrantSubmit`'s own remarks give, applied
          // to the operator roster this item adds alongside the module table.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "requires-force") {
          setForceDialogOperator(operator);
          setForceDialogMessage(outcome.message);
          setForceReason("");
          setForceError(null);
          return;
        }

        if (outcome.status === "invalid") {
          // Not reachable with `force: false` (the server only asks for a reason once `force` is
          // set), but handled rather than silently swallowed - a refusal a person can act on, the
          // same posture every other outcome branch on this page keeps.
          setRestoreError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // every other write on this page gives its own equivalent outcomes.
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setRestoreError(err instanceof Error ? err.message : "Failed to restore the operator's seat.");
      })
      .finally(() => {
        setRestoringOperatorId(null);
      });
  };

  // `23-68`: the seat-limit override, exercised only once the platform owner has read the server's
  // own message and typed why - `adr/0118`'s own "state plainly that you mean to override this and
  // say why" asymmetry, restated for a seat limit instead of a tenant's own purchase.
  const handleForceConfirm = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !forceDialogOperator) {
      return;
    }

    const trimmedReason = forceReason.trim();
    if (trimmedReason.length === 0) {
      setForceError("Write the reason you would be willing to show this tenant.");
      return;
    }

    setForceSubmitting(true);
    setForceError(null);

    restoreOwnerOperatorSeat(accessToken, siteId, forceDialogOperator.operatorId, { force: true, reason: trimmedReason })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRestoreSaved({ operatorId: forceDialogOperator.operatorId, overrodeSeatLimit: outcome.result.overrodeSeatLimit });
          setForceDialogOperator(null);
          setForceReason("");
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid" || outcome.status === "requires-force") {
          setForceError(outcome.message);
          return;
        }

        setForceDialogOperator(null);
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setForceError(err instanceof Error ? err.message : "Failed to restore the operator's seat.");
      })
      .finally(() => {
        setForceSubmitting(false);
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

          {/* `23-68`: "a locked-out tenant can be let back in without a database" - the recovery this
              item exists to build, reached from the same screen `23-65`'s own module grant/revoke
              already lives on, not a new one. */}
          <h2>Operators</h2>

          <Alert tone="info">
            Restoring a seat lets an operator sign in again - it does not restore a role. An operator
            with no roles below signed in but was stripped of every permission; nothing here grants one
            back.
          </Alert>

          {restoreSaved && !restoreError && (
            <Alert tone="success">
              Seat restored.{" "}
              {restoreSaved.overrodeSeatLimit
                ? "This put the site over its own seat limit, as stated when confirming."
                : "The operator can sign in again now."}
            </Alert>
          )}
          {restoreError && <Alert tone="danger">{restoreError}</Alert>}

          {site.operators.length === 0 ? (
            <p className="ago-empty">This tenant has no operators.</p>
          ) : (
            <Table
              caption="Every operator this tenant currently has, not counting anyone removed."
              columns={buildOperatorColumns(restoringOperatorId, handleRestoreSeat)}
              rows={site.operators}
              rowKey={(operator) => operator.operatorId}
            />
          )}

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

          {/* `23-66`: a quantity's own read only ever comes from this row, never from the module -
              this screen shows what was granted, not what the module has caught up to applying. */}
          <Alert tone="info">
            A module's own countable quantity (workers, for the calendar module) is granted here and
            applied by the module itself asynchronously - typically within a few seconds, the outbox's
            own poll interval. This table shows what chat has granted the moment you grant it; the
            module may take a little longer to catch up.
          </Alert>

          {quantitySaved && (
            <Alert tone="success">
              Granted {formatModuleQuantity(quantitySaved.quantity)} for {quantitySaved.moduleKey}. Chat's
              own record reflects it now - the module typically applies it within a few seconds.
            </Alert>
          )}

          {site.modules.length === 0 ? (
            <p className="ago-empty">This tenant has no modules enabled.</p>
          ) : (
            <Table
              caption="Every module this tenant has ever had enabled, including any that have since expired."
              columns={moduleColumns}
              rows={site.modules}
              rowKey={(module) => module.id}
            />
          )}

          {/* `23-65`/`adr/0150`: the grant form itself. No `provisioningSecret` field anywhere on
              this page - the browser never holds `adr/0095`'s deployment-wide secret, `Ago.Chat.Api`
              supplies it from its own configuration, and this form's own request body has no field
              to carry one even if someone tried.

              `23-92`/`adr/0154`: no "Entry point" field either, for the identical reason - the
              platform owner can already read a declared module's address from the cluster, so asking
              them to retype it here was a second inconvenience, not a second safeguard. A module this
              deployment has not declared an entry point for is refused server-side, naming the missing
              key, the same as an unconfigured provisioning secret is. */}
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

              <Field
                label="Credential"
                description="The module's own per-site credential. Generate a random one, or paste your own - never shown again once saved, so copy it now if you need to record it elsewhere."
                adornment={
                  <>
                    <Button onClick={handleGenerateCredential} disabled={grantSubmitting}>
                      Generate
                    </Button>
                    {credentialRevealed && credentialInput.length > 0 && (
                      <Button onClick={handleCopyCredential} disabled={grantSubmitting}>
                        {credentialCopied ? "Copied" : "Copy"}
                      </Button>
                    )}
                  </>
                }
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type={credentialRevealed ? "text" : "password"}
                    autoComplete="off"
                    value={credentialInput}
                    onChange={(event) => {
                      setCredentialInput(event.target.value);
                      setCredentialCopied(false);
                    }}
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

      {/* `23-66`: lowering a quantity is not the same act as raising one (this item's own Scope) -
          `quantityStage === "confirm"` is reached only when the new number is below what is currently
          granted, and it states the impact before the request that would cause it is ever sent. */}
      <Dialog
        open={quantityModule !== null}
        title={quantityModule ? `Set quantity for ${quantityModule.moduleKey}` : "Set quantity"}
        onClose={() => {
          if (!quantitySubmitting) {
            setQuantityModule(null);
          }
        }}
        footer={
          quantityStage === "confirm" ? (
            <>
              <Button variant="ghost" onClick={() => setQuantityStage("edit")} disabled={quantitySubmitting}>
                Back
              </Button>
              <Button variant="danger" onClick={handleQuantitySubmit} disabled={quantitySubmitting}>
                {quantitySubmitting ? "Granting…" : "Confirm lower quantity"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setQuantityModule(null)} disabled={quantitySubmitting}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleQuantitySubmit} disabled={quantitySubmitting}>
                {quantitySubmitting ? "Granting…" : "Grant quantity"}
              </Button>
            </>
          )
        }
      >
        {quantityModule && quantityStage === "edit" && (
          <>
            <p>
              Currently{" "}
              {quantityModule.quantity === null
                ? "not granted for this module."
                : `granted: ${formatModuleQuantity(quantityModule.quantity)}.`}
            </p>
            <Field label="Quantity" description="A whole number, zero or more. Zero is a real grant - the module and nothing counted under it yet." error={quantityError}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={0}
                  step={1}
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  disabled={quantitySubmitting}
                />
              )}
            </Field>
          </>
        )}

        {quantityModule && quantityStage === "confirm" && (
          <>
            <p>
              Lowering {quantityModule.moduleKey}'s quantity from{" "}
              {formatModuleQuantity(quantityModule.quantity)} to {quantityInput} may deactivate up to{" "}
              {(quantityModule.quantity ?? 0) - Number(quantityInput)} of whatever this module already
              created under the old quantity, once it applies the change - for the calendar module,
              that means workers, the most recently added ones first, until the active count matches
              the new number. Nothing is deleted; a deactivated worker can be turned back on by hand
              once the tenant is back under quota.
            </p>
            {quantityError && <Alert tone="danger">{quantityError}</Alert>}
          </>
        )}
      </Dialog>

      {/* `23-68`: the seat-limit override - opened only once the server itself says the ordinary
          restore would exceed this tenant's own seat limit, never guessed at client-side
          (`handleRestoreSeat`'s own remarks). `adr/0118`'s own "state plainly that you mean to
          override this and say why", restated for a seat limit instead of a tenant's own purchase. */}
      <Dialog
        open={forceDialogOperator !== null}
        title={forceDialogOperator ? `Restore ${operatorLabel(forceDialogOperator)}'s seat` : "Restore seat"}
        onClose={() => {
          if (!forceSubmitting) {
            setForceDialogOperator(null);
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForceDialogOperator(null)} disabled={forceSubmitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleForceConfirm} disabled={forceSubmitting}>
              {forceSubmitting ? "Restoring…" : "Override the seat limit"}
            </Button>
          </>
        }
      >
        {forceDialogOperator && (
          <>
            <p>{forceDialogMessage}</p>
            <Field
              label="Reason"
              description={'Write the reason you would be willing to show this tenant. "Cleanup" or "asked to" are not reasons.'}
              error={forceError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={3}
                  value={forceReason}
                  onChange={(event) => setForceReason(event.target.value)}
                  disabled={forceSubmitting}
                />
              )}
            </Field>
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
  onSetQuantity: (module: OwnerSiteModule) => void,
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
        // `23-103`: rendered directly from the server's own `status` - matching what the live
        // read-store query already decided, never recomputed here by comparing
        // `expiresAt`/`revokedAt` against this browser's own clock (this item's own Done-when).
        <Badge tone={moduleStatusTone(module.status)}>{formatModuleStatus(module.status)}</Badge>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      render: (module) => (
        // `23-66`'s own warning: `formatModuleQuantity` renders `null` and `0` differently - "Not
        // granted" is never shown for a module explicitly granted zero.
        <span className="ago-meta">{formatModuleQuantity(module.quantity)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      // `23-65`: revoke reads provenance off `module.grantedByOwner` before anything is sent - the
      // confirmation dialog this opens is where the reason/force asymmetry actually lives, not here.
      // `23-66`: the quantity dialog opens the same way, alongside it - which stage it opens in
      // (edit vs. the lowering confirm) is decided once a number is actually typed, not here.
      render: (module) => (
        <div className="ago-row">
          <Button size="sm" variant="ghost" onClick={() => onSetQuantity(module)}>
            Set quantity
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onRevoke(module)}>
            Revoke
          </Button>
        </div>
      ),
    },
  ];
}

/** `23-68`: the name to show for an operator with no `displayName` - the identical "state the fact,
 * don't fabricate one" shape `OwnerSitesPage`'s own `Unnamed site` label already uses, restated for
 * an operator (`OperatorTeamMemberItem`'s own remarks: a minted demo tenant's operator has no claims
 * to copy). Exported only for this file's own `buildOperatorColumns`/dialog title, not a general
 * formatter - a real caller-facing display-name policy lives in `operatorDisplayName.ts` and this
 * screen deliberately does not import it, since that helper reads the *signed-in* operator's own
 * token claims, not an arbitrary row from a cross-tenant list. */
function operatorLabel(operator: OwnerSiteOperator): string {
  return operator.displayName && operator.displayName.trim().length > 0 ? operator.displayName : "Unnamed operator";
}

function buildOperatorColumns(
  restoringOperatorId: string | null,
  onRestoreSeat: (operator: OwnerSiteOperator) => void,
): TableColumn<OwnerSiteOperator>[] {
  return [
    {
      key: "operator",
      header: "Operator",
      render: (operator) => (
        <div className="ago-row ago-row--tight">
          {operator.displayName && operator.displayName.trim().length > 0 ? (
            <strong>{operator.displayName}</strong>
          ) : (
            <span className="ago-meta">Unnamed operator</span>
          )}
          {operator.email && <span className="ago-meta">{operator.email}</span>}
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (operator) =>
        operator.roleNames.length === 0 ? (
          // `23-68`'s own warning made visible: an empty role list is the "stripped their own last
          // role" case this item names but does not fix - never rendered as a blank cell.
          <span className="ago-meta" title="This operator holds no role - restoring a seat lets them sign in, but grants no permission back.">
            No role
          </span>
        ) : (
          operator.roleNames.join(", ")
        ),
    },
    {
      key: "seat",
      header: "Seat",
      render: (operator) => (
        <Badge tone={operator.holdsSeat ? "success" : "danger"}>{operator.holdsSeat ? "Holds seat" : "No seat"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (operator) =>
        operator.holdsSeat ? null : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRestoreSeat(operator)}
            disabled={restoringOperatorId === operator.operatorId}
          >
            {restoringOperatorId === operator.operatorId ? "Restoring…" : "Restore seat"}
          </Button>
        ),
    },
  ];
}
